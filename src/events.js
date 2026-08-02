(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  const EVENT_TYPES = [
    { id: "assessment", label: "수행평가", color: "#FF8787" },
    { id: "exam", label: "시험", color: "#748FFC" },
    { id: "homework", label: "과제", color: "#69DB7C" },
    { id: "etc", label: "기타", color: "#FFA94D" },
  ];

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function typeOf(id) {
    return EVENT_TYPES.find((t) => t.id === id) || EVENT_TYPES[EVENT_TYPES.length - 1];
  }

  function covers(event, key) {
    return event.startDate <= key && key <= event.endDate;
  }

  function onDate(list, key) {
    return (list || []).filter((e) => covers(e, key)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  function inMonth(list, year, month) {
    const map = {};
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 0; i < daysInMonth; i++) {
      const key = dt.addDays(first, i);
      const hits = onDate(list, key);
      if (hits.length) map[key] = hits;
    }
    return map;
  }

  function nextEvent(list, fromKey) {
    const upcoming = (list || []).filter((e) => e.startDate >= fromKey);
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) =>
      a.startDate === b.startDate ? a.title.localeCompare(b.title, "ko") : a.startDate.localeCompare(b.startDate)
    );
    return upcoming[0];
  }

  function dday(list, fromKey) {
    const event = nextEvent(list, fromKey);
    if (!event) return null;
    return { event, days: dt.daysBetween(fromKey, event.startDate) };
  }

  function formatDday(days) {
    return days === 0 ? "D-DAY" : "D-" + days;
  }

  function isPast(event, todayKey) {
    return event.endDate < todayKey;
  }

  function addEvent(state, input) {
    const title = String((input && input.title) || "").trim();
    if (!title) return null;
    if (!input || !DATE_RE.test(input.startDate)) return null;
    let startDate = input.startDate;
    let endDate = DATE_RE.test(input.endDate) ? input.endDate : startDate;
    if (endDate < startDate) [startDate, endDate] = [endDate, startDate];
    const type = typeOf(input.type).id;
    const created = {
      id: store.newId(), title, type,
      color: input.color || typeOf(type).color,
      startDate, endDate,
      memo: typeof input.memo === "string" ? input.memo : "",
    };
    state.events.push(created);
    return created;
  }

  function updateEvent(state, id, patch) {
    const e = state.events.find((x) => x.id === id);
    if (!e) return false;
    if (typeof patch.title === "string" && patch.title.trim()) e.title = patch.title.trim();
    if (patch.type) { e.type = typeOf(patch.type).id; e.color = patch.color || typeOf(e.type).color; }
    if (typeof patch.color === "string") e.color = patch.color;
    if (DATE_RE.test(patch.startDate)) e.startDate = patch.startDate;
    if (DATE_RE.test(patch.endDate)) e.endDate = patch.endDate;
    if (e.endDate < e.startDate) [e.startDate, e.endDate] = [e.endDate, e.startDate];
    if (typeof patch.memo === "string") e.memo = patch.memo;
    return true;
  }

  function removeEvent(state, id) {
    const index = state.events.findIndex((x) => x.id === id);
    if (index === -1) return false;
    state.events.splice(index, 1);
    return true;
  }

  const api = { EVENT_TYPES, typeOf, covers, onDate, inMonth, nextEvent, dday, formatDday, isPast, addEvent, updateEvent, removeEvent };

  root.SP = root.SP || {};
  root.SP.events = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
