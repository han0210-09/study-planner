// 자동 생성 파일 - build-pwa.js 가 만든다. 직접 고치지 말 것.

// 빌드 내용의 해시다. 쓰지는 않지만 이 파일을 바꿔놓는 게 목적이다 — sw.js 가
// 한 바이트도 안 바뀌면 브라우저가 업데이트로 보지 않아 install 이 안 돈다.
const BUILD = "d376799642fe";

// 이름은 빌드마다 바꾸지 않는다. 바꾸면, 물러나는 워커가 뒤늦게 끝낸 백그라운드
// 쓰기(caches.open 은 없으면 만든다)가 새 워커가 방금 지운 옛 캐시를 되살린다.
// 죽은 캐시가 폰에 그대로 쌓인다.
const CACHE = "study-planner";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

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

// 이 앱은 index.html 한 장이 곧 전부다 - CSS 도 JS 도 그 안에 박혀 있다.
// 그래서 그 한 장을 캐시부터 주면, 고친 것이 폰에 며칠씩 안 닿는다. 실제로
// 그랬다: 시간표와 달력을 고쳐 배포했는데 폰에는 옛 화면이 그대로 있었다.
function isPage(request) {
  if (request.mode === "navigate") return true;
  const path = new URL(request.url).pathname;
  return path.endsWith("/") || path.endsWith("/index.html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // 앱 한 장은 망을 먼저 본다. 망이 없으면 캐시로 물러나므로 오프라인에서
  // 열리는 것은 그대로다.
  //
  // cache: "no-store" 로 받는다. 그냥 fetch 하면 브라우저 HTTP 캐시가 옛
  // 파일을 돌려줘서, 망이 멀쩡해도 새 빌드를 못 본다.
  if (isPage(request)) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./")))
    );
    return;
  }

  // 나머지(아이콘·매니페스트)는 잘 안 바뀐다. 캐시부터 보여주고 새 것은 뒤에서
  // 받아 둔다 - 신호가 약한 곳에서도 앱이 즉시 열리는 게 우선이다.
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
