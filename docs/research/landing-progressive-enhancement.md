---
title: 랜딩 점진 향상과 축소 모션 검증
aliases:
  - landing-progressive-enhancement
tags:
  - satisfactory-ops
  - research/frontend
  - accessibility/motion
status: verified
updated: 2026-08-21
confidence: verified
---

# 랜딩 점진 향상과 축소 모션 검증

## 제품 계약

랜딩의 문장·링크·게임 데이터 집계는 Astro가 HTML로 완성한다. GSAP, ScrollTrigger, SplitText와
Lenis는 이미 존재하는 콘텐츠의 이동·고정·분할 표현만 향상하며 값이나 섹션의 존재 여부를 만들지 않는다.

## 구현

- 게임 설치본에서 생성한 품목·제작법·건물 집계는 화면 글자와 같은 `data-tick`을 갖는다.
- `gsap.matchMedia()`의 `reduce` 조건이 참이면 트윈과 ScrollTrigger를 만들지 않는다.
- 실행 중 운영체제 설정이 `reduce`로 바뀌면 matchMedia 컨텍스트가 기존 트윈·핀을 되돌린다.
- 랜딩은 Base의 Lenis 인스턴스에 `ScrollTrigger.update`를 직접 구독하고 `pagehide`에서 해제한다.
- 리본 CSS 애니메이션과 배경·레일 변형은 CSS 미디어 쿼리에서도 정지한다.

## 자동 검증

| 명령 | 확인 범위 |
|---|---|
| `npm run test:nojs` | 랜딩·가이드의 JS 비활성 글자 보존, `data-tick` 값 일치, 애니메이션 CSS 카운터 부재 |
| `npm run test:scroll` | reduce 최초 진입과 실행 중 전환에서 숨은 콘텐츠·transform·핀 스페이서가 0인지 확인 |
| `npm run check:coverage` | 빌드 HTML의 애니메이션 생성 숫자와 `data-tick` 불일치 방지 |

`scripts/shoot.mjs`의 `--reduce`와 `--nojs` 옵션은 같은 상태를 사람이 직접 열어 보는 시각 증거를 만든다.

## 출처

- [GSAP 공식 `gsap.matchMedia()` 문서](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/)
- [GSAP 공식 ScrollTrigger 문서](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [Lenis 공식 GSAP ScrollTrigger 연동](https://github.com/darkroomengineering/lenis/blob/main/README.md#gsap-scrolltrigger)
