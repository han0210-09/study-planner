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
      ui.el("div", { class: "totals" }, [
        ui.el("div", { class: "totals-row" }, [
          ui.el("span", { class: "totals-label", text: "목표시간" }),
          ui.el("strong", { text: dt.formatDuration(storeApi.sumPlanned(day.blocks)) }),
        ]),
        ui.el("div", { class: "totals-row" }, [
          ui.el("span", { class: "totals-label", text: "실제시간" }),
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

    function go(i) {
      const next = Math.max(0, Math.min(i, PAGES.length - 1));
      if (next === activePage) return;
      const dir = next > activePage ? 1 : -1;
      activePage = next;
      paint(dir);
    }

    // 넘기는 판정은 시간창이 아니라 방향으로 가른다. 세로가 더 크면 페이지
    // 스크롤이므로 넘기지 않는다.
    //
    // 타임테이블 격자 위에서는 가로로 끄는 것이 "시간 잡기"다. 여기서 페이지까지
    // 넘어가면 두 동작이 같은 제스처를 두고 다툰다.
    let startX = 0, startY = 0, tracking = false, decided = false;
    view.addEventListener("pointerdown", (e) => {
      tracking = !e.target.closest(".tt-cells");
      decided = false;
      startX = e.clientX; startY = e.clientY;
    });
    view.addEventListener("pointermove", (e) => {
      if (!tracking || decided) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      decided = true;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      go(activePage + (dx < 0 ? 1 : -1));
    });
    view.addEventListener("pointerup", () => { tracking = false; });
    view.addEventListener("pointercancel", () => { tracking = false; });

    paint(0);
    return ui.el("div", { class: "pager-wrap" }, [
      ui.el("div", { class: "tabs", role: "tablist" }, tabs), view,
    ]);
  }

  function render(host, dateKey) {
    currentHost = host;
    currentKey = dateKey;

    const summaryHost = ui.el("div", {});
    const pagerHost = ui.el("div", {});

    // 할 일과 블록은 한 쌍으로 움직인다. 둘을 따로 그리면 화면이 어긋난다.
    // 달성률도 완료 체크에서 파생되므로 같이 다시 그린다.
    const refresh = () => {
      ui.clear(summaryHost).appendChild(summaryCard(dateKey));
      ui.clear(pagerHost).appendChild(pager(dateKey, refresh));
    };

    ui.clear(host).appendChild(
      ui.el("div", { class: "day" }, [
        header(dateKey),
        summaryHost,
        eventsCard(dateKey),
        memoCard(dateKey),
        pagerHost,
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
