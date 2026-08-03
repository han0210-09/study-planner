(function (root) {
  const SP = (root.SP = root.SP || {});
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  function openEditor(dateKey, todoId, onDone) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const existing = todoId ? day.todos.find((t) => t.id === todoId) : null;

    const select = subjectsApi.buildSelect(state.settings.subjects, existing ? existing.subjectId : null);
    const input = ui.el("input", { type: "text", value: existing ? existing.text : "", placeholder: "할 일을 입력하세요", maxlength: "80" });

    const save = () => {
      const text = input.value.trim();
      if (!text) { ui.toast("할 일을 입력하세요."); return; }
      const todos = day.todos.slice();
      if (existing) {
        const index = todos.findIndex((t) => t.id === todoId);
        todos[index] = { ...existing, subjectId: select.value || null, text };
      } else {
        todos.push({ id: storeApi.newId(), subjectId: select.value || null, text, done: false });
      }
      SP.app.store().setDay(dateKey, { todos });
      SP.app.persist();
      ui.closeSheet();
      onDone();
    };

    ui.openSheet({
      title: existing ? "할 일 수정" : "할 일 추가",
      body: [
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "할 일" }), input]),
      ],
      actions: [
        existing
          ? ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
              SP.app.store().setDay(dateKey, { todos: day.todos.filter((t) => t.id !== todoId) });
              SP.app.persist(); ui.closeSheet(); onDone();
            } })
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

    const rows = day.todos.map((todo, index) =>
      ui.el("li", { class: "todo-row" + (todo.done ? " todo-done" : "") }, [
        ui.el("span", {
          class: "todo-tag",
          text: subjectsApi.nameOf(subjects, todo.subjectId) || "-",
          style: { background: subjectsApi.colorOf(subjects, todo.subjectId) },
        }),
        ui.el("button", { class: "todo-text", text: todo.text, onclick: () => openEditor(dateKey, todo.id, onChange) }),
        ui.el("div", { class: "todo-order" }, [
          ui.el("button", { class: "icon-btn tiny", text: "▲", "aria-label": "위로", disabled: index === 0, onclick: () => move(dateKey, todo.id, -1, onChange) }),
          ui.el("button", { class: "icon-btn tiny", text: "▼", "aria-label": "아래로", disabled: index === day.todos.length - 1, onclick: () => move(dateKey, todo.id, 1, onChange) }),
        ]),
        ui.el("input", {
          type: "checkbox", class: "todo-check", "aria-label": "완료", checked: todo.done,
          onchange: (e) => {
            const todos = day.todos.map((t) => (t.id === todo.id ? { ...t, done: e.target.checked } : t));
            SP.app.store().setDay(dateKey, { todos });
            SP.app.persist();
            onChange();
          },
        }),
      ])
    );

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
