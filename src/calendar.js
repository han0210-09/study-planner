(function (root) {
  const api = {};
  root.SP = root.SP || {};
  root.SP.calendar = api;

  api.render = function (host, year, month) {
    const ui = root.SP.ui;
    root.SP.ui.clear(host).appendChild(
      ui.el("div", {}, [
        ui.el("h1", { text: year + "년 " + month + "월" }),
        ui.el("button", { class: "btn", text: "오늘 열기", onclick: () => root.SP.app.showDay(root.SP.app.today()) }),
      ])
    );
  };

  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
