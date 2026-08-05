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

// ---- 맞닿은 블록의 경계 ----

test("neighborAt: 경계를 맞댄 블록만 찾는다", () => {
  const blocks = [B(360, 420), B(420, 480), B(500, 560)];
  assert.equal(grid.neighborAt(blocks, blocks[0], "end").start, 420);
  assert.equal(grid.neighborAt(blocks, blocks[1], "start").start, 360);
  // 480 과 500 사이에는 틈이 있으므로 이웃이 아니다.
  assert.equal(grid.neighborAt(blocks, blocks[1], "end"), null);
  assert.equal(grid.neighborAt(blocks, blocks[2], "start"), null);
});

test("boundaryRange: 이웃이 없으면 빈 칸 끝까지 간다", () => {
  const blocks = [B(600, 660), B(800, 860)];
  const end = grid.boundaryRange(blocks, blocks[0], "end");
  assert.equal(end.max, 800, "다음 블록 앞에서 멈춘다");
  assert.equal(end.min, 605, "자기가 최소 5분은 남는다");
  const start = grid.boundaryRange(blocks, blocks[0], "start");
  assert.equal(start.min, 300, "앞이 비었으면 하루 시작까지");
  assert.equal(start.max, 655);
});

test("boundaryRange: 이웃이 붙어 있으면 이웃도 5분은 남긴다", () => {
  const blocks = [B(360, 420), B(420, 480)];
  const r = grid.boundaryRange(blocks, blocks[1], "start");
  assert.equal(r.min, 365, "앞 블록이 5분은 남아야 한다");
  assert.equal(r.max, 475);
  assert.equal(r.neighbor.start, 360);
});

test("resizeAt: 맞닿은 두 블록이 함께 움직인다", () => {
  const blocks = [B(360, 420), B(420, 480)];
  const r = grid.resizeAt(blocks, blocks[1], "start", 400);
  assert.equal(r.at, 400);
  assert.equal(r.blocks.length, 2, "둘 다 바뀐다");
  const moved = r.blocks.find((b) => b.start === 400);
  const shrunk = r.blocks.find((b) => b.start === 360);
  assert.equal(moved.end, 480, "잡은 블록은 앞으로 늘었다");
  assert.equal(shrunk.end, 400, "이웃은 그만큼 줄었다");
});

test("resizeAt: 이웃이 없으면 잡은 블록만 바뀐다", () => {
  const blocks = [B(600, 660)];
  const r = grid.resizeAt(blocks, blocks[0], "end", 720);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].end, 720);
});

test("resizeAt: 범위를 넘겨도 이웃을 5분 밑으로 깎지 않는다", () => {
  const blocks = [B(360, 420), B(420, 480)];
  const r = grid.resizeAt(blocks, blocks[1], "start", 0);
  assert.equal(r.at, 365, "앞 블록에 5분이 남는 자리에서 멈춘다");
  assert.equal(r.blocks.find((b) => b.start === 360).end, 365);
});

test("resizeAt: 자기 자신도 5분 밑으로는 못 줄인다", () => {
  const blocks = [B(600, 660)];
  assert.equal(grid.resizeAt(blocks, blocks[0], "end", 0).at, 605);
  assert.equal(grid.resizeAt(blocks, blocks[0], "start", 9999).at, 655);
});

test("resizeAt: 제자리면 null 이다", () => {
  const blocks = [B(600, 660)];
  assert.equal(grid.resizeAt(blocks, blocks[0], "end", 660), null);
});

// 붙여넣기 직후처럼 정렬이 흐트러진 배열도 들어온다.
test("boundaryRange: 블록 순서가 뒤죽박죽이어도 맞는 이웃을 찾는다", () => {
  const blocks = [B(900, 960), B(360, 420), B(420, 480)];
  const r = grid.boundaryRange(blocks, blocks[2], "start");
  assert.equal(r.neighbor.start, 360);
});
