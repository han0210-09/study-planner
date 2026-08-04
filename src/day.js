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

  // 달성률은 손으로 매기지 않는다. 계획한 시간 중 실제로 끝낸 비율이므로
  // 블록의 완료 체크에서 그대로 나온다.
  function rateCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const ratio = storeApi.doneRatio(day.blocks);
    return ui.el("section", { class: "card" }, [
      ui.el("div", { class: "achieve-head" }, [
        ui.el("h2", { class: "card-title", text: "달성률" }),
        ui.el("span", { class: "achieve-value", text: ratio + "%" }),
      ]),
      ui.el("div", { class: "totals-bar" }, [
        ui.el("div", { class: "totals-fill", style: { width: ratio + "%" } }),
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

  // 달성률은 맨 위 카드가 맡는다. 여기서는 시간만 보여준다.
  function totalsCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    return ui.el("section", { class: "card totals" }, [
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "목표시간" }),
        ui.el("strong", { text: dt.formatDuration(storeApi.sumPlanned(day.blocks)) }),
      ]),
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "실제시간" }),
        ui.el("strong", { text: dt.formatDuration(storeApi.sumDone(day.blocks)) }),
      ]),
    ]);
  }

  function memoCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    return ui.el("section", { class: "card" }, [
      ui.el("h2", { class: "card-title", text: "메모" }),
      ui.el("textarea", {
        class: "memo", placeholder: "자유롭게 적으세요", maxlength: "1000",
        // change(블러)만 듣지 말 것. 메모에는 저장 버튼이 없어서, 타이핑하다 바로
        // 앱을 내리면 포커스가 빠지지 않아 flush에 담길 내용 자체가 없다.
        // persist()의 300ms 디바운스가 타이핑 연타를 흡수한다.
        oninput: (e) => { SP.app.store().setDay(dateKey, { memo: e.target.value }); SP.app.persist(); },
      }),
    ]);
  }

  function render(host, dateKey) {
    currentHost = host;
    currentKey = dateKey;

    const rateHost = ui.el("div", {});
    const todoHost = ui.el("div", {});
    const timetableHost = ui.el("div", {});
    const totalsHost = ui.el("div", {});

    // 할 일과 블록이 한 쌍으로 움직이므로 둘을 따로 그리면 화면이 어긋난다.
    // 할 일 하나를 체크하면 연결된 블록도 같이 바뀐다. 달성률도 완료 체크에서
    // 파생되므로 같이 다시 그려야 한다.
    const refresh = () => {
      ui.clear(rateHost).appendChild(rateCard(dateKey));
      SP.todos.render(todoHost, dateKey, refresh);
      SP.timetable.render(timetableHost, dateKey, refresh);
      ui.clear(totalsHost).appendChild(totalsCard(dateKey));
    };

    ui.clear(host).appendChild(
      ui.el("div", { class: "day" }, [
        header(dateKey),
        rateHost,
        eventsCard(dateKey),
        todoHost,
        timetableHost,
        totalsHost,
        memoCard(dateKey),
      ])
    );

    const memo = host.querySelector(".memo");
    if (memo) memo.value = SP.app.store().getDay(dateKey).memo;

    refresh();
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
