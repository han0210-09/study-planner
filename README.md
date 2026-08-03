# 스터디 플래너

종이 스터디 플래너를 옮긴 모바일 웹앱. 월간 달력에서 날짜를 눌러 하루 계획(To-Do + 05:00~익일 02:00 타임테이블)을 관리한다.

## 사용법

- **개발 서버**: `node serve.js` → http://localhost:8080
- **테스트**: `node --test`
- **빌드**: `node build.js` → `dist/planner.html` (단일 HTML, 외부 요청 없음)

## 폰에서 쓰기

`dist/planner.html`을 Artifact로 퍼블리시하면 나오는 URL을 폰 브라우저로 열고 "홈 화면에 추가"한다.

## 데이터

이 기기의 브라우저 저장소(`localStorage`, 키 `studyPlanner.v1`)에만 저장된다. 기기 간 자동 동기화는 없다.
**기기를 바꾸기 전에 설정 → JSON 내보내기로 백업할 것.**

## 문서

- 설계: `docs/superpowers/specs/2026-08-02-study-planner-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-02-study-planner.md`

## 배포

`node build-artifact.js` 는 `dist/planner.html` 에서 문서 골격을 벗겨
`dist/planner-artifact.html` 을 만든다. Artifact 는 올린 파일을 자기 문서 안에
감싸기 때문에, 완전한 HTML 문서를 그대로 올리면 태그가 중첩되어 깨진다.

`<head>` 의 meta 는 본문에서 무시되므로 런타임에 심는 스크립트를 함께 넣는다.
특히 viewport 가 없으면 폰에서 데스크톱 폭으로 렌더된다.
