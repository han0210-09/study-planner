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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { mark(); continue; }
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
      .filter((e) => e && typeof e.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate))
      .map((e) => ({
        id: e.id || newId(), title: e.title, type: e.type || "etc", color: e.color || "#FFA94D",
        startDate: e.startDate, endDate: /^\d{4}-\d{2}-\d{2}$/.test(e.endDate) ? e.endDate : e.startDate,
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
