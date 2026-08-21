# 게임 데이터·생산·세이브 연구

접근일은 2026-08-21이다. 이 문서는 R-01 게임 데이터, R-02 생산 최적화, R-07 세이브·블루프린트의
근거를 통합한다.

## 1. 검증 질문

1. 설치본 Docs와 한국어 로케일에서 어떤 필드를 정본으로 사용할 수 있는가.
2. 복수 목표, 부산물, 순환, 원료 제한, 벨트·파이프 용량을 어떤 수학 모델로 풀어야 하는가.
3. 기본·대체 제작법, 클럭, 파워 샤드, 소머슬룹의 게임 규칙을 어떻게 검증하는가.
4. 세이브와 블루프린트에서 기계·포트·연결·좌표를 어떤 버전 계약으로 읽는가.
5. 기존 배포 도구의 과업과 실패를 무엇으로 기준선 삼는가.

## 2. 로컬 게임 정본

개발 기기의 원본은 다음 설치본 파일이다.

```text
C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\en-US.json
C:\Program Files (x86)\Steam\steamapps\common\Satisfactory\CommunityResources\Docs\ko.json
```

두 파일은 UTF-16LE이며 빌드 파이프라인이 원본 해시, Steam 빌드 ID, 클래스 집합과 로케일 결합을 기록한다.
건물 하드·소프트 클리어런스, 제작법, 전력, 해금 정보는 필드 소유 native class를 확인한 뒤 사용한다.
화면 표시명은 `ko.json`에서 파생하고 사람이 다시 번역하지 않는다.

[Patch 1.2.2.2](https://satisfactory.wiki.gg/wiki/Patch_1.2.2.2)는 2026-06-02에 1.2가 PC와 콘솔의
Stable로 출시됐음을 기록한다. [Patch 1.2.0.0](https://satisfactory.wiki.gg/wiki/Patch_1.2.0.0)은 제작법
비용, 전력 소비, 우주 엘리베이터 비용 배수와 자원 노드 위치·순도 무작위화를 추가했다. 따라서 계산기와
지도는 “기본 게임 데이터 하나”만 가정할 수 없고, 세이브별 게임 모드·배수·월드 시드를 상태 계약에
포함해야 한다.

## 3. 실제 배포 제품 기준선

### 3.1 Satisfactory Tools

- 배포: [Satisfactory Tools](https://www.satisfactorytools.com/1.0/production)
- 원본 저장소: [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools)
- 2026-08-21 기준 529별, 131포크다.
- Docs 파일을 파싱해 데이터와 차이를 생성하며, 목표 생산·원료·제작법·기계 제한을 한 생산선에 저장한다.
- 직접 렌더 확인 결과 일반 문서 페이지 안의 패널형 계산기다. 기능 기준선으로 사용하되 고밀도 전체 화면
  작업공간의 시각 기준선으로 사용하지 않는다.

### 3.2 SCIM

- 배포: [Satisfactory Calculator Interactive Map](https://satisfactory-calculator.com/en/interactive-map)
- 저장소: [AnthorNet/SC-InteractiveMap](https://github.com/AnthorNet/SC-InteractiveMap)
- 2026-08-21 기준 211별, 52포크다.
- 지도 렌더, 세이브 해석·편집, 블루프린트와 생산 도구를 제공한다.
- 저장소는 교육 목적 열람만 허용하고 코드·데이터 재사용을 금지한다. 비용이나 라이선스를 핑계로 기능
  기준선을 낮추지 않으며, 기능과 과업을 독립 구현한다.
- 직접 렌더 확인 결과 광고·전역 내비게이션·페이지 안에 지도와 우측 레이어 패널이 배치된다.

### 3.3 Satisfactory Modeler

- 배포: [Steam Satisfactory Modeler](https://store.steampowered.com/app/3187030/Satisfactory_Modeler/)
- 2026-08-21 검색 결과 2,226개 평가 중 97% 긍정이다.
- 사용자가 기계를 수동 구성하고 제한을 지정하면 부품 흐름과 실제 사용 기계 수를 계산한다.
- `.sfmd` JSON 형식은 노드 좌표와 입력 연결을 저장한다. 형식과 과업은 상호운용 참고 대상이지만 원본
  구현과 게임 공간 좌표의 정확성은 별도 검증한다.

### 3.4 최근 배포 후보

- [Masterplanner](https://masterplanner.app/)는 2026년 공개된 브라우저 베타로, 로컬 저장·Export/Import와
  전체 화면 지도 기반 계획을 첫 화면에서 명시한다.
- [neXus Satisfactory Layout Tool](https://github.com/HandleLabs/nexus-satisfactory-layout-tool)은 Rust 코어,
  다층 캔버스, 벨트·파이프·철도·전력·생산 시뮬레이션을 표방한다. 2026-08-21 기준 4별이므로 성숙도는
  낮지만 기능 범위 때문에 의무 파일럿 목록에 둔다.
- 새 도구는 별 수가 낮아도 현재 게임 버전과 새로운 상호작용을 제공할 수 있으므로 별 수만으로 제외하지 않는다.

## 4. 생산 최적화 후보

### 4.1 수학 모델

생산망은 제작법별 가동률을 변수로 두고 아이템 보존, 목표 산출, 원료 상한, 설비·운송 용량을 제약으로
표현할 수 있다. 순환과 부산물이 있으면 단순 재귀 전개만으로는 전역적으로 일관된 해를 보장하지 못하므로
LP/MILP 후보를 비교한다. UI에 표시할 최종 수치는 게임의 분당 유량과 유리수 계약으로 다시 검증한다.

### 4.2 솔버

| 후보 | 현재 근거 | 평가 항목 |
|---|---|---|
| 자체 유리수 그래프 | 결정적 수치와 설명 가능성 | 순환·부산물·다중 목표의 완전성 |
| [HiGHS](https://github.com/ERGO-Code/HiGHS) | 1.8k별, 14k 이상 커밋, LP·MIP·QP | 브라우저 WASM, 결정성, 모델 크기, 해 검증 |
| [GLPK.js](https://github.com/jvail/glpk.js/) | 브라우저·Node용 GLPK WASM, 140별 | JSON 모델, Worker, GPL 조건, 수치 안정성 |
| [OR-Tools](https://developers.google.com/optimization) | LP·MIP·CP-SAT·흐름·라우팅 공식 제품 | 브라우저 배포 가능성, CP-SAT가 필요한 제약 범위 |

Google의 [Advanced LP Solving](https://developers.google.com/optimization/lp/lp_advanced)은 솔버 상태가
허용오차와 스케일에 따라 실제 최적·실현 가능성을 과장할 수 있음을 설명한다. 따라서 외부 솔버 결과를
그대로 표시하지 않고 유리수 보존식과 용량 제약으로 독립 검산한다.

## 5. 세이브·블루프린트 코퍼스 계약

표본마다 다음을 기록한다.

- 원 게시물·다운로드 URL, 작성자, 접근일
- 게임 버전·파일 형식 버전, SHA-256, 파일 크기
- 재배포·연구 사용 조건
- 포함된 설비 클래스와 포트·연결 표본 수
- 파서 버전과 성공·실패 결과
- 동일 기계의 로컬 좌표 분산과 이상치

현재 `machine-ports.json`의 `local-current-save`, `public-save-*`, `blueprint-*` 표기는 원 파일 해시와
사용 조건이 앱 정본에 연결되지 않아 `verified`를 입증하지 못한다. 코퍼스를 다시 구축하기 전에는 해당
필드를 후보로 취급한다.

## 6. 파서 후보

| 후보 | 현재 근거 | 필수 파일럿 |
|---|---|---|
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | TypeScript 4.1.2, U8~1.2, `.sav`·`.sbp`·`.sbpcfg` 읽기/쓰기, 브라우저 지원 표방 | 현재 Vite의 `stream/web` 외부화 경고 제거, Worker, 실제 1.2 코퍼스, 왕복 해시·구조 비교 |
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | Python 기준 구현, 1.2.0~1.2.2.1, 세이브·블루프린트 읽기/쓰기 | 브라우저용이 아니라 차등 검증 기준으로 사용 |
| [valentinps/satisfactorymap](https://github.com/valentinps/satisfactorymap) | Rust→WASM, 202커밋, 4별, 60만 객체 약 8초·기존 웹맵 대비 13배 주장과 재현 스크립트, Python 기준과 비트 단위 차등 검증 | 동일 공개 세이브에서 시간·메모리·필드 완전성·1.2.3 호환·Worker 통합 비교 |
| SatisfactorySaveNet 계열 | C# 파서와 유지 포크 | 필드 사전·버전 차이의 독립 교차 검증 |

현재 TypeScript 파서는 브라우저 빌드에서 `stream/web`이 외부화된다는 Vite 경고를 낸다. 빌드 성공을
브라우저 동작 증거로 간주하지 않고 실제 `.sav` 과업을 수행한다. Rust/WASM 후보는 별 수가 낮더라도
측정·차등 검증·대형 파일 성능 때문에 의무 파일럿 대상이다.

## 7. 검증 기술

[fast-check](https://github.com/dubzzz/fast-check)는 2026-08-21 기준 5.1k별의 TypeScript 속성 기반 테스트
도구다. 생산 보존, 회전 4회 항등, 직렬화 왕복, 경로 용량 같은 불변식을 무작위 입력으로 검증하는 후보로
평가한다. 예제 기반 골든 테스트를 대체하지 않고 보완한다.

## 8. 다음 조사

- Satisfactory Tools·SCIM·Modeler·최근 도구의 동일 생산 과업 비교
- HiGHS·GLPK.js·자체 그래프의 실제 게임 생산망 파일럿과 100점 평가
- 1.2 세이브·블루프린트 원본 코퍼스의 합법적 수집과 해시 색인
- 클럭·파워 샤드·소머슬룹의 설치본 필드와 인게임 표본 교차 검증
- 세이브별 비용 배수·월드 시드·노드 무작위화가 데이터·지도·생산 결과에 미치는 영향
