(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const eventsApi = SP.events;
  const ui = SP.ui;

  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 8;

  function monthDays(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function studyMinutesByDay(state, year, month) {
    const map = {};
    let max = 0;
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    for (let i = 0; i < monthDays(year, month); i++) {
      const key = dt.addDays(first, i);
      const day = state.days[key];
      if (!day) continue;
      const minutes = storeApi.sumDone(day.blocks);
      if (minutes > 0) map[key] = minutes;
      if (minutes > max) max = minutes;
    }
    return { map, max };
  }

  function monthSummary(state, year, month) {
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    let total = 0;
    let ratioSum = 0;
    let plannedDays = 0;
    for (let i = 0; i < monthDays(year, month); i++) {
      const day = state.days[dt.addDays(first, i)];
      if (!day) continue;
      total += storeApi.sumDone(day.blocks);
      // 계획을 세운 날만 평균에 넣는다. 아무것도 안 적은 날까지 0%로 세면
      // 평균이 실제 공부량과 무관하게 낮아진다.
      if (storeApi.sumPlanned(day.blocks) > 0) { ratioSum += storeApi.doneRatio(day.blocks); plannedDays++; }
    }
    const avg = plannedDays ? Math.round(ratioSum / plannedDays) : 0;
    return { total, avg };
  }

  function attachLongPress(node, dateKey) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let fired = false;
    let moved = false;

    const cancel = () => { clearTimeout(timer); timer = null; };

    node.addEventListener("pointerdown", (e) => {
      fired = false;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => { fired = true; api.onLongPress(dateKey); }, LONG_PRESS_MS);
    });
    node.addEventListener("pointermove", (e) => {
      if (moved) return;
      if (Math.abs(e.clientY - startY) > MOVE_TOLERANCE ||
          Math.abs(e.clientX - startX) > MOVE_TOLERANCE) {
        moved = true;
        cancel();
      }
    });
    node.addEventListener("pointerup", () => {
      cancel();
      // 드래그로 끝났으면 날짜를 열지 않는다. touch-action: pan-y는 터치에만 걸리므로
      // 마우스로 끌었다 놓으면 pointercancel이 오지 않는다. moved가 유일한 방어선이다.
      if (!fired && !moved) SP.app.showDay(dateKey);
    });
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function dayCell(key, inMonthFlag, ctx) {
    if (!inMonthFlag) return ui.el("div", { class: "cal-cell cal-cell-out" });

    const weekday = dt.weekdayOf(key);
    const classes = ["cal-cell"];
    if (weekday === 0) classes.push("cal-sun");
    if (weekday === 6) classes.push("cal-sat");
    if (key === SP.app.today()) classes.push("cal-today");

    const dayEvents = ctx.eventMap[key] || [];
    const badges = dayEvents.slice(0, 2).map((e) =>
      ui.el("div", { class: "cal-badge", title: e.title }, [
        ui.el("span", { class: "cal-dot", style: { background: e.color } }),
        ui.el("span", { class: "cal-badge-text", text: e.title }),
      ])
    );
    if (dayEvents.length > 2) badges.push(ui.el("div", { class: "cal-more", text: "+" + (dayEvents.length - 2) }));

    const minutes = ctx.study.map[key] || 0;
    const ratio = ctx.study.max > 0 ? minutes / ctx.study.max : 0;
    const bar = ctx.study.max > 0 && minutes > 0
      ? ui.el("div", { class: "cal-bar" }, [
          ui.el("div", { class: "cal-bar-fill", style: { width: Math.round(ratio * 100) + "%" } }),
        ])
      : null;

    const day = ctx.state.days[key];
    const rate = day && storeApi.sumPlanned(day.blocks) > 0
      ? ui.el("div", { class: "cal-achieve", text: storeApi.doneRatio(day.blocks) + "%" })
      : null;

    const cell = ui.el("div", { class: classes.join(" "), dataset: { date: key } }, [
      ui.el("div", { class: "cal-num", text: String(dt.parseDateKey(key).getDate()) }),
      ui.el("div", { class: "cal-badges" }, badges),
      bar,
      rate,
    ]);
    attachLongPress(cell, key);
    return cell;
  }

  function render(host, year, month) {
    const state = SP.app.state();
    const ctx = {
      state,
      eventMap: eventsApi.inMonth(state.events, year, month),
      study: studyMinutesByDay(state, year, month),
    };

    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    const leading = dt.weekdayOf(first);
    const total = monthDays(year, month);
    const cells = [];
    for (let i = 0; i < leading; i++) cells.push(dayCell(null, false, ctx));
    for (let i = 0; i < total; i++) cells.push(dayCell(dt.addDays(first, i), true, ctx));
    while (cells.length % 7 !== 0) cells.push(dayCell(null, false, ctx));

    const go = (delta) => {
      const d = new Date(year, month - 1 + delta, 1);
      SP.app.showCalendar(d.getFullYear(), d.getMonth() + 1);
    };
    const goToday = () => {
      const t = dt.parseDateKey(SP.app.today());
      SP.app.showCalendar(t.getFullYear(), t.getMonth() + 1);
    };

    const summary = monthSummary(state, year, month);

    ui.clear(host).appendChild(
      ui.el("div", { class: "cal" }, [
        ui.el("header", { class: "cal-head" }, [
          ui.el("button", { class: "icon-btn", text: "‹", "aria-label": "이전 달", onclick: () => go(-1) }),
          ui.el("h1", { class: "cal-title", text: year + "년 " + month + "월" }),
          ui.el("button", { class: "icon-btn", text: "›", "aria-label": "다음 달", onclick: () => go(1) }),
          ui.el("button", { class: "btn btn-ghost cal-today-btn", text: "오늘", onclick: goToday }),
        ]),
        ui.el("div", { class: "cal-weekdays" }, dt.WEEKDAY_NAMES.map((name, i) =>
          ui.el("div", { class: "cal-weekday" + (i === 0 ? " cal-sun" : i === 6 ? " cal-sat" : ""), text: name })
        )),
        ui.el("div", { class: "cal-grid" }, cells),
        ui.el("div", { class: "cal-summary" }, [
          ui.el("span", { text: "이번 달 공부 " + dt.formatDuration(summary.total) }),
          ui.el("span", { text: "평균 달성률 " + summary.avg + "%" }),
        ]),
      ])
    );
  }

  function onLongPress(dateKey) {
    SP.sheets.dayMenu(dateKey, () => SP.app.showCalendar(SP.app.viewDate().year, SP.app.viewDate().month));
  }

  const api = { render, onLongPress, monthSummary, studyMinutesByDay };
  SP.calendar = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
