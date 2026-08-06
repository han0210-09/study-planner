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

  /* ---------- 자동으로 짜기 ---------- */

  // 시간 안 잡은 할 일을 빈 시간에 앉힌다. 넣기 전에 무엇이 어디로 가는지
  // 보여준다 - 눌렀더니 시간표가 통째로 바뀌어 있으면 되돌릴 방법을 먼저
  // 찾게 된다.
  function autoPlan(dateKey, onDone) {
    const state = SP.app.state();
    const autoApi = SP.auto;

    // 오늘이면 지금 시각부터. 이미 지나간 시간에 계획을 넣어봐야 소용없다.
    function defaultFrom() {
      if (dateKey !== SP.app.today()) return 540; // 09:00
      const now = new Date();
      let m = now.getHours() * 60 + now.getMinutes();
      if (now.getHours() < dt.DAY_BOUNDARY_HOUR) m += 1440;
      return dt.clampToDay(Math.ceil(m / dt.SLOT) * dt.SLOT);
    }

    let from = defaultFrom();
    let to = 1380; // 23:00
    let each = autoApi.DEFAULT_CHUNK;

    const preview = ui.el("div", { class: "plan-preview" });
    let planned = { blocks: [], skipped: [] };

    function compute() {
      const day = SP.app.store().getDay(dateKey);
      planned = autoApi.plan(day, state.events, dateKey, {
        from, to, each,
        subjectName: (id) => subjectsApi.nameOf(state.settings.subjects, id),
      });
      paint();
    }

    function paint() {
      ui.clear(preview);
      if (planned.blocks.length === 0) {
        preview.appendChild(ui.el("p", { class: "empty",
          text: autoApi.unplaced(SP.app.store().getDay(dateKey)).length === 0
            ? "시간을 안 잡은 할 일이 없습니다."
            : "이 시간대에는 넣을 자리가 없습니다." }));
        return;
      }
      preview.appendChild(ui.el("ul", { class: "plan-list" }, planned.blocks.map((b) =>
        ui.el("li", { class: "plan-row" }, [
          ui.el("span", { class: "plan-when",
            text: dt.minutesToLabel(b.start) + "~" + dt.minutesToLabel(b.end) }),
          ui.el("span", { class: "plan-what", text: b.text }),
        ]))));
      if (planned.skipped.length) {
        preview.appendChild(ui.el("p", { class: "empty",
          text: "자리가 없어 못 넣음: " + planned.skipped.map((t) => t.text).join(", ") }));
      }
    }

    const timeField = (label, get, set) => {
      const input = ui.el("input", { type: "time", value: hhmm(get()),
        onchange: (e) => { const v = parseHHMM(e.target.value); if (v !== null) { set(v); compute(); } } });
      return ui.el("label", { class: "field field-inline" }, [ui.el("span", { text: label }), input]);
    };

    const eachSelect = ui.el("select", { class: "subject-select",
      onchange: (e) => { each = Number(e.target.value); compute(); } },
      [30, 50, 60, 90, 120].map((m) =>
        ui.el("option", { value: String(m), text: dt.formatDuration(m), selected: m === each })));

    function apply() {
      if (planned.blocks.length === 0) { ui.toast("넣을 것이 없습니다."); return; }
      let day = SP.app.store().getDay(dateKey);
      for (const b of planned.blocks) {
        const block = { ...b, id: storeApi.newId() };
        day = SP.link.commitBlock(day, block, block.todoId, block.text);
      }
      SP.app.saveDay(dateKey, day);
      ui.closeSheet();
      if (onDone) onDone();
      ui.toast(planned.blocks.length + "개를 넣었습니다.");
    }

    compute();
    ui.openSheet({
      title: "자동으로 짜기",
      body: [
        ui.el("p", { class: "sheet-sub", text: "시간을 안 잡은 할 일만 넣습니다. 이미 잡아둔 것은 건드리지 않습니다." }),
        ui.el("div", { class: "plan-fields" }, [
          timeField("시작", () => from, (v) => { from = v; }),
          timeField("종료", () => to, (v) => { to = v; }),
          ui.el("label", { class: "field field-inline" }, [ui.el("span", { text: "하나당" }), eachSelect]),
        ]),
        ui.el("p", { class: "sheet-sub", text: "이렇게 들어갑니다" }),
        preview,
      ],
      actions: [
        ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "넣기", onclick: apply }),
      ],
    });
  }

  const hhmm = (m) => dt.minutesToLabel(m);
  function parseHHMM(v) {
    const [h, m] = String(v).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    let out = h * 60 + m;
    // 자정을 넘긴 시각은 다음날로 읽는다. 하루가 05:00 에 시작하기 때문이다.
    if (out < dt.DAY_BOUNDARY_HOUR * 60) out += 1440;
    return dt.clampToDay(out);
  }

  /* ---------- 일정 예시와 주고받기 ---------- */

  // 서버가 없으므로 "공유"는 코드를 주고받는 것이다. 내 하루를 글자 한 덩이로
  // 바꿔 보내면, 받은 사람이 붙여넣어 자기 날짜에 얹는다.
  function planLibrary(dateKey, onDone) {
    const tpl = SP.templates;

    function put(blocks, what) {
      if (blocks.length === 0) { ui.toast("겹치지 않는 자리가 없습니다."); return; }
      const day = SP.app.store().getDay(dateKey);
      SP.app.saveDay(dateKey, { todos: day.todos, blocks: day.blocks.concat(blocks) });
      ui.closeSheet();
      if (onDone) onDone();
      ui.toast(what + " " + blocks.length + "개를 넣었습니다.");
    }

    function useTemplate(t) {
      put(tpl.toBlocks(t, SP.app.store().getDay(dateKey).blocks, storeApi.newId), t.name + " 에서");
    }

    // 겹쳐서 버려질 것이 몇 개인지 미리 알려준다. 넣고 나서 세 개가 사라진
    // 것을 알아채면 어디가 잘못됐는지 되짚어야 한다.
    function describe(t) {
      const fits = tpl.toBlocks(t, SP.app.store().getDay(dateKey).blocks, storeApi.newId).length;
      const range = dt.minutesToLabel(Math.min(...t.blocks.map((b) => b.start))) + "~" +
        dt.minutesToLabel(Math.max(...t.blocks.map((b) => b.end)));
      if (fits === t.blocks.length) return range + " · " + fits + "개";
      return range + " · " + fits + "개 (겹치는 " + (t.blocks.length - fits) + "개는 빼고)";
    }

    const codeBox = ui.el("textarea", { class: "code-box", rows: "3", readonly: "readonly",
      "aria-label": "내 하루 코드" });

    function myCode() {
      const day = SP.app.store().getDay(dateKey);
      if (day.blocks.length === 0) return "";
      return tpl.encode(dt.formatDateKorean(dateKey), day.blocks.map((b) => ({
        start: b.start, end: b.end,
        text: [subjectsApi.nameOf(SP.app.state().settings.subjects, b.subjectId), b.text]
          .filter(Boolean).join(" · "),
      })));
    }

    async function shareMine() {
      const code = codeBox.value;
      if (!code) { ui.toast("이 날에 넣을 것이 없습니다."); return; }
      if (navigator.share) {
        try { await navigator.share({ text: code }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      try { await navigator.clipboard.writeText(code); ui.toast("코드를 복사했습니다."); }
      catch (e) { codeBox.select(); ui.toast("길게 눌러 복사하세요."); }
    }

    const inBox = ui.el("textarea", { class: "code-box", rows: "3",
      placeholder: "받은 코드를 여기에 붙여넣으세요", "aria-label": "받은 코드" });

    function takeIn() {
      const got = SP.templates.decode(inBox.value);
      if (!got) { ui.toast("코드를 읽을 수 없습니다."); return; }
      put(tpl.toBlocks({ name: got.name, blocks: got.blocks.map((b) => ({ ...b, subject: null })) },
        SP.app.store().getDay(dateKey).blocks, storeApi.newId), got.name + " 에서");
    }

    codeBox.value = myCode();

    ui.openSheet({
      title: "일정 가져오기",
      body: [
        ui.el("p", { class: "sheet-sub", text: "예시에서 가져오기" }),
        ui.el("div", { class: "tpl-list" }, tpl.BUILT_IN.map((t) =>
          ui.el("button", { class: "tpl-item", type: "button", onclick: () => useTemplate(t) }, [
            ui.el("span", { class: "tpl-name", text: t.name }),
            ui.el("span", { class: "tpl-note", text: t.note }),
            ui.el("span", { class: "tpl-when", text: describe(t) }),
          ]))),

        ui.el("p", { class: "sheet-sub", text: "받은 코드로 가져오기" }),
        inBox,
        ui.el("button", { class: "btn add-btn", type: "button", text: "붙여넣은 코드 넣기", onclick: takeIn }),

        ui.el("p", { class: "sheet-sub", text: "내 하루를 코드로 보내기" }),
        codeBox,
        ui.el("button", { class: "btn add-btn", type: "button", text: "코드 보내기 / 복사", onclick: shareMine }),
        ui.el("p", { class: "empty", text: "서버를 쓰지 않습니다. 이 글자를 그대로 보내면 받은 사람이 붙여넣어 씁니다." }),
      ],
    });
  }

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
        // 자주 누르는 것이 위로 온다. 복사·붙여넣기가 맨 위에 있던 때에는
        // 하루를 짜러 들어와서 그 셋을 지나쳐야 했다.
        ui.el("div", { class: "menu" }, [
          ui.el("button", { class: "menu-item", text: "자동으로 짜기", onclick: () => { ui.closeSheet(); autoPlan(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "일정 가져오기", onclick: () => { ui.closeSheet(); planLibrary(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "집중 화면", onclick: () => { ui.closeSheet(); SP.focus.open(dateKey); } }),
          ui.el("button", { class: "menu-item", text: "일정 추가", onclick: () => { ui.closeSheet(); eventEditor(dateKey, null, onDone); } }),
          // 사전이 모으는 할 일은 날짜와 무관하지만, 거기서 고른 것을 넣을 곳은
          // 이 날짜다. 그래서 날짜를 함께 넘긴다.
          ui.el("button", { class: "menu-item", text: "사전", onclick: () => { ui.closeSheet(); SP.dictsheet.open(dateKey, onDone); } }),
        ]),
        // 무엇이 복사돼 있는지는 붙여넣기 바로 옆에 있어야 읽힌다.
        ui.el("p", { class: "paste-source", text: clip.describeClip(state.clipboard) }),
        ui.el("div", { class: "menu" }, [
          ui.el("button", { class: "menu-item", text: "이 날 복사", onclick: copyDay }),
          ui.el("button", { class: "menu-item", text: "이 주 복사", onclick: copyWeek }),
          ui.el("button", { class: "menu-item", text: "여기에 붙여넣기", onclick: () => { ui.closeSheet(); pasteSheet(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "그림으로 내보내기", onclick: () => { ui.closeSheet(); SP.export.saveImage(dateKey); } }),
          ui.el("button", { class: "menu-item", text: "인쇄", onclick: () => { ui.closeSheet(); SP.export.print(dateKey); } }),
          ui.el("button", { class: "menu-item", text: "설정", onclick: () => { ui.closeSheet(); settings(onDone); } }),
          ui.el("button", { class: "menu-item menu-danger", text: "하루 초기화", onclick: resetDay }),
        ]),
      ],
    });
  }

  /* ---------- 알림 ---------- */

  // 켜고 끄는 곳. 항목마다 따로 끌 수 있다 - "시작할 때만" 이나 "시험 전날만"
  // 처럼 쓰고 싶은 경우가 서로 다르다.
  function notifySection(onDone) {
    const notifyApi = SP.notify;
    const host = ui.el("div", { class: "notify-box" });

    function row(kind) {
      const box = ui.el("input", { type: "checkbox", checked: notifyApi.enabled(kind.id),
        disabled: !notifyApi.settings().on,
        onchange: (e) => { notifyApi.setKind(kind.id, e.target.checked); } });
      return ui.el("label", { class: "notify-row" }, [
        box,
        ui.el("span", { class: "notify-text" }, [
          ui.el("span", { class: "notify-label", text: kind.label }),
          ui.el("span", { class: "notify-note", text: kind.note }),
        ]),
      ]);
    }

    function paint() {
      ui.clear(host);
      if (!notifyApi.supported()) {
        host.appendChild(ui.el("p", { class: "empty", text: "이 브라우저는 알림을 지원하지 않습니다." }));
        return;
      }
      const on = !!notifyApi.settings().on;
      host.appendChild(ui.el("label", { class: "notify-row notify-main" }, [
        ui.el("input", { type: "checkbox", checked: on,
          onchange: async (e) => {
            const got = await notifyApi.setOn(e.target.checked);
            paint();
            if (got && onDone) onDone();
          } }),
        ui.el("span", { class: "notify-text" }, [
          ui.el("span", { class: "notify-label", text: "알림 받기" }),
          // 켜져 있으면 막혔다는 말을 하지 않는다. 둘 다 보이면 어느 쪽이
          // 참인지 알 수 없다. 막혔다는 안내는 못 켠 사람에게만 쓸모가 있다.
          ui.el("span", { class: "notify-note",
            text: on
              ? "이 기기에 알림을 보냅니다."
              : notifyApi.permission() === "denied"
                ? "브라우저에서 막혀 있습니다. 주소창 옆 자물쇠에서 켜 주세요."
                : "이 기기에 알림을 보냅니다." }),
        ]),
      ]));
      for (const kind of notifyApi.KINDS) host.appendChild(row(kind));
      // 안 울리는 경우를 미리 밝혀 둔다. 고장으로 오해하는 편이 더 나쁘다.
      host.appendChild(ui.el("p", { class: "empty",
        text: "앱이 열려 있거나 뒤에 내려가 있는 동안 울립니다. 완전히 닫으면 울리지 않습니다 - 정해진 시각에 브라우저를 깨우려면 서버가 필요한데, 이 앱은 기기 안에서만 돌아갑니다." }));
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        host.appendChild(ui.el("p", { class: "empty",
          text: "아이폰은 홈 화면에 설치해야 알림을 켤 수 있습니다." }));
      }
    }

    paint();
    return host;
  }

  /* ---------- 앱으로 설치 ---------- */

  function installSection() {
    const host = ui.el("div", {});
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (standalone || navigator.standalone) {
      host.appendChild(ui.el("p", { class: "empty", text: "이미 앱으로 설치되어 있습니다." }));
      return host;
    }
    // 크롬은 설치할 수 있을 때 beforeinstallprompt 를 준다. app.js 가 잡아 둔다.
    if (SP.app.installPrompt()) {
      host.appendChild(ui.el("button", { class: "btn add-btn", text: "홈 화면에 설치",
        onclick: async () => { await SP.app.install(); settings(onDoneOf(host)); } }));
      return host;
    }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    host.appendChild(ui.el("p", { class: "empty",
      text: ios
        ? "사파리 아래 공유 버튼 → '홈 화면에 추가' 를 누르세요."
        : "브라우저 메뉴에서 '홈 화면에 추가' 또는 '앱 설치' 를 누르세요." }));
    return host;
  }

  // installSection 은 설정 시트 안에서만 쓰이므로 onDone 을 따로 들고 있지
  // 않다. 다시 그릴 때는 아무것도 하지 않는 함수로 충분하다.
  const onDoneOf = () => undefined;

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
        ui.el("h3", { class: "sheet-sub", text: "계정" }),
        SP.authui.accountSection(onDone),

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
        ui.el("h3", { class: "sheet-sub", text: "알림" }),
        notifySection(onDone),

        ui.el("h3", { class: "sheet-sub", text: "앱으로 설치" }),
        installSection(),

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

  const api = {
    autoPlan, planLibrary, dayMenu, eventEditor, pasteSheet, settings };
  SP.sheets = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
