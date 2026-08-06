(function (root) {
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  // 사전은 따로 쌓아두지 않고 날짜 데이터에서 그때그때 뽑는다. 별도로 저장하면
  // 할 일을 지웠을 때 사전에만 남아 어긋나고, 두 곳을 맞추는 코드가 계속 는다.
  //
  // 사용자가 정하는 값은 분류뿐이다. 그것만 state.dictionary 에 보관한다.
  //
  // 같은 이름은 하나로 친다. 과목이 달라도 마찬가지다 — "같은 이름의 할 일이
  // 등록되었다면 하나로 쳐 달라"는 것이 정한 규칙이다.
  function normalize(text) {
    return String(text == null ? "" : text).trim();
  }

  function emptyDictionary() {
    return { groups: [], assign: {} };
  }

  function dictionaryOf(state) {
    if (!state.dictionary) state.dictionary = emptyDictionary();
    return state.dictionary;
  }

  // 이름 하나에 과목이 여럿 쓰였을 수 있다. 가장 많이 쓴 과목을 대표로 삼고,
  // 같은 횟수면 마지막에 쓴 것을 택한다 — 최근에 바꾼 쪽이 지금 생각에 가깝다.
  function pickSubject(counts, lastSeen) {
    let best = null;
    for (const [id, n] of counts) {
      if (!best || n > best.n || (n === best.n && lastSeen.get(id) > lastSeen.get(best.id))) {
        best = { id, n };
      }
    }
    return best ? best.id : null;
  }

  // 이름을 ㄱㄴㄷ → abc → 123 → 그 밖 차례로 묶는다. 사전이니 찾는 길은
  // 이름이어야 한다. 한글·영문·숫자가 뒤섞여 정렬되면 어디를 봐야 할지 모른다.
  function orderClass(text) {
    const first = text.charAt(0);
    if (/[ㄱ-ㆎ가-힣]/.test(first)) return 0;
    if (/[A-Za-z]/.test(first)) return 1;
    if (/[0-9]/.test(first)) return 2;
    return 3;
  }

  const collator = new Intl.Collator("ko");

  function byName(a, b) {
    return orderClass(a.text) - orderClass(b.text) || collator.compare(a.text, b.text);
  }

  // 모든 날짜의 할 일을 이름으로 모은다.
  //
  // 시간표에 블록이 남아 있는 것만 센다. 블록을 지웠는데도 횟수가 그대로면,
  // 사전의 숫자가 실제 계획과 어긋난 채 계속 커진다. 어느 날에도 블록이 없는
  // 이름은 아예 나오지 않는다.
  //
  // 횟수는 블록이 아니라 날짜로 센다. 하루에 두 번 나눠 잡은 것은 "그날 한 번
  // 쓴 것"이지 두 번이 아니다.
  function entries(state) {
    const map = new Map();
    const days = (state && state.days) || {};
    for (const key of Object.keys(days).sort()) {
      const day = days[key];
      const placed = new Set((day.blocks || []).map((b) => b.todoId).filter(Boolean));
      for (const todo of day.todos || []) {
        const text = normalize(todo.text);
        if (!text || !placed.has(todo.id)) continue;
        let e = map.get(text);
        if (!e) {
          e = { text, count: 0, subjectId: null, lastUsed: "", counts: new Map(), lastSeen: new Map() };
          map.set(text, e);
        }
        e.count++;
        e.lastUsed = key;
        if (todo.subjectId) {
          e.counts.set(todo.subjectId, (e.counts.get(todo.subjectId) || 0) + 1);
          e.lastSeen.set(todo.subjectId, key);
        }
      }
    }

    const assign = dictionaryOf(state).assign;
    const out = [];
    for (const e of map.values()) {
      out.push({
        text: e.text,
        count: e.count,
        lastUsed: e.lastUsed,
        subjectId: pickSubject(e.counts, e.lastSeen),
        groupId: assign[e.text] || null,
      });
    }
    out.sort(byName);
    return out;
  }

  function findEntry(state, text) {
    const key = normalize(text);
    return entries(state).find((e) => e.text === key) || null;
  }

  // 분류별로 묶는다. 사용자가 만든 분류를 먼저 두고, 아직 정리 안 한 것을
  // 마지막에 모은다. 빈 분류도 남긴다 - 방금 만든 분류가 사라지면 만든 것이
  // 반영됐는지 알 수 없다.
  function grouped(state) {
    const list = entries(state);
    const groups = dictionaryOf(state).groups;
    const out = groups.map((g) => ({ group: g, items: list.filter((e) => e.groupId === g.id) }));
    const known = new Set(groups.map((g) => g.id));
    out.push({ group: null, items: list.filter((e) => !e.groupId || !known.has(e.groupId)) });
    return out;
  }

  function addGroup(state, name) {
    const trimmed = normalize(name);
    if (!trimmed) return null;
    const d = dictionaryOf(state);
    const existing = d.groups.find((g) => g.name === trimmed);
    if (existing) return existing;
    const group = { id: store.newId(), name: trimmed };
    d.groups.push(group);
    return group;
  }

  function renameGroup(state, id, name) {
    const trimmed = normalize(name);
    const g = dictionaryOf(state).groups.find((x) => x.id === id);
    if (!g || !trimmed) return false;
    g.name = trimmed;
    return true;
  }

  // 분류를 지워도 할 일은 남는다. 사전은 날짜 데이터에서 뽑으므로 여기서 지울
  // 것은 배정뿐이다.
  function removeGroup(state, id) {
    const d = dictionaryOf(state);
    const index = d.groups.findIndex((g) => g.id === id);
    if (index === -1) return 0;
    d.groups.splice(index, 1);
    let freed = 0;
    for (const [text, gid] of Object.entries(d.assign)) {
      if (gid === id) { delete d.assign[text]; freed++; }
    }
    return freed;
  }

  function assignTo(state, text, groupId) {
    const key = normalize(text);
    if (!key) return false;
    const d = dictionaryOf(state);
    if (!groupId) { delete d.assign[key]; return true; }
    if (!d.groups.some((g) => g.id === groupId)) return false;
    d.assign[key] = groupId;
    return true;
  }

  const api = {
    normalize, emptyDictionary, entries, findEntry, grouped, orderClass,
    addGroup, renameGroup, removeGroup, assignTo,
  };

  root.SP = root.SP || {};
  root.SP.dict = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
