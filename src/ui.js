(function (root) {
  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "style") Object.assign(node.style, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) node.setAttribute(key, "");
      else if (value !== false && value != null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children || [])) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function closeSheet() {
    const host = document.getElementById("sheet-root");
    clear(host);
    document.body.classList.remove("sheet-open");
  }

  // 길게 눌러서 연 시트는, 손을 떼는 순간 나오는 click 이 방금 그 자리에 나타난
  // scrim 이나 버튼 위로 떨어진다. 그것만으로 시트가 즉시 닫히거나 버튼이 눌린다.
  // 손가락을 뗀 지점이 어디였는지는 시트가 알 수 없다.
  //
  // 시간으로 막지 않는다 — "연 지 300ms 안의 클릭은 무시" 같은 규칙은 빠르게
  // 두 번 조작하는 사람의 진짜 탭까지 함께 삼킨다. 시트 안에서 시작한 누름만
  // 진짜로 친다.
  function guardStrayClick(node, isPressed, markPressed) {
    node.addEventListener("pointerdown", markPressed, true);
    node.addEventListener("click", (e) => {
      // 키보드로 누른 click 은 detail 이 0 이다. 이 경우 앞선 pointerdown 이 없다.
      if (isPressed() || e.detail === 0) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  }

  function openSheet(options) {
    const host = clear(document.getElementById("sheet-root"));
    const panel = el("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, [
      el("div", { class: "sheet-head" }, [
        el("h2", { class: "sheet-title", text: options.title || "" }),
        el("button", { class: "icon-btn", "aria-label": "닫기", text: "✕", onclick: closeSheet }),
      ]),
      el("div", { class: "sheet-body" }, options.body || []),
      options.actions ? el("div", { class: "sheet-actions" }, options.actions) : null,
    ]);
    const scrim = el("div", { class: "scrim" });

    // 시트마다 새로 만드는 요소에만 건다. sheet-root 에 걸면 시트를 열 때마다
    // 리스너가 쌓인다 - clear() 는 자식만 지우지 리스너를 걷어내지 않는다.
    let pressed = false;
    const mark = () => { pressed = true; };
    guardStrayClick(scrim, () => pressed, mark);
    guardStrayClick(panel, () => pressed, mark);
    scrim.addEventListener("click", closeSheet);

    host.appendChild(scrim);
    host.appendChild(panel);
    document.body.classList.add("sheet-open");
    return panel;
  }

  // 옆으로 밀기. 세로가 더 크면 굴리려는 것이므로 넘기지 않는다.
  //
  // 폰에서는 포인터 이벤트만으로 안 된다. 손가락이 20px 남짓 움직이는 순간
  // 브라우저가 제 스크롤로 가져가면서 pointercancel 을 보내, 방향을 정하기도
  // 전에 제스처가 끊긴다. 터치 이벤트는 그때도 계속 오고 preventDefault 로
  // 붙잡을 수 있다. 마우스에는 터치 이벤트가 없으므로 포인터 쪽도 함께 둔다.
  //
  // min 까지 기다렸다 붙잡으면 늦는다. claim 을 넘는 순간 미리 가져온다.
  function attachSwipe(node, onSwipe, options) {
    const min = (options && options.min) || 50;
    const claim = (options && options.claim) || 12;
    let x0 = 0, y0 = 0, tracking = false, claimed = false, done = false;

    function start(x, y) { x0 = x; y0 = y; tracking = true; claimed = false; done = false; }
    function stop() { tracking = false; claimed = false; }

    // 돌려주는 값은 "이 제스처를 우리가 가져갔는가".
    function step(x, y) {
      if (!tracking || done) return claimed;
      const dx = x - x0;
      const dy = y - y0;
      if (!claimed && Math.abs(dx) > claim && Math.abs(dx) > Math.abs(dy)) claimed = true;
      if (Math.abs(dx) < min && Math.abs(dy) < min) return claimed;
      done = true;
      tracking = false;
      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
      return claimed;
    }

    node.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    node.addEventListener("touchmove", (e) => {
      if (!tracking || e.touches.length !== 1) return;
      if (step(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
    }, { passive: false });
    node.addEventListener("touchend", stop);
    node.addEventListener("touchcancel", stop);

    node.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") start(e.clientX, e.clientY); });
    node.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") step(e.clientX, e.clientY); });
    node.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") stop(); });
    node.addEventListener("pointercancel", (e) => { if (e.pointerType === "mouse") stop(); });
  }

  // 위아래로 잡아당기는 손짓. attachSwipe 와 같은 이유로 터치 이벤트를 직접
  // 듣는다 - 포인터 이벤트만 쓰면 브라우저가 세로 스크롤로 가져가면서
  // pointercancel 을 보내 손짓이 끊긴다.
  //
  // onPull(dir) 의 dir 은 -1 이 위로(열기), 1 이 아래로(닫기)다.
  function attachPull(node, onPull, options) {
    const min = (options && options.min) || 28;
    const claim = (options && options.claim) || 8;
    let y0 = 0, x0 = 0, tracking = false, claimed = false, done = false;

    function start(x, y) { x0 = x; y0 = y; tracking = true; claimed = false; done = false; }
    function stop() { tracking = false; claimed = false; }

    function step(x, y) {
      if (!tracking || done) return claimed;
      const dx = x - x0, dy = y - y0;
      if (!claimed && Math.abs(dy) > claim && Math.abs(dy) > Math.abs(dx)) claimed = true;
      if (Math.abs(dy) < min) return claimed;
      done = true; tracking = false;
      if (Math.abs(dy) > Math.abs(dx)) onPull(dy < 0 ? -1 : 1);
      return claimed;
    }

    node.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    node.addEventListener("touchmove", (e) => {
      if (!tracking || e.touches.length !== 1) return;
      // 방향이 잡히면 우리 손짓으로 가져온다. 안 그러면 뒤쪽 화면이 함께 굴러간다.
      if (step(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
    }, { passive: false });
    node.addEventListener("touchend", stop);
    node.addEventListener("touchcancel", stop);

    // 마우스는 포인터 이벤트로 충분하다.
    node.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") start(e.clientX, e.clientY); });
    node.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") step(e.clientX, e.clientY); });
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
  }

  function toast(message) {
    const host = document.getElementById("toast-root");
    const node = el("div", { class: "toast", text: message });
    host.appendChild(node);
    setTimeout(() => node.classList.add("toast-out"), 2200);
    setTimeout(() => node.remove(), 2600);
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      openSheet({
        title: "확인",
        body: [el("p", { class: "confirm-msg", text: message })],
        actions: [
          el("button", { class: "btn btn-ghost", text: "취소", onclick: () => { closeSheet(); resolve(false); } }),
          el("button", { class: "btn btn-danger", text: "실행", onclick: () => { closeSheet(); resolve(true); } }),
        ],
      });
    });
  }

  function showBanner(message) {
    const banner = document.getElementById("banner");
    banner.textContent = message;
    banner.hidden = false;
  }

  const api = { el, clear, openSheet, closeSheet, toast, confirmDialog, showBanner, attachSwipe, attachPull };
  root.SP = root.SP || {};
  root.SP.ui = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
