# DATA-MODEL — satisfactory-ops

| | |
|---|---|
| 문서 버전 | 1.0 |
| 갱신일 | 2026-08-19 |
| 근거 결정 | ADR-0008(게임 데이터 소스) · 0011(사용자 데이터) · 0012(앱 데이터 계층) · 0015(노드) · 0017(한국어 표기) |

---

## 0. 대원칙

**게임 데이터와 사용자 데이터는 절대 섞지 않는다** (TRD 4.1).

| | 게임 데이터 | 사용자 데이터 |
|---|---|---|
| 어디에 사는가 | 저장소 → 빌드 산출물 | 브라우저 `localStorage` |
| 누가 쓰는가 | 생성 스크립트만 | 사용자 조작만 |
| 버전 | 게임 빌드 id | `schemaVersion` |
| 갱신되면 | 화면이 자동으로 따라간다 | 마이그레이션 함수를 거친다 |
| 잃으면 | 다시 생성하면 된다 | **되돌릴 수 없다** |

---

## 1. 게임 데이터 — 1단 (`src/data/*.json`)

`scripts/build-data.mjs`가 게임 배포 데이터에서 생성한다. **손으로 고치지 않는다.**

| 파일 | 개수 | 내용 |
|---|---|---|
| `meta.json` | — | 소스 경로·인코딩·바이트·sha256·Steam buildId·생성 시각 |
| `items.json` | 750 | 아이템 (원자재·부품·장비·건물 디스크립터 포함) |
| `recipes.json` | 872 | 레시피 (대체 110) |
| `buildings.json` | 539 | 건물 (제조기·발전기·물류·구조물) |
| `schematics.json` | 574 | 스키매틱 전체 (마일스톤·MAM·상점·튜토리얼) |
| `milestones.json` | 42 | 스키매틱 중 `EST_Milestone`만 |
| `ko/*.json` | 동일 | 같은 구조, 표시명만 공식 한국어 (ADR-0017) |

정규화 규칙(액체 ÷1000, 벨트 ÷2, 파이프 ×60 등)은 ADR-0008에 표로 있다.

---

## 2. 게임 데이터 — 2단 (`src/data/app/*.json`)

`scripts/build-app-data.mjs`가 en/ko를 클래스명으로 조인하고 **앱이 실제로 쓰는 필드만** 남긴다.
페이지가 import하는 것은 이 폴더뿐이다.

### `items.json`
```ts
{ id, ko, en, kind, form, isFluid, stackSize, energyMJ, sinkPoints }
```

### `recipes.json`
```ts
{ id, ko, en, isAlternate, durationSec,
  ingredients: [{ item, amount, perMinute }],
  products:    [{ item, amount, perMinute }],
  producedIn:  [buildingId], inHandcraft, isBuildingRecipe }
```
`perMinute = amount × 60 ÷ durationSec` (클록 100%, 소머슬룹 미사용).

### `buildings.json`
```ts
{ id, ko, en, category, buildCost: [{ item, amount }],
  powerMW, powerGenMW, powerExponent, manufacturingSpeed,
  somersloopSlots, powerShardSlots,
  beltItemsPerMinute, pipeFlowM3PerMinute,
  extraction: { perMinuteAtNormalPurity, allowedForms } | null,
  supplementalToPowerRatio, storageSlots, unlockTier }
```
`unlockTier`는 건물 레시피를 해금하는 스키매틱의 최소 티어에서 역산한 값이다.

### `milestones.json` / `hub.json`
```ts
{ id, ko, en, tier, order, cost: [{ item, amount }],
  timeToCompleteSec, unlocksRecipes, unlocksItems, inventorySlots }
```
`hub.json`은 티어 0 튜토리얼 스키매틱(허브 업그레이드 6단계). 마일스톤과 별개 트랙이라 분리했다.

### `index.json` — 빌드타임 역인덱스
```ts
{ producedBy:  { [itemId]:     recipeId[] },   // 이 아이템을 만드는 레시피
  consumedBy:  { [itemId]:     recipeId[] },   // 이 아이템을 재료로 쓰는 레시피
  byBuilding:  { [buildingId]: recipeId[] },
  tiers:       { [tier]:       milestoneId[] }, // 게임 메뉴 순서
  unlockTier:  { [recipeId]:   number } }
```
런타임에 872개를 순회하지 않기 위한 것이다. 만드는 비용은 빌드 1회.

---

## 3. 큐레이션 콘텐츠 (`src/data/curated/*.json`)

게임 원본에 없는 판단·조언. **게임 객체는 반드시 클래스명으로 참조한다.**
없는 클래스를 참조하면 2단 빌드가 실패한다.

| 파일 | 내용 | confidence |
|---|---|---|
| `milestone-advice.json` | 마일스톤별 "이 시점 액션 / 확장성 함정 / 왜 / 이견" + 티어별 노트 | 항목마다 `verified` 또는 `consensus` + `sources` |
| `sites.json` | 추천 부지 6곳, 시작 지점 4곳 | **`unsourced`** — 출처 미기록. 화면에 그대로 표기 |
| `start-inventory.json` | 튜토리얼 스킵 시작 인벤토리 | **`unsourced`** — 인게임 재확인 필요 |

`glossary.json`(용어집 17항목)도 수기 데이터지만 학습 레이어라 `src/data/` 최상위에 둔다.
`see` 상호참조가 깨지면 용어집 페이지 빌드가 실패한다.

---

## 4. 노드 데이터 (`src/data/resource-nodes.json`)

ADR-0015. 출처: `rockfactory/satisfactory-logistics` (MIT).

```ts
{ $source, $transform, $counts: { total: 626 },
  nodes: [{ id, res, ko, purity, type, fx, fy, gx, gy, cell }] }
```

- `fx`/`fy` — 맵 이미지 기준 0~1 비율. ADR-0006 캘리브레이션과 같은 좌표계
- `purity` — `impure` / `normal` / `pure`. 채굴량 배율 ×0.5 / ×1 / ×2
- `type` — `node`(채굴기 설치 가능) / `deposit`(손 채굴) / 간헐천 등
- 월드 좌표 환산: `x = fx × 750100 − 324698`, `y = fy × 750000 − 375000` (단위 cm)

**자원 랜덤화를 켜면 전부 무효다.** 화면이 설정을 읽어 경고한다.

---

## 5. 사용자 데이터 (`localStorage`)

키는 `sfops.v1` 하나. 테마만 별도로 `sfops.theme`.

```ts
interface UserState {
  schemaVersion: 1;
  doneMilestones: string[];   // 체크한 마일스톤 className
  ownedAlternates: string[];  // 확보한 대체 레시피 className
  setup: {
    startLocation: 'grass-fields' | 'rocky-desert' | 'northern-forest' | 'dune-desert' | null;
    tutorialSkipped: boolean;
    randomizedResources: boolean;
  };
  updatedAt: string | null;
}
```

### 규칙

1. **저장하는 것은 사용자가 입력한 사실뿐이다.** 현재 티어·다음 할 일·완료율·계산 결과는 저장하지 않는다.
   파생값을 저장하면 게임 데이터가 갱신될 때 낡은 값이 남는다.
2. **마이그레이션은 버전별 함수 체인**이다. `persist.ts`의 `migrations[1] = (s) => ({...})` 형태로 추가한다.
   버전을 올리지 않는 마이그레이션은 오류로 취급한다.
3. **실패하면 원본을 백업한다.** `sfops.v1.backup.<timestamp>`에 원문을 남기고 초기 상태로 시작하며,
   화면에 백업 키를 알려준다.
4. **알 수 없는 필드는 떨어뜨린다.** `normalize()`가 타입을 강제하므로 손상된 값이 앱을 깨뜨리지 않는다.
5. 쓰기는 400ms 디바운스. 체크박스 연타에 매번 직렬화하지 않는다.

### 스키마를 바꿀 때

1. `CURRENT_VERSION`을 올린다
2. `migrations[이전버전]`을 추가한다
3. `tests/`에 이전 버전 → 최신 변환 테스트를 추가한다 (TRD 8.1 MUST)
4. `DATA-MODEL.md`(이 문서)의 인터페이스를 갱신한다

---

## 6. 신뢰도 표기

TRD 4.3의 `confidence` 3단계를 쓴다.

| 값 | 의미 | 앱에서의 취급 |
|---|---|---|
| `verified` | 게임 배포 데이터 또는 공식 위키로 확인 | 그대로 사용 |
| `consensus` | 복수의 독립 출처가 일치 | 사용하되 근거 링크 표기 |
| `disputed` | 출처 간 불일치 | **핵심 계산에 사용 금지.** 양쪽을 다 보여준다 |
| `unsourced` | 출처를 기록하지 못함 (이번에 추가) | 화면에 "출처 미기록"으로 명시. 재조사 대상 |

게임 배포 데이터에서 생성된 모든 수치는 자동으로 `verified`다 — 그래서 개별 필드에 붙이지 않고
`meta.json`의 출처 한 곳으로 대표한다. 수기 콘텐츠는 파일 또는 항목 단위로 붙인다.
