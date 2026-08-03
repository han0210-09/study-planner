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

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!store.save()) {
        ui.showBanner("저장에 실패했습니다. 이 기기에 계획이 남지 않습니다. 설정에서 JSON 내보내기로 백업하세요.");
      }
    }, 300);
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
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshToday(); });
  }

  SP.app = { boot, state, persist, showCalendar, showDay, today, viewDate, store: () => store };
  document.addEventListener("DOMContentLoaded", boot);
})(typeof globalThis !== "undefined" ? globalThis : window);
