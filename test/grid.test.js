const test = require("node:test");
const assert = require("node:assert/strict");
const grid = require("../src/grid.js");

test("COLS / ROWS", () => {
  assert.equal(grid.COLS, 12);
  assert.equal(grid.ROWS, 21);
});

test("rowColOf: 05:00이 첫 칸, 01:55가 마지막 칸", () => {
  assert.deepEqual(grid.rowColOf(300), { row: 0, col: 0 });
  assert.deepEqual(grid.rowColOf(350), { row: 0, col: 10 });
  assert.deepEqual(grid.rowColOf(360), { row: 1, col: 0 });
  assert.deepEqual(grid.rowColOf(1555), { row: 20, col: 11 });
});

// 정각에 끝나는 블록에 span 0짜리 조각이 붙으면 다음 행이 통째로 물들어 보인다.
test("segmentsOf: 정각~정각은 조각 1개", () => {
  assert.deepEqual(grid.segmentsOf(360, 420), [
    { row: 1, col: 0, span: 12, start: 360, end: 420 },
  ]);
});

test("segmentsOf: 시각을 넘으면 조각 2개", () => {
  assert.deepEqual(grid.segmentsOf(350, 380), [
    { row: 0, col: 10, span: 2, start: 350, end: 360 },
    { row: 1, col: 0, span: 4, start: 360, end: 380 },
  ]);
});

test("segmentsOf: 5분짜리는 조각 1개, span 1", () => {
  assert.deepEqual(grid.segmentsOf(300, 305), [
    { row: 0, col: 0, span: 1, start: 300, end: 305 },
  ]);
});

test("segmentsOf: 하루 전체는 조각 21개", () => {
  const segs = grid.segmentsOf(300, 1560);
  assert.equal(segs.length, 21);
  assert.equal(segs[0].row, 0);
  assert.equal(segs[20].row, 20);
  for (const s of segs) assert.equal(s.span, 12);
});

test("segmentsOf: span 합은 항상 길이/5", () => {
  for (const [a, b] of [[300, 305], [350, 380], [300, 1560], [1000, 1005], [415, 425]]) {
    const total = grid.segmentsOf(a, b).reduce((sum, s) => sum + s.span, 0);
    assert.equal(total, (b - a) / 5, a + "~" + b);
  }
});

test("segmentsOf: 길이가 0 이하면 빈 배열", () => {
  assert.deepEqual(grid.segmentsOf(360, 360), []);
  assert.deepEqual(grid.segmentsOf(420, 360), []);
});

// 라벨을 첫 조각에 넣으면 05:55~08:00 처럼 첫 조각이 한 칸(25px)인 블록에서
// 글자가 통째로 잘린다.
test("widestIndex: 가장 넓은 조각, 동점이면 앞선 것", () => {
  assert.equal(grid.widestIndex(grid.segmentsOf(355, 480)), 1);
  assert.equal(grid.widestIndex(grid.segmentsOf(360, 420)), 0);
  assert.equal(grid.widestIndex([{ span: 3 }, { span: 3 }, { span: 1 }]), 0);
  assert.equal(grid.widestIndex([]), 0);
});

const store = require("../src/store.js");

const B = (start, end, id) => ({ id: id || "b" + start, subjectId: null, text: "", start, end, done: false });

// 격자에서는 손가락이 얹힌 칸이 선택에 포함되어야 한다(한글에서 글자를 끌 때처럼).
// 05:20 칸에서 06:00 칸까지 끌면 40분이 아니라 45분이다.
test("selectionArgs: 앞으로 끌면 커서 칸의 끝까지", () => {
  assert.deepEqual(grid.selectionArgs(320, 360), { anchor: 320, cursor: 365 });
});

test("selectionArgs: 뒤로 끌면 앵커 칸의 끝을 앵커로 넘긴다", () => {
  assert.deepEqual(grid.selectionArgs(360, 320), { anchor: 365, cursor: 320 });
});

test("selectionArgs: 같은 칸이면 5분", () => {
  assert.deepEqual(grid.selectionArgs(320, 320), { anchor: 320, cursor: 325 });
});

test("selectionArgs 결과를 limitRange에 넘기면 앵커 칸이 포함된다", () => {
  const blocks = [B(400, 460)];
  const f = grid.selectionArgs(320, 360);
  assert.deepEqual(store.limitRange(blocks, f.anchor, f.cursor), { start: 320, end: 365 });
  const b = grid.selectionArgs(360, 320);
  assert.deepEqual(store.limitRange(blocks, b.anchor, b.cursor), { start: 320, end: 365 });
});

test("plusSlotFor: 틈이 넉넉하면 직전 블록과 같은 길이", () => {
  const blocks = [B(360, 420), B(480, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 480 });
});

test("plusSlotFor: 틈이 좁으면 틈 전체", () => {
  const blocks = [B(360, 420), B(450, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 450 });
});

test("plusSlotFor: 다음 블록이 붙어 있으면 null", () => {
  const blocks = [B(360, 420), B(420, 480)];
  assert.equal(grid.plusSlotFor(blocks, blocks[0]), null);
});

test("plusSlotFor: DAY_END에서 끝나면 null", () => {
  const blocks = [B(1500, 1560)];
  assert.equal(grid.plusSlotFor(blocks, blocks[0]), null);
});

test("plusSlotFor: 틈이 정확히 5분이면 5분짜리", () => {
  const blocks = [B(360, 420), B(425, 480)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 425 });
});

test("plusSlotFor: 뒤가 비어 있으면 DAY_END까지가 틈", () => {
  const blocks = [B(360, 370)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 370, end: 380 });
  assert.deepEqual(grid.plusSlotFor([B(1540, 1550)], B(1540, 1550)), { start: 1550, end: 1560 });
});

// 정렬 순서에 기대면 안 된다. 붙여넣기 직후처럼 순서가 흐트러진 배열도 들어온다.
test("plusSlotFor: 블록 순서가 뒤죽박죽이어도 가장 이른 다음 블록을 찾는다", () => {
  const blocks = [B(900, 960), B(360, 420), B(480, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[1]), { start: 420, end: 480 });
});
