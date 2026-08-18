# ADR 0008 — 게임 데이터(레시피·건물·마일스톤) 소스 결정

## 상태

**채택됨 (Accepted)** — 2026-08-19

- 대체: 없음
- 관련 리서치: `docs/research/eco-gamedata.md`, `docs/research/eco-github.md`
- 구현: `scripts/build-data.mjs` → `src/data/*.json`

## 맥락

이 프로젝트는 Satisfactory 1.2 기준의 레시피 872개, 건물 539개, 스키매틱 574개(마일스톤 42개)를 다뤄야 한다.
이 규모를 손으로 타이핑하는 것은 (a) 물리적으로 불가능에 가깝고 (b) 패치마다 전량 재검수해야 하며
(c) 오타 하나가 생산 계산기 전체를 조용히 틀리게 만든다. 따라서 **기계판독 원본에서 생성**하는 경로가 필요했다.

선택지는 셋이었다.

1. 공개 저장소의 이미 파싱된 데이터셋을 받아 쓴다 (greeny/SatisfactoryTools의 `data/data.json` 등)
2. 공개 API를 호출한다 (aringadre76/satisfactory-api 등)
3. 게임 설치본이 배포하는 원본 `CommunityResources/Docs/`를 직접 파싱한다

리서치 단계에서 1·2번의 최신성이 의심스럽다는 신호가 있었고, 3번은 이 머신에 게임이 설치되어 있어
실물로 검증이 가능했다. 그래서 **추정 대신 실측**으로 결정하기로 했다.

### 실측 결과 (2026-08-19, 이 머신에서 직접 확인)

| 항목 | 확인값 |
|---|---|
| 설치 경로 | `C:\Program Files (x86)\Steam\steamapps\common\Satisfactory` |
| Steam buildid | `24656030` (`steamapps/appmanifest_526870.acf`) |
| 데이터 파일 | `CommunityResources/Docs/en-US.json` |
| 크기 / 인코딩 | 10,640,180 bytes (10.15 MiB) / **UTF-16LE + BOM (`FF FE`)** |
| sha256 | `a81d250e96aa13db…` (`src/data/meta.json`에 전체 기록) |
| 구조 | 최상위 배열, `[{NativeClass, Classes:[...]}, …]` — NativeClass 그룹 **114개**, 클래스 총 **2,868개** |
| 파싱 | Node 24 `JSON.parse` 로 **14 ms**에 성공 (외부 의존성 0) |
| 형제 파일 | 로케일별 56개(`ko.json`, `de.json` …). **`Docs.json`이라는 단일 파일은 존재하지 않는다** |

**1.2 콘텐츠 실물 확인** — 1.2 패치노트에만 등장하는 항목을 실제로 grep해 전부 존재를 확인했다:
`Fluid Truck Station`(2), `SPWN`(3), `Cross Beam`(2), `Pipeline T-Junction`(2), `Alternate: Wet Concrete`(2),
`Priority Power Switch`(3). 또한 1.1에서 도입된 소머슬룹 생산 부스트 필드
(`mProductionShardSlotSize`, `mProductionBoostPowerConsumptionExponent`)도 클래스에 존재한다.

**반대편 실측** — greeny/SatisfactoryTools의 `dev` 브랜치 `data/data.json`은 마지막 데이터 갱신 커밋이
`1.1 update`(2026-01-28)로 **1.2가 반영되어 있지 않다**. 즉 후보 1은 "최신처럼 보이지만 구버전"이다
(저장소 자체는 2026-03-29까지 활발히 push되므로 push 날짜만 보면 속는다).

## 결정

**로컬 게임 설치본의 `CommunityResources/Docs/<locale>.json`을 1차이자 유일한 데이터 원본으로 삼는다.**
`scripts/build-data.mjs`가 이 파일을 읽어 `src/data/`에 정규화 JSON을 생성한다. 이 스크립트는 재실행 가능하며,
게임이 업데이트되면 다시 돌리는 것으로 갱신이 끝난다.

구체적으로:

1. **소스 탐색은 자동화한다.** `--docs` 인자 → `SATISFACTORY_DOCS` 환경변수 →
   Steam `libraryfolders.vdf` 파싱(다중 라이브러리 지원) → 하드코딩 후보 경로(Epic 포함) 순으로 찾는다.
   경로를 사람이 외우게 하지 않는다.
2. **인코딩은 BOM으로 판별한다.** UTF-16LE / UTF-16LE(BOM 없음) / UTF-8 / UTF-8+BOM을 모두 처리한다.
   원본이 UTF-16이라는 사실은 하드코딩하지 않는다(장래 변경 가능성).
3. **출력은 6개 파일**: `meta.json`, `items.json`, `recipes.json`, `buildings.json`,
   `schematics.json`, `milestones.json`.
4. **`meta.json`에 출처를 못 박는다**: 소스 파일 절대경로, 로케일, 인코딩, 바이트 수, **sha256**,
   **Steam buildid**, 클래스 개수, 생성 시각. 데이터가 어느 스냅샷에서 나왔는지 항상 되짚을 수 있어야 한다.
5. **새니티 체크를 빌드에 내장한다.** 13개 검사(액체 단위 환산, 벨트 속도, Constructor 4 MW,
   레시피↔건물 참조 무결성, 1.2 콘텐츠 존재 등) 중 하나라도 실패하면 **파일을 쓰지 않고 exit 2**로 죽는다.
   스키마가 조용히 바뀐 채로 빌드가 "성공"하는 사고를 막는 것이 목적이다.
6. **공개 미러를 폴백으로 두지 않는다.** 소스를 못 찾으면 실패하고 해결 방법을 안내한다.
   1.1 데이터를 슬쩍 섞어 넣느니 빌드가 죽는 편이 낫다.
7. **`src/data/*.json`은 생성물이다.** 손으로 고치지 않는다. 손으로 쓴 데이터는
   `src/data/glossary.json`(학습 레이어)처럼 **게임 원본에 존재하지 않는 것만** 유지한다.

### 정규화 규칙 (원본 → 우리 스키마)

원본은 UE 오브젝트 덤프라 값이 전부 문자열이고 단위가 게임 내부 단위다. 다음을 변환한다.

| 원본 | 문제 | 변환 |
|---|---|---|
| `mIngredients` / `mProduct` / `mCost` | `((ItemClass="…Desc_X.Desc_X_C'",Amount=3))` 형태의 UE 구조체 문자열 | 정규식으로 `[{item, amount}]` 파싱 |
| 액체·기체 `Amount` | 리터 단위로 1000배 (Water `5000`) | 아이템 `mForm`이 `RF_LIQUID`/`RF_GAS`면 **÷1000** → m³ (Wet Concrete 물 = 5 m³) |
| `mManufactoringDuration` | 초 단위 사이클 | `perMinute = amount × 60 ÷ duration` 병기 |
| `mSpeed` (컨베이어) | 내부 단위가 items/min의 2배 (`120`) | **÷2** → 60 items/min |
| `mFlowLimit` (파이프) | m³/s (`5`) | **×60** → 300 m³/min |
| `mExtractCycleTime` + `mItemsPerCycle` | 사이클 기준 | 분당 산출로 환산 (Miner Mk.1 60/min, Water Extractor 120 m³/min) |
| `FGBuildingDescriptor.mDisplayName` | **비어 있음** (표시명은 `Build_*` 클래스에 있음) | `Desc_X_C` ↔ `Build_X_C` 매칭으로 이름 역채움 |
| `mProducedIn` | 기계·작업대·빌드건이 뒤섞임 | `Build_*`만 `producedIn`으로, 작업대류는 `inHandcraft: true`로 분리 |
| `Build_AutomatedWorkBench_C` | `Build_` 접두사지만 자동 생산 기계가 아님(장비 작업장) | 수동 제작으로 분류 |
| `mUnlocks` | 언락 종류 23가지가 한 배열에 섞임 | `{recipes, schematics, items, scannables, inventorySlots, armSlots, other}`로 분해 |
| `mTechTier`, `mType` | `EST_Milestone` 등 enum 문자열 | `milestone`/`alternate`/`mam`/`awesome-shop`/… 로 매핑, 마일스톤은 티어순 정렬 |

### 생성 결과 (buildid 24656030 기준)

```
items=750  recipes=872 (대체 110)  buildings=539  schematics=574  milestones=42
```

교차검증 표본 — 위키 공표값과 일치함을 확인:
Miner Mk.1 60/min(노멀), Water Extractor 120 m³/min, Coal-Powered Generator 75 MW(+물 비율 10),
Particle Accelerator 250–1500 MW 가변, Refinery 건설비 Motor 10 / Encased Industrial Beam 10 / Steel Pipe 30 / Copper Sheet 20,
Alternate: Wet Concrete = Limestone 120/min + Water 100/min → Concrete 80/min.

## 근거

1. **1.2 데이터인지 검증된 유일한 소스다.** 다른 후보들은 "최신 커밋"과 "최신 데이터"가 다르다.
   greeny는 저장소 push는 3월인데 데이터는 1월(1.1)이다. 우리는 게임 파일에서 1.2 전용 항목을
   직접 grep해 확인했다 — 이건 추정이 아니라 실측이다.
2. **의존성이 0이다.** 파일 하나를 읽어 `JSON.parse`하면 끝난다(14 ms). npm 패키지도, 네트워크도,
   PHP 런타임도 필요 없다. 정체된 서드파티 파서(lunafoxfire는 2023-01 이후 릴리즈 없음)의
   유지보수 리스크를 통째로 회피한다.
3. **재현 가능하다.** sha256 + Steam buildid를 `meta.json`에 남기므로, 어떤 데이터가 어느 게임 빌드에서
   나왔는지 언제든 확인된다. 특정 버전 고정이 필요하면 `satisfactory-dev/Fetch-Docs.json`의
   steamcmd `download_depot` 표로 해당 빌드를 따로 받아 `--docs`로 넘기면 된다.
4. **게임과 함께 갱신된다.** Coffee Stain이 패치마다 이 파일을 갱신해 배포한다. 서드파티가 언제
   반영할지 기다릴 필요가 없다 — 유지 주체가 게임 개발사 본인인 유일한 소스다.
5. **다른 후보의 결격 사유가 명확하다.**
   - 공개 API(aringadre76): Render 무료 티어라 sleep하고, 구동 중인 데이터의 게임 버전이 불명이다.
     게다가 그 API 자체도 사용자가 넣은 `Docs/en-US.json`에 의존한다 — 한 다리 건너 같은 소스인데 신선도만 나쁘다.
   - Maurdekye, FerricDonkey: **라이선스 미표기**. public 저장소인 이 프로젝트에 넣을 근거가 없다.
   - dmryabov/satisfactory-docs-files: 스냅샷이 초기 EA 빌드(CL-273254) 하나뿐.
   - SatisfactoryTools/DocsParser: MIT에 유지도 활발하지만 PHP다. 이 프로젝트는 빌드 파이프라인 없는
     정적 JS 사이트라 PHP 런타임을 도입할 이유가 없다 → **스키마 매핑 참고용으로만** 읽었다.

## 결과

### 좋아지는 것

- 레시피/건물/마일스톤을 **손으로 한 줄도 타이핑하지 않는다.** 872개 레시피가 명령 한 번에 생성된다.
- 게임 업데이트 대응이 `node scripts/build-data.mjs` 한 줄이다.
- 새니티 체크가 빌드에 붙어 있어, 스키마가 바뀌면 **조용히 틀린 데이터가 나오는 대신 빌드가 죽는다.**
- `meta.json`의 sha256/buildid로 "이 숫자 어디서 나왔냐"에 항상 답할 수 있다.

### 나빠지는 것 / 감수하는 것

- **빌드에 게임 설치가 필요하다.** CI에서는 데이터를 생성할 수 없다.
  → 완화: `src/data/*.json` 생성물을 저장소에 커밋해 앱 실행 자체는 게임 없이 되게 한다.
  스크립트는 `assets/gamedata/Docs`에 복사해 둔 스냅샷도 후보 경로로 탐색한다.
- **데이터가 이 머신의 특정 buildid 스냅샷에 묶인다.** 게임이 자동 업데이트되면 원본이 바뀐다.
  → 완화: 스크립트를 1회성으로 만들지 않았고, `meta.json`의 sha256으로 변경을 감지할 수 있다.
- **재배포 라이선스가 미확정이다.** Coffee Stain의 커뮤니티 리소스 정책이 파싱된 수치·텍스트 데이터의
  공개 재배포를 어디까지 허용하는지 이번 조사에서 원문으로 확정하지 못했다(`CommunityResources` 폴더에
  라이선스 파일이 동봉되어 있지 않음 — 실제 확인함).
  → **조치**: (a) 텍스트/수치만 생성하고 **아이콘·이미지 자산은 일절 추출·재배포하지 않는다**
  (현재 스크립트는 아이콘의 **경로 문자열만** 기록하고 이미지 파일은 건드리지 않는다).
  (b) `src/data/*.json`을 public 저장소에 push하기 전에 위키 "Community resources" 페이지의
  이용 조건을 반드시 재확인한다. **이 확인 전에는 public push를 보류한다.**
- **로케일 확장 시 재실행이 필요하다.** 한글 표시명이 필요하면 `--locale=ko --out=src/data/ko`로 별도 생성한다
  (클래스 구조는 동일하고 표시명만 다르다).

### 후속 작업

- [ ] Coffee Stain 커뮤니티 리소스 이용 조건 원문 확인 → 확인 전 `src/data` 게임데이터 public push 보류
- [ ] `--locale=ko` 산출물이 필요한지 UI 요구사항 확정 후 결정
- [ ] 자원 노드 좌표/순도는 Docs에 없다 → 별도 소스 필요 (별도 ADR)
- [ ] MILP 솔버(0xjc/SatisfactoryLP, MIT)를 이 스키마 위에 이식 (별도 ADR)

## 대안

| 대안 | 내용 | 기각 사유 |
|---|---|---|
| **A. greeny/SatisfactoryTools `data.json` 사용** | raw.githubusercontent에서 받아 그대로 사용 | 데이터 갱신 커밋이 `1.1 update`(2026-01-28)에서 멈춤. **1.2 미반영**. 저장소 push 날짜(2026-03-29)만 보면 최신으로 착각하기 쉬움 |
| **B. 공개 REST API(aringadre76) 호출** | 런타임에 API에서 받아옴 | Render 무료 티어 sleep, 데이터 버전 불명, 개인 인스턴스라 지속성 없음. 원본이 결국 같은 `Docs/en-US.json`이라 이득도 없음 |
| **C. `satisfactory-docs-parser` npm 의존** | 검증된 파서 라이브러리 사용 | 마지막 릴리즈 2023-01-12(v7.0.1, Update 7). 1.0/1.1/1.2 대응 릴리즈 전무. 로케일 분리 같은 스키마 변경에 대응 못 할 위험. **타입/카테고리 매핑표만 참고**하고 의존성으로는 넣지 않음 |
| **D. SatisfactoryTools/DocsParser(PHP) 채택** | MIT, 2026-07 최신 유지 | 생태계는 가장 건강하지만 PHP 런타임 도입이 필요. 이 프로젝트는 빌드 없는 정적 JS. **스키마 매핑 로직만 참고** |
| **E. 손으로 정리한 데이터 유지** | 필요한 레시피만 수작업 큐레이션 | 872개 레시피 + 574개 스키매틱 규모에서 비현실적이고, 패치마다 전수 재검수가 필요. 신뢰 가능한 기계판독 소스를 **실제로 찾았으므로** 채택 이유가 사라짐 |
| **F. steamcmd로 버전 고정 depot 다운로드** | `Fetch-Docs.json` 표대로 특정 빌드를 받아 고정 | 상시 경로로는 과함(수 GB 다운로드). **회귀 테스트·버전 고정이 필요할 때의 보조 수단**으로만 남김 — 스크립트가 `--docs`를 받으므로 그때 그대로 연결된다 |

## 실행

```bash
# 기본 (자동 탐색 → src/data 생성)
node scripts/build-data.mjs

# 소스 탐지/파싱/검증만, 파일은 쓰지 않음 (CI·점검용)
node scripts/build-data.mjs --check

# 경로를 직접 지정 (게임 미설치 머신, 버전 고정 스냅샷)
node scripts/build-data.mjs --docs="D:/snapshots/1.2.2.0/en-US.json"

# 한글 표시명
node scripts/build-data.mjs --locale=ko --out=src/data/ko
```

종료 코드: `0` 성공 / `1` 소스 없음·파싱 실패 / `2` 새니티 체크 실패(파일 미생성).
