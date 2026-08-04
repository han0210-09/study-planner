(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

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

    const own = SP.link.blocksOfTodo(day, todoId);
    // 블록이 둘 이상이면 시트의 범위 하나로 표현할 수 없다. 시각은 타임테이블에서
    // 고치게 하고 여기서는 건드리지 않는다.
    const many = own.length > 1;
    const suggestion = own.length === 1
      ? { start: own[0].start, end: own[0].end }
      : SP.link.firstFreeSlot(day.blocks, 60);

    let start = suggestion ? suggestion.start : 0;
    let end = suggestion ? suggestion.end : 0;

    const rangeLabel = ui.el("strong", {});
    const durationLabel = ui.el("span", { class: "editor-duration" });
    const assign = ui.el("input", { type: "checkbox", checked: own.length === 1 });
    if (!suggestion) { assign.checked = false; assign.disabled = true; }

    function redraw() {
      if (suggestion) {
        rangeLabel.textContent = dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end);
        durationLabel.textContent = dt.formatDuration(end - start);
      } else {
        rangeLabel.textContent = "빈 시간이 없습니다";
        durationLabel.textContent = "";
      }
      rangeBox.hidden = !assign.checked;
    }

    function nudge(which, delta) {
      const nextStart = which === "start" ? dt.clampToDay(start + delta) : start;
      const nextEnd = which === "end" ? dt.clampToDay(end + delta) : end;
      if (nextEnd - nextStart < dt.SLOT) { ui.toast("블록은 최소 5분이어야 합니다."); return; }
      const probe = { id: own.length ? own[0].id : null, start: nextStart, end: nextEnd };
      if (storeApi.findOverlap(day.blocks, probe, probe.id)) { ui.toast("다른 블록과 겹칩니다."); return; }
      start = nextStart; end = nextEnd;
      redraw();
    }

    const stepper = (label, which) =>
      ui.el("div", { class: "stepper" }, [
        ui.el("span", { class: "stepper-label", text: label }),
        ui.el("button", { class: "btn stepper-btn", text: "−5분", onclick: () => nudge(which, -dt.SLOT) }),
        ui.el("button", { class: "btn stepper-btn", text: "+5분", onclick: () => nudge(which, dt.SLOT) }),
      ]);

    const rangeBox = ui.el("div", {}, [
      ui.el("div", { class: "editor-range" }, [rangeLabel, durationLabel]),
      stepper("시작", "start"),
      stepper("종료", "end"),
    ]);

    assign.addEventListener("change", redraw);
    redraw();

    const save = () => {
      const text = input.value.trim();
      if (!text) { ui.toast("할 일을 입력하세요."); return; }
      const todo = existing
        ? { ...existing, subjectId: select.value || null, text }
        : { id: storeApi.newId(), subjectId: select.value || null, text, done: false };
      const range = many ? "keep" : (assign.checked && suggestion ? { start, end } : null);
      SP.app.saveDay(dateKey, SP.link.commitTodo(SP.app.store().getDay(dateKey), todo, range));
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
        many
          ? ui.el("p", { class: "empty", text: "타임테이블에 " + own.length + "개 배정되어 있습니다. 시각은 타임테이블에서 바꾸세요." })
          : ui.el("label", { class: "editor-done" }, [assign, ui.el("span", { text: "타임테이블에 시간 배정" })]),
        many ? null : rangeBox,
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
      return ui.el("li", { class: "todo-row" + (todo.done ? " todo-done" : "") }, [
        ui.el("span", {
          class: "todo-tag",
          text: subjectsApi.nameOf(subjects, todo.subjectId) || "-",
          style: { background: subjectsApi.colorOf(subjects, todo.subjectId) },
        }),
        // 배정 시각을 별도 열로 빼면 390px에서 할 일 이름이 눌린다. 이름 아래에
        // 붙이고 버튼 전체를 탭 영역으로 둔다.
        ui.el("button", { class: "todo-text", onclick: () => openEditor(dateKey, todo.id, onChange) }, [
          ui.el("span", { class: "todo-title", text: todo.text }),
          ui.el("span", { class: "todo-when" + (own.length ? "" : " todo-when-none"), text: whenLabel(own) }),
        ]),
        ui.el("div", { class: "todo-order" }, [
          ui.el("button", { class: "icon-btn tiny", text: "▲", "aria-label": "위로", disabled: index === 0, onclick: () => move(dateKey, todo.id, -1, onChange) }),
          ui.el("button", { class: "icon-btn tiny", text: "▼", "aria-label": "아래로", disabled: index === day.todos.length - 1, onclick: () => move(dateKey, todo.id, 1, onChange) }),
        ]),
        ui.el("label", { class: "todo-check-hit" }, [
          ui.el("input", {
            type: "checkbox", class: "todo-check", "aria-label": "완료", checked: todo.done,
            onchange: (e) => {
              SP.app.saveDay(dateKey, SP.link.setTodoDone(SP.app.store().getDay(dateKey), todo.id, e.target.checked));
              onChange();
            },
          }),
        ]),
      ]);
    });

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "To-Do List" }),
        day.todos.length
          ? ui.el("ul", { class: "todo-list" }, rows)
          : ui.el("p", { class: "empty", text: "할 일이 없습니다. 아래 버튼으로 추가하세요." }),
        ui.el("button", { class: "btn add-btn", text: "+ 할 일 추가", onclick: () => openEditor(dateKey, null, onChange) }),
      ])
    );
  }

  const api = { render, openEditor };
  SP.todos = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
