(function (root) {
  const dt = typeof require !== "undefined" ? require("./datetime.js") : root.SP.datetime;

  // 일정 예시와, 사람끼리 주고받는 코드.
  //
  // 서버가 없으므로 "공유"는 코드를 주고받는 것이다. 내 하루를 글자 한 덩이로
  // 바꿔 카톡으로 보내면, 받은 사람이 붙여넣어 자기 날짜에 얹는다. 계정도
  // 서버도 필요 없고, 보낸 사람이 지운다고 받은 것이 사라지지도 않는다.

  const h = (hour, min) => hour * 60 + (min || 0);

  // 앱이 처음부터 들고 있는 예시. 다 지어낸 것이 아니라, 학교가 끝나는 시각과
  // 자는 시각이라는 두 못만 박고 그 사이를 채운 것이다. 그대로 쓰라는 것이
  // 아니라 손댈 바탕으로 쓰라는 것이다.
  const BUILT_IN = [
    {
      id: "weekday",
      name: "평일 방과후",
      note: "학교 마치고 4시간",
      blocks: [
        { text: "저녁·쉬기", start: h(18), end: h(19), subject: null },
        { text: "숙제", start: h(19), end: h(20), subject: "숙제" },
        { text: "주요 과목", start: h(20, 10), end: h(21, 40), subject: null },
        { text: "복습·오답", start: h(21, 50), end: h(22, 50), subject: null },
      ],
    },
    {
      id: "weekend",
      name: "주말 몰입",
      note: "오전부터 저녁까지",
      blocks: [
        { text: "1교시", start: h(9), end: h(10, 30), subject: null },
        { text: "2교시", start: h(10, 45), end: h(12, 15), subject: null },
        { text: "점심", start: h(12, 15), end: h(13, 15), subject: null },
        { text: "3교시", start: h(13, 30), end: h(15), subject: null },
        { text: "4교시", start: h(15, 15), end: h(16, 45), subject: null },
        { text: "정리·오답", start: h(19), end: h(20, 30), subject: null },
      ],
    },
    {
      id: "exam",
      name: "시험 2주 전",
      note: "과목을 돌려가며",
      blocks: [
        { text: "1순위 과목", start: h(18), end: h(19, 30), subject: null },
        { text: "2순위 과목", start: h(19, 40), end: h(21), subject: null },
        { text: "암기 과목", start: h(21, 10), end: h(22, 10), subject: null },
        { text: "오답 정리", start: h(22, 20), end: h(23), subject: null },
      ],
    },
    {
      id: "morning",
      name: "아침형",
      note: "일찍 일어나는 사람",
      blocks: [
        { text: "아침 공부", start: h(6), end: h(7, 20), subject: null },
        { text: "저녁 공부", start: h(19), end: h(20, 30), subject: null },
        { text: "가볍게 복습", start: h(20, 40), end: h(21, 30), subject: null },
      ],
    },
  ];

  function find(id) {
    return BUILT_IN.find((t) => t.id === id) || null;
  }

  // 예시를 이 날짜의 블록으로 바꾼다. 이미 있는 블록과 겹치는 것은 버린다 -
  // 얹는 것이지 갈아엎는 것이 아니다.
  function toBlocks(template, existing, newId) {
    const out = [];
    const taken = (existing || []).slice();
    for (const b of template.blocks) {
      const start = dt.clampToDay(b.start);
      const end = dt.clampToDay(b.end);
      if (end - start < dt.SLOT) continue;
      if (taken.some((x) => start < x.end && end > x.start)) continue;
      const made = { id: newId(), subjectId: null, text: b.text, start, end, done: false, todoId: null };
      out.push(made);
      taken.push(made);
    }
    return out;
  }

  /* ---------- 주고받는 코드 ---------- */

  // 코드는 사람이 카톡에 붙여넣을 물건이다. 짧고, 줄바꿈이 섞여도 살아남고,
  // 앞부분만 봐도 무엇인지 알 수 있어야 한다.
  const PREFIX = "SPLAN1:";

  function encode(name, blocks) {
    const payload = {
      n: String(name || "").slice(0, 40),
      b: (blocks || []).map((x) => [x.start, x.end, String(x.text || "").slice(0, 40)]),
    };
    const json = JSON.stringify(payload);
    // 한글이 들어가므로 그대로 btoa 하면 터진다. UTF-8 로 편 뒤에 담는다.
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return PREFIX + btoa(bin).replace(/=+$/, "");
  }

  function decode(code) {
    const text = String(code || "").split(/\s+/).join("");
    if (!text.startsWith(PREFIX)) return null;
    let body = text.slice(PREFIX.length);
    while (body.length % 4 !== 0) body += "=";
    let json;
    try {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    } catch (e) { return null; }

    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { return null; }
    if (!parsed || !Array.isArray(parsed.b)) return null;

    // 받은 것을 그대로 믿지 않는다. 남이 보낸 글자다.
    const blocks = [];
    for (const row of parsed.b) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const start = Number(row[0]);
      const end = Number(row[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start % dt.SLOT !== 0 || end % dt.SLOT !== 0) continue;
      if (start < dt.DAY_START || end > dt.DAY_END || end - start < dt.SLOT) continue;
      blocks.push({ start, end, text: typeof row[2] === "string" ? row[2].slice(0, 40) : "" });
    }
    if (blocks.length === 0) return null;
    return { name: typeof parsed.n === "string" ? parsed.n.slice(0, 40) : "받은 계획", blocks };
  }

  const api = { BUILT_IN, PREFIX, find, toBlocks, encode, decode };

  root.SP = root.SP || {};
  root.SP.templates = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
