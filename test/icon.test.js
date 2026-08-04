const test = require("node:test");
const assert = require("node:assert");
const zlib = require("node:zlib");
const icon = require("../icon.js");

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG 를 손으로 인코딩하므로, 만든 파일을 도로 뜯어서 규격에 맞는지 확인한다.
// 폰이 아이콘을 못 읽으면 홈 화면에 회색 사각형이 남는데, 그건 배포하고 나서야
// 눈에 띈다.
function parse(buf) {
  assert.deepEqual(buf.subarray(0, 8), SIGNATURE, "PNG 서명이 다릅니다");
  const chunks = [];
  let at = 8;
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("latin1");
    const data = buf.subarray(at + 8, at + 8 + length);
    const stored = buf.readUInt32BE(at + 8 + length);
    assert.equal(icon.crc32(buf.subarray(at + 4, at + 8 + length)), stored, type + " 청크의 CRC 가 틀립니다");
    chunks.push({ type, data });
    at += 12 + length;
  }
  assert.equal(at, buf.length, "청크를 다 읽고 남은 바이트가 있습니다");
  return chunks;
}

function pixelAt(pixels, size, x, y) {
  const at = (y * size + x) * 3;
  return [pixels[at], pixels[at + 1], pixels[at + 2]];
}

test("iconPng: 청크 구성과 CRC 가 규격에 맞는다", () => {
  const chunks = parse(icon.iconPng(192));
  assert.deepEqual(chunks.map((c) => c.type), ["IHDR", "IDAT", "IEND"]);
});

test("iconPng: IHDR 이 요청한 크기와 truecolour 를 선언한다", () => {
  for (const size of [180, 192, 512]) {
    const ihdr = parse(icon.iconPng(size))[0].data;
    assert.equal(ihdr.readUInt32BE(0), size);
    assert.equal(ihdr.readUInt32BE(4), size);
    assert.equal(ihdr[8], 8, "비트 깊이");
    assert.equal(ihdr[9], 2, "색 타입은 알파 없는 RGB 여야 한다");
    assert.equal(ihdr[12], 0, "인터레이스 없음");
  }
});

test("iconPng: IDAT 을 풀면 행마다 필터 바이트가 붙은 원본이 나온다", () => {
  const size = 64;
  const idat = parse(icon.iconPng(size))[1].data;
  const raw = zlib.inflateSync(idat);
  assert.equal(raw.length, size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    assert.equal(raw[y * (size * 3 + 1)], 0, y + "행의 필터 바이트");
  }
});

test("drawIcon: 네 귀퉁이가 모두 배경색이다 - 가장자리까지 꽉 찬다", () => {
  const size = 128;
  const pixels = icon.drawIcon(size);
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    assert.deepEqual(pixelAt(pixels, size, x, y), icon.BG, `(${x}, ${y})`);
  }
});

test("drawIcon: 막대 한가운데는 과목 색 그대로다", () => {
  const size = icon.REF;
  const pixels = icon.drawIcon(size);
  icon.BARS.forEach((bar, i) => {
    const x = Math.round((bar.x0 + bar.x1) / 2);
    const y = Math.round(icon.TOP + i * (icon.BAR_H + icon.GAP) + icon.BAR_H / 2);
    assert.deepEqual(pixelAt(pixels, size, x, y), bar.color, i + "번째 막대");
  });
});

test("drawIcon: 막대 사이 틈은 배경색이 그대로 보인다", () => {
  const size = icon.REF;
  const pixels = icon.drawIcon(size);
  const y = Math.round(icon.TOP + icon.BAR_H + icon.GAP / 2);
  assert.deepEqual(pixelAt(pixels, size, 200, y), icon.BG);
});

// 안드로이드는 maskable 아이콘의 가운데 원 밖을 잘라낸다. 막대가 이 원을 넘으면
// 홈 화면에서 끝이 잘린 채로 보인다.
test("BARS: 모든 막대 모서리가 maskable 안전 영역 안에 있다", () => {
  const center = icon.REF / 2;
  const limit = icon.safeRadius(icon.REF);
  icon.BARS.forEach((bar, i) => {
    const y0 = icon.TOP + i * (icon.BAR_H + icon.GAP);
    const y1 = y0 + icon.BAR_H;
    for (const [x, y] of [[bar.x0, y0], [bar.x1, y0], [bar.x0, y1], [bar.x1, y1]]) {
      const d = Math.hypot(x - center, y - center);
      assert.ok(d <= limit, `${i}번째 막대의 (${x}, ${y}) 가 안전 반지름 ${limit} 을 넘습니다 (${d.toFixed(1)})`);
    }
  });
});

test("drawIcon: 크기를 바꿔도 같은 그림이다 - 막대는 비례로 늘어난다", () => {
  const size = 256;
  const pixels = icon.drawIcon(size);
  const scale = size / icon.REF;
  const bar = icon.BARS[0];
  const inside = pixelAt(pixels, size, Math.round(((bar.x0 + bar.x1) / 2) * scale),
    Math.round((icon.TOP + icon.BAR_H / 2) * scale));
  assert.deepEqual(inside, bar.color);
});
