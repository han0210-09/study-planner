const test = require("node:test");
const assert = require("node:assert/strict");
const auto = require("../src/auto.js");
const dt = require("../src/datetime.js");

const T = (id, text, extra) => Object.assign({ id, subjectId: null, text, done: false }, extra);
const B = (id, start, end, extra) =>
  Object.assign({ id, subjectId: null, text: "", start, end, done: false, todoId: null }, extra);
const day = (todos, blocks) => ({ todos, blocks });

// ---- 빈 자리 찾기 ----

test("gapsOf: 블록이 없으면 하루 전체가 빈 자리다", () => {
  assert.deepEqual(auto.gapsOf([]), [{ start: dt.DAY_START, end: dt.DAY_END }]);
});

test("gapsOf: 블록 사이와 앞뒤를 모두 찾는다", () => {
  const gaps = auto.gapsOf([B("b1", 600, 660), B("b2", 780, 840)]);
  assert.deepEqual(gaps, [
    { start: 300, end: 600 },
    { start: 660, end: 780 },
    { start: 840, end: 1560 },
  ]);
});

test("gapsOf: 순서가 뒤죽박죽이어도 맞게 찾는다", () => {
  const gaps = auto.gapsOf([B("b2", 780, 840), B("b1", 600, 660)]);
  assert.equal(gaps.length, 3);
  assert.deepEqual(gaps[1], { start: 660, end: 780 });
});

test("gapsOf: 너무 짧은 틈은 자리로 세지 않는다", () => {
  // 20분(MIN_CHUNK)보다 좁은 곳에 앉히면 앉자마자 일어나야 한다.
  const gaps = auto.gapsOf([B("b1", 600, 660), B("b2", 670, 700)]);
  assert.ok(!gaps.some((g) => g.start === 660), JSON.stringify(gaps));
});

test("gapsOf: from/to 로 시간대를 좁힌다", () => {
  assert.deepEqual(auto.gapsOf([], 600, 720), [{ start: 600, end: 720 }]);
  // 범위 밖 블록은 무시한다.
  assert.deepEqual(auto.gapsOf([B("b1", 300, 360)], 600, 720), [{ start: 600, end: 720 }]);
});

// ---- 차례 ----

const EV = (title, startDate) => ({ id: title, title, type: "exam", color: "#000", startDate, endDate: startDate, memo: "" });

test("ordered: 시험이 가까운 것이 먼저다", () => {
  const todos = [T("t1", "영어 단어", { subjectId: "eng" }), T("t2", "수학 문제집", { subjectId: "math" })];
  const events = [EV("영어 시험", "2026-08-20"), EV("수학 시험", "2026-08-10")];
  const name = (id) => ({ eng: "영어", math: "수학" }[id] || "");
  const out = auto.ordered(todos, events, "2026-08-06", name);
  assert.deepEqual(out.map((t) => t.id), ["t2", "t1"]);
});

test("ordered: 일정이 없는 것은 뒤로, 서로는 원래 순서", () => {
  const todos = [T("t1", "독서"), T("t2", "수학 문제집", { subjectId: "math" }), T("t3", "일기")];
  const events = [EV("수학 시험", "2026-08-10")];
  const out = auto.ordered(todos, events, "2026-08-06", (id) => (id === "math" ? "수학" : ""));
  assert.deepEqual(out.map((t) => t.id), ["t2", "t1", "t3"]);
});

test("ordered: 지나간 일정은 급하지 않다", () => {
  const todos = [T("t1", "독서"), T("t2", "수학 문제집", { subjectId: "math" })];
  const events = [EV("수학 시험", "2026-08-01")];
  const out = auto.ordered(todos, events, "2026-08-06", (id) => (id === "math" ? "수학" : ""));
  assert.deepEqual(out.map((t) => t.id), ["t1", "t2"]);
});

test("ordered: 일정이 하나도 없으면 원래 순서 그대로", () => {
  const todos = [T("t1", "a"), T("t2", "b"), T("t3", "c")];
  assert.deepEqual(auto.ordered(todos, [], "2026-08-06").map((t) => t.id), ["t1", "t2", "t3"]);
});

// ---- 앉히기 ----

test("place: 덩어리로 쪼개고 사이에 틈을 둔다", () => {
  const r = auto.place([{ start: 600, end: 900 }], 100, 50, 10);
  assert.deepEqual(r.slots, [{ start: 600, end: 650 }, { start: 660, end: 710 }]);
  assert.equal(r.left, 0);
});

test("place: 자리가 모자라면 남은 분을 알려준다", () => {
  const r = auto.place([{ start: 600, end: 640 }], 120, 50, 10);
  assert.deepEqual(r.slots, [{ start: 600, end: 640 }]);
  assert.equal(r.left, 80);
});

test("place: 5분 단위로만 앉힌다", () => {
  const r = auto.place([{ start: 600, end: 900 }], 47, 50, 10);
  for (const s of r.slots) {
    assert.equal(s.start % dt.SLOT, 0);
    assert.equal(s.end % dt.SLOT, 0);
  }
});

test("place: 20분보다 짧게는 쪼개지 않는다", () => {
  const r = auto.place([{ start: 600, end: 900 }], 15, 50, 10);
  assert.deepEqual(r.slots, []);
  assert.equal(r.left, 15);
});

// ---- 이미 잡은 것은 건드리지 않는다 ----

test("unplaced: 블록이 붙은 할 일은 뺀다", () => {
  const d = day([T("t1", "a"), T("t2", "b")], [B("b1", 600, 660, { todoId: "t1" })]);
  assert.deepEqual(auto.unplaced(d).map((t) => t.id), ["t2"]);
});

test("plan: 이미 잡아둔 블록을 옮기지도 지우지도 않는다", () => {
  const fixed = B("b1", 600, 660, { todoId: "t1" });
  const d = day([T("t1", "이미 잡음"), T("t2", "새것")], [fixed]);
  const r = auto.plan(d, [], "2026-08-06");
  assert.ok(r.blocks.every((b) => b.todoId === "t2"), JSON.stringify(r.blocks));
  // 원래 블록 자리와 겹치지 않는다.
  assert.ok(r.blocks.every((b) => b.end <= 600 || b.start >= 660), JSON.stringify(r.blocks));
});

test("plan: 만든 블록끼리도 겹치지 않는다", () => {
  const d = day([T("t1", "a"), T("t2", "b"), T("t3", "c")], []);
  const r = auto.plan(d, [], "2026-08-06");
  const sorted = r.blocks.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].start >= sorted[i - 1].end,
      "겹침: " + JSON.stringify(sorted[i - 1]) + " / " + JSON.stringify(sorted[i]));
  }
});

test("plan: 할 일마다 같은 시간을 준다", () => {
  const d = day([T("t1", "a"), T("t2", "b"), T("t3", "c")], []);
  const r = auto.plan(d, [], "2026-08-06");
  const per = {};
  for (const b of r.blocks) per[b.todoId] = (per[b.todoId] || 0) + (b.end - b.start);
  assert.deepEqual(per, { t1: 50, t2: 50, t3: 50 });
});

test("plan: 하루를 통째로 채우지 않는다", () => {
  // 빈 시간을 나눠 가지면 세 개만 넣어도 새벽 다섯 시부터 새벽 두 시까지
  // 꽉 찬다. 그런 계획은 아무도 안 지킨다.
  const d = day([T("t1", "a"), T("t2", "b"), T("t3", "c")], []);
  const r = auto.plan(d, [], "2026-08-06");
  const filled = r.blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  assert.ok(filled <= 180, filled + "분이나 채웠다");
});

test("plan: each 로 할 일당 시간을 정한다", () => {
  const d = day([T("t1", "a"), T("t2", "b")], []);
  const r = auto.plan(d, [], "2026-08-06", { each: 120 });
  const per = {};
  for (const b of r.blocks) per[b.todoId] = (per[b.todoId] || 0) + (b.end - b.start);
  assert.deepEqual(per, { t1: 120, t2: 120 });
});

test("plan: 만든 블록은 할 일과 과목을 물려받는다", () => {
  const d = day([T("t1", "독서 지문", { subjectId: "kor" })], []);
  const r = auto.plan(d, [], "2026-08-06");
  assert.ok(r.blocks.length > 0);
  for (const b of r.blocks) {
    assert.equal(b.todoId, "t1");
    assert.equal(b.subjectId, "kor");
    assert.equal(b.text, "독서 지문");
    assert.equal(b.done, false);
  }
});

test("plan: 시간대를 좁히면 그 안에만 앉힌다", () => {
  const d = day([T("t1", "a")], []);
  const r = auto.plan(d, [], "2026-08-06", { from: 1080, to: 1260 });
  assert.ok(r.blocks.length > 0);
  assert.ok(r.blocks.every((b) => b.start >= 1080 && b.end <= 1260), JSON.stringify(r.blocks));
});

test("plan: 자리가 없으면 못 앉힌 것을 알려준다", () => {
  const d = day([T("t1", "a"), T("t2", "b")], []);
  const r = auto.plan(d, [], "2026-08-06", { from: 600, to: 630 });
  assert.equal(r.blocks.length + r.skipped.length, 2);
  assert.ok(r.skipped.length >= 1, JSON.stringify(r));
});

test("plan: 앉힐 할 일이 없으면 빈 결과", () => {
  assert.deepEqual(auto.plan(day([], []), [], "2026-08-06"), { blocks: [], skipped: [] });
  const d = day([T("t1", "a")], [B("b1", 600, 660, { todoId: "t1" })]);
  assert.deepEqual(auto.plan(d, [], "2026-08-06").blocks, []);
});

test("plan: 하루 밖으로 나가지 않는다", () => {
  const d = day([T("t1", "a"), T("t2", "b")], []);
  const r = auto.plan(d, [], "2026-08-06");
  assert.ok(r.blocks.every((b) => b.start >= dt.DAY_START && b.end <= dt.DAY_END), JSON.stringify(r.blocks));
});

test("plan: 급한 것이 이른 시각을 가져간다", () => {
  const todos = [T("t1", "영어 단어", { subjectId: "eng" }), T("t2", "수학 문제집", { subjectId: "math" })];
  const events = [EV("수학 시험", "2026-08-10")];
  const r = auto.plan(day(todos, []), events, "2026-08-06",
    { subjectName: (id) => ({ eng: "영어", math: "수학" }[id] || "") });
  const first = r.blocks[0];
  assert.equal(first.todoId, "t2", JSON.stringify(r.blocks.slice(0, 3)));
});
