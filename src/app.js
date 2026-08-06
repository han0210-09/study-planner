(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const ui = SP.ui;

  let store = null;
  let todayKey = null;
  let view = { year: 0, month: 0 };
  let saveTimer = null;
  // 크롬은 설치할 수 있게 되면 이 사건을 한 번 보낸다. 그때 잡아 두지 않으면
  // 나중에 설정에서 "설치" 를 누를 방법이 없다.
  let installEvent = null;

  function safeStorage() {
    try {
      const probe = "__sp_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      const map = new Map();
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: () => { throw new Error("localStorage unavailable"); },
        removeItem: (k) => map.delete(k),
      };
    }
  }

  function state() { return store.getState(); }

  function writeNow() {
    if (!store.save()) {
      ui.showBanner("저장에 실패했습니다. 이 기기에 계획이 남지 않습니다. 설정에서 JSON 내보내기로 백업하세요.");
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 300);
  }

  // 블록과 할 일은 한 쌍으로 움직인다. 따로 쓰면 완료 상태가 어긋난 순간이
  // 저장될 수 있다.
  function saveDay(dateKey, next) {
    store.setDay(dateKey, { todos: next.todos, blocks: next.blocks });
    persist();
  }

  // 디바운스 대기 중인 쓰기를 즉시 밀어 넣는다. 폰에서 체크 하나 하고 곧바로 앱을
  // 내리거나 화면을 끄면 300ms를 못 채우고 그 편집이 통째로 사라진다.
  function flush() {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    writeNow();
  }

  function today() { return todayKey; }
  function viewDate() { return { year: view.year, month: view.month }; }

  // 화면은 셋뿐이다. 하나를 켜면 나머지는 꺼진다 - 켤 것만 적고 끌 것을
  // 빼먹으면 두 화면이 겹쳐 뜬다.
  const SCREENS = ["screen-auth", "screen-calendar", "screen-day"];
  function showScreen(id) {
    for (const s of SCREENS) document.getElementById(s).hidden = s !== id;
    window.scrollTo(0, 0);
  }

  function showCalendar(year, month) {
    if (year) view = { year, month };
    showScreen("screen-calendar");
    SP.calendar.render(document.getElementById("screen-calendar"), view.year, view.month);
  }

  function showDay(dateKey) {
    showScreen("screen-day");
    SP.day.render(document.getElementById("screen-day"), dateKey);
  }

  function showAuth(mode) {
    showScreen("screen-auth");
    SP.authui.render(document.getElementById("screen-auth"), mode);
  }

  function refreshToday() {
    const next = dt.plannerDateKey(new Date());
    if (next === todayKey) return;
    todayKey = next;
    if (!document.getElementById("screen-calendar").hidden) showCalendar(view.year, view.month);
  }

  /* ---------- 계정 ---------- */

  function signedIn() { return !!(SP.auth && SP.auth.session()); }

  function accountName() {
    const s = SP.auth && SP.auth.session();
    return s ? (s.username || s.email) : null;
  }

  // 지금 열어야 할 저장소의 열쇠. 로그인 안 했으면 예전 그대로다.
  function currentKey() {
    const s = SP.auth && SP.auth.session();
    return SP.auth
      ? SP.auth.storageKeyFor(s && s.uid, storeApi.STORAGE_KEY)
      : storeApi.STORAGE_KEY;
  }

  function openStore() {
    store = storeApi.createStore(safeStorage(), currentKey());
    return store.load();
  }

  // 처음 로그인한 계정이 비어 있고 로그인 없이 쓰던 계획이 있으면 옮겨 온다.
  // 안 옮기면 몇 달 쓰던 사람이 로그인한 순간 빈 화면을 만난다.
  //
  // 계정마다 한 번만 한다. 표시를 안 남기면, 그 계정을 비우고 다시 로그인할
  // 때마다 옛 계획이 되살아난다.
  function adoptAnonymousData() {
    const s = SP.auth && SP.auth.session();
    if (!s || !s.uid) return false;
    const storage = safeStorage();
    const mark = "studyPlanner.adopted." + s.uid;
    if (storage.getItem(mark)) return false;
    try { storage.setItem(mark, "1"); } catch (e) { return false; }
    if (!store.isEmpty()) return false;
    const anon = storage.getItem(storeApi.STORAGE_KEY);
    if (!anon) return false;
    try {
      storage.setItem(currentKey(), anon);
    } catch (e) { return false; }
    openStore();
    return true;
  }

  // 로그인·로그아웃 뒤에 저장소를 갈아 끼우고 화면을 다시 그린다.
  function afterAuthChange() {
    flush();
    openStore();
    const moved = signedIn() ? adoptAnonymousData() : false;
    todayKey = dt.plannerDateKey(new Date());
    showCalendar(view.year, view.month);
    if (moved) ui.toast("쓰던 계획을 이 계정으로 옮겼습니다.");
  }

  async function signOut() {
    flush();
    SP.auth.signOut();
    openStore();
    showAuth("in");
  }

  function boot() {
    if (SP.auth && SP.authui) SP.auth.configure(SP.authui.API_KEY);
    const result = openStore();
    if (result.recovered) ui.showBanner("저장된 데이터 일부를 읽을 수 없어 복구했습니다.");
    if (result.readOnly) ui.showBanner("더 새로운 버전에서 만든 데이터입니다. 읽기 전용으로 엽니다.");

    todayKey = dt.plannerDateKey(new Date());
    const d = dt.parseDateKey(todayKey);
    view = { year: d.getFullYear(), month: d.getMonth() + 1 };

    // 처음 켠 사람에게는 로그인 화면을 먼저 보인다. 쓰던 사람은 그대로 앱으로
    // 들어간다 - 어제까지 잘 쓰던 앱이 갑자기 로그인을 요구하면 안 된다.
    // 로그인은 설정에서 언제든 할 수 있다.
    if (!signedIn() && store.isEmpty() && SP.authui && SP.auth.isConfigured()) showAuth("up");
    else showCalendar(view.year, view.month);

    // 토큰은 한 시간짜리다. 열 때 미리 갈아 끼워 두면 실제로 쓸 때 안 기다린다.
    // 실패해도 앱은 그대로 돈다 - 계획은 이 기기에 있다.
    if (signedIn()) Promise.resolve(SP.auth.token()).catch(() => {});

    // 알림은 켜 둔 사람에게만 돈다.
    if (SP.notify) SP.notify.start();

    setInterval(refreshToday, 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
      else refreshToday();
    });
    // iOS Safari에서는 beforeunload가 신뢰할 수 없다. pagehide가 홈 화면 앱에서도 온다.
    window.addEventListener("pagehide", flush);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    // 브라우저가 알아서 띄우는 배너를 막고, 설정 안의 버튼으로 옮긴다.
    e.preventDefault();
    installEvent = e;
  });
  window.addEventListener("appinstalled", () => { installEvent = null; });

  async function install() {
    if (!installEvent) return false;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    installEvent = null;
    return !!choice && choice.outcome === "accepted";
  }

  SP.app = { boot, state, persist, saveDay, showCalendar, showDay, showAuth, today, viewDate,
    store: () => store, signedIn, accountName, afterAuthChange, signOut, currentKey,
    installPrompt: () => installEvent, install };
  document.addEventListener("DOMContentLoaded", boot);
})(typeof globalThis !== "undefined" ? globalThis : window);
