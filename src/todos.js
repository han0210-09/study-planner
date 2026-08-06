(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  const LONG_PRESS_MS = 450;
  const MOVE_TOLERANCE = 8;

  function openEditor(dateKey, todoId, onDone) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const existing = todoId ? day.todos.find((t) => t.id === todoId) : null;

    // 과목은 안 골라도 된다. 비워두면 이름표 없는 할 일이 되고, 그래도 체크는
    // 할 수 있다. 여기서 바로 새 과목을 만들 수도 있다.
    const subject = subjectsApi.subjectField(state, existing ? existing.subjectId : null);
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
        ? { ...existing, subjectId: subject.value || null, text }
        : { id: storeApi.newId(), subjectId: subject.value || null, text, done: false };
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
        ui.el("div", { class: "field" }, [ui.el("span", { text: "과목 (선택)" }), subject.node]),
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

  // 목록의 한 줄은 블록 하나다. 한 할 일을 아침·저녁으로 나눠 잡았으면 두 줄이
  // 되고, 각자 자기 시각 자리에 놓인다. 예전처럼 "2개 배정"으로 뭉치면 언제
  // 하는 일인지 목록만 봐서는 알 수 없다.
  //
  // 아직 시간을 안 잡은 할 일은 비교할 시각이 없으므로 맨 아래로 모은다.
  function rowsOf(day) {
    const rows = [];
    for (const block of day.blocks) {
      const todo = day.todos.find((t) => t.id === block.todoId);
      if (!todo) continue;
      const own = day.blocks.filter((b) => b.todoId === todo.id).sort((a, b) => a.start - b.start);
      rows.push({
        key: block.id, todo, block,
        nth: own.findIndex((b) => b.id === block.id) + 1,
        of: own.length,
      });
    }
    rows.sort((a, b) => a.block.start - b.block.start);
    for (const todo of day.todos) {
      if (!day.blocks.some((b) => b.todoId === todo.id)) {
        rows.push({ key: todo.id, todo, block: null, nth: 1, of: 1 });
      }
    }
    return rows;
  }

  // 길게 눌러 지우는 길은 실수로 눌리기 쉽다. 그래서 한 번 묻는다.
  //
  // 줄이 블록 하나이므로 지우는 것도 그 블록 하나다. 그 할 일의 마지막 블록일
  // 때만 할 일까지 사라진다 - removeBlock 이 이미 그렇게 한다.
  async function confirmRemove(dateKey, row, onChange) {
    const what = row.of > 1
      ? "'" + row.todo.text + "' 의 " + dt.minutesToLabel(row.block.start) + " 시간만 지웁니다."
      : "'" + row.todo.text + "' 을(를) 지웁니다." + (row.block ? "\n타임테이블에서도 사라집니다." : "");
    if (!(await ui.confirmDialog(what))) return;
    const day = SP.app.store().getDay(dateKey);
    SP.app.saveDay(dateKey, row.block
      ? SP.link.removeBlock(day, row.block.id)
      : SP.link.removeTodo(day, row.todo.id));
    onChange();
  }

  function openRow(dateKey, row, onChange) {
    // 줄이 블록이면 그 블록을 연다. 시간이 없는 할 일만 할 일 시트로 간다.
    if (row.block) SP.timetable.openBlockEditor(dateKey, row.block.id, onChange);
    else openEditor(dateKey, row.todo.id, onChange);
  }

  // 체크박스와 순서 열은 제스처에서 뺀다. 체크는 이 화면에서 가장 자주 누르는
  // 곳이라, 손이 잠깐 머무는 것만으로 삭제를 묻는 창이 뜨면 쓰기 어려워진다.
  function inControls(target) {
    return !!target.closest(".todo-check-hit");
  }

  // 짧게 누르면 편집, 길게 누르면 삭제. touch-action 은 건드리지 않는다 — 세로
  // 스크롤을 막을 이유가 없고, 손가락이 움직이면 브라우저가 스크롤을 가져가면서
  // pointercancel 을 보내 타이머가 접힌다.
  function attachRowGestures(node, dateKey, row, onChange) {
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
      timer = setTimeout(() => { fired = true; confirmRemove(dateKey, row, onChange); }, LONG_PRESS_MS);
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
      openRow(dateKey, row, onChange);
    });
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);
    // 길게 누를 때 뜨는 운영체제의 텍스트 선택 메뉴를 막는다.
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function toggle(dateKey, row, checked, onChange) {
    const day = SP.app.store().getDay(dateKey);
    SP.app.saveDay(dateKey, row.block
      ? SP.link.setBlockDone(day, row.block.id, checked)
      : SP.link.setTodoDone(day, row.todo.id, checked));
    onChange();
  }

  function rowNode(dateKey, row, subjects, onChange) {
    const done = row.block ? row.block.done : row.todo.done;
    const when = row.block
      ? dt.minutesToLabel(row.block.start) + "~" + dt.minutesToLabel(row.block.end)
      : "미배정";

    const title = ui.el("span", { class: "todo-title", text: row.todo.text });
    // 같은 할 일이 여러 번 나뉘어 있을 때만 회차를 붙인다. 한 번뿐인데 1/1 이
    // 붙으면 읽을 것만 늘어난다.
    const nth = row.of > 1
      ? ui.el("span", { class: "todo-nth", text: row.nth + "/" + row.of })
      : null;

    // 과목을 안 고른 할 일이 흔해졌으므로, 없을 때는 이름표 자체를 뺀다.
    // "-" 만 든 색 딱지가 줄마다 붙으면 읽을 것만 늘어난다.
    //
    // 이름표는 제목과 한 줄에 둔다. 예전처럼 자기 열을 차지하면, 이름표가 없는
    // 줄에서 그 열이 비어 체크 열이 8px 씩 어긋난다.
    const tag = row.todo.subjectId
      ? ui.el("span", {
          class: "todo-tag",
          text: subjectsApi.nameOf(subjects, row.todo.subjectId),
          style: { background: subjectsApi.colorOf(subjects, row.todo.subjectId) },
        })
      : null;

    const node = ui.el("li", { class: "todo-row" + (done ? " todo-done" : "") }, [
      ui.el("button", { class: "todo-text", type: "button",
        // 손가락으로 누르는 건 줄 전체의 제스처가 처리한다(짧게 편집, 길게 삭제).
        // 여기 click 은 키보드로 Enter 를 눌렀을 때만 남는다 — 그때는 detail 이 0 이다.
        onclick: (e) => { if (e.detail === 0) openRow(dateKey, row, onChange); } }, [
        ui.el("span", { class: "todo-head" }, [tag, title, nth]),
        ui.el("span", { class: "todo-when" + (row.block ? "" : " todo-when-none"), text: when }),
      ]),
      // 과목과 상관없이 체크할 수 있다. 예전에는 과목을 골라야만 체크가
      // 나타났는데, 할 일만 적고 저장한 사람에게는 목록이 반쯤 죽은 것처럼
      // 보였다. 과목은 이름표일 뿐이다.
      ui.el("label", { class: "todo-check-hit" }, [
        ui.el("input", {
          type: "checkbox", class: "todo-check", "aria-label": "완료", checked: done,
          onchange: (e) => toggle(dateKey, row, e.target.checked, onChange),
        }),
      ]),
    ]);
    attachRowGestures(node, dateKey, row, onChange);
    return node;
  }

  function render(host, dateKey, onChange) {
    const subjects = SP.app.state().settings.subjects;
    const day = SP.app.store().getDay(dateKey);
    const rows = rowsOf(day);

    ui.clear(host).appendChild(
      // 제목은 탭이 대신한다(타임테이블 쪽과 같은 이유).
      ui.el("section", { class: "card" }, [
        rows.length
          ? ui.el("ul", { class: "todo-list" }, rows.map((r) => rowNode(dateKey, r, subjects, onChange)))
          : ui.el("p", { class: "empty", text: "할 일이 없습니다." }),
        ui.el("button", { class: "btn add-btn", text: "+ 할 일 추가", onclick: () => openEditor(dateKey, null, onChange) }),
      ])
    );
  }

  const api = { render, openEditor, rowsOf };
  SP.todos = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
