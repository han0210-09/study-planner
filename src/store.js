(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  const STORAGE_KEY = "studyPlanner.v1";
  const SCHEMA_VERSION = 1;

  // 없애기로 한 옛 기본 과목. 이 id 는 예전 DEFAULT_SUBJECTS 에만 있었다.
  const LEGACY_ETC_ID = "etc";

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

  // 과목을 안 고른 블록은 공부로 세지 않는다. 씻기·이동·쉬는 시간처럼 시간표에
  // 두고 싶지만 공부는 아닌 것이 여기 들어온다. 이것까지 세면 목표 시간이
  // 하루 종일이 되어, 숫자가 아무것도 말해주지 않는다.
  //
  // 거르는 자리는 합계 함수 안이다. 목표시간·실제시간·달성률·달력이 모두 이
  // 함수들을 거치므로, 화면마다 따로 거르면 어느 하나가 빠졌을 때 값이 어긋난다.
  function isStudy(b) {
    return !!(b && b.subjectId);
  }

  function sumPlanned(blocks) {
    return (blocks || []).reduce((sum, b) => (isStudy(b) ? sum + (b.end - b.start) : sum), 0);
  }

  function sumDone(blocks) {
    return (blocks || []).reduce((sum, b) => (isStudy(b) && b.done ? sum + (b.end - b.start) : sum), 0);
  }

  // 시간표에는 있는데 합계에서 빠진 시간. 왜 목표시간이 시간표보다 적은지
  // 화면에서 설명하려면 이 값이 필요하다.
  function sumUncounted(blocks) {
    return (blocks || []).reduce((sum, b) => (isStudy(b) ? sum : sum + (b.end - b.start)), 0);
  }

  // 달성률은 계획 대비 실제다. 하루 화면과 달력이 같은 값을 보여야 하므로
  // 여기 한 곳에서만 계산한다. 계획이 없으면 나눌 수 없으니 0이다.
  function doneRatio(blocks) {
    const planned = sumPlanned(blocks);
    if (planned <= 0) return 0;
    return Math.min(100, Math.round((sumDone(blocks) / planned) * 100));
  }

  function sanitizeState(raw) {
    // 저장된 데이터가 아예 없는 첫 실행은 "복구"가 아니다. 구분하지 않으면 앱을 처음
    // 켠 사용자에게 매번 데이터 손상 경고 배너가 뜬다. fresh일 때는 기본값을 몇 개
    // 채워 넣든 recovered를 올리지 않는다.
    const fresh = raw == null;
    let recovered = false;
    const mark = () => { if (!fresh) recovered = true; };

    if (fresh || typeof raw !== "object" || Array.isArray(raw)) {
      mark();
      raw = {};
    }

    const version = typeof raw.version === "number" ? raw.version : SCHEMA_VERSION;
    const readOnly = version > SCHEMA_VERSION;
    if (typeof raw.version !== "number") mark();

    // 과목이 하나도 없는 것은 이제 정상이다 - 처음 켠 상태가 그렇다. 그러니
    // 빈 목록을 고쳤다고 표시하지 않는다. 표시하면 열 때마다 "고쳤습니다" 띠가
    // 뜬다. 목록 자체가 없거나 모양이 틀린 것만 고친 것으로 센다.
    let subjects = raw.settings && Array.isArray(raw.settings.subjects) ? raw.settings.subjects : null;
    if (!subjects) mark();
    let kept = (subjects || []).filter((s) => s && typeof s.id === "string" && typeof s.name === "string");
    if (subjects && kept.length !== subjects.length) mark();

    // 예전에는 앱이 과목 일곱 개를 미리 깔았고 그중 하나가 '기타' 였다. 무엇을
    // 공부했는지 말해주지 않는 이름이라 없앴는데, 그때 이미 쓰던 사람의 저장에는
    // 그대로 남는다. 그 하나만 걷어낸다 - 옛 기본값의 id 로만 알아본다.
    // 손으로 만든 '기타' 는 id 가 다르므로 건드리지 않는다.
    const legacy = kept.find((x) => x.id === LEGACY_ETC_ID && x.name === "기타");
    if (legacy) kept = kept.filter((x) => x !== legacy);
    subjects = kept;
    const drop = legacy ? legacy.id : null;

    // 알림 설정. settings 는 여기서 통째로 다시 지어지므로, 걸러 담지 않으면
    // 켜 둔 알림이 앱을 열 때마다 꺼진다. 참/거짓만 통과시킨다.
    const rawNotify = raw.settings && raw.settings.notify;
    const notify = {};
    if (rawNotify && typeof rawNotify === "object") {
      for (const [k, v] of Object.entries(rawNotify)) {
        if (typeof v === "boolean") notify[k] = v;
      }
    }

    const days = {};
    const rawDays = raw.days && typeof raw.days === "object" && !Array.isArray(raw.days) ? raw.days : (mark(), {});
    for (const [key, value] of Object.entries(rawDays)) {
      if (!dt.isValidDateKey(key)) { mark(); continue; }
      if (!value || typeof value !== "object") { mark(); continue; }
      const day = emptyDay();
      day.achievement = typeof value.achievement === "number" ? Math.min(100, Math.max(0, value.achievement)) : 0;
      day.memo = typeof value.memo === "string" ? value.memo : "";
      day.updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : 0;
      // 과목이 없으면 완료도 없다. 화면에 체크가 없으므로, 켜져 있던 표시가
      // 남으면 끌 방법이 사라진다. 손상이 아니라 정리이므로 mark() 하지 않는다.
      // drop 은 걷어낸 옛 과목의 id 다. 그것을 가리키던 것은 '과목 없음' 이 된다.
      const subjectOf = (id) => (id && id !== drop ? id : null);
      day.todos = (Array.isArray(value.todos) ? value.todos : []).filter((t) => t && typeof t.text === "string")
        .map((t) => {
          const subjectId = subjectOf(t.subjectId);
          return { id: t.id || newId(), subjectId, text: t.text, done: !!(subjectId && t.done) };
        });
      const accepted = [];
      for (const b of Array.isArray(value.blocks) ? value.blocks : []) {
        const subjectId = subjectOf(b && b.subjectId);
        const block = { id: (b && b.id) || newId(), subjectId,
          text: b && typeof b.text === "string" ? b.text : "", start: b && b.start, end: b && b.end,
          done: !!(subjectId && b && b.done), todoId: b && typeof b.todoId === "string" ? b.todoId : null };
        if (!validateBlock(block).ok) { mark(); continue; }
        if (findOverlap(accepted, block)) { mark(); continue; }
        accepted.push(block);
      }
      day.blocks = accepted.sort((a, b) => a.start - b.start);

      // 가리키는 할 일이 없는 링크는 끊는다. 블록은 살린다 — 시각 정보가 더 아깝다.
      // JSON 가져오기로 얼마든지 들어올 수 있는 모양이다.
      const todoIds = new Set(day.todos.map((t) => t.id));
      for (const b of day.blocks) {
        if (b.todoId && !todoIds.has(b.todoId)) { mark(); b.todoId = null; }
      }
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

    // clipboard는 describeClip이 ⋯ 메뉴를 그릴 때마다 읽는다. 모양이 깨진 값을
    // 통과시키면 메뉴가 통째로 안 열리고, 앱 안에서 복구할 방법이 없어진다.
    let clipboard = null;
    const rawClip = raw.clipboard;
    if (rawClip && typeof rawClip === "object" && rawClip.payload && typeof rawClip.payload === "object") {
      if (rawClip.kind === "day" &&
          Array.isArray(rawClip.payload.todos) && Array.isArray(rawClip.payload.blocks)) {
        clipboard = rawClip;
      } else if (rawClip.kind === "week" &&
                 rawClip.payload.byWeekday && typeof rawClip.payload.byWeekday === "object") {
        clipboard = rawClip;
      }
    }
    if (raw.clipboard && !clipboard) mark();

    // 사전의 분류. 항목 자체는 날짜 데이터에서 뽑으므로 여기서 지킬 것은
    // 사용자가 만든 분류와 배정뿐이다. 없는 것은 손상이 아니다 — 이 기능이
    // 생기기 전에 저장된 데이터에는 당연히 없다.
    const dictionary = { groups: [], assign: {} };
    const rawDict = raw.dictionary;
    if (rawDict && typeof rawDict === "object" && !Array.isArray(rawDict)) {
      dictionary.groups = (Array.isArray(rawDict.groups) ? rawDict.groups : [])
        .filter((g) => g && typeof g.id === "string" && typeof g.name === "string")
        .map((g) => ({ id: g.id, name: g.name }));
      const ids = new Set(dictionary.groups.map((g) => g.id));
      const rawAssign = rawDict.assign && typeof rawDict.assign === "object" && !Array.isArray(rawDict.assign)
        ? rawDict.assign : {};
      for (const [text, gid] of Object.entries(rawAssign)) {
        // 없어진 분류를 가리키는 배정은 버린다. 남겨두면 어느 묶음에도 안 잡힌다.
        if (typeof gid === "string" && ids.has(gid)) dictionary.assign[text] = gid;
      }
    } else if (rawDict != null) {
      mark();
    }

    return {
      state: { version, settings: { subjects, notify, dayBoundaryHour: dt.DAY_BOUNDARY_HOUR }, days, events, clipboard, dictionary },
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
    STORAGE_KEY, SCHEMA_VERSION,
    newId, emptyDay, isDayEmpty, validateBlock, overlaps, findOverlap,
    limitRange, isStudy, sumPlanned, sumDone, sumUncounted, doneRatio, sanitizeState, createStore,
  };

  root.SP = root.SP || {};
  root.SP.store = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
