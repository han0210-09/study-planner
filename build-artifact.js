// dist/planner.html 은 <!doctype>/<html>/<head>/<body> 를 갖춘 완전한 문서다.
// Artifact 는 올린 파일을 자기 문서 골격 안에 감싸므로, 그대로 올리면 태그가
// 중첩되어 깨진다. 여기서 골격을 벗겨 본문만 남긴다.
//
// <head> 안에 있던 meta 는 본문에 두면 무시되므로, 특히 viewport 가 사라지면
// 폰에서 데스크톱 폭으로 렌더된다. 그래서 런타임에 없으면 심는 스크립트를 넣는다.

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "dist", "planner.html");
const OUT = path.join(__dirname, "dist", "planner-artifact.html");

const doc = fs.readFileSync(SRC, "utf8");

const title = (doc.match(/<title>([\s\S]*?)<\/title>/) || [, "스터디 플래너"])[1];
const styles = [...doc.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const bodyMatch = doc.match(/<body>([\s\S]*?)<\/body>/);

if (!bodyMatch) {
  console.error("<body> 를 찾지 못했습니다. dist/planner.html 을 먼저 빌드하세요.");
  process.exit(1);
}
if (styles.length === 0) {
  console.error("<style> 을 찾지 못했습니다. build.js 가 CSS 를 인라인했는지 확인하세요.");
  process.exit(1);
}

// 감싸는 문서가 이 meta 들을 넣어줄지 알 수 없으므로 직접 보장한다.
const ensureMeta = `
<script>
(function () {
  function meta(attr, name, content) {
    if (document.querySelector("meta[" + attr + '="' + name + '"]')) return;
    var m = document.createElement("meta");
    m.setAttribute(attr, name);
    m.setAttribute("content", content);
    document.head.appendChild(m);
  }
  meta("name", "viewport", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");
  meta("name", "theme-color", "#3E8E5A");
  meta("name", "apple-mobile-web-app-capable", "yes");
  meta("name", "apple-mobile-web-app-status-bar-style", "default");
  if (document.title !== ${JSON.stringify(title)}) document.title = ${JSON.stringify(title)};
})();
</script>`.trim();

const out = [
  `<title>${title}</title>`,
  ensureMeta,
  ...styles.map((css) => `<style>\n${css}\n</style>`),
  bodyMatch[1].trim(),
].join("\n");

const forbidden = /<!doctype|<html[\s>]|<\/html>|<head[\s>]|<\/head>|<body[\s>]|<\/body>/i;
if (forbidden.test(out)) {
  console.error("문서 골격 태그가 남아 있습니다:", out.match(forbidden)[0]);
  process.exit(1);
}

const external = /(src|href)="(?!data:)/;
if (external.test(out)) {
  console.error("외부 참조가 남아 있습니다:", out.match(external)[0]);
  process.exit(1);
}

fs.writeFileSync(OUT, out, "utf8");
console.log(
  "dist/planner-artifact.html 생성 완료 (" +
    Math.round(Buffer.byteLength(out) / 1024) +
    " KB, script " +
    (out.match(/<script/g) || []).length +
    "개, style " +
    styles.length +
    "개)"
);
