(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  // 집중 화면. 지금 할 것과 다음에 할 것을 크게 띄운다.
  //
  // 원래 바라던 것은 폰 잠금화면에 이것이 뜨는 것이었다. 웹페이지는 잠금화면에
  // 그릴 수 없다. 대신 화면을 이 한 장으로 채우고, 화면 꺼짐을 막아 책상에
  // 세워 두면 잠금화면과 같은 자리에서 같은 일을 한다. 강제력은 없다 -
  // 나가려면 언제든 나갈 수 있고, 그건 웹에서 바꿀 수 없는 사실이다.

  let node = null;
  let timer = null;
  let wakeLock = null;

  function nowMinutes() {
    const now = new Date();
    let m = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) m += 1440;
    return m + now.getSeconds() / 60;
  }

  function labelOf(block) {
    const subjects = SP.app.state().settings.subjects;
    return [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";
  }

  // 지금 하는 것과 다음 것. 지금 아무것도 없으면 다음 것만 나온다.
  function pick(blocks, minutes) {
    const sorted = (blocks || []).slice().sort((a, b) => a.start - b.start);
    const current = sorted.find((b) => minutes >= b.start && minutes < b.end) || null;
    const next = sorted.find((b) => b.start > minutes) || null;
    return { current, next };
  }

  function remainText(block, minutes) {
    const left = Math.max(0, Math.ceil(block.end - minutes));
    return dt.formatDuration(left) + " 남음";
  }

  async function keepAwake() {
    // 화면 꺼짐 막기는 되는 곳에서만 한다. 안 되는 브라우저에서 터지면 안 된다.
    if (!navigator.wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request("screen"); }
    catch (e) { wakeLock = null; }
  }

  function releaseAwake() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* 이미 풀렸다 */ } }
    wakeLock = null;
  }

  function paint(dateKey) {
    if (!node) return;
    const minutes = nowMinutes();
    const day = SP.app.store().getDay(dateKey);
    const picked = pick(day.blocks, minutes);
    const subjects = SP.app.state().settings.subjects;

    const body = [];
    if (picked.current) {
      body.push(ui.el("div", { class: "focus-now" }, [
        ui.el("p", { class: "focus-tag", text: "지금" }),
        ui.el("p", { class: "focus-title", text: labelOf(picked.current) }),
        ui.el("p", { class: "focus-time",
          text: dt.minutesToLabel(picked.current.start) + " ~ " + dt.minutesToLabel(picked.current.end) }),
        ui.el("p", { class: "focus-left", text: remainText(picked.current, minutes) }),
        ui.el("div", { class: "focus-bar" }, [
          ui.el("div", { class: "focus-fill", style: {
            width: Math.min(100, Math.max(0,
              ((minutes - picked.current.start) / (picked.current.end - picked.current.start)) * 100)) + "%",
            background: subjectsApi.colorOf(subjects, picked.current.subjectId),
          } }),
        ]),
        ui.el("button", {
          class: "btn focus-done" + (picked.current.done ? " focus-done-on" : ""),
          type: "button",
          text: picked.current.done ? "✓ 했음" : "다 했으면 누르기",
          onclick: () => {
            const d = SP.app.store().getDay(dateKey);
            SP.app.saveDay(dateKey, SP.link.setBlockDone(d, picked.current.id, !picked.current.done));
            paint(dateKey);
          },
        }),
      ]));
    } else {
      body.push(ui.el("div", { class: "focus-now" }, [
        ui.el("p", { class: "focus-tag", text: "지금" }),
        ui.el("p", { class: "focus-title focus-idle", text: "잡아둔 것이 없습니다" }),
      ]));
    }

    body.push(ui.el("div", { class: "focus-next" }, picked.next
      ? [
          ui.el("p", { class: "focus-tag", text: "다음" }),
          ui.el("p", { class: "focus-next-title", text: labelOf(picked.next) }),
          ui.el("p", { class: "focus-time",
            text: dt.minutesToLabel(picked.next.start) + " 부터 · " +
              dt.formatDuration(Math.max(0, Math.ceil(picked.next.start - minutes))) + " 뒤" }),
        ]
      : [
          ui.el("p", { class: "focus-tag", text: "다음" }),
          ui.el("p", { class: "focus-next-title focus-idle", text: "오늘 계획이 끝났습니다" }),
        ]));

    ui.clear(node).appendChild(ui.el("div", { class: "focus-inner" }, [
      ui.el("button", { class: "icon-btn focus-close", type: "button", text: "✕",
        "aria-label": "집중 화면 닫기", onclick: close }),
      ui.el("p", { class: "focus-date", text: dt.formatDateKorean(dateKey) }),
      ...body,
    ]));
  }

  function open(dateKey) {
    close();
    node = ui.el("div", { class: "focus" });
    document.body.appendChild(node);
    document.body.classList.add("focus-open");
    paint(dateKey);
    timer = setInterval(() => paint(dateKey), 1000);
    keepAwake();
    // 화면을 껐다 켜면 잠금이 풀린다. 돌아왔을 때 다시 잡는다.
    document.addEventListener("visibilitychange", onVisible);
  }

  function onVisible() {
    if (!node) return;
    if (!document.hidden) keepAwake();
  }

  function close() {
    if (timer) clearInterval(timer);
    timer = null;
    releaseAwake();
    document.removeEventListener("visibilitychange", onVisible);
    if (node) node.remove();
    node = null;
    document.body.classList.remove("focus-open");
  }

  const api = { open, close, pick, remainText, isOpen: () => !!node };
  SP.focus = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
