(function (root) {
  const SP = (root.SP = root.SP || {});
  const ui = SP.ui;
  const dictApi = SP.dict;
  const subjectsApi = SP.subjects;

  // 할 일 하나를 어느 분류에 넣을지 고른다. 여기서 새 분류를 바로 만들 수 있어야
  // 한다 — 분류를 먼저 만들러 다른 화면에 다녀오게 하면, 정리하다 말고 흐름이 끊긴다.
  function groupPicker(text, onDone) {
    const state = SP.app.state();
    const groups = state.dictionary.groups;
    const current = state.dictionary.assign[dictApi.normalize(text)] || null;
    const nameInput = ui.el("input", { type: "text", placeholder: "예: 학원, 학교 수업", maxlength: "20" });

    const choose = (groupId) => {
      dictApi.assignTo(state, text, groupId);
      SP.app.persist();
      ui.closeSheet();
      onDone();
    };

    ui.openSheet({
      title: text,
      body: [
        ui.el("p", { class: "sheet-sub", text: "분류" }),
        ui.el("div", { class: "menu" }, [
          ui.el("button", {
            class: "menu-item" + (current ? "" : " menu-on"), type: "button",
            text: "분류 없음", onclick: () => choose(null),
          }),
          ...groups.map((g) => ui.el("button", {
            class: "menu-item" + (g.id === current ? " menu-on" : ""), type: "button",
            text: g.name, onclick: () => choose(g.id),
          })),
        ]),
        ui.el("p", { class: "sheet-sub", text: "새 분류 만들기" }),
        ui.el("div", { class: "row-add" }, [
          nameInput,
          ui.el("button", {
            class: "btn", type: "button", text: "만들기",
            onclick: () => {
              const made = dictApi.addGroup(state, nameInput.value);
              if (!made) { ui.toast("분류 이름을 입력하세요."); return; }
              choose(made.id);
            },
          }),
        ]),
      ],
    });
  }

  // 분류 자체를 고치거나 없앤다. 없애도 할 일은 남는다 — 사전은 날짜 데이터에서
  // 뽑으므로 여기서 지우는 것은 묶어둔 것뿐이다.
  function groupEditor(group, onDone) {
    const state = SP.app.state();
    const input = ui.el("input", { type: "text", value: group.name, maxlength: "20" });
    ui.openSheet({
      title: "분류 수정",
      body: [ui.el("label", { class: "field" }, [ui.el("span", { text: "이름" }), input])],
      actions: [
        ui.el("button", {
          class: "btn btn-danger", text: "분류 없애기",
          onclick: async () => {
            const freed = dictApi.entries(state).filter((e) => e.groupId === group.id).length;
            const ok = await ui.confirmDialog(
              "'" + group.name + "' 분류를 없앱니다.\n" +
              (freed ? "할 일 " + freed + "개가 '분류 없음'으로 갑니다." : "묶여 있는 할 일은 없습니다.") +
              "\n할 일 자체는 지워지지 않습니다.");
            if (!ok) { onDone(); return; }
            dictApi.removeGroup(state, group.id);
            SP.app.persist();
            ui.closeSheet();
            onDone();
          },
        }),
        ui.el("button", {
          class: "btn btn-primary", text: "저장",
          onclick: () => {
            if (!dictApi.renameGroup(state, group.id, input.value)) { ui.toast("이름을 입력하세요."); return; }
            SP.app.persist();
            ui.closeSheet();
            onDone();
          },
        }),
      ],
    });
  }

  // 사전. 여태 등록한 할 일을 모든 날짜에서 모아 보여준다.
  //
  // 여기서는 정리만 한다 — 줄을 누르면 분류를 고른다. 계획에 넣는 것은 블록
  // 편집 시트의 할 일 목록이 맡는다. 시트는 한 번에 하나만 뜨므로, 편집 중에
  // 사전을 띄우면 입력하던 것이 사라진다.
  function open() {
    const state = SP.app.state();
    const subjects = state.settings.subjects;
    const groups = dictApi.grouped(state);
    const reopen = () => open();

    const body = [];
    for (const bucket of groups) {
      const head = bucket.group
        ? ui.el("button", {
            class: "dict-group-head", type: "button", text: bucket.group.name + " ›",
            onclick: () => groupEditor(bucket.group, reopen),
          })
        : ui.el("p", { class: "sheet-sub", text: "분류 없음" });
      // 분류 없음이 비어 있으면 머리글도 띄우지 않는다. 다 정리한 사람에게
      // 빈 칸만 남기지 않기 위해서다.
      if (!bucket.group && bucket.items.length === 0) continue;
      body.push(head);
      if (bucket.items.length === 0) {
        body.push(ui.el("p", { class: "empty", text: "아직 없습니다." }));
        continue;
      }
      body.push(ui.el("ul", { class: "dict-list" }, bucket.items.map((entry) =>
        ui.el("li", { class: "dict-row" }, [
          ui.el("button", {
            class: "dict-main", type: "button",
            onclick: () => groupPicker(entry.text, reopen),
          }, [
            ui.el("span", { class: "dict-name", text: entry.text }),
            ui.el("span", { class: "dict-meta", text:
              (subjectsApi.nameOf(subjects, entry.subjectId) || "과목 없음") + " · " + entry.count + "회" }),
          ]),
          ui.el("button", {
            class: "icon-btn dict-tag", type: "button", text: "⊞", "aria-label": "분류 바꾸기",
            onclick: () => groupPicker(entry.text, reopen),
          }),
        ])
      )));
    }

    if (body.length === 0) {
      body.push(ui.el("p", { class: "empty", text: "아직 등록한 할 일이 없습니다.\n계획을 세우면 여기에 쌓입니다." }));
    }

    ui.openSheet({
      title: "사전",
      body,
      actions: [ui.el("button", { class: "btn btn-ghost", text: "닫기", onclick: ui.closeSheet })],
    });
  }

  const api = { open, groupPicker, groupEditor };
  SP.dictsheet = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
