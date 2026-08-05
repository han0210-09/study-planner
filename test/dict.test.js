const test = require("node:test");
const assert = require("node:assert/strict");
const dict = require("../src/dict.js");

const T = (text, subjectId) => ({ id: "t" + text + subjectId, subjectId: subjectId || null, text, done: false });

function state(days, dictionary) {
  const out = { days: {}, dictionary: dictionary || { groups: [], assign: {} } };
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
  // 많이 쓴 것이 먼저. 1회끼리는 최근에 쓴 토익 단어(08-03)가 문제집(08-01)보다 위다.
  assert.deepEqual(e.map((x) => x.text), ["독서 지문", "토익 단어", "문제집"]);
  assert.equal(e[0].count, 3, "많이 쓴 것이 위로");
  assert.equal(e[0].subjectId, "kor");
  assert.equal(e[0].lastUsed, "2026-08-03");
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
  const s = { days: { "2026-08-01": { todos: [T("복습", "kor")], blocks: [] } } };
  assert.equal(dict.entries(s)[0].text, "복습");
  assert.ok(s.dictionary, "없으면 만들어 준다");
});
