(function (root) {
  const DAY_START = 300;   // 05:00
  const DAY_END = 1560;    // 익일 02:00
  const SLOT = 5;
  const DAY_BOUNDARY_HOUR = 4;
  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function snapToSlot(minutes) {
    return Math.round(minutes / SLOT) * SLOT;
  }

  function clampToDay(minutes) {
    return Math.min(DAY_END, Math.max(DAY_START, minutes));
  }

  function minutesToLabel(minutes) {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    return pad2(Math.floor(wrapped / 60)) + ":" + pad2(wrapped % 60);
  }

  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return m + "분";
    if (m === 0) return h + "시간";
    return h + "시간 " + m + "분";
  }

  function dateKey(date) {
    return (
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
    );
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // 모양만 보면 안 된다. "2026-02-30"은 정규식을 통과하지만 파싱하면 3월 2일이 되어
  // 화면에 뜨는 날짜와 D-day 계산이 어긋난다. 왕복시켜 같은 문자열이 나오는지 본다.
  function isValidDateKey(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    return dateKey(parseDateKey(key)) === key;
  }

  function addDays(key, n) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function toUTCms(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((toUTCms(toKey) - toUTCms(fromKey)) / 86400000);
  }

  function weekdayOf(key) {
    return parseDateKey(key).getDay();
  }

  function plannerDateKey(now) {
    const shifted = new Date(now.getTime());
    shifted.setHours(shifted.getHours() - DAY_BOUNDARY_HOUR);
    return dateKey(shifted);
  }

  function formatDateKorean(key) {
    const d = parseDateKey(key);
    return (
      d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() +
      ". (" + WEEKDAY_NAMES[d.getDay()] + ")"
    );
  }

  const datetime = {
    DAY_START, DAY_END, SLOT, DAY_BOUNDARY_HOUR, WEEKDAY_NAMES,
    snapToSlot, clampToDay, minutesToLabel, formatDuration,
    dateKey, parseDateKey, isValidDateKey, addDays, daysBetween, weekdayOf,
    plannerDateKey, formatDateKorean,
  };

  root.SP = root.SP || {};
  root.SP.datetime = datetime;
  if (typeof module !== "undefined") module.exports = datetime;
})(typeof globalThis !== "undefined" ? globalThis : window);
