const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../src/auth.js");

/* ---------- 입력 검사 ---------- */

test("이메일: 모양이 아닌 것을 거른다", () => {
  assert.equal(auth.validateEmail("a@b.co"), null);
  assert.equal(auth.validateEmail("  a@b.co  "), null);
  assert.ok(auth.validateEmail(""));
  assert.ok(auth.validateEmail("그냥이름"));
  assert.ok(auth.validateEmail("a@b"));
  assert.ok(auth.validateEmail("a b@c.co"));
  assert.ok(auth.validateEmail(null));
});

test("비밀번호: 6자 미만을 거른다", () => {
  assert.equal(auth.validatePassword("123456"), null);
  assert.ok(auth.validatePassword("12345"));
  assert.ok(auth.validatePassword(""));
  assert.ok(auth.validatePassword(null));
});

// 앱이 죄는 기준과 파이어베이스가 죄는 기준이 어긋나면, 앱이 통과시킨 것을
// 서버가 거절하거나 그 반대가 된다.
test("비밀번호 최소 길이가 파이어베이스와 같다", () => {
  assert.equal(auth.MIN_PASSWORD, 6);
  assert.ok(auth.validatePassword("x".repeat(auth.MIN_PASSWORD)) === null);
  assert.ok(auth.validatePassword("x".repeat(auth.MIN_PASSWORD - 1)));
});

test("이름: 비었거나 너무 길면 거른다", () => {
  assert.equal(auth.validateUsername("한슬"), null);
  assert.equal(auth.validateUsername("  한슬  "), null);
  assert.ok(auth.validateUsername(""));
  assert.ok(auth.validateUsername("   "));
  assert.ok(auth.validateUsername("가".repeat(auth.MAX_USERNAME + 1)));
});

test("이름: 한글이 길이에 제대로 센다", () => {
  assert.equal(auth.validateUsername("가".repeat(auth.MAX_USERNAME)), null);
});

/* ---------- 오류 문구 ---------- */

test("아는 코드는 사람 말로 바꾼다", () => {
  assert.match(auth.messageFor("EMAIL_EXISTS"), /이미 가입/);
  assert.match(auth.messageFor("USER_DISABLED"), /중지/);
  assert.match(auth.messageFor("NETWORK"), /인터넷/);
});

// 파이어베이스는 코드 뒤에 설명을 붙여 보낸다.
// 예: "WEAK_PASSWORD : Password should be at least 6 characters"
test("코드 뒤에 설명이 붙어 와도 알아본다", () => {
  assert.equal(
    auth.messageFor("WEAK_PASSWORD : Password should be at least 6 characters"),
    auth.messageFor("WEAK_PASSWORD"));
});

// 갈라서 알려주면 "이 이메일은 가입되어 있다"를 아무나 확인할 수 있다.
test("아이디가 틀린 것과 비밀번호가 틀린 것을 한 문구로 합친다", () => {
  const a = auth.messageFor("EMAIL_NOT_FOUND");
  const b = auth.messageFor("INVALID_PASSWORD");
  const c = auth.messageFor("INVALID_LOGIN_CREDENTIALS");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.doesNotMatch(a, /없는|가입되지/);
});

test("모르는 코드에도 사람 말이 나온다", () => {
  const m = auth.messageFor("WAT_IS_THIS");
  assert.ok(m && m.length > 0);
  assert.doesNotMatch(m, /WAT_IS_THIS/);
  assert.ok(auth.messageFor(undefined).length > 0);
  assert.ok(auth.messageFor(null).length > 0);
});

// 콘솔에서 이메일 로그인을 안 켜면 이 코드가 온다. 어디를 봐야 하는지 안 적으면
// 무슨 말인지 알 수가 없다.
test("설정을 안 켰을 때는 어디를 봐야 하는지 알려준다", () => {
  assert.match(auth.messageFor("OPERATION_NOT_ALLOWED"), /Authentication/);
});

/* ---------- 저장소 열쇠 ---------- */

test("계정마다 저장소가 갈린다", () => {
  assert.equal(auth.storageKeyFor("uid1"), "studyPlanner.v1.uid1");
  assert.notEqual(auth.storageKeyFor("uid1"), auth.storageKeyFor("uid2"));
});

// 로그인 없이 쓰던 사람의 데이터가 그 자리에 그대로 남아야 한다.
test("로그인 안 했으면 예전 열쇠 그대로다", () => {
  assert.equal(auth.storageKeyFor(null), "studyPlanner.v1");
  assert.equal(auth.storageKeyFor(undefined), "studyPlanner.v1");
  assert.equal(auth.storageKeyFor(""), "studyPlanner.v1");
});

test("열쇠의 밑동을 바꿔 넣을 수 있다", () => {
  assert.equal(auth.storageKeyFor("u", "other"), "other.u");
  assert.equal(auth.storageKeyFor(null, "other"), "other");
});

/* ---------- 만료 ---------- */

test("만료: 남은 시간이 넉넉하면 안 지났다", () => {
  assert.equal(auth.isExpired({ expiresAt: 1000000 }, 1000000 - 600000), false);
});

test("만료: 지났으면 지난 것이다", () => {
  assert.equal(auth.isExpired({ expiresAt: 1000000 }, 1000001), true);
});

// 요청을 보내는 도중에 죽으면 그 요청만 실패한다. 미리 갈아 끼운다.
test("만료: 코앞이면 미리 지난 것으로 본다", () => {
  assert.equal(auth.isExpired({ expiresAt: 1000000 }, 1000000 - 1000), true);
});

test("만료: 세션이 없거나 모양이 틀리면 지난 것이다", () => {
  assert.equal(auth.isExpired(null, 0), true);
  assert.equal(auth.isExpired({}, 0), true);
  assert.equal(auth.isExpired({ expiresAt: "곧" }, 0), true);
});

/* ---------- 응답 옮기기 ---------- */

test("가입·로그인 응답을 세션으로 옮긴다", () => {
  const s = auth.sessionFrom({
    idToken: "id1", refreshToken: "r1", expiresIn: "3600",
    localId: "uid1", email: "a@b.co", displayName: "한슬",
  }, 1000);
  assert.deepEqual(s, {
    uid: "uid1", email: "a@b.co", username: "한슬",
    idToken: "id1", refreshToken: "r1", expiresAt: 1000 + 3600000,
  });
});

// securetoken 은 필드 이름이 snake_case 다. 한쪽만 읽으면 갱신한 순간
// 세션이 통째로 비어 로그인이 풀린다.
test("갱신 응답의 snake_case 도 읽는다", () => {
  const s = auth.sessionFrom({
    id_token: "id2", refresh_token: "r2", expires_in: "3600", user_id: "uid1",
  }, 1000);
  assert.equal(s.idToken, "id2");
  assert.equal(s.refreshToken, "r2");
  assert.equal(s.uid, "uid1");
  assert.equal(s.expiresAt, 1000 + 3600000);
});

// 갱신 응답에는 이메일도 이름도 안 들어 있다.
test("갱신할 때 이메일과 이름을 잃지 않는다", () => {
  const before = { uid: "uid1", email: "a@b.co", username: "한슬" };
  const s = auth.sessionFrom({ id_token: "id2", refresh_token: "r2", expires_in: "3600" }, 1000, before);
  assert.equal(s.email, "a@b.co");
  assert.equal(s.username, "한슬");
  assert.equal(s.uid, "uid1");
});

test("expiresIn 이 없으면 한 시간으로 본다", () => {
  const s = auth.sessionFrom({ idToken: "i", refreshToken: "r", localId: "u" }, 0);
  assert.equal(s.expiresAt, 3600000);
});

/* ---------- 설정 ---------- */

test("키를 넣기 전에는 설정 안 된 상태다", () => {
  assert.equal(auth.isConfigured(), false);
  auth.configure("  ");
  assert.equal(auth.isConfigured(), false);
  auth.configure("AIzaTEST");
  assert.equal(auth.isConfigured(), true);
  auth.configure("");
  assert.equal(auth.isConfigured(), false);
});
