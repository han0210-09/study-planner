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

  const api = { COLS, ROWS, rowColOf, segmentsOf, widestIndex };

  root.SP = root.SP || {};
  root.SP.grid = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
