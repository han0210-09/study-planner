const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");
const subjects = require("../src/subjects.js");

const LIST = [
  { id: "kor", name: "국어", color: "#FFE08A" },
  { id: "math", name: "수학", color: "#FFB3BA" },
];

function stateWithRefs() {
  const { state } = store.sanitizeState(null);
  // 과목 목록은 이제 비어서 시작한다. 참조를 볼 테스트이므로 여기서 심는다.
  state.settings.subjects = LIST.map((s) => ({ ...s }));
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
  const list = LIST;
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

test("removeSubject: 마지막 과목도 지울 수 있다", () => {
  // 과목이 하나도 없는 것이 처음 켠 상태다. 되돌아갈 수 없으면 안 된다.
  const { state } = store.sanitizeState(null);
  state.settings.subjects = [{ id: "only", name: "하나", color: "#111111" }];
  assert.equal(subjects.removeSubject(state, "only"), 0);
  assert.deepEqual(state.settings.subjects, []);
});

test("removeSubject: 없는 과목은 -1", () => {
  assert.equal(subjects.removeSubject(stateWithRefs(), "없음"), -1);
});
