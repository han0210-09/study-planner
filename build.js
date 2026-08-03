const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "src");
const OUT_DIR = path.join(__dirname, "dist");
const OUT = path.join(OUT_DIR, "planner.html");

function read(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8");
}

let html = read("index.html");

const cssLinks = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)];
for (const [tag, file] of cssLinks) {
  html = html.replace(tag, "<style>\n" + read(file) + "\n</style>");
}

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)];
for (const [tag, file] of scripts) {
  html = html.replace(tag, "<script>\n" + read(file) + "\n</script>");
}

const leftover = html.match(/(src|href)="(?!data:)[^"]+"/g);
if (leftover) {
  console.error("인라인되지 않은 외부 참조가 남아 있습니다:", leftover);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, "utf8");
console.log("dist/planner.html 생성 완료 (" + Math.round(html.length / 1024) + " KB)");
