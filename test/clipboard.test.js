const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");
const clipboard = require("../src/clipboard.js");

const ALL = { type: "all" };

function baseState() {
  const { state } = store.sanitizeState(null);
  return state;
}

function seedDay(state, key, blocks, todos) {
  state.days[key] = {
    achievement: 50, memo: "원본메모", updatedAt: 1,
    todos: todos || [{ id: "t1", subjectId: "kor", text: "문학 20p", done: true }],
    blocks: blocks || [{ id: "b1", subjectId: "math", text: "미적분", start: 540, end: 660, done: true }],
  };
  return state;
}

test("resolveTargetDates: 이 날", () => {
  assert.deepEqual(clipboard.resolveTargetDates({ type: "day" }, ALL, "2026-08-02"), ["2026-08-02"]);
});

test("resolveTargetDates: 이번 주는 일요일 시작", () => {
  const week = clipboard.resolveTargetDates({ type: "week" }, ALL, "2026-08-05");
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-08-02");
  assert.equal(week[6], "2026-08-08");
});

test("resolveTargetDates: 이번 달", () => {
  const month = clipboard.resolveTargetDates({ type: "month" }, ALL, "2026-08-15");
  assert.equal(month.length, 31);
  assert.equal(month[0], "2026-08-01");
  assert.equal(month[30], "2026-08-31");
});

test("resolveTargetDates: 2월과 윤년", () => {
  assert.equal(clipboard.resolveTargetDates({ type: "month" }, ALL, "2026-02-10").length, 28);
  assert.equal(clipboard.resolveTargetDates({ type: "month" }, ALL, "2028-02-10").length, 29);
});

test("resolveTargetDates: 올해", () => {
  assert.equal(clipboard.resolveTargetDates({ type: "year" }, ALL, "2026-03-01").length, 365);
  assert.equal(clipboard.resolveTargetDates({ type: "year" }, ALL, "2028-03-01").length, 366);
  const year = clipboard.resolveTargetDates({ type: "year" }, ALL, "2026-03-01");
  assert.equal(year[0], "2026-01-01");
  assert.equal(year[364], "2026-12-31");
});

test("resolveTargetDates: 직접 기간", () => {
  const custom = clipboard.resolveTargetDates(
    { type: "custom", from: "2026-08-01", to: "2026-08-05" }, ALL, "2026-08-02");
  assert.deepEqual(custom, ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]);
});

test("resolveTargetDates: from과 to가 뒤집혀도 정상 동작", () => {
  const custom = clipboard.resolveTargetDates(
    { type: "custom", from: "2026-08-05", to: "2026-08-03" }, ALL, "2026-08-02");
  assert.deepEqual(custom, ["2026-08-03", "2026-08-04", "2026-08-05"]);
});

test("요일 필터: 평일 / 주말", () => {
  const weekday = clipboard.resolveTargetDates({ type: "month" }, { type: "weekday" }, "2026-08-15");
  const weekend = clipboard.resolveTargetDates({ type: "month" }, { type: "weekend" }, "2026-08-15");
  assert.equal(weekday.length, 21);
  assert.equal(weekend.length, 10);
  assert.equal(weekend[0], "2026-08-01");
  assert.equal(weekday[0], "2026-08-03");
});

test("요일 필터: 개별 선택(월수금)", () => {
  const picked = clipboard.resolveTargetDates(
    { type: "month" }, { type: "custom", days: [1, 3, 5] }, "2026-08-15");
  assert.equal(picked.length, 13);
  assert.equal(picked[0], "2026-08-03");
});

test("요일 필터: 빈 선택은 빈 결과", () => {
  const none = clipboard.resolveTargetDates({ type: "month" }, { type: "custom", days: [] }, "2026-08-15");
  assert.deepEqual(none, []);
});

test("copyDay: 완료 체크와 메모·성취도는 복사하지 않는다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  const clip = clipboard.copyDay(state, "2026-08-02");
  assert.equal(clip.kind, "day");
  assert.equal(clip.payload.blocks[0].done, false);
  assert.equal(clip.payload.todos[0].done, false);
  assert.equal(clip.payload.blocks[0].text, "미적분");
  assert.equal(clip.payload.achievement, undefined);
  assert.equal(clip.payload.memo, undefined);
  assert.ok(clip.copiedAt > 0);
});

test("copyDay: 빈 날은 복사할 수 없다", () => {
  assert.equal(clipboard.copyDay(baseState(), "2030-01-01"), null);
});

test("copyWeek: 요일별로 담는다", () => {
  const state = baseState();
  seedDay(state, "2026-08-03");
  seedDay(state, "2026-08-05");
  const clip = clipboard.copyWeek(state, "2026-08-05");
  assert.equal(clip.kind, "week");
  assert.ok(clip.payload.byWeekday["1"]);
  assert.ok(clip.payload.byWeekday["3"]);
  assert.equal(clip.payload.byWeekday["0"], undefined);
});

test("copyWeek: 그 주가 전부 비면 null", () => {
  assert.equal(clipboard.copyWeek(baseState(), "2030-01-01"), null);
});

test("paste overwrite: 계획을 갈아끼우고 메모·성취도는 남긴다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  state.days["2026-08-10"] = {
    achievement: 90, memo: "지키자", updatedAt: 1,
    todos: [{ id: "old", subjectId: null, text: "옛날 할 일", done: true }],
    blocks: [{ id: "ob", subjectId: null, text: "옛날", start: 300, end: 360, done: true }],
  };
  const clip = clipboard.copyDay(state, "2026-08-02");
  const result = clipboard.paste(state, clip, ["2026-08-10"], "overwrite");
  const day = state.days["2026-08-10"];
  assert.equal(result.applied, 1);
  assert.equal(day.blocks.length, 1);
  assert.equal(day.blocks[0].text, "미적분");
  assert.equal(day.blocks[0].done, false);
  assert.equal(day.todos.length, 1);
  assert.equal(day.memo, "지키자");
  assert.equal(day.achievement, 90);
});

test("paste: 붙여넣은 항목의 id는 새로 발급된다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  const clip = clipboard.copyDay(state, "2026-08-02");
  clipboard.paste(state, clip, ["2026-08-10", "2026-08-11"], "overwrite");
  const a = state.days["2026-08-10"].blocks[0].id;
  const b = state.days["2026-08-11"].blocks[0].id;
  assert.notEqual(a, b);
  assert.notEqual(a, "b1");
});

test("paste merge: 겹치는 블록만 건너뛴다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  state.days["2026-08-10"] = {
    achievement: 0, memo: "", updatedAt: 1, todos: [],
    blocks: [{ id: "ob", subjectId: null, text: "선점", start: 600, end: 700, done: false }],
  };
  const clip = clipboard.copyDay(state, "2026-08-02");
  const result = clipboard.paste(state, clip, ["2026-08-10"], "merge");
  assert.equal(result.applied, 1);
  assert.equal(result.skippedBlocks, 1);
  assert.equal(state.days["2026-08-10"].blocks.length, 1);
  assert.equal(state.days["2026-08-10"].todos.length, 1);
});

test("paste merge: 겹치지 않으면 추가하고 시작시각 순으로 정렬한다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  state.days["2026-08-10"] = {
    achievement: 0, memo: "", updatedAt: 1, todos: [],
    blocks: [{ id: "ob", subjectId: null, text: "아침", start: 300, end: 360, done: false }],
  };
  const clip = clipboard.copyDay(state, "2026-08-02");
  const result = clipboard.paste(state, clip, ["2026-08-10"], "merge");
  assert.equal(result.skippedBlocks, 0);
  const blocks = state.days["2026-08-10"].blocks;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].start, 300);
  assert.equal(blocks[1].start, 540);
});

test("paste skip: 계획이 있는 날은 건드리지 않는다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  state.days["2026-08-10"] = {
    achievement: 0, memo: "", updatedAt: 1, todos: [],
    blocks: [{ id: "ob", subjectId: null, text: "선점", start: 300, end: 360, done: false }],
  };
  const result = clipboard.paste(state, clipboard.copyDay(state, "2026-08-02"),
    ["2026-08-10", "2026-08-11"], "skip");
  assert.equal(result.applied, 1);
  assert.equal(result.skipped, 1);
  assert.equal(state.days["2026-08-10"].blocks[0].text, "선점");
  assert.equal(state.days["2026-08-11"].blocks[0].text, "미적분");
});

test("paste week: 대상 날짜의 요일에 맞는 계획을 넣는다", () => {
  const state = baseState();
  seedDay(state, "2026-08-03", [{ id: "m", subjectId: "math", text: "월요일수학", start: 540, end: 600, done: false }]);
  seedDay(state, "2026-08-05", [{ id: "w", subjectId: "eng", text: "수요일영어", start: 600, end: 660, done: false }]);
  const clip = clipboard.copyWeek(state, "2026-08-05");
  const targets = clipboard.resolveTargetDates(
    { type: "custom", from: "2026-08-10", to: "2026-08-16" }, ALL, "2026-08-10");
  const result = clipboard.paste(state, clip, targets, "overwrite");
  assert.equal(result.applied, 2);
  assert.equal(state.days["2026-08-10"].blocks[0].text, "월요일수학");
  assert.equal(state.days["2026-08-12"].blocks[0].text, "수요일영어");
  assert.equal(state.days["2026-08-11"], undefined);
});

test("paste: 대상이 없으면 아무 일도 하지 않는다", () => {
  const state = seedDay(baseState(), "2026-08-02");
  const result = clipboard.paste(state, clipboard.copyDay(state, "2026-08-02"), [], "overwrite");
  assert.deepEqual(result, { applied: 0, skipped: 0, skippedBlocks: 0 });
});

test("paste: 클립보드가 없으면 아무 일도 하지 않는다", () => {
  const state = baseState();
  const result = clipboard.paste(state, null, ["2026-08-10"], "overwrite");
  assert.equal(result.applied, 0);
});

test("describeClip", () => {
  const state = seedDay(baseState(), "2026-08-02");
  assert.equal(clipboard.describeClip(clipboard.copyDay(state, "2026-08-02")), "하루 계획 (할 일 1개, 블록 1개)");
  // 2026-08-02(일)과 08-03(월)은 같은 주다. 주는 일요일에 시작하므로 둘 다 08-02 주에 든다.
  seedDay(state, "2026-08-03");
  assert.equal(clipboard.describeClip(clipboard.copyWeek(state, "2026-08-03")), "일주일 계획 (2개 요일)");
  // 다음 주에 하루만 심으면 1개 요일이다.
  const next = baseState();
  seedDay(next, "2026-08-10");
  assert.equal(clipboard.describeClip(clipboard.copyWeek(next, "2026-08-10")), "일주일 계획 (1개 요일)");
  assert.equal(clipboard.describeClip(null), "복사한 계획 없음");
});
