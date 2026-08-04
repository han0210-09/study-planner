# 격자 타임테이블 (1단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타임테이블을 한 행 = 한 시간인 21×12 격자로 바꾸고, 한글에서 글자를 끌듯 가로로 끌다 아래로 내리면 이어서 선택되게 하며, 블록 끝 빈 자리에 ⊕ 를 띄워 탭 한 번으로 다음 블록을 만든다.

**Architecture:** 격자 기하(조각 분할, 선택 보정, ⊕ 슬롯 계산)를 새 순수 모듈 `src/grid.js`로 빼고 `node --test`로 고정한다. `src/timetable.js`는 절대 위치 계산을 버리고 CSS Grid 배치로 다시 쓴다. 겹침 판정 `store.limitRange()`는 분 단위 정수로만 판단하므로 **손대지 않는다** — 넘기는 인자만 격자 셀 기준으로 보정한다.

**Tech Stack:** 바닐라 JS, 의존성 0개, Node 24 내장 테스트 러너, CSS Grid.

**스펙:** `docs/superpowers/specs/2026-08-04-timetable-grid-and-todo-link-design.md`

## Global Constraints

- 테스트 실행 명령은 항상 `node --test` (인자 없음). Node 24는 `node --test test/`처럼 디렉터리를 인자로 주면 그것을 테스트 폴더가 아니라 모듈 진입점으로 해석해 MODULE_NOT_FOUND로 죽는다.
- 모든 모듈은 UMD-lite 래퍼를 쓴다. 브라우저에서는 `SP.<name>`, Node에서는 `module.exports`. 새 파일도 기존 파일과 같은 형태여야 한다.
- 외부 의존성 0개. npm 패키지, CDN, 폰트 링크, `fetch`/`XHR`/`WebSocket`, `eval`/`new Function` 모두 금지.
- `innerHTML` 금지. DOM은 `ui.el()`로만 만든다.
- `toISOString()` 금지. 날짜 키는 로컬 기준 `YYYY-MM-DD`.
- 시간은 자정 기준 분 단위 정수. `DAY_START = 300`(05:00), `DAY_END = 1560`(익일 02:00), `SLOT = 5`. 항상 5의 배수이고 블록끼리 겹치지 않는다.
- 최소 터치 타깃 44px. 보이는 크기가 아니라 탭 영역 기준이다. 단, **격자 칸(약 25px)은 예외** — 탭이 아니라 드래그의 단위이고 정밀 보정은 ±5분 스테퍼가 맡는다.
- 390px 폭에서 가로 스크롤이 생기면 안 된다.
- CSS를 덧붙일 때 캐스케이드를 확인할 것. 같은 특이도의 규칙이 뒤에 오면 앞의 값을 덮는다. **이번 작업에서는 기존 `.tt-*` 규칙을 남겨두지 말고 지우고 새로 쓴다.**
- `store.limitRange()`의 시그니처와 동작을 바꾸지 말 것. 79개 테스트가 이 계약에 걸려 있다.
- 주석은 한국어로, "무엇을"이 아니라 "왜"를 적는다. 기존 파일들의 밀도를 따른다.

---

### Task 1: `src/grid.js` — 조각 분할

**Files:**
- Create: `src/grid.js`
- Create: `test/grid.test.js`
- Modify: `src/index.html:20` (`store.js` 다음 줄에 `grid.js` 추가)

**Interfaces:**
- Consumes: `src/datetime.js`의 `DAY_START`, `DAY_END`, `SLOT`, `clampToDay`
- Produces:
  - `COLS = 12`, `ROWS = 21` (숫자)
  - `rowColOf(minutes) → { row, col }`
  - `segmentsOf(start, end) → [{ row, col, span, start, end }]`
  - `widestIndex(segments) → number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/grid.test.js`:

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/grid.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/grid.js`:

```js
(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  const COLS = 60 / dt.SLOT;                     // 한 행 = 한 시간 = 12칸
  const ROWS = (dt.DAY_END - dt.DAY_START) / 60; // 05:00 ~ 익일 02:00 = 21행

  function rowColOf(minutes) {
    const offset = dt.clampToDay(minutes) - dt.DAY_START;
    return { row: Math.floor(offset / 60), col: (offset % 60) / dt.SLOT };
  }

  // 블록 하나가 시각 경계를 넘으면 행마다 조각으로 쪼개진다. 05:50~06:20 은
  // 05행 10~11칸 + 06행 0~3칸 두 조각이다.
  //
  // 정각에 끝나는 블록에 빈 조각을 붙이면 안 된다. 06:00~07:00 은 조각이 1개고,
  // 07행에 span 0 짜리가 붙으면 그 행이 통째로 물들어 보인다. 그래서 경계 판정을
  // `cursor < end` 로 한다 — `<=` 로 바꾸면 바로 그 버그가 난다.
  function segmentsOf(start, end) {
    const segs = [];
    let cursor = start;
    while (cursor < end) {
      const rowStart = dt.DAY_START + Math.floor((cursor - dt.DAY_START) / 60) * 60;
      const segEnd = Math.min(end, rowStart + 60);
      segs.push({
        row: (rowStart - dt.DAY_START) / 60,
        col: (cursor - rowStart) / dt.SLOT,
        span: (segEnd - cursor) / dt.SLOT,
        start: cursor,
        end: segEnd,
      });
      cursor = segEnd;
    }
    return segs;
  }

  // 라벨은 가장 넓은 조각이 맡는다. 첫 조각에 넣으면 05:55~08:00 처럼 첫 조각이
  // 한 칸(약 25px)인 블록에서 글자가 통째로 잘린다.
  function widestIndex(segments) {
    let best = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].span > segments[best].span) best = i;
    }
    return best;
  }

  const api = { COLS, ROWS, rowColOf, segmentsOf, widestIndex };

  root.SP = root.SP || {};
  root.SP.grid = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test`
Expected: PASS — 기존 79개 + 새 8개

- [ ] **Step 5: `src/index.html`에 스크립트를 추가한다**

`store.js` 줄 바로 다음에 넣는다. `timetable.js`보다 앞이어야 한다.

```html
  <script src="store.js"></script>
  <script src="grid.js"></script>
  <script src="subjects.js"></script>
```

- [ ] **Step 6: 커밋**

```bash
git add src/grid.js test/grid.test.js src/index.html
git commit -m "feat: 격자 조각 분할 grid.js 추가"
```

---

### Task 2: `src/grid.js` — 셀 선택 보정과 ⊕ 슬롯

**Files:**
- Modify: `src/grid.js`
- Modify: `test/grid.test.js`

**Interfaces:**
- Consumes: Task 1의 `src/grid.js`
- Produces:
  - `selectionArgs(anchorMin, cursorMin) → { anchor, cursor }` — `store.limitRange(blocks, anchor, cursor)`에 그대로 넘길 값
  - `plusSlotFor(blocks, block) → { start, end } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/grid.test.js` 끝에 붙인다:

```js
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

test("plusSlotFor: 틈이 넉넉하면 직전 블록과 같은 길이", () => {
  const blocks = [B(360, 420), B(480, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 480 });
});

test("plusSlotFor: 틈이 좁으면 틈 전체", () => {
  const blocks = [B(360, 420), B(450, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 450 });
});

test("plusSlotFor: 다음 블록이 붙어 있으면 null", () => {
  const blocks = [B(360, 420), B(420, 480)];
  assert.equal(grid.plusSlotFor(blocks, blocks[0]), null);
});

test("plusSlotFor: DAY_END에서 끝나면 null", () => {
  const blocks = [B(1500, 1560)];
  assert.equal(grid.plusSlotFor(blocks, blocks[0]), null);
});

test("plusSlotFor: 틈이 정확히 5분이면 5분짜리", () => {
  const blocks = [B(360, 420), B(425, 480)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 420, end: 425 });
});

test("plusSlotFor: 뒤가 비어 있으면 DAY_END까지가 틈", () => {
  const blocks = [B(360, 370)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[0]), { start: 370, end: 380 });
  assert.deepEqual(grid.plusSlotFor([B(1540, 1550)], B(1540, 1550)), { start: 1550, end: 1560 });
});

// 정렬 순서에 기대면 안 된다. 붙여넣기 직후처럼 순서가 흐트러진 배열도 들어온다.
test("plusSlotFor: 블록 순서가 뒤죽박죽이어도 가장 이른 다음 블록을 찾는다", () => {
  const blocks = [B(900, 960), B(360, 420), B(480, 540)];
  assert.deepEqual(grid.plusSlotFor(blocks, blocks[1]), { start: 420, end: 480 });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test`
Expected: FAIL — `grid.selectionArgs is not a function`

- [ ] **Step 3: 구현을 쓴다**

`src/grid.js`의 `widestIndex` 다음에 넣고, `api`에 두 함수를 추가한다:

```js
  // store.limitRange 는 분 단위 경계로만 판단한다. 그 계약을 바꾸지 않고
  // 격자의 "칸 단위 선택"을 얻으려면 넘기는 인자를 여기서 보정한다.
  //
  // 뒤로 끌 때 anchor 에 +5 를 주는 이유: limitRange 는 anchor 를 기준으로 블록이
  // 위쪽인지 아래쪽인지 판정한다. anchor 칸 자체를 결과에 포함시키려면 그 칸의
  // 끝을 넘겨야 한다. pointerdown 이 블록 위에서 시작하면 무시되므로 anchor 칸은
  // 항상 비어 있고, 따라서 b.end <= anchor 로 잘못 잡히는 블록은 없다.
  function selectionArgs(anchorMin, cursorMin) {
    return cursorMin >= anchorMin
      ? { anchor: anchorMin, cursor: cursorMin + dt.SLOT }
      : { anchor: anchorMin + dt.SLOT, cursor: cursorMin };
  }

  // 블록 뒤에 틈이 있으면 거기서 이어 만들 블록을 돌려준다. 길이는 직전 블록과
  // 같게 잡는다 — 50분씩 연달아 공부하는 식이 가장 흔하고 예측이 된다.
  // 틈이 그보다 좁으면 틈 전체를 쓴다.
  function plusSlotFor(blocks, block) {
    let gapEnd = dt.DAY_END;
    for (const b of blocks) {
      if (b.id === block.id) continue;
      if (b.start >= block.end && b.start < gapEnd) gapEnd = b.start;
    }
    if (gapEnd - block.end < dt.SLOT) return null;
    return { start: block.end, end: Math.min(block.end + (block.end - block.start), gapEnd) };
  }
```

`api` 줄을 바꾼다:

```js
  const api = { COLS, ROWS, rowColOf, segmentsOf, widestIndex, selectionArgs, plusSlotFor };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test`
Expected: PASS — 전부 통과. `store.limitRange`를 건드리지 않았으므로 store 테스트도 그대로여야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/grid.js test/grid.test.js
git commit -m "feat: 셀 단위 선택 보정과 ⊕ 슬롯 계산"
```

---

### Task 3: 격자 렌더링

**Files:**
- Modify: `src/timetable.js` (`render`, `blockNode`, `nowLine` 교체)
- Modify: `src/styles.css:165-209` (`.tt-*` 전체 교체), `src/styles.css:1-13` (`--tt-row` 추가)

**Interfaces:**
- Consumes: Task 1~2의 `SP.grid`
- Produces:
  - `.tt-cells` — 12열 × 21행 CSS Grid. 드래그 리스너가 붙는 요소이자 좌표 기준 사각형
  - `.tt-seg[data-id]` — 블록 조각. 드래그 시작 시 무시 대상 (`closest(".tt-seg")`)
  - `pointToMinutes(clientX, clientY, cellsEl) → 분`

- [ ] **Step 1: `:root`에 행 높이 변수를 추가한다**

`src/styles.css`의 `:root` 블록 안, `--radius: 12px;` 다음 줄:

```css
  --tt-row: 44px;
```

- [ ] **Step 2: `.tt-*` 규칙을 통째로 갈아끼운다**

`src/styles.css` 165~209행(`/* ---------- 타임테이블 ---------- */`부터 `.tt-now::before`까지)을 **삭제하고** 아래로 대체한다. 남겨두고 덧붙이면 같은 특이도의 옛 규칙이 새 값을 덮는다.

```css
/* ---------- 타임테이블 (한 행 = 한 시간, 한 칸 = 5분) ---------- */
.tt-wrap { display: flex; margin-top: 8px; user-select: none; }
.tt-labels { flex: 0 0 34px; }
.tt-label-cell {
  height: var(--tt-row); display: flex; align-items: flex-start; justify-content: flex-end;
  padding: 2px 6px 0 0; font-size: 10px; color: var(--muted); line-height: 1;
}
.tt-cells {
  flex: 1; min-width: 0; display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: var(--tt-row);
  border-left: 1px solid var(--line); border-bottom: 1px solid var(--line);
  background: var(--surface);
  touch-action: pan-y;
}
/* 눈금은 테두리가 아니라 배경 그라디언트로 그린다. 격자 아이템에 border 를 주면
   box-sizing 때문에 행 높이가 라벨과 1px 어긋난다. */
.tt-row {
  grid-column: 1 / -1;
  background-image:
    linear-gradient(to bottom, var(--line) 0 1px, transparent 1px),
    repeating-linear-gradient(to right, #E9ECEF 0 1px, transparent 1px 50%),
    repeating-linear-gradient(to right, #F1F3F5 0 1px, transparent 1px calc(100% / 12));
}

.tt-seg {
  display: flex; align-items: stretch; overflow: hidden;
  margin: 2px 0; filter: saturate(.75); box-shadow: 0 1px 2px rgba(0,0,0,.08);
}
.tt-seg-first { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.tt-seg-last { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
.tt-seg-done { filter: saturate(1.35); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.tt-seg-dragging { opacity: .3; }

/* 조각이 한 칸(약 25px)일 수도 있으므로 44px 을 고정폭으로 못 준다. 줄어들게 두고,
   짧은 블록의 완료 처리는 편집 시트의 완료 토글이 맡는다. */
.tt-check {
  flex: 0 1 44px; min-width: 16px; border: 0; background: rgba(255,255,255,.5);
  font-size: 12px; font-weight: 700; cursor: pointer; padding: 0;
}
.tt-seg-done .tt-check { background: rgba(255,255,255,.75); }
.tt-body {
  flex: 1 1 auto; min-width: 0; border: 0; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
  padding: 0 4px; overflow: hidden; text-align: left;
}
.tt-label { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.tt-time { font-size: 9px; opacity: .65; white-space: nowrap; }

.tt-handle { position: absolute; top: 0; bottom: 0; width: 14px; cursor: ew-resize; touch-action: none; }
.tt-handle-start { left: -3px; }
.tt-handle-end { right: -3px; }

.tt-ghost {
  background: rgba(76,110,245,.25); border: 1.5px dashed var(--accent);
  margin: 2px 0; pointer-events: none; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.tt-ghost-label { font-size: 10px; font-weight: 700; color: var(--accent); background: rgba(255,255,255,.85); padding: 1px 4px; border-radius: 4px; white-space: nowrap; }

.tt-plus {
  align-self: center; justify-self: center;
  width: 26px; height: 26px; padding: 0; line-height: 1;
  border: 1.5px dashed var(--accent); border-radius: 50%;
  background: rgba(76,110,245,.10); color: var(--accent);
  font-size: 15px; font-weight: 700; cursor: pointer;
}

.tt-now-row { grid-column: 1 / -1; position: relative; pointer-events: none; }
.tt-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--danger); }
.tt-now::before { content: ""; position: absolute; left: -3px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
```

- [ ] **Step 3: `src/timetable.js`의 상단 상수와 좌표 변환을 바꾼다**

`HOUR_PX`, `SPAN`, `yToMinutes`, `pct` 를 지우고 아래로 대체한다:

```js
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const grid = SP.grid;
  const ui = SP.ui;

  const LONG_PRESS_MS = 300;
  const MOVE_TOLERANCE = 8;

  // .tt-cells 의 사각형이 곧 데이터 영역이다. 시각 라벨을 같은 격자에 넣지 않고
  // 옆에 따로 둔 이유가 이것 — 라벨 폭을 빼는 보정이 필요 없어진다.
  function pointToMinutes(clientX, clientY, cellsEl) {
    const r = cellsEl.getBoundingClientRect();
    const col = Math.min(grid.COLS - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * grid.COLS)));
    const row = Math.min(grid.ROWS - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * grid.ROWS)));
    return dt.DAY_START + row * 60 + col * dt.SLOT;
  }

  function segStyle(seg) {
    return { gridRow: String(seg.row + 1), gridColumn: (seg.col + 1) + " / span " + seg.span };
  }
```

- [ ] **Step 4: `blockNode`를 `blockSegments`로 바꾼다**

`blockNode` 함수 전체를 아래로 대체한다:

```js
  function blockSegments(dateKey, block, subjects, onChange) {
    const color = subjectsApi.colorOf(subjects, block.subjectId);
    const label = [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";
    const segs = grid.segmentsOf(block.start, block.end);
    const widest = grid.widestIndex(segs);
    const last = segs.length - 1;

    return segs.map((seg, i) => {
      const parts = [];
      if (i === widest) {
        parts.push(ui.el("button", {
          class: "tt-check", "aria-label": "완료 토글", text: block.done ? "✓" : "",
          onclick: (e) => {
            e.stopPropagation();
            saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === block.id ? { ...b, done: !b.done } : b)));
            onChange();
          },
        }));
        parts.push(ui.el("button", { class: "tt-body", onclick: () => openBlockEditor(dateKey, block.id, onChange) }, [
          ui.el("span", { class: "tt-label", text: label }),
          ui.el("span", { class: "tt-time", text: dt.minutesToLabel(block.start) + "~" + dt.minutesToLabel(block.end) }),
        ]));
      }
      if (i === 0) parts.push(ui.el("div", { class: "tt-handle tt-handle-start", "aria-hidden": "true" }));
      if (i === last) parts.push(ui.el("div", { class: "tt-handle tt-handle-end", "aria-hidden": "true" }));

      return ui.el("div", {
        class: "tt-seg" + (block.done ? " tt-seg-done" : "") +
          (i === 0 ? " tt-seg-first" : "") + (i === last ? " tt-seg-last" : ""),
        dataset: { id: block.id },
        style: Object.assign(segStyle(seg), { background: color, position: "relative" }),
      }, parts);
    });
  }
```

`position: relative` 를 인라인으로 주는 이유는 `.tt-handle` 이 `position: absolute` 라 기준 상자가 필요하기 때문이다.

- [ ] **Step 5: `nowLine`을 `nowMarker`로 바꾼다**

```js
  function nowMarker(dateKey) {
    if (dateKey !== SP.app.today()) return null;
    const now = new Date();
    let minutes = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) minutes += 1440;
    if (minutes < dt.DAY_START || minutes >= dt.DAY_END) return null;
    const rc = grid.rowColOf(minutes);
    return ui.el("div", { class: "tt-now-row", style: { gridRow: String(rc.row + 1) } }, [
      ui.el("div", { class: "tt-now", style: { left: ((minutes - dt.DAY_START) % 60) / 60 * 100 + "%" } }),
    ]);
  }
```

- [ ] **Step 6: `render`를 바꾼다**

```js
  function render(host, dateKey, onChange) {
    const subjects = SP.app.state().settings.subjects;
    const blocks = blocksOf(dateKey);

    const labels = [];
    for (let r = 0; r < grid.ROWS; r++) {
      labels.push(ui.el("div", { class: "tt-label-cell", text: dt.minutesToLabel(dt.DAY_START + r * 60) }));
    }

    const cells = ui.el("div", { class: "tt-cells" });
    for (let r = 0; r < grid.ROWS; r++) {
      cells.appendChild(ui.el("div", { class: "tt-row", style: { gridRow: String(r + 1) } }));
    }
    for (const b of blocks) {
      for (const node of blockSegments(dateKey, b, subjects, onChange)) cells.appendChild(node);
    }
    const marker = nowMarker(dateKey);
    if (marker) cells.appendChild(marker);

    attachCreateDrag(cells, dateKey, onChange);

    ui.clear(host).appendChild(
      ui.el("section", { class: "card" }, [
        ui.el("h2", { class: "card-title", text: "Timetable" }),
        ui.el("p", { class: "empty", text: "빈 칸을 옆으로 끌면 시간이 잡힙니다. 그대로 아래로 내리면 이어집니다." }),
        ui.el("div", { class: "tt-wrap" }, [ui.el("div", { class: "tt-labels" }, labels), cells]),
      ])
    );
  }
```

- [ ] **Step 7: `api` 줄을 바꾼다**

```js
  const api = { render, pointToMinutes, openBlockEditor };
```

- [ ] **Step 8: 남은 참조를 정리한다**

`attachCreateDrag`와 `attachResize`는 아직 옛 좌표 함수를 쓴다. 이 태스크에서는 **일단 컴파일만 되게** `yToMinutes(clientY, track)` 호출을 `pointToMinutes(e.clientX, e.clientY, cells)` 형태로 바꾸고, `.tt-block` 셀렉터를 `.tt-seg`로, `.tt-track`을 `.tt-cells`로 바꾼다. 동작 정리는 Task 4~5에서 한다.

Run: `node --test`
Expected: PASS — 순수 로직 테스트는 이 태스크에서 바뀌지 않는다.

- [ ] **Step 9: 브라우저에서 확인한다**

```bash
node serve.js
```

`http://localhost:8080` 을 열고 개발자도구에서 폭 390px로 맞춘 뒤:

1. 날짜를 눌러 하루 화면으로 들어간다
2. 21행 × 12칸 격자가 보이고 왼쪽에 05~01 시각 라벨이 행마다 정렬되어 있다
3. **가로 스크롤바가 생기지 않는다**
4. 콘솔에 오류가 없다
5. 기존 블록이 있으면 해당 칸에 색이 칠해져 있다

- [ ] **Step 10: 커밋**

```bash
git add src/timetable.js src/styles.css
git commit -m "feat: 타임테이블을 21x12 격자로 렌더링"
```

---

### Task 4: 흐름 드래그

**Files:**
- Modify: `src/timetable.js` (`attachCreateDrag` 전체 교체, `createBlock` 추출)

**Interfaces:**
- Consumes: `grid.selectionArgs`, `grid.segmentsOf`, `grid.widestIndex`, `pointToMinutes`
- Produces:
  - `createBlock(dateKey, start, end, onChange)` — Task 6의 ⊕ 가 같은 함수를 쓴다
  - `clickAfterDrag() → boolean` — Task 6의 ⊕ 가 자기 click 을 버릴지 판단한다

- [ ] **Step 1: 모듈 스코프에 드래그 종료 시각을 둔다**

`LONG_PRESS_MS` / `MOVE_TOLERANCE` 다음에 넣는다:

```js
  // 드래그가 성립한 제스처는 pointerup 뒤에 click 을 하나 더 낸다. 그대로 두면
  // ⊕ 칸에서 길게 눌러 드래그해놓고 손을 뗀 순간 ⊕ 가 블록을 하나 더 만든다.
  let dragEndedAt = 0;
  function clickAfterDrag() { return Date.now() - dragEndedAt < 300; }
```

- [ ] **Step 2: 블록 생성을 함수로 뺀다**

`attachCreateDrag` 위에 넣는다. 지금 `finish()` 안에 인라인으로 있는 로직과 같다.

```js
  function createBlock(dateKey, start, end, onChange) {
    const candidate = { id: storeApi.newId(), subjectId: null, text: "", start, end, done: false };
    const check = storeApi.validateBlock(candidate);
    if (!check.ok) { ui.toast(check.error); return; }
    if (storeApi.findOverlap(blocksOf(dateKey), candidate)) { ui.toast("다른 블록과 겹칩니다."); return; }
    saveBlocks(dateKey, blocksOf(dateKey).concat([candidate]));
    onChange();
    openBlockEditorOrRollback(dateKey, candidate.id, onChange);
  }
```

- [ ] **Step 3: 고스트 그리기를 함수로 뺀다**

```js
  function drawGhost(cells, nodes, start, end) {
    for (const n of nodes) n.remove();
    nodes.length = 0;
    const segs = grid.segmentsOf(start, end);
    for (const seg of segs) {
      const node = ui.el("div", { class: "tt-ghost", style: segStyle(seg) });
      nodes.push(node);
      cells.appendChild(node);
    }
    const w = grid.widestIndex(segs);
    if (nodes[w]) {
      nodes[w].appendChild(ui.el("span", {
        class: "tt-ghost-label", text: dt.minutesToLabel(start) + " ~ " + dt.minutesToLabel(end),
      }));
    }
  }
```

- [ ] **Step 4: `attachCreateDrag`를 통째로 바꾼다**

```js
  function attachCreateDrag(cells, dateKey, onChange) {
    let timer = null;
    let active = false;
    let decided = false;
    let anchor = 0;
    let startX = 0, startY = 0;
    let pointerId = null;
    const ghost = [];

    function cleanup() {
      clearTimeout(timer); timer = null;
      for (const n of ghost) n.remove();
      ghost.length = 0;
      if (active && pointerId != null && cells.hasPointerCapture(pointerId)) {
        cells.releasePointerCapture(pointerId);
      }
      // 드래그 중에만 스크롤을 막는다. 평소에는 세로 스크롤이 되어야 한다.
      cells.style.touchAction = "";
      active = false; decided = false; pointerId = null;
    }

    function begin() {
      active = true; decided = true;
      cells.style.touchAction = "none";
      cells.setPointerCapture(pointerId);
    }

    function rangeAt(cursorMin) {
      const args = grid.selectionArgs(anchor, cursorMin);
      const limited = storeApi.limitRange(blocksOf(dateKey), args.anchor, args.cursor);
      return { start: limited.start, end: Math.max(limited.start + dt.SLOT, limited.end) };
    }

    cells.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".tt-seg")) return;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      anchor = pointToMinutes(e.clientX, e.clientY, cells);
      decided = false;
      timer = setTimeout(() => {
        timer = null;
        begin();
        const r = rangeAt(anchor);
        drawGhost(cells, ghost, r.start, r.end);
      }, LONG_PRESS_MS);
    });

    cells.addEventListener("pointermove", (e) => {
      if (!active) {
        if (decided || timer === null) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= MOVE_TOLERANCE && dy <= MOVE_TOLERANCE) return;
        // 대각선으로 끌 때는 더 많이 움직인 축이 이긴다. 가로면 기다리지 않고
        // 바로 선택, 세로면 페이지 스크롤에 넘긴다. 한 번 정하면 번복하지 않는다.
        decided = true;
        clearTimeout(timer); timer = null;
        if (dx <= dy) return;
        begin();
      }
      e.preventDefault();
      const r = rangeAt(pointToMinutes(e.clientX, e.clientY, cells));
      drawGhost(cells, ghost, r.start, r.end);
    });

    function finish(e) {
      if (!active) { clearTimeout(timer); timer = null; decided = false; return; }
      const r = rangeAt(pointToMinutes(e.clientX, e.clientY, cells));
      let start = r.start;
      let end = r.end;
      if (end > dt.DAY_END) { end = dt.DAY_END; start = Math.min(start, end - dt.SLOT); }
      cleanup();
      dragEndedAt = Date.now();
      createBlock(dateKey, start, end, onChange);
    }

    cells.addEventListener("pointerup", finish);
    cells.addEventListener("pointercancel", cleanup);
  }
```

- [ ] **Step 5: 테스트가 그대로인지 본다**

Run: `node --test`
Expected: PASS — 순수 로직은 바뀌지 않았다.

- [ ] **Step 6: 브라우저에서 네 가지를 확인한다**

`node serve.js` → `http://localhost:8080`, 폭 390px, 터치 에뮬레이션 켜기.

1. **가로 즉시** — 빈 칸에서 옆으로 끌면 기다리지 않고 파란 고스트가 따라온다
2. **세로는 스크롤** — 빈 칸에서 바로 아래로 끌면 고스트가 안 생기고 페이지가 스크롤된다
3. **길게 누른 뒤 세로** — 0.3초 누르고 있다가 아래로 내리면 선택이 이어진다
4. **가로 → 아래로 이어짐** — 옆으로 끌어 선택을 시작한 뒤 그대로 아래 행으로 내리면 시각을 넘어 이어서 선택되고, 손을 떼면 그 범위로 블록이 만들어지며 편집 시트가 열린다

- [ ] **Step 7: 커밋**

```bash
git add src/timetable.js
git commit -m "feat: 가로 즉시 + 길게 누르기 두 진입 조건의 흐름 드래그"
```

---

### Task 5: 세로 손잡이 리사이즈

**Files:**
- Modify: `src/timetable.js` (`attachResize` 전체 교체, `blockSegments`에서 호출)

**Interfaces:**
- Consumes: `drawGhost`, `pointToMinutes`, `storeApi.limitRange`
- Produces: 없음 (내부 동작)

- [ ] **Step 1: `attachResize`를 통째로 바꾼다**

```js
  // 끄는 동안 조각을 직접 재배치하지 않는다. 조각이 여러 개면 고스트 한 벌을
  // 다시 그리는 쪽이 단순하고, 생성 드래그와 미리보기 경로가 하나로 합쳐진다.
  function attachResize(handle, dateKey, blockId, edge, onChange) {
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const cells = handle.closest(".tt-cells");
      const block = blocksOf(dateKey).find((b) => b.id === blockId);
      if (!cells || !block) return;

      handle.setPointerCapture(e.pointerId);
      cells.style.touchAction = "none";
      const owned = [].slice.call(cells.querySelectorAll('.tt-seg[data-id="' + blockId + '"]'));
      for (const n of owned) n.classList.add("tt-seg-dragging");

      const ghost = [];
      let next = null;

      function onMove(ev) {
        ev.preventDefault();
        const cursor = pointToMinutes(ev.clientX, ev.clientY, cells);
        // 고정된 쪽 모서리가 anchor 다. 끝을 끌 때만 커서 칸을 포함시킨다.
        const anchor = edge === "start" ? block.end : block.start;
        const c = edge === "start" ? cursor : cursor + dt.SLOT;
        const limited = storeApi.limitRange(blocksOf(dateKey), anchor, c, blockId);
        const start = Math.min(limited.start, limited.end);
        const end = Math.max(limited.start, limited.end);
        if (end - start < dt.SLOT) return;
        next = { start, end };
        drawGhost(cells, ghost, start, end);
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        for (const n of ghost) n.remove();
        cells.style.touchAction = "";
        dragEndedAt = Date.now();
        if (!next || (next.start === block.start && next.end === block.end)) { onChange(); return; }
        const updated = { ...block, start: next.start, end: next.end };
        if (!storeApi.validateBlock(updated).ok || storeApi.findOverlap(blocksOf(dateKey), updated, blockId)) {
          ui.toast("여기에는 놓을 수 없습니다."); onChange(); return;
        }
        saveBlocks(dateKey, blocksOf(dateKey).map((b) => (b.id === blockId ? updated : b)));
        onChange();
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }
```

- [ ] **Step 2: `blockSegments`가 손잡이를 연결하게 한다**

`blockSegments`의 `return segs.map(...)` 안, `ui.el("div", {...}, parts)` 결과를 `node` 변수에 담고 반환 전에 붙인다:

```js
      const node = ui.el("div", { /* 기존 그대로 */ }, parts);
      const startHandle = node.querySelector(".tt-handle-start");
      const endHandle = node.querySelector(".tt-handle-end");
      if (startHandle) attachResize(startHandle, dateKey, block.id, "start", onChange);
      if (endHandle) attachResize(endHandle, dateKey, block.id, "end", onChange);
      return node;
```

- [ ] **Step 3: 테스트**

Run: `node --test`
Expected: PASS

- [ ] **Step 4: 브라우저에서 확인한다**

1. 블록을 하나 만든다
2. 블록 **왼쪽 모서리**를 끈다 → 원본이 흐려지고 고스트가 따라온다. 손을 떼면 시작 시각이 바뀐다
3. 블록 **오른쪽 모서리**를 끈다 → 종료 시각이 바뀐다
4. 다른 블록 위로 끌어보면 그 블록 경계에서 멈춘다
5. 끝을 오른쪽으로 끌어 시각을 넘기면 다음 행으로 조각이 이어진다

- [ ] **Step 5: 커밋**

```bash
git add src/timetable.js
git commit -m "feat: 리사이즈 손잡이를 세로 모서리로, 미리보기는 고스트로"
```

---

### Task 6: ⊕ 이어서 만들기

**Files:**
- Modify: `src/timetable.js` (`plusNodes` 추가, `render`에서 호출)

**Interfaces:**
- Consumes: `grid.plusSlotFor`, `grid.rowColOf`, `createBlock`, `clickAfterDrag`
- Produces: `.tt-plus` 버튼

- [ ] **Step 1: `plusNodes`를 추가한다**

`nowMarker` 위에 넣는다:

```js
  // 블록이 끝나는 지점이 곧 틈의 첫 칸이다. ⊕ 를 블록 위가 아니라 틈의 첫 칸에
  // 놓아야 읽는 순서대로 "여기부터 이어서"가 된다.
  function plusNodes(dateKey, blocks, onChange) {
    const nodes = [];
    for (const block of blocks) {
      const slot = grid.plusSlotFor(blocks, block);
      if (!slot) continue;
      const rc = grid.rowColOf(slot.start);
      nodes.push(ui.el("button", {
        class: "tt-plus", text: "+",
        "aria-label": dt.minutesToLabel(slot.start) + "부터 이어서 만들기",
        style: { gridRow: String(rc.row + 1), gridColumn: String(rc.col + 1) },
        // pointerdown 은 가로채지 않는다. 이 칸에서도 드래그가 시작될 수 있어야
        // 하기 때문이다. 대신 드래그로 끝난 제스처의 click 은 버린다.
        onclick: () => {
          if (clickAfterDrag()) return;
          createBlock(dateKey, slot.start, slot.end, onChange);
        },
      }));
    }
    return nodes;
  }
```

- [ ] **Step 2: `render`에서 붙인다**

블록 조각을 붙인 뒤, `nowMarker` 앞에 넣는다:

```js
    for (const node of plusNodes(dateKey, blocks, onChange)) cells.appendChild(node);
```

- [ ] **Step 3: 테스트**

Run: `node --test`
Expected: PASS

- [ ] **Step 4: 브라우저에서 확인한다 — 특히 4번**

1. 06:00~07:00 블록을 만든다 → 07시 행 첫 칸에 ⊕ 가 뜬다
2. ⊕ 를 탭한다 → 07:00~08:00 (직전과 같은 60분) 블록이 생기고 편집 시트가 열린다
3. 08:00~08:30 블록을 만들고 그 앞 블록을 07:00~07:40으로 줄인다 → ⊕ 가 07:40 칸에 뜨고, 탭하면 08:00까지 20분만 잡힌다 (틈이 좁으므로)
4. **⊕ 칸에서 길게 눌러 드래그한 뒤 손을 뗀다 → 드래그한 범위로 블록이 하나만 생긴다.** ⊕ 가 추가로 하나 더 만들면 실패다
5. 블록이 딱 붙어 있으면 ⊕ 가 없다
6. 01:00~02:00 블록을 만들면 그 뒤에 ⊕ 가 없다

- [ ] **Step 5: 커밋**

```bash
git add src/timetable.js
git commit -m "feat: 블록 끝 빈 자리에 ⊕ 로 이어서 만들기"
```

---

### Task 7: 빌드·배포 검증

**Files:**
- Modify: 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~6 전부

- [ ] **Step 1: 전체 테스트**

Run: `node --test`
Expected: 기존 79개 + 새 grid 테스트 전부 통과, 실패 0

- [ ] **Step 2: 빌드**

```bash
node build.js && node build-artifact.js
```

Expected: `dist/planner.html`, `dist/planner-artifact.html` 생성. `build.js`는 외부 참조가 남으면 스스로 죽는다.

- [ ] **Step 3: grid.js 가 인라인되었는지 확인한다**

```bash
grep -c "segmentsOf" dist/planner.html
```

Expected: 1 이상. 0이면 `index.html`에 `<script src="grid.js">`를 안 넣은 것이다.

- [ ] **Step 4: 빌드 결과물을 직접 연다**

`dist/planner.html`을 브라우저로 열어 격자·드래그·⊕ 가 `src/`에서와 똑같이 동작하는지 본다. `serve.js` 없이 파일만으로 떠야 한다.

- [ ] **Step 5: 커밋**

```bash
git add dist/
git commit -m "build: 격자 타임테이블 반영"
```

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| 21행 × 12칸, 행 높이 44px, 라벨 거터 34px | Task 3 |
| CSS Grid 배치 (절대 위치 폐기) | Task 3 |
| 조각 분할, 정각 종료 시 빈 조각 없음 | Task 1 |
| 가장 넓은 조각이 라벨, 동점이면 앞선 것 | Task 1 (`widestIndex`), Task 3 (적용) |
| 첫/마지막 조각의 둥근 모서리와 손잡이 | Task 3 (CSS), Task 5 (연결) |
| 가로 즉시 + 길게 누르기, 대각선은 큰 축이 이김 | Task 4 |
| `touch-action` 전환 | Task 4 |
| 좌표 → 분 변환 | Task 3 (`pointToMinutes`) |
| 셀 포함 선택, `limitRange` 불변 | Task 2 |
| ⊕ 위치·길이·안 띄우는 조건 | Task 2 (`plusSlotFor`), Task 6 (렌더) |
| ⊕ 와 드래그가 안 싸움 | Task 4 (`clickAfterDrag`), Task 6 (적용) |
| 세로 손잡이 + 고스트 미리보기 | Task 5 |
| 현재 시각선 | Task 3 (`nowMarker`) |
| 기존 `.tt-*` 규칙 삭제 후 교체 | Task 3 Step 2 |
| `index.html`에 `grid.js` 추가 | Task 1 Step 5 |

**빠진 것:** 없음. 2단계(To-Do 연동)는 이 계획의 범위가 아니다.

**이름 일관성:** `segStyle`(Task 3) → Task 4 `drawGhost`, Task 5에서 사용. `drawGhost`(Task 4) → Task 5에서 사용. `createBlock`/`clickAfterDrag`(Task 4) → Task 6에서 사용. `pointToMinutes`(Task 3) → Task 4~5에서 사용. `blocksOf`/`saveBlocks`/`openBlockEditor`/`openBlockEditorOrRollback`은 기존 이름 그대로 둔다.

**순서 의존:** Task 4의 `drawGhost`와 `createBlock`을 Task 5·6이 쓴다. 순서대로 실행해야 한다.
