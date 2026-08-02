const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");
const events = require("../src/events.js");

const E = (id, startDate, endDate, title) => ({
  id, title: title || id, type: "assessment", color: "#FF8787",
  startDate, endDate: endDate || startDate, memo: "",
});

test("EVENT_TYPES: 네 종류가 정의되어 있다", () => {
  assert.deepEqual(events.EVENT_TYPES.map((t) => t.id), ["assessment", "exam", "homework", "etc"]);
  assert.equal(events.typeOf("assessment").label, "수행평가");
  assert.equal(events.typeOf("없음").id, "etc");
});

test("onDate: 기간형 일정은 모든 날에 걸린다", () => {
  const list = [E("e1", "2026-08-14"), E("e2", "2026-08-20", "2026-08-22")];
  assert.deepEqual(events.onDate(list, "2026-08-14").map((e) => e.id), ["e1"]);
  assert.deepEqual(events.onDate(list, "2026-08-20").map((e) => e.id), ["e2"]);
  assert.deepEqual(events.onDate(list, "2026-08-21").map((e) => e.id), ["e2"]);
  assert.deepEqual(events.onDate(list, "2026-08-22").map((e) => e.id), ["e2"]);
  assert.deepEqual(events.onDate(list, "2026-08-23"), []);
});

test("inMonth: 날짜 키별로 묶어 돌려준다", () => {
  const list = [E("e1", "2026-08-14"), E("e2", "2026-07-31", "2026-08-02")];
  const map = events.inMonth(list, 2026, 8);
  assert.deepEqual(map["2026-08-14"].map((e) => e.id), ["e1"]);
  assert.deepEqual(map["2026-08-01"].map((e) => e.id), ["e2"]);
  assert.deepEqual(map["2026-08-02"].map((e) => e.id), ["e2"]);
  assert.equal(map["2026-07-31"], undefined);
});

test("nextEvent: 당일을 포함해 가장 가까운 일정", () => {
  const list = [E("e2", "2026-08-20"), E("e1", "2026-08-14"), E("e0", "2026-07-01")];
  assert.equal(events.nextEvent(list, "2026-08-02").id, "e1");
  assert.equal(events.nextEvent(list, "2026-08-14").id, "e1");
  assert.equal(events.nextEvent(list, "2026-08-15").id, "e2");
  assert.equal(events.nextEvent(list, "2026-09-01"), null);
  assert.equal(events.nextEvent([], "2026-08-02"), null);
});

test("nextEvent: 같은 날이면 제목 오름차순", () => {
  const list = [E("eB", "2026-08-14", null, "나수행"), E("eA", "2026-08-14", null, "가수행")];
  assert.equal(events.nextEvent(list, "2026-08-02").id, "eA");
});

test("dday: 남은 일수를 계산한다", () => {
  const list = [E("e1", "2026-08-14")];
  assert.equal(events.dday(list, "2026-08-02").days, 12);
  assert.equal(events.dday(list, "2026-08-14").days, 0);
  assert.equal(events.dday(list, "2026-08-15"), null);
});

test("formatDday", () => {
  assert.equal(events.formatDday(0), "D-DAY");
  assert.equal(events.formatDday(12), "D-12");
  assert.equal(events.formatDday(1), "D-1");
});

test("isPast", () => {
  assert.equal(events.isPast(E("e1", "2026-08-01"), "2026-08-02"), true);
  assert.equal(events.isPast(E("e1", "2026-08-02"), "2026-08-02"), false);
  assert.equal(events.isPast(E("e1", "2026-07-30", "2026-08-02"), "2026-08-02"), false);
});

test("addEvent: 검증하고 추가한다", () => {
  const { state } = store.sanitizeState(null);
  const created = events.addEvent(state, { title: "국어 수행평가", type: "assessment", startDate: "2026-08-14" });
  assert.ok(created.id);
  assert.equal(created.endDate, "2026-08-14");
  assert.equal(created.color, events.typeOf("assessment").color);
  assert.equal(state.events.length, 1);
  assert.equal(events.addEvent(state, { title: "  ", startDate: "2026-08-14" }), null);
  assert.equal(events.addEvent(state, { title: "x", startDate: "엉망" }), null);
});

test("addEvent: 종료일이 시작일보다 빠르면 뒤집는다", () => {
  const { state } = store.sanitizeState(null);
  const created = events.addEvent(state, { title: "시험기간", startDate: "2026-08-22", endDate: "2026-08-20" });
  assert.equal(created.startDate, "2026-08-20");
  assert.equal(created.endDate, "2026-08-22");
});

test("updateEvent / removeEvent", () => {
  const { state } = store.sanitizeState(null);
  const created = events.addEvent(state, { title: "수행", startDate: "2026-08-14" });
  assert.equal(events.updateEvent(state, created.id, { title: "수정됨" }), true);
  assert.equal(state.events[0].title, "수정됨");
  assert.equal(events.updateEvent(state, "없음", { title: "x" }), false);
  assert.equal(events.removeEvent(state, created.id), true);
  assert.equal(state.events.length, 0);
  assert.equal(events.removeEvent(state, "없음"), false);
});
