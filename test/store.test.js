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
  // 아래쪽에 장애물이 없으면 하루 끝까지 뻗는다.
  assert.deepEqual(store.limitRange(blocks, 900, 2000), { start: 900, end: 1560 });
});

test("limitRange: anchor가 빈 구간이면 결과가 anchor를 품는다", () => {
  const blocks = [B(300, 360), B(600, 660), B(900, 1000)];
  for (const anchor of [400, 500, 700, 800, 1200]) {
    for (const cursor of [0, 350, 650, 1100, 2000]) {
      const r = store.limitRange(blocks, anchor, cursor);
      assert.ok(
        r.start <= anchor && anchor <= r.end,
        `anchor ${anchor}, cursor ${cursor} → ${JSON.stringify(r)}`
      );
      assert.ok(r.start >= 300 && r.end <= 1560);
      assert.equal(store.findOverlap(blocks, { id: null, start: r.start, end: r.end }), null);
    }
  }
});

test("limitRange: anchor가 블록 안이면 드래그 방향으로 밀어낸다", () => {
  const blocks = [B(300, 400)];
  // 계약 2번 — 이 경로는 UI에서 도달하지 않지만 동작을 고정해 둔다.
  assert.deepEqual(store.limitRange(blocks, 350, 500), { start: 400, end: 500 });
  assert.deepEqual(store.limitRange(blocks, 350, 100), { start: 300, end: 300 });
});

test("sumPlanned / sumDone", () => {
  const blocks = [B(300, 360), B(600, 720, { done: true }), B(900, 960, { done: true })];
  assert.equal(store.sumPlanned(blocks), 60 + 120 + 60);
  assert.equal(store.sumDone(blocks), 120 + 60);
  assert.equal(store.sumPlanned([]), 0);
  assert.equal(store.sumDone([]), 0);
});

test("isStudy: 과목을 고른 블록만 공부다", () => {
  assert.equal(store.isStudy(B(300, 360)), true);
  assert.equal(store.isStudy(B(300, 360, { subjectId: null })), false);
  assert.equal(store.isStudy(B(300, 360, { subjectId: "" })), false);
  assert.equal(store.isStudy(null), false);
});

test("sumPlanned / sumDone: 과목 없음 블록은 세지 않는다", () => {
  const none = (s, e, extra) => B(s, e, Object.assign({ subjectId: null }, extra));
  const blocks = [B(300, 360, { done: true }), none(400, 520, { done: true }), none(600, 660)];
  assert.equal(store.sumPlanned(blocks), 60, "과목 있는 60분만 목표에 든다");
  assert.equal(store.sumDone(blocks), 60, "과목 없음은 완료해도 실제 시간이 아니다");
  assert.equal(store.sumPlanned([none(300, 480)]), 0);
  assert.equal(store.sumDone([none(300, 480, { done: true })]), 0);
});

test("doneRatio: 과목 없음 블록은 분모에도 분자에도 안 든다", () => {
  const study = (s, e, done) => B(s, e, { done });
  const none = (s, e, done) => B(s, e, { subjectId: null, done });
  // 과목 없음 120분을 끝내도 달성률은 움직이지 않는다.
  assert.equal(store.doneRatio([study(300, 360, true), none(400, 520, true)]), 100);
  assert.equal(store.doneRatio([study(300, 360, false), none(400, 520, true)]), 0);
  // 과목 없음뿐이면 계획이 0이라 나눌 수 없다.
  assert.equal(store.doneRatio([none(300, 480, true)]), 0);
  // 과목 없음이 분모를 부풀리지 않는다 - 없었다면 50%가 될 조합이다.
  assert.equal(store.doneRatio([study(300, 360, true), study(400, 460, false), none(600, 900)]), 50);
});

test("sumUncounted: 합계에서 빠진 시간을 따로 센다", () => {
  const none = (s, e) => B(s, e, { subjectId: null });
  assert.equal(store.sumUncounted([B(300, 360), none(400, 460), none(600, 690)]), 60 + 90);
  assert.equal(store.sumUncounted([B(300, 360)]), 0);
  assert.equal(store.sumUncounted([]), 0);
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

test("sanitizeState: 저장된 데이터가 없는 첫 실행은 복구가 아니다", () => {
  const r = store.sanitizeState(null);
  assert.equal(r.recovered, false);
  assert.equal(r.state.version, 1);
  assert.ok(Array.isArray(r.state.settings.subjects));
  assert.deepEqual(r.state.days, {});
  assert.deepEqual(r.state.events, []);
  assert.equal(store.sanitizeState(undefined).recovered, false);
});

test("sanitizeState: 손상 데이터를 복구한다", () => {
  const r2 = store.sanitizeState({ version: 1, days: "깨짐", events: null });
  assert.equal(r2.recovered, true);
  assert.deepEqual(r2.state.days, {});
  assert.deepEqual(r2.state.events, []);
  // 객체가 아닌 값이 저장돼 있으면 그건 손상이다
  assert.equal(store.sanitizeState("문자열").recovered, true);
  assert.equal(store.sanitizeState(42).recovered, true);
  assert.equal(store.sanitizeState([]).recovered, true);
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

test("sanitizeState: 달력에 없는 날짜 키와 일정을 걸러낸다", () => {
  const raw = {
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#FFE08A" }], dayBoundaryHour: 4 },
    days: {
      "2026-08-02": { achievement: 0, memo: "정상", todos: [], blocks: [], updatedAt: 1 },
      "2026-02-30": { achievement: 0, memo: "가짜", todos: [], blocks: [], updatedAt: 1 },
    },
    events: [
      { id: "ok", title: "정상", type: "exam", startDate: "2026-08-14", endDate: "2026-08-14" },
      { id: "bad", title: "가짜", type: "exam", startDate: "2026-13-01", endDate: "2026-13-01" },
    ],
  };
  const { state, recovered } = store.sanitizeState(raw);
  assert.equal(recovered, true);
  assert.ok(state.days["2026-08-02"]);
  assert.equal(state.days["2026-02-30"], undefined);
  assert.deepEqual(state.events.map((e) => e.id), ["ok"]);
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

test("createStore: 빈 저장소에서 시작하면 복구 신호를 내지 않는다", () => {
  // 첫 사용자가 오류 배너를 보면 안 된다.
  const s = store.createStore(memoryStorage());
  assert.deepEqual(s.load(), { recovered: false, readOnly: false });
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

test("sanitizeState: 모양이 깨진 clipboard를 버린다", () => {
  const bad = [{ kind: "day" }, { kind: "day", payload: {} }, { kind: "week", payload: {} }, {}, 42];
  for (const c of bad) {
    assert.equal(store.sanitizeState({ version: 1, clipboard: c }).state.clipboard, null);
  }
  const goodDay = { kind: "day", copiedAt: 1, payload: { todos: [], blocks: [] } };
  assert.deepEqual(store.sanitizeState({ version: 1, clipboard: goodDay }).state.clipboard, goodDay);
  const goodWeek = { kind: "week", copiedAt: 1, payload: { byWeekday: {} } };
  assert.deepEqual(store.sanitizeState({ version: 1, clipboard: goodWeek }).state.clipboard, goodWeek);
});

test("sanitizeState: 과목 목록이 비면 기본 과목으로 되돌린다", () => {
  const r = store.sanitizeState({ version: 1, settings: { subjects: [null] }, days: {}, events: [] });
  assert.equal(r.state.settings.subjects.length, store.DEFAULT_SUBJECTS.length);
  assert.equal(r.recovered, true);
  const r2 = store.sanitizeState({ version: 1, settings: { subjects: [] }, days: {}, events: [] });
  assert.equal(r2.state.settings.subjects.length, store.DEFAULT_SUBJECTS.length);
});

test("sanitizeState: todoId를 보존한다", () => {
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#fff" }] },
    days: { "2026-08-04": {
      todos: [{ id: "t1", text: "수학", done: false }],
      blocks: [{ id: "b1", start: 300, end: 360, todoId: "t1" }],
    } },
    events: [],
  });
  assert.equal(r.state.days["2026-08-04"].blocks[0].todoId, "t1");
  assert.equal(r.recovered, false);
});

// JSON 가져오기로 깨진 링크가 들어올 수 있다. 블록은 살린다 — 시각 정보가 더 아깝다.
test("sanitizeState: 가리키는 할 일이 없으면 링크만 끊는다", () => {
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#fff" }] },
    days: { "2026-08-04": {
      todos: [],
      blocks: [{ id: "b1", start: 300, end: 360, todoId: "없는id" }],
    } },
    events: [],
  });
  assert.equal(r.state.days["2026-08-04"].blocks.length, 1);
  assert.equal(r.state.days["2026-08-04"].blocks[0].todoId, null);
  assert.equal(r.recovered, true);
});

test("sanitizeState: todoId가 없는 옛 데이터는 null이 된다", () => {
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#fff" }] },
    days: { "2026-08-04": { todos: [], blocks: [{ id: "b1", start: 300, end: 360 }] } },
    events: [],
  });
  assert.equal(r.state.days["2026-08-04"].blocks[0].todoId, null);
  assert.equal(r.recovered, false);
});

test("doneRatio: 계획 대비 실제", () => {
  const b = (s, e, done) => ({ id: "b" + s, subjectId: "kor", text: "", start: s, end: e, done, todoId: null });
  assert.equal(store.doneRatio([]), 0, "계획이 없으면 0");
  assert.equal(store.doneRatio([b(300, 360, false)]), 0);
  assert.equal(store.doneRatio([b(300, 360, true)]), 100);
  assert.equal(store.doneRatio([b(300, 360, true), b(400, 460, false)]), 50);
  // 3분의 1은 33%로 내림/반올림된다.
  assert.equal(store.doneRatio([b(300, 360, true), b(400, 520, false)]), 33);
});

// 이 규칙이 생기기 전에 켜둔 완료가 남아 있으면, 화면에 체크가 없어 끌 방법이 없다.
test("sanitizeState: 과목 없는 항목의 켜져 있던 완료를 내린다", () => {
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [{ id: "kor", name: "국어", color: "#fff" }] },
    days: {
      "2026-08-04": {
        todos: [
          { id: "t1", subjectId: null, text: "저녁 먹기", done: true },
          { id: "t2", subjectId: "kor", text: "국어", done: true },
        ],
        blocks: [
          { id: "b1", subjectId: null, text: "저녁", start: 300, end: 360, done: true, todoId: null },
          { id: "b2", subjectId: "kor", text: "국어", start: 400, end: 460, done: true, todoId: null },
        ],
      },
    },
    events: [],
  });
  const d = r.state.days["2026-08-04"];
  assert.equal(d.todos[0].done, false, "과목 없는 할 일");
  assert.equal(d.todos[1].done, true, "과목 있는 할 일은 그대로 둔다");
  assert.equal(d.blocks[0].done, false, "과목 없는 블록");
  assert.equal(d.blocks[1].done, true, "과목 있는 블록은 그대로 둔다");
  assert.equal(r.recovered, false, "정리는 손상이 아니다 - 복구 배너를 띄우지 않는다");
});
