(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const eventsApi = SP.events;
  const ui = SP.ui;

  let currentHost = null;
  let currentKey = null;

  function ddayChip(dateKey) {
    const state = SP.app.state();
    const result = eventsApi.dday(state.events, dateKey);
    if (!result) return ui.el("span", { class: "dday dday-none", text: "일정 없음" });
    return ui.el("span", { class: "dday", title: result.event.title, text: eventsApi.formatDday(result.days) });
  }

  function header(dateKey) {
    const view = SP.app.viewDate();
    return ui.el("header", { class: "day-head" }, [
      ui.el("button", { class: "icon-btn", text: "←", "aria-label": "달력으로", onclick: () => SP.app.showCalendar(view.year, view.month) }),
      ddayChip(dateKey),
      ui.el("div", { class: "day-nav" }, [
        ui.el("button", { class: "icon-btn", text: "‹", "aria-label": "전날", onclick: () => SP.app.showDay(dt.addDays(dateKey, -1)) }),
        ui.el("span", { class: "day-date", text: dt.formatDateKorean(dateKey) }),
        ui.el("button", { class: "icon-btn", text: "›", "aria-label": "다음날", onclick: () => SP.app.showDay(dt.addDays(dateKey, 1)) }),
      ]),
      ui.el("button", { class: "icon-btn", text: "⋯", "aria-label": "메뉴", onclick: () => SP.day.openMenu(dateKey) }),
    ]);
  }

  function achievementCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const value = ui.el("span", { class: "achieve-value", text: day.achievement + "%" });
    const slider = ui.el("input", {
      type: "range", min: "0", max: "100", step: "5", value: String(day.achievement), class: "achieve-slider",
      oninput: (e) => { value.textContent = e.target.value + "%"; },
      onchange: (e) => {
        SP.app.store().setDay(dateKey, { achievement: Number(e.target.value) });
        SP.app.persist();
      },
    });
    return ui.el("section", { class: "card" }, [
      ui.el("div", { class: "achieve-head" }, [ui.el("h2", { class: "card-title", text: "학습 성취도" }), value]),
      slider,
      ui.el("div", { class: "achieve-scale" }, [
        ui.el("span", { text: "0%" }), ui.el("span", { text: "50%" }), ui.el("span", { text: "100%" }),
      ]),
    ]);
  }

  function eventsCard(dateKey) {
    const list = eventsApi.onDate(SP.app.state().events, dateKey);
    if (list.length === 0) return null;
    return ui.el("section", { class: "card" }, [
      ui.el("h2", { class: "card-title", text: "오늘의 일정" }),
      ui.el("ul", { class: "event-list" }, list.map((e) =>
        ui.el("li", { class: "event-item", onclick: () => SP.day.openEventEditor(dateKey, e.id) }, [
          ui.el("span", { class: "event-dot", style: { background: e.color } }),
          ui.el("span", { class: "event-title", text: e.title }),
          ui.el("span", { class: "event-type", text: eventsApi.typeOf(e.type).label }),
        ])
      )),
    ]);
  }

  function totalsCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const planned = storeApi.sumPlanned(day.blocks);
    const done = storeApi.sumDone(day.blocks);
    const ratio = planned > 0 ? Math.round((done / planned) * 100) : 0;
    return ui.el("section", { class: "card totals" }, [
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "목표시간" }),
        ui.el("strong", { text: dt.formatDuration(planned) }),
      ]),
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "실제시간" }),
        ui.el("strong", { text: dt.formatDuration(done) }),
      ]),
      ui.el("div", { class: "totals-bar" }, [
        ui.el("div", { class: "totals-fill", style: { width: Math.min(100, ratio) + "%" } }),
      ]),
      ui.el("div", { class: "totals-ratio", text: "달성률 " + ratio + "%" }),
    ]);
  }

  function memoCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    return ui.el("section", { class: "card" }, [
      ui.el("h2", { class: "card-title", text: "메모" }),
      ui.el("textarea", {
        class: "memo", placeholder: "자유롭게 적으세요", maxlength: "1000",
        onchange: (e) => { SP.app.store().setDay(dateKey, { memo: e.target.value }); SP.app.persist(); },
      }),
    ]);
  }

  function render(host, dateKey) {
    currentHost = host;
    currentKey = dateKey;

    const todoHost = ui.el("div", {});
    const timetableHost = ui.el("div", {});
    const totalsHost = ui.el("div", {});

    const refreshTotals = () => { ui.clear(totalsHost).appendChild(totalsCard(dateKey)); };
    const onTodoChange = () => { SP.todos.render(todoHost, dateKey, onTodoChange); };
    const onBlockChange = () => { SP.timetable.render(timetableHost, dateKey, onBlockChange); refreshTotals(); };

    ui.clear(host).appendChild(
      ui.el("div", { class: "day" }, [
        header(dateKey),
        achievementCard(dateKey),
        eventsCard(dateKey),
        todoHost,
        timetableHost,
        totalsHost,
        memoCard(dateKey),
      ])
    );

    const memo = host.querySelector(".memo");
    if (memo) memo.value = SP.app.store().getDay(dateKey).memo;

    SP.todos.render(todoHost, dateKey, onTodoChange);
    if (SP.timetable.render) SP.timetable.render(timetableHost, dateKey, onBlockChange);
    refreshTotals();
  }

  function refresh() {
    if (currentHost && currentKey) render(currentHost, currentKey);
  }

  const api = {
    render, refresh, currentKey: () => currentKey,
    openMenu: (dateKey) => SP.sheets.dayMenu(dateKey, refresh),
    openEventEditor: (dateKey, eventId) => SP.sheets.eventEditor(dateKey, eventId, refresh),
  };
  SP.day = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
