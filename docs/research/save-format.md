# Satisfactory 세이브 파일(.sav) 포맷 조사 — Update 1.2 기준

조사일: 2026-08-19 (세션 기준) · 조사자: Claude (subagent) · 목적: GitHub Pages 정적 사이트에서 **브라우저 내 JS만으로** `.sav`를 파싱해 진행도(마일스톤/스키매틱, MAM 연구, 대체 레시피, 건물 종류·수량, 점유 자원 노드, 하드드라이브/슬러그/소머슬룹 수)를 읽어오는 기능의 타당성과 구현 근거를 확보하는 것.

## 0. 결론 먼저 (TL;DR)

- **브라우저 단독 파싱은 실현 가능하다.** 압축은 zlib이고, 순수 JS zlib 구현체인 `pako`(MIT, 브라우저 호환)로 해제 가능함이 실제 오픈소스 파서(`@etothepii/satisfactory-file-parser`)로 검증됨. 서버·WASM 없이도 동작.
- **가장 적합한 기반 라이브러리**: `etothepii4/satisfactory-file-parser` (npm: `@etothepii/satisfactory-file-parser`, **TypeScript, MIT 라이선스**, U1.2까지 공식 지원 명시, README에 "Should work in browser as well" 명시, 의존성은 `pako`뿐). 이대로 그대로 쓰거나(MIT라 재배포·수정 허용), 로직만 참고해 자체 구현해도 됨.
- **가장 신뢰도 높은 포맷 명세 문서**는 `moritz-h/satisfactory-3d-map` 저장소의 `docs/SATISFACTORY_SAVE.md`. 문서 자체에 `Document Version: Satisfactory 1.2`라고 명시되어 있어 기준 버전과 정확히 일치. 단, 저장소 라이선스는 **GPL-3.0** — 코드를 그대로 가져다 쓰면 안 되고, "명세를 읽고 우리 코드를 새로 작성"하는 방식(clean-room 준수)이 안전함. 문서 자체 인용·요약은 문제없음.
- **압축 방식은 1.0/1.1/1.2에서 바뀌지 않았다.** zlib 그대로. 다만 청크 헤더가 UE5 전환(Update 8, ~2022-07) 때 v1(48B)→v2(49B, `CompressorNum` 1바이트 추가)로 바뀜. 이건 이미 완료된 과거 변경이고, 1.0 이후로는 청크 구조 자체는 안정적.
- **세이브 포맷은 업데이트마다 실제로 자주, 그리고 구조적으로 깨진다.** 커뮤니티 파서 CHANGELOG를 근거로: 1.1 릴리스에서 헤더 필드 추가·오브젝트 필드 개명·특수 프로퍼티 구조 변경 등 "Breaking Changes" 명시, 1.2 릴리스에서도 "Breaking Changes... properties quite a bit" 명시. **거의 매 마이너/메이저 업데이트마다 파서 재작업이 필요했던 이력**이 문서화되어 있음.
- 마일스톤/스키매틱/MAM 연구/대체 레시피/자원 노드 점유/수집품 카운트는 **범용 포맷 명세 문서에는 필드 단위로 나와 있지 않다.** 이들은 UE 리플렉션 기반 `List of Properties`(FGSchematicManager, FGResearchManager 등 싱글턴 액터의 프로퍼티) 안에 있으며, 정확한 프로퍼티 이름은 **별도로 실제 세이브를 덤프해 확인 필요**(확인 필요 항목으로 아래 명시).

---

## 1. 헤더 구조 (Save Header)

출처: `moritz-h/satisfactory-3d-map` `docs/SATISFACTORY_SAVE.md`(문서 버전: Satisfactory 1.2) + `@etothepii/satisfactory-file-parser` 소스(`satisfactory-save-header.ts`) 교차 검증. 두 소스가 필드·조건부 순서까지 완전히 일치함.

리틀엔디안. `SaveHeaderVersion`(=`saveHeaderType`) 값에 따라 뒤따르는 필드가 누적적으로 추가되는 구조(하위 호환 유지형 버전 게이팅).

| 순번 | 조건 (SaveHeaderVersion ≥) | 필드 | 타입 |
|---|---|---|---|
| 1 | (항상) | SaveHeaderVersion | int32 |
| 2 | (항상) | SaveVersion | int32 |
| 3 | (항상) | BuildVersion | int32 |
| 4 | **14** (U1.1, 2025-06-18 패치 도입) | SaveName | FString |
| 5 | (항상) | MapName | FString |
| 6 | (항상) | MapOptions | FString |
| 7 | (항상, ver≥4 이후 통합) | SessionName | FString |
| 8 | (항상) | PlayDurationSeconds | int32 |
| 9 | (항상) | SaveDateTime | FDateTime (.NET Ticks, UTC) |
| 10 | 5 | SessionVisibility | int8 (현재 미사용) |
| 11 | 7 (UE4.25 업그레이드, 2021-01-22) | EditorObjectVersion | int32 |
| 12 | 8 (모딩 지원 추가, 2021-03-24) | ModMetadata(JSON 문자열) + IsModdedSave | FString + bool |
| 13 | 10 (2022-03-22, 분석용 GUID) | SaveIdentifier | FString |
| 14 | 11 (2022-11-14, UE5 World Partition) | IsPartitionedWorld | bool(int32) |
| 15 | 12 (2023-03-08, 변조 감지) | SaveDataHash | FMD5Hash |
| 16 | 13 (2023-04-18, U8 실험판=최초 1.0 릴리스) | IsCreativeModeEnabled | bool(int32) |

- **U8 및 1.0**: `SaveHeaderVersion = 13`.
- **1.1**: `SaveHeaderVersion = 14` (SaveName 필드 신규 추가 — U1.1.1.1 패치, 빌드 418783, 2025-06-18).
- **1.2**: 헤더 버전 자체는 1.1과 동일선상(14)으로 유지된 것으로 보이나, **본문 `SaveVersion`(=custom version)이 계속 증가** — 예: `if SaveVersion >= 53` 조건이 1.2 관련 구조(`FSaveObjectVersionData`)에 등장. 정확한 1.2 `SaveHeaderVersion`/`SaveVersion` 숫자쌍(예: 1.1의 `SaveVersion=52`처럼)은 **확인 필요** — wiki.gg에는 1.1 시점 수치(header=14, save=52)만 명시돼 있고 1.2 특정 빌드 수치는 별도 실측 필요.
- `SaveVersion`은 게임 소스의 `SaveCustomVersion` enum 값과 대응. 이 enum은 2016년 시스템 도입부터 순차 증가하며, 각 항목에 실제 도입 날짜 주석이 달려 있음(예: `SaveFileIsCompressed`=2019-08-28 zlib 압축 도입, `Version1`=2024-06-04 "임의로 지정한 1.0 버전", `NewPlayerInfoHandleSerializationFormat`=2025-12-11, `FixNewPlayerInfoHandleSerializationFormat`=2025-12-12(현재 최신, 1.2 계열)).
- `BuildVersion`은 게임 빌드 번호(예: U1.0.0.3 = 빌드 368883, U1.1.1.1 = 빌드 418783). 1.2 시점 정확한 빌드 번호는 **확인 필요**.

---

## 2. 본문 압축 구조 (Chunks)

출처: `SATISFACTORY_SAVE.md` "Chunks" 절 + `@etothepii/satisfactory-file-parser`의 `save-body-chunks.ts` 실제 구현(양쪽 완전 일치, 실제 동작 코드로 재검증됨).

헤더 뒤에는 **zlib로 압축된 청크들이 연속**해서 온다. 청크 분할은 순전히 크기 기준이며 직렬화 내용과 무관.

청크 헤더 레이아웃:

| 필드 | 타입 | 값/의미 |
|---|---|---|
| PACKAGE_FILE_TAG | int32 | 항상 `0x9E2A83C1` (매직 넘버) |
| archive header version | int32 | `0x00000000`=v1(구), `0x22222222`=v2(UE5 업그레이드 이후) |
| max chunk size | int64 | 항상 `131072`(=128×1024) — UE 하드코딩 상수 |
| CompressorNum | uint8 | **v2 헤더에만 존재.** `3`=zlib (현재까지 zlib 외 값 관측 안 됨) |
| compressed size (summary) | int64 | |
| uncompressed size (summary) | int64 | |
| compressed size | int64 | 실제 압축 청크 크기(위와 동일값, 이중 기록) |
| uncompressed size | int64 | 압축 해제 후 크기(이중 기록) |

- v1 헤더는 48바이트, v2 헤더는 49바이트(CompressorNum 1바이트 추가).
- 마지막 청크를 제외한 모든 청크는 `max chunk size`(131072바이트)를 압축 해제 크기로 사용.
- 모든 청크를 순서대로 압축 해제 후 이어붙이면 하나의 큰 바이너리(본문)가 됨.
- **1.0/1.1/1.2 사이 압축 방식 자체(zlib) 변경 없음.** v1→v2 청크 헤더 전환은 UE5 업그레이드(Update 8, 2022-07) 시점 일회성 변경이며, 이후 1.0~1.2는 계속 v2(zlib) 사용. 이는 실제 파서 라이브러리의 `CompressionAlgorithmCode.ZLIB = 3` 하드코딩 및 `pako.inflate` 단일 경로 구현으로 재확인.
- 압축 해제 후 첫 필드는 `int64 totalBodyRestSize`(이 값 자체를 제외한 나머지 바이너리 전체 크기) — 파서 구현체는 이 값과 실제 해제 크기를 대조해 손상 여부(`CorruptSaveError`)를 검증함.

**브라우저 구현 시사점**: `pako`(순수 JS, WASM 아님, MIT 라이선스, 수백만 다운로드의 성숙한 zlib 포트)를 `npm install pako` 후 그대로 정적 번들에 포함하면 GitHub Pages에서 서버 없이 청크 해제 가능. 실제로 `@etothepii/satisfactory-file-parser`가 이 조합으로 동작함이 검증됨.

---

## 3. 오브젝트 직렬화 구조

출처: `SATISFACTORY_SAVE.md` "Decompressed binary data / Objects / Properties" 절.

### 3.1 레벨 단위 저장 (Update 6/8부터)

압축 해제된 본문은 레벨(맵의 서브레벨) 단위로 분리 저장:

```
int64  totalSize
[if SaveVersion>=53] FSaveObjectVersionData  mPersistentLevelSaveObjectVersionData
FWorldPartitionValidationData                SaveGameValidationData
TMap<FString, FPerStreamingLevelSaveData>    mPerLevelDataMap   (key=levelName)
FPersistentAndRuntimeSaveData                mPersistentAndRuntimeData
FUnresolvedWorldSaveData                     mUnresolvedWorldSaveData
```

각 레벨 데이터는 `TOCBlob64`(오브젝트 메타데이터: 클래스명, 인스턴스명, transform 등)와 `DataBlob64`(오브젝트별 프로퍼티 바이너리)로 나뉨. **TOCBlob과 DataBlob의 오브젝트 개수·순서는 반드시 1:1 대응**(n번째 TOC 항목 ↔ n번째 Data 항목).

### 3.2 TOC (오브젝트 헤더)

```
int32 numObjects
for each: bool isActor
          if isActor: FActorSaveHeader   else: FObjectSaveHeader
[optional] DestroyedActors 목록 (레벨 스트리밍 레벨: TArray<FObjectReferenceDisc>,
                                  퍼시스턴트+런타임 레벨: TMap<FString, TArray<FObjectReferenceDisc>>)
```

- `FActorSaveHeader`(Actor) 필드: 클래스 경로(type path), root object, instance name, rotation(x/y/z/w quat), position(x/y/z), scale(x/y/z), transform flag, placement flag.
- `FObjectSaveHeader`(비-Actor Component) 필드: 클래스 경로, root object, instance name, 부모 액터 이름.
- **DestroyedActors 목록**은 게임 진행도 추적에 중요한 단서: 예를 들어 슬러그/하드드라이브/소머슬룹처럼 "습득 시 월드에서 사라지는" 오브젝트는 파괴된 액터로 등재될 수 있음 — 단, 이는 구조상 가능성 추론이며 **실제 습득 판정 로직은 확인 필요**(아래 섹션 6 참고).

### 3.3 Data (오브젝트 본문)

```
int32 numObjects
for each: int32  SaveVersion(오브젝트별)
          bool   ShouldMigrateObjectRefsToPersistent
          TArray<uint8> Data   ← 실제 오브젝트 바이너리(크기 알고 있으므로 스킵 파싱 가능)
          [if SaveVersion>=53] bool ShouldSerializePerObjectVersionData
                                 [if true] FSaveObjectVersionData PerObjectVersionData
```

`Data` 배열은 크기가 명시돼 있어 **알 수 없는/관심 없는 오브젝트를 건너뛰며 부분 파싱**할 수 있음 — 브라우저에서 전체 세이브를 파싱하지 않고 필요한 클래스(FGSchematicManager, FGBuildableSubsystem 등)만 골라 읽는 최적화가 가능하다는 뜻.

### 3.4 클래스별 오브젝트 구조 (UObject 계층)

거의 모든 클래스는 리플렉션 기반 `Properties`(List of Properties, 3.5절)만으로 구성됨. 커스텀 바이너리를 추가로 갖는 소수의 클래스만 별도 구조가 있음:

| 클래스 | 추가 구조 | 비고 |
|---|---|---|
| `UObject`(기저) | `[if VersionUE5≥1011] SerializationControl(uint8)` + `List of Properties` + `bool HasGuid` [+`FGuid`] | 모든 오브젝트의 공통 기저 |
| `AActor`(기저) | `FObjectReferenceDisc Owner` + `TArray<FObjectReferenceDisc> Components` + UObject | 모든 액터 공통 |
| `AFGBuildableConveyorBase` | `+ FConveyorBeltItems mItems` | 컨베이어 벨트/리프트 Mk1~6 |
| `AFGConveyorChainActor` | 체인 스플라인 세그먼트, 아이템 배열 등 | U1.0+ 컨베이어 체인 최적화 구조 |
| `AFGBuildableWire` | `FObjectReferenceDisc[2] mConnections` | 전력선 |
| `AFGCircuitSubsystem` | `TMap<int32, FObjectReferenceDisc> mCircuits` | 전력망 서브시스템(싱글턴) |
| `AFGLightweightBuildableSubsystem` | `[if SaveVersion≥48] int32 currentLightweightVersion` + `TMap<FObjectReferenceDisc, TArray<FRuntimeBuildableInstanceData>> mBuildableClassToInstanceArray` | **건물 종류·수량 집계에 핵심** — 경량 빌더블(파운데이션/벽 등) 최적화 구조. 클래스별로 인스턴스 배열이 맵으로 저장되어 있어 "건물 종류별 개수"를 직접 셀 수 있는 구조 |
| `AFGGameMode` | `TArray<FObjectReferenceDisc> rawPlayerStatePointers` | |
| `AFGGameState` | (AFGGameMode와 동일 패턴) | |
| `AFGPlayerState` | `FUniqueNetIdRepl Id` | |
| `AFGVehicle`/`AFGRailroadVehicle`/`AFGDroneVehicle` | 물리 데이터, 커플링, 드론 액션 큐 | |

> 중요: 위 표에 없는 클래스(예: `FGSchematicManager`, `FGResearchManager`, `FGBuildableResourceExtractor` 자원 노드 등)는 **커스텀 바이너리 구조가 없고 순수 리플렉션 프로퍼티**로만 이루어져 있다는 뜻. 즉 이들의 구체적 필드는 이 문서(포맷 명세)로는 알 수 없고, 클래스 헤더(게임 설치 폴더 `CommunityResources`) 또는 실제 세이브 덤프로 역추적해야 함.

### 3.5 프로퍼티 타입 시스템 (List of Properties)

리스트는 `FPropertyTag`(이름+타입+크기+플래그) 뒤에 타입별 값이 오는 구조가 반복되며, `Name == "None"`인 태그로 종료됨(문자열 "None" 하나가 리스트 종료 마커). 총 **19개 프로퍼티 타입**이 정의됨:

- **단순형(8)**: Bool, Byte, Enum, Name, Object, SoftObject, Str, Text
- **숫자형(7)**: Int(32), Int8, Int64, UInt32, UInt64, Float, Double
- **컨테이너형(4)**: Array, Map, Set, Struct

`FPropertyTag`는 `VersionUE5 ≥ 1012`부터 `FPropertyTypeName`(트리 구조, UE5식 타입 시스템)을 통해 `StructName`/`EnumName`/`InnerType`/`ValueType`을 파생시키는 방식으로 바뀜 — 이는 커뮤니티 파서 라이브러리의 `propertyTagType` 필드 도입(v4.0.0, "1.2 Support, Breaking Changes")과 정확히 대응. **즉 1.1 후반~1.2에서 프로퍼티 태그 자체의 저수준 인코딩이 UE5 네이티브 방식으로 바뀌었고, 이는 포맷 파싱 코드에 실질적 breaking change였다.**

`Struct`/특수 오브젝트(TypedData)로는 `Box`, `FluidBox`, `InventoryItem`, `LinearColor`, `Quat`, `RailroadTrackPosition`, `Vector`, `DateTime`, `ClientIdentityInfo` 등이 wiki.gg에 열거되어 있으며 `SATISFACTORY_SAVE.md`의 "Structs" 절에 상세 바이너리 레이아웃이 정의돼 있음(FInventoryItem, FConveyorBeltItem, FVehiclePhysicsData 등 게임 전용 구조체 포함).

---

## 4. 게임 진행도 데이터 위치 매핑 (요구사항 대비, 확인 필요 다수)

포맷 명세 자체는 "그릇"만 정의하고 "내용물"(어떤 클래스의 어떤 프로퍼티에 마일스톤 목록이 들어있는지)은 게임 데이터 모델 영역이라 별도 조사가 필요함. 아래는 조사 중 확보한 간접 근거이며, **정확한 프로퍼티 이름은 실제 세이브 덤프로 검증 필요**:

| 요구 데이터 | 근거/단서 | 확인 상태 |
|---|---|---|
| 건물 종류·수량 | `AFGLightweightBuildableSubsystem.mBuildableClassToInstanceArray`(클래스별 인스턴스 배열 맵) + 레벨 내 일반 Actor 목록(비-경량 빌더블은 각각 별도 TOC 엔트리) | 구조는 확인됨(3.4절). 경량/비경량 빌더블 이원화 로직은 확인 필요 |
| 마일스톤/스키매틱 해금 | 싱글턴 액터(추정: `FGSchematicManager` 계열, 클래스 경로 `/Script/FactoryGame.FGSchematicManager` 등)의 리플렉션 프로퍼티 | **확인 필요** — 포맷 문서에 커스텀 구조 없음(순수 Properties) |
| MAM 연구 완료 목록 | 싱글턴 액터(추정: `FGResearchManager`)의 리플렉션 프로퍼티 | **확인 필요** |
| 대체 레시피 확보 | 스키매틱 해금과 동일 매니저에 포함될 가능성(대체 레시피도 스키매틱의 일종) | **확인 필요** |
| 점유 자원 노드 | 자원 추출 건물(`AFGBuildableResourceExtractor` 계열) 각 인스턴스의 프로퍼티에 노드 참조 존재 가능성 | **확인 필요** — 포맷 문서에 이 클래스 커스텀 구조 없음 |
| 하드드라이브/슬러그/소머슬룹 수집 수 | 습득 시 오브젝트가 파괴되어 `DestroyedActors`(TOC, 3.2절)에 등재되거나, 별도 수집 서브시스템/플레이어 상태 프로퍼티에 카운트 존재 가능성 | **확인 필요** — 두 가설 모두 미검증 |

**권고**: 이 부분은 "포맷 조사"가 아니라 "게임 데이터 모델 조사" 단계로, `GreyHak/sat_sav_parse`(Python, GPL-3.0, `--export-somersloops`/`--export-mercer-spheres`/`--list-vehicle-paths` 등 CLI 옵션 보유 — 즉 이 저장소는 이미 이 정확한 데이터들의 위치를 실제로 파싱해 알고 있음) 또는 `PhysoxNB/SatisFacts`(Go, "collectibles" 탭 보유)의 **소스 코드 내 클래스/프로퍼티 이름 참조**(코드 재사용이 아닌 명세 확인 목적)로 다음 단계 조사를 이어가는 것을 권고. 둘 다 라이선스가 GPL 계열이므로 코드 포팅이 아닌 "필드 이름 확인용 참고"로만 사용.

---

## 5. 커뮤니티 포맷 명세 문서 목록

| 문서/저장소 | URL | 성격 | 라이선스 | 최근 갱신(push) | 비고 |
|---|---|---|---|---|---|
| **moritz-h/satisfactory-3d-map — SATISFACTORY_SAVE.md** | https://github.com/moritz-h/satisfactory-3d-map/blob/master/docs/SATISFACTORY_SAVE.md | 순수 포맷 명세 문서(마크다운) | 저장소 전체 GPL-3.0(문서 자체 별도 라이선스 표기 없음 — 저장소 라이선스 적용으로 간주) | 2026-04-10 | **최고 권위. 문서 내 "Document Version: Satisfactory 1.2" 명시.** satisfactorymodding 공식 Documentation이 직접 링크 |
| **satisfactory.wiki.gg — Save files** | https://satisfactory.wiki.gg/wiki/Save_files | 위키 문서(포맷+헤더+버전이력) | 위키 콘텐츠 라이선스(별도, CC 계열 추정 — 확인 필요) | 2026-06-03 | 버전별 변경이력(패치노트 대응)이 잘 정리됨 |
| **satisfactorymodding/Documentation — Savegame.adoc** | https://github.com/satisfactorymodding/Documentation/blob/master/modules/ROOT/pages/Development/Satisfactory/Savegame.adoc | 공식 모딩 커뮤니티(SML 개발진) 문서 — 세이브 "시스템"(직렬화 트리거·IFGSaveInterface) 설명, 위 두 문서로 링크 아웃 | GitHub API `license` 필드 `null`(LICENSE 파일 미검출 — **확인 필요**, 단 CC0 등 문서 라이선스가 별도 표기됐을 가능성 있음) | push 2026-08-05(활발) | 포맷 저수준 명세는 자체 작성 안 하고 moritz-h/wiki.gg로 위임(3rd-party 인용) |
| **etothepii4/satisfactory-file-parser** | https://github.com/etothepii4/satisfactory-file-parser | 실행 가능한 레퍼런스 구현(TS) + CHANGELOG로 버전별 breaking change 이력 | **MIT** | 2026-07-26, npm 최신 4.1.2 | 명세 문서라기보단 "동작하는 파서"지만, 코드 자체가 가장 신뢰도 높은 1차 사료(주석에 게임 헤더 파일 `FGSaveManagerInterface.h`/`SaveCustomVersion.h` 원문 인용) |
| GreyHak/sat_sav_parse | https://github.com/GreyHak/sat_sav_parse | Python 파서+CLI(수집품/자원노드/차량 경로 등 조작 기능 보유) | GPL-3.0 | 2026-08-15(현재 시점 기준 가장 최근, 1.2.2.1까지 지원 명시) | 게임 데이터 모델(4절) 조사용 참고 후보 1순위 |
| PhysoxNB/SatisFacts | https://github.com/PhysoxNB/SatisFacts | Go, HTML 리포트 생성기(collectibles/production/power 탭) | GPL-3.0 | 확인 필요(최근 활동 있음) | 4절 조사용 참고 후보 |
| AnthorNet/SC-InteractiveMap (satisfactory-calculator.com) | https://github.com/AnthorNet/SC-InteractiveMap/blob/dev/src/SaveParser/Read.js | JS, **브라우저에서 실제로 세이브를 읽는** 대화형 지도 서비스의 소스 | **README에 명시: "Reuse of the source code and data assets is not permitted in any case, source code is only available for educational purpose."** (공개 저장소이나 재사용 금지 — MIT 아님) | 2026-07-23 | "브라우저 단독 파싱"이 실서비스로 이미 검증됐다는 개념 증명(existence proof)으로만 인용. **코드 이식 금지, 로직 학습 참고만 가능** |
| R3dByt3/SatisfactorySaveNet (및 fork `erp-for-factory-games/Satisfactory`) | https://github.com/R3dByt3/SatisfactorySaveNet | C# 파서 | MIT | 2026-07-06 | C#이라 브라우저 직결은 아니나 명세 교차검증용 |
| cybershadow — satisfactory-save-files (GitLab) | https://gitlab.com/cybershadow/satisfactory-save-files/ | D 언어 파서 | 확인 필요 | 확인 필요 | wiki.gg가 인용한 4번째 구현체. 미조사(시간 제약) |

---

## 6. 포맷이 업데이트마다 얼마나 자주 깨지는가 — 실증 근거

`@etothepii/satisfactory-file-parser`의 CHANGELOG.md(2024~2026, 실제 커밋 이력 기반)를 근거로 정리:

| 버전/시점 | 게임 업데이트 대응 | 실제 파서에 가해진 변경 성격 |
|---|---|---|
| v3.0.1 (2025-04-20) | **1.1 대응, 명시적으로 "Breaking Changes in Save Structure for 1.1"** | 헤더에 SaveName 필드 추가, 오브젝트 필드 1~2개 신규, `BuildableSubsystemSpecialProperties` 구조 변경(typePath→typeReference), 필드 2개 개명(`unknownType2`→`shouldMigrateObjectRefsToPersistent`, `objectVersion`→`saveCustomVersion`), 레벨 목록이 배열→객체(key)로 변경, InventoryItem 구조 전면 개편 등 **최소 8개 항목 동시 변경** |
| v4.0.0 (2026-04-18) | **1.2 대응, 명시적으로 "1.2 Support, Breaking Changes"** | 프로퍼티에서 `subtype`/`ueType` 필드 폐지하고 `propertyTagType`로 대체(3.5절의 UE5 신형 태그 시스템과 직결), ArrayProperty 표현 방식 전면 변경, 구조체 배열 값의 표현 변경, Blueprint의 `lastEditedBy` 개명 등 |
| v3.1.1 (2025-08-24) | 마이너 버그(비-메이저 업데이트 대응) | Blueprint 직렬화 4바이트 오프셋 버그 |
| v3.2.1 (2025-11-29) | 마이너 | `save.grids`+`save.gridHash` 병합, MapProperty 내부 명명 변경 |
| v3.3.0 (2025-12-17) | 정책 변경 | 미지 프로퍼티/오브젝트 조우 시 기본적으로 예외를 던지지 않고 `rawBytes`에 원본을 보존하는 방어적 파싱으로 전환(포맷이 계속 깨질 것을 전제로 한 설계 변경) |

**결론**: 조사 기간 내(2025-04 ~ 2026-07) 확인된 것만으로도 **1.1, 1.2 두 메이저 업데이트 모두 "Breaking Changes"로 명시된 구조 변경을 동반**했고, 그 사이사이 마이너 업데이트에서도 지속적으로 필드 추가/개명/버그 수정이 있었다. 게임 소스 자체의 `SaveCustomVersion` enum도 2016년부터 현재까지 거의 매 분기 새 버전 상수가 추가되는 구조(3.5절)로, **포맷은 구조적으로 "계속 깨지는 것을 전제"로 설계되어 있다**(그래서 모든 필드가 버전 게이팅됨). 실전 구현체(v3.3.0)조차 "예외를 던지지 말고 최대한 방어적으로 파싱하라"로 정책을 바꾼 것이 이를 뒷받침. → **자체 파서를 만들 경우 특정 세이브 버전에 고정하지 말고, 필드 단위로 버전 게이팅하며 알 수 없는 프로퍼티는 무시(스킵)하고 계속 진행하는 방어적 설계가 필수.**

---

## 7. 미확인/후속 조사 필요 목록

- 1.2 정확한 `SaveHeaderVersion`/`SaveVersion`/`BuildVersion` 3종 숫자 조합 (1.1은 확인됨: header=14, save=52)
- `FGSchematicManager`/`FGResearchManager`(또는 해당 역할 클래스)의 정확한 클래스 경로와 프로퍼티 이름
- 자원 노드 점유 여부를 판별하는 정확한 클래스/프로퍼티(추출기 건물 vs 별도 노드 서브시스템)
- 하드드라이브/슬러그/소머슬룹 "수집됨" 판정이 DestroyedActors 방식인지 별도 카운터 프로퍼티 방식인지
- `satisfactorymodding/Documentation` 저장소 자체 라이선스
- `AnthorNet/SC-InteractiveMap` 저장소의 실제 라이선스 파일 유무
- `cybershadow/satisfactory-save-files`(GitLab, D 언어) 상세 미조사

이 목록은 "게임 데이터 모델(스키매틱/연구/노드) 조사" 단계의 후속 작업으로, 별도 세션에서 실제 세이브 파일 1개를 위 라이브러리로 JSON 덤프해 눈으로 확인하는 방식이 가장 빠름.
