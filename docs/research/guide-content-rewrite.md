---
title: 가이드 콘텐츠 전면 재작성 근거
date: 2026-08-21
status: verified
tags:
  - research/guide
  - domain/progression
  - validation/external-claim
aliases:
  - UI-07 근거
---

# 가이드 콘텐츠 전면 재작성 근거

[[PRODUCT-SPEC#UI-07 가이드 콘텐츠|UI-07]]의 정본 조사 기록이다. 기존 `OPERATION BRIEF`식 명령문과 숫자 단정을 폐기하고, 각 단계를 **완료 상태 → 시공 → 현장 검증 → 확장 예약**으로 다시 구성했다. 게임 이름·해금 비용·제작법 수치는 `src/data/app/*.json`에서 렌더링하며 설명문에 복제하지 않는다.

> [!success] 적용 판정
> `src/data/curated/spine.json`의 설명문에는 게임 수치 리터럴이 없다. 기계 대수·클럭·재료 유량은 빌드 시점에 `defaultRecipeOf()`와 게임 추출 데이터로 계산한다.

## 주장별 검증 기록

| 주장 | 정본·1차 근거 | 독립 교차검증 | 반례·경계 | 앱의 표현 |
|---|---|---|---|---|
| 마일스톤의 이름·비용·해금은 추출 데이터로 정할 수 있다 | `src/data/app/milestones.json`, `hub.json` | `src/data/app/save-unlocks.json`과 클래스명 매핑 | 가이드가 설명하는 마일스톤은 티어 전체의 부분집합이다 | 티어 완료 판정은 가이드 목록이 아니라 실제 티어 전체를 사용한다 |
| 목표 생산량으로 기본 제작법의 기계·입력 유량을 계산할 수 있다 | `src/data/app/recipes.json`, `buildings.json` | `npm test`의 제작법·유리수 회귀값 | 대체 제작법·클럭 변경 시 결과가 달라진다 | 표는 기본 제작법 기준임을 밝히고 도면판에서 설정을 바꾼다 |
| 하드 드라이브는 부족해서 전체 대체 제작법을 못 얻는 자원이 아니다 | [공식 위키 Hard Drive](https://satisfactory.wiki.gg/wiki/Hard_Drive) | 추락 지점 118, 총 사용 111이라는 같은 문서의 용도 합계 | 일부 드라이브는 분석이 아니라 MAM 연구에 직접 들어간다 | “전부는 못 딴다”를 삭제하고 연구 요구량을 먼저 확인하게 한다 |
| S.A.M. 연구는 티어 7 전용이 아니다 | [공식 위키 MAM](https://satisfactory.wiki.gg/wiki/MAM), [S.A.M.](https://satisfactory.wiki.gg/wiki/S.A.M._Ore) | 게임의 MAM 해금 및 외계 기술 스키매틱 | 연구 트리는 허브 티어와 독립적이지만 뒤쪽 노드는 후반 부품을 요구한다 | 시작 지역을 S.A.M. 하나로 단정하지 않고 실제 주변 노드만 표시한다 |
| 알루미늄 환류에는 하나의 절대적인 배관 순서만 있는 것이 아니다 | [FICSIT 배관 매뉴얼](https://satisfactory.wiki.gg/images/3/39/Pipeline_Manual.pdf) | `recipes.json`의 유체 부산물·입력량 | 새 물이 환류를 밀어내면 출력 배관이 차서 멈출 수 있다 | 전용 환류 설비 또는 가변 입력 우선 접합을 선택하고 정상상태를 시험한다 |
| 시작 지역 평가는 지형과 접근성을 포함해야 한다 | [공식 위키 World](https://satisfactory.wiki.gg/wiki/World) | `resource-nodes.json`의 격자별 노드 수·순도 | 격자 수는 실제 이동 거리·동굴·고도·위험도를 표현하지 못한다 | 별점과 계산 노드를 병기하고, 노드 수만으로 최적지를 선언하지 않는다 |

## 크기·단위 점검

- 목표 유량은 `분당` 단위만 사용하고 레시피의 `products[].perMinute`와 같은 단위에서 나눈다.
- 기계 대수는 `ceil(exact - 1e-9)`, 다운클럭은 `exact / count`로 계산해 부동소수점 경계에서 한 대가 늘어나는 오류를 막는다.
- 운송 검증은 품목 벨트의 `items/min`과 유체 파이프의 `m³/min`을 섞지 않는다. 자세한 모델은 [[DATA-MODEL]]과 [[ARCHITECTURE]]를 따른다.
- 시작 지역의 굵은 값은 선택 격자, 작은 값은 맞닿은 격자다. 이는 직선거리나 실제 보행 시간을 뜻하지 않는다.

## 회귀 잠금

`npm run check:guide`가 다음을 실패로 처리한다.

- `gateNote`, `goal`, `actions`, `leaveRoom` 같은 이전 스키마가 돌아옴
- 단계에 완료 상태·시공·현장 검증·확장 예약·근거·신뢰도가 빠짐
- 설명문에 숫자 리터럴을 넣어 게임 데이터와 중복함
- `OPERATION BRIEF`, `BUILD NOW`, `CAPACITY`, `RESERVE`, `GATE CONDITION` 문구를 다시 사용함
- 하드 드라이브 부족설 또는 S.A.M. 티어 7 전용설이 돌아옴

## 관련 노트

- [[PRODUCT-SPEC]]
- [[FRD]]
- [[DATA-MODEL]]
- [[DESIGN-BRIEF]]
- [[progression-route]]
- [[power-scale]]

