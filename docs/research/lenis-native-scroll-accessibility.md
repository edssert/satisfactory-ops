---
title: Lenis 네이티브 스크롤 접근성 검증
aliases:
  - lenis-native-scroll-accessibility
tags:
  - satisfactory-ops
  - research/frontend
  - accessibility/motion
status: verified
updated: 2026-08-21
source: https://github.com/darkroomengineering/lenis/blob/main/README.md
confidence: verified
---

# Lenis 네이티브 스크롤 접근성 검증

## 결론

Lenis 1.3.26은 별도 가상 스크롤 좌표계를 만드는 구현이 아니라 브라우저의 네이티브 스크롤 위에서
휠 입력을 보간한다. 공식 문서는 `position: sticky`, 앵커, 접근성이 계속 동작한다고 명시한다. 따라서
이 앱에서의 채택 기준은 라이브러리 이름 자체가 아니라 **네이티브 입력·URL·사용자 설정을 보존하는
옵션과 실브라우저 회귀가 있는가**다.

## 적용 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 키보드 | 브라우저 기본 PageDown/Home/End를 가로채지 않는다 | Lenis는 네이티브 스크롤 위에서 동작한다 |
| 터치 | `syncTouch: false` | 공식 문서가 iOS 16 미만의 불안정성을 경고한다 |
| 축소 모션 | 인스턴스를 제거하지 않고 `respectReducedMotion: true` | 보간을 1:1로 바꾸고 프로그램 이동을 즉시 완료하면서 동기화 계층은 유지한다. 실행 중 설정 변경도 감지한다 |
| 해시 링크 | `anchors: true` + CSS `scroll-padding-top` | Lenis가 `scroll-padding`을 직접 읽으므로 JS 오프셋을 중복하지 않는다 |
| 내부 이동 | `stopInertiaOnNavigate: true` | 다른 내부 문서로 넘어갈 때 남은 관성을 초기화한다 |
| 중첩 스크롤 | `data-lenis-prevent` | `allowNestedScroll`의 매 이벤트 DOM 탐색 비용을 피하는 공식 대안이다 |

기존 `anchors: { offset: -96 }`은 `html { scroll-padding-top: 96px }`와 함께 적용되어 목차 대상을
헤더 아래 **192px**로 이중 이동시켰다. 오프셋 정본을 CSS 한 곳으로 줄였다.

## 실행 증거

`npm run test:scroll`은 빌드된 `dist/`를 Chromium으로 열어 다음을 검증한다.

1. PageDown 키보드 스크롤
2. 목차 해시와 96px 고정 헤더 정렬
3. 페이지를 다시 싣지 않은 `prefers-reduced-motion` 전환과 즉시 이동
4. 다른 라우트에서 뒤로 왔을 때 스크롤 위치 복원
5. `reduce` 최초 진입과 직접 해시 URL
6. 콘솔 오류와 런타임 404 부재

## 한계

- CSS Scroll Snap은 Lenis 코어와 함께 쓰지 않는다. 필요하면 공식 `lenis/snap`을 별도 검토한다.
- Safari 저전력 모드의 프레임 제한과 iframe 경계는 라이브러리가 해소하지 못한다.
- 이 검증은 Chromium 자동 회귀다. 릴리스 전 Safari·Firefox 수동 스모크 테스트는 별도 품질 게이트다.

## 출처

- [Lenis 공식 README — Features, Settings, Reduced motion, Limitations](https://github.com/darkroomengineering/lenis/blob/main/README.md)
- [Lenis 1.3.26 패키지](https://www.npmjs.com/package/lenis/v/1.3.26)
