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

  const api = { el, clear, openSheet, closeSheet, toast, confirmDialog, showBanner };
  root.SP = root.SP || {};
  root.SP.ui = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
