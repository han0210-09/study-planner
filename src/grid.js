(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  const ROWS = (dt.DAY_END - dt.DAY_START) / 60; // 05:00 ~ 익일 02:00 = 21시간
  const SPAN = dt.DAY_END - dt.DAY_START;        // 하루 전체 분 수

  // 시간이 위에서 아래로 곧게 흐른다. 예전에는 한 행이 한 시간이고 그 안에서
  // 왼쪽에서 오른쪽으로 갔는데, 시간이 한 시간마다 줄바꿈되는 바람에 문제가 많았다.
  // 정각을 걸친 블록은 조각으로 쪼개야 했고, 정각 경계의 손잡이는 줄 끝에 놓여
  // 한 방향으로밖에 못 끌었다. 세로로 펴면 그 전부가 없어진다.
  //
  // 자리는 퍼센트로 준다. 시간당 높이를 바꿔도 계산이 그대로 맞는다.
  function offsetPercent(minutes) {
    return ((dt.clampToDay(minutes) - dt.DAY_START) / SPAN) * 100;
  }

  function spanPercent(from, to) {
    return ((dt.clampToDay(to) - dt.clampToDay(from)) / SPAN) * 100;
  }

  // 세로 위치(0~1)가 가리키는 시각. 5분 칸의 시작으로 내림한다.
  function minutesAt(ratio) {
    const raw = dt.DAY_START + ratio * SPAN;
    const snapped = dt.DAY_START + Math.floor((raw - dt.DAY_START) / dt.SLOT) * dt.SLOT;
    return dt.clampToDay(snapped);
  }

  // store.limitRange 는 분 단위 경계로만 판단한다. 그 계약을 바꾸지 않고
  // "칸 단위 선택"을 얻으려면 넘기는 인자를 여기서 보정한다.
  //
  // 아래로 끌 때 cursor 에 +5 를 주는 이유: 커서가 놓인 칸 자체를 결과에
  // 포함시키려면 그 칸의 끝을 넘겨야 한다. 위로 끌 때는 anchor 쪽이 그렇다.
  function selectionArgs(anchorMin, cursorMin) {
    return cursorMin >= anchorMin
      ? { anchor: anchorMin, cursor: cursorMin + dt.SLOT }
      : { anchor: anchorMin + dt.SLOT, cursor: cursorMin };
  }

  // 경계를 맞대고 있는 이웃 블록. 시작 쪽이면 바로 위에서 끝나는 블록,
  // 끝 쪽이면 바로 아래에서 시작하는 블록이다.
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

  const api = {
    ROWS, SPAN, offsetPercent, spanPercent, minutesAt,
    selectionArgs, neighborAt, boundaryRange, resizeAt,
  };

  root.SP = root.SP || {};
  root.SP.grid = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
