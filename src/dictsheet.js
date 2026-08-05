(function (root) {
  const SP = (root.SP = root.SP || {});
  const ui = SP.ui;
  const dt = SP.datetime;
  const storeApi = SP.store;
  const dictApi = SP.dict;
  const subjectsApi = SP.subjects;

  // 항목이 이만큼 넘어야 찾기 칸을 보여준다. 서너 개뿐인데 검색창이 있으면
  // 자리만 차지한다.
  const SEARCH_FROM = 8;
  // 사전에서 바로 넣는 블록의 기본 길이. 어차피 편집 시트가 곧바로 열리므로
  // 여기서 고민할 값이 아니다.
  const DEFAULT_MINUTES = 60;

  // 무엇을 보고 있었는지는 시트를 닫아도 남는다. 한 분류를 정리하는 동안 열 때마다
  // 처음으로 돌아가면 정리가 되지 않는다.
  let filter = "all"; // "all" | "none" | 분류 id

  // 사전. 여태 등록한 할 일을 모든 날짜에서 모아 본다.
  //
  // 시트를 다시 열어 그리지 않는다. 예전에는 분류를 하나 바꿀 때마다 시트가
  // 닫혔다 열려서, 어디를 보고 있었는지 매번 잃었다. 안쪽만 다시 그린다.
  function open(dateKey, onChange) {
    const groupsNow = () => SP.app.state().dictionary.groups;
    // 지난번에 보던 분류가 그 사이 없어졌을 수 있다. 그대로 두면 빈 목록만 뜬다.
    if (filter !== "all" && filter !== "none" && !groupsNow().some((g) => g.id === filter)) filter = "all";

    let mode = "";  // "" | "add" | "rename" | "del"
    let query = "";

    const chipsHost = ui.el("div", {});
    const manageHost = ui.el("div", {});
    const listHost = ui.el("div", {});
    // 찾기 칸은 한 번만 만든다. 다시 그리면 한 글자 칠 때마다 포커스가 떨어진다.
    const search = ui.el("input", {
      type: "search", class: "dict-search", placeholder: "이름으로 찾기", maxlength: "40",
      oninput: (e) => { query = e.target.value; paintList(); },
    });
    const searchRow = ui.el("div", { class: "dict-search-row" }, [search]);

    function currentGroup() {
      return groupsNow().find((g) => g.id === filter) || null;
    }

    function save() {
      SP.app.persist();
      paintAll();
    }

    /* ---------- 분류 칩 ---------- */

    function paintChips() {
      const list = dictApi.entries(SP.app.state());
      const counts = new Map();
      for (const e of list) {
        const key = e.groupId || "none";
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const chip = (key, name, n) => ui.el("button", {
        class: "chip dict-chip" + (filter === key ? " chip-on" : ""), type: "button",
        text: name + " " + n,
        onclick: () => { filter = key; mode = ""; paintAll(); },
      });

      const nodes = [chip("all", "전체", list.length)];
      for (const g of groupsNow()) nodes.push(chip(g.id, g.name, counts.get(g.id) || 0));
      nodes.push(chip("none", "미분류", counts.get("none") || 0));
      nodes.push(ui.el("button", {
        class: "chip dict-chip-new", type: "button", text: "＋ 분류",
        onclick: () => { mode = mode === "add" ? "" : "add"; paintManage(); },
      }));

      ui.clear(chipsHost).appendChild(ui.el("div", { class: "chip-group" }, nodes));
    }

    /* ---------- 분류 만들기 · 이름 바꾸기 · 없애기 ---------- */

    // 셋 다 이 줄 안에서 끝낸다. 새 시트를 띄우면 사전이 닫히고, 돌아왔을 때
    // 보던 자리를 잃는다.
    function paintManage() {
      ui.clear(manageHost);
      const group = currentGroup();

      if (mode === "add") {
        const input = ui.el("input", { type: "text", placeholder: "예: 학원, 학교 수업", maxlength: "20" });
        manageHost.appendChild(ui.el("div", { class: "row-add" }, [
          input,
          ui.el("button", { class: "btn", type: "button", text: "만들기", onclick: () => {
            const made = dictApi.addGroup(SP.app.state(), input.value);
            if (!made) { ui.toast("분류 이름을 입력하세요."); return; }
            // 방금 만든 분류를 바로 보여준다. 만들고 나서 다시 찾아 누르게 하지 않는다.
            filter = made.id;
            mode = "";
            save();
          } }),
        ]));
        setTimeout(() => input.focus(), 50);
        return;
      }

      if (!group) return;

      if (mode === "rename") {
        const input = ui.el("input", { type: "text", value: group.name, maxlength: "20" });
        manageHost.appendChild(ui.el("div", { class: "row-add" }, [
          input,
          ui.el("button", { class: "btn", type: "button", text: "저장", onclick: () => {
            if (!dictApi.renameGroup(SP.app.state(), group.id, input.value)) { ui.toast("이름을 입력하세요."); return; }
            mode = "";
            save();
          } }),
        ]));
        return;
      }

      if (mode === "del") {
        const freed = dictApi.entries(SP.app.state()).filter((e) => e.groupId === group.id).length;
        manageHost.appendChild(ui.el("div", { class: "dict-confirm" }, [
          ui.el("span", { class: "dict-confirm-msg", text: freed
            ? "할 일 " + freed + "개가 미분류로 갑니다. 할 일 자체는 남습니다."
            : "묶여 있는 할 일은 없습니다." }),
          ui.el("div", { class: "dict-confirm-btns" }, [
            ui.el("button", { class: "btn", type: "button", text: "취소", onclick: () => { mode = ""; paintManage(); } }),
            ui.el("button", { class: "btn btn-danger", type: "button", text: "없애기", onclick: () => {
              dictApi.removeGroup(SP.app.state(), group.id);
              filter = "all";
              mode = "";
              save();
            } }),
          ]),
        ]));
        return;
      }

      manageHost.appendChild(ui.el("div", { class: "dict-tools" }, [
        ui.el("button", { class: "link-btn", type: "button", text: "이름 바꾸기",
          onclick: () => { mode = "rename"; paintManage(); } }),
        ui.el("button", { class: "link-btn link-danger", type: "button", text: "분류 없애기",
          onclick: () => { mode = "del"; paintManage(); } }),
      ]));
    }

    /* ---------- 목록 ---------- */

    function visible() {
      const q = dictApi.normalize(query).toLowerCase();
      return dictApi.entries(SP.app.state()).filter((e) => {
        if (filter === "none" && e.groupId) return false;
        if (filter !== "all" && filter !== "none" && e.groupId !== filter) return false;
        return !q || e.text.toLowerCase().indexOf(q) >= 0;
      });
    }

    // 분류는 줄 안에서 바로 바꾼다. 눌러서 시트를 띄우던 예전 방식은, 지금 어느
    // 분류에 든 것인지 열어보기 전에는 알 수 없었다.
    function groupSelect(entry) {
      const select = ui.el("select", { class: "dict-group", "aria-label": entry.text + " 분류" }, [
        ui.el("option", { value: "", text: "미분류", selected: !entry.groupId }),
        ...groupsNow().map((g) => ui.el("option", { value: g.id, text: g.name, selected: g.id === entry.groupId })),
      ]);
      select.addEventListener("change", () => {
        dictApi.assignTo(SP.app.state(), entry.text, select.value || null);
        save();
      });
      return select;
    }

    // 오늘 계획의 빈 시간에 넣고 곧바로 편집 시트를 연다. 어디에 들어갔는지
    // 보여주고 그 자리에서 시간을 맞출 수 있어야 한다.
    function addToPlan(entry) {
      const day = SP.app.store().getDay(dateKey);
      const slot = SP.link.firstFreeSlot(day.blocks, DEFAULT_MINUTES);
      if (!slot) { ui.toast("빈 시간이 없습니다."); return; }
      const block = {
        id: storeApi.newId(), subjectId: entry.subjectId || null, text: entry.text,
        start: slot.start, end: slot.end, done: false, todoId: null,
      };
      SP.app.saveDay(dateKey, SP.link.commitBlock(day, block, "new", entry.text));
      ui.closeSheet();
      onChange();
      SP.timetable.openBlockEditor(dateKey, block.id, onChange);
    }

    function rowNode(entry) {
      const subjects = SP.app.state().settings.subjects;
      return ui.el("li", { class: "dict-row" }, [
        ui.el("div", { class: "dict-main" }, [
          ui.el("span", { class: "dict-name", text: entry.text }),
          ui.el("span", { class: "dict-meta", text:
            (subjectsApi.nameOf(subjects, entry.subjectId) || "과목 없음") + " · " + entry.count + "회" }),
        ]),
        groupSelect(entry),
        dateKey
          ? ui.el("button", {
              class: "icon-btn dict-add", type: "button", text: "＋",
              "aria-label": entry.text + " 계획에 넣기",
              onclick: () => addToPlan(entry),
            })
          : null,
      ]);
    }

    function paintList() {
      const all = dictApi.entries(SP.app.state());
      searchRow.hidden = all.length <= SEARCH_FROM;
      const rows = visible();
      ui.clear(listHost);
      if (rows.length) {
        listHost.appendChild(ui.el("ul", { class: "dict-list" }, rows.map(rowNode)));
        return;
      }
      listHost.appendChild(ui.el("p", { class: "empty", text:
        all.length === 0 ? "아직 등록한 할 일이 없습니다.\n계획을 세우면 여기에 쌓입니다."
          : query ? "찾는 이름이 없습니다."
          : "이 분류에 든 할 일이 없습니다." }));
    }

    function paintAll() {
      paintChips();
      paintManage();
      paintList();
    }

    paintAll();
    ui.openSheet({
      title: "사전",
      body: [
        chipsHost, manageHost, searchRow, listHost,
        // 줄마다 있는 ＋ 가 무엇인지 한 줄로 밝힌다. 아이콘만 두면 눌러보기 전에는 모른다.
        dateKey ? ui.el("p", { class: "dict-hint", text: "＋ 를 누르면 오늘 계획의 빈 시간에 넣습니다." }) : null,
      ],
      actions: [ui.el("button", { class: "btn btn-ghost", text: "닫기", onclick: ui.closeSheet })],
    });
  }

  const api = { open };
  SP.dictsheet = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
