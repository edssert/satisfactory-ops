# 설치본 파생 그래프 스키마

## 노드

| 종류 | 안정 ID | 정본 |
|---|---|---|
| `package` | `package:<uasset 경로>` | `factory-assets.ndjson` |
| `export` | `export:<패키지>#<타입>:<이름>` | `factory-assets.ndjson` |
| `component` | `component:<패키지>#<이름>` | Blueprint 구성품 |
| `object` | `object:<게임 object path>` | 패키지 참조 |
| `material` | `material:<패키지>#<이름>` | 재질 인스턴스 |
| `building` | `building:<class>` | 생성 건물 데이터·장면 계약 |
| `item` | `item:<class>` | 생성 아이템 데이터 |
| `recipe` | `recipe:<class>` | 생성 레시피 데이터 |
| `scene` | `scene:<저장소 경로>` | 탑뷰 장면 레시피 |
| `asset` | `asset:<assetId>` | 탑뷰 자산 매니페스트 |
| `factory-settings` | `settings:<BP_FactorySettings 패키지>#<CDO>` | 설치본 FactorySettings CDO |
| `api-symbol` | `api:<클래스>#<심벌>` | 설치본 `CommunityResources/Headers.zip` |
| `port` | `port:<장면 경로>#<포트 ID>` | 장면 포트 계약 |
| `native-contract` | `native:<클래스>#<함수>` | 설치본 PDB/DLL 정적 분석 계약 |
| `runtime-probe` | `probe:<게임 CL>#<building class>` | 실제 게임 런타임이 해석한 component·instance·material·clearance 영수증 |

## 간선

`DECLARES`, `REFERENCES`, `HAS_COMPONENT`, `USES_STATIC_MESH`, `USES_SKELETAL_MESH`, `OVERRIDES_MATERIAL`, `MATERIAL_PARENT`, `USES_TEXTURE`, `CONFIGURES_CONNECTION_MESH`, `CONFIGURES_CONNECTION_MATERIAL`, `IMPLEMENTS_API`, `IMPLEMENTED_BY`, `ASSEMBLED_BY`, `PROBED_BY`, `PROBE_RESOLVES`, `CONSUMED_BY`, `SCENE_HAS_PORT`, `PORT_FROM_COMPONENT`, `USES_FACTORY_SETTINGS`, `DECLARED_BY`, `CONSUMES`, `PRODUCES`, `PRODUCED_IN`, `SCENE_FOR`, `SCENE_USES`, `ASSET_FOR`, `RENDERED_FROM`, `EXPOSED_BY`를 사용한다.

간선 `data`에는 관계를 만든 원본 필드와 필요한 경우 transform·재질 슬롯을 둔다. 사람이 타이핑한 게임 표시 이름이나 수치는 넣지 않는다.

## 질의

```text
node scripts/game-assets/game-graph.mjs build
node scripts/game-assets/game-graph.mjs building Build_ConstructorMk1_C
node scripts/game-assets/game-graph.mjs search ConveyorBeltMk1
node scripts/game-assets/game-graph.mjs trace building:Build_ConstructorMk1_C
node scripts/game-assets/game-graph.mjs port Build_ConstructorMk1_C Input0
node scripts/game-assets/game-graph.mjs check
```

포트 재구성은 일반 `trace` 대신 `port <buildingClass> <portId>`로 component transform, FactorySettings,
frame/arrow 저자 bounds, input/output material 부모와 Headers API를 한 번에 조회한다. `trace`는 기본적으로
작은 깊이만 탐색한다. 전체 그래프 덤프보다 설비·재질·텍스처·장면·자산의 필요한 경로를 선택한다.
