# 스터디 플래너

종이 스터디 플래너를 옮긴 모바일 웹앱. 월간 달력에서 날짜를 눌러 하루 계획(To-Do + 05:00~익일 02:00 타임테이블)을 관리한다.

**과목을 안 고른 블록은 공부 시간과 달성률에 넣지 않는다.** 밥 먹기·이동처럼
시간표에는 두고 싶지만 공부는 아닌 것들이다. 거르는 자리는 `store.sumPlanned` /
`store.sumDone` 안이고, 목표시간·실제시간·달성률·달력이 모두 이 두 함수를 거친다.

## 사용법

- **개발 서버**: `node serve.js` → http://localhost:8080
- **테스트**: `node --test`
- **빌드**: `node build.js` → `dist/planner.html` (단일 HTML, 외부 요청 없음)
- **PWA 빌드**: `npm run build:pwa` → `dist/pwa/`
- **PWA 확인**: `npm run serve:pwa` → http://localhost:8080

## 폰에서 쓰기

`dist/pwa/` 를 HTTPS 주소에 올리고 폰 브라우저로 열어 홈 화면에 추가하면
주소창 없는 앱으로 실행되고, 오프라인에서도 열린다.

- **안드로이드(크롬)**: 주소를 열면 설치 배너가 뜬다. 없으면 `⋮ → 앱 설치`
- **아이폰**: **Safari 로** 열고 `공유 → 홈 화면에 추가` (크롬에서는 안 된다)

서비스 워커와 manifest 는 HTTPS 에서만 동작한다. `file://` 로 연 HTML 은
설치되지 않고, 브라우저에 따라 저장 자체가 막힌다.

## 데이터

이 기기의 브라우저 저장소(`localStorage`, 키 `studyPlanner.v1`)에만 저장된다. 기기 간 자동 동기화는 없다.
**기기를 바꾸기 전에 설정 → JSON 내보내기로 백업할 것.**

저장소는 **주소마다 따로**다. 앱을 다른 주소로 옮기면 계획이 따라오지 않으므로,
옮기기 전에 JSON 으로 내보내고 새 주소에서 불러와야 한다.

## 문서

- 설계: `docs/superpowers/specs/2026-08-02-study-planner-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-study-planner.md`

## 배포

`node build-artifact.js` 는 `dist/planner.html` 에서 문서 골격을 벗겨
`dist/planner-artifact.html` 을 만든다. Artifact 는 올린 파일을 자기 문서 안에
감싸기 때문에, 완전한 HTML 문서를 그대로 올리면 태그가 중첩되어 깨진다.

`<head>` 의 meta 는 본문에서 무시되므로 런타임에 심는 스크립트를 함께 넣는다.
특히 viewport 가 없으면 폰에서 데스크톱 폭으로 렌더된다.

### GitHub Pages (홈 화면 앱)

`node build-pwa.js` 는 `dist/planner.html` 에 manifest·아이콘·서비스 워커를
붙여 `dist/pwa/` 를 만든다. 아이콘은 `icon.js` 가 그려서 PNG 로 인코딩한다
(의존성을 늘리지 않으려고 `node:zlib` 만 쓴다).

`dist/pwa/` 를 `gh-pages` 브랜치 루트로 올리고 Settings → Pages 에서 그 브랜치를
고른다.

```
git subtree push --prefix dist/pwa origin gh-pages
```

**경로는 전부 상대 경로여야 한다.** Pages 는 `https://<계정>.github.io/<저장소>/`
처럼 하위 폴더로 서비스하므로, `/icon-192.png` 같은 절대 경로는 계정 최상위를
찾아가서 전부 404 가 된다.

`sw.js` 에는 빌드 내용의 해시가 상수로 박힌다. 이 파일이 한 바이트도 안 바뀌면
브라우저가 업데이트로 보지 않아 `install` 이 돌지 않는다. 시각이 아니라 해시인
이유는, 시각이면 고친 게 없는 날 배포해도 폰이 앱을 통째로 다시 받기 때문이다.

**캐시 이름은 빌드마다 바꾸지 않는다.** 바꾸면 물러나는 워커가 뒤늦게 끝낸
백그라운드 쓰기가 (`caches.open` 은 없으면 만든다) 새 워커가 방금 지운 옛 캐시를
되살려서, 죽은 캐시가 폰에 쌓인다.
