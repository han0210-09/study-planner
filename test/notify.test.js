const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/store.js");

// notify.js 는 화면(SP.app, Notification)에 붙어 있어 그대로는 못 불러온다.
// 여기서는 저장이 알림 설정을 지키는지만 본다. 울리는 규칙(due)은
// verify-notify 가 진짜 브라우저에서 본다.

test("sanitizeState: 켜 둔 알림 설정이 살아남는다", () => {
  // settings 는 읽을 때마다 통째로 다시 지어진다. 걸러 담지 않으면 켜 둔
  // 알림이 앱을 열 때마다 꺼진다.
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [], notify: { on: true, blockStart: true, blockEnd: false } },
    days: {}, events: [],
  });
  assert.deepEqual(r.state.settings.notify, { on: true, blockStart: true, blockEnd: false });
  assert.equal(r.recovered, false);
});

test("sanitizeState: 참/거짓이 아닌 값은 버린다", () => {
  const r = store.sanitizeState({
    version: 1,
    settings: { subjects: [], notify: { on: true, junk: "x", n: 3, nested: {} } },
    days: {}, events: [],
  });
  assert.deepEqual(r.state.settings.notify, { on: true });
});

test("sanitizeState: 알림 설정이 없으면 빈 객체다", () => {
  assert.deepEqual(store.sanitizeState(null).state.settings.notify, {});
  const r = store.sanitizeState({ version: 1, settings: { subjects: [], notify: "이상한 값" }, days: {}, events: [] });
  assert.deepEqual(r.state.settings.notify, {});
});

test("sanitizeState: 알림 설정만으로 복구 배너를 띄우지 않는다", () => {
  const r = store.sanitizeState({
    version: 1, settings: { subjects: [], notify: { junk: 1 } }, days: {}, events: [],
  });
  assert.equal(r.recovered, false);
});
