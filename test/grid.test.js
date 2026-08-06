const test = require("node:test");
const assert = require("node:assert/strict");
const grid = require("../src/grid.js");

test("ROWS / SPAN", () => {
  assert.equal(grid.ROWS, 21, "05:00 ~ 익일 02:00");
  assert.equal(grid.SPAN, 1260, "하루 전체 분 수");
});

// 시간이 위에서 아래로 곧게 흐른다. 자리는 하루 전체를 100% 로 본 비율이다.
test("offsetPercent: 하루의 시작이 0%, 끝이 100%", () => {
  assert.equal(grid.offsetPercent(300), 0);
  assert.equal(grid.offsetPercent(1560), 100);
  assert.equal(grid.offsetPercent(930), 50, "한가운데");
});

test("offsetPercent: 하루 밖은 하루 안으로 끌어당긴다", () => {
  assert.equal(grid.offsetPercent(0), 0);
  assert.equal(grid.offsetPercent(99999), 100);
});

test("spanPercent: 길이가 곧 높이다", () => {
  assert.equal(grid.spanPercent(300, 1560), 100);
  assert.equal(grid.spanPercent(600, 660), (60 / 1260) * 100);
  assert.equal(grid.spanPercent(600, 605), (5 / 1260) * 100, "5분짜리도 자리가 있다");
});

test("minutesAt: 세로 위치를 5분 칸으로 내린다", () => {
  assert.equal(grid.minutesAt(0), 300);
  assert.equal(grid.minutesAt(1), 1560);
  assert.equal(grid.minutesAt(0.5), 930);
  // 칸 안 어디를 찍어도 그 칸의 시작이 나온다.
  assert.equal(grid.minutesAt(1 / 1260), 300, "1분 자리는 아직 05:00 칸");
  assert.equal(grid.minutesAt(4.9 / 1260), 300);
  assert.equal(grid.minutesAt(5 / 1260), 305);
});

test("offsetPercent 와 minutesAt 은 서로 되돌린다", () => {
  for (const m of [300, 305, 600, 930, 1235, 1555]) {
    assert.equal(grid.minutesAt(grid.offsetPercent(m) / 100), m, String(m));
  }
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
