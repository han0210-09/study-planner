(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const ui = SP.ui;

  let store = null;
  let todayKey = null;
  let view = { year: 0, month: 0 };
  let saveTimer = null;

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

  function showCalendar(year, month) {
    if (year) view = { year, month };
    document.getElementById("screen-day").hidden = true;
    document.getElementById("screen-calendar").hidden = false;
    window.scrollTo(0, 0);
    SP.calendar.render(document.getElementById("screen-calendar"), view.year, view.month);
  }

  function showDay(dateKey) {
    document.getElementById("screen-calendar").hidden = true;
    document.getElementById("screen-day").hidden = false;
    window.scrollTo(0, 0);
    SP.day.render(document.getElementById("screen-day"), dateKey);
  }

  function refreshToday() {
    const next = dt.plannerDateKey(new Date());
    if (next === todayKey) return;
    todayKey = next;
    if (!document.getElementById("screen-calendar").hidden) showCalendar(view.year, view.month);
  }

  function boot() {
    store = storeApi.createStore(safeStorage());
    const result = store.load();
    if (result.recovered) ui.showBanner("저장된 데이터 일부를 읽을 수 없어 복구했습니다.");
    if (result.readOnly) ui.showBanner("더 새로운 버전에서 만든 데이터입니다. 읽기 전용으로 엽니다.");

    todayKey = dt.plannerDateKey(new Date());
    const d = dt.parseDateKey(todayKey);
    view = { year: d.getFullYear(), month: d.getMonth() + 1 };

    showCalendar(view.year, view.month);

    setInterval(refreshToday, 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
      else refreshToday();
    });
    // iOS Safari에서는 beforeunload가 신뢰할 수 없다. pagehide가 홈 화면 앱에서도 온다.
    window.addEventListener("pagehide", flush);
  }

  SP.app = { boot, state, persist, saveDay, showCalendar, showDay, today, viewDate, store: () => store };
  document.addEventListener("DOMContentLoaded", boot);
})(typeof globalThis !== "undefined" ? globalThis : window);
