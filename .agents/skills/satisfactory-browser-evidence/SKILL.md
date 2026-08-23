---
name: satisfactory-browser-evidence
description: Produce browser evidence for Satisfactory Ops UI changes, including responsive overflow checks, focused screenshots, no-JS semantics, console health, and visual inspection. Use after Astro/Preact/CSS changes or before claiming a rendered interface is correct.
license: MIT
---

# Satisfactory 브라우저 증거

코드·타입·빌드 성공은 렌더 품질의 증거가 아니다. 변경한 화면을 실제 브라우저에서 열고 생성된 PNG를 직접 확인한다.

## 실행 모드

먼저 `npm run build`를 실행한다. 경로는 앞 슬래시 없이 주며 첫 화면은 빈 문자열이다.

- 반응형 눌림·넘침·잘림: `node .agents/skills/satisfactory-browser-evidence/scripts/squeeze.mjs <경로>`
- 변경 조각 확대: `node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs <경로> '<선택자>' <출력.png>`
- JS 비활성 의미: `node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs <경로>`
- 전체 화면: `node scripts/shoot.mjs <경로> <출력.png> --full`

## 판정

- 변경 지점이 캡처 안에 실제로 존재한다.
- 390px에서 가로 스크롤·한 글자 폭 압축·클리핑이 없다.
- 값은 HTML에 존재하며 CSS 카운터나 JS 성공에만 의존하지 않는다.
- 콘솔 오류·페이지 오류·404가 없다.
- 색만으로 상태를 구분하지 않는다.
- PNG를 실제로 열어 의도한 변화와 새 결함 부재를 한 문장으로 기록한다.

복잡한 편집 작업공간은 JS를 허용하지만 초기 HTML에 목적, 로딩·오류 상태, 데이터 출처와 진입점을 남긴다. 자동 검사는 시각 승인을 대신하지 않으며, 반복 결함은 가능한 경우 데이터·커버리지·레이아웃 불변식으로 승격한다.
