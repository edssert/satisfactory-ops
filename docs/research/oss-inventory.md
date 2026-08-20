# GitHub 오픈소스 자원 전수 조사 — 우리가 가져다 쓸 수 있는 것

조사일: 2026-08-21 · 기준 게임 버전: Satisfactory 1.2.x · 조사자: 리서치 에이전트

**방법**: WebSearch 0회. GitHub REST API(`gh api`, 인증됨 5000req/h)로 저장소 검색·메타데이터·트리·LICENSE 원문을
실측했고, 유망한 저장소는 `raw.githubusercontent.com`으로 **실제 데이터 파일을 내려받아 파싱**해 스키마를 확인했다.
라이선스는 전부 `LICENSE` 파일 원문을 열어 확인했다(GitHub 감지기의 `spdx_id`만 믿지 않았다).
아래 "실측" 표시가 붙은 항목은 실제로 파일을 열어 확인한 것이다.

**우리 저장소는 MIT + public 이다.** 따라서 GPL/AGPL/라이선스 없음/재사용 금지 조항이 있는 코드는
**가져올 수 없다**. 이 문서는 그 경계를 매 항목마다 명시한다.

기존 조사(`eco-github.md`, `eco-gamedata.md`, `save-parsers.md`)와 중복되는 솔버·세이브 파서 영역은
결론만 갱신하고, 이번에는 **월드 데이터·에셋·레이아웃·한국어**에 무게를 뒀다 — 그쪽이 비어 있었기 때문이다.

---

## 0. 세 줄 요약

1. **노드 접근성 데이터는 존재한다.** 단 두 곳에 있고, 하나는 라이선스가 막혀 있고(satisfactory-calculator
   `MapInfo.json` — 동굴 104개·가스 기둥 831개·포자꽃 651개·파괴 가능 바위·도로·시작 지역·`obstructed` 플래그)
   다른 하나는 MIT지만 커버리지가 부분적이다(`mellox/NodeShuffle`의 물/동굴 격자).
2. **에셋(탑뷰 스프라이트, 메시 평면도)은 오픈소스에 없다.** 아무도 만들지 않았다. 우리가 이미 `Docs.json`의
   `mClearanceData`로 실측 박스를 뽑고 있으니, 이 영역은 남의 것을 기다릴 게 아니라 우리 파이프라인이 정답이다.
3. **한국어 오픈소스 자원은 사실상 0건이다.** 검색 결과 우리 저장소(`edssert/satisfactory-ops`)가 유일한
   한국어 Satisfactory 플레이북이다. 한글 표기의 정본은 게임 `ko.json`뿐이라는 ADR-0017의 판단이 재확인됐다.

---

## 1. 월드 데이터 — 노드 접근성 (이번 조사의 핵심 성과)

### 1-1. `MapInfo.json` (satisfactory-calculator.com) — **가장 완전한 접근성 데이터, 그러나 라이선스가 막혀 있다**

| 항목 | 값 |
|---|---|
| 실제 출처 | `https://static.satisfactory-calculator.com/data/json/mapData/en-Stable.json?v=1784184789` |
| 재배포처 | [0xjc/SatisfactoryLP](https://github.com/0xjc/SatisfactoryLP) `MapInfo.json` (2.95MB, master 브랜치) |
| 재배포처 라이선스 | MIT (⭐2, 2026-07-18 push) — **단 이 MIT는 0xjc 자신의 코드에만 적용된다** |
| 데이터 자체의 권리 | AnthorNet(satisfactory-calculator.com). [SC-InteractiveMap](https://github.com/AnthorNet/SC-InteractiveMap) README 원문: *"Reuse of the source code **and data assets** is not permitted in any case"* |
| `lastBuild` | 492064 (1.2 계열) |

**내용물 (실측 — 파일을 내려받아 파싱함)**

| 탭/레이어 | 개수 | 필드 |
|---|---|---|
| `resource_nodes` | 459 | `pathName, x, y, z, type, purity, obstructed, lastCheck` |
| `resource_wells` | 149 | `pathName, x, y, z, type, purity, core, lastCheck` |
| `power_slugs` | 1242 | `pathName, x, y, z, type` |
| `artifacts` | 404 | `pathName, x, y, z, shrinePathName, type` |
| `collectibles` | 5419 | `levelName, pathName, x, y, z, itemQuantity, itemId, itemName, obstructed, **powerNeeded**` |
| `caves` | **104개 동굴** | `{caveN: {entrances: [[[x,y],[x,y]], ...], points: [[x,y], ...]}}` — **동굴 외곽 폴리곤 + 입구 선분** |
| `roads` | **111개 경로** | `{roadN: {points: [[x,y], ...]}}` |
| `sporeFlowers` | **651** | 포자꽃 위치 (`BP_SporeFlower*`) — 가스 위험 지역 |
| `pillars` | **831** | 가스 기둥 (`BP_GasPillar_*`, `Persistent_Exploration_2` 레벨 소속) |
| `smallRocks` / `largeRocks` | 41 / 72 | 파괴 가능한 바위 — **노드를 막고 있는 물체** |
| `spawn` | 4 | 시작 지역 4곳 `{x, y, radius}` (반경 80,000~120,000cm) |
| `worldBorder` | 폴리곤 8점 | 월드 경계 |

- `obstructed` 필드는 노드 459개 중 284개에 존재하고, 이 스냅샷에서는 **전부 `false`** 였다(실측).
  즉 필드는 있지만 현재 값이 다 비어 있어서, "무엇이 막고 있나"의 답을 이 필드에서 직접 얻을 수는 없다.
  실질적인 접근성 정보는 `caves`/`pillars`/`sporeFlowers`/`largeRocks` 레이어 쪽에 있다.
- `powerNeeded`(23건, 실측)는 **전력을 넣어야 열리는 드롭포드**를 가리킨다 — 우리 수집품 데이터에 없는 정보다.

> ### 🚨 라이선스 경고 — 이 문서에서 가장 큰 함정
> `0xjc/SatisfactoryLP`가 MIT라고 해서 그 안의 `MapInfo.json`이 MIT가 되지 않는다. 이 데이터는
> AnthorNet 소유이고, 같은 저자의 SC-InteractiveMap은 **데이터 자산의 재사용을 명시적으로 금지**한다.
> **우리 저장소에 이 파일을 복사해 넣거나, 이걸로 만든 파생 데이터를 배포하면 안 된다.**
> 쓸 수 있는 것은 "이런 데이터가 이런 형태로 존재한다"는 사실뿐이다.
> → 같은 사실을 합법적으로 얻는 경로는 **1-2**와 **1-3**에 있다.

### 1-2. `mellox/NodeShuffle` — **MIT 라이선스로 얻을 수 있는 유일한 지형 데이터** ⭐추천

| 항목 | 값 |
|---|---|
| URL | https://github.com/mellox/NodeShuffle |
| 라이선스 | **MIT** (LICENSE 원문 확인: `Copyright (c) 2026 mello`) |
| ⭐ / 최근 push | 0 / 2026-08-13 (활발) |
| 언어 | C++ (Satisfactory 모드, SML 3.12+, 게임 ≥1.1) |
| 게임 버전 | 1.1/1.2 대응, 2026-08 애니버서리 업데이트 언급 있음 |

노드 랜덤화 모드지만, 그 부수물로 **월드 지형 스냅샷을 소스에 박아 두었다**.
파일: `Source/NodeShuffle/Private/NodeShuffleBakedData.h` (169KB, MSVC 16KB 리터럴 제한 때문에 청크로 쪼갠 JSON).

**실측 결과 (직접 파싱)**

```
WaterGridChunks : { "cellCm": 10000, "land": [...896], "water": [...743], "mixed": [...226] }
                  → 100m 격자로 육지/물/혼합을 분류한 맵. 셀 좌표는 "x,y" 문자열
CaveFloorsChunks: { "cellCm": 800, "seedCount": 27,
                    "seeds": [722개 리소스 노드 오브젝트 경로],
                    "cells": ["x,y,z,tier,flag" × 2660] }
                  → 8m 격자로 찍은 동굴 바닥 지점 + 동굴 탐색의 시드가 된 노드 목록
```

**우리가 쓸 수 있는 것**
- `water` 격자 → 자원 지도에 "물 위/물가" 표시, 배치판에서 "여기는 못 짓는다" 판정
- `land` 격자 → 공장 후보지 필터
- `cells` (동굴 바닥) → "이 노드는 동굴 안에 있다" 판정의 근거
- `seeds` 722개 → 동굴 탐색의 출발점이 된 노드 경로명. `BP_ResourceNode###` 형식이라
  우리 `resource-nodes.json`의 `id`와 직접 조인 가능

**한계 (정직하게)**: 이 데이터는 게임 파일에서 완전 추출한 것이 아니라 **플레이 중 학습해 스냅샷한 것**이다
(헤더 주석: "reads the live learned stores from FactoryGame/Configs and snapshots them here", Baked: 2026-07-12).
100m 격자 1,865셀은 맵 전체(대략 70×70=4,900셀)의 **38% 정도만 덮는다**. 즉 "물이라고 표시된 곳은 믿을 수 있지만,
표시가 없다고 물이 아닌 건 아니다." 데이터에 `confidence: consensus`가 아니라 **부분 커버리지**임을 명시해야 한다.

### 1-3. `valentinps/satisfactorymap` — **추출 방법의 교과서, 코드는 못 씀(AGPL)**

| 항목 | 값 |
|---|---|
| URL | https://github.com/valentinps/satisfactorymap |
| 라이선스 | **AGPL-3.0** — MIT 저장소에 코드 이식 **불가** |
| ⭐ / 최근 push | 4 / 2026-08-03 (활발) |
| 스택 | Rust → WASM, 완전 클라이언트 사이드. "600k 오브젝트 세이브를 8초에 로드, 기존 대비 13배" |

코드는 못 쓰지만, `game_data/extractors/*.py`의 **독스트링이 이 생태계 최고 수준의 기술 문서**다.
저작권은 문장에 붙지 사실에 붙지 않으므로, **어떤 게임 에셋에 어떤 사실이 들어있는지**는 가져올 수 있다.
확인한 사실들(실측 — 소스 헤더 직접 읽음):

| 알아낸 사실 | 근거 위치 |
|---|---|
| **동굴은 액터가 아니다.** 세이브에도 `Docs.json`에도 "여기 동굴 있음"이라는 정보가 없다. 유일한 출처는 `<Content>/FactoryGame/Map/GameLevel01/` 쿡된 월드파티션 익스포트 | `extract_caves.py` |
| 동굴 판별 신호 4가지: ① `FGAtmosphereVolume` 중 `Biome_Atmosphere_Cave_Main`/`_Cave_Desert` 상속(157개 중 108개, 약 25개는 손으로 붙인 이름까지 있음) ② `BP_CaveFloor_C` 스플라인 터널 ③ 동굴 전용 폴리지(`*Cave*` 메시)의 `CachedBounds` 약 3,400개 ④ 동굴 암석 키트 StaticMeshActor | 〃 |
| **월드 경계**는 `FGDamageOverTimeVolume` 중 `mDotClass = BP_DoTWorldPerimeter_C` 15개(벽 11 + 천장/바닥 4). 북동쪽 큰 빈 땅에 자원 노드가 없는 건 **거기 서 있으면 안 되기 때문** | `extract_world_bounds.py` |
| **물**은 `FGWaterVolume` 279개 전부 `mResourceClass = Desc_Water_C`. 눈에 보이는 바다는 `BPW_OceanSplineTool_02_C` 31개 패치(최대 51km×34km)로 그려지지만 실제 수역은 맵 중심 8km 이내에서 끝난다 — **보이는 바다와 추출 가능한 물이 다르다** | 〃 |
| **크리처 스포너**는 세이브에 2,277개 액터가 다 있지만, **세이브는 어떤 크리처가 나오는지 말해주지 않는다**(save 쪽 `SpawnData`는 스트리밍된 인스턴스만 가리킴). `mCreatureClass`는 쿡된 레벨 데이터에만 있다. 크랩 해처(398+151)는 스포너가 아니라 크리처 액터가 직접 배치돼 있다 | `extract_spawners.py` |
| 크리처 이름은 `Docs.json`에 아예 없다. `FGCreatureDescriptor` + `Localization/StringTables/World_Data.csv`(pak 안의 루즈 파일, FModel 일반 export로는 안 나옴 → raw-data export 필요) | 〃 |
| 703개 월드 픽업의 **내용물은 어떤 추출로도 못 얻는다** — 쿡된 `FInventoryItem` 구조체를 FModel이 못 읽어서, 이 프로젝트는 세이브에서 배워 `curated/pickupItems.json`에 손으로 쌓고 있다 | `game_data/README.md` |

또한 `SCHEMA.md`에 우리가 이미 밟았거나 밟을 함정이 문서화돼 있다(**교차검증용으로 읽을 가치가 크다**):
- 페이즈 5 우주 엘리베이터 부품 레시피는 `mVariablePowerConsumption*` 값을 갖고 있지만 **게임이 무시한다**
  (블렌더/제조기는 75/55MW 고정). `FGBuildableManufacturerVariablePower` 기계에서만 적용됨 — 원본 데이터의 함정
- `Desc_Geyser_C`는 실존하지 않는 합성 키다. 간헐천은 `FGResourceDescriptor` 자체가 없다
- `stackSize` 열거형(`SS_ONE`…`SS_FLUID`)은 게임 데이터가 실제 개수까지 이미 계산해 준다

### 1-4. `Hirashi3630/satisfactory_node_heatmap` — MIT 노드 좌표 덤프

| URL | https://github.com/Hirashi3630/satisfactory_node_heatmap |
|---|---|
| 라이선스 | **MIT** · ⭐0 · 2025-09-11 (정체 1년) · JS + Leaflet `CRS.Simple` |

`resources/nodes_vanilla.json` (233KB) 스키마 (실측):
```json
{ "id": "BP_ResourceNode100", "name": "Crude Oil", "class_name": "Desc_LiquidOil_C",
  "purity": "Normal", "enum_purity": "RP_Normal", "resource_form": "Liquid",
  "node_type": "Node", "exploited": false,
  "location": { "x": 178265.375, "y": 206095.64, "z": -9238.57, "rotation": 123.25 } }
```
- 추출 방법이 **Ficsit Networks 모드로 인게임에서 뽑은 것**이라, 게임 파일 파싱 없이 얻은 독립 소스다
  → 우리 `resource-nodes.json`(rockfactory 출처)의 **교차검증용 3자 소스**로 가치가 있다
- `enum_purity`의 게임 원본 오타 `RP_Inpure`(Impure 아님)가 그대로 보존돼 있다 — 진짜 게임 데이터라는 방증
- 단 `exploited` 필드는 전부 `false`(추출 시점 값), 접근성 정보는 없다

### 1-5. `SatisfactoryTools/world-data-generator` (= `Konsl/satisfactory-world-generator`)

| URL | https://github.com/Konsl/satisfactory-world-generator (⭐11) / SatisfactoryTools 미러(⭐0) |
|---|---|
| 라이선스 | **분할**: 랜덤화 알고리즘 `src/*.rs` + 추출 스크립트 `scripts/` = **MIT**, 뷰어 앱 `src/app/*.rs` = **GPL-3.0** |
| 최근 push | 2026-07-08 · Rust · 게임 1.2+ 전용 |

1.2에서 추가된 **랜덤 월드 모드의 노드 분포를 재현**하는 도구. 데이터 자체는 저장소에 없고
(`scripts/README.md`: "idk if i can include the default world resource node data"), CUE4Parse로 직접 추출하게 돼 있다.
- **우리가 랜덤 월드를 지원할 계획이 없다면 지금은 쓸 일이 없다.** 다만 `scripts/extract.cs`(MIT)는
  CUE4Parse로 게임 pak에서 노드/텍스처를 뽑는 **가장 최신 예제 코드**이고, UE 5.6 파싱을 위해
  CUE4Parse `1.2.2.21`(nuget 최신 `1.2.2`는 UE5.6 파싱 실패) + oodle DLL이 필요하다는 실전 정보가 있다

### 1-6. 지형 고도(heightmap)

- [`moritz-h/satisfactory-3d-map`](https://github.com/moritz-h/satisfactory-3d-map) (**GPL-3.0**, ⭐52, 2026-04-10)에
  `map/resources/textures/Map/HeightData_Test.png` (1.19MB)와 맵 타일 4장(`Map_0-0` ~ `Map_1-1`, 각 4~6MB)이 있다.
  **GPL-3.0 저장소이므로 에셋을 그대로 가져오면 안 된다.**
- 같은 저장소의 `map/resources/models/*.glb`는 파운데이션 8x1/8x2/8x4, 램프, 벽, 스플리터, 전봇대,
  컨베이어/파이프/선로 스플라인 메시 — **직접 만든 저폴리 프리미티브**다(게임 메시 아님). 역시 GPL.
- **결론: 오픈소스로 자유롭게 쓸 수 있는 Satisfactory 고도 맵은 없다.**

---

## 2. 게임 데이터 저장소 (Docs.json 파생물)

우리가 이미 `Docs.json` → `scripts/build-data.mjs` → `build-app-data.mjs`로 직접 만들고 있으므로,
아래는 **교차검증 소스**로서의 가치로 평가한다.

| 저장소 | ⭐ | 라이선스 | 최근 push | 데이터 | 우리에게 |
|---|---|---|---|---|---|
| [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics) | 57 | **MIT** | 2026-06-09 | `WorldResourceNodes.json`(169KB), `WorldCollectibles.json`(415KB), `FactoryRecipes/Schematics`, `docs-en/it.json`(5MB) | **이미 사용 중**. 우리는 `fx/fy`만 쓰고 있는데 원본에 **`z`(고도)와 `rotation`이 있다**(실측) → 고도 활용 여지 |
| [adepierre/ficsit-companion](https://github.com/adepierre/ficsit-companion) | 49 | **MIT** | 2026-06-14 | `assets/satisfactory.json`(201KB, `"version": "1.2"`), 아이템 아이콘 PNG 다수 | 데이터는 MIT지만 **아이콘은 CSS 재산이라고 README가 명시**. `somersloop_mult`, `power_exponent`(1.321929), `somersloop_power_exponent`(2.0), `production_multiplied` 같은 **소머슬룹/오버클럭 상수 교차검증에 유용** |
| [SatisfactoryTools/DocsParser](https://github.com/SatisfactoryTools/DocsParser) | 0 | **MIT** | 2026-07-10 | PHP 파서 라이브러리 | 우리 스택(Node)과 안 맞음. 필드 매핑 참고만 |
| [satisfactory-dev/Docs.json.ts](https://github.com/satisfactory-dev/Docs.json.ts) | 2 | **Apache-2.0** | **2026-08-16** | Docs.json의 TypeScript 타입 정의 | **우리 스택과 정확히 맞고 가장 최근에 갱신됨.** 우리 파서의 타입 안전성을 올리는 데 바로 쓸 수 있는 유일한 후보 |
| [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools) | 529 | **NOASSERTION** | 2026-03-29 | `data/data.json` | ⚠️ LICENSE 원문(실측): 코드는 MIT지만 **"Any forks or derivative works are not permitted to use the copyrighted material"** — `www/assets/images/items` 이미지는 **포크에서 사용 금지 명시**. 데이터도 1.1까지만 |
| [emingbt/ficsit-db](https://github.com/emingbt/ficsit-db) | 7 | MIT | 2026-01-02 | `json/data.json`(783KB) | 인게임 백과사전형. 우리 Codex와 목적이 겹침. 참고 수준 |
| [lunafoxfire/satisfactory-docs-parser](https://github.com/lunafoxfire/satisfactory-docs-parser) | 13 | MIT | 2024-10-08 | npm 파서 | ⚠️ 2년 정체, 1.0 이전 기준. **의존성으로 넣지 말 것** |
| [satisfactory-factories/application](https://github.com/satisfactory-factories/application) | 52 | **AGPL-3.0** | 2026-08-20 | 웹 생산 플래너 | ❌ AGPL — 코드·데이터 이식 불가 |

---

## 3. 에셋 (아이콘, 스프라이트, 평면도, 실측 크기)

### 3-1. 결론: **탑뷰 스프라이트도, 메시에서 뽑은 평면도도 오픈소스에 존재하지 않는다**

`satisfactory topdown sprite` / `satisfactory footprint` / `satisfactory 3d model mesh` 검색 결과 **0건**.
아무도 만들지 않았다. 배치판이 필요로 하는 "위에서 본 건물 도형"은 우리가 만들어야 한다.

**다행히 그 원료는 이미 우리 손에 있다.** `src/data/app/buildings.json`(539건)이 이미
`footprint.boxes[]`(`xM, yM, zM, widthM, lengthM, heightM`) + `hardBoxes`/`softBoxes` 개수를 담고 있고,
이건 `Docs.json`의 `mClearanceData`에서 직접 뽑은 값이다(`docs/research/clearance-rules.md` 참고).
즉 **실측 클리어런스 박스는 남에게 얻을 필요가 없는 영역**이고, 탑뷰 도형은 이 박스들을 XY로 투영하면 나온다.

참고로 `valentinps`의 `SCHEMA.md`도 같은 필드를 다르게 부른다: `dimensions: {Width, Height, AngularDepth}`,
`clearance: [{min, max}]`, `adaptiveLength: {}`. **`AngularDepth`와 `adaptiveLength`는 우리가 안 쓰고 있는 필드**다
(컨베이어 폴/벽 컨베이어 같은 가변 길이 건물용으로 보임) — 우리 배치판이 벽 컨베이어를 다룰 때 확인할 것.

### 3-2. 아이콘 — 합법적인 경로는 "사용자 자기 게임에서 뽑기"뿐

| 저장소 | 라이선스 | 최근 push | 평가 |
|---|---|---|---|
| [relyen-dev/satisfactory-icon-extractor](https://github.com/relyen-dev/satisfactory-icon-extractor) | **MIT** | 2026-05-20 | C#. **로컬 게임 설치본에서** 아이템 아이콘을 뽑는 CLI. 부수적으로 `ResourceNodeCatalogExtractor`, `MapExtractionService`, `IconPackValidator`까지 있다. 게임 자산을 재배포하지 않고 사용자가 직접 뽑게 하는 **유일하게 깨끗한 패턴** |
| [satisfactory-dev/asset-http](https://github.com/satisfactory-dev/asset-http) | **Apache-2.0** | 2026-04-28 | C#. CUE4Parse로 게임 pak을 열어 **HTTP로 에셋을 서빙**. 로컬 개발 중 아이콘을 즉석에서 꺼내 볼 때 유용 |
| [SatisfactoryTools/AssetsExtractor](https://github.com/SatisfactoryTools/AssetsExtractor) | **MIT** | 2026-07-10 | PHP 추출 파이프라인. DocsParser와 짝 |
| [prosser/SatisfactoryExtractor](https://github.com/prosser/SatisfactoryExtractor) | MIT | 2022-04-27 | umodel 바이너리 동봉. **4년 정체**, 1.0 이전 |
| [DavidHGillen/Satisfactory_ModelingTools](https://github.com/DavidHGillen/Satisfactory_ModelingTools) | **없음** | 2024-08-13 | ⭐18이지만 라이선스 없음 → 사용 불가 |
| [oliyy/SatisfactoryIcons](https://github.com/oliyy/SatisfactoryIcons) | **없음** | 2026-06-25 | 182MB 아이콘 팩(Material/Lucide/Phosphor 심볼을 게임 사인용으로 변환). 라이선스 없음 |
| [SyBozz/Satisfactory-Icons](https://github.com/SyBozz/Satisfactory-Icons) | MIT | 2024-12-15 | Lua 테이블(FicsIt-Networks EEPROM용 인게임 아이콘 **이름 목록**). 이미지가 아니라 문자열 목록 |

> **재확인**: 게임 이미지 자산은 어느 저장소를 거쳐도 MIT가 되지 않는다. `greeny/SatisfactoryTools`의 LICENSE는
> 이 점을 가장 분명하게 못박아 뒀다("포크는 이 이미지를 쓸 수 없다"). 우리는 이미 CLAUDE.md 규칙 4로 같은 원칙을
> 세워 뒀고(`public/assets/`는 공식 위키 출처 명기), 이번 조사가 그 판단이 옳았음을 확인해 준다.

---

## 4. 세이브 파일 도구 — 우리가 못 읽고 있는 것이 있나

### 4-1. 실측: 우리 파서로 세이브에서 무엇이 나오는가

`@etothepii/satisfactory-file-parser@4.1.2`로 실제 세이브(`111_autosave_0.sav`, 507KB, 1.1 계열, 4,521 오브젝트,
559 레벨)를 파싱해 클래스별 개수를 세어 봤다(실측):

| 클래스 | 개수 | 의미 |
|---|---|---|
| `BP_ResourceNode_C` | **459** | MapInfo의 노드 수 459와 **정확히 일치** |
| `BP_BerryBush_C` | 445 | 열매 |
| `BP_CreatureSpawner_C` | 316 | 크리처 스포너 (전체는 2,277개 — **이 세이브엔 일부만**) |
| `BP_ResourceDeposit_C` | 247 | 손채굴 광맥 |
| `BP_Shroom_01_C` | 166 | 버섯 |
| `BP_Crystal_C` / `mk2` / `mk3` | 128 / 73 / 47 | 파워 슬러그 (합 248, MapInfo는 1,242 — **불완전**) |
| `BP_NutBush_C` | 126 | 견과 |
| **`BP_SporeFlower_C`** | **125** | **포자꽃 — 위험 지역이 세이브에 들어있다** |
| `BP_FrackingSatellite_C` / `Core_C` | 118 / 17 | 자원 정 |
| `Char_CrabHatcher_C` / `BigCrabHatcher_C` | 85 / 36 | 크랩 해처 |
| `BP_DropPod_C` | 39 | 드롭포드 (MapInfo는 404 — **불완전**) |
| `BP_ResourceNodeGeyser_C` | 31 | 간헐천 |
| **`BP_GasPillar_*`** | **0** | ❌ 세이브에 없다 |
| `BP_DestructibleSmallRock/LargeRock` | 0 | ❌ 세이브에 없다 |

**여기서 나온 결론 세 가지**

1. **포자꽃(위험 지역)은 세이브에서 읽을 수 있다.** 우리는 이미 세이브를 파싱하고 있으므로,
   추가 의존성 없이 "이 노드 근처에 포자꽃이 있다" 경고를 넣을 수 있다. — **바로 실행 가능한 개선**
2. **가스 기둥은 세이브에 없다.** MapInfo에서 그 경로명이 `Persistent_Exploration_2:PersistentLevel.BP_GasPillar_12`인
   것과 일치한다 — 세이브에 직렬화되지 않는 별도 서브레벨 소속이다. 게임 pak 추출 없이는 못 얻는다
3. **슬러그·드롭포드 개수는 세이브마다 다르다**(248/1242, 39/404). 탐사·수집 진행도에 따라 달라지므로
   **세이브를 "월드 데이터의 출처"로 쓰면 안 되고, "진행 상황의 출처"로만 써야 한다.** 우리가 이미 그렇게 하고 있다

### 4-2. 대안 파서 — 결론 변경 없음

`docs/research/save-parsers.md`의 결론(`@etothepii/satisfactory-file-parser` 채택)은 유효하다. 갱신 사항만:

| 저장소 | ⭐ | 라이선스 | 최근 push | 비고 |
|---|---|---|---|---|
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | 31 | MIT | 2026-07-26 | 현행 채택. 세이브 + `.sbp` 블루프린트 양방향 |
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | 39 | GPL-3.0 | 2026-08-15 | 1.2.0~1.2.2.1 명시 지원, 가장 최신. **GPL이라 코드 이식 불가**, 포맷 사실 참고만 |
| [moritz-h/satisfactory-3d-map](https://github.com/moritz-h/satisfactory-3d-map) `docs/SATISFACTORY_SAVE.md` | 52 | GPL-3.0 | 2026-04-10 | **공개된 세이브 포맷 명세 중 가장 완전하다**(73KB). 헤더/청크/TOCBlob/DataBlob, `AFGConveyorChainActor`·`AFGLightweightBuildableSubsystem`·`FPropertyTypeName`까지 프로퍼티 단위로 문서화. 코드가 아니라 **포맷 사실의 레퍼런스**로 읽을 것 |
| [valentinps/satisfactorymap](https://github.com/valentinps/satisfactorymap) | 4 | AGPL-3.0 | 2026-08-03 | 세이브 수집기 목록이 시사적: `buildings.rs`, `lines.rs`, `trains_progression.rs`, `world.rs` — **기차 진행도**는 우리가 안 읽는 항목 |
| [Sleavely/satisfactory-savegame-prometheus-exporter](https://github.com/Sleavely/satisfactory-savegame-prometheus-exporter) | 8 | MIT | 2026-06-12 | 세이브 → Prometheus 메트릭. npm/Docker 배포. 시계열로 공장을 추적하는 접근 자체가 참고감 |
| [Goz3rr/SatisfactorySaveEditor](https://github.com/Goz3rr/SatisfactorySaveEditor) | 305 | **없음** | 2024-08-17 | 가장 유명하지만 **라이선스 없음 + Update 6/7도 미지원 상태로 방치**. 사용 불가 |

---

## 5. 계산·최적화

`docs/research/eco-github.md` 2장의 결론이 유효하다. 갱신·추가만:

| 저장소 | ⭐ | 라이선스 | 최근 push | 내용 |
|---|---|---|---|---|
| [0xjc/SatisfactoryLP](https://github.com/0xjc/SatisfactoryLP) | 2 | MIT | 2026-07-18 | `scipy.optimize.milp` MILP. **공개된 것 중 가장 정교**. 1.2.3.1 빌드 495413 데이터 동봉. 컨베이어 한계를 변수가 아니라 **열 생성 단계에서 클록 선택지를 잘라** 처리하는 기법이 핵심 |
| [adepierre/ficsit-companion](https://github.com/adepierre/ficsit-companion) | 49 | MIT | 2026-06-14 | 노드 기반 플래너(C++/ImGui → WASM). **분수 연산 클래스**(`fractional_number.cpp`)로 부동소수점 오차를 피한다 — 우리 `Math.ceil(x - 1e-9)` 관례와 비교해 볼 만한 대안 |
| [IceMoonMagic/Satisfactory-Splitter-Calculator](https://github.com/IceMoonMagic/Satisfactory-Splitter-Calculator) | **47** | **MIT** | 2025-11-01 | **벨트를 임의 비율로 쪼개는 스플리터 트리를 계산**한다. 로드 밸런서 대 매니폴드 논의(`guides-reddit-manifold.md`)에 붙일 수 있는 유일한 실행 가능 도구 |
| [ScottJDaley/ada](https://github.com/ScottJDaley/ada) | 34 | MIT | 2026-06-03 | Python Discord 봇 + 생산 최적화 |
| [Sankeyfactory](https://github.com/Sankeyfactory/sankeyfactory.github.io) | 31 | GPL-3.0 | 2025-03-21 | 생키 다이어그램 뷰. ❌ GPL |
| [Zistack/Satisfactory-Optimizer](https://github.com/Zistack/Satisfactory-Optimizer) | 16 | **없음** | 2026-03-19 | ❌ 라이선스 없음 |
| [erp-for-factory-games/ErpForFactoryGames](https://github.com/erp-for-factory-games/ErpForFactoryGames) | 1 | MIT | 2026-08-09 | ERP 스타일 생산 플래너. 활발 |

**벨트/매니폴드 시뮬레이터는 없다.** 아이템 단위로 벨트 흐름을 시뮬레이션하는 오픈소스 프로젝트를
찾지 못했다. `MichaelKvalvik/belt-balancer`(MIT, 2026-05-09)는 밸런서를 가르치는 **퍼즐 게임**이지 시뮬레이터가 아니다.

---

## 6. 레이아웃·청사진

레이아웃 에디터는 **개수는 많고 쓸 만한 건 없다**. 검색된 20여 개 중 ⭐5 이상이 하나도 없고,
대부분 미완성이거나 라이선스가 없다.

| 저장소 | ⭐ | 라이선스 | 최근 push | 평가 |
|---|---|---|---|---|
| [HandleLabs/nexus-satisfactory-layout-tool](https://github.com/HandleLabs/nexus-satisfactory-layout-tool) | 4 | **AGPL-3.0 + 추가 조항** | 2026-05-01 | 다층 레이아웃 플래너. LICENSE 원문 확인: AGPL 7조 추가 조항(`docs/legal/ADDITIONAL_TERMS.md`)까지 붙어 있다 → ❌ 완전 배제 |
| [minvdev/SatisGrid](https://github.com/minvdev/SatisGrid) | 0 | MIT | 2026-05-06 | 격자형 레이아웃 플래너. 초기 단계 |
| [kentskinner/satisfactory-planner](https://github.com/kentskinner/satisfactory-planner) | 1 | 없음 | 2026-07-11 | 격자 배치 + **지하 벨트 라우팅** + 완공 시간 계산. 아이디어는 우리와 가장 가깝지만 라이선스 없음 |
| [vicvillalobos/satisfactory-layout-designer](https://github.com/vicvillalobos/satisfactory-layout-designer) | 0 | MIT | 2022-08-12 | 4년 정체 |
| [jsnns/satisfactory-designer](https://github.com/jsnns/satisfactory-designer) | 5 | 없음 | 2021-11-06 | 5년 정체 |

**청사진(SBP) 파서**: `@etothepii/satisfactory-file-parser`가 `.sbp`/`.sbpcfg`를 **읽고 쓴다**(이미 우리 의존성).
`GreyHak/sat_sav_parse`(GPL)도 `.sbp`를 읽는다. 그 외:
- [SatisfactoryFrance/satisfactory_blueprint_manager](https://github.com/SatisfactoryFrance/satisfactory_blueprint_manager) — Apache-2.0, ⭐8, 2026-03-05, 블루프린트 파일 관리 GUI
- [Eldon27232/satisfactory-blueprint-organizer](https://github.com/Eldon27232/satisfactory-blueprint-organizer) — MIT, ⭐5, 2026-06-03, 중국어권
- [ZeeOcho/VerticalConveyorAutoConnect](https://github.com/ZeeOcho/VerticalConveyorAutoConnect) — GPL-3.0, 2026-08-16, 블루프린트 경계 넘어 수직 컨베이어 자동 연결

**자동 배치 알고리즘**: 공개된 것이 없다. 우리 배치기(packer)에 참고할 선행 구현은 이 생태계에 존재하지 않는다.

---

## 7. 한국어 자원 — **없다**

| 검색어 | 결과 |
|---|---|
| `새티스팩토리` / `사티스팩토리` | **0건** |
| `satisfactory 한국어` | **0건** |
| `satisfactory 공략` | 0건(무관한 저장소 1건) |
| `satisfactory 게임` | `kunho-park/satisfactory_discord_sync`(MIT, 서버 모니터링 디스코드 봇), 그리고 **우리 저장소** |

중국어권은 활발하다(`Sunset1014/Satisfactory-Production-Planner` MIT 중영 이중언어,
`fcsha/satisfactory-workbench`, `taciturn-hg/SatisfactoryTools`, `YPSO-org/Satisfactory` 건설 표준 등).
러시아어 공략도 있다(`Siberian-Titan/satisfactory-guide`, Apache-2.0, 대체 제작법 가이드).
**한국어만 비어 있다.**

→ **ADR-0017의 판단(게임 공식 `ko.json`이 한글 표기의 정본)이 재확인됐다.** 대조할 커뮤니티 표준 자체가
존재하지 않으므로, 게임 로케일 외의 출처를 찾을 이유가 없다.

부수적으로 우리 저장소의 GitHub 라이선스 감지가 `NOASSERTION`으로 잡힌다(실측 — `gh api repos/edssert/satisfactory-ops`).
`package.json`은 `"license": "MIT"`인데 LICENSE 파일에 게임 자산 관련 문구가 섞여 있으면 감지기가 이렇게 잡는다
(`greeny/SatisfactoryTools`와 같은 현상). 의도한 것이면 그대로 두고, 아니면 LICENSE를 순수 MIT로 두고
자산 고지를 `NOTICE`로 분리하는 편이 검색·신뢰도에 낫다.

---

## 8. `awesome-satisfactory` 목록에 대한 경고

[Tassil0/awesome-satisfactory](https://github.com/Tassil0/awesome-satisfactory) (MIT, ⭐0, 2025-11-02)를 열어 확인한 결과
**신뢰할 수 없다**. 실측한 오류:
- SCIM을 `github.com/moritz/satisfactory-calculator`로 링크 — **존재하지 않는 저장소**
- satisfactory-calculator.com을 "Satisfactory Tools", satisfactory.gg를 "Satisfactory Calculator"로 **뒤바꿔 설명**
- `satisfactory-planner.com`, `satisfactory-blueprints.com`, `daniel2013.github.io/satisfactory` 등 미확인 링크 다수
- 위키 URL을 `satisfactory.fandom.com`(구 위키)으로 안내

**이 목록을 출처로 인용하지 말 것.** 이 조사가 GitHub API 실측으로 진행된 이유이기도 하다.

---

## 9. 당장 쓸 수 있는 것 5개 (우선순위 순)

### 1위 — `mellox/NodeShuffle`의 물/동굴 격자 (**MIT**)
`Source/NodeShuffle/Private/NodeShuffleBakedData.h`. 100m 물/육지 격자 1,865셀 + 8m 동굴 바닥 2,660셀 +
동굴 노드 시드 722개. **라이선스가 깨끗하면서 "노드 접근성"에 답하는 유일한 데이터**이고, `BP_ResourceNode###`
아이디가 우리 `resource-nodes.json`과 그대로 조인된다. 단 커버리지가 맵의 약 38%라는 사실을 데이터에 명시해야 한다.

### 2위 — 우리 세이브 파서로 포자꽃 125개 읽기 (**의존성 0, 코드 몇 줄**)
실측으로 확인했다: `BP_SporeFlower_C` 125개가 평범한 세이브에 들어 있다. 이미 `@etothepii` 파서를 쓰고 있으므로
**새 라이선스도 새 의존성도 필요 없다.** "이 노드 옆에 포자꽃이 있다" 경고를 오늘 붙일 수 있다.
(가스 기둥·파괴 가능 바위는 세이브에 없어 이 경로로는 못 얻는다.)

### 3위 — `moritz-h/satisfactory-3d-map`의 `docs/SATISFACTORY_SAVE.md` (**GPL-3.0 저장소, 문서만 참고**)
공개된 세이브 포맷 명세 중 가장 완전하다. 우리 세이브 진단이 놓치는 필드(`AFGConveyorChainActor`,
`AFGLightweightBuildableSubsystem` 등)를 확인하는 레퍼런스. **코드는 복사 금지, 포맷 사실만 참고**(클린룸).

### 4위 — `satisfactory-dev/Docs.json.ts` (**Apache-2.0**, 2026-08-16 갱신)
Docs.json의 TypeScript 타입 정의. 우리 스택과 정확히 맞고, 게임 데이터 파서 계열 중 **가장 최근에 갱신된**
저장소다. `build-data.mjs`의 타입 안전성을 올리는 데 바로 쓸 수 있다.

### 5위 — `Hirashi3630/satisfactory_node_heatmap`의 `nodes_vanilla.json` (**MIT**)
Ficsit Networks 모드로 인게임에서 뽑은 노드 덤프 — rockfactory와 **추출 경로가 다른 독립 소스**다.
우리 노드 데이터를 3자 대조해 `confidence: verified`의 근거를 하나 더 만들 수 있다. `z`(고도)와 `rotation`도 있다.

---

### ⚠️ 순위에 못 넣은 이유가 오직 라이선스인 것 — `MapInfo.json`

기능만 보면 **압도적 1위**다. 동굴 폴리곤 104개 + 입구 좌표, 가스 기둥 831개, 포자꽃 651개, 파괴 가능 바위 113개,
도로 111개, 시작 지역 4곳, 월드 경계, 전력 필요 드롭포드 23개 — 우리가 "노드 접근성"으로 원하던 것이 전부 들어 있다.

**그런데 쓸 수 없다.** 이 데이터는 AnthorNet(satisfactory-calculator.com) 소유이고, 같은 저자의 SC-InteractiveMap이
*"Reuse of the source code **and data assets** is not permitted in any case"*라고 명시한다.
`0xjc/SatisfactoryLP`가 MIT로 재배포하고 있지만, **제3자 데이터는 재배포자의 라이선스를 따라가지 않는다.**

같은 사실을 합법적으로 얻으려면 **게임 pak을 직접 추출**해야 하고, 그 방법은
`valentinps/satisfactorymap`의 추출기 독스트링이 정확히 알려준다(§1-3):
`FGAtmosphereVolume`/`Biome_Atmosphere_Cave_*`(동굴), `FGWaterVolume`(물), `FGDamageOverTimeVolume`/
`BP_DoTWorldPerimeter_C`(경계), `BP_CreatureSpawner_C.mCreatureClass`(크리처).
필요 도구는 FModel + CUE4Parse `1.2.2.21` + oodle DLL이다. **작지 않은 작업이지만, 라이선스가 깨끗한 유일한 길이다.**

---

## 10. 남은 확인 필요 항목 (지어내지 않고 열어둠)

1. `MapInfo.json`의 `obstructed`가 실제로 무엇을 뜻하는지 — 이 스냅샷에서 284건 전부 `false`라 의미 확정 불가.
   SCIM UI에서 이 값이 어떻게 표시되는지 봐야 안다
2. `NodeShuffle` 물 격자의 정확한 커버리지 — "맵 전체가 70×70셀"이라는 전제 자체가 추정이다.
   `worldBounds`와 대조해야 정확한 비율이 나온다
3. `CaveFloorsChunks`의 `cells` 5번째 필드(`-1` 또는 양수)와 `seedCount: 27` vs `seeds` 722개의 불일치 — 미해석
4. `BP_CreatureSpawner_C`가 세이브에 316개만 나온 이유 — valentinps는 "모든 세이브에 2,277개가 다 있다"고 하는데
   실측은 316개였다. 세이브가 초반이라 그런 건지, 파서가 일부만 노출하는 건지 확인 필요
5. `satisfactory-dev/Docs.json.ts`의 1.2 스키마 대응 여부 — 저장소가 활발한 것만 확인했고 타입 파일 내용은 미검증
6. `adepierre/ficsit-companion`의 `power_exponent = 1.321929`가 우리 데이터와 일치하는지 실제 대조 미실시

---

## 11. 이번 조사에서 확인한 URL 전체

**월드 데이터**
- https://github.com/mellox/NodeShuffle
- https://github.com/valentinps/satisfactorymap
- https://github.com/Hirashi3630/satisfactory_node_heatmap
- https://github.com/0xjc/SatisfactoryLP · https://static.satisfactory-calculator.com/data/json/mapData/en-Stable.json
- https://github.com/Konsl/satisfactory-world-generator · https://github.com/SatisfactoryTools/world-data-generator
- https://github.com/moritz-h/satisfactory-3d-map
- https://github.com/James-Oswald/SatisfactoryMST · https://github.com/satisfactory905/satisfactory-kmean-clusters
- https://github.com/DrunkenCorsar/SatisfactoryNodeEditor

**게임 데이터**
- https://github.com/rockfactory/satisfactory-logistics · https://github.com/adepierre/ficsit-companion
- https://github.com/SatisfactoryTools/DocsParser · https://github.com/SatisfactoryTools/AssetsExtractor
- https://github.com/satisfactory-dev/Docs.json.ts · https://github.com/satisfactory-dev/asset-http
- https://github.com/satisfactory-dev/Fetch-Docs.json · https://github.com/satisfactory-dev/MapareatexturePersistentLevel.json-parser
- https://github.com/greeny/SatisfactoryTools · https://github.com/emingbt/ficsit-db
- https://github.com/lunafoxfire/satisfactory-docs-parser · https://github.com/vassbo/satisfactory-factories

**에셋**
- https://github.com/relyen-dev/satisfactory-icon-extractor · https://github.com/prosser/SatisfactoryExtractor
- https://github.com/DavidHGillen/Satisfactory_ModelingTools · https://github.com/DavidHGillen/Satisfactory_IconCapture
- https://github.com/oliyy/SatisfactoryIcons · https://github.com/SyBozz/Satisfactory-Icons
- https://github.com/QuingKhaos/SatisfactoryAssets · https://github.com/QuingKhaos/KhaosIconMaker

**세이브**
- https://github.com/etothepii4/satisfactory-file-parser · https://github.com/GreyHak/sat_sav_parse
- https://github.com/Sleavely/satisfactory-savegame-prometheus-exporter · https://github.com/Goz3rr/SatisfactorySaveEditor
- https://github.com/R3dByt3/SatisfactorySaveNet · https://github.com/ficsit-felix/satisfactory-json

**계산·레이아웃**
- https://github.com/IceMoonMagic/Satisfactory-Splitter-Calculator · https://github.com/ScottJDaley/ada
- https://github.com/satisfactory-factories/application · https://github.com/Sankeyfactory/sankeyfactory.github.io
- https://github.com/HandleLabs/nexus-satisfactory-layout-tool · https://github.com/minvdev/SatisGrid
- https://github.com/kentskinner/satisfactory-planner · https://github.com/erp-for-factory-games/ErpForFactoryGames
- https://github.com/MichaelKvalvik/belt-balancer

**청사진·기타**
- https://github.com/SatisfactoryFrance/satisfactory_blueprint_manager · https://github.com/Eldon27232/satisfactory-blueprint-organizer
- https://github.com/ZeeOcho/VerticalConveyorAutoConnect · https://github.com/Tassil0/awesome-satisfactory (⚠️ 신뢰 불가)
- https://github.com/satisfactorymodding/SatisfactoryModLoader · https://github.com/AnthorNet/SC-InteractiveMap
- https://github.com/Sunset1014/Satisfactory-Production-Planner · https://github.com/Siberian-Titan/satisfactory-guide
- https://github.com/WuphonsReach/satisfactory-game-guide (CC-BY-SA-4.0 — 문장 인용 시 카피레프트 전이)
