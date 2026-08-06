(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  // 하루를 자동으로 채운다.
  //
  // 짜는 사람이 정해 주는 것은 "무엇을 할지"뿐이고, "언제 할지"는 매번 빈 칸을
  // 눈으로 찾아 손으로 끌어야 했다. 할 일이 대여섯 개만 되어도 그 일이 계획
  // 자체보다 오래 걸린다. 여기서 하는 일은 그 자리 찾기 하나다.
  //
  // 규칙은 만들어 내지 않았다. 시험이 가까운 과목을 먼저, 이미 잡아둔 것은
  // 건드리지 않고, 길게 이어 앉히되 쉬는 시간을 끼운다 - 이 셋뿐이다.

  const DEFAULT_CHUNK = 50;      // 한 번에 앉히는 길이
  const DEFAULT_BREAK = 10;      // 덩어리 사이에 두는 틈
  const MIN_CHUNK = 20;          // 이보다 짧게 쪼개지 않는다. 앉자마자 일어나게 된다.

  // 이미 잡혀 있는 블록 사이의 빈 자리. 정렬해서 훑는다.
  function gapsOf(blocks, from, to) {
    const start = from === undefined ? dt.DAY_START : from;
    const end = to === undefined ? dt.DAY_END : to;
    const sorted = (blocks || []).slice().sort((a, b) => a.start - b.start);
    const gaps = [];
    let cursor = start;
    for (const b of sorted) {
      if (b.end <= start || b.start >= end) continue;
      if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, end) });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < end) gaps.push({ start: cursor, end });
    return gaps.filter((g) => g.end - g.start >= MIN_CHUNK);
  }

  // 시험이 가까운 것이 먼저다. 일정이 없는 것은 뒤로 보내되, 서로의 순서는
  // 원래 목록 순서를 지킨다 - 이유 없이 뒤섞이면 왜 이 차례인지 설명할 수 없다.
  //
  // 일정에는 과목 칸이 없다. 그래서 일정 제목에 과목 이름이나 할 일 이름이
  // 들어 있는지로 짝을 맞춘다 - "국어 수행평가" 는 국어와 짝이 된다.
  function urgencyOf(events, names, fromKey) {
    const words = (names || []).filter(Boolean);
    if (words.length === 0) return null;
    let best = null;
    for (const e of events || []) {
      if (!e.title || e.endDate < fromKey) continue;
      if (!words.some((w) => e.title.includes(w) || w.includes(e.title))) continue;
      const days = dt.daysBetween(fromKey, e.startDate);
      if (best === null || days < best) best = days;
    }
    return best;
  }

  // subjectName 은 과목 id 를 이름으로 바꾸는 함수다. 이 파일은 과목 목록을
  // 모르므로 부르는 쪽에서 넘긴다.
  function ordered(todos, events, fromKey, subjectName) {
    const nameOf = subjectName || (() => "");
    return (todos || []).map((t, i) => ({ todo: t, i, urgency: urgencyOf(events, [nameOf(t.subjectId), t.text], fromKey) }))
      .sort((a, b) => {
        if (a.urgency === null && b.urgency === null) return a.i - b.i;
        if (a.urgency === null) return 1;
        if (b.urgency === null) return -1;
        return a.urgency - b.urgency || a.i - b.i;
      })
      .map((x) => x.todo);
  }

  // 한 할 일에 줄 시간을 덩어리로 쪼갠다. 두 시간을 통째로 앉히면 아무도
  // 안 지킨다. chunk 마다 쉬는 틈을 두되, 마지막 덩어리 뒤에는 두지 않는다.
  function place(gaps, minutes, chunk, gap) {
    const out = [];
    let left = minutes;
    for (const g of gaps) {
      let cursor = g.start;
      while (left >= MIN_CHUNK && g.end - cursor >= MIN_CHUNK) {
        const take = Math.min(chunk, left, g.end - cursor);
        const snapped = Math.floor(take / dt.SLOT) * dt.SLOT;
        if (snapped < MIN_CHUNK) break;
        out.push({ start: cursor, end: cursor + snapped });
        left -= snapped;
        cursor += snapped + gap;
      }
      if (left < MIN_CHUNK) break;
    }
    return { slots: out, left };
  }

  // 이미 블록이 있는 할 일은 건드리지 않는다. 손으로 잡아둔 시간을 자동이
  // 옮기면, 한 번 눌렀다가 어제 짜둔 것이 통째로 흐트러진다.
  function unplaced(day) {
    return (day.todos || []).filter((t) => !(day.blocks || []).some((b) => b.todoId === t.id));
  }

  // 돌려주는 것은 새로 만들 블록의 목록이다. 저장은 부르는 쪽이 한다 -
  // 미리보기를 보여주고 나서 결정하게 하려면 여기서 저장하면 안 된다.
  function plan(day, events, fromKey, options) {
    const o = options || {};
    const chunk = o.chunk || DEFAULT_CHUNK;
    const gap = o.gap === undefined ? DEFAULT_BREAK : o.gap;
    const from = o.from === undefined ? dt.DAY_START : o.from;
    const to = o.to === undefined ? dt.DAY_END : o.to;

    const targets = ordered(unplaced(day), events, fromKey, o.subjectName);
    if (targets.length === 0) return { blocks: [], skipped: [] };

    // 할 일마다 정해진 만큼만 준다. 빈 시간을 할 일 수로 나눠 가지면 세 개를
    // 넣었을 때 하나가 일곱 시간이 되어, 새벽 다섯 시부터 새벽 두 시까지 하루가
    // 통째로 채워진다. 아무도 그렇게 공부하지 않고, 그런 계획은 지켜지지 않는다.
    const each = Math.max(MIN_CHUNK, o.each || DEFAULT_CHUNK);

    let gaps = gapsOf(day.blocks, from, to);
    const made = [];
    const skipped = [];
    for (const todo of targets) {
      const got = place(gaps, each, chunk, gap);
      if (got.slots.length === 0) { skipped.push(todo); continue; }
      for (const s of got.slots) {
        made.push({ subjectId: todo.subjectId || null, text: todo.text, todoId: todo.id,
          start: s.start, end: s.end, done: false });
      }
      // 다음 할 일은 방금 앉힌 것을 피해 자리를 찾는다. 방금 앉힌 것의 뒤에
      // 쉬는 틈을 붙여서 잰다 - 안 그러면 국어가 끝나는 그 분에 수학이 시작해,
      // 덩어리 안에는 쉬는 시간이 있는데 할 일 사이에는 없는 이상한 표가 된다.
      const padded = made.map((b) => ({ ...b, end: Math.min(to, b.end + gap) }));
      gaps = gapsOf((day.blocks || []).concat(padded), from, to);
    }
    made.sort((a, b) => a.start - b.start);
    return { blocks: made, skipped };
  }

  const api = { DEFAULT_CHUNK, DEFAULT_BREAK, MIN_CHUNK, gapsOf, ordered, place, unplaced, plan };

  root.SP = root.SP || {};
  root.SP.auto = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
