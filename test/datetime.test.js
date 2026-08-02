const test = require("node:test");
const assert = require("node:assert/strict");
const dt = require("../src/datetime.js");

test("상수", () => {
  assert.equal(dt.DAY_START, 300);
  assert.equal(dt.DAY_END, 1560);
  assert.equal(dt.SLOT, 5);
  assert.equal(dt.DAY_BOUNDARY_HOUR, 4);
});

test("snapToSlot: 가장 가까운 5분으로 반올림", () => {
  assert.equal(dt.snapToSlot(300), 300);
  assert.equal(dt.snapToSlot(302), 300);
  assert.equal(dt.snapToSlot(303), 305);
  assert.equal(dt.snapToSlot(307), 305);
  assert.equal(dt.snapToSlot(308), 310);
  assert.equal(dt.snapToSlot(302.6), 305);
});

test("clampToDay: 계획 범위 밖을 잘라낸다", () => {
  assert.equal(dt.clampToDay(200), 300);
  assert.equal(dt.clampToDay(300), 300);
  assert.equal(dt.clampToDay(900), 900);
  assert.equal(dt.clampToDay(1560), 1560);
  assert.equal(dt.clampToDay(2000), 1560);
});

test("minutesToLabel: 24시 이후도 정상 표기", () => {
  assert.equal(dt.minutesToLabel(300), "05:00");
  assert.equal(dt.minutesToLabel(545), "09:05");
  assert.equal(dt.minutesToLabel(720), "12:00");
  assert.equal(dt.minutesToLabel(1439), "23:59");
  assert.equal(dt.minutesToLabel(1440), "00:00");
  assert.equal(dt.minutesToLabel(1530), "01:30");
  assert.equal(dt.minutesToLabel(1560), "02:00");
});

test("formatDuration", () => {
  assert.equal(dt.formatDuration(0), "0분");
  assert.equal(dt.formatDuration(45), "45분");
  assert.equal(dt.formatDuration(120), "2시간");
  assert.equal(dt.formatDuration(500), "8시간 20분");
});

test("dateKey / parseDateKey: 로컬 기준 왕복", () => {
  assert.equal(dt.dateKey(new Date(2026, 7, 2)), "2026-08-02");
  assert.equal(dt.dateKey(new Date(2026, 0, 9)), "2026-01-09");
  const d = dt.parseDateKey("2026-08-02");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 2);
  assert.equal(dt.dateKey(dt.parseDateKey("2026-12-31")), "2026-12-31");
});

test("addDays: 월말과 윤년 경계", () => {
  assert.equal(dt.addDays("2026-08-02", 1), "2026-08-03");
  assert.equal(dt.addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(dt.addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(dt.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(dt.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(dt.addDays("2026-08-02", 0), "2026-08-02");
});

test("daysBetween", () => {
  assert.equal(dt.daysBetween("2026-08-02", "2026-08-02"), 0);
  assert.equal(dt.daysBetween("2026-08-02", "2026-08-14"), 12);
  assert.equal(dt.daysBetween("2026-08-14", "2026-08-02"), -12);
  assert.equal(dt.daysBetween("2026-02-28", "2026-03-01"), 1);
});

test("weekdayOf: 0=일요일", () => {
  assert.equal(dt.weekdayOf("2026-08-02"), 0);
  assert.equal(dt.weekdayOf("2026-08-03"), 1);
  assert.equal(dt.weekdayOf("2026-08-01"), 6);
});

test("plannerDateKey: 하루 경계는 오전 4시", () => {
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 2, 23, 59)), "2026-08-02");
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 3, 0, 0)), "2026-08-02");
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 3, 1, 30)), "2026-08-02");
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 3, 3, 59)), "2026-08-02");
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 3, 4, 0)), "2026-08-03");
  assert.equal(dt.plannerDateKey(new Date(2026, 7, 3, 12, 0)), "2026-08-03");
  assert.equal(dt.plannerDateKey(new Date(2026, 0, 1, 2, 0)), "2025-12-31");
});

test("formatDateKorean", () => {
  assert.equal(dt.formatDateKorean("2026-08-02"), "2026. 8. 2. (일)");
  assert.equal(dt.formatDateKorean("2026-08-03"), "2026. 8. 3. (월)");
});
