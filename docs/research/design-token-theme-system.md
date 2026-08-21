---
title: 디자인 토큰과 두 테마 검증
tags:
  - research/design
  - accessibility
status: applied
updated: 2026-08-21
applies-to: UI-06
---

# 디자인 토큰과 두 테마 검증

## 조사 질문

1. 토큰을 어떤 계층으로 나눠야 소비처와 테마가 갈라지지 않는가?
2. 라이트·다크를 지원한다고 말하려면 무엇을 자동 검증해야 하는가?
3. 지도·게임 탑뷰처럼 사진 위에 놓이는 표시색은 일반 테마 역할과 어떻게 분리하는가?

## 1차 근거

- [DTCG Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/):
  디자인 결정을 사람이 읽을 수 있는 이름/값으로 표현하고, 그룹과 참조로 도구 사이 공통 어휘를 만든다.
- [WCAG 2.2 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum):
  일반 텍스트는 4.5:1, 큰 텍스트는 3:1이 최소다.
- [WCAG 2.2 1.4.6 Contrast (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced):
  핵심 본문은 7:1을 목표로 할 수 있으며 저시력 사용자의 대비 손실을 보완한다.
- [WCAG 2.2 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast):
  컨트롤·상태·그래픽의 의미 있는 경계는 인접색과 3:1이 필요하다.
- [WCAG 2.2 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color):
  색은 쓸 수 있지만 의미 전달의 유일한 수단이어서는 안 된다.

## 적용 결정

### 토큰 구조

`raw palette → semantic role → migration alias`의 세 층을 채택한다. 컴포넌트는 오렌지·회색 같은
물리색이 아니라 `action`, `status-danger`, `diagram-structure`처럼 사용 목적을 참조한다.
원시 색은 `src/styles/tokens.css` 밖으로 나갈 수 없다.

지도는 예외가 아니라 별도 역할군이다. 지형 사진은 테마와 함께 바뀌지 않으므로 마커 외곽·글자판은
`--map-*`, 노드·수집품 분류는 `--node-*`와 `--collectible-*`에서 고정 대비를 갖는다.

### 두 테마

- 다크: 게임과 오갈 때 눈부심을 줄이는 현장 제어실.
- 라이트: 표·문서·도면을 오래 읽는 정밀 작업지.
- 기본값은 다크, 사용자 선택만 로컬에 지속한다.
- `--text-*`, `--border-*`, 행동·상태 역할을 라이트에서 명시적으로 다시 정의한다.

### 자동 게이트

`scripts/check-design-tokens.mjs`:

- 토큰 파일 밖 hex/rgb/hsl/oklab/oklch 리터럴 0건
- 모든 `var(--*)` 참조가 저장소 안에서 선언됨
- 라이트 테마 핵심 의미 역할 19종 누락 0건
- `DESIGN-BRIEF`의 서체·테마·정본 문구가 배포 계약과 일치

`scripts/verify-theme.mjs`:

- 실제 Chromium에서 다크 → 라이트 전환
- `localStorage` 저장과 새로고침 복원
- 양 테마 핵심 텍스트 4.5:1, 핵심 본문 7:1, 의미 경계 3:1
- 런타임 오류와 404 없음

## 감사에서 발견해 고친 결함

- `map.css`, `ResourceMap.tsx`, 지도 페이지에 원시 색이 예외로 남아 있었다.
- `--shadow-2`, `--status-success`, `--s14` 참조가 토큰 정의와 어긋났다.
- 다크의 `border-strong`과 라이트의 의미 경계가 3:1에 못 미쳤다.
- 라이트 성공·위험·경고색이 흰 패널 위 작은 글자 4.5:1에 못 미쳤다.
- 문서는 다크 단일 테마·다른 서체를 적고 있었지만 실제 코드는 두 테마와 Wanted Sans/Pretendard/
  JetBrains Mono를 배포하고 있었다.

## 한계

자동 대비 검사는 역할 조합을 보장하지만 모든 사진 픽셀 위의 텍스트를 증명하지는 않는다. 사진 위 표시는
고정 반투명 판을 사용하고, 공개 화면은 다크·라이트 각각 실제 스크린샷을 눈으로 확인한다.
