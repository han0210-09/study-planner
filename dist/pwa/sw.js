// 자동 생성 파일 - build-pwa.js 가 만든다. 직접 고치지 말 것.
const CACHE = "study-planner-029abc4e2bb1";
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
