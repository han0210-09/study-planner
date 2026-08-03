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
    host.appendChild(el("div", { class: "scrim", onclick: closeSheet }));
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
