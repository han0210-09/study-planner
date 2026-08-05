(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  const COLS = 60 / dt.SLOT;                     // 한 행 = 한 시간 = 12칸
  const ROWS = (dt.DAY_END - dt.DAY_START) / 60; // 05:00 ~ 익일 02:00 = 21행

  function rowColOf(minutes) {
    const offset = dt.clampToDay(minutes) - dt.DAY_START;
    return { row: Math.floor(offset / 60), col: (offset % 60) / dt.SLOT };
  }

  // 블록 하나가 시각 경계를 넘으면 행마다 조각으로 쪼개진다. 05:50~06:20 은
  // 05행 10~11칸 + 06행 0~3칸 두 조각이다.
  //
  // 정각에 끝나는 블록에 빈 조각을 붙이면 안 된다. 06:00~07:00 은 조각이 1개고,
  // 07행에 span 0 짜리가 붙으면 그 행이 통째로 물들어 보인다. 그래서 경계 판정을
  // `cursor < end` 로 한다 — `<=` 로 바꾸면 바로 그 버그가 난다.
  function segmentsOf(start, end) {
    const segs = [];
    let cursor = start;
    while (cursor < end) {
      const rowStart = dt.DAY_START + Math.floor((cursor - dt.DAY_START) / 60) * 60;
      const segEnd = Math.min(end, rowStart + 60);
      segs.push({
        row: (rowStart - dt.DAY_START) / 60,
        col: (cursor - rowStart) / dt.SLOT,
        span: (segEnd - cursor) / dt.SLOT,
        start: cursor,
        end: segEnd,
      });
      cursor = segEnd;
    }
    return segs;
  }

  // 라벨은 가장 넓은 조각이 맡는다. 첫 조각에 넣으면 05:55~08:00 처럼 첫 조각이
  // 한 칸(약 25px)인 블록에서 글자가 통째로 잘린다.
  function widestIndex(segments) {
    let best = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].span > segments[best].span) best = i;
    }
    return best;
  }

  // store.limitRange 는 분 단위 경계로만 판단한다. 그 계약을 바꾸지 않고
  // 격자의 "칸 단위 선택"을 얻으려면 넘기는 인자를 여기서 보정한다.
  //
  // 뒤로 끌 때 anchor 에 +5 를 주는 이유: limitRange 는 anchor 를 기준으로 블록이
  // 위쪽인지 아래쪽인지 판정한다. anchor 칸 자체를 결과에 포함시키려면 그 칸의
  // 끝을 넘겨야 한다. pointerdown 이 블록 위에서 시작하면 무시되므로 anchor 칸은
  // 항상 비어 있고, 따라서 b.end <= anchor 로 잘못 잡히는 블록은 없다.
  function selectionArgs(anchorMin, cursorMin) {
    return cursorMin >= anchorMin
      ? { anchor: anchorMin, cursor: cursorMin + dt.SLOT }
      : { anchor: anchorMin + dt.SLOT, cursor: cursorMin };
  }

  // 경계를 맞대고 있는 이웃 블록. 시작 쪽이면 바로 앞에서 끝나는 블록,
  // 끝 쪽이면 바로 뒤에서 시작하는 블록이다.
  //
  // 맞닿은 두 블록 사이에는 빈 칸이 없다. 그 경계를 한쪽만 움직이면 틈이
  // 생기거나 겹치므로, 두 블록을 함께 움직여야 한다.
  function neighborAt(blocks, block, edge) {
    const at = edge === "start" ? block.start : block.end;
    for (const b of blocks) {
      if (b.id === block.id) continue;
      if (edge === "start" ? b.end === at : b.start === at) return b;
    }
    return null;
  }

  // 손잡이를 끌 때 경계가 갈 수 있는 범위.
  //
  // 이웃이 붙어 있으면 그 이웃의 반대쪽 모서리까지가 한계다 — 이웃도 최소 5분은
  // 남아야 하므로 SLOT 만큼 물러선다. 이웃이 없으면 빈 칸이 끝나는 곳까지 간다.
  function boundaryRange(blocks, block, edge) {
    const neighbor = neighborAt(blocks, block, edge);
    if (edge === "start") {
      const lo = neighbor
        ? neighbor.start + dt.SLOT
        : blocks.reduce((m, b) => (b.id !== block.id && b.end <= block.start ? Math.max(m, b.end) : m), dt.DAY_START);
      return { min: lo, max: block.end - dt.SLOT, neighbor };
    }
    const hi = neighbor
      ? neighbor.end - dt.SLOT
      : blocks.reduce((m, b) => (b.id !== block.id && b.start >= block.end ? Math.min(m, b.start) : m), dt.DAY_END);
    return { min: block.start + dt.SLOT, max: hi, neighbor };
  }

  // 경계를 t 로 옮겼을 때 바뀌는 블록들. 이웃이 있으면 둘이 함께 나온다.
  // 한쪽이 늘면 다른 쪽이 그만큼 줄어든다.
  function resizeAt(blocks, block, edge, t) {
    const range = boundaryRange(blocks, block, edge);
    const at = Math.max(range.min, Math.min(t, range.max));
    if (at === (edge === "start" ? block.start : block.end)) return null;
    const out = [edge === "start" ? { ...block, start: at } : { ...block, end: at }];
    if (range.neighbor) {
      out.push(edge === "start"
        ? { ...range.neighbor, end: at }
        : { ...range.neighbor, start: at });
    }
    return { at, blocks: out };
  }

  const api = { COLS, ROWS, rowColOf, segmentsOf, widestIndex, selectionArgs, neighborAt, boundaryRange, resizeAt };

  root.SP = root.SP || {};
  root.SP.grid = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
