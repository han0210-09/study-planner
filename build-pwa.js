// dist/planner.html 은 그 자체로 완결된 한 장짜리 앱이다. 여기서는 그걸 홈 화면에
// 설치할 수 있는 형태로 감싼다 — manifest, 아이콘, 오프라인용 서비스 워커.
//
// 경로는 전부 상대 경로다. GitHub Pages 는 https://<계정>.github.io/<저장소>/ 처럼
// 하위 폴더로 서비스하므로, "/icon-192.png" 같은 절대 경로를 쓰면 계정 최상위를
// 찾아가서 전부 404 가 된다.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { iconPng } = require("./icon.js");

const SRC = path.join(__dirname, "dist", "planner.html");
const OUT_DIR = path.join(__dirname, "dist", "pwa");

if (!fs.existsSync(SRC)) {
  console.error("dist/planner.html 이 없습니다. 먼저 `npm run build` 를 실행하세요.");
  process.exit(1);
}

let html = fs.readFileSync(SRC, "utf8");

if (!/<\/head>/.test(html) || !/<\/body>/.test(html)) {
  console.error("<head> 또는 <body> 를 찾지 못했습니다. build.js 의 출력이 맞는지 확인하세요.");
  process.exit(1);
}

// 이 값이 바뀌어야 브라우저가 sw.js 를 "새 워커"로 보고 install 을 다시 돌린다.
// 시각이 아니라 내용 해시로 만든다 — 시각으로 하면 고친 게 없는 날 배포해도
// 폰이 앱을 통째로 다시 받는다.
const stamp = crypto.createHash("sha1").update(html).digest("hex").slice(0, 12);

const ICONS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-180.png", size: 180 }, // iOS 의 apple-touch-icon
];

const manifest = {
  name: "스터디 플래너",
  short_name: "플래너",
  lang: "ko",
  description: "타임테이블과 할 일을 함께 관리하는 스터디 플래너",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "portrait",
  // 여는 순간의 스플래시 배경이다. 앱의 --bg 와 맞춰야 앱이 뜰 때 색이 튀지 않는다.
  background_color: "#F4EEE0",
  theme_color: "#3E8E5A",
  icons: [
    // 하나로 두 용도를 겸한다. 막대를 안전 영역 안에 그려서 안드로이드가 원형으로
    // 잘라내도 끝이 잘리지 않는다 (test/icon.test.js 가 이걸 검사한다).
    { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};

const sw = `// 자동 생성 파일 - build-pwa.js 가 만든다. 직접 고치지 말 것.

// 빌드 내용의 해시다. 쓰지는 않지만 이 파일을 바꿔놓는 게 목적이다 — sw.js 가
// 한 바이트도 안 바뀌면 브라우저가 업데이트로 보지 않아 install 이 안 돈다.
const BUILD = "${stamp}";

// 이름은 빌드마다 바꾸지 않는다. 바꾸면, 물러나는 워커가 뒤늦게 끝낸 백그라운드
// 쓰기(caches.open 은 없으면 만든다)가 새 워커가 방금 지운 옛 캐시를 되살린다.
// 죽은 캐시가 폰에 그대로 쌓인다.
const CACHE = "study-planner";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", ${ICONS.map((i) => JSON.stringify("./" + i.file)).join(", ")}];

self.addEventListener("install", (event) => {
  // cache: "reload" 로 받는다. 그냥 두면 브라우저 HTTP 캐시가 옛 파일을 돌려줘서
  // 새 빌드를 올려도 폰에 예전 앱이 그대로 남는다.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// 이름이 다른 캐시를 치운다. 지금은 이름이 고정이라 평소엔 지울 게 없고,
// 예전에 이름에 해시를 붙여 배포했던 폰에서 한 번 청소되는 게 전부다.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시부터 보여주고 새 버전은 뒤에서 받아 둔다. 신호가 약한 곳에서도 앱이 즉시
// 열리는 게 우선이고, 바뀐 내용은 다음에 열 때 반영된다.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const fresh = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then((hit) => hit || caches.match("./")));

  event.waitUntil(fresh);
  event.respondWith(caches.match(request).then((hit) => hit || fresh));
});
`;

const headTags = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icon-180.png">',
  // 없으면 iOS 가 <title> 을 홈 화면 이름으로 쓴다. "스터디 플래너" 는 아이콘 밑에서 잘린다.
  '<meta name="apple-mobile-web-app-title" content="플래너">',
].join("\n  ");

const register = `<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    // 상대 경로여야 한다. 등록 범위가 이 파일이 있는 폴더로 잡혀서,
    // 계정 하나에 저장소가 여럿이어도 서로 간섭하지 않는다.
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}
</script>`;

html = html.replace("</head>", "  " + headTags + "\n</head>");
html = html.replace("</body>", register + "\n</body>");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html, "utf8");
fs.writeFileSync(path.join(OUT_DIR, "manifest.webmanifest"), JSON.stringify(manifest, null, 2), "utf8");
fs.writeFileSync(path.join(OUT_DIR, "sw.js"), sw, "utf8");
// GitHub Pages 의 Jekyll 이 파일을 건드리지 않게 한다.
fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "", "utf8");
for (const { file, size } of ICONS) {
  fs.writeFileSync(path.join(OUT_DIR, file), iconPng(size));
}

// manifest 와 서비스 워커가 가리키는 파일이 실제로 나왔는지 확인한다. 빠져도
// 앱은 열리지만 설치가 조용히 거부되고, 그 이유는 폰에서 알아내기 어렵다.
const expected = ["index.html", "manifest.webmanifest", "sw.js", ...ICONS.map((i) => i.file)];
const missing = expected.filter((f) => !fs.existsSync(path.join(OUT_DIR, f)));
if (missing.length) {
  console.error("빠진 파일이 있습니다:", missing.join(", "));
  process.exit(1);
}

const total = expected.reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(
  "dist/pwa/ 생성 완료 (" + expected.length + "개 파일, " + Math.round(total / 1024) + " KB, 캐시 " + stamp + ")"
);
