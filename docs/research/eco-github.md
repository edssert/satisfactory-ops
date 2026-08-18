# GitHub 오픈소스 생태계 조사 — Satisfactory 관련 프로젝트

조사일: 2026-08-19 (게임 버전 기준: Satisfactory U1.2.x)

방법: GitHub REST API(`api.github.com/repos/...`)로 스타/라이선스/최종 push 시각을 실측하고, 주요 저장소는 README와 핵심 소스 파일(솔버, 파서, 좌표 변환)을 직접 fetch해서 확인했다. 표의 "최근 커밋"은 `pushed_at` 기준 실측값이다.

---

## 1. 요약 표

| 저장소 | 카테고리 | ⭐ | 라이선스 | 최근 push | 상태 |
|---|---|---|---|---|---|
| [satisfactorymodding/SatisfactoryModLoader](https://github.com/satisfactorymodding/SatisfactoryModLoader) | 모드 프레임워크 | 342 | GPL-3.0 | 2026-08-12 | 활발 |
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | 세이브 파서(Python) | 39 | GPL-3.0 | 2026-08-15 | 활발, **1.2.0~1.2.2.1 명시 지원** |
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | 세이브/블루프린트 파서(TS) | 31 | MIT | 2026-07-26 | 활발, README에 "U1.2 ✅" 명시 |
| [AnthorNet/SC-InteractiveMap](https://github.com/AnthorNet/SC-InteractiveMap) | 인터랙티브 맵 | 211 | 라이선스 미명시 | 2026-07-23 | 활발 (satisfactory-calculator.com 백엔드) |
| [AnthorNet/SC-ProductionPlanner](https://github.com/AnthorNet/SC-ProductionPlanner) | 생산 플래너 | 51 | 라이선스 미명시 | 2024-10-23 | 정체(1.5년) |
| [Zistack/Satisfactory-Optimizer](https://github.com/Zistack/Satisfactory-Optimizer) | LP 솔버(Python) | 16 | **라이선스 없음** | 2026-03-19 | 유지보수 중 |
| [0xjc/SatisfactoryLP](https://github.com/0xjc/SatisfactoryLP) | MILP 솔버(Python) | 2 | MIT | 2026-07-18 | 활발, **가장 정교한 공개 solver** |
| [lunafoxfire/yet-another-factory-planner](https://github.com/lunafoxfire/yet-another-factory-planner) | 생산 플래너(웹) + LP 솔버(glpk.js) | 13 | MIT | 2023-07-15 | 정체(3년+), 1.0 이전 데이터 |
| [lunafoxfire/satisfactory-docs-parser](https://github.com/lunafoxfire/satisfactory-docs-parser) | Docs.json → JS 스키마 파서(npm) | 13 | MIT | 2024-10-08 | 정체(1.8년) |
| [elcheapogary/satisplanory](https://github.com/elcheapogary/satisplanory) | 생산 계산기(Java, 데스크톱) | 1 | EPL-2.0 | 2023-10-26 | 정체 |
| [TheoKanning/SatisfactoryOptimizer](https://github.com/TheoKanning/SatisfactoryOptimizer) | LP 레시피 최적화(Python) | 7 | MIT | 2021-05-10 | **오래됨(5년+), 참고용** |
| [Tjark-Kuehl/satisfactorymap](https://github.com/Tjark-Kuehl/satisfactorymap) | 리소스 노드 맵(Svelte+Leaflet) | 낮음 | 미확인 | 저조 | 좌표 변환 참고용 |
| [dmryabov/satisfactory-docs-exporter](https://github.com/dmryabov/satisfactory-docs-exporter) | Docs.json 대체 포맷 추출기(C#) | 0 | MIT | 2023-12-24 | 정체 |
| [marci07iq/factory-calculator](https://github.com/marci07iq/factory-calculator) | 생산 계산기 + LP 솔버 | 0 | 라이선스 없음 | 2023-07-02 | 정체 |
| [arendsyl/satisfactory-production-planner](https://github.com/arendsyl/satisfactory-production-planner) | Prolog 기반 솔버 | 0 | GPL-2.0 | 2021-05-17 | 죽음(5년+) |

---

## 2. 생산 체인 솔버(Solver) 알고리즘 상세 — 핵심 조사 항목

세 종류의 접근을 확인했다: **MILP(scipy)**, **LP(glpk.js)**, **Prolog 제약 논리**. 우리 프로젝트에 가장 참고 가치가 높은 순서로 정리.

### 2-1. [0xjc/SatisfactoryLP](https://github.com/0xjc/SatisfactoryLP) — MILP, scipy.optimize.milp (⭐ 가장 정교함)

- 언어: Python, `scipy.optimize.milp` (CBC/HiGHS 기반)
- **결정변수(열)**: 자원-클록속도 조합별 채취기 대수, 레시피-클록속도-소머슬룹 조합별 제조기 대수, 연료-클록속도별 발전기 대수, 아이템별 싱크 투입량, 전력/비용 추적용 더미 변수
- **목적함수**: 두 모드 선택 가능
  - `maximize: 싱크 포인트 - 1000×기계수 - 컨베이어 패널티 - 파이프라인 패널티`
  - `maximize: 발전량 - 기계수 - ...`
- **제약조건**:
  1. 아이템별 물질수지 등식(`Σ생산 - Σ소비 = 0`)
  2. 자원 채취 상한(맵의 노드 수 × 순도 배율)
  3. 전력 생산=소비 등식(+ 에일리언 전력 증폭기 정적 소비 하한)
  4. 소머슬룹 사용량 상한
  5. **컨베이어/파이프라인 처리량 제약을 "클록 속도 선택지를 사전에 제한"하는 방식으로 구현** — 별도 변수 없이 `max_clock = min(max_clock, CONVEYOR_LIMIT/rate)`로 열 생성 단계에서 컷
  6. 소머슬룹 변수만 정수(`integrality=1`), 나머지는 연속(LP relaxation)
- **데이터 소스**: `Docs.json`(UTF-16, 게임 설치 디렉터리 `CommunityResources/Docs/`에서 직접 복사, 현재 U1.2.3.1 빌드 495413용 포함) + `MapInfo.json`(satisfactory-calculator.com 정적 서버에서 받은 노드 위치/순도 데이터, 빌드 492064)
- **재사용 가치**: **가장 높음.** MILP 정식화 자체(열 생성 방식으로 클록속도/소머슬룹 조합 폭발을 제어하는 기법, 물질수지를 등식 제약으로 놓는 표준 패턴)를 그대로 이식 가능. MIT 라이선스라 코드 차용도 자유로움.

### 2-2. [lunafoxfire/yet-another-factory-planner](https://github.com/lunafoxfire/yet-another-factory-planner) — LP, glpk.js (브라우저에서 동작)

- 언어: TypeScript, `glpk.js`(GLPK의 WASM/JS 포팅) — **브라우저에서 클라이언트 사이드로 LP를 직접 푼다**는 점이 특징
- 최소화 문제: `전력비용 + 자원비용×가중치 + 건물비용 + 레시피종류 다양성 페널티`
- 제약: 생산 목표 하한(`GLP_LO`), 자원 가용량 상한(`GLP_UP`), 아이템별 물질수지, (복잡도 가중치>0일 때) 사용 레시피 종류 제한용 이진 변수
- 3초 타임아웃으로 대규모 문제도 실용적으로 처리
- **재사용 가치**: 브라우저 내에서 solver를 완전히 클라이언트 사이드로 돌리고 싶다면 `glpk.js` 채택 사례로 참고할 만함. 단, 데이터가 1.0 이전 기준(2023-07 이후 정체)이라 레시피/아이템 데이터는 갱신 필요.

### 2-3. [Zistack/Satisfactory-Optimizer](https://github.com/Zistack/Satisfactory-Optimizer) — scipy.optimize.linprog

- 순수 LP(정수 제약 없음), 설정 가능한 제약 세트로 공장 계획 최적화. **라이선스가 명시되어 있지 않아 재사용 시 저자에게 확인 필요** — risk로 명시.

### 2-4. [TheoKanning/SatisfactoryOptimizer](https://github.com/TheoKanning/SatisfactoryOptimizer) — 레시피 비율을 LP로 모델링

- 2021년 이후 정체. 접근 자체(레시피 생산 비율을 LP 변수로 놓는 초기 아이디어)는 단순해서 입문 참고용. 데이터 최신화 안 됨.

### 2-5. [arendsyl/satisfactory-production-planner](https://github.com/arendsyl/satisfactory-production-planner) — Prolog 제약 논리 솔버

- 특이하게 Prolog로 생산 체인을 제약 충족 문제(CSP)로 풀이. 2021년 이후 방치(GPL-2.0). 접근 다양성 참고용이며 실무 이식성은 낮음.

---

## 3. 데이터 스키마 / Docs.json 파서

| 저장소 | 언어 | 제공 스키마 | 비고 |
|---|---|---|---|
| [lunafoxfire/satisfactory-docs-parser](https://github.com/lunafoxfire/satisfactory-docs-parser) | TS/npm | `items`, `resources`, `equipment`, `buildables`, `productionRecipes`, `buildableRecipes`, `customizerRecipes`, `schematics` — 클래스명(`Desc_IronPlate_C`)을 키로 하는 객체 구조 | MIT, 2024-10 이후 정체. 1.0 이후 데이터 스키마 변경 가능성 있어 필드 매핑 재검증 필요 |
| [dmryabov/satisfactory-docs-exporter](https://github.com/dmryabov/satisfactory-docs-exporter) | C# | Docs.json을 대체(가독성 좋은) 포맷으로 재추출하는 콘솔 앱 | MIT, 2023-12 정체 |
| `Docs.json` 원본 | — | 게임 설치 디렉터리 `<Satisfactory>/CommunityResources/Docs/Docs.json` (UTF-16, FGClass 계층 구조) | 게임 자체 제공 — 파서 없이 원본 그대로도 사용 가능. 우리 프로젝트가 직접 파싱 로직을 짜도 되고 위 두 파서의 필드 매핑을 참고해도 됨 |

## 4. 세이브 파일 파서

| 저장소 | 언어 | 기능 | 1.2 지원 |
|---|---|---|---|
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | Python | `.sav` 파싱/재저장(resave), CLI 편집(플레이어 위치·인벤토리·노드 변경), HTML 시각화, `.sbp` 블루프린트 파싱, 파일 변경 감시(`sav_monitor.py`) | **README에 "v1.2.0.0, v1.2.1.0, v1.2.2.0, v1.2.2.1 지원, 구버전은 제한적"이라고 명시** — 가장 확실한 최신 버전 지원 |
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | TypeScript | 세이브/블루프린트를 JSON으로 변환·수정·재직렬화 (`ParseSave`/`WriteSave`) | README에 "U1.2 ✅" 명시, npm 패키지(`@etothepii/satisfactory-file-parser`)로도 배포 |
| [Goz3rr/SatisfactorySaveEditor](https://github.com/Goz3rr/SatisfactorySaveEditor) | C# | GUI 세이브 에디터 | 버전 지원 미확인 — 사용 전 재검증 필요 |
| [anocweb/SatisfactorySaveTools](https://github.com/anocweb/SatisfactorySaveTools) | — | 세이브→JSON 변환 | 상세 미조사 |

**재사용 가치**: 우리가 웹(TS/JS) 스택이면 `etothepii4/satisfactory-file-parser`(npm 설치 가능, MIT)가 즉시 통합 가능. 백엔드/스크립트가 Python이면 `sat_sav_parse`가 버전 지원이 가장 명확(GPL-3.0이므로 배포 시 라이선스 조건 검토 필요).

## 5. 맵 좌표 변환

- [Tjark-Kuehl/satisfactorymap](https://github.com/Tjark-Kuehl/satisfactorymap)의 `src/components/Map.svelte` 확인 결과:
  - `L.CRS.Simple` (Leaflet의 비투영 1:1 좌표계) 사용
  - 마커 배치: `L.marker([-y, x], ...)` — **Y축만 부호 반전**, 별도 스케일/오프셋 계수 없음
  - 맵 바운드: `[[-400000, -400000], [400000, 400000]]` (cm 단위로 추정, Satisfactory 월드 좌표 원점 기준)
- 게임 좌표계 자체는 cm 단위, 대략 X: -3246~4253(×100), Y: -3750~3750(×100) 범위로 알려져 있음(위키 기준, 정밀 값은 맵마다 다를 수 있음 — 직접 검증 필요).
- **재사용 가치**: 변환 로직이 매우 단순(y 반전 + CRS.Simple)해서 "복잡한 변환 공식을 가져온다"기보다 "이 정도로 단순화해도 된다"는 확인 자료로 유효. 정밀한 스케일이 필요하면 `AnthorNet/SC-InteractiveMap`(satisfactory-calculator.com 백엔드, 211⭐로 가장 성숙)의 좌표 처리 코드를 추가로 열어봐야 함 — 이번 조사에서는 파일 단위까지 열지 못함(risk로 기록).

## 6. 모드 프레임워크

- [satisfactorymodding/SatisfactoryModLoader](https://github.com/satisfactorymodding/SatisfactoryModLoader) — GPL-3.0, 342⭐, 2026-08-12 최종 push로 **생태계 내 가장 활발한 저장소**. Unreal Engine C++ 기반, 공식 모딩 API 부재를 메우는 비공식 로더. 문서는 별도 조직 저장소 [satisfactorymodding/Documentation](https://github.com/satisfactorymodding/Documentation) (docs.ficsit.app에 배포).
- 우리 프로젝트가 게임 내부에 모드로 개입할 계획이 없다면 직접 재사용 대상은 아니고, "Docs.json 스키마의 권위 있는 레퍼런스"로 문서만 참고하면 충분.

---

## 7. Actionable — 지금 clone/fetch 가능한 구체 대상

아래는 즉시 실행 가능한 명령과 함께 정리했다.

1. **MILP 솔버 로직 이식**: `git clone https://github.com/0xjc/SatisfactoryLP` — `SatisfactoryLP.py`의 열 생성(클록속도×레시피×소머슬룹 조합) 및 물질수지 등식 제약 구조를 우리 solver 설계의 출발점으로 포팅. MIT라 코드 재사용 자유.
2. **세이브 파서(JS/TS 스택인 경우)**: `npm install @etothepii/satisfactory-file-parser` (etothepii4/satisfactory-file-parser, MIT, U1.2 확인됨) — 세이브 읽기/쓰기 즉시 통합.
3. **세이브 파서(Python 스택인 경우)**: `git clone https://github.com/GreyHak/sat_sav_parse` — U1.2.0~1.2.2.1 명시 지원, `sav_parse.py`/`sav_cli.py` 그대로 활용 가능(단, GPL-3.0이라 배포 형태에 따라 라이선스 고지 필요).
4. **Docs.json 원본 확보**: 로컬 Satisfactory 설치 디렉터리의 `CommunityResources/Docs/Docs.json`을 직접 복사해 데이터 소스로 사용(파서 저장소보다 원본이 최신). 필드 매핑 참고용으로 `git clone https://github.com/lunafoxfire/satisfactory-docs-parser` 함께 확보.
5. **맵 좌표 변환 확인용**: `git clone https://github.com/Tjark-Kuehl/satisfactorymap` — `src/components/Map.svelte`의 `L.CRS.Simple` + y축 반전 패턴을 그대로 채택 가능(별도 스케일 계산 불필요).

## 8. Risks

- **satisfactory-docs-parser(lunafoxfire)**: 2024-10 이후 정체(1.8년), U1.0 이후 Docs.json 필드가 바뀌었을 가능성이 있어 스키마 매핑을 직접 재검증해야 함.
- **yet-another-factory-planner**: 2023-07 이후 정체(3년+), 게임 데이터가 1.0 이전 기준일 가능성 높음. 솔버 "설계"만 참고하고 데이터는 신뢰하지 말 것.
- **Zistack/Satisfactory-Optimizer**: GitHub API 확인 결과 **라이선스 필드가 null**(라이선스 파일 없음/미인식). 코드 차용 전 저장소에 라이선스 파일이 실제로 없는지 재확인 필요 — 없으면 기본적으로 저작권 보호 상태라 재배포 불가.
- **AnthorNet/SC-ProductionPlanner, SC-InteractiveMap, marci07iq/factory-calculator**: GitHub API에서 `license: null` — SC-InteractiveMap은 211⭐로 매력적이지만 라이선스 미표시이므로 코드를 그대로 가져오면 안 되고 접근/구조 참고만 가능.
- **TheoKanning/SatisfactoryOptimizer, arendsyl/satisfactory-production-planner**: 각각 2021년 최종 push로 5년 이상 방치. 개념 참고 이상의 가치 없음.
- **SatisfactoryModLoader는 GPL-3.0**: 코드를 우리 프로젝트에 링크/포함하면 카피레프트 전파 가능성 있음 — 참고만 하고 직접 포함은 피할 것.
- **좌표 변환 정밀도**: Tjark-Kuehl 저장소는 스타 수가 낮고 정밀 스케일 검증을 하지 않았음(단순 y반전만 확인). 실제 게임 좌표-맵 픽셀 매핑을 정밀하게 쓰려면 `AnthorNet/SC-InteractiveMap` 또는 게임 자체의 `MapInfo.json`(0xjc/SatisfactoryLP에 동봉)을 추가로 열어 대조해야 함.
