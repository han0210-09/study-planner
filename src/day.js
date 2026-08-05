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
  // 브라우저의 가로 스크롤(scroll-snap)을 쓰지 않는다. 그러면 두 쪽 중 긴 쪽에
  // 맞춰 높이가 잡혀서, 짧은 To-Do 쪽에 빈 공간이 한 화면씩 남는다. 직접 옮기면
  // 보고 있는 쪽 높이만 쓰면 된다.
  function pager(dateKey, onChange) {
    const pages = PAGES.map(() => ui.el("div", { class: "pager-page" }));
    const track = ui.el("div", { class: "pager-track" }, pages);
    const view = ui.el("div", { class: "pager" }, [track]);

    const tabs = PAGES.map((name, i) =>
      ui.el("button", {
        class: "tab" + (i === activePage ? " tab-on" : ""), type: "button", text: name,
        onclick: () => go(i),
      }));

    function paint() {
      track.style.transform = "translateX(" + (-activePage * 100) + "%)";
      tabs.forEach((t, i) => t.classList.toggle("tab-on", i === activePage));
      // 보이지 않는 쪽은 탭 순서에서 뺀다. 안 그러면 Tab 키가 화면 밖 버튼으로 간다.
      pages.forEach((p, i) => p.toggleAttribute("inert", i !== activePage));
      view.style.height = pages[activePage].scrollHeight + "px";
    }

    function go(i) {
      const next = Math.max(0, Math.min(i, PAGES.length - 1));
      if (next === activePage) return;
      activePage = next;
      paint();
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

    SP.timetable.render(pages[0], dateKey, onChange);
    SP.todos.render(pages[1], dateKey, onChange);

    // paint 는 화면에 붙은 뒤에 불러야 한다. 떨어져 있는 동안에는 scrollHeight 가
    // 0 이라, 높이를 0 으로 잡아 아무것도 안 보이게 된다.
    return { node: ui.el("div", { class: "pager-wrap" }, [ui.el("div", { class: "tabs" }, tabs), view]), paint };
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
      const made = pager(dateKey, refresh);
      ui.clear(pagerHost).appendChild(made.node);
      made.paint();
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
