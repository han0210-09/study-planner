(function (root) {
  const api = {};
  root.SP = root.SP || {};
  root.SP.timetable = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
