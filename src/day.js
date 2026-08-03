(function (root) {
  const api = {};
  root.SP = root.SP || {};
  root.SP.day = api;

  api.render = function (host, dateKey) {
    const ui = root.SP.ui;
    const v = root.SP.app.viewDate();
    root.SP.ui.clear(host).appendChild(
      ui.el("div", {}, [
        ui.el("h1", { text: root.SP.datetime.formatDateKorean(dateKey) }),
        ui.el("button", { class: "btn", text: "← 달력", onclick: () => root.SP.app.showCalendar(v.year, v.month) }),
      ])
    );
  };

  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
