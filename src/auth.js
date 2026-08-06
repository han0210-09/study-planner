// 회원가입과 로그인. 파이어베이스 인증(Identity Toolkit)의 REST 를 fetch 로
// 직접 부른다 - SDK 를 안 쓰는 이유는 이 앱이 의존성 0 이기 때문이고, 어차피
// 쓰는 것은 다섯 개 남짓한 엔드포인트뿐이다.
//
// 구글 계정 연동(OAuth) 을 접고 이쪽으로 온 이유가 하나 더 있다. 브라우저
// 전용 OAuth 에는 refresh token 이 없어 한 시간마다 사용자가 다시 눌러야
// 했는데, 파이어베이스 인증은 refresh token 을 그대로 준다. 한 번 로그인하면
// 계속 로그인 상태다.
(function (root) {
  const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts:";
  const SECURETOKEN = "https://securetoken.googleapis.com/v1/token";
  const SESSION_KEY = "studyPlanner.session";
  // 만료 2분 전부터는 없는 셈 친다. 요청을 보내는 도중에 죽는 것보다 낫다.
  const SKEW_MS = 120000;
  // 파이어베이스가 정한 최소 길이. 여기서 더 죄면 서버가 받아주는 것을 앱이
  // 거절하게 되고, 느슨하게 하면 서버가 거절할 것을 앱이 통과시킨다.
  const MIN_PASSWORD = 6;
  const MAX_USERNAME = 16;

  // 웹 API 키. 브라우저가 그대로 들고 요청하므로 숨길 수 없고, 숨길 것도
  // 아니다 - 파이어베이스 문서가 공개값이라고 못박는다. 자물쇠는 콘솔의
  // '승인된 도메인' 과 보안 규칙이 건다.
  let apiKey = "";

  function configure(key) { apiKey = String(key || "").trim(); }
  function isConfigured() { return !!apiKey; }

  /* ---------- 검사 (순수) ---------- */

  // 완벽한 이메일 정규식은 없다. 오타를 걸러 서버 왕복을 아끼는 게 목적이고,
  // 진짜 판정은 파이어베이스가 한다.
  function validateEmail(value) {
    const v = String(value || "").trim();
    if (!v) return "이메일을 입력해 주세요.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "이메일 주소가 올바르지 않습니다.";
    return null;
  }

  function validatePassword(value) {
    const v = String(value == null ? "" : value);
    if (!v) return "비밀번호를 입력해 주세요.";
    if (v.length < MIN_PASSWORD) return "비밀번호는 " + MIN_PASSWORD + "자 이상이어야 합니다.";
    return null;
  }

  // 화면에 보일 이름. 한글도 쓴다. 이 이름은 아직 남과 겹칠 수 있다 - 겹치지
  // 않게 하려면 모두의 이름을 모아 둔 곳이 있어야 하고, 그건 데이터베이스를
  // 붙일 때의 일이다.
  function validateUsername(value) {
    const v = String(value || "").trim();
    if (!v) return "이름을 입력해 주세요.";
    if (v.length > MAX_USERNAME) return "이름은 " + MAX_USERNAME + "자까지 쓸 수 있습니다.";
    return null;
  }

  /* ---------- 오류 문구 (순수) ---------- */

  // 파이어베이스가 돌려주는 코드를 사람 말로 바꾼다.
  //
  // 아이디가 틀린 것과 비밀번호가 틀린 것을 하나로 합친다. 갈라서 알려주면
  // "이 이메일은 가입되어 있다"를 아무나 확인할 수 있다. 파이어베이스도 요즘은
  // INVALID_LOGIN_CREDENTIALS 하나로 합쳐 보내지만, 예전 코드로 답하는 프로젝트가
  // 아직 있어 셋 다 받는다.
  const MESSAGES = {
    EMAIL_EXISTS: "이미 가입된 이메일입니다. 로그인해 주세요.",
    INVALID_EMAIL: "이메일 주소가 올바르지 않습니다.",
    MISSING_EMAIL: "이메일을 입력해 주세요.",
    MISSING_PASSWORD: "비밀번호를 입력해 주세요.",
    WEAK_PASSWORD: "비밀번호는 " + MIN_PASSWORD + "자 이상이어야 합니다.",
    EMAIL_NOT_FOUND: "이메일 또는 비밀번호가 맞지 않습니다.",
    INVALID_PASSWORD: "이메일 또는 비밀번호가 맞지 않습니다.",
    INVALID_LOGIN_CREDENTIALS: "이메일 또는 비밀번호가 맞지 않습니다.",
    USER_DISABLED: "사용이 중지된 계정입니다.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "너무 여러 번 시도했습니다. 잠시 뒤에 다시 해 주세요.",
    TOKEN_EXPIRED: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    INVALID_REFRESH_TOKEN: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    USER_NOT_FOUND: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    // 콘솔에서 이메일 로그인을 안 켰을 때 온다. 무슨 말인지 모르면 고칠 수가
    // 없으므로 어디를 봐야 하는지까지 적는다.
    OPERATION_NOT_ALLOWED: "이메일 로그인이 아직 켜져 있지 않습니다. 파이어베이스 콘솔에서 Authentication → 이메일/비밀번호를 켜 주세요.",
    NETWORK: "인터넷에 연결되어 있지 않습니다.",
    NO_CONFIG: "로그인 설정이 아직 안 되어 있습니다.",
  };

  function messageFor(code) {
    const key = String(code || "").split(" ")[0].trim();
    return MESSAGES[key] || "로그인에 실패했습니다. 잠시 뒤에 다시 해 주세요.";
  }

  /* ---------- 세션 (순수) ---------- */

  // 로그인한 사람마다 저장소를 따로 쓴다. 한 폰을 둘이 쓰거나, 계정을 바꿔 가며
  // 쓸 때 서로의 계획이 섞이지 않는다.
  //
  // uid 가 없으면 예전 그대로의 열쇠다. 로그인 없이 쓰던 사람의 데이터가
  // 그 자리에 그대로 남아 있어야 한다.
  function storageKeyFor(uid, baseKey) {
    const base = baseKey || "studyPlanner.v1";
    return uid ? base + "." + uid : base;
  }

  function isExpired(session, now) {
    if (!session || typeof session.expiresAt !== "number") return true;
    return session.expiresAt - SKEW_MS <= now;
  }

  // REST 응답을 세션 모양으로 옮긴다. signUp·signInWithPassword 와
  // securetoken 은 필드 이름이 다르다(camelCase 대 snake_case).
  function sessionFrom(res, now, before) {
    const prev = before || {};
    const idToken = res.idToken || res.id_token;
    const refreshToken = res.refreshToken || res.refresh_token;
    const expiresIn = Number(res.expiresIn || res.expires_in || 3600);
    return {
      uid: res.localId || res.user_id || prev.uid || null,
      email: res.email || prev.email || null,
      username: res.displayName || prev.username || null,
      idToken,
      refreshToken,
      expiresAt: now + expiresIn * 1000,
    };
  }

  /* ---------- 저장 ---------- */

  function store() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  function readSession() {
    const s = store();
    if (!s) return null;
    try {
      const raw = JSON.parse(s.getItem(SESSION_KEY) || "null");
      if (!raw || !raw.uid || !raw.refreshToken) return null;
      return raw;
    } catch (e) { return null; }
  }

  function writeSession(session) {
    const s = store();
    if (!s) return;
    try {
      if (session) s.setItem(SESSION_KEY, JSON.stringify(session));
      else s.removeItem(SESSION_KEY);
    } catch (e) { /* 저장이 막혀 있어도 이번 세션은 메모리로 돈다 */ }
  }

  let current = null;
  function session() {
    if (current === null) current = readSession();
    return current;
  }
  function setSession(next) {
    current = next;
    writeSession(next);
  }

  /* ---------- 망 ---------- */

  // 실패를 항상 { code } 로 던진다. 부르는 쪽이 messageFor 하나로 처리한다.
  async function post(url, body, form) {
    if (!apiKey) throw { code: "NO_CONFIG" };
    let res;
    try {
      res = await fetch(url + (url.indexOf("?") < 0 ? "?key=" : "&key=") + encodeURIComponent(apiKey), {
        method: "POST",
        headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      });
    } catch (e) {
      // fetch 가 던지는 것은 사실상 망 문제뿐이다.
      throw { code: "NETWORK" };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { code: (data.error && data.error.message) || "UNKNOWN", status: res.status };
    return data;
  }

  async function signUp(email, password, username) {
    const now = Date.now();
    const res = await post(IDENTITY + "signUp", {
      email: String(email).trim(), password: String(password), returnSecureToken: true,
    });
    const next = sessionFrom(res, now, { username: String(username || "").trim() });
    // 이름은 가입과 따로 올린다. 여기서 실패해도 계정은 이미 만들어졌으므로
    // 가입 자체를 물리지는 않는다 - 이름은 나중에 설정에서 고칠 수 있다.
    try {
      await post(IDENTITY + "update", {
        idToken: next.idToken, displayName: next.username, returnSecureToken: false,
      });
    } catch (e) { /* 이름만 못 붙었다 */ }
    setSession(next);
    return next;
  }

  async function signIn(email, password) {
    const now = Date.now();
    const res = await post(IDENTITY + "signInWithPassword", {
      email: String(email).trim(), password: String(password), returnSecureToken: true,
    });
    setSession(sessionFrom(res, now));
    return session();
  }

  function signOut() { setSession(null); }

  async function sendReset(email) {
    await post(IDENTITY + "sendOobCode", {
      requestType: "PASSWORD_RESET", email: String(email).trim(),
    });
  }

  // 만료된 토큰을 refresh token 으로 바꿔 온다. 이 길이 막히면(비밀번호가
  // 바뀌었거나 계정이 지워졌거나) 세션을 버린다 - 살려 두면 매번 같은 실패를
  // 되풀이한다.
  async function refresh() {
    const s = session();
    if (!s) throw { code: "TOKEN_EXPIRED" };
    const now = Date.now();
    let res;
    try {
      res = await post(SECURETOKEN, { grant_type: "refresh_token", refresh_token: s.refreshToken }, true);
    } catch (e) {
      if (e.code === "NETWORK") throw e;   // 인터넷 문제면 로그인을 지키자
      setSession(null);
      throw e;
    }
    setSession(sessionFrom(res, now, s));
    return session();
  }

  // 지금 쓸 수 있는 idToken. 필요하면 알아서 갱신한다.
  async function token() {
    const s = session();
    if (!s) return null;
    if (!isExpired(s, Date.now())) return s.idToken;
    const next = await refresh();
    return next ? next.idToken : null;
  }

  async function setUsername(name) {
    const t = await token();
    if (!t) throw { code: "TOKEN_EXPIRED" };
    await post(IDENTITY + "update", { idToken: t, displayName: String(name).trim(), returnSecureToken: false });
    setSession(Object.assign({}, session(), { username: String(name).trim() }));
  }

  const api = {
    SESSION_KEY, MIN_PASSWORD, MAX_USERNAME, MESSAGES,
    configure, isConfigured,
    validateEmail, validatePassword, validateUsername, messageFor,
    storageKeyFor, isExpired, sessionFrom,
    session, signUp, signIn, signOut, sendReset, refresh, token, setUsername,
    // 시험에서 세션을 갈아끼운다.
    _setSession: setSession,
  };

  root.SP = root.SP || {};
  root.SP.auth = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
