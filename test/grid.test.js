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
