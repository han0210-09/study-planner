(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  const HOUR_PX = 56;
  const SPAN = dt.DAY_END - dt.DAY_START;
  const LONG_PRESS_MS = 300;
  const MOVE_TOLERANCE = 8;

  function yToMinutes(clientY, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    return dt.clampToDay(dt.snapToSlot(dt.DAY_START + ratio * SPAN));
  }

  function pct(minutes) {
    return ((minutes - dt.DAY_START) / SPAN) * 100;
  }

  function blocksOf(dateKey) {
    return SP.app.store().getDay(dateKey).blocks;
  }

  function saveBlocks(dateKey, blocks) {
    SP.app.store().setDay(dateKey, { blocks: blocks.slice().sort((a, b) => a.start - b.start) });
    SP.app.persist();
  }

  function openBlockEditor(dateKey, blockId, onChange) {
    const state = SP.app.state();
    const blocks = blocksOf(dateKey);
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
    // 30분 블록도 트랙에서는 28px밖에 안 된다. 짧은 블록의 ✓를 손가락으로 정확히
    // 누르기는 어려우므로, 편집 시트에서도 완료를 바꿀 수 있어야 한다.
    const doneInput = ui.el("input", { type: "checkbox", checked: block.done });

    ui.openSheet({
      title: "시간 블록",
      body: [
        ui.el("div", { class: "editor-range" }, [rangeLabel, durationLabel]),
        stepper("시작", "start"),
        stepper("종료", "end"),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "내용" }), textInput]),
        ui.el("label", { class: "editor-done" }, [doneInput, ui.el("span", { text: "이 시간 공부 완료" })]),
      ],
      actions: [
        ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
          saveBlocks(dateKey, blocks.filter((b) => b.id !== blockId));
          ui.closeSheet(); onChange();
        } }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: () => {
          const next = { ...block, start, end, subjectId: select.value || null,
            text: textInput.value.trim(), done: doneInput.checked };
          const check = storeApi.validateBlock(next);
          if (!check.ok) { ui.toast(check.error); return; }
          if (storeApi.findOverlap(blocks, next, blockId)) { ui.toast("다른 블록과 겹칩니다."); return; }
          saveBlocks(dateKey, blocks.map((b) => (b.id === blockId ? next : b)));
          ui.closeSheet(); onChange();
        } }),
      ],
    });
  }

  function attachCreateDrag(track, dateKey, onChange) {
    let timer = null;
    let active = false;
    let anchor = 0;
    let ghost = null;
    let startY = 0;
    let pointerId = null;

    function cleanup() {
      clearTimeout(timer); timer = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (active && pointerId != null && track.hasPointerCapture(pointerId)) {
        track.releasePointerCapture(pointerId);
      }
      // 드래그 중에만 스크롤을 막는다. 평소에는 세로 스크롤이 되어야 한다.
      track.style.touchAction = "";
      active = false;
      pointerId = null;
    }

    function drawGhost(start, end) {
      if (!ghost) {
        ghost = ui.el("div", { class: "tt-ghost" }, [ui.el("span", { class: "tt-ghost-label" })]);
        track.appendChild(ghost);
      }
      ghost.style.top = pct(start) + "%";
      ghost.style.height = ((end - start) / SPAN) * 100 + "%";
      ghost.firstChild.textContent = dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end);
    }

    track.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tt-block")) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      anchor = yToMinutes(e.clientY, track);
      timer = setTimeout(() => {
        active = true;
        track.style.touchAction = "none";
        track.setPointerCapture(pointerId);
        drawGhost(anchor, Math.min(dt.DAY_END, anchor + dt.SLOT));
      }, LONG_PRESS_MS);
    });

    track.addEventListener("pointermove", (e) => {
      if (!active) {
        if (timer && Math.abs(e.clientY - startY) > MOVE_TOLERANCE) { clearTimeout(timer); timer = null; }
        return;
      }
      e.preventDefault();
      const cursor = yToMinutes(e.clientY, track);
      const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor);
      drawGhost(limited.start, Math.max(limited.start + dt.SLOT, limited.end));
    });

    function finish(e) {
      if (!active) { clearTimeout(timer); timer = null; return; }
      const cursor = yToMinutes(e.clientY, track);
      const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor);
      let start = limited.start;
      let end = Math.max(limited.start + dt.SLOT, limited.end);
      if (end > dt.DAY_END) { end = dt.DAY_END; start = Math.min(start, end - dt.SLOT); }
      cleanup();

      const candidate = { id: storeApi.newId(), subjectId: null, text: "", start, end, done: false };
      const check = storeApi.validateBlock(candidate);
      if (!check.ok) { ui.toast(check.error); return; }
      if (storeApi.findOverlap(blocksOf(dateKey), candidate)) { ui.toast("다른 블록과 겹칩니다."); return; }

      const blocks = blocksOf(dateKey).concat([candidate]);
      saveBlocks(dateKey, blocks);
      onChange();
      openBlockEditorOrRollback(dateKey, candidate.id, onChange);
    }

    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", () => cleanup());
  }

  // 새로 만든 블록의 편집 시트를 취소로 닫으면 그 빈 블록을 되돌린다.
  function openBlockEditorOrRollback(dateKey, blockId, onChange) {
    const before = blocksOf(dateKey).find((b) => b.id === blockId);
    let committed = false;
    openBlockEditor(dateKey, blockId, () => { committed = true; onChange(); });
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

  function attachResize(handle, dateKey, blockId, edge, onChange) {
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const track = handle.closest(".tt-track");
      handle.setPointerCapture(e.pointerId);
      const block = blocksOf(dateKey).find((b) => b.id === blockId);
      if (!block) return;

      function onMove(ev) {
        ev.preventDefault();
        const cursor = yToMinutes(ev.clientY, track);
        const anchor = edge === "start" ? block.end : block.start;
        const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor, blockId);
        const start = Math.min(limited.start, limited.end);
        const end = Math.max(limited.start, limited.end);
        if (end - start < dt.SLOT) return;
        const node = handle.parentElement;
        node.style.top = pct(start) + "%";
        node.style.height = ((end - start) / SPAN) * 100 + "%";
        node.dataset.start = start;
        node.dataset.end = end;
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const node = handle.parentElement;
        const start = Number(node.dataset.start);
        const end = Number(node.dataset.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || (start === block.start && end === block.end)) { onChange(); return; }
        const next = { ...block, start, end };
        if (!storeApi.validateBlock(next).ok || storeApi.findOverlap(blocksOf(dateKey), next, blockId)) {
          ui.toast("여기에는 놓을 수 없습니다."); onChange(); return;
        }
        saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === blockId ? next : b)));
        onChange();
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function blockNode(dateKey, block, subjects, onChange) {
    const color = subjectsApi.colorOf(subjects, block.subjectId);
    const label = [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";

    const node = ui.el("div", {
      class: "tt-block" + (block.done ? " tt-block-done" : ""),
      dataset: { id: block.id, start: block.start, end: block.end },
      style: { top: pct(block.start) + "%", height: ((block.end - block.start) / SPAN) * 100 + "%", background: color },
    }, [
      ui.el("button", {
        class: "tt-check", "aria-label": "완료 토글", text: block.done ? "✓" : "",
        onclick: (e) => {
          e.stopPropagation();
          saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === block.id ? { ...b, done: !b.done } : b)));
          onChange();
        },
      }),
      ui.el("button", {
        class: "tt-body", onclick: () => openBlockEditor(dateKey, block.id, onChange),
      }, [
        ui.el("span", { class: "tt-label", text: label }),
        ui.el("span", { class: "tt-time", text: dt.minutesToLabel(block.start) + "~" + dt.minutesToLabel(block.end) }),
      ]),
      ui.el("div", { class: "tt-handle tt-handle-top", "aria-hidden": "true" }),
      ui.el("div", { class: "tt-handle tt-handle-bottom", "aria-hidden": "true" }),
    ]);

    attachResize(node.querySelector(".tt-handle-top"), dateKey, block.id, "start", onChange);
    attachResize(node.querySelector(".tt-handle-bottom"), dateKey, block.id, "end", onChange);
    return node;
  }

  function nowLine(dateKey) {
    if (dateKey !== SP.app.today()) return null;
    const now = new Date();
    let minutes = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) minutes += 1440;
    if (minutes < dt.DAY_START || minutes > dt.DAY_END) return null;
    return ui.el("div", { class: "tt-now", style: { top: pct(minutes) + "%" } });
  }

  function render(host, dateKey, onChange) {
    const subjects = SP.app.state().settings.subjects;
    const blocks = blocksOf(dateKey);

    const hours = [];
    for (let m = dt.DAY_START; m <= dt.DAY_END; m += 60) {
      hours.push(ui.el("div", { class: "tt-hour", style: { top: pct(m) + "%" } }, [
        ui.el("span", { class: "tt-hour-label", text: dt.minutesToLabel(m) }),
      ]));
    }
    const ticks = [];
    for (let m = dt.DAY_START; m <= dt.DAY_END; m += dt.SLOT) {
      if (m % 60 === 0) continue;
      ticks.push(ui.el("div", { class: "tt-tick" + (m % 30 === 0 ? " tt-tick-half" : ""), style: { top: pct(m) + "%" } }));
    }

    const track = ui.el("div", { class: "tt-track", style: { height: (SPAN / 60) * HOUR_PX + "px" } },
      ticks.concat(hours, blocks.map((b) => blockNode(dateKey, b, subjects, onChange)), [nowLine(dateKey)].filter(Boolean))
    );
    attachCreateDrag(track, dateKey, onChange);

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "Timetable" }),
        ui.el("p", { class: "empty", text: "빈 곳을 길게 눌러 아래로 끌면 블록이 만들어집니다. 블록을 누르면 수정됩니다." }),
        track,
      ])
    );
  }

  const api = { render, yToMinutes, openBlockEditor, HOUR_PX };
  SP.timetable = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
