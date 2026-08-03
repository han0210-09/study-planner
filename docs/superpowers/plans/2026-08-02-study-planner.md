# 스터디 플래너 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월간 달력에서 날짜를 눌러 5분 단위 타임테이블과 To-Do를 관리하는 오프라인 모바일 웹앱을 만든다.

**Architecture:** 의존성 없는 순수 브라우저 앱. 각 모듈은 UMD-lite 껍데기로 감싸 브라우저에서는 `<script>` 태그로, Node 테스트에서는 `require`로 로드한다. 순수 로직(시간 계산·붙여넣기 대상·D-day·검증)은 전부 `node --test`로 검증하고, 드래그·렌더링은 브라우저에서 수동 확인한다. `build.js`가 `src/`를 `dist/planner.html` 한 장으로 인라인한다.

**Tech Stack:** 바닐라 JavaScript (ES2020), HTML, CSS. 빌드·테스트는 Node v24 내장 기능만 사용. npm 의존성 없음.

## Global Constraints

- 외부 의존성 금지. `package.json`의 `dependencies`는 비어 있어야 한다. CDN·웹폰트·원격 이미지 사용 금지.
- 모든 모듈 파일은 UMD-lite 껍데기를 쓴다 (Task 1 Step 3 참고). 브라우저에서는 `SP.<모듈명>`, Node에서는 `module.exports`.
- 타임테이블 시각은 **그날 자정으로부터의 분(정수)**. `DAY_START = 300`(05:00), `DAY_END = 1560`(익일 02:00), 슬롯 `5`분.
- 하루 경계는 **오전 4시**. `00:00~03:59`의 플래너 날짜는 전날이다.
- 날짜 키는 로컬 기준 `YYYY-MM-DD` 문자열. `toISOString()` 사용 금지 (UTC로 밀린다).
- `localStorage` 키는 `studyPlanner.v1`.
- 일정 유형 id는 `assessment` / `exam` / `homework` / `etc`.
- 요일 인덱스는 0 = 일요일 ~ 6 = 토요일. 평일 = 1~5, 주말 = 0과 6.
- 블록끼리 겹칠 수 없다. 최소 블록 길이 5분.
- 테스트 실행 명령은 항상 `node --test` (인자 없음). Node 24는 `node --test test/`처럼 디렉터리를 인자로 주면 그것을 테스트 폴더가 아니라 **모듈 진입점**으로 해석해 `MODULE_NOT_FOUND`로 죽는다. 인자 없이 실행하면 `**/*.test.js`를 자동 탐색한다. 개별 파일을 돌릴 때만 `node --test test/<파일>.test.js` 형태로 경로를 준다.
- UI 문구는 한국어.

---

### Task 1: 프로젝트 뼈대 + datetime 모듈

**Files:**
- Create: `package.json`
- Create: `src/datetime.js`
- Test: `test/datetime.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `SP.datetime` — `DAY_START:number`, `DAY_END:number`, `SLOT:number`, `DAY_BOUNDARY_HOUR:number`, `WEEKDAY_NAMES:string[]` (Task 7의 요일 헤더와 Task 10의 요일 칩이 쓴다), `snapToSlot(m:number):number`, `clampToDay(m:number):number`, `minutesToLabel(m:number):string`, `formatDuration(m:number):string`, `dateKey(d:Date):string`, `parseDateKey(k:string):Date`, `isValidDateKey(k:string):boolean`, `addDays(k:string, n:number):string`, `daysBetween(a:string, b:string):number`, `weekdayOf(k:string):number`, `plannerDateKey(now:Date):string`, `formatDateKorean(k:string):string`

- [ ] **Step 1: `package.json` 생성**

```json
{
  "name": "study-planner",
  "version": "1.0.0",
  "private": true,
  "description": "모바일 스터디 플래너",
  "scripts": {
    "test": "node --test",
    "build": "node build.js",
    "serve": "node serve.js"
  }
}
```

`type` 필드를 넣지 않는 것이 중요하다. 넣으면 테스트의 `require`가 깨진다.

- [ ] **Step 2: 실패하는 테스트 작성 — `test/datetime.test.js`**

```js
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

test("isValidDateKey: 달력에 없는 날짜를 거른다", () => {
  assert.equal(dt.isValidDateKey("2026-08-02"), true);
  assert.equal(dt.isValidDateKey("2028-02-29"), true);
  assert.equal(dt.isValidDateKey("2026-12-31"), true);
  // 모양은 맞지만 존재하지 않는 날짜 — 파싱하면 다른 날로 굴러간다
  assert.equal(dt.isValidDateKey("2026-02-29"), false);
  assert.equal(dt.isValidDateKey("2026-02-30"), false);
  assert.equal(dt.isValidDateKey("2026-04-31"), false);
  assert.equal(dt.isValidDateKey("2026-13-01"), false);
  assert.equal(dt.isValidDateKey("2026-00-10"), false);
  // 모양 자체가 틀린 것
  assert.equal(dt.isValidDateKey("2026-8-2"), false);
  assert.equal(dt.isValidDateKey("엉망"), false);
  assert.equal(dt.isValidDateKey(""), false);
  assert.equal(dt.isValidDateKey(null), false);
  assert.equal(dt.isValidDateKey(undefined), false);
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/datetime.js'`

- [ ] **Step 4: `src/datetime.js` 구현**

```js
(function (root) {
  const DAY_START = 300;   // 05:00
  const DAY_END = 1560;    // 익일 02:00
  const SLOT = 5;
  const DAY_BOUNDARY_HOUR = 4;
  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function snapToSlot(minutes) {
    return Math.round(minutes / SLOT) * SLOT;
  }

  function clampToDay(minutes) {
    return Math.min(DAY_END, Math.max(DAY_START, minutes));
  }

  function minutesToLabel(minutes) {
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    return pad2(Math.floor(wrapped / 60)) + ":" + pad2(wrapped % 60);
  }

  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return m + "분";
    if (m === 0) return h + "시간";
    return h + "시간 " + m + "분";
  }

  function dateKey(date) {
    return (
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
    );
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // 모양만 보면 안 된다. "2026-02-30"은 정규식을 통과하지만 파싱하면 3월 2일이 되어
  // 화면에 뜨는 날짜와 D-day 계산이 어긋난다. 왕복시켜 같은 문자열이 나오는지 본다.
  function isValidDateKey(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    return dateKey(parseDateKey(key)) === key;
  }

  function addDays(key, n) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  function toUTCms(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((toUTCms(toKey) - toUTCms(fromKey)) / 86400000);
  }

  function weekdayOf(key) {
    return parseDateKey(key).getDay();
  }

  function plannerDateKey(now) {
    const shifted = new Date(now.getTime());
    shifted.setHours(shifted.getHours() - DAY_BOUNDARY_HOUR);
    return dateKey(shifted);
  }

  function formatDateKorean(key) {
    const d = parseDateKey(key);
    return (
      d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() +
      ". (" + WEEKDAY_NAMES[d.getDay()] + ")"
    );
  }

  const datetime = {
    DAY_START, DAY_END, SLOT, DAY_BOUNDARY_HOUR, WEEKDAY_NAMES,
    snapToSlot, clampToDay, minutesToLabel, formatDuration,
    dateKey, parseDateKey, isValidDateKey, addDays, daysBetween, weekdayOf,
    plannerDateKey, formatDateKorean,
  };

  root.SP = root.SP || {};
  root.SP.datetime = datetime;
  if (typeof module !== "undefined") module.exports = datetime;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test`
Expected: PASS — 11 tests, 0 fail

- [ ] **Step 6: 커밋**

```bash
git add package.json src/datetime.js test/datetime.test.js
git commit -m "feat: datetime 모듈 - 5분 스냅, 하루경계 4시, 날짜 키 계산"
```

---

### Task 2: store 모듈 — 상태 검증·영속화

**Files:**
- Create: `src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `SP.datetime` (`DAY_START`, `DAY_END`, `SLOT`, `clampToDay`)
- Produces: `SP.store` —
  - `STORAGE_KEY:string`, `newId():string`, `emptyDay():object`, `isDayEmpty(day):boolean`
  - `validateBlock(block):{ok:boolean, error:string|null}`
  - `overlaps(a, b):boolean`, `findOverlap(blocks, candidate, ignoreId):object|null`
  - `limitRange(blocks, start, end, ignoreId):{start:number, end:number}`
  - `sumPlanned(blocks):number`, `sumDone(blocks):number`
  - `sanitizeState(raw):{state:object, recovered:boolean}`
  - `createStore(storage):{getState, getDay, setDay, save, load, lastError}`

- [ ] **Step 1: 실패하는 테스트 작성 — `test/store.test.js`**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/store.js'`

- [ ] **Step 3: `src/store.js` 구현**

```js
(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  const STORAGE_KEY = "studyPlanner.v1";
  const SCHEMA_VERSION = 1;

  const DEFAULT_SUBJECTS = [
    { id: "kor", name: "국어", color: "#FFE08A" },
    { id: "eng", name: "영어", color: "#A8E6CF" },
    { id: "math", name: "수학", color: "#FFB3BA" },
    { id: "soc", name: "사회", color: "#BAE1FF" },
    { id: "sci", name: "과학", color: "#D5C6FF" },
    { id: "hist", name: "한국사", color: "#FFD6A5" },
    { id: "etc", name: "기타", color: "#D9D9D9" },
  ];

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyDay() {
    return { achievement: 0, memo: "", todos: [], blocks: [], updatedAt: 0 };
  }

  function isDayEmpty(day) {
    return (
      !day ||
      ((day.todos || []).length === 0 &&
        (day.blocks || []).length === 0 &&
        !day.memo &&
        !day.achievement)
    );
  }

  function validateBlock(b) {
    if (!b || typeof b.start !== "number" || typeof b.end !== "number")
      return { ok: false, error: "시간이 올바르지 않습니다." };
    if (b.start % dt.SLOT !== 0 || b.end % dt.SLOT !== 0)
      return { ok: false, error: "시간은 5분 단위여야 합니다." };
    if (b.end - b.start < dt.SLOT)
      return { ok: false, error: "블록은 최소 5분이어야 합니다." };
    if (b.start < dt.DAY_START || b.end > dt.DAY_END)
      return { ok: false, error: "05:00 ~ 익일 02:00 범위 안에만 만들 수 있습니다." };
    return { ok: true, error: null };
  }

  function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  function findOverlap(blocks, candidate, ignoreId) {
    for (const b of blocks) {
      if (ignoreId && b.id === ignoreId) continue;
      if (b.id === candidate.id) continue;
      if (overlaps(b, candidate)) return b;
    }
    return null;
  }

  // anchor = 손가락을 처음 댄 지점, cursor = 지금 위치. 둘 다 클램프해서 쓴다.
  //
  // 계약:
  //   1. anchor가 빈 구간에 있으면 (호출부가 항상 보장하는 조건) 결과는 anchor를
  //      품고, 드래그 방향으로 가장 가까운 블록 경계에서 멈춘다.
  //   2. anchor가 블록 안에 있으면 (UI에서는 도달 불가한 방어적 경로) 결과를
  //      그 블록 밖으로, 드래그 방향 쪽으로 밀어낸다. 이때는 anchor를 품지 않는다.
  //   3. 남는 자리가 없으면 빈 구간(start === end)을 돌려준다. 호출부가 최소 5분
  //      검사로 걸러낸다.
  //
  // 방향을 구간의 중점으로 판정하면 안 된다 — 멀리 드래그할 때 선택이 기존
  // 블록을 통째로 건너뛴다.
  function limitRange(blocks, anchor, cursor, ignoreId) {
    const a = dt.clampToDay(anchor);
    const c = dt.clampToDay(cursor);
    let lo = Math.min(a, c);
    let hi = Math.max(a, c);
    for (const b of blocks) {
      if (ignoreId && b.id === ignoreId) continue;
      if (b.end <= lo || b.start >= hi) continue;
      if (b.end <= a) lo = Math.max(lo, b.end);          // 블록이 anchor 위쪽
      else if (b.start >= a) hi = Math.min(hi, b.start); // 블록이 anchor 아래쪽
      else if (c >= a) lo = Math.max(lo, b.end);         // anchor가 블록 안 + 아래로 끄는 중
      else hi = Math.min(hi, b.start);                   // anchor가 블록 안 + 위로 끄는 중
    }
    if (hi < lo) hi = lo;
    return { start: lo, end: hi };
  }

  function sumPlanned(blocks) {
    return (blocks || []).reduce((sum, b) => sum + (b.end - b.start), 0);
  }

  function sumDone(blocks) {
    return (blocks || []).reduce((sum, b) => (b.done ? sum + (b.end - b.start) : sum), 0);
  }

  function sanitizeState(raw) {
    let recovered = false;
    const mark = () => { recovered = true; };

    if (!raw || typeof raw !== "object") {
      mark();
      raw = {};
    }

    const version = typeof raw.version === "number" ? raw.version : SCHEMA_VERSION;
    const readOnly = version > SCHEMA_VERSION;
    if (typeof raw.version !== "number") mark();

    let subjects = raw.settings && Array.isArray(raw.settings.subjects) ? raw.settings.subjects : null;
    if (!subjects || subjects.length === 0) { mark(); subjects = DEFAULT_SUBJECTS.map((s) => ({ ...s })); }
    subjects = subjects.filter((s) => s && typeof s.id === "string" && typeof s.name === "string");

    const days = {};
    const rawDays = raw.days && typeof raw.days === "object" && !Array.isArray(raw.days) ? raw.days : (mark(), {});
    for (const [key, value] of Object.entries(rawDays)) {
      if (!dt.isValidDateKey(key)) { mark(); continue; }
      if (!value || typeof value !== "object") { mark(); continue; }
      const day = emptyDay();
      day.achievement = typeof value.achievement === "number" ? Math.min(100, Math.max(0, value.achievement)) : 0;
      day.memo = typeof value.memo === "string" ? value.memo : "";
      day.updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : 0;
      day.todos = (Array.isArray(value.todos) ? value.todos : []).filter((t) => t && typeof t.text === "string")
        .map((t) => ({ id: t.id || newId(), subjectId: t.subjectId || null, text: t.text, done: !!t.done }));
      const accepted = [];
      for (const b of Array.isArray(value.blocks) ? value.blocks : []) {
        const block = { id: (b && b.id) || newId(), subjectId: (b && b.subjectId) || null,
          text: b && typeof b.text === "string" ? b.text : "", start: b && b.start, end: b && b.end, done: !!(b && b.done) };
        if (!validateBlock(block).ok) { mark(); continue; }
        if (findOverlap(accepted, block)) { mark(); continue; }
        accepted.push(block);
      }
      day.blocks = accepted.sort((a, b) => a.start - b.start);
      if (isDayEmpty(day)) continue;
      days[key] = day;
    }

    const events = (Array.isArray(raw.events) ? raw.events : (mark(), []))
      .filter((e) => e && typeof e.title === "string" && dt.isValidDateKey(e.startDate))
      .map((e) => ({
        id: e.id || newId(), title: e.title, type: e.type || "etc", color: e.color || "#FFA94D",
        startDate: e.startDate, endDate: dt.isValidDateKey(e.endDate) ? e.endDate : e.startDate,
        memo: typeof e.memo === "string" ? e.memo : "",
      }));

    const clipboard = raw.clipboard && typeof raw.clipboard === "object" ? raw.clipboard : null;

    return {
      state: { version, settings: { subjects, dayBoundaryHour: dt.DAY_BOUNDARY_HOUR }, days, events, clipboard },
      recovered,
      readOnly,
    };
  }

  function createStore(storage) {
    let state = sanitizeState(null).state;
    let error = null;
    let readOnly = false;

    function load() {
      let parsed = null;
      let corrupt = false;
      try {
        const text = storage.getItem(STORAGE_KEY);
        if (text) parsed = JSON.parse(text);
      } catch (e) {
        corrupt = true;
        try { storage.setItem(STORAGE_KEY + ".corrupt." + Date.now(), storage.getItem(STORAGE_KEY) || ""); } catch (_) {}
        try { storage.removeItem(STORAGE_KEY); } catch (_) {}
      }
      const result = sanitizeState(parsed);
      state = result.state;
      readOnly = result.readOnly;
      return { recovered: corrupt || result.recovered, readOnly };
    }

    function save() {
      if (readOnly) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        error = null;
        return true;
      } catch (e) {
        error = e;
        return false;
      }
    }

    function getState() { return state; }

    function getDay(key) {
      return state.days[key] || emptyDay();
    }

    function setDay(key, patch) {
      const next = Object.assign(emptyDay(), state.days[key], patch);
      next.updatedAt = Date.now();
      if (isDayEmpty(next)) delete state.days[key];
      else state.days[key] = next;
      return next;
    }

    return { getState, getDay, setDay, save, load, lastError: () => error, isReadOnly: () => readOnly };
  }

  const api = {
    STORAGE_KEY, SCHEMA_VERSION, DEFAULT_SUBJECTS,
    newId, emptyDay, isDayEmpty, validateBlock, overlaps, findOverlap,
    limitRange, sumPlanned, sumDone, sanitizeState, createStore,
  };

  root.SP = root.SP || {};
  root.SP.store = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS — datetime 11개 + store 14개 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/store.js test/store.test.js
git commit -m "feat: store 모듈 - 스키마 검증, 블록 겹침 처리, localStorage 영속화"
```

---

### Task 3: subjects 모듈 — 과목·색상 관리

**Files:**
- Create: `src/subjects.js`
- Test: `test/subjects.test.js`

**Interfaces:**
- Consumes: `SP.store` (`DEFAULT_SUBJECTS`, `newId`)
- Produces: `SP.subjects` — `FALLBACK_COLOR:string`, `find(subjects, id):object|null`, `colorOf(subjects, id):string`, `nameOf(subjects, id):string`, `countReferences(state, id):number`, `addSubject(state, name, color):object`, `updateSubject(state, id, patch):boolean`, `removeSubject(state, id):number`, `buildSelect(subjects, selectedId):HTMLSelectElement`

`buildSelect`는 브라우저 전용이라 자동 테스트 대상이 아니다. Task 8·9·10이 모두 이 함수를 쓴다 — 과목 선택 드롭다운을 각자 만들지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성 — `test/subjects.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");
const subjects = require("../src/subjects.js");

function stateWithRefs() {
  const { state } = store.sanitizeState(null);
  state.days["2026-08-02"] = {
    achievement: 0, memo: "", updatedAt: 1,
    todos: [{ id: "t1", subjectId: "kor", text: "문학", done: false }],
    blocks: [
      { id: "b1", subjectId: "kor", text: "", start: 300, end: 360, done: false },
      { id: "b2", subjectId: "math", text: "", start: 400, end: 460, done: false },
    ],
  };
  return state;
}

test("find / colorOf / nameOf", () => {
  const list = store.DEFAULT_SUBJECTS;
  assert.equal(subjects.find(list, "kor").name, "국어");
  assert.equal(subjects.find(list, "없음"), null);
  assert.equal(subjects.colorOf(list, "kor"), "#FFE08A");
  assert.equal(subjects.colorOf(list, "없음"), subjects.FALLBACK_COLOR);
  assert.equal(subjects.colorOf(list, null), subjects.FALLBACK_COLOR);
  assert.equal(subjects.nameOf(list, "math"), "수학");
  assert.equal(subjects.nameOf(list, null), "");
});

test("countReferences: 투두와 블록을 모두 센다", () => {
  const state = stateWithRefs();
  assert.equal(subjects.countReferences(state, "kor"), 2);
  assert.equal(subjects.countReferences(state, "math"), 1);
  assert.equal(subjects.countReferences(state, "eng"), 0);
});

test("addSubject: 새 과목을 추가하고 id를 발급한다", () => {
  const state = stateWithRefs();
  const before = state.settings.subjects.length;
  const created = subjects.addSubject(state, "제2외국어", "#CCCCCC");
  assert.equal(state.settings.subjects.length, before + 1);
  assert.equal(created.name, "제2외국어");
  assert.ok(created.id);
});

test("addSubject: 빈 이름을 거부한다", () => {
  const state = stateWithRefs();
  assert.equal(subjects.addSubject(state, "   ", "#CCCCCC"), null);
});

test("updateSubject: 이름과 색을 바꾼다", () => {
  const state = stateWithRefs();
  assert.equal(subjects.updateSubject(state, "kor", { name: "문학", color: "#000000" }), true);
  assert.equal(subjects.find(state.settings.subjects, "kor").name, "문학");
  assert.equal(subjects.find(state.settings.subjects, "kor").color, "#000000");
  assert.equal(subjects.updateSubject(state, "없음", { name: "x" }), false);
});

test("removeSubject: 참조를 null로 정리하고 개수를 돌려준다", () => {
  const state = stateWithRefs();
  const affected = subjects.removeSubject(state, "kor");
  assert.equal(affected, 2);
  assert.equal(subjects.find(state.settings.subjects, "kor"), null);
  assert.equal(state.days["2026-08-02"].todos[0].subjectId, null);
  assert.equal(state.days["2026-08-02"].blocks[0].subjectId, null);
  assert.equal(state.days["2026-08-02"].blocks[1].subjectId, "math");
});

test("removeSubject: 마지막 과목은 지울 수 없다", () => {
  const { state } = store.sanitizeState(null);
  state.settings.subjects = [{ id: "only", name: "하나", color: "#111111" }];
  assert.equal(subjects.removeSubject(state, "only"), -1);
  assert.equal(state.settings.subjects.length, 1);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/subjects.test.js`
Expected: FAIL — `Cannot find module '../src/subjects.js'`

- [ ] **Step 3: `src/subjects.js` 구현**

```js
(function (root) {
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  const FALLBACK_COLOR = "#D9D9D9";

  function find(list, id) {
    if (!id || !Array.isArray(list)) return null;
    return list.find((s) => s.id === id) || null;
  }

  function colorOf(list, id) {
    const s = find(list, id);
    return s ? s.color : FALLBACK_COLOR;
  }

  function nameOf(list, id) {
    const s = find(list, id);
    return s ? s.name : "";
  }

  function countReferences(state, id) {
    let count = 0;
    for (const day of Object.values(state.days)) {
      for (const t of day.todos) if (t.subjectId === id) count++;
      for (const b of day.blocks) if (b.subjectId === id) count++;
    }
    return count;
  }

  function addSubject(state, name, color) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const created = { id: store.newId(), name: trimmed, color: color || FALLBACK_COLOR };
    state.settings.subjects.push(created);
    return created;
  }

  function updateSubject(state, id, patch) {
    const s = find(state.settings.subjects, id);
    if (!s) return false;
    if (typeof patch.name === "string" && patch.name.trim()) s.name = patch.name.trim();
    if (typeof patch.color === "string") s.color = patch.color;
    return true;
  }

  function removeSubject(state, id) {
    if (state.settings.subjects.length <= 1) return -1;
    const index = state.settings.subjects.findIndex((s) => s.id === id);
    if (index === -1) return -1;
    state.settings.subjects.splice(index, 1);
    let affected = 0;
    for (const day of Object.values(state.days)) {
      for (const t of day.todos) if (t.subjectId === id) { t.subjectId = null; affected++; }
      for (const b of day.blocks) if (b.subjectId === id) { b.subjectId = null; affected++; }
    }
    return affected;
  }

  // 과목 선택 드롭다운. 브라우저에서만 쓰이며 Task 8·9·10이 공유한다.
  function buildSelect(list, selectedId) {
    const select = document.createElement("select");
    select.className = "subject-select";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "과목 없음";
    none.selected = !selectedId;
    select.appendChild(none);
    for (const s of list) {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.name;
      option.selected = s.id === selectedId;
      select.appendChild(option);
    }
    return select;
  }

  const api = { FALLBACK_COLOR, find, colorOf, nameOf, countReferences, addSubject, updateSubject, removeSubject, buildSelect };

  root.SP = root.SP || {};
  root.SP.subjects = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS — 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/subjects.js test/subjects.test.js
git commit -m "feat: subjects 모듈 - 과목 CRUD와 참조 정리"
```

---

### Task 4: events 모듈 — 일정과 D-day

**Files:**
- Create: `src/events.js`
- Test: `test/events.test.js`

**Interfaces:**
- Consumes: `SP.datetime` (`daysBetween`, `addDays`), `SP.store` (`newId`)
- Produces: `SP.events` — `EVENT_TYPES:Array<{id,label,color}>`, `typeOf(id):object`, `onDate(events, key):Array`, `inMonth(events, year, month):object`, `nextEvent(events, fromKey):object|null`, `dday(events, fromKey):{event, days}|null`, `formatDday(days):string`, `addEvent(state, input):object`, `updateEvent(state, id, patch):boolean`, `removeEvent(state, id):boolean`, `isPast(event, todayKey):boolean`

- [ ] **Step 1: 실패하는 테스트 작성 — `test/events.test.js`**

```js
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

test("addEvent: 달력에 없는 날짜를 거부한다", () => {
  const { state } = store.sanitizeState(null);
  // 모양은 맞지만 존재하지 않는 날 — 받아주면 배지 날짜와 D-day 계산이 어긋난다
  assert.equal(events.addEvent(state, { title: "x", startDate: "2026-02-30" }), null);
  assert.equal(events.addEvent(state, { title: "x", startDate: "2026-13-01" }), null);
  assert.equal(state.events.length, 0);
  // 잘못된 종료일은 시작일로 대체되고, 일정 자체는 살아남는다
  const created = events.addEvent(state, { title: "수행", startDate: "2026-08-14", endDate: "2026-02-30" });
  assert.equal(created.endDate, "2026-08-14");
  // 윤년 2월 29일은 진짜 날짜다
  assert.ok(events.addEvent(state, { title: "윤년", startDate: "2028-02-29" }));
});

test("updateEvent: 달력에 없는 날짜 패치를 무시한다", () => {
  const { state } = store.sanitizeState(null);
  const created = events.addEvent(state, { title: "수행", startDate: "2026-08-14" });
  assert.equal(events.updateEvent(state, created.id, { startDate: "2026-02-30" }), true);
  assert.equal(state.events[0].startDate, "2026-08-14");
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/events.test.js`
Expected: FAIL — `Cannot find module '../src/events.js'`

- [ ] **Step 3: `src/events.js` 구현**

```js
(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  const EVENT_TYPES = [
    { id: "assessment", label: "수행평가", color: "#FF8787" },
    { id: "exam", label: "시험", color: "#748FFC" },
    { id: "homework", label: "과제", color: "#69DB7C" },
    { id: "etc", label: "기타", color: "#FFA94D" },
  ];

  // 달력에 실제로 존재하는 날짜만 통과시킨다. 모양만 맞는 "2026-02-30"을 받아주면
  // 배지에는 2026-02-30이 뜨는데 D-day는 3월 2일 기준으로 계산되어 조용히 어긋난다.
  const isDate = (k) => dt.isValidDateKey(k);

  function typeOf(id) {
    return EVENT_TYPES.find((t) => t.id === id) || EVENT_TYPES[EVENT_TYPES.length - 1];
  }

  function covers(event, key) {
    return event.startDate <= key && key <= event.endDate;
  }

  function onDate(list, key) {
    return (list || []).filter((e) => covers(e, key)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  function inMonth(list, year, month) {
    const map = {};
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 0; i < daysInMonth; i++) {
      const key = dt.addDays(first, i);
      const hits = onDate(list, key);
      if (hits.length) map[key] = hits;
    }
    return map;
  }

  function nextEvent(list, fromKey) {
    const upcoming = (list || []).filter((e) => e.startDate >= fromKey);
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) =>
      a.startDate === b.startDate ? a.title.localeCompare(b.title, "ko") : a.startDate.localeCompare(b.startDate)
    );
    return upcoming[0];
  }

  function dday(list, fromKey) {
    const event = nextEvent(list, fromKey);
    if (!event) return null;
    return { event, days: dt.daysBetween(fromKey, event.startDate) };
  }

  function formatDday(days) {
    return days === 0 ? "D-DAY" : "D-" + days;
  }

  function isPast(event, todayKey) {
    return event.endDate < todayKey;
  }

  function addEvent(state, input) {
    const title = String((input && input.title) || "").trim();
    if (!title) return null;
    if (!input || !isDate(input.startDate)) return null;
    let startDate = input.startDate;
    let endDate = isDate(input.endDate) ? input.endDate : startDate;
    if (endDate < startDate) [startDate, endDate] = [endDate, startDate];
    const type = typeOf(input.type).id;
    const created = {
      id: store.newId(), title, type,
      color: input.color || typeOf(type).color,
      startDate, endDate,
      memo: typeof input.memo === "string" ? input.memo : "",
    };
    state.events.push(created);
    return created;
  }

  function updateEvent(state, id, patch) {
    const e = state.events.find((x) => x.id === id);
    if (!e) return false;
    if (typeof patch.title === "string" && patch.title.trim()) e.title = patch.title.trim();
    if (patch.type) { e.type = typeOf(patch.type).id; e.color = patch.color || typeOf(e.type).color; }
    if (typeof patch.color === "string") e.color = patch.color;
    if (isDate(patch.startDate)) e.startDate = patch.startDate;
    if (isDate(patch.endDate)) e.endDate = patch.endDate;
    if (e.endDate < e.startDate) [e.startDate, e.endDate] = [e.endDate, e.startDate];
    if (typeof patch.memo === "string") e.memo = patch.memo;
    return true;
  }

  function removeEvent(state, id) {
    const index = state.events.findIndex((x) => x.id === id);
    if (index === -1) return false;
    state.events.splice(index, 1);
    return true;
  }

  const api = { EVENT_TYPES, typeOf, covers, onDate, inMonth, nextEvent, dday, formatDday, isPast, addEvent, updateEvent, removeEvent };

  root.SP = root.SP || {};
  root.SP.events = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS — 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/events.js test/events.test.js
git commit -m "feat: events 모듈 - 일정 CRUD와 D-day 계산"
```

---

### Task 5: clipboard 모듈 — 복사와 기간 붙여넣기

이 계획에서 버그가 가장 나기 쉬운 부분이다. 테스트를 촘촘히 쓴다.

**Files:**
- Create: `src/clipboard.js`
- Test: `test/clipboard.test.js`

**Interfaces:**
- Consumes: `SP.datetime` (`addDays`, `weekdayOf`, `dateKey`, `parseDateKey`), `SP.store` (`newId`, `emptyDay`, `isDayEmpty`, `findOverlap`)
- Produces: `SP.clipboard` —
  - `copyDay(state, key):object|null`
  - `copyWeek(state, anchorKey):object|null`
  - `resolveTargetDates(range, filter, baseKey):string[]`
  - `paste(state, clip, targetKeys, mode):{applied:number, skipped:number, skippedBlocks:number}`
  - `describeClip(clip):string`

  `range` = `{type:"day"|"week"|"month"|"year"|"custom", from?:string, to?:string}`
  `filter` = `{type:"all"|"weekday"|"weekend"|"custom", days?:number[]}`
  `mode` = `"overwrite"|"merge"|"skip"`

- [ ] **Step 1: 실패하는 테스트 작성 — `test/clipboard.test.js`**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/clipboard.test.js`
Expected: FAIL — `Cannot find module '../src/clipboard.js'`

- [ ] **Step 3: `src/clipboard.js` 구현**

```js
(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  // 복사본에 done: false를 명시한다. materialize()가 어차피 false로 덮지만,
  // 페이로드만 봐도 "계획만 복사하고 완료 체크는 가져가지 않는다"가 드러나야 한다.
  function cloneTodos(todos) {
    return (todos || []).map((t) => ({ subjectId: t.subjectId || null, text: t.text, done: false }));
  }

  function cloneBlocks(blocks) {
    return (blocks || []).map((b) => ({
      subjectId: b.subjectId || null, text: b.text || "", start: b.start, end: b.end, done: false,
    }));
  }

  function materialize(payload) {
    return {
      todos: (payload.todos || []).map((t) => ({ id: store.newId(), subjectId: t.subjectId || null, text: t.text, done: false })),
      blocks: (payload.blocks || []).map((b) => ({
        id: store.newId(), subjectId: b.subjectId || null, text: b.text || "", start: b.start, end: b.end, done: false,
      })),
    };
  }

  function copyDay(state, key) {
    const day = state.days[key];
    if (!day || store.isDayEmpty(day)) return null;
    if (day.todos.length === 0 && day.blocks.length === 0) return null;
    return {
      kind: "day", copiedAt: Date.now(),
      payload: { todos: cloneTodos(day.todos), blocks: cloneBlocks(day.blocks) },
    };
  }

  function weekStart(key) {
    return dt.addDays(key, -dt.weekdayOf(key));
  }

  function copyWeek(state, anchorKey) {
    const start = weekStart(anchorKey);
    const byWeekday = {};
    let found = false;
    for (let i = 0; i < 7; i++) {
      const key = dt.addDays(start, i);
      const day = state.days[key];
      if (!day || (day.todos.length === 0 && day.blocks.length === 0)) continue;
      byWeekday[String(dt.weekdayOf(key))] = { todos: cloneTodos(day.todos), blocks: cloneBlocks(day.blocks) };
      found = true;
    }
    if (!found) return null;
    return { kind: "week", copiedAt: Date.now(), payload: { byWeekday } };
  }

  function rangeBounds(range, baseKey) {
    const type = range && range.type;
    if (type === "day") return [baseKey, baseKey];
    if (type === "week") {
      const start = weekStart(baseKey);
      return [start, dt.addDays(start, 6)];
    }
    if (type === "month") {
      const d = dt.parseDateKey(baseKey);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [dt.dateKey(first), dt.dateKey(last)];
    }
    if (type === "year") {
      const y = dt.parseDateKey(baseKey).getFullYear();
      return [y + "-01-01", y + "-12-31"];
    }
    let from = range && range.from ? range.from : baseKey;
    let to = range && range.to ? range.to : baseKey;
    if (to < from) [from, to] = [to, from];
    return [from, to];
  }

  function allowsWeekday(filter, weekday) {
    const type = (filter && filter.type) || "all";
    if (type === "all") return true;
    if (type === "weekday") return weekday >= 1 && weekday <= 5;
    if (type === "weekend") return weekday === 0 || weekday === 6;
    return Array.isArray(filter.days) && filter.days.indexOf(weekday) !== -1;
  }

  function resolveTargetDates(range, filter, baseKey) {
    const [from, to] = rangeBounds(range, baseKey);
    const result = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard < 4000) {
      if (allowsWeekday(filter, dt.weekdayOf(cursor))) result.push(cursor);
      cursor = dt.addDays(cursor, 1);
      guard++;
    }
    return result;
  }

  function payloadFor(clip, key) {
    if (clip.kind === "day") return clip.payload;
    const bucket = clip.payload.byWeekday[String(dt.weekdayOf(key))];
    return bucket || null;
  }

  function paste(state, clip, targetKeys, mode) {
    const result = { applied: 0, skipped: 0, skippedBlocks: 0 };
    if (!clip || !Array.isArray(targetKeys) || targetKeys.length === 0) return result;

    for (const key of targetKeys) {
      const payload = payloadFor(clip, key);
      if (!payload) continue;

      const existing = state.days[key] || store.emptyDay();
      const hasPlan = existing.todos.length > 0 || existing.blocks.length > 0;

      if (mode === "skip" && hasPlan) { result.skipped++; continue; }

      const fresh = materialize(payload);
      const next = Object.assign(store.emptyDay(), existing);

      if (mode === "merge") {
        const blocks = existing.blocks.slice();
        for (const block of fresh.blocks) {
          if (store.findOverlap(blocks, block)) { result.skippedBlocks++; continue; }
          blocks.push(block);
        }
        next.blocks = blocks.sort((a, b) => a.start - b.start);
        next.todos = existing.todos.concat(fresh.todos);
      } else {
        next.blocks = fresh.blocks.slice().sort((a, b) => a.start - b.start);
        next.todos = fresh.todos;
      }

      next.updatedAt = Date.now();
      if (store.isDayEmpty(next)) delete state.days[key];
      else state.days[key] = next;
      result.applied++;
    }
    return result;
  }

  function describeClip(clip) {
    if (!clip) return "복사한 계획 없음";
    if (clip.kind === "day") {
      const p = clip.payload;
      return "하루 계획 (할 일 " + p.todos.length + "개, 블록 " + p.blocks.length + "개)";
    }
    return "일주일 계획 (" + Object.keys(clip.payload.byWeekday).length + "개 요일)";
  }

  const api = { copyDay, copyWeek, weekStart, rangeBounds, allowsWeekday, resolveTargetDates, paste, describeClip };

  root.SP = root.SP || {};
  root.SP.clipboard = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS — 4개 테스트 파일 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/clipboard.js test/clipboard.test.js
git commit -m "feat: clipboard 모듈 - 하루/주 복사와 기간 지정 붙여넣기"
```

---

## UI 태스크 공통 규칙 (Task 6~11)

- 브라우저 DOM 테스트는 npm 의존성 없이 불가능하므로 **자동 테스트를 쓰지 않는다.** 대신 각 태스크의 마지막에 있는 **수동 확인 절차를 그대로 수행하고, 통과한 항목에만 체크**한다.
- 개발 서버는 `node serve.js` (Task 6에서 생성). `http://localhost:8080` 으로 접속한다. `file://`로 열면 브라우저에 따라 `localStorage`가 막히므로 반드시 서버로 확인한다.
- 모바일 확인은 브라우저 개발자도구의 기기 에뮬레이션(iPhone 12 Pro, 390×844)을 기본으로 한다.
- 모든 DOM 생성은 `SP.ui.el()`을 쓴다. `innerHTML`에 사용자 입력을 넣지 않는다.
- 상태를 바꾼 뒤에는 반드시 `SP.app.persist()`를 호출한다. 직접 `store.save()`를 부르지 않는다.

**설계 문서 대비 추가 파일:** 설계 문서의 모듈 목록에 없던 `src/ui.js`(공용 DOM·시트·토스트 헬퍼)와 `serve.js`(개발 서버)를 추가한다. 두 파일 모두 여러 뷰가 공유하는 코드를 한곳에 모으기 위한 것으로, 뷰 모듈이 서로를 직접 호출하지 않는다는 원칙은 그대로 유지된다.

---

### Task 6: 앱 셸 — HTML 뼈대, 공용 UI 헬퍼, 화면 전환

**Files:**
- Create: `src/index.html`
- Create: `src/styles.css`
- Create: `src/ui.js`
- Create: `src/app.js`
- Create: `serve.js`

**Interfaces:**
- Consumes: `SP.datetime`, `SP.store`
- Produces:
  - `SP.ui` — `el(tag, props, children):HTMLElement`, `clear(node):void`, `openSheet({title, body, actions}):HTMLElement`, `closeSheet():void`, `toast(message):void`, `confirmDialog(message):Promise<boolean>`, `showBanner(message):void`
  - `SP.app` — `boot():void`, `state():object`, `store():object`(Task 2의 store 인스턴스), `persist():void`, `showCalendar(year, month):void`, `showDay(dateKey):void`, `today():string`, `viewDate():{year, month}`

- [ ] **Step 1: `serve.js` 생성 — 의존성 없는 개발 서버**

```js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "src");
const PORT = 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "index.html" : url.slice(1);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, () => console.log("http://localhost:" + PORT));
```

- [ ] **Step 2: `src/index.html` 생성**

스크립트 순서가 곧 의존성 순서다. 순서를 바꾸면 `SP.<모듈>`이 undefined가 된다.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#4C6EF5">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>스터디 플래너</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="banner" class="banner" hidden></div>
  <main id="screen-calendar" class="screen"></main>
  <main id="screen-day" class="screen" hidden></main>
  <div id="sheet-root"></div>
  <div id="toast-root"></div>

  <script src="datetime.js"></script>
  <script src="store.js"></script>
  <script src="subjects.js"></script>
  <script src="events.js"></script>
  <script src="clipboard.js"></script>
  <script src="ui.js"></script>
  <script src="todos.js"></script>
  <script src="timetable.js"></script>
  <script src="day.js"></script>
  <script src="calendar.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

`todos.js`, `timetable.js`, `day.js`, `calendar.js`는 Task 7~9에서 만든다. 이 태스크에서는 **빈 스텁 파일**을 만들어 404를 피한다.

- [ ] **Step 3: 뷰 모듈 스텁 4개 생성**

`src/todos.js`, `src/timetable.js`, `src/day.js`, `src/calendar.js` 네 파일을 만든다. 내용은 아래와 같고, **`root.SP.calendar` 부분만 각 파일명에 맞게 바꾼다** — `todos.js`는 `root.SP.todos`, `timetable.js`는 `root.SP.timetable`, `day.js`는 `root.SP.day`, `calendar.js`는 `root.SP.calendar`.

```js
(function (root) {
  const api = {};
  root.SP = root.SP || {};
  root.SP.calendar = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: `src/ui.js` 구현**

```js
(function (root) {
  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "style") Object.assign(node.style, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) node.setAttribute(key, "");
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function closeSheet() {
    const host = document.getElementById("sheet-root");
    clear(host);
    document.body.classList.remove("sheet-open");
  }

  function openSheet(options) {
    const host = clear(document.getElementById("sheet-root"));
    const panel = el("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, [
      el("div", { class: "sheet-head" }, [
        el("h2", { class: "sheet-title", text: options.title || "" }),
        el("button", { class: "icon-btn", "aria-label": "닫기", text: "✕", onclick: closeSheet }),
      ]),
      el("div", { class: "sheet-body" }, options.body || []),
      options.actions ? el("div", { class: "sheet-actions" }, options.actions) : null,
    ]);
    host.appendChild(el("div", { class: "scrim", onclick: closeSheet }));
    host.appendChild(panel);
    document.body.classList.add("sheet-open");
    return panel;
  }

  function toast(message) {
    const host = document.getElementById("toast-root");
    const node = el("div", { class: "toast", text: message });
    host.appendChild(node);
    setTimeout(() => node.classList.add("toast-out"), 2200);
    setTimeout(() => node.remove(), 2600);
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      openSheet({
        title: "확인",
        body: [el("p", { class: "confirm-msg", text: message })],
        actions: [
          el("button", { class: "btn btn-ghost", text: "취소", onclick: () => { closeSheet(); resolve(false); } }),
          el("button", { class: "btn btn-danger", text: "실행", onclick: () => { closeSheet(); resolve(true); } }),
        ],
      });
    });
  }

  function showBanner(message) {
    const banner = document.getElementById("banner");
    banner.textContent = message;
    banner.hidden = false;
  }

  const api = { el, clear, openSheet, closeSheet, toast, confirmDialog, showBanner };
  root.SP = root.SP || {};
  root.SP.ui = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 5: `src/app.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const ui = SP.ui;

  let store = null;
  let todayKey = null;
  let view = { year: 0, month: 0 };
  let saveTimer = null;

  function safeStorage() {
    try {
      const probe = "__sp_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      const map = new Map();
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: () => { throw new Error("localStorage unavailable"); },
        removeItem: (k) => map.delete(k),
      };
    }
  }

  function state() { return store.getState(); }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!store.save()) {
        ui.showBanner("저장에 실패했습니다. 이 기기에 계획이 남지 않습니다. 설정에서 JSON 내보내기로 백업하세요.");
      }
    }, 300);
  }

  function today() { return todayKey; }
  function viewDate() { return { year: view.year, month: view.month }; }

  function showCalendar(year, month) {
    if (year) view = { year, month };
    document.getElementById("screen-day").hidden = true;
    document.getElementById("screen-calendar").hidden = false;
    window.scrollTo(0, 0);
    SP.calendar.render(document.getElementById("screen-calendar"), view.year, view.month);
  }

  function showDay(dateKey) {
    document.getElementById("screen-calendar").hidden = true;
    document.getElementById("screen-day").hidden = false;
    window.scrollTo(0, 0);
    SP.day.render(document.getElementById("screen-day"), dateKey);
  }

  function refreshToday() {
    const next = dt.plannerDateKey(new Date());
    if (next === todayKey) return;
    todayKey = next;
    if (!document.getElementById("screen-calendar").hidden) showCalendar(view.year, view.month);
  }

  function boot() {
    store = storeApi.createStore(safeStorage());
    const result = store.load();
    if (result.recovered) ui.showBanner("저장된 데이터 일부를 읽을 수 없어 복구했습니다.");
    if (result.readOnly) ui.showBanner("더 새로운 버전에서 만든 데이터입니다. 읽기 전용으로 엽니다.");

    todayKey = dt.plannerDateKey(new Date());
    const d = dt.parseDateKey(todayKey);
    view = { year: d.getFullYear(), month: d.getMonth() + 1 };

    showCalendar(view.year, view.month);

    setInterval(refreshToday, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshToday(); });
  }

  SP.app = { boot, state, persist, showCalendar, showDay, today, viewDate, store: () => store };
  document.addEventListener("DOMContentLoaded", boot);
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 6: `src/styles.css` 토대 작성**

Task 7~10에서 각자 자기 섹션을 이 파일 아래에 덧붙인다.

```css
:root {
  --bg: #FAFAFB;
  --surface: #FFFFFF;
  --line: #E4E6EB;
  --text: #1F2329;
  --muted: #767C87;
  --accent: #4C6EF5;
  --danger: #E03131;
  --radius: 12px;
  --safe-b: env(safe-area-inset-bottom, 0px);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", sans-serif;
  font-size: 15px;
  line-height: 1.5;
}
body.sheet-open { overflow: hidden; }

.screen { max-width: 560px; margin: 0 auto; padding: 12px 12px calc(24px + var(--safe-b)); }

.banner {
  position: sticky; top: 0; z-index: 40;
  background: #FFF3BF; color: #7A5B00;
  padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #FFE08A;
}

button { font: inherit; color: inherit; }
.btn {
  min-height: 44px; padding: 0 16px; border-radius: var(--radius);
  border: 1px solid var(--line); background: var(--surface); cursor: pointer;
}
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn-ghost { background: transparent; }
.icon-btn {
  min-width: 44px; min-height: 44px; border: 0; background: transparent;
  border-radius: var(--radius); cursor: pointer; font-size: 18px;
}

.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 50; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 51;
  max-width: 560px; margin: 0 auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  max-height: 86vh; display: flex; flex-direction: column;
  padding-bottom: var(--safe-b);
}
.sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--line); }
.sheet-title { margin: 0; font-size: 16px; }
.sheet-body { padding: 16px; overflow-y: auto; }
.sheet-actions { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
.sheet-actions .btn { flex: 1; }
.confirm-msg { margin: 0; white-space: pre-line; }

#toast-root { position: fixed; left: 0; right: 0; bottom: calc(24px + var(--safe-b)); z-index: 60; pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.toast { background: rgba(31,35,41,.92); color: #fff; padding: 10px 16px; border-radius: 999px; font-size: 13px; transition: opacity .3s; }
.toast-out { opacity: 0; }

.field { display: block; margin-bottom: 14px; }
.field > span { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
.field input[type="text"], .field input[type="date"], .field textarea, .field select {
  width: 100%; min-height: 44px; padding: 8px 12px;
  border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--surface); font: inherit;
}
.field textarea { min-height: 88px; resize: vertical; }
```

- [ ] **Step 7: 브라우저에서 확인**

터미널에서 `node serve.js` 실행 후 `http://localhost:8080` 접속. 개발자도구 콘솔을 연 채로 아래를 확인한다.

- [ ] 콘솔에 에러가 없다 (`SP.calendar.render is not a function`은 이 단계에서 정상 — Step 8에서 처리)
- [ ] 콘솔에 `SP.datetime.DAY_START` 입력 → `300`
- [ ] 콘솔에 `SP.ui.toast("테스트")` 입력 → 화면 하단에 알약 모양 토스트가 뜨고 약 2.5초 뒤 사라진다
- [ ] 콘솔에 `SP.ui.openSheet({title:"제목", body:[SP.ui.el("p",{text:"본문"})]})` 입력 → 하단 시트가 올라오고, 어두운 배경이나 ✕를 누르면 닫힌다
- [ ] 콘솔에 `SP.app.today()` 입력 → 오늘 날짜 문자열이 나온다

- [ ] **Step 8: 임시 렌더러로 화면 전환 확인**

`src/calendar.js` 스텁에 임시 `render`를 넣어 라우팅만 검증한다. Task 7에서 통째로 교체한다.

```js
api.render = function (host, year, month) {
  const ui = root.SP.ui;
  root.SP.ui.clear(host).appendChild(
    ui.el("div", {}, [
      ui.el("h1", { text: year + "년 " + month + "월" }),
      ui.el("button", { class: "btn", text: "오늘 열기", onclick: () => root.SP.app.showDay(root.SP.app.today()) }),
    ])
  );
};
```

`src/day.js` 스텁에도 임시 `render`를 넣는다.

```js
api.render = function (host, dateKey) {
  const ui = root.SP.ui;
  const v = root.SP.app.viewDate();
  root.SP.ui.clear(host).appendChild(
    ui.el("div", {}, [
      ui.el("h1", { text: root.SP.datetime.formatDateKorean(dateKey) }),
      ui.el("button", { class: "btn", text: "← 달력", onclick: () => root.SP.app.showCalendar(v.year, v.month) }),
    ])
  );
};
```

- [ ] 새로고침 → 이번 달 제목이 뜬다 (오늘이 2026-08-02이면 "2026년 8월")
- [ ] "오늘 열기" → 하루 화면으로 바뀌고 "2026. 8. 2. (일)"이 뜬다
- [ ] "← 달력" → 달력으로 돌아온다
- [ ] 개발자도구 → Application → Local Storage에 `studyPlanner.v1` 키가 있다 (콘솔에서 `SP.app.state().days["2026-08-02"]={achievement:0,memo:"확인",todos:[],blocks:[],updatedAt:1}; SP.app.persist()` 실행 후 1초 뒤 확인)

- [ ] **Step 9: 커밋**

```bash
git add src/index.html src/styles.css src/ui.js src/app.js src/calendar.js src/day.js src/todos.js src/timetable.js serve.js
git commit -m "feat: 앱 셸 - HTML 뼈대, UI 헬퍼, 화면 전환 라우터, 개발 서버"
```

---

### Task 7: 월간 달력 화면

**Files:**
- Modify: `src/calendar.js` (Task 6의 스텁을 통째로 교체)
- Modify: `src/styles.css` (파일 끝에 달력 섹션 추가)

**Interfaces:**
- Consumes: `SP.datetime`, `SP.store` (`sumDone`), `SP.events` (`inMonth`), `SP.ui`, `SP.app` (`state`, `today`, `showDay`, `showCalendar`)
- Produces: `SP.calendar` — `render(host, year, month):void`, `onLongPress(dateKey):void`

빠른 메뉴(복사/붙여넣기/일정 추가)의 실제 동작은 Task 10에서 붙인다. 이 태스크에서는 메뉴가 열리고 각 항목이 `SP.ui.toast("준비 중")`을 띄우는 것까지만 만든다.

- [ ] **Step 1: `src/calendar.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const eventsApi = SP.events;
  const ui = SP.ui;

  const LONG_PRESS_MS = 450;

  function monthDays(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function studyMinutesByDay(state, year, month) {
    const map = {};
    let max = 0;
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    for (let i = 0; i < monthDays(year, month); i++) {
      const key = dt.addDays(first, i);
      const day = state.days[key];
      if (!day) continue;
      const minutes = storeApi.sumDone(day.blocks);
      if (minutes > 0) map[key] = minutes;
      if (minutes > max) max = minutes;
    }
    return { map, max };
  }

  function monthSummary(state, year, month) {
    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    let total = 0;
    let achievementSum = 0;
    let achievementDays = 0;
    for (let i = 0; i < monthDays(year, month); i++) {
      const day = state.days[dt.addDays(first, i)];
      if (!day) continue;
      total += storeApi.sumDone(day.blocks);
      if (day.achievement > 0) { achievementSum += day.achievement; achievementDays++; }
    }
    const avg = achievementDays ? Math.round(achievementSum / achievementDays) : 0;
    return { total, avg };
  }

  function attachLongPress(node, dateKey) {
    let timer = null;
    let startY = 0;
    let fired = false;

    const cancel = () => { clearTimeout(timer); timer = null; };

    node.addEventListener("pointerdown", (e) => {
      fired = false;
      startY = e.clientY;
      timer = setTimeout(() => { fired = true; api.onLongPress(dateKey); }, LONG_PRESS_MS);
    });
    node.addEventListener("pointermove", (e) => {
      if (timer && Math.abs(e.clientY - startY) > 8) cancel();
    });
    node.addEventListener("pointerup", () => {
      cancel();
      if (!fired) SP.app.showDay(dateKey);
    });
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function dayCell(key, inMonthFlag, ctx) {
    if (!inMonthFlag) return ui.el("div", { class: "cal-cell cal-cell-out" });

    const weekday = dt.weekdayOf(key);
    const classes = ["cal-cell"];
    if (weekday === 0) classes.push("cal-sun");
    if (weekday === 6) classes.push("cal-sat");
    if (key === SP.app.today()) classes.push("cal-today");

    const dayEvents = ctx.eventMap[key] || [];
    const badges = dayEvents.slice(0, 2).map((e) =>
      ui.el("div", { class: "cal-badge", title: e.title }, [
        ui.el("span", { class: "cal-dot", style: { background: e.color } }),
        ui.el("span", { class: "cal-badge-text", text: e.title }),
      ])
    );
    if (dayEvents.length > 2) badges.push(ui.el("div", { class: "cal-more", text: "+" + (dayEvents.length - 2) }));

    const minutes = ctx.study.map[key] || 0;
    const ratio = ctx.study.max > 0 ? minutes / ctx.study.max : 0;
    const bar = ctx.study.max > 0 && minutes > 0
      ? ui.el("div", { class: "cal-bar" }, [
          ui.el("div", { class: "cal-bar-fill", style: { width: Math.round(ratio * 100) + "%" } }),
        ])
      : null;

    const day = ctx.state.days[key];
    const achievement = day && day.achievement > 0
      ? ui.el("div", { class: "cal-achieve", text: day.achievement + "%" })
      : null;

    const cell = ui.el("div", { class: classes.join(" "), dataset: { date: key } }, [
      ui.el("div", { class: "cal-num", text: String(dt.parseDateKey(key).getDate()) }),
      ui.el("div", { class: "cal-badges" }, badges),
      bar,
      achievement,
    ]);
    attachLongPress(cell, key);
    return cell;
  }

  function render(host, year, month) {
    const state = SP.app.state();
    const ctx = {
      state,
      eventMap: eventsApi.inMonth(state.events, year, month),
      study: studyMinutesByDay(state, year, month),
    };

    const first = year + "-" + String(month).padStart(2, "0") + "-01";
    const leading = dt.weekdayOf(first);
    const total = monthDays(year, month);
    const cells = [];
    for (let i = 0; i < leading; i++) cells.push(dayCell(null, false, ctx));
    for (let i = 0; i < total; i++) cells.push(dayCell(dt.addDays(first, i), true, ctx));
    while (cells.length % 7 !== 0) cells.push(dayCell(null, false, ctx));

    const go = (delta) => {
      const d = new Date(year, month - 1 + delta, 1);
      SP.app.showCalendar(d.getFullYear(), d.getMonth() + 1);
    };
    const goToday = () => {
      const t = dt.parseDateKey(SP.app.today());
      SP.app.showCalendar(t.getFullYear(), t.getMonth() + 1);
    };

    const summary = monthSummary(state, year, month);

    ui.clear(host).appendChild(
      ui.el("div", { class: "cal" }, [
        ui.el("header", { class: "cal-head" }, [
          ui.el("button", { class: "icon-btn", text: "‹", "aria-label": "이전 달", onclick: () => go(-1) }),
          ui.el("h1", { class: "cal-title", text: year + "년 " + month + "월" }),
          ui.el("button", { class: "icon-btn", text: "›", "aria-label": "다음 달", onclick: () => go(1) }),
          ui.el("button", { class: "btn btn-ghost cal-today-btn", text: "오늘", onclick: goToday }),
        ]),
        ui.el("div", { class: "cal-weekdays" }, dt.WEEKDAY_NAMES.map((name, i) =>
          ui.el("div", { class: "cal-weekday" + (i === 0 ? " cal-sun" : i === 6 ? " cal-sat" : ""), text: name })
        )),
        ui.el("div", { class: "cal-grid" }, cells),
        ui.el("div", { class: "cal-summary" }, [
          ui.el("span", { text: "이번 달 공부 " + dt.formatDuration(summary.total) }),
          ui.el("span", { text: "평균 달성도 " + summary.avg + "%" }),
        ]),
      ])
    );
  }

  function onLongPress(dateKey) {
    ui.openSheet({
      title: dt.formatDateKorean(dateKey),
      body: [
        ui.el("div", { class: "menu" }, [
          ui.el("button", { class: "menu-item", text: "이 날 복사", onclick: () => ui.toast("준비 중") }),
          ui.el("button", { class: "menu-item", text: "이 주 복사", onclick: () => ui.toast("준비 중") }),
          ui.el("button", { class: "menu-item", text: "여기에 붙여넣기", onclick: () => ui.toast("준비 중") }),
          ui.el("button", { class: "menu-item", text: "일정 추가", onclick: () => ui.toast("준비 중") }),
        ]),
      ],
    });
  }

  const api = { render, onLongPress, monthSummary, studyMinutesByDay };
  SP.calendar = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 2: `src/styles.css` 끝에 달력 스타일 추가**

```css
/* ---------- 달력 ---------- */
.cal-head { display: grid; grid-template-columns: 44px 1fr 44px auto; align-items: center; gap: 4px; margin-bottom: 8px; }
.cal-title { margin: 0; font-size: 18px; text-align: center; }
.cal-today-btn { min-height: 36px; padding: 0 10px; font-size: 13px; }

.cal-weekdays, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-weekday { text-align: center; font-size: 12px; color: var(--muted); padding: 4px 0; }
.cal-sun { color: #E03131; }
.cal-sat { color: #1C7ED6; }

.cal-cell {
  min-height: 74px; padding: 4px; background: var(--surface);
  border: 1px solid var(--line); border-radius: 10px;
  display: flex; flex-direction: column; gap: 2px;
  cursor: pointer; touch-action: pan-y; user-select: none;
}
.cal-cell-out { background: transparent; border: 0; min-height: 74px; cursor: default; }
.cal-today { border-color: var(--accent); box-shadow: 0 0 0 1.5px var(--accent) inset; }
.cal-num { font-size: 13px; font-weight: 600; }

.cal-badges { display: flex; flex-direction: column; gap: 1px; min-height: 0; }
.cal-badge { display: flex; align-items: center; gap: 3px; font-size: 10px; line-height: 1.2; }
.cal-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.cal-badge-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-more { font-size: 10px; color: var(--muted); }

.cal-bar { margin-top: auto; height: 4px; background: #EDEFF3; border-radius: 2px; overflow: hidden; }
.cal-bar-fill { height: 100%; background: var(--accent); }
.cal-achieve { font-size: 10px; color: var(--muted); text-align: right; }

.cal-summary { display: flex; justify-content: space-between; margin-top: 14px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; color: var(--muted); }

.menu { display: flex; flex-direction: column; }
.menu-item { min-height: 48px; text-align: left; padding: 0 4px; border: 0; background: transparent; border-bottom: 1px solid var(--line); cursor: pointer; }
.menu-item:last-child { border-bottom: 0; }
```

- [ ] **Step 3: 브라우저에서 확인**

`node serve.js` 실행 후 개발자도구 기기 에뮬레이션(390×844)으로 확인한다.

- [ ] 이번 달 달력이 7열 격자로 뜨고, 요일 헤더가 일~토 순서다
- [ ] 일요일은 빨강, 토요일은 파랑이다
- [ ] 오늘 날짜 칸에 파란 테두리가 있다
- [ ] `‹` `›`로 달을 옮길 수 있고, 1월에서 `‹`를 누르면 전년 12월로 간다
- [ ] 다른 달로 이동한 뒤 "오늘"을 누르면 이번 달로 돌아온다
- [ ] 날짜를 짧게 탭하면 하루 화면으로 넘어간다
- [ ] 날짜를 0.5초 이상 길게 누르면 빠른 메뉴 시트가 뜬다 (항목을 누르면 "준비 중" 토스트)
- [ ] 격자를 세로로 스크롤할 때 실수로 빠른 메뉴가 뜨지 않는다
- [ ] 가로 스크롤이 생기지 않는다

- [ ] **Step 4: 더미 데이터로 표시 요소 확인**

콘솔에 아래를 붙여넣고 실행한다.

```js
const s = SP.app.state();
s.days["2026-08-05"] = { achievement: 80, memo: "", todos: [],
  blocks: [{ id: "x1", subjectId: "math", text: "수학", start: 540, end: 720, done: true }], updatedAt: 1 };
s.days["2026-08-06"] = { achievement: 40, memo: "", todos: [],
  blocks: [{ id: "x2", subjectId: "eng", text: "영어", start: 540, end: 600, done: true }], updatedAt: 1 };
SP.events.addEvent(s, { title: "국어 수행평가", type: "assessment", startDate: "2026-08-14" });
SP.events.addEvent(s, { title: "중간고사", type: "exam", startDate: "2026-08-20", endDate: "2026-08-22" });
SP.app.persist();
SP.app.showCalendar(2026, 8);
```

- [ ] 8/5는 8/6보다 공부량 막대가 길다 (3시간 vs 1시간)
- [ ] 8/5에 `80%`, 8/6에 `40%`가 표시된다
- [ ] 8/14에 빨간 점과 "국어 수행평가"가 뜬다
- [ ] 8/20, 8/21, 8/22 세 칸 모두에 "중간고사"가 뜬다
- [ ] 하단 요약에 "이번 달 공부 4시간", "평균 달성도 60%"가 뜬다

- [ ] **Step 5: 커밋**

```bash
git add src/calendar.js src/styles.css
git commit -m "feat: 월간 달력 - 일정 배지, 공부량 막대, 길게 눌러 빠른 메뉴"
```

---

### Task 8: 하루 화면 — 헤더·성취도·To-Do·시간합계·메모

타임테이블 자리는 Task 9에서 채운다. 이 태스크에서는 빈 컨테이너만 둔다.

**Files:**
- Modify: `src/todos.js` (스텁 교체)
- Modify: `src/day.js` (스텁 교체)
- Modify: `src/styles.css` (파일 끝에 하루 화면 섹션 추가)

**Interfaces:**
- Consumes: `SP.datetime`, `SP.store`, `SP.subjects`, `SP.events`, `SP.ui`, `SP.app`
- Produces:
  - `SP.todos` — `render(host, dateKey, onChange):void`, `openEditor(dateKey, todoId, onDone):void`
  - `SP.day` — `render(host, dateKey):void`, `refresh():void`, `currentKey():string`

- [ ] **Step 1: `src/todos.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  function openEditor(dateKey, todoId, onDone) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const existing = todoId ? day.todos.find((t) => t.id === todoId) : null;

    const select = subjectsApi.buildSelect(state.settings.subjects, existing ? existing.subjectId : null);
    const input = ui.el("input", { type: "text", value: existing ? existing.text : "", placeholder: "할 일을 입력하세요", maxlength: "80" });

    const save = () => {
      const text = input.value.trim();
      if (!text) { ui.toast("할 일을 입력하세요."); return; }
      const todos = day.todos.slice();
      if (existing) {
        const index = todos.findIndex((t) => t.id === todoId);
        todos[index] = { ...existing, subjectId: select.value || null, text };
      } else {
        todos.push({ id: storeApi.newId(), subjectId: select.value || null, text, done: false });
      }
      SP.app.store().setDay(dateKey, { todos });
      SP.app.persist();
      ui.closeSheet();
      onDone();
    };

    ui.openSheet({
      title: existing ? "할 일 수정" : "할 일 추가",
      body: [
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "할 일" }), input]),
      ],
      actions: [
        existing
          ? ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
              SP.app.store().setDay(dateKey, { todos: day.todos.filter((t) => t.id !== todoId) });
              SP.app.persist(); ui.closeSheet(); onDone();
            } })
          : ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: save }),
      ],
    });
    setTimeout(() => input.focus(), 50);
  }

  function move(dateKey, todoId, delta, onChange) {
    const day = SP.app.store().getDay(dateKey);
    const todos = day.todos.slice();
    const index = todos.findIndex((t) => t.id === todoId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= todos.length) return;
    [todos[index], todos[target]] = [todos[target], todos[index]];
    SP.app.store().setDay(dateKey, { todos });
    SP.app.persist();
    onChange();
  }

  function render(host, dateKey, onChange) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const subjects = state.settings.subjects;

    const rows = day.todos.map((todo, index) =>
      ui.el("li", { class: "todo-row" + (todo.done ? " todo-done" : "") }, [
        ui.el("span", {
          class: "todo-tag",
          text: subjectsApi.nameOf(subjects, todo.subjectId) || "-",
          style: { background: subjectsApi.colorOf(subjects, todo.subjectId) },
        }),
        ui.el("button", { class: "todo-text", text: todo.text, onclick: () => openEditor(dateKey, todo.id, onChange) }),
        ui.el("div", { class: "todo-order" }, [
          ui.el("button", { class: "icon-btn tiny", text: "▲", "aria-label": "위로", disabled: index === 0, onclick: () => move(dateKey, todo.id, -1, onChange) }),
          ui.el("button", { class: "icon-btn tiny", text: "▼", "aria-label": "아래로", disabled: index === day.todos.length - 1, onclick: () => move(dateKey, todo.id, 1, onChange) }),
        ]),
        ui.el("input", {
          type: "checkbox", class: "todo-check", "aria-label": "완료", checked: todo.done,
          onchange: (e) => {
            const todos = day.todos.map((t) => (t.id === todo.id ? { ...t, done: e.target.checked } : t));
            SP.app.store().setDay(dateKey, { todos });
            SP.app.persist();
            onChange();
          },
        }),
      ])
    );

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "To-Do List" }),
        day.todos.length
          ? ui.el("ul", { class: "todo-list" }, rows)
          : ui.el("p", { class: "empty", text: "할 일이 없습니다. 아래 버튼으로 추가하세요." }),
        ui.el("button", { class: "btn add-btn", text: "+ 할 일 추가", onclick: () => openEditor(dateKey, null, onChange) }),
      ])
    );
  }

  const api = { render, openEditor };
  SP.todos = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 2: `src/day.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const eventsApi = SP.events;
  const ui = SP.ui;

  let currentHost = null;
  let currentKey = null;

  function ddayChip(dateKey) {
    const state = SP.app.state();
    const result = eventsApi.dday(state.events, dateKey);
    if (!result) return ui.el("span", { class: "dday dday-none", text: "일정 없음" });
    return ui.el("span", { class: "dday", title: result.event.title, text: eventsApi.formatDday(result.days) });
  }

  function header(dateKey) {
    const view = SP.app.viewDate();
    return ui.el("header", { class: "day-head" }, [
      ui.el("button", { class: "icon-btn", text: "←", "aria-label": "달력으로", onclick: () => SP.app.showCalendar(view.year, view.month) }),
      ddayChip(dateKey),
      ui.el("div", { class: "day-nav" }, [
        ui.el("button", { class: "icon-btn", text: "‹", "aria-label": "전날", onclick: () => SP.app.showDay(dt.addDays(dateKey, -1)) }),
        ui.el("span", { class: "day-date", text: dt.formatDateKorean(dateKey) }),
        ui.el("button", { class: "icon-btn", text: "›", "aria-label": "다음날", onclick: () => SP.app.showDay(dt.addDays(dateKey, 1)) }),
      ]),
      ui.el("button", { class: "icon-btn", text: "⋯", "aria-label": "메뉴", onclick: () => SP.day.openMenu(dateKey) }),
    ]);
  }

  function achievementCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const value = ui.el("span", { class: "achieve-value", text: day.achievement + "%" });
    const slider = ui.el("input", {
      type: "range", min: "0", max: "100", step: "5", value: String(day.achievement), class: "achieve-slider",
      oninput: (e) => { value.textContent = e.target.value + "%"; },
      onchange: (e) => {
        SP.app.store().setDay(dateKey, { achievement: Number(e.target.value) });
        SP.app.persist();
      },
    });
    return ui.el("section", { class: "card" }, [
      ui.el("div", { class: "achieve-head" }, [ui.el("h2", { class: "card-title", text: "학습 성취도" }), value]),
      slider,
      ui.el("div", { class: "achieve-scale" }, [
        ui.el("span", { text: "0%" }), ui.el("span", { text: "50%" }), ui.el("span", { text: "100%" }),
      ]),
    ]);
  }

  function eventsCard(dateKey) {
    const list = eventsApi.onDate(SP.app.state().events, dateKey);
    if (list.length === 0) return null;
    return ui.el("section", { class: "card" }, [
      ui.el("h2", { class: "card-title", text: "오늘의 일정" }),
      ui.el("ul", { class: "event-list" }, list.map((e) =>
        ui.el("li", { class: "event-item", onclick: () => SP.day.openEventEditor(dateKey, e.id) }, [
          ui.el("span", { class: "event-dot", style: { background: e.color } }),
          ui.el("span", { class: "event-title", text: e.title }),
          ui.el("span", { class: "event-type", text: eventsApi.typeOf(e.type).label }),
        ])
      )),
    ]);
  }

  function totalsCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    const planned = storeApi.sumPlanned(day.blocks);
    const done = storeApi.sumDone(day.blocks);
    const ratio = planned > 0 ? Math.round((done / planned) * 100) : 0;
    return ui.el("section", { class: "card totals" }, [
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "목표시간" }),
        ui.el("strong", { text: dt.formatDuration(planned) }),
      ]),
      ui.el("div", { class: "totals-row" }, [
        ui.el("span", { class: "totals-label", text: "실제시간" }),
        ui.el("strong", { text: dt.formatDuration(done) }),
      ]),
      ui.el("div", { class: "totals-bar" }, [
        ui.el("div", { class: "totals-fill", style: { width: Math.min(100, ratio) + "%" } }),
      ]),
      ui.el("div", { class: "totals-ratio", text: "달성률 " + ratio + "%" }),
    ]);
  }

  function memoCard(dateKey) {
    const day = SP.app.store().getDay(dateKey);
    return ui.el("section", { class: "card" }, [
      ui.el("h2", { class: "card-title", text: "메모" }),
      ui.el("textarea", {
        class: "memo", placeholder: "자유롭게 적으세요", maxlength: "1000",
        onchange: (e) => { SP.app.store().setDay(dateKey, { memo: e.target.value }); SP.app.persist(); },
      }),
    ]);
  }

  function render(host, dateKey) {
    currentHost = host;
    currentKey = dateKey;

    const todoHost = ui.el("div", {});
    const timetableHost = ui.el("div", {});
    const totalsHost = ui.el("div", {});

    const refreshTotals = () => { ui.clear(totalsHost).appendChild(totalsCard(dateKey)); };
    const onTodoChange = () => { SP.todos.render(todoHost, dateKey, onTodoChange); };
    const onBlockChange = () => { SP.timetable.render(timetableHost, dateKey, onBlockChange); refreshTotals(); };

    ui.clear(host).appendChild(
      ui.el("div", { class: "day" }, [
        header(dateKey),
        achievementCard(dateKey),
        eventsCard(dateKey),
        todoHost,
        timetableHost,
        totalsHost,
        memoCard(dateKey),
      ])
    );

    const memo = host.querySelector(".memo");
    if (memo) memo.value = SP.app.store().getDay(dateKey).memo;

    SP.todos.render(todoHost, dateKey, onTodoChange);
    if (SP.timetable.render) SP.timetable.render(timetableHost, dateKey, onBlockChange);
    refreshTotals();
  }

  function refresh() {
    if (currentHost && currentKey) render(currentHost, currentKey);
  }

  const api = {
    render, refresh, currentKey: () => currentKey,
    openMenu: () => ui.toast("준비 중"),
    openEventEditor: () => ui.toast("준비 중"),
  };
  SP.day = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

`openMenu`와 `openEventEditor`는 Task 10에서 실제 구현으로 교체한다.

- [ ] **Step 3: `src/styles.css` 끝에 하루 화면 스타일 추가**

```css
/* ---------- 하루 화면 ---------- */
.day-head { display: grid; grid-template-columns: 44px auto 1fr 44px; align-items: center; gap: 6px; margin-bottom: 10px; }
.day-nav { display: flex; align-items: center; justify-content: center; gap: 2px; }
.day-date { font-size: 15px; font-weight: 600; white-space: nowrap; }
.dday { background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.dday-none { background: #E9ECEF; color: var(--muted); font-weight: 500; }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; margin-bottom: 10px; }
.card-title { margin: 0 0 10px; font-size: 14px; color: var(--muted); font-weight: 600; }
.empty { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
.add-btn { width: 100%; }

.achieve-head { display: flex; justify-content: space-between; align-items: baseline; }
.achieve-value { font-size: 18px; font-weight: 700; }
.achieve-slider { width: 100%; margin: 4px 0; }
.achieve-scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }

.event-list { list-style: none; margin: 0; padding: 0; }
.event-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); cursor: pointer; }
.event-item:last-child { border-bottom: 0; }
.event-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.event-title { flex: 1; font-weight: 600; }
.event-type { font-size: 11px; color: var(--muted); }

.todo-list { list-style: none; margin: 0 0 10px; padding: 0; }
.todo-row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.todo-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.todo-text { text-align: left; border: 0; background: transparent; padding: 6px 0; cursor: pointer; min-height: 32px; }
.todo-done .todo-text { text-decoration: line-through; color: var(--muted); }
.todo-order { display: flex; flex-direction: column; }
.icon-btn.tiny { min-width: 28px; min-height: 20px; font-size: 10px; padding: 0; }
.icon-btn.tiny[disabled] { opacity: .25; }
.todo-check { width: 24px; height: 24px; }
.subject-select { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); font: inherit; }

.totals-row { display: flex; justify-content: space-between; padding: 3px 0; }
.totals-label { color: var(--muted); font-size: 13px; }
.totals-bar { height: 8px; background: #EDEFF3; border-radius: 4px; overflow: hidden; margin-top: 10px; }
.totals-fill { height: 100%; background: var(--accent); }
.totals-ratio { text-align: right; font-size: 12px; color: var(--muted); margin-top: 4px; }

.memo { width: 100%; min-height: 88px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); font: inherit; resize: vertical; }
```

- [ ] **Step 4: 브라우저에서 확인**

달력에서 오늘 날짜를 눌러 하루 화면을 연다.

- [ ] 헤더에 `←`, D-day 칩, 날짜, `‹ ›`, `⋯`가 한 줄에 들어간다 (390px 폭에서 넘치지 않는다)
- [ ] 일정이 없으면 "일정 없음", Task 7에서 넣은 8/14 수행평가가 살아 있으면 `D-12`가 뜬다
- [ ] `‹` `›`로 전날/다음날로 이동하고 날짜 표기가 바뀐다
- [ ] 성취도 슬라이더를 움직이면 옆 숫자가 실시간으로 바뀐다
- [ ] 슬라이더를 놓고 달력으로 나갔다 다시 들어오면 값이 유지된다
- [ ] "+ 할 일 추가" → 시트에서 과목·내용 입력 후 저장 → 목록에 뜬다
- [ ] 할 일 텍스트를 누르면 수정 시트가 열리고, 삭제 버튼이 동작한다
- [ ] 체크박스를 누르면 취소선이 생기고, 새로고침해도 유지된다
- [ ] ▲▼로 순서가 바뀌고, 첫 항목의 ▲와 마지막 항목의 ▼는 비활성이다
- [ ] 메모를 입력하고 포커스를 벗어난 뒤 새로고침하면 유지된다
- [ ] 목표시간/실제시간이 `0분 / 0분`, 달성률 0%로 표시된다 (타임테이블은 Task 9)

- [ ] **Step 5: 커밋**

```bash
git add src/day.js src/todos.js src/styles.css
git commit -m "feat: 하루 화면 - 헤더/D-day, 성취도, To-Do, 시간 합계, 메모"
```

---

### Task 9: 타임테이블 — 렌더, 드래그 생성, 길이 조절, 완료 체크

이 앱의 핵심이다. 좌표↔분 변환은 `SP.timetable.yToMinutes`로 분리해 콘솔에서 직접 검증한다.

**Files:**
- Modify: `src/timetable.js` (스텁 교체)
- Modify: `src/styles.css` (파일 끝에 타임테이블 섹션 추가)

**Interfaces:**
- Consumes: `SP.datetime`, `SP.store` (`limitRange`, `validateBlock`, `findOverlap`, `newId`), `SP.subjects`, `SP.ui`, `SP.app`
- Produces: `SP.timetable` — `render(host, dateKey, onChange):void`, `yToMinutes(clientY, trackEl):number`, `openBlockEditor(dateKey, blockId, onChange):void`, `HOUR_PX:number`

**핵심 좌표 계산**

트랙 높이는 `21시간 × HOUR_PX`로 고정한다. 분↔픽셀은 아래 두 식만 쓴다.

```
비율   = (분 - DAY_START) / (DAY_END - DAY_START)
top%   = 비율 × 100
height% = (end - start) / (DAY_END - DAY_START) × 100
```

- [ ] **Step 1: `src/timetable.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  const HOUR_PX = 56;
  const SPAN = dt.DAY_END - dt.DAY_START;
  const LONG_PRESS_MS = 300;
  const MOVE_TOLERANCE = 8;

  function yToMinutes(clientY, trackEl) {
    const rect = trackEl.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    return dt.clampToDay(dt.snapToSlot(dt.DAY_START + ratio * SPAN));
  }

  function pct(minutes) {
    return ((minutes - dt.DAY_START) / SPAN) * 100;
  }

  function blocksOf(dateKey) {
    return SP.app.store().getDay(dateKey).blocks;
  }

  function saveBlocks(dateKey, blocks) {
    SP.app.store().setDay(dateKey, { blocks: blocks.slice().sort((a, b) => a.start - b.start) });
    SP.app.persist();
  }

  function openBlockEditor(dateKey, blockId, onChange) {
    const state = SP.app.state();
    const blocks = blocksOf(dateKey);
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    let start = block.start;
    let end = block.end;

    const rangeLabel = ui.el("strong", { text: dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end) });
    const durationLabel = ui.el("span", { class: "editor-duration", text: dt.formatDuration(end - start) });

    function redraw() {
      rangeLabel.textContent = dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end);
      durationLabel.textContent = dt.formatDuration(end - start);
    }

    function nudge(which, delta) {
      const next = { ...block, start, end };
      if (which === "start") next.start = dt.clampToDay(start + delta);
      else next.end = dt.clampToDay(end + delta);
      if (next.end - next.start < dt.SLOT) { ui.toast("블록은 최소 5분이어야 합니다."); return; }
      if (storeApi.findOverlap(blocks, next, blockId)) { ui.toast("다른 블록과 겹칩니다."); return; }
      start = next.start; end = next.end;
      redraw();
    }

    const stepper = (label, which) =>
      ui.el("div", { class: "stepper" }, [
        ui.el("span", { class: "stepper-label", text: label }),
        ui.el("button", { class: "btn stepper-btn", text: "−5분", onclick: () => nudge(which, -dt.SLOT) }),
        ui.el("button", { class: "btn stepper-btn", text: "+5분", onclick: () => nudge(which, dt.SLOT) }),
      ]);

    const select = subjectsApi.buildSelect(state.settings.subjects, block.subjectId);
    const textInput = ui.el("input", { type: "text", value: block.text, placeholder: "무엇을 공부하나요?", maxlength: "40" });

    ui.openSheet({
      title: "시간 블록",
      body: [
        ui.el("div", { class: "editor-range" }, [rangeLabel, durationLabel]),
        stepper("시작", "start"),
        stepper("종료", "end"),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "과목" }), select]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "내용" }), textInput]),
      ],
      actions: [
        ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
          saveBlocks(dateKey, blocks.filter((b) => b.id !== blockId));
          ui.closeSheet(); onChange();
        } }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: () => {
          const next = { ...block, start, end, subjectId: select.value || null, text: textInput.value.trim() };
          const check = storeApi.validateBlock(next);
          if (!check.ok) { ui.toast(check.error); return; }
          if (storeApi.findOverlap(blocks, next, blockId)) { ui.toast("다른 블록과 겹칩니다."); return; }
          saveBlocks(dateKey, blocks.map((b) => (b.id === blockId ? next : b)));
          ui.closeSheet(); onChange();
        } }),
      ],
    });
  }

  function attachCreateDrag(track, dateKey, onChange) {
    let timer = null;
    let active = false;
    let anchor = 0;
    let ghost = null;
    let startY = 0;
    let pointerId = null;

    function cleanup() {
      clearTimeout(timer); timer = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (active && pointerId != null && track.hasPointerCapture(pointerId)) {
        track.releasePointerCapture(pointerId);
      }
      // 드래그 중에만 스크롤을 막는다. 평소에는 세로 스크롤이 되어야 한다.
      track.style.touchAction = "";
      active = false;
      pointerId = null;
    }

    function drawGhost(start, end) {
      if (!ghost) {
        ghost = ui.el("div", { class: "tt-ghost" }, [ui.el("span", { class: "tt-ghost-label" })]);
        track.appendChild(ghost);
      }
      ghost.style.top = pct(start) + "%";
      ghost.style.height = ((end - start) / SPAN) * 100 + "%";
      ghost.firstChild.textContent = dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end);
    }

    track.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tt-block")) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      anchor = yToMinutes(e.clientY, track);
      timer = setTimeout(() => {
        active = true;
        track.style.touchAction = "none";
        track.setPointerCapture(pointerId);
        drawGhost(anchor, Math.min(dt.DAY_END, anchor + dt.SLOT));
      }, LONG_PRESS_MS);
    });

    track.addEventListener("pointermove", (e) => {
      if (!active) {
        if (timer && Math.abs(e.clientY - startY) > MOVE_TOLERANCE) { clearTimeout(timer); timer = null; }
        return;
      }
      e.preventDefault();
      const cursor = yToMinutes(e.clientY, track);
      const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor);
      drawGhost(limited.start, Math.max(limited.start + dt.SLOT, limited.end));
    });

    function finish(e) {
      if (!active) { clearTimeout(timer); timer = null; return; }
      const cursor = yToMinutes(e.clientY, track);
      const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor);
      let start = limited.start;
      let end = Math.max(limited.start + dt.SLOT, limited.end);
      if (end > dt.DAY_END) { end = dt.DAY_END; start = Math.min(start, end - dt.SLOT); }
      cleanup();

      const candidate = { id: storeApi.newId(), subjectId: null, text: "", start, end, done: false };
      const check = storeApi.validateBlock(candidate);
      if (!check.ok) { ui.toast(check.error); return; }
      if (storeApi.findOverlap(blocksOf(dateKey), candidate)) { ui.toast("다른 블록과 겹칩니다."); return; }

      const blocks = blocksOf(dateKey).concat([candidate]);
      saveBlocks(dateKey, blocks);
      onChange();
      openBlockEditorOrRollback(dateKey, candidate.id, onChange);
    }

    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", () => cleanup());
  }

  // 새로 만든 블록의 편집 시트를 취소로 닫으면 그 빈 블록을 되돌린다.
  function openBlockEditorOrRollback(dateKey, blockId, onChange) {
    const before = blocksOf(dateKey).find((b) => b.id === blockId);
    let committed = false;
    openBlockEditor(dateKey, blockId, () => { committed = true; onChange(); });
    const host = document.getElementById("sheet-root");
    const observer = new MutationObserver(() => {
      if (host.childElementCount === 0) {
        observer.disconnect();
        if (!committed && before && !before.text && !before.subjectId) {
          saveBlocks(dateKey, blocksOf(dateKey).filter((b) => b.id !== blockId));
          onChange();
        }
      }
    });
    observer.observe(host, { childList: true });
  }

  function attachResize(handle, dateKey, blockId, edge, onChange) {
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const track = handle.closest(".tt-track");
      handle.setPointerCapture(e.pointerId);
      const block = blocksOf(dateKey).find((b) => b.id === blockId);
      if (!block) return;

      function onMove(ev) {
        ev.preventDefault();
        const cursor = yToMinutes(ev.clientY, track);
        const anchor = edge === "start" ? block.end : block.start;
        const limited = storeApi.limitRange(blocksOf(dateKey), anchor, cursor, blockId);
        const start = Math.min(limited.start, limited.end);
        const end = Math.max(limited.start, limited.end);
        if (end - start < dt.SLOT) return;
        const node = handle.parentElement;
        node.style.top = pct(start) + "%";
        node.style.height = ((end - start) / SPAN) * 100 + "%";
        node.dataset.start = start;
        node.dataset.end = end;
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const node = handle.parentElement;
        const start = Number(node.dataset.start);
        const end = Number(node.dataset.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || (start === block.start && end === block.end)) { onChange(); return; }
        const next = { ...block, start, end };
        if (!storeApi.validateBlock(next).ok || storeApi.findOverlap(blocksOf(dateKey), next, blockId)) {
          ui.toast("여기에는 놓을 수 없습니다."); onChange(); return;
        }
        saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === blockId ? next : b)));
        onChange();
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function blockNode(dateKey, block, subjects, onChange) {
    const color = subjectsApi.colorOf(subjects, block.subjectId);
    const label = [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";

    const node = ui.el("div", {
      class: "tt-block" + (block.done ? " tt-block-done" : ""),
      dataset: { id: block.id, start: block.start, end: block.end },
      style: { top: pct(block.start) + "%", height: ((block.end - block.start) / SPAN) * 100 + "%", background: color },
    }, [
      ui.el("button", {
        class: "tt-check", "aria-label": "완료 토글", text: block.done ? "✓" : "",
        onclick: (e) => {
          e.stopPropagation();
          saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === block.id ? { ...b, done: !b.done } : b)));
          onChange();
        },
      }),
      ui.el("button", {
        class: "tt-body", onclick: () => openBlockEditor(dateKey, block.id, onChange),
      }, [
        ui.el("span", { class: "tt-label", text: label }),
        ui.el("span", { class: "tt-time", text: dt.minutesToLabel(block.start) + "~" + dt.minutesToLabel(block.end) }),
      ]),
      ui.el("div", { class: "tt-handle tt-handle-top", "aria-hidden": "true" }),
      ui.el("div", { class: "tt-handle tt-handle-bottom", "aria-hidden": "true" }),
    ]);

    attachResize(node.querySelector(".tt-handle-top"), dateKey, block.id, "start", onChange);
    attachResize(node.querySelector(".tt-handle-bottom"), dateKey, block.id, "end", onChange);
    return node;
  }

  function nowLine(dateKey) {
    if (dateKey !== SP.app.today()) return null;
    const now = new Date();
    let minutes = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) minutes += 1440;
    if (minutes < dt.DAY_START || minutes > dt.DAY_END) return null;
    return ui.el("div", { class: "tt-now", style: { top: pct(minutes) + "%" } });
  }

  function render(host, dateKey, onChange) {
    const subjects = SP.app.state().settings.subjects;
    const blocks = blocksOf(dateKey);

    const hours = [];
    for (let m = dt.DAY_START; m <= dt.DAY_END; m += 60) {
      hours.push(ui.el("div", { class: "tt-hour", style: { top: pct(m) + "%" } }, [
        ui.el("span", { class: "tt-hour-label", text: dt.minutesToLabel(m) }),
      ]));
    }
    const ticks = [];
    for (let m = dt.DAY_START; m <= dt.DAY_END; m += dt.SLOT) {
      if (m % 60 === 0) continue;
      ticks.push(ui.el("div", { class: "tt-tick" + (m % 30 === 0 ? " tt-tick-half" : ""), style: { top: pct(m) + "%" } }));
    }

    const track = ui.el("div", { class: "tt-track", style: { height: (SPAN / 60) * HOUR_PX + "px" } },
      ticks.concat(hours, blocks.map((b) => blockNode(dateKey, b, subjects, onChange)), [nowLine(dateKey)].filter(Boolean))
    );
    attachCreateDrag(track, dateKey, onChange);

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "Timetable" }),
        ui.el("p", { class: "empty", text: "빈 곳을 길게 눌러 아래로 끌면 블록이 만들어집니다. 블록을 누르면 수정됩니다." }),
        track,
      ])
    );
  }

  const api = { render, yToMinutes, openBlockEditor, HOUR_PX };
  SP.timetable = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 2: `src/styles.css` 끝에 타임테이블 스타일 추가**

```css
/* ---------- 타임테이블 ---------- */
.tt-track {
  position: relative; margin-left: 46px; margin-top: 8px;
  background: var(--surface); border-left: 1px solid var(--line);
  touch-action: pan-y; user-select: none;
}
.tt-hour { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); }
.tt-hour-label { position: absolute; left: -46px; top: -8px; width: 42px; text-align: right; font-size: 11px; color: var(--muted); }
.tt-tick { position: absolute; left: 0; width: 5px; border-top: 1px solid #F1F3F5; }
.tt-tick-half { width: 10px; border-top-color: #E9ECEF; }

.tt-block {
  position: absolute; left: 2px; right: 2px; min-height: 10px;
  border-radius: 6px; overflow: hidden; display: flex; align-items: stretch;
  filter: saturate(.75); box-shadow: 0 1px 2px rgba(0,0,0,.08);
}
.tt-block-done { filter: saturate(1.35); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.tt-check {
  flex: 0 0 22px; border: 0; background: rgba(255,255,255,.5);
  font-size: 12px; font-weight: 700; cursor: pointer; padding: 0;
}
.tt-block-done .tt-check { background: rgba(255,255,255,.75); }
.tt-body {
  flex: 1; border: 0; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
  padding: 0 6px; overflow: hidden; text-align: left;
}
.tt-label { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.tt-time { font-size: 9px; opacity: .65; }
.tt-handle { position: absolute; left: 0; right: 0; height: 14px; cursor: ns-resize; touch-action: none; }
.tt-handle-top { top: -4px; }
.tt-handle-bottom { bottom: -4px; }

.tt-ghost {
  position: absolute; left: 2px; right: 2px;
  background: rgba(76,110,245,.25); border: 1.5px dashed var(--accent);
  border-radius: 6px; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.tt-ghost-label { font-size: 10px; font-weight: 700; color: var(--accent); background: rgba(255,255,255,.85); padding: 1px 5px; border-radius: 4px; }

.tt-now { position: absolute; left: 0; right: 0; border-top: 2px solid var(--danger); pointer-events: none; }
.tt-now::before { content: ""; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }

.editor-range { display: flex; justify-content: space-between; align-items: baseline; font-size: 18px; margin-bottom: 12px; }
.editor-duration { font-size: 13px; color: var(--muted); }
.stepper { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; margin-bottom: 10px; }
.stepper-label { font-size: 13px; color: var(--muted); }
.stepper-btn { min-height: 40px; padding: 0 12px; }
```

- [ ] **Step 3: 좌표 변환을 콘솔로 검증**

하루 화면을 연 뒤 콘솔에서 실행한다.

```js
const track = document.querySelector(".tt-track");
const r = track.getBoundingClientRect();
console.log(SP.timetable.yToMinutes(r.top, track));              // 300 (05:00)
console.log(SP.timetable.yToMinutes(r.bottom, track));           // 1560 (02:00)
console.log(SP.timetable.yToMinutes(r.top + r.height / 2, track)); // 930 (15:30)
console.log(SP.timetable.yToMinutes(r.top - 500, track));        // 300 (범위 밖 클램프)
console.log(SP.timetable.yToMinutes(r.bottom + 500, track));     // 1560
```

- [ ] 다섯 값이 각각 `300`, `1560`, `930`, `300`, `1560`으로 나온다
- [ ] 임의의 y값을 여러 번 넣어도 항상 5의 배수가 나온다

- [ ] **Step 4: 브라우저에서 상호작용 확인**

기기 에뮬레이션(390×844)에서 확인한다.

- [ ] 눈금이 05:00부터 02:00까지 1시간 간격 라벨로 표시된다 (라벨 22개: 05:00~23:00, 00:00, 01:00, 02:00)
- [ ] 빈 곳을 짧게 탭하면 아무 일도 없다
- [ ] 빈 곳을 0.3초 이상 누르면 점선 고스트가 나타나고, 끌면 시작~종료 시각이 실시간으로 표시된다
- [ ] 손을 떼면 블록 편집 시트가 열린다
- [ ] 시트에서 과목·내용을 넣고 저장하면 해당 색의 블록이 생긴다
- [ ] 시트를 **취소(✕ 또는 배경 탭)**하면 방금 만든 빈 블록이 사라진다
- [ ] 블록을 탭하면 편집 시트가 열리고, `−5분`/`+5분` 버튼으로 시작·종료가 5분씩 움직인다
- [ ] 최소 5분보다 짧게 만들려 하면 "블록은 최소 5분이어야 합니다." 토스트가 뜬다
- [ ] 블록 위/아래 끝을 끌면 길이가 바뀌고, 놓으면 저장된다
- [ ] 기존 블록 방향으로 드래그하면 그 경계에서 멈추고 겹치지 않는다
- [ ] 블록 왼쪽 체크 칸을 누르면 ✓가 생기고 색이 진해진다
- [ ] 체크한 순간 아래 "실제시간"이 즉시 늘어난다
- [ ] 오늘 날짜 화면에는 현재 시각에 빨간 선이 있고, 다른 날짜에는 없다
- [ ] 새로고침해도 모든 블록과 체크 상태가 유지된다
- [ ] 타임테이블을 세로로 스크롤할 때 실수로 블록이 만들어지지 않는다

- [ ] **Step 5: 커밋**

```bash
git add src/timetable.js src/styles.css
git commit -m "feat: 타임테이블 - 5분 스냅 드래그 생성, 길이 조절, 완료 체크, 현재 시각선"
```

---

### Task 10: 일정 UI · 복사/붙여넣기 UI · 설정

Task 7과 8에 남아 있는 "준비 중" 자리를 전부 실제 동작으로 바꾼다.

**Files:**
- Create: `src/sheets.js`
- Modify: `src/index.html` (`sheets.js` 스크립트 태그 추가)
- Modify: `src/day.js` (`openMenu`, `openEventEditor`를 `SP.sheets` 위임으로 교체)
- Modify: `src/calendar.js` (`onLongPress`의 "준비 중"을 실제 호출로 교체)
- Modify: `src/styles.css` (파일 끝에 설정·붙여넣기 섹션 추가)

**Interfaces:**
- Consumes: `SP.datetime`, `SP.store`, `SP.subjects`, `SP.events`, `SP.clipboard`, `SP.ui`, `SP.app`, `SP.day`, `SP.calendar`
- Produces: `SP.sheets` — `dayMenu(dateKey, onDone):void`, `eventEditor(dateKey, eventId, onDone):void`, `pasteSheet(baseKey, onDone):void`, `settings(onDone):void`

- [ ] **Step 1: `src/index.html`의 스크립트 목록에 `sheets.js` 추가**

`clipboard.js`와 `ui.js` 뒤, `todos.js` 앞에 넣는다.

```html
  <script src="ui.js"></script>
  <script src="sheets.js"></script>
  <script src="todos.js"></script>
```

- [ ] **Step 2: `src/sheets.js` 구현**

```js
(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const eventsApi = SP.events;
  const clip = SP.clipboard;
  const ui = SP.ui;

  function afterMutation(onDone) {
    SP.app.persist();
    ui.closeSheet();
    if (onDone) onDone();
  }

  /* ---------- 일정 ---------- */

  function eventEditor(dateKey, eventId, onDone) {
    const state = SP.app.state();
    const existing = eventId ? state.events.find((e) => e.id === eventId) : null;

    const title = ui.el("input", { type: "text", value: existing ? existing.title : "", placeholder: "예: 국어 수행평가", maxlength: "40" });
    const typeSelect = ui.el("select", { class: "subject-select" },
      eventsApi.EVENT_TYPES.map((t) =>
        ui.el("option", { value: t.id, text: t.label, selected: existing ? existing.type === t.id : t.id === "assessment" }))
    );
    const startInput = ui.el("input", { type: "date", value: existing ? existing.startDate : dateKey });
    const endInput = ui.el("input", { type: "date", value: existing ? existing.endDate : dateKey });
    const memoInput = ui.el("textarea", { placeholder: "메모 (선택)", maxlength: "300" });
    if (existing) memoInput.value = existing.memo;

    function save() {
      const payload = {
        title: title.value, type: typeSelect.value,
        color: eventsApi.typeOf(typeSelect.value).color,
        startDate: startInput.value, endDate: endInput.value, memo: memoInput.value,
      };
      if (!payload.title.trim()) { ui.toast("제목을 입력하세요."); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) { ui.toast("시작일을 선택하세요."); return; }
      if (existing) eventsApi.updateEvent(state, eventId, payload);
      else eventsApi.addEvent(state, payload);
      afterMutation(onDone);
    }

    ui.openSheet({
      title: existing ? "일정 수정" : "일정 추가",
      body: [
        ui.el("label", { class: "field" }, [ui.el("span", { text: "제목" }), title]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "유형" }), typeSelect]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "시작일" }), startInput]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "종료일 (하루면 시작일과 같게)" }), endInput]),
        ui.el("label", { class: "field" }, [ui.el("span", { text: "메모" }), memoInput]),
      ],
      actions: [
        existing
          ? ui.el("button", { class: "btn btn-danger", text: "삭제", onclick: () => {
              eventsApi.removeEvent(state, eventId); afterMutation(onDone);
            } })
          : ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "저장", onclick: save }),
      ],
    });
  }

  /* ---------- 붙여넣기 ---------- */

  function pasteSheet(baseKey, onDone) {
    const state = SP.app.state();
    if (!state.clipboard) { ui.toast("먼저 계획을 복사하세요."); return; }

    let range = { type: "day" };
    let filter = { type: "all" };
    let mode = "overwrite";

    const customFrom = ui.el("input", { type: "date", value: baseKey });
    const customTo = ui.el("input", { type: "date", value: baseKey });
    const customRow = ui.el("div", { class: "custom-range", hidden: true }, [
      ui.el("label", { class: "field" }, [ui.el("span", { text: "시작" }), customFrom]),
      ui.el("label", { class: "field" }, [ui.el("span", { text: "끝" }), customTo]),
    ]);

    const weekdayBoxes = dt.WEEKDAY_NAMES.map((name, i) =>
      ui.el("label", { class: "wd-chip" }, [
        ui.el("input", { type: "checkbox", value: String(i), checked: true, onchange: update }),
        ui.el("span", { text: name }),
      ])
    );
    const weekdayRow = ui.el("div", { class: "wd-row", hidden: true }, weekdayBoxes);

    const preview = ui.el("p", { class: "paste-preview" });

    function currentRange() {
      if (range.type !== "custom") return range;
      return { type: "custom", from: customFrom.value || baseKey, to: customTo.value || baseKey };
    }

    function currentFilter() {
      if (filter.type !== "custom") return filter;
      const days = weekdayBoxes
        .map((box) => (box.querySelector("input").checked ? Number(box.querySelector("input").value) : -1))
        .filter((n) => n >= 0);
      return { type: "custom", days };
    }

    function targets() {
      return clip.resolveTargetDates(currentRange(), currentFilter(), baseKey);
    }

    function update() {
      customRow.hidden = range.type !== "custom";
      weekdayRow.hidden = filter.type !== "custom";
      preview.textContent = "총 " + targets().length + "일에 적용됩니다.";
    }

    function chipGroup(options, getActive, onPick) {
      const group = ui.el("div", { class: "chip-group" });
      options.forEach((opt) => {
        const chip = ui.el("button", {
          class: "chip", text: opt.label,
          onclick: () => {
            onPick(opt.value);
            [...group.children].forEach((c) => c.classList.remove("chip-on"));
            chip.classList.add("chip-on");
            update();
          },
        });
        if (getActive() === opt.value) chip.classList.add("chip-on");
        group.appendChild(chip);
      });
      return group;
    }

    customFrom.addEventListener("change", update);
    customTo.addEventListener("change", update);

    ui.openSheet({
      title: "붙여넣기",
      body: [
        ui.el("p", { class: "paste-source", text: clip.describeClip(state.clipboard) }),
        ui.el("h3", { class: "sheet-sub", text: "범위" }),
        chipGroup(
          [
            { label: "이 날", value: "day" }, { label: "이번 주", value: "week" },
            { label: "이번 달", value: "month" }, { label: "올해", value: "year" },
            { label: "직접 선택", value: "custom" },
          ],
          () => range.type,
          (v) => { range = { type: v }; }
        ),
        customRow,
        ui.el("h3", { class: "sheet-sub", text: "요일" }),
        chipGroup(
          [
            { label: "전체", value: "all" }, { label: "평일만", value: "weekday" },
            { label: "주말만", value: "weekend" }, { label: "직접 선택", value: "custom" },
          ],
          () => filter.type,
          (v) => { filter = { type: v }; }
        ),
        weekdayRow,
        ui.el("h3", { class: "sheet-sub", text: "기존 계획" }),
        chipGroup(
          [
            { label: "덮어쓰기", value: "overwrite" },
            { label: "겹치지 않는 것만 추가", value: "merge" },
            { label: "계획 있는 날 건너뛰기", value: "skip" },
          ],
          () => mode,
          (v) => { mode = v; }
        ),
        preview,
      ],
      actions: [
        ui.el("button", { class: "btn btn-ghost", text: "취소", onclick: ui.closeSheet }),
        ui.el("button", { class: "btn btn-primary", text: "붙여넣기", onclick: () => {
          const keys = targets();
          if (keys.length === 0) { ui.toast("대상 날짜가 없습니다."); return; }
          const result = clip.paste(state, state.clipboard, keys, mode);
          afterMutation(onDone);
          const parts = [result.applied + "일 적용"];
          if (result.skipped) parts.push(result.skipped + "일 건너뜀");
          if (result.skippedBlocks) parts.push("겹친 블록 " + result.skippedBlocks + "개 제외");
          ui.toast(parts.join(" · "));
        } }),
      ],
    });
    update();
  }

  /* ---------- 하루 메뉴 ---------- */

  function dayMenu(dateKey, onDone) {
    const state = SP.app.state();

    function copyDay() {
      const result = clip.copyDay(state, dateKey);
      if (!result) { ui.toast("복사할 계획이 없습니다."); return; }
      state.clipboard = result;
      SP.app.persist();
      ui.closeSheet();
      ui.toast("이 날 계획을 복사했습니다.");
    }

    function copyWeek() {
      const result = clip.copyWeek(state, dateKey);
      if (!result) { ui.toast("이 주에 복사할 계획이 없습니다."); return; }
      state.clipboard = result;
      SP.app.persist();
      ui.closeSheet();
      ui.toast("이 주 계획을 복사했습니다.");
    }

    async function resetDay() {
      ui.closeSheet();
      const ok = await ui.confirmDialog("이 날의 할 일, 시간 블록, 성취도, 메모를 모두 지웁니다.\n일정은 지워지지 않습니다.");
      if (!ok) return;
      SP.app.store().setDay(dateKey, { todos: [], blocks: [], achievement: 0, memo: "" });
      SP.app.persist();
      if (onDone) onDone();
      ui.toast("초기화했습니다.");
    }

    ui.openSheet({
      title: dt.formatDateKorean(dateKey),
      body: [
        ui.el("p", { class: "paste-source", text: clip.describeClip(state.clipboard) }),
        ui.el("div", { class: "menu" }, [
          ui.el("button", { class: "menu-item", text: "이 날 복사", onclick: copyDay }),
          ui.el("button", { class: "menu-item", text: "이 주 복사", onclick: copyWeek }),
          ui.el("button", { class: "menu-item", text: "여기에 붙여넣기", onclick: () => { ui.closeSheet(); pasteSheet(dateKey, onDone); } }),
          ui.el("button", { class: "menu-item", text: "일정 추가", onclick: () => { ui.closeSheet(); eventEditor(dateKey, null, onDone); } }),
          ui.el("button", { class: "menu-item", text: "설정", onclick: () => { ui.closeSheet(); settings(onDone); } }),
          ui.el("button", { class: "menu-item menu-danger", text: "하루 초기화", onclick: resetDay }),
        ]),
      ],
    });
  }

  /* ---------- 설정 ---------- */

  function settings(onDone) {
    const state = SP.app.state();

    function subjectRow(subject) {
      const nameInput = ui.el("input", { type: "text", value: subject.name, maxlength: "12",
        onchange: (e) => { subjectsApi.updateSubject(state, subject.id, { name: e.target.value }); SP.app.persist(); } });
      const colorInput = ui.el("input", { type: "color", value: subject.color,
        onchange: (e) => { subjectsApi.updateSubject(state, subject.id, { color: e.target.value }); SP.app.persist(); } });
      const removeBtn = ui.el("button", { class: "icon-btn", text: "🗑", "aria-label": "삭제", onclick: async () => {
        const count = subjectsApi.countReferences(state, subject.id);
        ui.closeSheet();
        const ok = await ui.confirmDialog(
          "'" + subject.name + "' 과목을 삭제합니다.\n" +
          (count > 0 ? count + "개 항목이 '과목 없음'이 됩니다." : "사용 중인 항목은 없습니다."));
        if (!ok) { settings(onDone); return; }
        if (subjectsApi.removeSubject(state, subject.id) === -1) ui.toast("마지막 과목은 지울 수 없습니다.");
        SP.app.persist();
        settings(onDone);
      } });
      return ui.el("div", { class: "subject-row" }, [colorInput, nameInput, removeBtn]);
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = ui.el("a", { href: url, download: "study-planner-" + SP.app.today() + ".json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const fileInput = ui.el("input", { type: "file", accept: "application/json", class: "hidden-file",
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          let parsed = null;
          try { parsed = JSON.parse(reader.result); }
          catch (_) { ui.toast("JSON 파일을 읽을 수 없습니다."); return; }
          const result = storeApi.sanitizeState(parsed);
          ui.closeSheet();
          const ok = await ui.confirmDialog("현재 기기의 계획을 파일 내용으로 완전히 교체합니다.\n되돌릴 수 없습니다.");
          if (!ok) { settings(onDone); return; }
          const target = SP.app.state();
          target.settings = result.state.settings;
          target.days = result.state.days;
          target.events = result.state.events;
          target.clipboard = result.state.clipboard;
          SP.app.persist();
          if (onDone) onDone();
          ui.toast("불러왔습니다.");
        };
        reader.readAsText(file);
      } });

    ui.openSheet({
      title: "설정",
      body: [
        ui.el("h3", { class: "sheet-sub", text: "과목" }),
        ui.el("div", { class: "subject-list" }, state.settings.subjects.map(subjectRow)),
        ui.el("button", { class: "btn add-btn", text: "+ 과목 추가", onclick: () => {
          subjectsApi.addSubject(state, "새 과목", "#DDDDDD");
          SP.app.persist();
          settings(onDone);
        } }),
        ui.el("h3", { class: "sheet-sub", text: "백업" }),
        ui.el("p", { class: "empty", text: "이 기기에만 저장됩니다. 기기를 바꾸기 전에 반드시 내보내세요." }),
        ui.el("div", { class: "backup-row" }, [
          ui.el("button", { class: "btn", text: "JSON 내보내기", onclick: exportJson }),
          ui.el("button", { class: "btn", text: "JSON 불러오기", onclick: () => fileInput.click() }),
        ]),
        fileInput,
      ],
    });
  }

  const api = { dayMenu, eventEditor, pasteSheet, settings };
  SP.sheets = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 3: `src/day.js`의 임시 구현을 교체**

`api` 객체 정의에서 아래 두 줄을 바꾼다.

```js
    openMenu: (dateKey) => SP.sheets.dayMenu(dateKey, refresh),
    openEventEditor: (dateKey, eventId) => SP.sheets.eventEditor(dateKey, eventId, refresh),
```

- [ ] **Step 4: `src/calendar.js`의 `onLongPress`를 교체**

함수 본문을 통째로 아래로 바꾼다.

```js
  function onLongPress(dateKey) {
    SP.sheets.dayMenu(dateKey, () => SP.app.showCalendar(SP.app.viewDate().year, SP.app.viewDate().month));
  }
```

- [ ] **Step 5: `src/styles.css` 끝에 설정·붙여넣기 스타일 추가**

```css
/* ---------- 시트 내부 ---------- */
.sheet-sub { margin: 16px 0 8px; font-size: 13px; color: var(--muted); }
.sheet-sub:first-child { margin-top: 0; }

.chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { min-height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 13px; cursor: pointer; }
.chip-on { background: var(--accent); border-color: var(--accent); color: #fff; }

.custom-range { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.custom-range .field { margin-bottom: 0; }

.wd-row { display: flex; gap: 4px; margin-top: 10px; }
.wd-chip { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; flex: 1; }
.wd-chip input { width: 20px; height: 20px; }

.paste-source { margin: 0 0 4px; font-size: 13px; color: var(--muted); }
.paste-preview { margin: 16px 0 0; padding: 10px; background: #F1F3F9; border-radius: var(--radius); font-size: 13px; font-weight: 600; text-align: center; }

.menu-danger { color: var(--danger); }

.subject-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.subject-row { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px; align-items: center; }
.subject-row input[type="color"] { width: 44px; height: 44px; padding: 2px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.subject-row input[type="text"] { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); font: inherit; }

.backup-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hidden-file { display: none; }
```

- [ ] **Step 6: 브라우저에서 확인 — 일정**

- [ ] 달력에서 날짜를 길게 눌러 "일정 추가" → 제목·유형·시작일·종료일 입력 후 저장 → 달력 칸에 배지가 뜬다
- [ ] 유형을 "시험"으로 하고 종료일을 시작일보다 이틀 뒤로 하면 세 칸에 걸쳐 표시된다
- [ ] 하루 화면 "오늘의 일정" 카드에서 일정을 누르면 수정 시트가 열리고, 삭제가 동작한다
- [ ] 미래 일정을 만들면 하루 헤더 D-day 값이 그에 맞게 바뀐다
- [ ] 제목을 비우고 저장하면 "제목을 입력하세요." 토스트가 뜨고 저장되지 않는다

- [ ] **Step 7: 브라우저에서 확인 — 복사/붙여넣기**

계획이 들어 있는 날(예: 8/5)을 준비한 뒤 확인한다.

- [ ] 하루 화면 `⋯` → "이 날 복사" → "이 날 계획을 복사했습니다." 토스트
- [ ] `⋯` → "여기에 붙여넣기" → 시트 상단에 "하루 계획 (할 일 N개, 블록 M개)"가 뜬다
- [ ] 범위를 "이번 달", 요일을 "평일만"으로 고르면 미리보기가 "총 21일에 적용됩니다."로 바뀐다 (2026년 8월 기준)
- [ ] 요일을 "직접 선택"으로 바꾸면 요일 체크박스 줄이 나타나고, 체크를 해제할 때마다 미리보기 숫자가 줄어든다
- [ ] "붙여넣기"를 누르면 결과 토스트가 뜨고 달력의 여러 날에 계획이 생긴다
- [ ] 붙여넣은 날을 열면 블록의 완료 체크가 전부 해제되어 있다
- [ ] "계획 있는 날 건너뛰기"로 다시 붙여넣으면 "N일 건너뜀"이 토스트에 포함된다
- [ ] 달력에서 날짜를 길게 눌러 "이 주 복사" → 다른 주 날짜에서 붙여넣으면 요일이 맞게 들어간다
- [ ] 복사한 적이 없을 때 "여기에 붙여넣기"를 누르면 "먼저 계획을 복사하세요." 토스트가 뜬다

- [ ] **Step 8: 브라우저에서 확인 — 설정과 백업**

- [ ] `⋯` → "설정"에서 과목 이름을 바꾸면 To-Do 태그와 블록 라벨에 반영된다
- [ ] 색을 바꾸면 해당 과목 블록 색이 바뀐다
- [ ] "+ 과목 추가"로 과목이 늘어나고, 편집 시트의 과목 선택 목록에 나온다
- [ ] 사용 중인 과목을 삭제하면 "N개 항목이 '과목 없음'이 됩니다." 확인이 뜨고, 실행하면 해당 블록이 회색이 된다
- [ ] 과목을 하나만 남기고 삭제하려 하면 "마지막 과목은 지울 수 없습니다." 토스트가 뜬다
- [ ] "JSON 내보내기"로 파일이 다운로드된다
- [ ] 계획을 몇 개 지운 뒤 "JSON 불러오기"로 그 파일을 고르면 확인 후 원래 상태로 복원된다
- [ ] "하루 초기화"를 실행하면 그날의 할 일·블록·성취도·메모가 지워지고 일정은 남는다

- [ ] **Step 9: 커밋**

```bash
git add src/sheets.js src/index.html src/day.js src/calendar.js src/styles.css
git commit -m "feat: 일정 편집, 기간 지정 붙여넣기, 과목 설정, JSON 백업"
```

---

### Task 11: 빌드 · 배포 · 전체 점검

**Files:**
- Create: `build.js`
- Create: `README.md`
- Modify: `.gitignore` (변경 없음 — `dist/`는 배포 산출물이므로 커밋한다)

**Interfaces:**
- Consumes: `src/` 전체
- Produces: `dist/planner.html` — 외부 요청이 전혀 없는 단일 HTML 파일

- [ ] **Step 1: `build.js` 작성**

```js
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "src");
const OUT_DIR = path.join(__dirname, "dist");
const OUT = path.join(OUT_DIR, "planner.html");

function read(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8");
}

let html = read("index.html");

const cssLinks = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)];
for (const [tag, file] of cssLinks) {
  html = html.replace(tag, "<style>\n" + read(file) + "\n</style>");
}

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
for (const [tag, file] of scripts) {
  html = html.replace(tag, "<script>\n" + read(file) + "\n</script>");
}

const leftover = html.match(/(src|href)="(?!data:)[^"]+"/g);
if (leftover) {
  console.error("인라인되지 않은 외부 참조가 남아 있습니다:", leftover);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, "utf8");
console.log("dist/planner.html 생성 완료 (" + Math.round(html.length / 1024) + " KB)");
```

- [ ] **Step 2: 빌드 실행과 검증**

Run: `node build.js`
Expected: `dist/planner.html 생성 완료 (NN KB)` — 에러 없이 종료

- [ ] `dist/planner.html`에 `<script src=` 와 `<link rel="stylesheet"` 문자열이 하나도 없다 (`node -e "const s=require('fs').readFileSync('dist/planner.html','utf8'); console.log(s.includes('<script src='), s.includes('rel=\"stylesheet\"'))"` → `false false`)
- [ ] 파일을 브라우저에서 직접 열어(`file://`) 달력이 뜬다 (localStorage는 브라우저에 따라 막힐 수 있고, 그때는 경고 배너가 뜨는 것이 정상)

- [ ] **Step 3: 전체 회귀 점검**

`node serve.js`가 아니라 **빌드 산출물**을 임시 서버로 띄워 확인한다.

```bash
node -e "const h=require('http'),f=require('fs');h.createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(f.readFileSync('dist/planner.html'))}).listen(8081,()=>console.log('http://localhost:8081'))"
```

`http://localhost:8081`에서 아래를 순서대로 수행한다.

- [ ] 달력이 이번 달로 뜨고 오늘이 강조된다
- [ ] 오늘을 열어 할 일 2개를 추가하고 하나를 체크한다
- [ ] 타임테이블에 블록 3개를 드래그로 만들고 과목을 각각 다르게 지정한다
- [ ] 블록 2개를 완료 체크하고, 목표시간·실제시간·달성률이 맞는지 손으로 계산해 대조한다
- [ ] 성취도 슬라이더를 70%로, 메모에 한 줄 적는다
- [ ] 달력으로 나가 오늘 칸에 공부량 막대와 `70%`가 보인다
- [ ] 오늘을 복사해 "이번 주 · 평일만 · 덮어쓰기"로 붙여넣는다
- [ ] 붙여넣은 평일들에 계획이 들어갔고 주말은 비어 있다
- [ ] 수행평가 일정을 3일 뒤로 추가하고 D-day가 `D-3`인지 확인한다
- [ ] 브라우저를 완전히 닫았다 다시 열어도 위 내용이 전부 남아 있다
- [ ] 개발자도구 Network 탭에서 새로고침 시 요청이 문서 1건뿐이다 (외부 요청 0건)
- [ ] 기기 에뮬레이션 390×844에서 가로 스크롤이 없다
- [ ] 콘솔에 에러가 하나도 없다

- [ ] **Step 4: 자동 테스트 최종 실행**

Run: `node --test`
Expected: PASS — 5개 파일 전부 통과, 실패 0

- [ ] **Step 5: `README.md` 작성**

```markdown
# 스터디 플래너

종이 스터디 플래너를 옮긴 모바일 웹앱. 월간 달력에서 날짜를 눌러 하루 계획(To-Do + 05:00~익일 02:00 타임테이블)을 관리한다.

## 사용법

- **개발 서버**: `node serve.js` → http://localhost:8080
- **테스트**: `node --test`
- **빌드**: `node build.js` → `dist/planner.html` (단일 HTML, 외부 요청 없음)

## 폰에서 쓰기

`dist/planner.html`을 Artifact로 퍼블리시하면 나오는 URL을 폰 브라우저로 열고 "홈 화면에 추가"한다.

## 데이터

이 기기의 브라우저 저장소(`localStorage`, 키 `studyPlanner.v1`)에만 저장된다. 기기 간 자동 동기화는 없다.
**기기를 바꾸기 전에 설정 → JSON 내보내기로 백업할 것.**

## 문서

- 설계: `docs/superpowers/specs/2026-08-02-study-planner-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-study-planner.md`
```

- [ ] **Step 6: 커밋**

```bash
git add build.js README.md dist/planner.html
git commit -m "feat: 단일 HTML 빌드 스크립트와 배포 산출물"
```

- [ ] **Step 7: Artifact로 퍼블리시**

`dist/planner.html`을 Artifact 도구로 퍼블리시하고, 나온 URL을 사용자에게 전달한다. favicon은 `📚`를 쓴다. 이후 수정 시 **같은 파일 경로로 다시 퍼블리시**하면 같은 URL이 갱신된다.

**웹 앱 매니페스트는 넣지 않는다.** 설계 문서 §11에서 "필수 요건 아님"으로 정한 대로다. 단일 HTML에서는 별도 매니페스트 파일을 올릴 수 없고 `data:` URI 매니페스트는 브라우저 지원이 고르지 않다. iOS는 `apple-mobile-web-app-capable` 메타로, 안드로이드 Chrome은 "홈 화면에 추가" 바로가기로 정상 동작한다.

- [ ] 폰 브라우저로 URL 접속 → 달력이 뜬다
- [ ] "홈 화면에 추가" 후 아이콘으로 실행된다
- [ ] 폰에서 블록을 드래그로 만들고 체크할 수 있다
- [ ] 앱을 닫았다 다시 열어도 내용이 남아 있다

---

## 완료 기준

- `node --test` 전체 통과
- `node build.js` 성공, `dist/planner.html`에 외부 참조 0건
- Task 11 Step 3의 회귀 점검 항목 전부 통과
- Artifact URL로 폰에서 접속해 계획 작성·체크가 동작
