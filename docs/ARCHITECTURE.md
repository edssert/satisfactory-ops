---
title: 시스템 아키텍처
aliases:
  - ARCHITECTURE
tags:
  - satisfactory-ops
  - architecture
status: active
updated: 2026-08-21
traceability: "[[PRODUCT-SPEC]]"
---

# ARCHITECTURE — satisfactory-ops

| | |
|---|---|
| 문서 버전 | 1.0 |
| 갱신일 | 2026-08-19 |
| 근거 결정 | ADR-0009(프론트엔드) · 0010(백엔드 없음) · 0011(상태) · 0012(데이터) · 0013(솔버) · 0018(타이포) |

이 문서는 **구조**를 설명한다. 왜 그렇게 정했는지는 각 ADR에 있다.

---

## 1. 한 장 요약

```
게임 설치본 Docs/{en-US,ko}.json          ← 정본 (사람이 만지지 않음)
        │  scripts/build-data.mjs                [1단] 정규화 + 새니티 게이트 13건
        ▼
src/data/{,ko/}*.json                     ← 원본 정규화 (커밋됨)
        │  scripts/build-app-data.mjs            [2단] 조인 + 최소 필드 + 역인덱스 + 검증 18건
        ▼  + src/data/curated/*.json (수기 콘텐츠, 클래스명으로만 참조)
src/data/app/*.json                       ← 앱 페이로드 (커밋됨)
        │  astro build                           [3단] 빌드타임 렌더
        ▼
dist/                                     ← 정적 HTML + 아일랜드 JS + 서비스워커
        │  GitHub Actions
        ▼
https://edssert.github.io/satisfactory-ops/
```

**핵심 불변식**: 화면에 보이는 게임 수치는 전부 이 파이프라인을 통과한다.
마크업에 사람이 타이핑한 게임 수치가 **0개**여야 한다.

---

## 2. 디렉터리

```
satisfactory-ops/
├─ astro.config.mjs        base=/satisfactory-ops, static, Preact, SW 통합
├─ .nvmrc                  Node 22 고정
├─ scripts/
│  ├─ build-data.mjs       [1단] 게임 원본 → 정규화 JSON. 의존성 0
│  ├─ build-app-data.mjs   [2단] 정규화 + 로케일 + 큐레이션 → 앱 페이로드 + 역인덱스
│  └─ sw-integration.mjs   빌드 산출물 목록으로 서비스워커 생성 (Workbox 미사용)
├─ src/
│  ├─ data/
│  │  ├─ *.json            [1단] 산출 (en-US)
│  │  ├─ ko/*.json         [1단] 산출 (공식 한국어 표시명, ADR-0017)
│  │  ├─ app/*.json        [2단] 산출 — 페이지가 import하는 것은 여기뿐
│  │  ├─ curated/*.json    수기 콘텐츠. 게임 객체는 클래스명으로만 참조
│  │  ├─ glossary.json     용어집 (게임 원본에 없는 학습 레이어)
│  │  └─ resource-nodes.json  노드 좌표 (ADR-0015, MIT)
│  ├─ lib/                 순수 로직. DOM을 모른다
│  │  ├─ rational.ts       유리수 산술 (BigInt)
│  │  ├─ solver.ts         생산 체인 해결 + 순환 거부 (ADR-0013)
│  │  ├─ gamedata.ts       데이터 접근 계층 (빌드타임 전용)
│  │  └─ types.ts          app/*.json 의 타입
│  ├─ state/               사용자 데이터. 브라우저에서만 산다
│  │  ├─ persist.ts        localStorage · 스키마 버전 · 마이그레이션 사다리
│  │  └─ progress.ts       signals 스토어 + 파생값(현재 티어·다음 할 일)
│  ├─ components/          Preact 아일랜드 (상태를 소유하는 최소 단위)
│  ├─ layouts/Base.astro   헤더·푸터·테마·SW 등록·업데이트 토스트
│  ├─ pages/               라우트 = 파일
│  ├─ styles/              tokens.css(브리프 정본) · base.css · 컴포넌트별 CSS
│  └─ fonts/               IBM Plex Mono 라틴 서브셋 (자체 호스팅, ADR-0018)
├─ public/                 그대로 복사되는 자산 (맵·아이콘·매니페스트·폰트 라이선스)
├─ tests/solver.test.ts    골든 테스트 (node --test, 의존성 0)
├─ legacy/                 이식 전 단일 HTML (배포되지 않음)
└─ docs/                   PRD·FRD·TRD·DESIGN-BRIEF·adr/·research/
```

---

## 3. 모듈 경계 (세 줄 규칙)

1. **`lib/`는 DOM을 모른다.** 빌드타임(Node)과 브라우저(아일랜드)에서 같은 코드가 돈다.
   그래서 랜딩 히어로의 계산과 `/calc/`의 계산이 **같은 솔버**다.
2. **`state/`는 게임 데이터를 모른다.** 사용자가 체크한 마일스톤 id 문자열만 다룬다.
   게임 데이터가 갱신돼도 사용자 데이터가 깨지지 않는 이유다 (TRD 4.1).
3. **`pages/`만 `lib/gamedata.ts`를 import한다.** 아일랜드는 데이터를 직접 읽지 않고
   페이지가 만들어 준 **서브셋을 props로** 받는다. 이것이 브라우저 페이로드를 통제하는 유일한 장치다.

### 아일랜드 경계 규칙

> **상태를 소유하는 최소 단위만 아일랜드로 만든다.**

페이지 전체를 아일랜드로 만들면 이 아키텍처의 이점이 그대로 증발한다(ADR-0009 리스크 9).

| 화면 | 정적 HTML | 아일랜드 |
|---|---|---|
| 랜딩 | 8개 섹션 전부 | `QuickCalc` (히어로 계산 위젯) |
| 마일스톤 | 페이지 골격 | `MilestoneChecklist` (SSR 후 하이드레이션 — JS 없어도 목록은 읽힌다) |
| 시작 가이드 | 허브 표·티어1 계획·본문 | `StartPath`(설정·분기) · `SiteMap`(맵 팬줌·노드 계획) |
| 계산기 | 페이지 골격 | `ProductionCalc` |
| 용어집 · 레퍼런스 | 전부 | **없음 (JS 0KB)** |

---

## 4. 데이터 흐름

### 게임 데이터 (읽기 전용)

빌드타임에만 흐른다. 런타임 fetch가 **없다** — 아일랜드가 쓰는 데이터는 HTML 안에 props로 직렬화된다.

| 화면 | 브라우저로 가는 데이터 |
|---|---|
| 랜딩 | 히어로 목표 6종에서 도달 가능한 레시피 서브셋 (~20개) |
| 계산기 | 기계에서 도는 레시피 291개(대체 포함) — 이 페이지에서만 |
| 시작 가이드 | 노드 좌표 626개 + 부지 6곳 |
| 용어집·레퍼런스 | 없음 |

### 사용자 데이터 (읽기·쓰기)

`localStorage['sfops.v1']` 한 키. 최상위 `schemaVersion` + 마이그레이션 사다리.
저장하는 것은 **사용자가 입력한 사실**뿐이고, 현재 티어·다음 할 일·완료율은 전부 파생값이다.

---

## 5. 빌드와 배포

| 단계 | 명령 | 실패 조건 |
|---|---|---|
| 게임 데이터 재생성 | `npm run data` | 새니티 13건 중 1건이라도 실패 → 파일 미생성, exit 2 |
| 앱 데이터 최신성 | `npm run data:check` | 산출물이 낡음 → exit 3 |
| 단위 테스트 | `npm test` | 골든 값 불일치 |
| 타입 검사 | `npx astro check` | 타입 오류 |
| 빌드 | `npm run build` | 데이터 참조 깨짐 → `gamedata.must()`가 던져 빌드 실패 |

CI(`.github/workflows/deploy.yml`)가 이 순서를 그대로 돌리고 `dist/`를 Pages에 올린다.
**게임 설치본이 없는 CI에서는 1단을 돌리지 않는다** — 커밋된 산출물을 신뢰한다(ADR-0008 완화책).

### 오프라인

`scripts/sw-integration.mjs`가 빌드 산출물 목록으로 서비스워커를 생성한다.
전량 프리캐시(약 1.35MB / 54파일), 캐시 우선, 네비게이션은 캐시된 셸로 폴백.
새 버전은 자동 적용하지 않고 토스트로 알린다(`arch-offline.md` §5).

---

## 6. 이 구조가 막는 것

| 과거 사고 | 지금 막는 장치 |
|---|---|
| `de36c39` JS 오류로 화면 전체 백지 | 페이지가 정적 HTML. 아일랜드가 죽어도 본문은 읽힌다 |
| `bd981f4` 손으로 적은 벨트 수치가 데이터와 불일치 | 수치는 빌드타임 계산. 마크업에 숫자를 쓰지 않는다 |
| `2b5cdad` 같은 값을 두 곳에 타이핑해 불일치 | 단일 계산 결과를 표·문장이 공유한다 |
| 용어집의 죽은 링크 | 상호참조 검증 실패 → 빌드가 죽는다 |
| 철광석 60/분이 채굴기 2대로 표시 | 유리수 산술 + 엡실론 올림 + 골든 테스트 |

---

## 6.5 도면을 눈으로 검증하는 루프

도면 기능에서 **겹침·잘림을 보지 못한 채 세 번 배포했다.** 테스트는 좌표(기하)를 검사할 수 있지만
"글자가 블록 밖으로 새는가"는 못 잡는다. 그래서 렌더 루프를 만들었다.

```bash
npm run render     # astro build 후 dist/plan-preview.png 생성
```

`scripts/render-plan.mjs`가 빌드된 페이지에서 도면 SVG를 꺼내 `@resvg/resvg-js`로 PNG를 만든다.
CSS 커스텀 프로퍼티는 `tokens.css`의 라이트 값으로 치환한다(resvg는 `var()`를 모른다).

**도면을 바꿨으면 이 PNG를 열어 확인한 뒤 배포한다.** 이 루프로 실제로 잡은 것:
세로 라벨 잘림("분배기" → "배기"), 기계 블록 밖으로 새는 유량 텍스트, 잘린 입출력 알약,
마지막 머저부터만 그려져 끊겨 보이던 스파인 벨트.

기하 문제는 `validateGeometry`(layout) · `validateFloorPlan`(floorplan)이 테스트에서 잡는다.
둘은 역할이 다르다 — 좌표는 테스트, 픽셀은 렌더 확인.

---

## 7. 아직 없는 것

- F3 공장 성장 단계도 (SVG를 데이터에서 생성하는 방식으로 다시 그려야 한다 — `legacy/README.md`)
- F7 대체 레시피 추천 · F8 하드드라이브 추적 · F9 공장 상태 · F10 세이브 파서
- 순환 레시피 정확해(LP) — v1은 거부한다 (ADR-0013)
- 시작 부지 6곳 서술의 1차 출처 (현재 `unsourced`로 표기 중)
