// 로그인·회원가입 화면과, 설정 시트 안의 계정 칸.
(function (root) {
  const SP = (root.SP = root.SP || {});
  const ui = SP.ui;
  const auth = SP.auth;

  // 파이어베이스 웹 API 키.
  // 콘솔 → 프로젝트 설정 → 내 앱 → 웹 앱 에서 apiKey 를 복사해 여기에 넣는다.
  //
  // 공개값이다. 브라우저가 그대로 들고 요청하므로 숨길 수 없고, 파이어베이스
  // 문서도 공개값이라고 못박는다. 자물쇠는 콘솔의 '승인된 도메인' 이 건다 -
  // 남이 이 키를 베껴 가도 자기 사이트에서는 로그인이 안 된다.
  //
  // 비워 두면 로그인 기능이 통째로 잠긴다. 앱의 나머지는 그대로 돈다.
  const API_KEY = "";

  const TITLES = { up: "회원가입", in: "로그인", reset: "비밀번호 재설정" };

  // 화면을 다시 그려도 적던 것이 남는다. 오타 하나에 처음부터 다시 적게 하지 않는다.
  let draft = { username: "", email: "", password: "" };

  function field(label, input) {
    return ui.el("label", { class: "auth-field" }, [ui.el("span", { text: label }), input]);
  }

  function render(host, mode) {
    const kind = TITLES[mode] ? mode : "in";
    let busy = false;

    const error = ui.el("p", { class: "auth-error", hidden: true });
    const setError = (msg) => {
      error.textContent = msg || "";
      error.hidden = !msg;
    };

    const usernameInput = ui.el("input", {
      type: "text", value: draft.username, maxlength: String(auth.MAX_USERNAME),
      autocomplete: "nickname", placeholder: "화면에 보일 이름",
      oninput: (e) => { draft.username = e.target.value; },
    });
    const emailInput = ui.el("input", {
      type: "email", value: draft.email, autocomplete: "email",
      inputmode: "email", autocapitalize: "off", spellcheck: "false",
      placeholder: "you@example.com",
      oninput: (e) => { draft.email = e.target.value; },
    });
    const passwordInput = ui.el("input", {
      type: "password", value: draft.password,
      // 새 비밀번호와 기존 비밀번호를 갈라 적어야 비밀번호 관리자가 제대로 돕는다.
      autocomplete: kind === "up" ? "new-password" : "current-password",
      placeholder: auth.MIN_PASSWORD + "자 이상",
      oninput: (e) => { draft.password = e.target.value; },
    });

    const submit = ui.el("button", { class: "btn btn-primary auth-submit", type: "submit",
      text: kind === "reset" ? "재설정 메일 보내기" : TITLES[kind] });

    function setBusy(on) {
      busy = on;
      submit.disabled = on;
      submit.textContent = on ? "잠시만요…" : (kind === "reset" ? "재설정 메일 보내기" : TITLES[kind]);
    }

    async function go(e) {
      if (e) e.preventDefault();
      if (busy) return;
      setError("");

      // 서버에 묻기 전에 앱이 먼저 거른다. 왕복 한 번을 아끼고, 무엇이
      // 잘못됐는지도 더 또렷하게 말할 수 있다.
      const bad = auth.validateEmail(draft.email)
        || (kind !== "reset" && auth.validatePassword(draft.password))
        || (kind === "up" && auth.validateUsername(draft.username));
      if (bad) { setError(bad); return; }

      setBusy(true);
      try {
        if (kind === "up") await auth.signUp(draft.email, draft.password, draft.username);
        else if (kind === "in") await auth.signIn(draft.email, draft.password);
        else {
          await auth.sendReset(draft.email);
          setBusy(false);
          ui.toast("재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.");
          render(host, "in");
          return;
        }
        draft = { username: "", email: "", password: "" };
        SP.app.afterAuthChange();
      } catch (err) {
        setBusy(false);
        setError(auth.messageFor(err && err.code));
      }
    }

    const swap = (to, text) => ui.el("button", { class: "link-btn", type: "button", text,
      onclick: () => render(host, to) });

    // novalidate: type="email" 은 자판을 위해 남기되, 검사는 우리가 한다.
    // 그냥 두면 브라우저가 제 말풍선을 먼저 띄우는데, 문구가 브라우저마다
    // 다르고 영어로 나오기도 해서 앱의 다른 오류와 따로 논다.
    const form = ui.el("form", { class: "auth-form", novalidate: true, onsubmit: go }, [
      kind === "up" ? field("이름", usernameInput) : null,
      field("이메일", emailInput),
      kind !== "reset" ? field("비밀번호", passwordInput) : null,
      kind === "reset"
        ? ui.el("p", { class: "auth-note", text: "가입할 때 쓴 이메일로 재설정 링크를 보냅니다." })
        : null,
      error,
      submit,
    ]);

    const foot = ui.el("div", { class: "auth-foot" },
      kind === "up" ? [ui.el("span", { text: "이미 계정이 있나요?" }), swap("in", "로그인")]
      : kind === "in" ? [swap("up", "회원가입"), ui.el("span", { class: "auth-dot", text: "·" }),
                         swap("reset", "비밀번호를 잊었어요")]
      : [swap("in", "돌아가기")]);

    ui.clear(host).appendChild(ui.el("div", { class: "auth" }, [
      ui.el("div", { class: "auth-head" }, [
        ui.el("h1", { class: "auth-title", text: "스터디 플래너" }),
        ui.el("p", { class: "auth-sub", text: "계획하고, 지킨 만큼 남깁니다." }),
      ]),
      form,
      foot,
      // 로그인은 강요하지 않는다. 인터넷이 없을 때도, 계정을 만들기 싫을 때도
      // 앱은 그대로 쓸 수 있어야 한다. 계획은 어차피 이 기기에 저장된다.
      ui.el("button", { class: "link-btn auth-skip", type: "button", text: "로그인 없이 쓰기",
        onclick: () => SP.app.showCalendar() }),
    ]));

    // 처음 비어 있는 칸에 커서를 둔다. 폰에서는 자판이 바로 올라오면 성가시므로
    // 화면이 넓을 때만 한다.
    if (root.matchMedia && root.matchMedia("(min-width: 700px)").matches) {
      (kind === "up" ? usernameInput : emailInput).focus();
    }
  }

  /* ---------- 설정 시트 안의 계정 칸 ---------- */

  function accountSection(onDone) {
    if (!auth.isConfigured()) {
      return ui.el("p", { class: "empty",
        text: "로그인 설정이 아직 안 되어 있습니다. 계획은 이 기기에 그대로 저장됩니다." });
    }

    const session = auth.session();
    if (!session) {
      return ui.el("div", { class: "account" }, [
        ui.el("p", { class: "empty", text: "로그인하면 계정마다 계획을 따로 둘 수 있습니다." }),
        ui.el("button", { class: "btn", text: "로그인 / 회원가입", onclick: () => {
          ui.closeSheet();
          SP.app.showAuth("in");
        } }),
      ]);
    }

    const nameInput = ui.el("input", { type: "text", value: session.username || "",
      maxlength: String(auth.MAX_USERNAME), placeholder: "이름",
      onchange: async (e) => {
        const value = e.target.value;
        const bad = auth.validateUsername(value);
        if (bad) { ui.toast(bad); e.target.value = auth.session().username || ""; return; }
        try {
          await auth.setUsername(value);
          ui.toast("이름을 바꿨습니다.");
          if (onDone) onDone();
        } catch (err) {
          ui.toast(auth.messageFor(err && err.code));
          e.target.value = auth.session().username || "";
        }
      } });

    return ui.el("div", { class: "account" }, [
      ui.el("label", { class: "field" }, [ui.el("span", { text: "이름" }), nameInput]),
      ui.el("p", { class: "account-email", text: session.email || "" }),
      // 로그아웃해도 이 계정의 계획은 기기에 남는다. 다시 로그인하면 그대로
      // 돌아온다 - 지운다고 오해하지 않게 적어 둔다.
      ui.el("p", { class: "empty", text: "로그아웃해도 이 기기의 계획은 지워지지 않습니다." }),
      ui.el("button", { class: "btn", text: "로그아웃", onclick: async () => {
        if (!(await ui.confirmDialog("로그아웃할까요?"))) return;
        ui.closeSheet();
        SP.app.signOut();
      } }),
    ]);
  }

  SP.authui = { API_KEY, render, accountSection };
})(typeof globalThis !== "undefined" ? globalThis : window);
