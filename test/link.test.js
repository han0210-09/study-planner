const test = require("node:test");
const assert = require("node:assert/strict");
const link = require("../src/link.js");

const day = (todos, blocks) => ({ todos, blocks });
// 기본값에 과목을 준다. 과목은 이제 완료와 무관하지만, 과목이 붙은 쪽과
// 안 붙은 쪽을 갈라 볼 수 있어야 하므로 기본값은 붙여 둔다.
const T = (id, extra) => Object.assign({ id, subjectId: "kor", text: id, done: false }, extra);
const B = (id, start, end, extra) =>
  Object.assign({ id, subjectId: "kor", text: "", start, end, done: false, todoId: null }, extra);

test("blocksOfTodo: 연결된 블록만", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460)]);
  assert.deepEqual(link.blocksOfTodo(d, "t1").map((b) => b.id), ["b1"]);
  assert.deepEqual(link.blocksOfTodo(d, null), []);
});

// 할 일 하나에 블록 둘이면 둘 다 끝나야 할 일이 끝난 것이다.
test("setBlockDone: 블록 하나만 체크하면 할 일은 아직 미완", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t1" })]);
  const r = link.setBlockDone(d, "b1", true);
  assert.equal(r.blocks.find((b) => b.id === "b1").done, true);
  assert.equal(r.todos[0].done, false);
});

test("setBlockDone: 연결된 블록이 전부 완료면 할 일도 완료", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1", done: true }), B("b2", 400, 460, { todoId: "t1" })]);
  assert.equal(link.setBlockDone(d, "b2", true).todos[0].done, true);
});

test("setBlockDone: 체크를 풀면 할 일도 풀린다", () => {
  const d = day([T("t1", { done: true })], [B("b1", 300, 360, { todoId: "t1", done: true })]);
  assert.equal(link.setBlockDone(d, "b1", false).todos[0].done, false);
});

test("setBlockDone: 연결 없는 블록은 할 일을 건드리지 않는다", () => {
  const d = day([T("t1")], [B("b1", 300, 360)]);
  assert.equal(link.setBlockDone(d, "b1", true).todos[0].done, false);
});

test("setTodoDone: 연결된 블록을 전부 바꾼다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t1" }), B("b3", 500, 560)]);
  const r = link.setTodoDone(d, "t1", true);
  assert.deepEqual(r.blocks.map((b) => b.done), [true, true, false]);
  assert.equal(r.todos[0].done, true);
});

test("setTodoDone: 블록이 없는 할 일도 스스로 체크된다", () => {
  const r = link.setTodoDone(day([T("t1")], []), "t1", true);
  assert.equal(r.todos[0].done, true);
});

test("removeBlock: 마지막 블록이면 할 일도 함께 사라진다", () => {
  const d = day([T("t1"), T("t2")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.removeBlock(d, "b1");
  assert.equal(r.blocks.length, 0);
  assert.deepEqual(r.todos.map((t) => t.id), ["t2"]);
});

// 하나만 지웠다고 할 일까지 지우면 손대지도 않은 나머지 블록이 딸려 사라진다.
test("removeBlock: 다른 블록이 남아 있으면 할 일은 유지된다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t1" })]);
  const r = link.removeBlock(d, "b1");
  assert.deepEqual(r.todos.map((t) => t.id), ["t1"]);
  assert.deepEqual(r.blocks.map((b) => b.id), ["b2"]);
});

test("removeBlock: 연결 없는 블록은 할 일을 건드리지 않는다", () => {
  const d = day([T("t1")], [B("b1", 300, 360)]);
  const r = link.removeBlock(d, "b1");
  assert.equal(r.blocks.length, 0);
  assert.deepEqual(r.todos.map((t) => t.id), ["t1"]);
});

test("removeTodo: 연결된 블록도 함께 사라진다", () => {
  const d = day([T("t1"), T("t2")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t2" })]);
  const r = link.removeTodo(d, "t1");
  assert.deepEqual(r.todos.map((t) => t.id), ["t2"]);
  assert.deepEqual(r.blocks.map((b) => b.id), ["b2"]);
});

test("commitBlock new: 할 일이 생기고 연결된다", () => {
  const d = day([], []);
  const r = link.commitBlock(d, B("b1", 300, 360, { subjectId: "math" }), "new", "수1 미적");
  assert.equal(r.todos.length, 1);
  assert.equal(r.todos[0].text, "수1 미적");
  assert.equal(r.todos[0].subjectId, "math");
  assert.equal(r.blocks[0].todoId, r.todos[0].id);
});

test("commitBlock new: 완료 상태도 따라간다", () => {
  const r = link.commitBlock(day([], []), B("b1", 300, 360, { done: true }), "new", "끝난 것");
  assert.equal(r.todos[0].done, true);
});

test("commitBlock none: 연결하지 않는다", () => {
  const r = link.commitBlock(day([], []), B("b1", 300, 360), "none", "무시됨");
  assert.deepEqual(r.todos, []);
  assert.equal(r.blocks[0].todoId, null);
});

test("commitBlock 기존 id: 그 할 일의 과목·내용이 블록에 맞춰진다", () => {
  const d = day([T("t1", { text: "옛 이름", subjectId: null })], []);
  const r = link.commitBlock(d, B("b1", 300, 360, { subjectId: "eng" }), "t1", "새 이름");
  assert.equal(r.todos[0].text, "새 이름");
  assert.equal(r.todos[0].subjectId, "eng");
  assert.equal(r.blocks[0].todoId, "t1");
});

test("commitBlock: 기존 블록을 고치면 늘지 않는다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.commitBlock(d, B("b1", 300, 420, { todoId: "t1" }), "t1", "t1");
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].end, 420);
});

// 연결을 옮기면 옛 할 일은 남되 미배정이 된다.
test("commitBlock: 다른 할 일로 옮기면 옛 할 일은 미배정으로 남는다", () => {
  const d = day([T("t1"), T("t2")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.commitBlock(d, B("b1", 300, 360, { todoId: "t1" }), "t2", "t2");
  assert.equal(r.todos.length, 2);
  assert.deepEqual(link.blocksOfTodo(r, "t1"), []);
  assert.equal(link.blocksOfTodo(r, "t2").length, 1);
});

test("commitTodo: 새 할 일 + 시간 배정이면 블록이 생긴다", () => {
  const t = T("t1", { text: "영어 단어", subjectId: "eng" });
  const r = link.commitTodo(day([], []), t, [{ start: 300, end: 360 }]);
  assert.equal(r.todos.length, 1);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].todoId, "t1");
  assert.equal(r.blocks[0].subjectId, "eng");
  assert.equal(r.blocks[0].text, "영어 단어");
});

test("commitTodo: 배정 없이 저장하면 블록이 안 생긴다", () => {
  const r = link.commitTodo(day([], []), T("t1"), []);
  assert.equal(r.todos.length, 1);
  assert.equal(r.blocks.length, 0);
});

// 한 할 일에 여러 시간을 주는 게 이 계약의 핵심이다.
test("commitTodo: 여러 시간을 한 번에 배정한다", () => {
  const t = T("t1", { text: "수학", subjectId: "math" });
  const r = link.commitTodo(day([], []), t, [{ start: 360, end: 420 }, { start: 1260, end: 1320 }]);
  assert.equal(r.blocks.length, 2);
  assert.deepEqual(r.blocks.map((b) => b.start), [360, 1260]);
  for (const b of r.blocks) assert.equal(b.todoId, "t1");
});

test("commitTodo: 기존 블록은 고치고 새 것은 더한다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.commitTodo(d, T("t1"), [{ id: "b1", start: 400, end: 500 }, { start: 600, end: 660 }]);
  assert.equal(r.blocks.length, 2);
  assert.equal(r.blocks[0].id, "b1");
  assert.deepEqual([r.blocks[0].start, r.blocks[0].end], [400, 500]);
  assert.equal(r.blocks[1].todoId, "t1");
});

test("commitTodo: 목록에서 빠진 블록은 사라진다", () => {
  const d = day([T("t1")], [
    B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t1" }), B("b3", 500, 560),
  ]);
  const r = link.commitTodo(d, T("t1"), [{ id: "b2", start: 400, end: 460 }]);
  assert.deepEqual(r.blocks.map((b) => b.id), ["b2", "b3"]);
});

test("commitTodo: 빈 목록이면 배정이 전부 없어진다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460)]);
  const r = link.commitTodo(d, T("t1"), []);
  assert.deepEqual(r.blocks.map((b) => b.id), ["b2"]);
});

test("commitTodo: 과목·내용을 고치면 연결된 블록도 따라간다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1", text: "옛것" })]);
  const r = link.commitTodo(d, T("t1", { text: "새것", subjectId: "kor" }), [{ id: "b1", start: 300, end: 360 }]);
  assert.equal(r.blocks[0].text, "새것");
  assert.equal(r.blocks[0].subjectId, "kor");
});

// 완료된 할 일에 시간을 더하면 할 일이 미완으로 돌아간다. 할 일이 늘었으니 맞다.
test("commitTodo: 완료된 할 일에 시간을 더하면 미완이 된다", () => {
  const d = day([T("t1", { done: true })], [B("b1", 300, 360, { todoId: "t1", done: true })]);
  const r = link.commitTodo(d, T("t1", { done: true }), [{ id: "b1", start: 300, end: 360 }, { start: 600, end: 660 }]);
  assert.equal(r.todos[0].done, false);
});

test("firstFreeSlot: 빈 하루면 05:00부터", () => {
  assert.deepEqual(link.firstFreeSlot([], 60), { start: 300, end: 360 });
});

test("firstFreeSlot: 앞이 막혀 있으면 그 뒤 첫 빈 구간", () => {
  assert.deepEqual(link.firstFreeSlot([B("b1", 300, 420)], 60), { start: 420, end: 480 });
});

test("firstFreeSlot: 1시간이 안 들어가면 가장 넓은 빈 구간 전체", () => {
  // 300~1500 을 막고 1500~1530, 1540~1560 만 남긴다.
  const blocks = [B("b1", 300, 1500), B("b2", 1530, 1540)];
  assert.deepEqual(link.firstFreeSlot(blocks, 60), { start: 1500, end: 1530 });
});

test("firstFreeSlot: 5분도 안 남으면 null", () => {
  assert.equal(link.firstFreeSlot([B("b1", 300, 1560)], 60), null);
});

test("firstFreeSlot: 정렬되지 않은 배열도 처리한다", () => {
  const blocks = [B("b2", 480, 540), B("b1", 300, 420)];
  assert.deepEqual(link.firstFreeSlot(blocks, 60), { start: 420, end: 480 });
});

// ---- 같은 과목·내용 묶기 ----

test("commitBlock new: 같은 과목·내용의 할 일이 있으면 거기 붙는다", () => {
  const d = day([T("t1", { text: "수1 미적", subjectId: "math" })], [B("b1", 360, 420, { todoId: "t1" })]);
  const r = link.commitBlock(d, B("b2", 1260, 1320, { subjectId: "math" }), "new", "수1 미적");
  assert.equal(r.todos.length, 1, "할 일이 늘면 안 된다");
  assert.equal(r.blocks.find((b) => b.id === "b2").todoId, "t1");
  assert.equal(link.blocksOfTodo(r, "t1").length, 2);
});

test("commitBlock new: 과목이 다르면 따로 만든다", () => {
  const d = day([T("t1", { text: "정리", subjectId: "math" })], []);
  const r = link.commitBlock(d, B("b2", 360, 420, { subjectId: "eng" }), "new", "정리");
  assert.equal(r.todos.length, 2);
});

test("commitBlock new: 내용이 다르면 따로 만든다", () => {
  const d = day([T("t1", { text: "수1 미적", subjectId: "math" })], []);
  const r = link.commitBlock(d, B("b2", 360, 420, { subjectId: "math" }), "new", "수1 확통");
  assert.equal(r.todos.length, 2);
});

test("mergeAdjacent: 맞닿고 같은 내용이면 합친다", () => {
  const d = day([], [
    B("b1", 360, 420, { subjectId: "math", text: "미적" }),
    B("b2", 420, 480, { subjectId: "math", text: "미적" }),
  ]);
  const r = link.mergeAdjacent(d);
  assert.equal(r.merged, 1);
  assert.equal(r.blocks.length, 1);
  assert.deepEqual([r.blocks[0].start, r.blocks[0].end], [360, 480]);
});

test("mergeAdjacent: 셋이 이어지면 하나로", () => {
  const d = day([], [
    B("b1", 360, 420, { subjectId: "math", text: "미적" }),
    B("b2", 420, 480, { subjectId: "math", text: "미적" }),
    B("b3", 480, 540, { subjectId: "math", text: "미적" }),
  ]);
  const r = link.mergeAdjacent(d);
  assert.equal(r.merged, 2);
  assert.deepEqual([r.blocks[0].start, r.blocks[0].end], [360, 540]);
});

test("mergeAdjacent: 떨어져 있으면 안 합친다", () => {
  const d = day([], [
    B("b1", 360, 420, { subjectId: "math", text: "미적" }),
    B("b2", 425, 480, { subjectId: "math", text: "미적" }),
  ]);
  assert.equal(link.mergeAdjacent(d).merged, 0);
});

test("mergeAdjacent: 과목이나 내용이 다르면 안 합친다", () => {
  const d = day([], [
    B("b1", 360, 420, { subjectId: "math", text: "미적" }),
    B("b2", 420, 480, { subjectId: "math", text: "확통" }),
    B("b3", 480, 540, { subjectId: "eng", text: "확통" }),
  ]);
  assert.equal(link.mergeAdjacent(d).merged, 0);
});

// 둘 다 끝냈을 때만 합친 것도 끝난 것이다.
test("mergeAdjacent: 완료는 둘 다 끝났을 때만", () => {
  const base = (d1, d2) => day([], [
    B("b1", 360, 420, { subjectId: "math", text: "미적", done: d1 }),
    B("b2", 420, 480, { subjectId: "math", text: "미적", done: d2 }),
  ]);
  assert.equal(link.mergeAdjacent(base(true, true)).blocks[0].done, true);
  assert.equal(link.mergeAdjacent(base(true, false)).blocks[0].done, false);
});

test("mergeAdjacent: 흡수된 쪽의 중복 할 일은 사라진다", () => {
  const d = day(
    [T("t1", { text: "미적", subjectId: "math" }), T("t2", { text: "미적", subjectId: "math" })],
    [
      B("b1", 360, 420, { subjectId: "math", text: "미적", todoId: "t1" }),
      B("b2", 420, 480, { subjectId: "math", text: "미적", todoId: "t2" }),
    ]
  );
  const r = link.mergeAdjacent(d);
  assert.deepEqual(r.todos.map((t) => t.id), ["t1"]);
  assert.equal(r.blocks[0].todoId, "t1");
});

test("mergeAdjacent: 배정 없는 할 일은 건드리지 않는다", () => {
  const d = day([T("t1"), T("free")], [
    B("b1", 360, 420, { subjectId: "math", text: "미적", todoId: "t1" }),
    B("b2", 420, 480, { subjectId: "math", text: "미적", todoId: "t1" }),
  ]);
  const r = link.mergeAdjacent(d);
  assert.deepEqual(r.todos.map((t) => t.id), ["t1", "free"]);
});

test("mergeAdjacent: 합칠 게 없으면 merged 0", () => {
  assert.equal(link.mergeAdjacent(day([], [])).merged, 0);
  assert.equal(link.mergeAdjacent(day([T("t1")], [B("b1", 360, 420)])).merged, 0);
});

// ---- 과목 없음에는 완료가 없다 ----
// 화면에서 체크를 뺐으므로, 켜져 있던 완료가 남으면 끌 방법이 사라진다.

test("clearDone: 과목 없는 블록은 체크해도 완료가 되지 않는다", () => {
  const d = day([], [B("b1", 300, 360, { subjectId: null })]);
  const r = link.setBlockDone(d, "b1", true);
  assert.equal(r.blocks[0].done, false);
});

test("clearDone: 과목 없는 할 일은 체크해도 완료가 되지 않는다", () => {
  const d = day([T("t1", { subjectId: null })], []);
  const r = link.setTodoDone(d, "t1", true);
  assert.equal(r.todos[0].done, false);
});

test("clearDone: 과목 있는 쪽은 그대로 완료된다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.setBlockDone(d, "b1", true);
  assert.equal(r.blocks[0].done, true);
  assert.equal(r.todos[0].done, true);
});

test("commitBlock: 과목을 없애면 켜져 있던 완료가 함께 내려간다", () => {
  const d = day([], [B("b1", 300, 360, { done: true })]);
  const r = link.commitBlock(d, { ...d.blocks[0], subjectId: null }, "none", "");
  assert.equal(r.blocks[0].done, false);
});

test("mergeAdjacent: 과목 없는 블록을 합쳐도 완료가 살아나지 않는다", () => {
  const d = day([], [
    B("b1", 300, 360, { subjectId: null, text: "저녁", done: true }),
    B("b2", 360, 420, { subjectId: null, text: "저녁", done: true }),
  ]);
  const r = link.mergeAdjacent(d);
  assert.equal(r.merged, 1);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].done, false);
});

// ---- 블록에서 생긴 할 일은 시각 순서대로 들어간다 ----

const titles = (r) => r.todos.map((t) => t.text);

test("commitBlock: 새 할 일이 블록 시각에 맞는 자리에 들어간다", () => {
  const d = day(
    [T("t1", { text: "아침" }), T("t2", { text: "저녁" })],
    [B("b1", 360, 420, { todoId: "t1" }), B("b2", 1080, 1140, { todoId: "t2" })]
  );
  // 09시에 새 블록 → 아침(06시)과 저녁(18시) 사이
  const r = link.commitBlock(d, B("b3", 540, 600), "new", "낮");
  assert.deepEqual(titles(r), ["아침", "낮", "저녁"]);
});

test("commitBlock: 가장 이른 블록이면 맨 위로 간다", () => {
  const d = day([T("t1", { text: "저녁" })], [B("b1", 1080, 1140, { todoId: "t1" })]);
  const r = link.commitBlock(d, B("b2", 360, 420), "new", "새벽");
  assert.deepEqual(titles(r), ["새벽", "저녁"]);
});

test("commitBlock: 가장 늦은 블록이면 맨 아래로 간다", () => {
  const d = day([T("t1", { text: "아침" })], [B("b1", 360, 420, { todoId: "t1" })]);
  const r = link.commitBlock(d, B("b2", 1080, 1140), "new", "저녁");
  assert.deepEqual(titles(r), ["아침", "저녁"]);
});

// 손으로 맞춰둔 순서를 블록 하나 만들 때마다 갈아엎지 않는다.
test("commitBlock: 기존 할 일끼리의 순서는 건드리지 않는다", () => {
  const d = day(
    [T("t1", { text: "늦은것" }), T("t2", { text: "이른것" })],
    [B("b1", 1080, 1140, { todoId: "t1" }), B("b2", 360, 420, { todoId: "t2" })]
  );
  const r = link.commitBlock(d, B("b3", 1200, 1260), "new", "더늦은것");
  assert.deepEqual(titles(r), ["늦은것", "이른것", "더늦은것"]);
});

test("commitBlock: 시간 없는 할 일은 자리를 내주지 않는다", () => {
  const d = day([T("t1", { text: "미배정" }), T("t2", { text: "저녁" })],
    [B("b1", 1080, 1140, { todoId: "t2" })]);
  const r = link.commitBlock(d, B("b2", 360, 420), "new", "아침");
  assert.deepEqual(titles(r), ["미배정", "아침", "저녁"]);
});

test("commitBlock: 같은 할 일에 붙을 때는 자리를 만들지 않는다", () => {
  const d = day([T("t1", { text: "아침" }), T("t2", { text: "국어" })],
    [B("b1", 360, 420, { todoId: "t1" }), B("b2", 1080, 1140, { todoId: "t2" })]);
  // 과목·내용이 같으므로 t2 에 붙는다. 할 일 개수도 순서도 그대로다.
  const r = link.commitBlock(d, B("b3", 480, 540), "new", "국어");
  assert.deepEqual(titles(r), ["아침", "국어"]);
  assert.equal(r.blocks.find((b) => b.id === "b3").todoId, "t2");
});

/* ---------- 연결된 쌍은 과목·내용이 같다 ---------- */

// 아침·저녁으로 나눠 잡은 할 일에서 블록 하나의 과목만 바꾸면, 나머지가 옛
// 과목에 남아 같은 일이 시간표에 두 색으로 그려졌다.
test("commitBlock: 한 블록의 과목을 바꾸면 같은 할 일의 나머지도 따라간다", () => {
  const d = day(
    [T("t1", { subjectId: "kor", text: "독서 지문" })],
    [B("b1", 300, 360, { todoId: "t1", subjectId: "kor", text: "독서 지문" }),
     B("b2", 600, 660, { todoId: "t1", subjectId: "kor", text: "독서 지문" }),
     B("b3", 800, 860, { subjectId: "kor", text: "남" })]
  );
  const edited = { ...d.blocks[0], subjectId: "eng" };
  const r = link.commitBlock(d, edited, "t1", "독서 지문");
  assert.equal(r.blocks.find((b) => b.id === "b1").subjectId, "eng");
  assert.equal(r.blocks.find((b) => b.id === "b2").subjectId, "eng");
  assert.equal(r.todos[0].subjectId, "eng");
  // 안 묶인 블록은 건드리지 않는다.
  assert.equal(r.blocks.find((b) => b.id === "b3").subjectId, "kor");
});

test("commitBlock: 내용을 바꿔도 같은 할 일의 나머지가 따라간다", () => {
  const d = day(
    [T("t1", { text: "옛 이름" })],
    [B("b1", 300, 360, { todoId: "t1", text: "옛 이름" }),
     B("b2", 600, 660, { todoId: "t1", text: "옛 이름" })]
  );
  const r = link.commitBlock(d, { ...d.blocks[0], text: "새 이름" }, "t1", "새 이름");
  assert.equal(r.blocks.find((b) => b.id === "b2").text, "새 이름");
});

test("commitBlock: 과목을 없애면 같은 할 일의 나머지 완료도 함께 내려간다", () => {
  const d = day(
    [T("t1", { done: true })],
    [B("b1", 300, 360, { todoId: "t1", done: true }),
     B("b2", 600, 660, { todoId: "t1", done: true })]
  );
  const r = link.commitBlock(d, { ...d.blocks[0], subjectId: null }, "t1", "t1");
  assert.equal(r.blocks.find((b) => b.id === "b2").subjectId, null);
  assert.equal(r.blocks.find((b) => b.id === "b2").done, false);
  assert.equal(r.todos[0].done, false);
});

test("commitTodo 로 고쳐도 같은 규칙이다", () => {
  const d = day(
    [T("t1", { subjectId: "kor" })],
    [B("b1", 300, 360, { todoId: "t1" }), B("b2", 600, 660, { todoId: "t1" })]
  );
  const r = link.commitTodo(d, { ...d.todos[0], subjectId: "math" },
    [{ id: "b1", start: 300, end: 360 }, { id: "b2", start: 600, end: 660 }]);
  assert.deepEqual(r.blocks.map((b) => b.subjectId), ["math", "math"]);
});

// 할 일에서 풀린 블록은 더 이상 따라가지 않는다.
test("commitBlock none: 연결을 끊은 블록은 옛 할 일을 안 따라간다", () => {
  const d = day(
    [T("t1", { subjectId: "kor" })],
    [B("b1", 300, 360, { todoId: "t1" }), B("b2", 600, 660, { todoId: "t1" })]
  );
  const r = link.commitBlock(d, { ...d.blocks[0], subjectId: "eng" }, "none", "독립");
  assert.equal(r.blocks.find((b) => b.id === "b1").subjectId, "eng");
  assert.equal(r.blocks.find((b) => b.id === "b1").todoId, null);
  assert.equal(r.blocks.find((b) => b.id === "b2").subjectId, "kor");
});
