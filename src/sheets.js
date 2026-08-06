(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const eventsApi = SP.events;
  const clip = SP.clipboard;
  const ui = SP.ui;

  function afterMutation(onDone) {
    SP.app.persist();
    ui.closeSheet();
    if (onDone) onDone();
  }

  /* ---------- 일정 ---------- */

  function eventEditor(dateKey, eventId, onDone) {
    const state = SP.app.state();
    const existing = eventId ? state.events.find((e) => e.id === eventId) : null;

    const title = ui.el("input", { type: "text", value: existing ? existing.title : "", placeholder: "예: 국어 수행평가", maxlength: "40" });
    const typeSelect = ui.el("select", { class: "subject-select" },
      eventsApi.EVENT_TYPES.map((t) =>
        ui.el("option", { value: t.id, text: t.label, selected: existing ? existing.type === t.id : t.id === "assessment" }))
    );
    const startInput = ui.el("input", { type: "date", value: existing ? existing.startDate : dateKey });
    const endInput = ui.el("input", { type: "date", value: existing ? existing.endDate : dateKey });
    const memoInput = ui.el("textarea", { placeholder: "메모 (선택)", maxlength: "300" });
    if (existing) memoInput.value = existing.memo;

    function save() {
      const payload = {
        title: title.value, type: typeSelect.value,
        color: eventsApi.typeOf(typeSelect.value).color,
        startDate: startInput.value, endDate: endInput.value, memo: memoInput.value,
      };
      if (!payload.title.trim()) { ui.toast("제목을 입력하세요."); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) { ui.toast("시작일을 선택하세요."); return; }
      if (existing) eventsApi.updateEvent(state, eventId, payload);
      else eventsApi.addEvent(state, payload);
      afterMutation(onDone);
    }

    ui.openSheet({
      title: existing ? "일정 수정" : "일정 추가",
      body: [
        ui.el("label", { class: "field" }, [ui.el("span", { text: "제목" }), title]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "유형" }), typeSelect]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "시작일" }), startInput]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "종료일 (하루면 시작일과 같게)" }), endInput]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "메모" }), memoInput]),
      ],
      actions: [
        existing
          ? ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
              eventsApi.removeEvent(state, eventId); afterMutation(onDone);
            } })
          : ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: save }),
      ],
    });
  }

  /* ---------- 붙여넣기 ---------- */

  function pasteSheet(baseKey, onDone) {
    const state = SP.app.state();
    if (!state.clipboard) { ui.toast("먼저 계획을 복사하세요."); return; }

    let range = { type: "day" };
    let filter = { type: "all" };
    let mode = "overwrite";

    const customFrom = ui.el("input", { type: "date", value: baseKey });
    const customTo = ui.el("input", { type: "date", value: baseKey });
    const customRow = ui.el("div", { class: "custom-range", hidden: true }, [
      ui.el("label", { class: "field" }, [ui.el("span", { text: "시작" }), customFrom]),
      ui.el("label", { class: "field" }, [ui.el("span", { text: "끝" }), customTo]),
    ]);

    const weekdayBoxes = dt.WEEKDAY_NAMES.map((name, i) =>
      ui.el("label", { class: "wd-chip" }, [
        ui.el("input", { type: "checkbox", value: String(i), checked: true, onchange: update }),
        ui.el("span", { text: name }),
      ])
    );
    const weekdayRow = ui.el("div", { class: "wd-row", hidden: true }, weekdayBoxes);

    const preview = ui.el("p", { class: "paste-preview" });

    function currentRange() {
      if (range.type !== "custom") return range;
      return { type: "custom", from: customFrom.value || baseKey, to: customTo.value || baseKey };
    }

    function currentFilter() {
      if (filter.type !== "custom") return filter;
      const days = weekdayBoxes
        .map((box) => (box.querySelector("input").checked ? Number(box.querySelector("input").value) : -1))
        .filter((n) => n >= 0);
      return { type: "custom", days };
    }

    function targets() {
      return clip.resolveTargetDates(currentRange(), currentFilter(), baseKey);
    }

    function update() {
      customRow.hidden = range.type !== "custom";
      weekdayRow.hidden = filter.type !== "custom";
      preview.textContent = "총 " + targets().length + "일에 적용됩니다.";
    }

    function chipGroup(options, getActive, onPick) {
      const group = ui.el("div", { class: "chip-group" });
      options.forEach((opt) => {
        const chip = ui.el("button", {
          class: "chip", text: opt.label,
          onclick: () => {
            onPick(opt.value);
            [...group.children].forEach((c) => c.classList.remove("chip-on"));
            chip.classList.add("chip-on");
            update();
          },
        });
        if (getActive() === opt.value) chip.classList.add("chip-on");
        group.appendChild(chip);
      });
      return group;
    }

    customFrom.addEventListener("change", update);
    customTo.addEventListener("change", update);

    ui.openSheet({
      title: "붙여넣기",
      body: [
        ui.el("p", { class: "paste-source", text: clip.describeClip(state.clipboard) }),
        ui.el("h3", { class: "sheet-sub", text: "범위" }),
        chipGroup(
          [
            { label: "이 날", value: "day" }, { label: "이번 주", value: "week" },
            { label: "이번 달", value: "month" }, { label: "올해", value: "year" },
            { label: "직접 선택", value: "custom" },
          ],
          () => range.type,
          (v) => { range = { type: v }; }
        ),
        customRow,
        ui.el("h3", { class: "sheet-sub", text: "요일" }),
        chipGroup(
          [
            { label: "전체", value: "all" }, { label: "평일만", value: "weekday" },
            { label: "주말만", value: "weekend" }, { label: "직접 선택", value: "custom" },
          ],
          () => filter.type,
          (v) => { filter = { type: v }; }
        ),
        weekdayRow,
        ui.el("h3", { class: "sheet-sub", text: "기존 계획" }),
        chipGroup(
          [
            { label: "덮어쓰기", value: "overwrite" },
            { label: "겹치지 않는 것만 추가", value: "merge" },
            { label: "계획 있는 날 건너뛰기", value: "skip" },
          ],
          () => mode,
          (v) => { mode = v; }
        ),
        preview,
      ],
      actions: [
        ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "붙여넣기", onclick: () => {
          const keys = targets();
          if (keys.length === 0) { ui.toast("대상 날짜가 없습니다."); return; }
          const result = clip.paste(state, state.clipboard, keys, mode);
          afterMutation(onDone);
          const parts = [result.applied + "일 적용"];
          if (result.skipped) parts.push(result.skipped + "일 건너뜀");
          if (result.skippedBlocks) parts.push("겹친 블록 " + result.skippedBlocks + "개 제외");
          ui.toast(parts.join(" · "));
        } }),
      ],
    });
    update();
  }

  /* ---------- 하루 메뉴 ---------- */

  function dayMenu(dateKey, onDone) {
    const state = SP.app.state();

    function copyDay() {
      const result = clip.copyDay(state, dateKey);
      if (!result) { ui.toast("복사할 계획이 없습니다."); return; }
      state.clipboard = result;
      SP.app.persist();
      ui.closeSheet();
      ui.toast("이 날 계획을 복사했습니다.");
    }

    function copyWeek() {
      const result = clip.copyWeek(state, dateKey);
      if (!result) { ui.toast("이 주에 복사할 계획이 없습니다."); return; }
      state.clipboard = result;
      SP.app.persist();
      ui.closeSheet();
      ui.toast("이 주 계획을 복사했습니다.");
    }

    async function resetDay() {
      ui.closeSheet();
      const ok = await ui.confirmDialog("이 날의 할 일, 시간 블록, 성취도, 메모를 모두 지웁니다.\n일정은 지워지지 않습니다.");
      if (!ok) return;
      SP.app.store().setDay(dateKey, { todos: [], blocks: [], achievement: 0, memo: "" });
      SP.app.persist();
      if (onDone) onDone();
      ui.toast("초기화했습니다.");
    }

    ui.openSheet({
      title: dt.formatDateKorean(dateKey),
      body: [
        ui.el("p", { class: "paste-source", text: clip.describeClip(state.clipboard) }),
        ui.el("div", { class: "menu" }, [
          ui.el("button", { class: "menu-item", text: "이 날 복사", onclick: copyDay }),
          ui.el("button", { class: "menu-item", text: "이 주 복사", onclick: copyWeek }),
          ui.el("button", { class: "menu-item", text: "여기에 붙여넣기", onclick: () => { ui.closeSheet(); pasteSheet(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "일정 추가", onclick: () => { ui.closeSheet(); eventEditor(dateKey, null, onDone); } }),
          // 사전이 모으는 할 일은 날짜와 무관하지만, 거기서 고른 것을 넣을 곳은
          // 이 날짜다. 그래서 날짜를 함께 넘긴다.
          ui.el("button", { class: "menu-item", text: "사전", onclick: () => { ui.closeSheet(); SP.dictsheet.open(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "설정", onclick: () => { ui.closeSheet(); settings(onDone); } }),
          ui.el("button", { class: "menu-item menu-danger", text: "하루 초기화", onclick: resetDay }),
        ]),
      ],
    });
  }

  /* ---------- 설정 ---------- */

  function settings(onDone) {
    const state = SP.app.state();

    function subjectRow(subject) {
      // 과목을 고치면 시트 아래 화면의 태그 색·이름도 즉시 따라가야 한다.
      // onDone을 부르지 않으면 다른 화면으로 갔다 돌아올 때까지 옛 색이 남는다.
      const nameInput = ui.el("input", { type: "text", value: subject.name, maxlength: "12",
        onchange: (e) => {
          subjectsApi.updateSubject(state, subject.id, { name: e.target.value });
          SP.app.persist();
          if (onDone) onDone();
        } });
      const colorInput = ui.el("input", { type: "color", value: subject.color,
        onchange: (e) => {
          subjectsApi.updateSubject(state, subject.id, { color: e.target.value });
          SP.app.persist();
          if (onDone) onDone();
        } });
      const removeBtn = ui.el("button", { class: "icon-btn", text: "🗑", "aria-label": "삭제", onclick: async () => {
        const count = subjectsApi.countReferences(state, subject.id);
        ui.closeSheet();
        const ok = await ui.confirmDialog(
          "'" + subject.name + "' 과목을 삭제합니다.\n" +
          (count > 0 ? count + "개 항목이 '과목 없음'이 됩니다." : "사용 중인 항목은 없습니다."));
        if (!ok) { settings(onDone); return; }
        subjectsApi.removeSubject(state, subject.id);
        SP.app.persist();
        if (onDone) onDone();
        settings(onDone);
      } });
      return ui.el("div", { class: "subject-row" }, [colorInput, nameInput, removeBtn]);
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = ui.el("a", { href: url, download: "study-planner-" + SP.app.today() + ".json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const fileInput = ui.el("input", { type: "file", accept: "application/json", class: "hidden-file",
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          let parsed = null;
          try { parsed = JSON.parse(reader.result); }
          catch (_) { ui.toast("JSON 파일을 읽을 수 없습니다."); return; }
          const result = storeApi.sanitizeState(parsed);
          // 파싱은 됐지만 이 앱의 백업 파일이 아니면 통째로 기본값이 된다. 그대로
          // 진행하면 학생이 파일을 잘못 골랐을 때 한 학기 기록이 빈 상태로 덮이고
          // "불러왔습니다"라고 뜬다. 되돌릴 수 없으므로 여기서 막는다.
          const empty = Object.keys(result.state.days).length === 0 && result.state.events.length === 0;
          if (result.recovered || empty) {
            ui.toast("이 앱의 백업 파일이 아닙니다. 불러오지 않았습니다.");
            return;
          }
          ui.closeSheet();
          const ok = await ui.confirmDialog("현재 기기의 계획을 파일 내용으로 완전히 교체합니다.\n되돌릴 수 없습니다.");
          if (!ok) { settings(onDone); return; }
          const target = SP.app.state();
          target.settings = result.state.settings;
          target.days = result.state.days;
          target.events = result.state.events;
          target.clipboard = result.state.clipboard;
          SP.app.persist();
          if (onDone) onDone();
          ui.toast("불러왔습니다.");
        };
        reader.readAsText(file);
      } });

    ui.openSheet({
      title: "설정",
      body: [
        ui.el("h3", { class: "sheet-sub", text: "과목" }),
        state.settings.subjects.length
          ? ui.el("div", { class: "subject-list" }, state.settings.subjects.map(subjectRow))
          : ui.el("p", { class: "empty", text: "과목은 없어도 됩니다. 자주 쓰는 것만 만들어 두세요." }),
        ui.el("button", { class: "btn add-btn", text: "+ 과목 추가", onclick: () => {
          subjectsApi.addSubject(state, "새 과목", subjectsApi.nextColor(state.settings.subjects));
          SP.app.persist();
          if (onDone) onDone();
          settings(onDone);
        } }),
        ui.el("h3", { class: "sheet-sub", text: "백업" }),
        ui.el("p", { class: "empty", text: "이 기기에만 저장됩니다. 기기를 바꾸기 전에 반드시 내보내세요." }),
        ui.el("div", { class: "backup-row" }, [
          ui.el("button", { class: "btn", text: "JSON 내보내기", onclick: exportJson }),
          ui.el("button", { class: "btn", text: "JSON 불러오기", onclick: () => fileInput.click() }),
        ]),
        fileInput,
      ],
    });
  }

  const api = { dayMenu, eventEditor, pasteSheet, settings };
  SP.sheets = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
