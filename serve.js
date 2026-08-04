const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// 기본은 src 지만, 폴더를 넘기면 그걸 연다 — PWA 는 dist/pwa 를 통째로 띄워야
// manifest 와 서비스 워커까지 실제 배포와 같은 모양으로 확인할 수 있다.
const ROOT = path.join(__dirname, process.argv[2] || "src");
const PORT = 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
};

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "index.html" : url.slice(1);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, () => console.log("http://localhost:" + PORT));
