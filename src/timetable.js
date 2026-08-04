(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const grid = SP.grid;
  const ui = SP.ui;

  // 드래그는 가로로 8px 넘게 끌 때만 시작한다.
  //
  // "길게 누르면 방향 무관"도 넣어봤지만 실제 터치에서는 동작하지 않는다.
  // .tt-cells 의 touch-action: pan-y 를 브라우저는 터치가 시작될 때 한 번만 보고,
  // 세로 팬을 컴포지터에서 바로 처리한다. 길게 누른 뒤 none 으로 바꿔도 이미 늦다.
  // 마우스에는 touch-action 이 적용되지 않아 CDP 로 진짜 터치를 보내기 전까지
  // 이 사실이 드러나지 않았다.
  //
  // 격자를 touch-action: none 으로 두고 세로 스크롤을 직접 굴리면 되게 만들 수는
  // 있지만, 관성과 플릭이 사라져 주 화면 스크롤이 확연히 나빠진다. 그 값을 치를
  // 만한 기능이 아니다.
  //
  // 실제 터치에서는 이 8px 이 최종 관문이 아니다. 브라우저가 자기 슬롭을 넘길
  // 때까지 방향 판정을 보류하다가 애매하면 세로 팬으로 가져가므로, 손가락이
  // 확실히 옆으로 가야(수십 px) 제스처가 우리에게 넘어온다. 그래도 시작 시각은
  // 안 밀린다 — anchor 는 pointerdown 시점에 고정되고 이후 이동은 끝점만 움직인다.
  const MOVE_TOLERANCE = 8;

  // .tt-cells 의 사각형이 곧 데이터 영역이다. 시각 라벨을 같은 격자에 넣지 않고
  // 옆에 따로 둔 이유가 이것 — 라벨 폭을 빼는 보정이 필요 없어진다.
  function pointToMinutes(clientX, clientY, cellsEl) {
    const r = cellsEl.getBoundingClientRect();
    const col = Math.min(grid.COLS - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * grid.COLS)));
    const row = Math.min(grid.ROWS - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * grid.ROWS)));
    return dt.DAY_START + row * 60 + col * dt.SLOT;
  }

  function segStyle(seg) {
    return { gridRow: String(seg.row + 1), gridColumn: (seg.col + 1) + " / span " + seg.span };
  }

  function blocksOf(dateKey) {
    return SP.app.store().getDay(dateKey).blocks;
  }

  function saveBlocks(dateKey, blocks) {
    SP.app.store().setDay(dateKey, { blocks: blocks.slice().sort((a, b) => a.start - b.start) });
    SP.app.persist();
  }

  function openBlockEditor(dateKey, blockId, onChange, isNew) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const blocks = day.blocks;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    let start = block.start;
    let end = block.end;

    const rangeLabel = ui.el("strong", { text: dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end) });
    const durationLabel = ui.el("span", { class: "editor-duration", text: dt.formatDuration(end - start) });

    function redraw() {
      rangeLabel.textContent = dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end);
      durationLabel.textContent = dt.formatDuration(end - start);
    }

    function nudge(which, delta) {
      const next = { ...block, start, end };
      if (which === "start") next.start = dt.clampToDay(start + delta);
      else next.end = dt.clampToDay(end + delta);
      if (next.end - next.start < dt.SLOT) { ui.toast("블록은 최소 5분이어야 합니다."); return; }
      if (storeApi.findOverlap(blocks, next, blockId)) { ui.toast("다른 블록과 겹칩니다."); return; }
      start = next.start; end = next.end;
      redraw();
    }

    const stepper = (label, which) =>
      ui.el("div", { class: "stepper" }, [
        ui.el("span", { class: "stepper-label", text: label }),
        ui.el("button", { class: "btn stepper-btn", text: "−5분", onclick: () => nudge(which, -dt.SLOT) }),
        ui.el("button", { class: "btn stepper-btn", text: "+5분", onclick: () => nudge(which, dt.SLOT) }),
      ]);

    const select = subjectsApi.buildSelect(state.settings.subjects, block.subjectId);
    const textInput = ui.el("input", { type: "text", value: block.text, placeholder: "무엇을 공부하나요?", maxlength: "40" });
    // 조각이 한 칸(약 25px)일 수도 있어 트랙 위의 ✓ 를 손가락으로 정확히 누르기는
    // 어렵다. 편집 시트에서도 완료를 바꿀 수 있어야 한다.
    const doneInput = ui.el("input", { type: "checkbox", checked: block.done });

    // 새 블록은 할 일을 함께 만드는 게 기본이다. 이미 있는 블록은 지금 상태가 기본.
    const initialChoice = block.todoId || (isNew ? "new" : "none");
    const todoSelect = ui.el("select", { class: "subject-select" }, [
      ui.el("option", { value: "new", text: "＋ 새 할 일로 추가", selected: initialChoice === "new" }),
      ...day.todos.map((t) =>
        ui.el("option", { value: t.id, text: t.text, selected: initialChoice === t.id })),
      ui.el("option", { value: "none", text: "할 일과 연결 안 함", selected: initialChoice === "none" }),
    ]);
    // 기존 할 일을 고르면 과목·내용을 그 할 일 값으로 맞춘다. 저장할 때는 화면에
    // 보이는 값이 양쪽에 쓰이므로, 고른 순간 보여줘야 무엇이 저장될지 알 수 있다.
    todoSelect.addEventListener("change", () => {
      const picked = day.todos.find((t) => t.id === todoSelect.value);
      if (!picked) return;
      textInput.value = picked.text;
      select.value = picked.subjectId || "";
    });

    ui.openSheet({
      title: "시간 블록",
      body: [
        ui.el("div", { class: "editor-range" }, [rangeLabel, durationLabel]),
        stepper("시작", "start"),
        stepper("종료", "end"),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "내용" }), textInput]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "할 일" }), todoSelect]),
        ui.el("label", { class: "editor-done" }, [doneInput, ui.el("span", { text: "이 시간 공부 완료" })]),
      ],
      actions: [
        ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
          // 연결된 할 일도 함께 사라진다(그 할 일의 마지막 블록일 때만).
          SP.app.saveDay(dateKey, SP.link.removeBlock(SP.app.store().getDay(dateKey), blockId));
          ui.closeSheet(); onChange();
        } }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: () => {
          const next = { ...block, start, end, subjectId: select.value || null,
            text: textInput.value.trim(), done: doneInput.checked };
          const check = storeApi.validateBlock(next);
          if (!check.ok) { ui.toast(check.error); return; }
          if (storeApi.findOverlap(blocks, next, blockId)) { ui.toast("다른 블록과 겹칩니다."); return; }
          // 빈 할 일이 생기지 않게 하되 새 검증 규칙은 만들지 않는다.
          const todoText = next.text || subjectsApi.nameOf(state.settings.subjects, next.subjectId) || "이름 없음";
          SP.app.saveDay(dateKey,
            SP.link.commitBlock(SP.app.store().getDay(dateKey), next, todoSelect.value, todoText));
          ui.closeSheet(); onChange();
        } }),
      ],
    });
  }

  // 새로 만든 블록의 편집 시트를 취소로 닫으면 그 빈 블록을 되돌린다.
  function openBlockEditorOrRollback(dateKey, blockId, onChange) {
    const before = blocksOf(dateKey).find((b) => b.id === blockId);
    let committed = false;
    openBlockEditor(dateKey, blockId, () => { committed = true; onChange(); }, true);
    const host = document.getElementById("sheet-root");
    const observer = new MutationObserver(() => {
      if (host.childElementCount === 0) {
        observer.disconnect();
        if (!committed && before && !before.text && !before.subjectId) {
          saveBlocks(dateKey, blocksOf(dateKey).filter((b) => b.id !== blockId));
          onChange();
        }
      }
    });
    observer.observe(host, { childList: true });
  }

  function createBlock(dateKey, start, end, onChange) {
    const candidate = { id: storeApi.newId(), subjectId: null, text: "", start, end, done: false, todoId: null };
    const check = storeApi.validateBlock(candidate);
    if (!check.ok) { ui.toast(check.error); return; }
    if (storeApi.findOverlap(blocksOf(dateKey), candidate)) { ui.toast("다른 블록과 겹칩니다."); return; }
    saveBlocks(dateKey, blocksOf(dateKey).concat([candidate]));
    onChange();
    openBlockEditorOrRollback(dateKey, candidate.id, onChange);
  }

  function drawGhost(cells, nodes, start, end) {
    for (const n of nodes) n.remove();
    nodes.length = 0;
    const segs = grid.segmentsOf(start, end);
    for (const seg of segs) {
      const node = ui.el("div", { class: "tt-ghost", style: segStyle(seg) });
      nodes.push(node);
      cells.appendChild(node);
    }
    const w = grid.widestIndex(segs);
    if (nodes[w]) {
      nodes[w].appendChild(ui.el("span", {
        class: "tt-ghost-label", text: dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end),
      }));
    }
  }

  function attachCreateDrag(cells, dateKey, onChange) {
    let active = false;
    let decided = false;
    let anchor = 0;
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let tapPlus = null;
    const ghost = [];

    function cleanup() {
      for (const n of ghost) n.remove();
      ghost.length = 0;
      if (active && pointerId != null && cells.hasPointerCapture(pointerId)) {
        cells.releasePointerCapture(pointerId);
      }
      // 드래그 중에만 스크롤을 막는다. 평소에는 세로 스크롤이 되어야 한다.
      cells.style.touchAction = "";
      active = false; decided = false; pointerId = null; tapPlus = null;
    }

    function begin() {
      active = true; decided = true;
      cells.style.touchAction = "none";
      cells.setPointerCapture(pointerId);
    }

    function rangeAt(cursorMin) {
      const args = grid.selectionArgs(anchor, cursorMin);
      const limited = storeApi.limitRange(blocksOf(dateKey), args.anchor, args.cursor);
      return { start: limited.start, end: Math.max(limited.start + dt.SLOT, limited.end) };
    }

    cells.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tt-seg")) return;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      anchor = pointToMinutes(e.clientX, e.clientY, cells);
      decided = false;
      // ⊕ 위에서 눌렀어도 드래그를 막지 않는다. 그 칸만 드래그 사각지대가 되면
      // 안 되기 때문이다. 탭이었는지 드래그였는지는 손을 뗄 때 가른다.
      tapPlus = e.target.closest(".tt-plus");
    });

    cells.addEventListener("pointermove", (e) => {
      if (!active) {
        if (decided || pointerId === null) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= MOVE_TOLERANCE && dy <= MOVE_TOLERANCE) return;
        // 대각선으로 끌 때는 더 많이 움직인 축이 이긴다. 가로면 선택, 세로면
        // 페이지 스크롤에 넘긴다. 한 번 정하면 번복하지 않는다.
        decided = true;
        if (dx <= dy) return;
        begin();
      }
      e.preventDefault();
      const r = rangeAt(pointToMinutes(e.clientX, e.clientY, cells));
      drawGhost(cells, ghost, r.start, r.end);
    });

    function finish(e) {
      // 드래그가 성립하지 않은 제스처는 탭이다. ⊕ 를 여기서 처리해야 드래그와
      // 탭을 시간창이 아니라 같은 제스처 안의 인과로 가를 수 있다. 시간으로
      // 가르면 직전 드래그 직후의 관계없는 탭까지 삼킨다.
      if (!active) {
        const plus = decided ? null : tapPlus;
        decided = false; tapPlus = null; pointerId = null;
        if (plus) createBlock(dateKey, Number(plus.dataset.start), Number(plus.dataset.end), onChange);
        return;
      }
      const r = rangeAt(pointToMinutes(e.clientX, e.clientY, cells));
      let start = r.start;
      let end = r.end;
      if (end > dt.DAY_END) { end = dt.DAY_END; start = Math.min(start, end - dt.SLOT); }
      cleanup();
      createBlock(dateKey, start, end, onChange);
    }

    cells.addEventListener("pointerup", finish);
    cells.addEventListener("pointercancel", cleanup);
  }

  // 끄는 동안 조각을 직접 재배치하지 않는다. 조각이 여러 개면 고스트 한 벌을
  // 다시 그리는 쪽이 단순하고, 생성 드래그와 미리보기 경로가 하나로 합쳐진다.
  function attachResize(handle, dateKey, blockId, edge, onChange) {
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const cells = handle.closest(".tt-cells");
      const block = blocksOf(dateKey).find((b) => b.id === blockId);
      if (!cells || !block) return;

      handle.setPointerCapture(e.pointerId);
      cells.style.touchAction = "none";
      const owned = [].slice.call(cells.querySelectorAll('.tt-seg[data-id="' + blockId + '"]'));
      for (const n of owned) n.classList.add("tt-seg-dragging");

      const ghost = [];
      let next = null;

      function onMove(ev) {
        ev.preventDefault();
        const cursor = pointToMinutes(ev.clientX, ev.clientY, cells);
        // 고정된 쪽 모서리가 anchor 다. 끝을 끌 때만 커서 칸을 포함시킨다.
        const anchor = edge === "start" ? block.end : block.start;
        const c = edge === "start" ? cursor : cursor + dt.SLOT;
        const limited = storeApi.limitRange(blocksOf(dateKey), anchor, c, blockId);
        const start = Math.min(limited.start, limited.end);
        const end = Math.max(limited.start, limited.end);
        if (end - start < dt.SLOT) return;
        next = { start, end };
        drawGhost(cells, ghost, start, end);
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        for (const n of ghost) n.remove();
        cells.style.touchAction = "";
        if (!next || (next.start === block.start && next.end === block.end)) { onChange(); return; }
        const updated = { ...block, start: next.start, end: next.end };
        if (!storeApi.validateBlock(updated).ok || storeApi.findOverlap(blocksOf(dateKey), updated, blockId)) {
          ui.toast("여기에는 놓을 수 없습니다."); onChange(); return;
        }
        saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === blockId ? updated : b)));
        onChange();
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  // 블록을 잡아 옮긴다. 길이는 그대로 두고 시작 시각만 바꾼다.
  //
  // 진입 조건은 빈 칸 드래그와 같다 — 가로로 끌면 시작하고, 세로로 끌면 페이지
  // 스크롤에 넘긴다. 끌지 않고 떼면 탭이므로 편집 시트를 연다. 드래그와 탭을
  // 시간창이 아니라 같은 제스처 안에서 가른다.
  //
  // 포인터 캡처는 조각(node)에 건다. 조상인 .tt-cells 에 걸면 이벤트가 그쪽으로
  // 재타깃되어 자손인 조각에는 오지 않는다.
  function attachMove(node, dateKey, block, onChange) {
    let active = false;
    let decided = false;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let pointerId = null;
    let cells = null;
    let placed = null;
    const ghost = [];
    const duration = block.end - block.start;

    function owned() {
      return [].slice.call(cells.querySelectorAll('.tt-seg[data-id="' + block.id + '"]'));
    }

    function cleanup() {
      for (const n of ghost) n.remove();
      ghost.length = 0;
      if (cells) {
        for (const n of owned()) n.classList.remove("tt-seg-dragging");
        cells.style.touchAction = "";
      }
      if (active && pointerId != null && node.hasPointerCapture(pointerId)) {
        node.releasePointerCapture(pointerId);
      }
      active = false; decided = false; pointerId = null; placed = null;
    }

    function begin() {
      active = true; decided = true;
      cells.style.touchAction = "none";
      node.setPointerCapture(pointerId);
      for (const n of owned()) n.classList.add("tt-seg-dragging");
    }

    function moveTo(cursorMin) {
      const start = Math.max(dt.DAY_START, Math.min(cursorMin - offset, dt.DAY_END - duration));
      const candidate = { id: block.id, start, end: start + duration };
      // 겹치면 옮기지 않는다. 마지막으로 유효했던 자리를 그대로 둔다.
      if (storeApi.findOverlap(blocksOf(dateKey), candidate, block.id)) return;
      placed = candidate;
      drawGhost(cells, ghost, candidate.start, candidate.end);
    }

    node.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tt-check, .tt-handle")) return;
      cells = node.closest(".tt-cells");
      if (!cells) return;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      offset = pointToMinutes(e.clientX, e.clientY, cells) - block.start;
      decided = false; placed = null;
    });

    node.addEventListener("pointermove", (e) => {
      if (!active) {
        if (decided || pointerId === null) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= MOVE_TOLERANCE && dy <= MOVE_TOLERANCE) return;
        decided = true;
        if (dx <= dy) return;
        begin();
      }
      e.preventDefault();
      moveTo(pointToMinutes(e.clientX, e.clientY, cells));
    });

    node.addEventListener("pointerup", () => {
      if (!active) {
        // 허용치를 넘긴 적이 없으면 탭이다. 세로로 끌어 스크롤한 경우는
        // decided 가 서 있으므로 시트를 열지 않는다.
        const tap = !decided && pointerId !== null;
        decided = false; pointerId = null;
        if (tap) openBlockEditor(dateKey, block.id, onChange);
        return;
      }
      const next = placed;
      cleanup();
      if (!next || next.start === block.start) { onChange(); return; }
      saveBlocks(dateKey, blocksOf(dateKey).map((b) =>
        (b.id === block.id ? { ...b, start: next.start, end: next.end } : b)));
      onChange();
    });

    node.addEventListener("pointercancel", cleanup);
  }

  function blockSegments(dateKey, block, subjects, onChange) {
    const color = subjectsApi.colorOf(subjects, block.subjectId);
    const label = [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";
    const segs = grid.segmentsOf(block.start, block.end);
    const widest = grid.widestIndex(segs);
    const last = segs.length - 1;

    return segs.map((seg, i) => {
      const parts = [];
      if (i === widest) {
        parts.push(ui.el("button", {
          class: "tt-check", "aria-label": "완료 토글", text: block.done ? "✓" : "",
          onclick: (e) => {
            e.stopPropagation();
            SP.app.saveDay(dateKey, SP.link.setBlockDone(SP.app.store().getDay(dateKey), block.id, !block.done));
            onChange();
          },
        }));
        // 포인터로 누른 click 은 무시한다. 그 경로는 attachMove 가 같은 제스처
        // 안에서 처리한다. e.detail === 0 은 키보드(Enter/Space)라는 뜻이다.
        parts.push(ui.el("button", {
          class: "tt-body", type: "button",
          onclick: (e) => { if (e.detail === 0) openBlockEditor(dateKey, block.id, onChange); },
        }, [
          ui.el("span", { class: "tt-label", text: label }),
          ui.el("span", { class: "tt-time", text: dt.minutesToLabel(block.start) + "~" + dt.minutesToLabel(block.end) }),
        ]));
      }
      if (i === 0) parts.push(ui.el("div", { class: "tt-handle tt-handle-start", "aria-hidden": "true" }));
      if (i === last) parts.push(ui.el("div", { class: "tt-handle tt-handle-end", "aria-hidden": "true" }));

      // position 은 인라인으로 준다. .tt-handle 이 absolute 라 기준 상자가 필요하다.
      const node = ui.el("div", {
        class: "tt-seg" + (block.done ? " tt-seg-done" : "") +
          (i === 0 ? " tt-seg-first" : "") + (i === last ? " tt-seg-last" : ""),
        dataset: { id: block.id },
        style: Object.assign(segStyle(seg), { background: color, position: "relative" }),
      }, parts);

      const startHandle = node.querySelector(".tt-handle-start");
      const endHandle = node.querySelector(".tt-handle-end");
      if (startHandle) attachResize(startHandle, dateKey, block.id, "start", onChange);
      if (endHandle) attachResize(endHandle, dateKey, block.id, "end", onChange);
      attachMove(node, dateKey, block, onChange);
      return node;
    });
  }

  // 블록이 끝나는 지점이 곧 틈의 첫 칸이다. ⊕ 를 블록 위가 아니라 틈의 첫 칸에
  // 놓아야 읽는 순서대로 "여기부터 이어서"가 된다.
  function plusNodes(dateKey, blocks, onChange) {
    const nodes = [];
    for (const block of blocks) {
      const slot = grid.plusSlotFor(blocks, block);
      if (!slot) continue;
      const rc = grid.rowColOf(slot.start);
      nodes.push(ui.el("button", {
        class: "tt-plus", type: "button", text: "+",
        "aria-label": dt.minutesToLabel(slot.start) + "부터 이어서 만들기",
        dataset: { start: String(slot.start), end: String(slot.end) },
        style: { gridRow: String(rc.row + 1), gridColumn: String(rc.col + 1) },
        // 포인터로 누른 click 은 무시한다. 그 경로는 attachCreateDrag 의 finish 가
        // 같은 제스처 안에서 처리한다. e.detail === 0 은 키보드(Enter/Space)로
        // 눌렀다는 뜻이고, 그때는 pointer 이벤트가 없으므로 여기서 처리해야 한다.
        onclick: (e) => {
          if (e.detail !== 0) return;
          createBlock(dateKey, slot.start, slot.end, onChange);
        },
      }));
    }
    return nodes;
  }

  function nowMarker(dateKey) {
    if (dateKey !== SP.app.today()) return null;
    const now = new Date();
    let minutes = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) minutes += 1440;
    if (minutes < dt.DAY_START || minutes >= dt.DAY_END) return null;
    const rc = grid.rowColOf(minutes);
    return ui.el("div", { class: "tt-now-row", style: { gridRow: String(rc.row + 1) } }, [
      ui.el("div", { class: "tt-now", style: { left: ((minutes - dt.DAY_START) % 60) / 60 * 100 + "%" } }),
    ]);
  }

  function render(host, dateKey, onChange) {
    const subjects = SP.app.state().settings.subjects;
    const blocks = blocksOf(dateKey);

    const labels = [];
    for (let r = 0; r < grid.ROWS; r++) {
      labels.push(ui.el("div", { class: "tt-label-cell", text: dt.minutesToLabel(dt.DAY_START + r * 60) }));
    }

    const cells = ui.el("div", { class: "tt-cells" });
    for (let r = 0; r < grid.ROWS; r++) {
      cells.appendChild(ui.el("div", { class: "tt-row", style: { gridRow: String(r + 1) } }));
    }
    for (const b of blocks) {
      for (const node of blockSegments(dateKey, b, subjects, onChange)) cells.appendChild(node);
    }
    for (const node of plusNodes(dateKey, blocks, onChange)) cells.appendChild(node);
    const marker = nowMarker(dateKey);
    if (marker) cells.appendChild(marker);

    attachCreateDrag(cells, dateKey, onChange);

    // 합치기는 자동으로 하지 않는다. ⊕ 로 이어 만든 블록이 앞 블록에 흡수되면
    // 나눠 잡은 의도가 사라진다. 합칠 게 있을 때만 버튼을 보여준다.
    const preview = SP.link.mergeAdjacent(SP.app.store().getDay(dateKey));
    const mergeBtn = preview.merged > 0
      ? ui.el("button", {
          class: "btn merge-btn", type: "button",
          text: "같은 내용 합치기 · " + preview.merged + "곳",
          onclick: () => {
            SP.app.saveDay(dateKey, SP.link.mergeAdjacent(SP.app.store().getDay(dateKey)));
            ui.toast(preview.merged + "곳을 합쳤습니다.");
            onChange();
          },
        })
      : null;

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "Timetable" }),
        ui.el("p", { class: "empty", text: "빈 칸을 옆으로 끌면 시간이 잡힙니다. 블록은 잡아서 옮길 수 있습니다." }),
        mergeBtn,
        ui.el("div", { class: "tt-wrap" }, [ui.el("div", { class: "tt-labels" }, labels), cells]),
      ])
    );
  }

  const api = { render, pointToMinutes, openBlockEditor };
  SP.timetable = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
