const test = require("node:test");
const assert = require("node:assert/strict");
const link = require("../src/link.js");

const day = (todos, blocks) => ({ todos, blocks });
const T = (id, extra) => Object.assign({ id, subjectId: null, text: id, done: false }, extra);
const B = (id, start, end, extra) =>
  Object.assign({ id, subjectId: null, text: "", start, end, done: false, todoId: null }, extra);

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

test("removeBlock: 할 일은 남고 미배정이 된다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.removeBlock(d, "b1");
  assert.equal(r.blocks.length, 0);
  assert.equal(r.todos.length, 1);
  assert.deepEqual(link.blocksOfTodo(r, "t1"), []);
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
  const r = link.commitTodo(day([], []), t, { start: 300, end: 360 });
  assert.equal(r.todos.length, 1);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].todoId, "t1");
  assert.equal(r.blocks[0].subjectId, "eng");
  assert.equal(r.blocks[0].text, "영어 단어");
});

test("commitTodo: 배정 없이 저장하면 블록이 안 생긴다", () => {
  const r = link.commitTodo(day([], []), T("t1"), null);
  assert.equal(r.todos.length, 1);
  assert.equal(r.blocks.length, 0);
});

test("commitTodo: 이미 있는 블록의 시각만 바뀐다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" })]);
  const r = link.commitTodo(d, T("t1"), { start: 400, end: 500 });
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].id, "b1");
  assert.deepEqual([r.blocks[0].start, r.blocks[0].end], [400, 500]);
});

test("commitTodo: 배정을 해제하면 블록이 사라진다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460)]);
  const r = link.commitTodo(d, T("t1"), null);
  assert.deepEqual(r.blocks.map((b) => b.id), ["b2"]);
});

// 블록이 둘 이상이면 시트의 범위 하나로 표현할 수 없다. 뷰가 "keep"을 넘긴다.
test('commitTodo "keep": 블록을 건드리지 않는다', () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1" }), B("b2", 400, 460, { todoId: "t1" })]);
  const r = link.commitTodo(d, T("t1", { text: "이름만 변경" }), "keep");
  assert.equal(r.blocks.length, 2);
  assert.deepEqual(r.blocks.map((b) => b.text), ["이름만 변경", "이름만 변경"]);
});

test("commitTodo: 과목·내용을 고치면 연결된 블록도 따라간다", () => {
  const d = day([T("t1")], [B("b1", 300, 360, { todoId: "t1", text: "옛것" })]);
  const r = link.commitTodo(d, T("t1", { text: "새것", subjectId: "kor" }), "keep");
  assert.equal(r.blocks[0].text, "새것");
  assert.equal(r.blocks[0].subjectId, "kor");
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
