# 그래프 엔지니어링 기술·하네스 재검증

## 질문

설치된 Satisfactory의 패키지·Blueprint·컴포넌트·메시·재질·텍스처와 앱의 생산·설계 데이터를
검색·조립·검증 가능한 그래프로 연결할 가치가 있는가. 있다면 어떤 라이브러리와 하네스를 제품 정본을
훼손하지 않고 도입해야 하는가.

## 결론

도입 가치가 높다. 단 하나의 범용 그래프로 합치지 않고 다음 projection을 분리한다.

- 설치본 증거 그래프: 패키지, export, CDO 구성품, 메시, 재질, 텍스처, 앱 클래스, 장면 레시피, 승인 자산,
  런타임 파일 사이의 출처·드리프트 경로
- 고체·유체 물류: 실제 포트 ID를 끝점으로 갖는 방향 다중 그래프
- 전력: 양방향 연결 그래프
- 해금·선행 조건: DAG
- 공간 기하: 그래프에 넣지 않고 기존 미터 좌표·경로·충돌 모델을 정본으로 유지

`FactoryPlan`과 생성 게임 데이터가 정본이다. 그래프는 검색·검증·진단을 위해 매번 만드는 읽기
projection이며 자동 공간 배치의 근거로 사용하지 않는다.

## 원본 저장소·능력 평가

| 후보 | 확인한 능력 | 파일럿·위험 | 판정 |
|---|---|---|---|
| [fast-check](https://github.com/dubzzz/fast-check) 4.9.0 | 고정 seed 속성·모델 기반 테스트, entity graph 생성 | 현 `node:test`와 결합해 임의 DAG 250건, 10,000 노드 직렬 그래프 통과 | exact dev 의존성 채택 |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 18.2.0 | TS 의존 그래프, 순환·경계·미해결 import 규칙 | MIT `LICENSE` 포함, 현재 68개 모듈·62개 의존성에서 위반 0 | exact dev 의존성 채택 |
| [Graphology](https://github.com/graphology/graphology) 0.26.0 + [graphology-dag](https://github.com/graphology/graphology-dag) 0.4.1 | 방향·다중 그래프, 반복형 Kahn 위상정렬 | 1천·5천·1만 노드 통과, 1만 노드 약 3.17ms. 번들·보조 의존성과 DAG 패키지 갱신 시점은 부담 | adapter 뒤 조건부 후보 |
| [graphlib](https://github.com/dagrejs/graphlib) 4.0.5 | 소형 그래프 알고리즘·JSON | DAG 속성 250건 통과, 재귀 위상정렬은 5천 노드 직렬 그래프에서 stack overflow | 소형 oracle만 참고 |
| [@statelyai/graph](https://github.com/statelyai/graph) 2.3.0 | 포트·계층·mixed edge·SCC·diff/patch·GraphML | 기술 적합성은 높지만 2026-08-22 확인 시 저장소와 npm tarball에 `LICENSE`/`COPYING`이 없고 GitHub API license도 null | 라이선스 본문 추가 전 통합 금지 |
| [agent-graph](https://github.com/context4ai/agent-graph) 0.2.6 | fact·route·gate·recovery·test 관계 | 젊은 Bun 중심 도구라 런타임 도입 대신 관계 어휘만 수집 | 참고 |
| [graph-engineering skill](https://github.com/douinc/agent-skills) | 증거 기반 지식 맵과 모순·공백 탐색 | DB 없이도 적용 가능 | 프로젝트 스킬 원칙에 흡수 |
| [Harness Engineering](https://github.com/Intense-Visions/harness-engineering) | 광범위 작업·텔레메트리 하네스 | 전역 기본값 변경과 과도한 범위가 이 저장소의 로컬·검증 우선 규칙과 충돌 | 미도입 |

## 설치본 파일럿

`.cache/game-asset-index/factory-assets.ndjson`, 자동 장면 계약, 생성 앱 데이터, 탑뷰 장면 레시피,
탑뷰 매니페스트와 런타임 필터를 `.cache/game-graph.db`로 투영했다.

- 노드 55,753개, 간선 95,236개
- 패키지 6,706개, export 35,140개, 구성품 3,809개, 재질 901개, 원본 참조 54,868개를 연결
- `search`, `building`, `trace`, `path` 질의 제공
- 입력 파일 SHA-256 드리프트, dangling 관계, 장면 구성품 원본, 승인 상태 4종, Anders 런타임 노출을 검사
- `Build_SmelterMk1_C`에서 설치 패키지·CDO 구성품·현재 장면·자체 자산·런타임 파일까지 증거 경로 재현

이 DB는 커밋하지 않는 파생 캐시다. 입력 해시가 바뀌면 `check`가 실패하며, 게임 설치본·생성 앱 데이터·
큐레이션 매니페스트를 대신하는 정본으로 승격하지 않는다.

## 제품 그래프 파일럿

`src/lib/graph-core.ts`에 포트 끝점·명시적 edge ID·입출력 인덱스를 갖는 반복형 방향 다중 그래프를 두고,
`src/domain/factory/graph.ts`에서 `FactoryPlan`의 고체·유체 운송만 읽기 projection한다.

- 중복 node/edge, dangling 끝점, 포트 존재·방향·매질, 동일 실제 포트의 복수 연결을 검출
- 재귀 없는 Kahn 위상정렬, 경로 탐색, Kosaraju SCC 제공
- 10,000 노드 직렬선과 전체 순환을 stack overflow 없이 판별
- 기존 공간 경로·토대·좌표·충돌은 그래프 코어로 옮기지 않음

다음 적용은 기존 설계판 상태를 한 번에 교체하는 작업이 아니다. 읽기 projection 결과를 기존
`validateFactoryPlan`과 differential test하고, 포트별 품목 결합·유량 집계·순환 생산 해석을 순서대로
통합한다.

## 재평가 조건

- Stately 저장소와 npm 배포물에 보존 가능한 MIT 라이선스 본문이 추가됨
- 공장 계획의 실제 규모에서 로컬 코어가 병목이 되거나 GraphML 교환 요구가 생김
- 전력·해금 projection이 현재 타입으로 표현되지 않음
- 게임 패치 후 설치본 그래프 입력 해시 또는 장면 계약이 드리프트함
