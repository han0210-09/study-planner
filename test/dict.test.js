const test = require("node:test");
const assert = require("node:assert/strict");
const dict = require("../src/dict.js");

const T = (text, subjectId) => ({ id: "t" + text + subjectId, subjectId: subjectId || null, text, done: false });

// 사전은 시간표에 블록이 남아 있는 할 일만 센다. 그래서 시험 데이터도 할 일마다
// 블록을 하나씩 붙여준다. 블록이 없는 경우는 아래에서 따로 본다.
function state(days, dictionary) {
  const out = { days: {}, dictionary: dictionary || { groups: [], assign: {} } };
  for (const [key, todos] of Object.entries(days)) {
    const blocks = todos.map((t, i) => ({
      id: "b" + key + i, todoId: t.id, subjectId: t.subjectId, text: t.text,
      start: 600 + i * 60, end: 660 + i * 60, done: false,
    }));
    out.days[key] = { todos, blocks, memo: "", achievement: 0, updatedAt: 0 };
  }
  return out;
}

// 시간이 안 잡힌 할 일만 있는 날.
function stateNoBlocks(days) {
  const out = { days: {}, dictionary: { groups: [], assign: {} } };
  for (const [key, todos] of Object.entries(days)) {
    out.days[key] = { todos, blocks: [], memo: "", achievement: 0, updatedAt: 0 };
  }
  return out;
}

test("entries: 모든 날짜에서 이름별로 모은다", () => {
  const s = state({
    "2026-08-01": [T("독서 지문", "kor"), T("문제집", "math")],
    "2026-08-02": [T("독서 지문", "kor")],
    "2026-08-03": [T("독서 지문", "kor"), T("토익 단어", "eng")],
  });
  const e = dict.entries(s);
  // 이름 차례다. 사전에서 찾는 길은 이름이어야 한다.
  assert.deepEqual(e.map((x) => x.text), ["독서 지문", "문제집", "토익 단어"]);
  assert.equal(e[0].count, 3, "세 날에 걸쳐 썼다");
  assert.equal(e[0].subjectId, "kor");
  assert.equal(e[0].lastUsed, "2026-08-03");
});

test("entries: ㄱㄴㄷ → abc → 123 차례로 모은다", () => {
  const s = state({
    "2026-08-01": [T("zebra", "eng"), T("3교시 복습", "kor"), T("나비", "kor"),
                   T("apple", "eng"), T("가나다", "kor"), T("10분 암기", "math")],
  });
  assert.deepEqual(dict.entries(s).map((x) => x.text),
    ["가나다", "나비", "apple", "zebra", "10분 암기", "3교시 복습"]);
});

test("entries: 한글은 자음·모음 순서를 따른다", () => {
  const s = state({ "2026-08-01": [T("하나", "kor"), T("가방", "kor"), T("사과", "kor")] });
  assert.deepEqual(dict.entries(s).map((x) => x.text), ["가방", "사과", "하나"]);
});

// 블록을 지웠는데도 횟수가 그대로면 사전의 숫자가 실제 계획과 어긋난 채 커진다.
test("entries: 시간표에 블록이 없는 할 일은 세지 않는다", () => {
  const s = state({ "2026-08-01": [T("독서", "kor")], "2026-08-02": [T("독서", "kor")] });
  assert.equal(dict.entries(s)[0].count, 2);
  // 둘째 날의 블록만 걷어낸다.
  s.days["2026-08-02"].blocks = [];
  const after = dict.entries(s);
  assert.equal(after[0].count, 1, "블록이 남은 날만 센다");
  assert.equal(after[0].lastUsed, "2026-08-01");
});

test("entries: 어느 날에도 블록이 없으면 사전에 나오지 않는다", () => {
  const s = stateNoBlocks({ "2026-08-01": [T("적어만 둔 것", "kor")] });
  assert.deepEqual(dict.entries(s), []);
});

// 같은 이름은 하나로 친다. 과목이 달라도 마찬가지다.
test("entries: 이름이 같으면 과목이 달라도 한 줄이다", () => {
  const s = state({
    "2026-08-01": [T("복습", "kor")],
    "2026-08-02": [T("복습", "math")],
    "2026-08-03": [T("복습", "math")],
  });
  const e = dict.entries(s);
  assert.equal(e.length, 1);
  assert.equal(e[0].count, 3);
  assert.equal(e[0].subjectId, "math", "가장 많이 쓴 과목이 대표다");
});

test("entries: 과목이 같은 횟수면 마지막에 쓴 쪽을 택한다", () => {
  const s = state({
    "2026-08-01": [T("복습", "kor")],
    "2026-08-05": [T("복습", "eng")],
  });
  assert.equal(dict.entries(s)[0].subjectId, "eng");
});

test("entries: 하루에 두 번 잡아도 그날은 한 번이 아니라 할 일 수만큼 센다", () => {
  // 할 일이 둘이면 둘이다. 한 할 일에 블록이 둘인 것과는 다르다.
  const s = state({ "2026-08-01": [T("복습", "kor"), T("복습", "kor")] });
  assert.equal(dict.entries(s)[0].count, 2);
});

test("entries: 빈 이름과 공백은 버린다", () => {
  const s = state({ "2026-08-01": [T("", "kor"), T("   ", "kor"), T(" 복습 ", "kor")] });
  const e = dict.entries(s);
  assert.equal(e.length, 1);
  assert.equal(e[0].text, "복습", "앞뒤 공백은 다듬는다");
});

test("entries: 과목 없는 할 일도 사전에는 들어간다", () => {
  const s = state({ "2026-08-01": [T("저녁 먹기", null)] });
  const e = dict.entries(s);
  assert.equal(e.length, 1);
  assert.equal(e[0].subjectId, null);
});

test("entries: 날짜가 하나도 없으면 빈 목록", () => {
  assert.deepEqual(dict.entries(state({})), []);
  assert.deepEqual(dict.entries({}), []);
});

test("findEntry: 이름으로 찾는다", () => {
  const s = state({ "2026-08-01": [T("복습", "kor")] });
  assert.equal(dict.findEntry(s, "복습").count, 1);
  assert.equal(dict.findEntry(s, " 복습 ").count, 1, "공백은 무시한다");
  assert.equal(dict.findEntry(s, "없는것"), null);
});

// ---- 분류 ----

test("addGroup: 만들고 같은 이름은 다시 만들지 않는다", () => {
  const s = state({});
  const a = dict.addGroup(s, "학원");
  assert.ok(a.id);
  const b = dict.addGroup(s, "학원");
  assert.equal(b.id, a.id, "같은 이름이면 있던 것을 준다");
  assert.equal(s.dictionary.groups.length, 1);
  assert.equal(dict.addGroup(s, "   "), null, "빈 이름은 거부");
});

test("assignTo: 할 일을 분류에 넣고 뺀다", () => {
  const s = state({ "2026-08-01": [T("수학 숙제", "math")] });
  const g = dict.addGroup(s, "학원");
  assert.equal(dict.assignTo(s, "수학 숙제", g.id), true);
  assert.equal(dict.entries(s)[0].groupId, g.id);
  assert.equal(dict.assignTo(s, "수학 숙제", null), true, "분류 없음으로 되돌리기");
  assert.equal(dict.entries(s)[0].groupId, null);
});

test("assignTo: 없는 분류에는 넣지 않는다", () => {
  const s = state({ "2026-08-01": [T("수학 숙제", "math")] });
  assert.equal(dict.assignTo(s, "수학 숙제", "없는id"), false);
  assert.equal(dict.entries(s)[0].groupId, null);
});

test("grouped: 분류별로 묶고 정리 안 한 것은 마지막에 모은다", () => {
  const s = state({ "2026-08-01": [T("수학 숙제", "math"), T("독서", "kor")] });
  const g = dict.addGroup(s, "학원");
  dict.assignTo(s, "수학 숙제", g.id);
  const groups = dict.grouped(s);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].group.name, "학원");
  assert.deepEqual(groups[0].items.map((i) => i.text), ["수학 숙제"]);
  assert.equal(groups[1].group, null, "마지막이 분류 없음");
  assert.deepEqual(groups[1].items.map((i) => i.text), ["독서"]);
});

// 방금 만든 분류가 목록에서 사라지면 만들어졌는지 알 수 없다.
test("grouped: 비어 있는 분류도 남긴다", () => {
  const s = state({ "2026-08-01": [T("독서", "kor")] });
  dict.addGroup(s, "빈분류");
  const groups = dict.grouped(s);
  assert.equal(groups[0].group.name, "빈분류");
  assert.deepEqual(groups[0].items, []);
});

test("removeGroup: 분류를 지워도 할 일은 남는다", () => {
  const s = state({ "2026-08-01": [T("수학 숙제", "math")] });
  const g = dict.addGroup(s, "학원");
  dict.assignTo(s, "수학 숙제", g.id);
  assert.equal(dict.removeGroup(s, g.id), 1, "풀린 배정 수");
  assert.equal(dict.entries(s).length, 1, "할 일은 그대로");
  assert.equal(dict.entries(s)[0].groupId, null);
  assert.equal(dict.removeGroup(s, "없는id"), 0);
});

test("renameGroup: 이름을 바꾸면 배정은 유지된다", () => {
  const s = state({ "2026-08-01": [T("수학 숙제", "math")] });
  const g = dict.addGroup(s, "학원");
  dict.assignTo(s, "수학 숙제", g.id);
  assert.equal(dict.renameGroup(s, g.id, "수학 학원"), true);
  assert.equal(dict.grouped(s)[0].group.name, "수학 학원");
  assert.deepEqual(dict.grouped(s)[0].items.map((i) => i.text), ["수학 숙제"]);
  assert.equal(dict.renameGroup(s, g.id, "  "), false);
});

test("dictionary 가 없는 state 도 그대로 다룬다", () => {
  const todo = T("복습", "kor");
  const s = { days: { "2026-08-01": { todos: [todo],
    blocks: [{ id: "b1", todoId: todo.id, subjectId: "kor", text: "복습", start: 600, end: 660, done: false }] } } };
  assert.equal(dict.entries(s)[0].text, "복습");
  assert.ok(s.dictionary, "없으면 만들어 준다");
});
