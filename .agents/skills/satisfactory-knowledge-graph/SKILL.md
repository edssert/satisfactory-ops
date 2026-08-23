---
name: satisfactory-knowledge-graph
description: Design and validate Satisfactory Ops graph projections across installation assets, generated game data, factory designs, and top-view evidence. Use for relationship, impact, path, provenance, or drift work; do not use for a local edit answerable by direct references.
---

# Satisfactory 지식 그래프

그래프는 설치본·생성 데이터·문서 정본을 대신하지 않고 질문별 투영으로 사용한다.

1. `satisfactory-ops-vault/PROJECT-HUB.md`에서 책임 정본을 찾고 필요한 최소 하위 그래프를 선택한다.
2. 노드·간선의 주장은 설치 패키지, 생성 데이터 경로, 코드 심벌, 테스트 또는 승인 영수증을 근거로 갖는다.
3. 상태를 `observed`, `inferred`, `proposed`, `unknown`으로 분리하고 사람 승인을 자동 추론하지 않는다.
4. 설치본 그래프는 `.cache/game-asset-index/`에서 재생성하고, 제품 그래프는 `src/data/app/*.json`과 도메인 코드에서 투영한다. 캐시와 생성물을 손으로 고치지 않는다.
5. 관계명·안정 ID·질의는 [설치본 파생 그래프 스키마](references/game-graph-schema.md)를 따른다.
6. 변경 후 `npm run game:graph:check`와 영향받은 도메인 검사를 실행한다.

완료 조건은 간선 양 끝의 존재, 역방향 추적 가능성, 레시피·설비·포트 참조 유효성, 장면→검증 렌더→승인 매니페스트→런타임 경로의 연속성이다.
