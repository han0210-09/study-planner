// 앱 아이콘을 코드로 그려서 PNG 로 낸다. 이 저장소는 의존성이 없으므로
// 이미지 라이브러리를 쓰지 않고 node:zlib 만으로 PNG 를 직접 인코딩한다.
//
// 색은 지어내지 않았다. 배경은 앱의 --accent(녹색)이고 막대는 과목 팔레트에서
// 골랐다. 아이콘이 앱의 타임테이블을 축소한 모양이다.

const zlib = require("node:zlib");

const REF = 512; // 아래 좌표는 모두 512 기준이고, 다른 크기는 비례로 늘린다.
const BG = [0x3e, 0x8e, 0x5a];
const BAR_H = 60;
const GAP = 36;
const TOP = 130;
const RADIUS = 18;
const BARS = [
  { x0: 112, x1: 400, color: [0xf4, 0xee, 0xe0] },
  { x0: 112, x1: 292, color: [0xf6, 0xdf, 0xa8] },
  { x0: 112, x1: 352, color: [0xd7, 0xe9, 0xc4] },
];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// 색 타입 2(알파 없는 RGB)를 쓴다. iOS 의 apple-touch-icon 은 투명한 자리를
// 검게 칠하므로, 아이콘은 어차피 꽉 찬 사각형이어야 한다.
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRounded(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// 안드로이드의 maskable 아이콘은 가운데 원 밖을 잘라낸다. 막대를 여기 안에
// 두었는지 확인하는 용도로 내보낸다 — 테스트가 이 값을 검사한다.
function safeRadius(size) {
  return (size / 2) * 0.8;
}

function drawIcon(size) {
  const scale = size / REF;
  const pixels = Buffer.alloc(size * size * 3);
  const bars = BARS.map((bar, i) => ({
    ...bar,
    y0: TOP + i * (BAR_H + GAP),
    y1: TOP + i * (BAR_H + GAP) + BAR_H,
  }));

  const SS = 3; // 계단이 보이지 않게 픽셀당 3x3 으로 표본을 뽑는다.
  const samples = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];
      for (const bar of bars) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const ux = (x + (sx + 0.5) / SS) / scale;
            const uy = (y + (sy + 0.5) / SS) / scale;
            if (insideRounded(ux, uy, bar.x0, bar.y0, bar.x1, bar.y1, RADIUS)) hits++;
          }
        }
        if (hits === 0) continue;
        const a = hits / samples;
        r = Math.round(r + (bar.color[0] - r) * a);
        g = Math.round(g + (bar.color[1] - g) * a);
        b = Math.round(b + (bar.color[2] - b) * a);
      }
      const at = (y * size + x) * 3;
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
    }
  }

  return pixels;
}

function iconPng(size) {
  return encodePng(size, drawIcon(size));
}

module.exports = { iconPng, drawIcon, encodePng, crc32, safeRadius, REF, BG, BARS, BAR_H, GAP, TOP };
