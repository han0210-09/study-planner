(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const eventsApi = SP.events;
  const ui = SP.ui;

  const PAGES = ["타임테이블", "To-Do"];
  const SWIPE_MIN = 40;

  let currentHost = null;
  let currentKey = null;
  // 화면을 다시 그려도 보고 있던 쪽에 남아야 한다. 체크 하나 할 때마다
  // 타임테이블로 튕겨 나가면 목록을 훑을 수가 없다.
  let activePage = 0;
  // 하루를 새로 열거나 탭을 바꿀 때만 지금 시각으로 옮긴다. 체크 하나 눌렀다고
  // 05:00 으로 튕겨 올라가면 밤 계획을 볼 수가 없다.
  let wantNow = false;

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

  // 하루를 한눈에 보는 카드. 달성률은 손으로 매기지 않고 블록의 완료에서 나온다.
  function summaryCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const ratio = storeApi.doneRatio(day.blocks);
    const uncounted = storeApi.sumUncounted(day.blocks);
    return ui.el("section", { class: "card" }, [
      ui.el("div", { class: "achieve-head" }, [
        ui.el("h2", { class: "card-title", text: "달성률" }),
        ui.el("span", { class: "achieve-value", text: ratio + "%" }),
      ]),
      ui.el("div", { class: "totals-bar" }, [
        ui.el("div", { class: "totals-fill", style: { width: ratio + "%" } }),
      ]),
      // 목표와 실제를 한 줄에 나란히 둔다. 이 칸은 늘 화면에 붙어 있으므로
      // 한 줄이라도 아끼는 만큼 시간표가 넓어진다.
      ui.el("div", { class: "totals" }, [
        ui.el("div", { class: "totals-row" }, [
          ui.el("span", { class: "totals-label", text: "목표" }),
          ui.el("strong", { text: dt.formatDuration(storeApi.sumPlanned(day.blocks)) }),
        ]),
        ui.el("div", { class: "totals-row" }, [
          ui.el("span", { class: "totals-label", text: "실제" }),
          ui.el("strong", { text: dt.formatDuration(storeApi.sumDone(day.blocks)) }),
        ]),
      ]),
      // 시간표에 있는 시간이 합계에서 빠졌을 때만, 왜 숫자가 다른지 밝힌다.
      uncounted > 0
        ? ui.el("p", {
            class: "totals-note",
            text: "과목 없음 " + dt.formatDuration(uncounted) + "은 공부 시간에 넣지 않습니다.",
          })
        : null,
    ]);
  }

  // 일정을 여기서 바로 만들고 없앤다. 예전에는 ⋯ 메뉴로 들어가야 만들 수 있었고,
  // 일정이 하나도 없으면 칸 자체가 안 나와서 만들 길이 보이지 않았다.
  function eventsCard(dateKey, onChange) {
    const list = eventsApi.onDate(SP.app.state().events, dateKey);

    async function remove(event) {
      const ok = await ui.confirmDialog("'" + event.title + "' 일정을 지웁니다.");
      if (!ok) return;
      eventsApi.removeEvent(SP.app.state(), event.id);
      SP.app.persist();
      onChange();
    }

    return ui.el("section", { class: "card" }, [
      ui.el("div", { class: "events-head" }, [
        ui.el("h2", { class: "card-title", text: "오늘의 일정" }),
        ui.el("button", {
          class: "btn event-add", type: "button", text: "＋ 일정",
          onclick: () => SP.day.openEventEditor(dateKey, null),
        }),
      ]),
      // 일정이 없는 날에는 목록 자리를 아예 비운다. 제목 줄에 ＋ 가 이미 있어
      // "없습니다" 한 줄이 더 있을 이유가 없다.
      list.length
        ? ui.el("ul", { class: "event-list" }, list.map((e) =>
            ui.el("li", { class: "event-item" }, [
              ui.el("button", { class: "event-main", type: "button",
                onclick: () => SP.day.openEventEditor(dateKey, e.id) }, [
                ui.el("span", { class: "event-dot", style: { background: e.color } }),
                ui.el("span", { class: "event-title", text: e.title }),
                ui.el("span", { class: "event-type", text: eventsApi.typeOf(e.type).label }),
              ]),
              ui.el("button", {
                class: "icon-btn event-del", type: "button", text: "✕",
                "aria-label": e.title + " 지우기", onclick: () => remove(e),
              }),
            ])
          ))
        : null,
    ]);
  }

  function memoCard(dateKey) {
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

  // 타임테이블과 To-Do 를 한 장에 다 담으면 화면이 끝없이 길어진다. 좌우로 넘겨
  // 바꾼다.
  //
  // 두 쪽을 나란히 놓고 한쪽을 overflow 로 가리지 않는다. 가려둔 타임테이블이
  // To-Do 위로 비어져 나오는 일이 있었다 - 트랙이 합성 레이어(transform +
  // will-change)가 되면 부모의 잘라내기를 지키지 않는 브라우저가 있다. 아예
  // 화면에 없으면 새어 나올 수도 없으므로, 보고 있는 쪽만 만든다.
  //
  // 높이를 재서 넣던 것도 함께 없앴다. 한 쪽뿐이니 내용만큼 자라면 된다.
  function pager(dateKey, onChange) {
    const view = ui.el("div", { class: "pager" });

    const tabs = PAGES.map((name, i) =>
      ui.el("button", {
        class: "tab", type: "button", text: name, role: "tab",
        onclick: () => go(i),
      }));

    // dir 은 넘어온 방향이다. 0 이면 애니메이션 없이 그린다 - 체크 하나 누를
    // 때마다 화면이 밀려 들어오면 눈이 아프다.
    function paint(dir) {
      const page = ui.el("div", {
        class: "pager-page" + (dir > 0 ? " page-in-left" : dir < 0 ? " page-in-right" : ""),
      });
      ui.clear(view).appendChild(page);
      if (activePage === 0) SP.timetable.render(page, dateKey, onChange);
      else SP.todos.render(page, dateKey, onChange);
      tabs.forEach((t, i) => {
        t.classList.toggle("tab-on", i === activePage);
        t.setAttribute("aria-selected", i === activePage ? "true" : "false");
      });
    }

    // 굴린 자리는 화면에 붙은 뒤에야 잡을 수 있다. 떨어져 있는 동안에는 높이가
    // 0 이라 scrollTop 을 넣어도 그대로 0 이 된다.
    function settle(keep) {
      if (wantNow) {
        wantNow = false;
        if (SP.timetable.scrollToNow(view, dateKey)) return;
        view.scrollTop = 0;
        return;
      }
      view.scrollTop = keep;
    }

    function go(i) {
      const next = Math.max(0, Math.min(i, PAGES.length - 1));
      if (next === activePage) return;
      const dir = next > activePage ? 1 : -1;
      activePage = next;
      wantNow = true;
      paint(dir);
      settle(0);
    }

    // 시간표 격자 위에서도 넘길 수 있다. 세로로 펴면서 가로로 끄는 동작이 비었다
    // — 예전 가로 격자에서는 그것이 "시간 잡기"라 여기서만 넘김을 막아야 했다.
    ui.attachSwipe(view, (dir) => go(activePage + dir), { min: SWIPE_MIN });

    paint(0);
    return {
      node: ui.el("div", { class: "pager-wrap" }, [
        ui.el("div", { class: "tabs", role: "tablist" }, tabs), view,
      ]),
      settle,
    };
  }

  function render(host, dateKey) {
    // 이 하루를 새로 여는 것인지, 이미 보고 있던 것을 다시 그리는 것인지.
    // 지우기 전에 봐야 알 수 있다.
    const prevPane = host.querySelector(".pager");
    const fresh = currentHost !== host || currentKey !== dateKey || !prevPane;
    const keepAt = prevPane ? prevPane.scrollTop : 0;

    currentHost = host;
    currentKey = dateKey;

    const summaryHost = ui.el("div", {});
    const eventsHost = ui.el("div", {});
    // 남는 높이를 다 가져가는 칸이다. 클래스를 줘야 한다 - 이름 없는 div 로 두면
    // 여기서 flex 사슬이 끊겨, 안쪽 .pager 가 내용만큼 늘어나 버린다.
    const pagerHost = ui.el("div", { class: "pager-host" });

    // 할 일과 블록은 한 쌍으로 움직인다. 둘을 따로 그리면 화면이 어긋난다.
    // 달성률도 완료 체크에서 파생되므로 같이 다시 그린다.
    const refresh = () => {
      ui.clear(summaryHost).appendChild(summaryCard(dateKey));
      ui.clear(eventsHost).appendChild(eventsCard(dateKey, refresh));
      // 굴린 자리를 넘겨 받아, 다시 그린 뒤 그대로 되돌려 놓는다.
      const pane = pagerHost.querySelector(".pager");
      const at = pane ? pane.scrollTop : keepAt;
      const made = pager(dateKey, refresh);
      ui.clear(pagerHost).appendChild(made.node);
      made.settle(at);
    };

    ui.clear(host).appendChild(
      ui.el("div", { class: "day" }, [
        header(dateKey),
        summaryHost,
        eventsHost,
        memoCard(dateKey),
        pagerHost,
      ])
    );

    const memo = host.querySelector(".memo");
    if (memo) memo.value = SP.app.store().getDay(dateKey).memo;

    // 하루를 새로 열 때만 지금 시각으로 옮긴다. 이미 보고 있던 하루를 다시
    // 그리는 것이라면 굴려 둔 자리에 남아야 한다.
    wantNow = fresh;
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
