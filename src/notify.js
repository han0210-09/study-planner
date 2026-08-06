(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  // 알림.
  //
  // 솔직하게 말해 둘 것이 있다. 서버가 없으므로 앱을 완전히 닫으면 알림이
  // 울리지 않는다. 정해진 시각에 브라우저를 깨우는 일은 푸시 서버만 할 수
  // 있고, 이 앱은 기기 안에서만 산다. 그래서 여기서 하는 것은 "앱이 열려
  // 있거나 뒤에 내려가 있는 동안" 울리는 것까지다. 그 사실은 설정 화면에
  // 적어 둔다 - 안 울린다고 고장으로 오해하는 편이 더 나쁘다.

  const KINDS = [
    { id: "blockStart", label: "일정 시작할 때", note: "블록이 시작하는 시각에" },
    { id: "blockEnd", label: "일정 끝날 때", note: "다음으로 넘어갈 때" },
    { id: "dayStart", label: "아침에 오늘 계획", note: "하루의 첫 블록 10분 전" },
    { id: "dday", label: "시험·수행평가 전날", note: "저녁 8시에" },
  ];

  const TICK_MS = 30000;      // 30초마다 살핀다. 5분 단위 계획에는 넉넉하다.
  const AHEAD = 10;           // 하루 시작 알림을 몇 분 전에 낼지
  const DDAY_HOUR = 20;

  let timer = null;
  // 같은 것을 두 번 울리지 않는다. 새로고침하면 비므로 그때 한 번은 다시
  // 울릴 수 있는데, 놓치는 것보다는 낫다.
  const fired = new Set();

  function settings() {
    const s = SP.app.state().settings;
    if (!s.notify || typeof s.notify !== "object") s.notify = {};
    return s.notify;
  }

  function enabled(kind) {
    const n = settings();
    if (!n.on) return false;
    return n[kind] !== false; // 켜 두는 것이 기본이다
  }

  function supported() {
    return typeof Notification !== "undefined" && "serviceWorker" in navigator;
  }

  function permission() {
    return supported() ? Notification.permission : "unsupported";
  }

  async function ask() {
    if (!supported()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    try { return await Notification.requestPermission(); }
    catch (e) { return Notification.permission; }
  }

  // 서비스워커로 띄운다. new Notification 은 앱이 뒤로 내려가면 안 뜨는
  // 브라우저가 있다.
  async function show(title, body, tag) {
    if (permission() !== "granted") return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body, tag, icon: "./icon-192.png", badge: "./icon-192.png" });
        return true;
      }
      new Notification(title, { body, tag });
      return true;
    } catch (e) { return false; }
  }

  function nowMinutes() {
    const now = new Date();
    let m = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < dt.DAY_BOUNDARY_HOUR) m += 1440;
    return m;
  }

  function labelOf(block) {
    const subjects = SP.app.state().settings.subjects;
    return [subjectsApi.nameOf(subjects, block.subjectId), block.text].filter(Boolean).join(" · ") || "이름 없음";
  }

  // 지금 이 순간에 울려야 할 것들을 고른다. 화면과 떨어져 있어 시험하기 쉽다.
  //
  // window 는 몇 분 이내를 "지금"으로 볼지다. 30초마다 살피므로 1분이면
  // 놓치지 않는다.
  function due(day, events, todayKey, minutes, window) {
    const w = window === undefined ? 1 : window;
    const out = [];
    const blocks = (day.blocks || []).slice().sort((a, b) => a.start - b.start);

    if (blocks.length && enabled("dayStart")) {
      const first = blocks[0];
      const at = first.start - AHEAD;
      if (minutes >= at && minutes < at + w) {
        out.push({ kind: "dayStart", tag: "dayStart:" + todayKey,
          title: "오늘 계획을 시작할 시간입니다",
          body: dt.minutesToLabel(first.start) + " " + labelOf(first) + " 부터" });
      }
    }

    for (const b of blocks) {
      if (enabled("blockStart") && minutes >= b.start && minutes < b.start + w) {
        out.push({ kind: "blockStart", tag: "start:" + b.id,
          title: labelOf(b),
          body: dt.minutesToLabel(b.start) + "~" + dt.minutesToLabel(b.end) + " 시작" });
      }
      if (enabled("blockEnd") && minutes >= b.end && minutes < b.end + w) {
        const next = blocks.find((x) => x.start >= b.end);
        out.push({ kind: "blockEnd", tag: "end:" + b.id,
          title: labelOf(b) + " 끝",
          body: next ? "다음은 " + dt.minutesToLabel(next.start) + " " + labelOf(next) : "오늘 계획을 다 했습니다" });
      }
    }

    if (enabled("dday") && minutes >= DDAY_HOUR * 60 && minutes < DDAY_HOUR * 60 + w) {
      const tomorrow = dt.addDays(todayKey, 1);
      for (const e of events || []) {
        if (e.startDate !== tomorrow) continue;
        out.push({ kind: "dday", tag: "dday:" + e.id,
          title: "내일 " + e.title, body: "오늘 준비할 것이 남았는지 확인하세요" });
      }
    }
    return out;
  }

  async function tick() {
    if (!settings().on || permission() !== "granted") return;
    const key = SP.app.today();
    const day = SP.app.store().getDay(key);
    for (const item of due(day, SP.app.state().events, key, nowMinutes())) {
      if (fired.has(item.tag)) continue;
      fired.add(item.tag);
      await show(item.title, item.body, item.tag);
    }
  }

  function start() {
    stop();
    if (!settings().on) return;
    timer = setInterval(tick, TICK_MS);
    tick();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // 설정에서 켜고 끄는 곳. 켤 때만 권한을 묻는다 - 앱을 처음 켜자마자 묻는
  // 것은 대부분 거절당하고, 한 번 거절하면 다시 묻지도 못한다.
  async function setOn(on) {
    const n = settings();
    if (on) {
      const result = await ask();
      if (result !== "granted") {
        n.on = false;
        SP.app.persist();
        ui.toast(result === "denied"
          ? "브라우저에서 알림이 막혀 있습니다. 주소창 옆 자물쇠에서 켜 주세요."
          : "이 브라우저는 알림을 지원하지 않습니다.");
        return false;
      }
    }
    n.on = !!on;
    SP.app.persist();
    if (n.on) start(); else stop();
    return n.on;
  }

  function setKind(kind, on) {
    settings()[kind] = !!on;
    SP.app.persist();
    fired.clear();
  }

  const api = { KINDS, AHEAD, DDAY_HOUR, settings, enabled, supported, permission, ask, show, due, tick, start, stop, setOn, setKind, fired };
  SP.notify = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
