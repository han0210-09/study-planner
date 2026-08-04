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

  // 블록 뒤에 틈이 있으면 거기서 이어 만들 블록을 돌려준다. 길이는 직전 블록과
  // 같게 잡는다 — 50분씩 연달아 공부하는 식이 가장 흔하고 예측이 된다.
  // 틈이 그보다 좁으면 틈 전체를 쓴다.
  function plusSlotFor(blocks, block) {
    let gapEnd = dt.DAY_END;
    for (const b of blocks) {
      if (b.id === block.id) continue;
      if (b.start >= block.end && b.start < gapEnd) gapEnd = b.start;
    }
    if (gapEnd - block.end < dt.SLOT) return null;
    return { start: block.end, end: Math.min(block.end + (block.end - block.start), gapEnd) };
  }

  const api = { COLS, ROWS, rowColOf, segmentsOf, widestIndex, selectionArgs, plusSlotFor };

  root.SP = root.SP || {};
  root.SP.grid = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
