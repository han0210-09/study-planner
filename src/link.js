(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  function blocksOfTodo(day, todoId) {
    if (!todoId) return [];
    return (day.blocks || []).filter((b) => b.todoId === todoId);
  }

  // 할 일의 완료는 연결된 블록에서 파생된다. 블록이 여럿이면 전부 끝나야 완료다.
  // 블록이 하나도 없는 할 일만 스스로 완료를 갖는다(체크박스로만 바뀐다).
  function recompute(todos, blocks) {
    return todos.map((t) => {
      const own = blocks.filter((b) => b.todoId === t.id);
      return own.length === 0 ? t : { ...t, done: own.every((b) => b.done) };
    });
  }

  function setBlockDone(day, blockId, done) {
    const blocks = day.blocks.map((b) => (b.id === blockId ? { ...b, done } : b));
    return { todos: recompute(day.todos, blocks), blocks };
  }

  function setTodoDone(day, todoId, done) {
    const blocks = day.blocks.map((b) => (b.todoId === todoId ? { ...b, done } : b));
    const todos = day.todos.map((t) => (t.id === todoId ? { ...t, done } : t));
    return { todos, blocks };
  }

  // 블록을 지우면 연결된 할 일도 사라진다. 삭제는 양쪽 대칭이다.
  //
  // 단, 그 할 일의 마지막 블록일 때만이다. 아침·저녁으로 나눠 잡아둔 할 일에서
  // 하나만 지웠는데 할 일까지 지워버리면, 손대지도 않은 나머지 블록이 딸려
  // 사라진다.
  function removeBlock(day, blockId) {
    const target = day.blocks.find((b) => b.id === blockId);
    const blocks = day.blocks.filter((b) => b.id !== blockId);
    const orphaned = target && target.todoId && !blocks.some((b) => b.todoId === target.todoId);
    const todos = orphaned ? day.todos.filter((t) => t.id !== target.todoId) : day.todos;
    return { todos: recompute(todos, blocks), blocks };
  }

  // 할 일을 지우면 블록도 사라진다. 할 일이 없어졌는데 시간표에 남아 있으면
  // 그 시간이 무엇인지 알 방법이 없다.
  function removeTodo(day, todoId) {
    return {
      todos: day.todos.filter((t) => t.id !== todoId),
      blocks: day.blocks.filter((b) => b.todoId !== todoId),
    };
  }

  function sortBlocks(blocks) {
    return blocks.slice().sort((a, b) => a.start - b.start);
  }

  // 블록 편집 시트의 저장. todoChoice 는 "none" | "new" | 기존 할 일 id.
  function commitBlock(day, block, todoChoice, todoText) {
    let todos = day.todos.slice();
    const next = { ...block };

    if (todoChoice === "new") {
      const todo = { id: store.newId(), subjectId: next.subjectId || null, text: todoText, done: !!next.done };
      todos.push(todo);
      next.todoId = todo.id;
    } else if (todoChoice && todoChoice !== "none") {
      next.todoId = todoChoice;
      todos = todos.map((t) =>
        t.id === todoChoice ? { ...t, subjectId: next.subjectId || null, text: todoText } : t
      );
    } else {
      next.todoId = null;
    }

    const exists = day.blocks.some((b) => b.id === next.id);
    const blocks = exists ? day.blocks.map((b) => (b.id === next.id ? next : b)) : day.blocks.concat([next]);
    return { todos: recompute(todos, blocks), blocks: sortBlocks(blocks) };
  }

  // 할 일 편집 시트의 저장. range 는 {start,end} | null(배정 해제) | "keep"(그대로).
  // 블록이 둘 이상이면 시트의 범위 하나로 표현할 수 없어 뷰가 "keep"을 넘긴다.
  function commitTodo(day, todo, range) {
    const exists = day.todos.some((t) => t.id === todo.id);
    let todos = exists ? day.todos.map((t) => (t.id === todo.id ? { ...t, ...todo } : t)) : day.todos.concat([todo]);
    let blocks = day.blocks.slice();

    if (range && range !== "keep") {
      const own = blocks.filter((b) => b.todoId === todo.id);
      if (own.length === 0) {
        blocks = blocks.concat([{
          id: store.newId(), todoId: todo.id, subjectId: todo.subjectId || null,
          text: todo.text, start: range.start, end: range.end, done: !!todo.done,
        }]);
      } else {
        blocks = blocks.map((b) => (b.id === own[0].id ? { ...b, start: range.start, end: range.end } : b));
      }
    } else if (range === null) {
      blocks = blocks.filter((b) => b.todoId !== todo.id);
    }

    // 연결된 쌍은 과목·내용이 항상 같다.
    blocks = blocks.map((b) =>
      b.todoId === todo.id ? { ...b, subjectId: todo.subjectId || null, text: todo.text } : b
    );
    return { todos: recompute(todos, blocks), blocks: sortBlocks(blocks) };
  }

  // 할 일에 시간을 배정할 때 제안할 구간. duration 이 들어가는 첫 빈 구간을 주고,
  // 어디에도 안 들어가면 가장 넓은 빈 구간 전체를 준다. 5분도 안 남으면 null.
  function firstFreeSlot(blocks, duration) {
    const gaps = [];
    let cursor = dt.DAY_START;
    for (const b of sortBlocks(blocks || [])) {
      if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < dt.DAY_END) gaps.push({ start: cursor, end: dt.DAY_END });

    for (const g of gaps) {
      if (g.end - g.start >= duration) return { start: g.start, end: g.start + duration };
    }
    let widest = null;
    for (const g of gaps) if (!widest || g.end - g.start > widest.end - widest.start) widest = g;
    if (!widest || widest.end - widest.start < dt.SLOT) return null;
    return { start: widest.start, end: widest.end };
  }

  const api = {
    blocksOfTodo, setBlockDone, setTodoDone, removeBlock, removeTodo,
    commitBlock, commitTodo, firstFreeSlot,
  };

  root.SP = root.SP || {};
  root.SP.link = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
