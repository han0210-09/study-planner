const test = require("node:test");
const assert = require("node:assert/strict");
const tpl = require("../src/templates.js");
const dt = require("../src/datetime.js");

let seq = 0;
const newId = () => "id" + ++seq;

// ---- 들어 있는 예시 ----

test("BUILT_IN: 예시마다 이름과 블록이 있다", () => {
  assert.ok(tpl.BUILT_IN.length >= 3);
  for (const t of tpl.BUILT_IN) {
    assert.ok(t.id && t.name, JSON.stringify(t));
    assert.ok(t.blocks.length > 0, t.id);
  }
});

test("BUILT_IN: 블록이 하루 범위 안에 있고 5분 단위다", () => {
  for (const t of tpl.BUILT_IN) {
    for (const b of t.blocks) {
      assert.ok(b.start >= dt.DAY_START && b.end <= dt.DAY_END, t.id + " " + JSON.stringify(b));
      assert.equal(b.start % dt.SLOT, 0, t.id);
      assert.equal(b.end % dt.SLOT, 0, t.id);
      assert.ok(b.end > b.start, t.id);
    }
  }
});

test("BUILT_IN: 한 예시 안에서 블록끼리 겹치지 않는다", () => {
  for (const t of tpl.BUILT_IN) {
    const sorted = t.blocks.slice().sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].start >= sorted[i - 1].end,
        t.id + " 겹침: " + JSON.stringify(sorted[i - 1]) + JSON.stringify(sorted[i]));
    }
  }
});

test("find: id 로 찾는다", () => {
  assert.equal(tpl.find("weekday").name, "평일 방과후");
  assert.equal(tpl.find("없음"), null);
});

// ---- 얹기 ----

test("toBlocks: 빈 날에는 예시 전체가 들어간다", () => {
  const t = tpl.find("weekday");
  const out = tpl.toBlocks(t, [], newId);
  assert.equal(out.length, t.blocks.length);
  assert.ok(out.every((b) => b.id && b.done === false && b.todoId === null));
});

test("toBlocks: 이미 있는 블록과 겹치는 것은 버린다", () => {
  const t = tpl.find("weekday");
  const first = t.blocks[0];
  const out = tpl.toBlocks(t, [{ id: "x", start: first.start, end: first.end }], newId);
  assert.equal(out.length, t.blocks.length - 1);
  assert.ok(!out.some((b) => b.start === first.start), JSON.stringify(out));
});

test("toBlocks: 넣은 것끼리도 겹치지 않는다", () => {
  for (const t of tpl.BUILT_IN) {
    const out = tpl.toBlocks(t, [], newId).sort((a, b) => a.start - b.start);
    for (let i = 1; i < out.length; i++) assert.ok(out[i].start >= out[i - 1].end, t.id);
  }
});

test("toBlocks: 하루를 다 덮고 있으면 아무것도 안 넣는다", () => {
  const all = [{ id: "x", start: dt.DAY_START, end: dt.DAY_END }];
  assert.deepEqual(tpl.toBlocks(tpl.find("weekday"), all, newId), []);
});

// ---- 코드 주고받기 ----

test("encode/decode: 넣은 것이 그대로 나온다", () => {
  const blocks = [{ start: 600, end: 660, text: "독서 지문" }, { start: 700, end: 760, text: "수학" }];
  const code = tpl.encode("내 하루", blocks);
  const back = tpl.decode(code);
  assert.equal(back.name, "내 하루");
  assert.deepEqual(back.blocks, blocks);
});

test("encode: 사람이 알아볼 수 있는 머리가 붙는다", () => {
  assert.ok(tpl.encode("x", [{ start: 600, end: 660, text: "a" }]).startsWith("SPLAN1:"));
});

test("decode: 한글이 깨지지 않는다", () => {
  const code = tpl.encode("국어·수학 계획", [{ start: 600, end: 660, text: "독서 지문 ①" }]);
  assert.equal(tpl.decode(code).blocks[0].text, "독서 지문 ①");
});

test("decode: 줄바꿈이나 공백이 섞여도 읽는다", () => {
  // 메신저가 긴 글자를 접어서 보낸다.
  const code = tpl.encode("a", [{ start: 600, end: 660, text: "b" }]);
  const broken = code.slice(0, 12) + "\n  " + code.slice(12);
  assert.deepEqual(tpl.decode(broken), tpl.decode(code));
});

test("decode: 아닌 것은 null", () => {
  assert.equal(tpl.decode(""), null);
  assert.equal(tpl.decode("그냥 글자"), null);
  assert.equal(tpl.decode("SPLAN1:!!!!"), null);
  assert.equal(tpl.decode(null), null);
});

test("decode: 남이 보낸 값을 그대로 믿지 않는다", () => {
  // 하루 밖, 5분 아닌 단위, 뒤집힌 시각은 버린다.
  const bad = tpl.encode("x", []);
  assert.equal(tpl.decode(bad), null, "블록이 하나도 없으면 null");

  const mixed = tpl.encode("x", [
    { start: 600, end: 660, text: "좋은 것" },
    { start: 0, end: 60, text: "하루 밖" },
    { start: 602, end: 660, text: "5분 아님" },
    { start: 700, end: 690, text: "뒤집힘" },
  ]);
  const back = tpl.decode(mixed);
  assert.equal(back.blocks.length, 1);
  assert.equal(back.blocks[0].text, "좋은 것");
});

test("decode: 긴 이름과 긴 내용은 잘라 담는다", () => {
  const long = "가".repeat(200);
  const back = tpl.decode(tpl.encode(long, [{ start: 600, end: 660, text: long }]));
  assert.equal(back.name.length, 40);
  assert.equal(back.blocks[0].text.length, 40);
});

test("코드가 카톡에 붙일 만큼 짧다", () => {
  // 하루치 여덟 블록이 한 화면에 들어와야 한다.
  const blocks = [];
  for (let i = 0; i < 8; i++) blocks.push({ start: 600 + i * 70, end: 650 + i * 70, text: "과목 공부" });
  const code = tpl.encode("평일 계획", blocks);
  assert.ok(code.length < 600, code.length + "자");
});
