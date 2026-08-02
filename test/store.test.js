const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");

const B = (start, end, extra) =>
  Object.assign({ id: "b" + start, subjectId: "kor", text: "", start, end, done: false }, extra);

test("emptyDay / isDayEmpty", () => {
  const d = store.emptyDay();
  assert.deepEqual(d.todos, []);
  assert.deepEqual(d.blocks, []);
  assert.equal(d.achievement, 0);
  assert.equal(d.memo, "");
  assert.equal(store.isDayEmpty(d), true);
  assert.equal(store.isDayEmpty({ ...d, memo: "메모" }), false);
  assert.equal(store.isDayEmpty({ ...d, blocks: [B(300, 360)] }), false);
});

test("validateBlock: 유효한 블록", () => {
  assert.deepEqual(store.validateBlock(B(300, 360)), { ok: true, error: null });
  assert.deepEqual(store.validateBlock(B(1555, 1560)), { ok: true, error: null });
});

test("validateBlock: 잘못된 블록을 거부한다", () => {
  assert.equal(store.validateBlock(B(360, 360)).ok, false);
  assert.equal(store.validateBlock(B(400, 350)).ok, false);
  assert.equal(store.validateBlock(B(295, 360)).ok, false);
  assert.equal(store.validateBlock(B(1500, 1600)).ok, false);
  assert.equal(store.validateBlock(B(302, 360)).ok, false);
  assert.equal(store.validateBlock(B(300, 358)).ok, false);
});

test("overlaps: 경계가 맞닿는 건 겹침이 아니다", () => {
  assert.equal(store.overlaps(B(300, 360), B(360, 420)), false);
  assert.equal(store.overlaps(B(300, 360), B(355, 420)), true);
  assert.equal(store.overlaps(B(300, 480), B(360, 420)), true);
  assert.equal(store.overlaps(B(360, 420), B(300, 480)), true);
});

test("findOverlap: 자기 자신은 제외한다", () => {
  const blocks = [B(300, 360), B(600, 660)];
  assert.equal(findId(store.findOverlap(blocks, B(350, 400))), "b300");
  assert.equal(store.findOverlap(blocks, B(360, 600)), null);
  const moved = { ...B(300, 360), id: "b300", end: 400 };
  assert.equal(store.findOverlap(blocks, moved, "b300"), null);
  function findId(x) { return x ? x.id : null; }
});

test("limitRange: 이웃 블록에 닿으면 거기서 멈춘다", () => {
  const blocks = [B(300, 360), B(600, 660)];
  assert.deepEqual(store.limitRange(blocks, 400, 900), { start: 400, end: 600 });
  assert.deepEqual(store.limitRange(blocks, 320, 500), { start: 360, end: 500 });
  assert.deepEqual(store.limitRange(blocks, 400, 500), { start: 400, end: 500 });
  assert.deepEqual(store.limitRange(blocks, 200, 2000), { start: 300, end: 300 });
  assert.deepEqual(store.limitRange(blocks, 310, 350, "b300"), { start: 310, end: 350 });
});

test("limitRange: 멀리 끌어도 구간이 블록을 건너뛰지 않는다", () => {
  const blocks = [B(300, 360), B(600, 660)];
  // 빈 슬롯 500에서 눌러 화면 끝까지 아래로 끌면, 600에서 시작하는 블록 앞에서 멈춰야 한다.
  assert.deepEqual(store.limitRange(blocks, 500, 2000), { start: 500, end: 600 });
  // 위로 끌 때도 마찬가지. 500에서 05:00 방향으로 끌면 360에서 멈춘다.
  assert.deepEqual(store.limitRange(blocks, 500, 0), { start: 360, end: 500 });
  // 결과 구간은 언제나 anchor를 품는다.
  const r = store.limitRange(blocks, 900, 2000);
  assert.ok(r.start <= 900 && 900 <= r.end);
});

test("sumPlanned / sumDone", () => {
  const blocks = [B(300, 360), B(600, 720, { done: true }), B(900, 960, { done: true })];
  assert.equal(store.sumPlanned(blocks), 60 + 120 + 60);
  assert.equal(store.sumDone(blocks), 120 + 60);
  assert.equal(store.sumPlanned([]), 0);
  assert.equal(store.sumDone([]), 0);
});

test("sanitizeState: 정상 데이터는 그대로", () => {
  const raw = {
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#FFE08A" }], dayBoundaryHour: 4 },
    days: { "2026-08-02": { achievement: 70, memo: "", todos: [], blocks: [B(300, 360)], updatedAt: 1 } },
    events: [],
    clipboard: null,
  };
  const { state, recovered } = store.sanitizeState(raw);
  assert.equal(recovered, false);
  assert.equal(state.days["2026-08-02"].achievement, 70);
  assert.equal(state.days["2026-08-02"].blocks.length, 1);
});

test("sanitizeState: 손상 데이터를 복구한다", () => {
  const r1 = store.sanitizeState(null);
  assert.equal(r1.recovered, true);
  assert.equal(r1.state.version, 1);
  assert.ok(Array.isArray(r1.state.settings.subjects));

  const r2 = store.sanitizeState({ version: 1, days: "깨짐", events: null });
  assert.equal(r2.recovered, true);
  assert.deepEqual(r2.state.days, {});
  assert.deepEqual(r2.state.events, []);
});

test("sanitizeState: 잘못된 블록과 빈 날을 걸러낸다", () => {
  const raw = {
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#FFE08A" }], dayBoundaryHour: 4 },
    days: {
      "2026-08-02": { achievement: 0, memo: "", todos: [], blocks: [B(300, 360), B(302, 400)], updatedAt: 1 },
      "2026-08-03": { achievement: 0, memo: "", todos: [], blocks: [], updatedAt: 1 },
    },
    events: [],
  };
  const { state } = store.sanitizeState(raw);
  assert.equal(state.days["2026-08-02"].blocks.length, 1);
  assert.equal(state.days["2026-08-03"], undefined);
});

test("sanitizeState: 상위 version은 readOnly로 표시한다", () => {
  const { state, readOnly } = store.sanitizeState({ version: 99, days: {}, events: [] });
  assert.equal(readOnly, true);
  assert.equal(state.version, 99);
});

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test("createStore: 저장하고 다시 읽는다", () => {
  const storage = memoryStorage();
  const s1 = store.createStore(storage);
  s1.load();
  s1.setDay("2026-08-02", { memo: "테스트", blocks: [B(300, 360)] });
  s1.save();

  const s2 = store.createStore(storage);
  s2.load();
  assert.equal(s2.getDay("2026-08-02").memo, "테스트");
  assert.equal(s2.getDay("2026-08-02").blocks.length, 1);
});

test("createStore: getDay는 없는 날에 빈 객체를 주되 저장하지 않는다", () => {
  const s = store.createStore(memoryStorage());
  s.load();
  const d = s.getDay("2030-01-01");
  assert.equal(store.isDayEmpty(d), true);
  assert.equal(s.getState().days["2030-01-01"], undefined);
});

test("createStore: setDay는 updatedAt을 갱신하고 빈 날은 제거한다", () => {
  const s = store.createStore(memoryStorage());
  s.load();
  s.setDay("2026-08-02", { memo: "있음" });
  assert.ok(s.getState().days["2026-08-02"].updatedAt > 0);
  s.setDay("2026-08-02", { memo: "" });
  assert.equal(s.getState().days["2026-08-02"], undefined);
});

test("createStore: 저장 실패를 lastError로 알린다", () => {
  const failing = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => {},
  };
  const s = store.createStore(failing);
  s.load();
  s.setDay("2026-08-02", { memo: "x" });
  s.save();
  assert.ok(s.lastError());
});

test("createStore: 손상 데이터를 백업 키로 옮긴다", () => {
  const storage = memoryStorage();
  storage.setItem(store.STORAGE_KEY, "{이건 JSON이 아님");
  const s = store.createStore(storage);
  const result = s.load();
  assert.equal(result.recovered, true);
  const backupKeys = [...storage._map.keys()].filter((k) => k.includes("corrupt"));
  assert.equal(backupKeys.length, 1);
});
