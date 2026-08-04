(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 8;

  function whenLabel(own) {
    if (own.length === 0) return "미배정";
    if (own.length === 1) return dt.minutesToLabel(own[0].start) + "~" + dt.minutesToLabel(own[0].end);
    return own.length + "개 배정";
  }

  function openEditor(dateKey, todoId, onDone) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const existing = todoId ? day.todos.find((t) => t.id === todoId) : null;

    const select = subjectsApi.buildSelect(state.settings.subjects, existing ? existing.subjectId : null);
    const input = ui.el("input", { type: "text", value: existing ? existing.text : "", placeholder: "할 일을 입력하세요", maxlength: "80" });

    // 배정된 시간을 목록으로 다룬다. 저장 전까지는 여기서만 사는 사본이다.
    const own = SP.link.blocksOfTodo(day, todoId);
    const slots = own.map((b) => ({ id: b.id, start: b.start, end: b.end }));
    let active = slots.length ? 0 : -1;
    let labels = [];

    const listHost = ui.el("div", { class: "slot-list" });

    // 겹침을 볼 때는 다른 할 일의 블록에 더해, 아직 저장 안 된 이 목록의 다른
    // 줄도 함께 봐야 한다. 안 그러면 한 할 일 안에서 시간이 겹친 채 저장된다.
    function others(exceptIndex) {
      const list = day.blocks.filter((b) => b.todoId !== todoId);
      slots.forEach((s, i) => {
        if (i !== exceptIndex) list.push({ id: "slot" + i, start: s.start, end: s.end });
      });
      return list;
    }

    function paint(i) {
      const s = slots[i];
      labels[i].range.textContent = dt.minutesToLabel(s.start) + " ~ " + dt.minutesToLabel(s.end);
      labels[i].dur.textContent = dt.formatDuration(s.end - s.start);
    }

    function nudge(i, which, delta) {
      const s = slots[i];
      const nextStart = which === "start" ? dt.clampToDay(s.start + delta) : s.start;
      const nextEnd = which === "end" ? dt.clampToDay(s.end + delta) : s.end;
      if (nextEnd - nextStart < dt.SLOT) { ui.toast("시간은 최소 5분이어야 합니다."); return; }
      if (storeApi.findOverlap(others(i), { id: "__probe__", start: nextStart, end: nextEnd })) {
        ui.toast("다른 블록과 겹칩니다."); return;
      }
      s.start = nextStart; s.end = nextEnd;
      // 목록 전체를 다시 그리지 않는다. ±5분을 연타하는 동안 버튼이 갈리면
      // 탭이 떨어져 나간다.
      paint(i);
    }

    const stepper = (label, i, which) =>
      ui.el("div", { class: "stepper slot-step" }, [
        ui.el("span", { class: "stepper-label", text: label }),
        ui.el("button", { class: "btn stepper-btn", type: "button", text: "−5분", onclick: () => nudge(i, which, -dt.SLOT) }),
        ui.el("button", { class: "btn stepper-btn", type: "button", text: "+5분", onclick: () => nudge(i, which, dt.SLOT) }),
      ]);

    function addSlot() {
      const found = SP.link.firstFreeSlot(others(-1), 60);
      if (!found) { ui.toast("빈 시간이 없습니다."); return; }
      slots.push({ start: found.start, end: found.end });
      active = slots.length - 1;
      renderSlots();
    }

    function renderSlots() {
      ui.clear(listHost);
      labels = [];
      if (slots.length === 0) {
        listHost.appendChild(ui.el("p", { class: "empty", text: "배정된 시간이 없습니다." }));
      }
      slots.forEach((slot, i) => {
        const range = ui.el("span", { class: "slot-range" });
        const dur = ui.el("span", { class: "slot-dur" });
        labels[i] = { range, dur };
        listHost.appendChild(ui.el("div", { class: "slot" + (i === active ? " slot-on" : "") }, [
          ui.el("button", {
            class: "slot-head", type: "button",
            onclick: () => { active = active === i ? -1 : i; renderSlots(); },
          }, [range, dur]),
          ui.el("button", {
            class: "icon-btn slot-del", type: "button", text: "✕", "aria-label": "이 시간 빼기",
            onclick: () => {
              slots.splice(i, 1);
              if (active >= slots.length) active = slots.length - 1;
              renderSlots();
            },
          }),
        ]));
        paint(i);
        if (i === active) {
          listHost.appendChild(stepper("시작", i, "start"));
          listHost.appendChild(stepper("종료", i, "end"));
        }
      });
      listHost.appendChild(ui.el("button", { class: "btn add-btn", type: "button", text: "+ 시간 추가", onclick: addSlot }));
    }

    renderSlots();

    const save = () => {
      const text = input.value.trim();
      if (!text) { ui.toast("할 일을 입력하세요."); return; }
      const todo = existing
        ? { ...existing, subjectId: select.value || null, text }
        : { id: storeApi.newId(), subjectId: select.value || null, text, done: false };
      SP.app.saveDay(dateKey, SP.link.commitTodo(SP.app.store().getDay(dateKey), todo, slots));
      ui.closeSheet();
      onDone();
    };

    const remove = async () => {
      if (own.length > 0) {
        const ok = await ui.confirmDialog(
          "타임테이블에 배정된 " + own.length + "개 블록도 함께 지워집니다."
        );
        if (!ok) return;
      }
      SP.app.saveDay(dateKey, SP.link.removeTodo(SP.app.store().getDay(dateKey), todoId));
      ui.closeSheet();
      onDone();
    };

    ui.openSheet({
      title: existing ? "할 일 수정" : "할 일 추가",
      body: [
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "할 일" }), input]),
        ui.el("p", { class: "sheet-sub", text: "배정된 시간" }),
        listHost,
      ],
      actions: [
        existing
          ? ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: remove })
          : ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: save }),
      ],
    });
    setTimeout(() => input.focus(), 50);
  }

  // 길게 눌러 지우는 길은 실수로 눌리기 쉽다. 그래서 배정된 시간이 없어도 한 번
  // 묻는다. 시트에서 삭제 버튼을 누르는 건 이미 의도가 분명하므로 그쪽은 그대로 둔다.
  async function confirmRemove(dateKey, todoId, onChange) {
    const todo = SP.app.store().getDay(dateKey).todos.find((t) => t.id === todoId);
    if (!todo) return;
    const own = SP.link.blocksOfTodo(SP.app.store().getDay(dateKey), todoId);
    const ok = await ui.confirmDialog(
      "'" + todo.text + "' 을(를) 지웁니다." +
      (own.length ? "\n타임테이블에 배정된 " + own.length + "개 블록도 함께 사라집니다." : "")
    );
    if (!ok) return;
    // 묻는 동안 시간이 흘렀다. 그 사이의 편집을 덮어쓰지 않도록 다시 읽는다.
    SP.app.saveDay(dateKey, SP.link.removeTodo(SP.app.store().getDay(dateKey), todoId));
    onChange();
  }

  // 체크박스와 순서 화살표는 제스처에서 뺀다. 체크는 이 화면에서 가장 자주 누르는
  // 곳이라, 손이 잠깐 머무는 것만으로 삭제를 묻는 창이 뜨면 쓰기 어려워진다.
  function inControls(target) {
    return !!target.closest(".todo-check-hit, .todo-order");
  }

  // 짧게 누르면 편집, 길게 누르면 삭제. touch-action 은 건드리지 않는다 — 세로
  // 스크롤을 막을 이유가 없고, 손가락이 움직이면 브라우저가 스크롤을 가져가면서
  // pointercancel 을 보내 타이머가 접힌다.
  function attachRowGestures(node, dateKey, todoId, onChange) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let fired = false;
    let moved = false;
    let armed = false;

    const cancel = () => { clearTimeout(timer); timer = null; };

    node.addEventListener("pointerdown", (e) => {
      fired = false;
      moved = false;
      armed = !inControls(e.target);
      if (!armed) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => { fired = true; confirmRemove(dateKey, todoId, onChange); }, LONG_PRESS_MS);
    });
    node.addEventListener("pointermove", (e) => {
      if (moved || !armed) return;
      if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
        moved = true;
        cancel();
      }
    });
    node.addEventListener("pointerup", () => {
      cancel();
      if (!armed || fired || moved) return;
      openEditor(dateKey, todoId, onChange);
    });
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);
    // 길게 누를 때 뜨는 운영체제의 텍스트 선택 메뉴를 막는다.
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function move(dateKey, todoId, delta, onChange) {
    const day = SP.app.store().getDay(dateKey);
    const todos = day.todos.slice();
    const index = todos.findIndex((t) => t.id === todoId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= todos.length) return;
    [todos[index], todos[target]] = [todos[target], todos[index]];
    SP.app.store().setDay(dateKey, { todos });
    SP.app.persist();
    onChange();
  }

  function render(host, dateKey, onChange) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const subjects = state.settings.subjects;

    const rows = day.todos.map((todo, index) => {
      const own = SP.link.blocksOfTodo(day, todo.id);
      const row = ui.el("li", { class: "todo-row" + (todo.done ? " todo-done" : "") }, [
        ui.el("span", {
          class: "todo-tag",
          text: subjectsApi.nameOf(subjects, todo.subjectId) || "-",
          style: { background: subjectsApi.colorOf(subjects, todo.subjectId) },
        }),
        // 배정 시각을 별도 열로 빼면 390px에서 할 일 이름이 눌린다. 이름 아래에
        // 붙이고 버튼 전체를 탭 영역으로 둔다.
        //
        // 손가락으로 누르는 건 행 전체의 제스처가 처리한다(짧게 편집, 길게 삭제).
        // 여기 click 은 키보드로 Enter 를 눌렀을 때만 남는다 — 그때는 detail 이 0 이다.
        ui.el("button", { class: "todo-text", onclick: (e) => { if (e.detail === 0) openEditor(dateKey, todo.id, onChange); } }, [
          ui.el("span", { class: "todo-title", text: todo.text }),
          ui.el("span", { class: "todo-when" + (own.length ? "" : " todo-when-none"), text: whenLabel(own) }),
        ]),
        ui.el("div", { class: "todo-order" }, [
          ui.el("button", { class: "icon-btn tiny", text: "▲", "aria-label": "위로", disabled: index === 0, onclick: () => move(dateKey, todo.id, -1, onChange) }),
          ui.el("button", { class: "icon-btn tiny", text: "▼", "aria-label": "아래로", disabled: index === day.todos.length - 1, onclick: () => move(dateKey, todo.id, 1, onChange) }),
        ]),
        // 과목이 없으면 완료를 매기지 않는다 — 공부 시간에도 달성률에도 안 들어가는
        // 일이라 체크할 대상이 없다. 빈 칸은 남겨둔다. 없애면 그 줄만 순서 화살표가
        // 오른쪽으로 밀려 다른 줄과 열이 어긋난다.
        storeApi.isStudy(todo)
          ? ui.el("label", { class: "todo-check-hit" }, [
              ui.el("input", {
                type: "checkbox", class: "todo-check", "aria-label": "완료", checked: todo.done,
                onchange: (e) => {
                  SP.app.saveDay(dateKey, SP.link.setTodoDone(SP.app.store().getDay(dateKey), todo.id, e.target.checked));
                  onChange();
                },
              }),
            ])
          : ui.el("div", { class: "todo-check-hit", "aria-hidden": "true" }),
      ]);
      attachRowGestures(row, dateKey, todo.id, onChange);
      return row;
    });

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "To-Do List" }),
        day.todos.length
          ? ui.el("ul", { class: "todo-list" }, rows)
          : ui.el("p", { class: "empty", text: "할 일이 없습니다. 아래 버튼으로 추가하세요." }),
        // 길게 누르는 동작은 눈에 보이지 않는다. 안내가 없으면 아무도 못 찾는다.
        day.todos.length
          ? ui.el("p", { class: "empty", text: "할 일을 길게 누르면 지웁니다. 배정된 시간도 함께 사라집니다." })
          : null,
        ui.el("button", { class: "btn add-btn", text: "+ 할 일 추가", onclick: () => openEditor(dateKey, null, onChange) }),
      ])
    );
  }

  const api = { render, openEditor };
  SP.todos = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
