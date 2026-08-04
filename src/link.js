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

  // 과목이 없으면 완료라는 개념도 없다. 화면에서 체크를 뺐으므로, 켜져 있던 완료
  // 표시가 그대로 남으면 끌 방법이 사라진다. 과목을 '과목 없음'으로 바꾸거나 설정에서
  // 과목 자체를 지웠을 때도 이 길로 들어온다.
  function clearDone(items) {
    return items.map((x) => (x.subjectId || !x.done ? x : { ...x, done: false }));
  }

  // 이 파일이 돌려주는 모든 { todos, blocks } 는 여기를 지난다. 규칙을 함수마다
  // 따로 적으면 새로 만드는 함수에서 빠뜨린다.
  //
  // 순서가 중요하다. 블록을 먼저 정리해야 recompute 가 정리된 값에서 할 일의
  // 완료를 다시 뽑는다.
  function pair(todos, blocks) {
    const next = clearDone(blocks);
    return { todos: clearDone(recompute(todos, next)), blocks: next };
  }

  function setBlockDone(day, blockId, done) {
    const blocks = day.blocks.map((b) => (b.id === blockId ? { ...b, done } : b));
    return pair(day.todos, blocks);
  }

  function setTodoDone(day, todoId, done) {
    const blocks = day.blocks.map((b) => (b.todoId === todoId ? { ...b, done } : b));
    const todos = day.todos.map((t) => (t.id === todoId ? { ...t, done } : t));
    return pair(todos, blocks);
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
    return pair(todos, blocks);
  }

  // 할 일을 지우면 블록도 사라진다. 할 일이 없어졌는데 시간표에 남아 있으면
  // 그 시간이 무엇인지 알 방법이 없다.
  function removeTodo(day, todoId) {
    return pair(
      day.todos.filter((t) => t.id !== todoId),
      day.blocks.filter((b) => b.todoId !== todoId)
    );
  }

  function sortBlocks(blocks) {
    return blocks.slice().sort((a, b) => a.start - b.start);
  }

  // 블록에서 새로 생긴 할 일이 들어갈 자리. 시간표에서 08시에 잡은 일이 목록
  // 맨 아래에 붙으면, 하루를 위에서 아래로 읽을 수가 없다.
  //
  // 목록 전체를 정렬하지는 않는다. ▲▼ 로 손수 맞춰둔 순서가 블록을 하나 만들
  // 때마다 흐트러진다. 자기보다 늦게 시작하는 첫 할 일 앞에 끼우기만 한다.
  //
  // 시간이 없는 할 일(미배정)은 건너뛴다. 비교할 시각이 없는데 자리를 내주면
  // 이유 없이 아래로 밀린다.
  function insertIndexFor(todos, blocks, start) {
    for (let i = 0; i < todos.length; i++) {
      const own = blocks.filter((b) => b.todoId === todos[i].id);
      if (own.length === 0) continue;
      if (Math.min(...own.map((b) => b.start)) > start) return i;
    }
    return todos.length;
  }

  // 블록 편집 시트의 저장. todoChoice 는 "none" | "new" | 기존 할 일 id.
  function commitBlock(day, block, todoChoice, todoText) {
    let todos = day.todos.slice();
    const next = { ...block };

    if (todoChoice === "new") {
      // 과목·내용이 같은 할 일이 이미 있으면 새로 만들지 않고 거기에 붙인다.
      // 그러지 않으면 아침·저녁으로 나눠 잡을 때마다 똑같은 이름의 할 일이 쌓인다.
      const twin = todos.find((t) => t.text === todoText && (t.subjectId || null) === (next.subjectId || null));
      if (twin) {
        next.todoId = twin.id;
      } else {
        const todo = { id: store.newId(), subjectId: next.subjectId || null, text: todoText, done: !!next.done };
        // day.blocks 로 자리를 잡는다. 아직 next 가 안 들어간 목록이라, 자기
        // 자신과 비교하는 일이 없다.
        todos.splice(insertIndexFor(todos, day.blocks, next.start), 0, todo);
        next.todoId = todo.id;
      }
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
    return pair(todos, sortBlocks(blocks));
  }

  // 할 일 편집 시트의 저장. ranges 는 그 할 일에 배정된 시간 목록이다.
  // id 가 있으면 기존 블록의 시각을 고치고, 없으면 새로 만든다. 목록에서 빠진
  // 블록은 배정이 풀린 것이므로 지운다. 빈 배열이면 배정을 전부 없앤다.
  //
  // 범위 하나만 받으면 "한 할 일에 여러 시간"을 표현할 수 없다. 목록으로 받으면
  // 0개·1개·여러 개가 같은 길로 처리된다.
  function commitTodo(day, todo, ranges) {
    const exists = day.todos.some((t) => t.id === todo.id);
    let todos = exists ? day.todos.map((t) => (t.id === todo.id ? { ...t, ...todo } : t)) : day.todos.concat([todo]);

    const list = Array.isArray(ranges) ? ranges : [];
    const kept = new Set(list.filter((r) => r.id).map((r) => r.id));
    let blocks = day.blocks.filter((b) => b.todoId !== todo.id || kept.has(b.id));

    for (const r of list) {
      if (r.id) {
        blocks = blocks.map((b) => (b.id === r.id ? { ...b, start: r.start, end: r.end } : b));
      } else {
        // 새로 더한 시간은 아직 안 한 것이다. 완료된 할 일에 시간을 더하면
        // recompute 가 그 할 일을 미완으로 되돌린다 — 할 일이 늘었으니 맞다.
        blocks = blocks.concat([{
          id: store.newId(), todoId: todo.id, subjectId: todo.subjectId || null,
          text: todo.text, start: r.start, end: r.end, done: false,
        }]);
      }
    }

    // 연결된 쌍은 과목·내용이 항상 같다.
    blocks = blocks.map((b) =>
      b.todoId === todo.id ? { ...b, subjectId: todo.subjectId || null, text: todo.text } : b
    );
    return pair(todos, sortBlocks(blocks));
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

  // 과목·내용이 같고 맞닿은 블록을 한 덩어리로 만든다.
  //
  // 자동으로 하면 안 된다. ⊕ 로 "이어서 하나 더" 만들고 같은 내용을 적는 순간
  // 앞 블록에 흡수되어 나눠 잡은 의도가 사라진다. 사용자가 버튼을 누를 때만 한다.
  //
  // merged 는 흡수된 횟수다. 0이면 합칠 게 없다는 뜻이라 뷰가 버튼을 감춘다.
  function mergeAdjacent(day) {
    const out = [];
    let merged = 0;
    for (const b of sortBlocks(day.blocks || [])) {
      const prev = out[out.length - 1];
      const joins = prev && prev.end === b.start &&
        (prev.subjectId || null) === (b.subjectId || null) &&
        (prev.text || "") === (b.text || "");
      if (!joins) { out.push({ ...b }); continue; }
      prev.end = b.end;
      // 둘 다 끝냈을 때만 합친 것도 끝난 것이다.
      prev.done = prev.done && b.done;
      if (!prev.todoId) prev.todoId = b.todoId || null;
      merged++;
    }

    // 흡수되면서 블록을 전부 잃은 할 일은 같은 과목·내용의 중복이므로 지운다.
    // 원래 블록이 없던 할 일(미배정)은 건드리지 않는다.
    const live = new Set(out.map((b) => b.todoId).filter(Boolean));
    const had = new Set((day.blocks || []).map((b) => b.todoId).filter(Boolean));
    const todos = day.todos.filter((t) => !had.has(t.id) || live.has(t.id));

    return Object.assign(pair(todos, out), { merged });
  }

  const api = {
    blocksOfTodo, setBlockDone, setTodoDone, removeBlock, removeTodo,
    commitBlock, commitTodo, firstFreeSlot, mergeAdjacent,
  };

  root.SP = root.SP || {};
  root.SP.link = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
