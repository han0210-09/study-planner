(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  // 복사본에 done: false를 명시한다. materialize()가 어차피 false로 덮지만,
  // 페이로드만 봐도 "계획만 복사하고 완료 체크는 가져가지 않는다"가 드러나야 한다.
  function cloneTodos(todos) {
    return (todos || []).map((t) => ({ subjectId: t.subjectId || null, text: t.text, done: false }));
  }

  // 페이로드에는 id 를 담지 않는다. 붙여넣을 때 id 가 전부 새로 발급되므로
  // 연결은 위치 색인으로 옮긴다. todoId 를 그대로 담으면 붙여넣은 블록이
  // 원본 날짜의 할 일을 가리켜 완료 체크가 엉뚱한 날에 반영된다.
  function cloneBlocks(blocks, todos) {
    const index = new Map((todos || []).map((t, i) => [t.id, i]));
    return (blocks || []).map((b) => ({
      subjectId: b.subjectId || null, text: b.text || "", start: b.start, end: b.end, done: false,
      todoIndex: index.has(b.todoId) ? index.get(b.todoId) : -1,
    }));
  }

  function materialize(payload) {
    const todos = (payload.todos || []).map((t) => ({
      id: store.newId(), subjectId: t.subjectId || null, text: t.text, done: false,
    }));
    const blocks = (payload.blocks || []).map((b) => {
      const linked = typeof b.todoIndex === "number" && b.todoIndex >= 0 ? todos[b.todoIndex] : null;
      return {
        id: store.newId(), subjectId: b.subjectId || null, text: b.text || "",
        start: b.start, end: b.end, done: false, todoId: linked ? linked.id : null,
      };
    });
    return { todos, blocks };
  }

  function copyDay(state, key) {
    const day = state.days[key];
    if (!day || store.isDayEmpty(day)) return null;
    if (day.todos.length === 0 && day.blocks.length === 0) return null;
    return {
      kind: "day", copiedAt: Date.now(),
      payload: { todos: cloneTodos(day.todos), blocks: cloneBlocks(day.blocks, day.todos) },
    };
  }

  function weekStart(key) {
    return dt.addDays(key, -dt.weekdayOf(key));
  }

  function copyWeek(state, anchorKey) {
    const start = weekStart(anchorKey);
    const byWeekday = {};
    let found = false;
    for (let i = 0; i < 7; i++) {
      const key = dt.addDays(start, i);
      const day = state.days[key];
      if (!day || (day.todos.length === 0 && day.blocks.length === 0)) continue;
      byWeekday[String(dt.weekdayOf(key))] = { todos: cloneTodos(day.todos), blocks: cloneBlocks(day.blocks, day.todos) };
      found = true;
    }
    if (!found) return null;
    return { kind: "week", copiedAt: Date.now(), payload: { byWeekday } };
  }

  function rangeBounds(range, baseKey) {
    const type = range && range.type;
    if (type === "day") return [baseKey, baseKey];
    if (type === "week") {
      const start = weekStart(baseKey);
      return [start, dt.addDays(start, 6)];
    }
    if (type === "month") {
      const d = dt.parseDateKey(baseKey);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [dt.dateKey(first), dt.dateKey(last)];
    }
    if (type === "year") {
      const y = dt.parseDateKey(baseKey).getFullYear();
      return [y + "-01-01", y + "-12-31"];
    }
    let from = range && range.from ? range.from : baseKey;
    let to = range && range.to ? range.to : baseKey;
    if (to < from) [from, to] = [to, from];
    return [from, to];
  }

  function allowsWeekday(filter, weekday) {
    const type = (filter && filter.type) || "all";
    if (type === "all") return true;
    if (type === "weekday") return weekday >= 1 && weekday <= 5;
    if (type === "weekend") return weekday === 0 || weekday === 6;
    return Array.isArray(filter.days) && filter.days.indexOf(weekday) !== -1;
  }

  function resolveTargetDates(range, filter, baseKey) {
    const [from, to] = rangeBounds(range, baseKey);
    const result = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard < 4000) {
      if (allowsWeekday(filter, dt.weekdayOf(cursor))) result.push(cursor);
      cursor = dt.addDays(cursor, 1);
      guard++;
    }
    return result;
  }

  function payloadFor(clip, key) {
    if (clip.kind === "day") return clip.payload;
    const bucket = clip.payload.byWeekday[String(dt.weekdayOf(key))];
    return bucket || null;
  }

  function paste(state, clip, targetKeys, mode) {
    const result = { applied: 0, skipped: 0, skippedBlocks: 0 };
    if (!clip || !Array.isArray(targetKeys) || targetKeys.length === 0) return result;

    for (const key of targetKeys) {
      const payload = payloadFor(clip, key);
      if (!payload) continue;

      const existing = state.days[key] || store.emptyDay();
      const hasPlan = existing.todos.length > 0 || existing.blocks.length > 0;

      if (mode === "skip" && hasPlan) { result.skipped++; continue; }

      const fresh = materialize(payload);
      const next = Object.assign(store.emptyDay(), existing);

      if (mode === "merge") {
        const blocks = existing.blocks.slice();
        for (const block of fresh.blocks) {
          if (store.findOverlap(blocks, block)) { result.skippedBlocks++; continue; }
          blocks.push(block);
        }
        next.blocks = blocks.sort((a, b) => a.start - b.start);
        next.todos = existing.todos.concat(fresh.todos);
      } else {
        next.blocks = fresh.blocks.slice().sort((a, b) => a.start - b.start);
        next.todos = fresh.todos;
      }

      next.updatedAt = Date.now();
      if (store.isDayEmpty(next)) delete state.days[key];
      else state.days[key] = next;
      result.applied++;
    }
    return result;
  }

  function describeClip(clip) {
    if (!clip) return "복사한 계획 없음";
    if (clip.kind === "day") {
      const p = clip.payload;
      return "하루 계획 (할 일 " + p.todos.length + "개, 블록 " + p.blocks.length + "개)";
    }
    return "일주일 계획 (" + Object.keys(clip.payload.byWeekday).length + "개 요일)";
  }

  const api = { copyDay, copyWeek, weekStart, rangeBounds, allowsWeekday, resolveTargetDates, paste, describeClip };

  root.SP = root.SP || {};
  root.SP.clipboard = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
