---
title: satisfactory-ops 프로젝트 허브
aliases:
  - 프로젝트 허브
  - 문서 홈
tags:
  - satisfactory-ops
  - project/hub
status: active
updated: 2026-08-21
---

# satisfactory-ops 프로젝트 허브

이 저장소 루트가 Obsidian 볼트다. 문서와 코드를 별도 복제하지 않는다. 제품 요구는
[[PRODUCT-SPEC]]이 단일 추적 정본이고, 기존 문서는 목적별 상세 정본이다.

## 지금 읽을 문서

| 목적 | 문서 |
|---|---|
| 사용자 요구와 구현·검증 상태 | [[PRODUCT-SPEC]] |
| 제품 목적과 범위 | [[PRD]] |
| 기능별 상세 요구 | [[FRD]] |
| 성능·보안·호환성 | [[TRD]] |
| 모듈과 데이터 흐름 | [[ARCHITECTURE]] |
| 데이터 스키마 | [[DATA-MODEL]] |
| 디자인 토큰과 시각 언어 | [[DESIGN-BRIEF]] |
| 다음 작업 인계 | [[NEXT-SESSION]] |

## 구현의 핵심

- 편집기: `src/components/ValidatedFactoryPlanner.tsx`
- 공장 도메인: `src/domain/factory/`
- 게임 기반 데이터: `src/data/app/`
- 수기 검증 데이터: `src/data/curated/`
- 랜딩: `src/pages/index.astro`, `src/styles/landing.css`
- 검증: `npm run verify`

> [!success] 2026-08-21 편집 상태 체크포인트
> 카탈로그 HTML 드래그앤드롭, 50단계 Undo/Redo(`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`),
> 운전 설정·수동 경로·층고의 JSON 무손실 왕복을 구현했다. 순수 상태 경계는
> `src/domain/factory/editor-state.ts`, 브라우저 조작 회귀는 `tests/planner-ui.test.ts`,
> 직렬화 회귀는 `tests/factory-domain.test.ts`가 맡는다.

> [!success] 2026-08-21 시공 도면 내보내기 체크포인트
> 현재 설계판의 실축 좌표와 게임 원본 탑뷰를 유지한 독립 SVG와 고해상도 PNG 내보내기를 구현했다.
> 내보낸 SVG는 외부 이미지 경로와 편집용 포트·선택 표시를 제거하고 자산을 데이터 URL로 내장한다.
> 토대·설비·물류·층고·품목/처리량 레이어는 화면과 결과물에 동일하게 반영된다. 도면 범위와
> 픽셀 예산은 `src/domain/factory/drawing-bounds.ts`, 브라우저 회귀는
> `tests/planner-ui.test.ts`, 기하 회귀는 `tests/factory-domain.test.ts`가 맡는다.

> [!success] 2026-08-21 물류 작도 체크포인트
> 컨베이어·파이프는 실제 직선/90도 곡선 자산으로 이어지고, 방향 표식과 높은 구간의 깊이 순서를 갖는다.
> 컨베이어 리프트는 게임 설치본의 Mk.1 메시를 정사영해 2.13×2.16m 경계로 교체했다. 0.5–56m 길이,
> 35° 경사, 4–48m 리프트, 경사 중 회전을 독립 오류로 검증한다. 기하 분해는
> `src/domain/factory/transport-geometry.ts`, 회귀는 `tests/factory-domain.test.ts`가 맡는다.

## 설계 결정

- [[0025-validated-factory-domain|ADR-0025 검증된 공장 도메인]]
- [[0026-repository-as-obsidian-vault|ADR-0026 저장소 자체를 Obsidian 볼트로 사용]]
- 전체 이력: `docs/adr/`

## 조사 축

- [[anders-topview-assets]]
- [[game-mesh-topviews]]
- [[conveyor-geometry]]
- [[factory-layout-engine-2026]]
- [[public-save-blueprint-corpus]]
- [[design-web-2026]]
- [[design-landing-craft]]

## 완료 판정

`PRODUCT-SPEC`의 P0 항목을 모두 충족하고 다음 순서가 통과해야 대형 업데이트 완료다.

1. 데이터 최신성·단위 테스트·타입·DB·빌드·커버리지: `npm run verify`
2. 편집기와 랜딩의 데스크톱·태블릿·모바일 실화면 검사
3. JS 비활성화 시 문서형 화면의 핵심 정보 보존
4. PNG/SVG 내보내기 결과를 직접 열어 축척·가독성·레이어를 판정
5. 검증된 묶음 커밋 후 `main` 푸시와 GitHub Pages 배포 확인
