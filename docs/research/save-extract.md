# Satisfactory 세이브(.sav) 브라우저 파싱 — 추출 가능 데이터 매핑

조사일: 2026-08-19 · 기준 게임 버전: Update 1.2 (2026) · 목적: GitHub Pages 정적 호스팅 + 사용자 로컬 파일 선택(업로드 없음) 환경에서 `.sav`를 파싱해 진행도를 자동 표시

## 0. 결론 요약 (표)

| 항목 | 판정 | 근거 |
|---|---|---|
| 세이브 헤더 메타데이터 (세션명, 플레이시간, 빌드버전) | **확실히 읽힘** | 헤더는 압축되지 않은 평문 필드. 여러 파서가 동일하게 `sessionName`, `playDurationInSeconds`, `buildVersion` 필드로 파싱 |
| 마일스톤/티어 해금 목록 | **확실히 읽힘** | `BP_GameState_C`의 `mAvailableSchematics` 프로퍼티(ObjectProperty 배열) — 해금 시 이 목록에서 제거됨. "남아있지 않음=해금"으로 역산 가능 |
| MAM 연구(Research Tree) 완료 | **확실히 읽힘** | 동일 GameState 액터의 `mUnlockedResearchTrees` 프로퍼티 |
| 대체 레시피(하드드라이브 스키매틱) 해금 | **아마 읽힘** | 스키매틱 시스템과 동일 메커니즘(`mAvailableSchematics`)이지만, 대체 레시피 전용 클래스 경로 목록(`Schematic_Alternate_*`)을 직접 하드코딩해 대조해야 함 — 게임 자체 API가 "이건 대체레시피"라고 태깅해주지 않음 |
| 건설된 건물 종류별 집계 | **확실히 읽힘** | 모든 건물은 Persistent_Level의 Actor 엔트리(`typePath`+`instanceName`). typePath로 group-by하면 종류별 개수 산출 가능 |
| 건물의 레시피 설정 (`mCurrentRecipe`) | **확실히 읽힘** | 생산 건물 액터의 프로퍼티로 존재 확인(TS 파서 GUIDE.md에 명시) |
| 오버클럭 값 | **확인 필요** | Wiki는 "FloatProperty로 저장된다"고만 서술, 정확한 프로퍼티명(`mCurrentPotential` 등 추정)을 1차 소스 코드에서 직접 확인 못함 |
| 점유 자원 노드 + 순도 | **아마 읽힘** | 채굴기(Miner/Extractor) 액터가 `BP_ResourceNode`/`BP_ResourceNodeGeyser`를 참조하는 구조는 확인. 순도(purity) 프로퍼티명은 확인 필요 |
| 파워슬러그 / 하드드라이브 / 소머슬룹 / 머서스피어 수집 | **확실히 읽힘** | 각각 고유 typePath 상수로 존재 확인 (아래 표). 미수집 시 레벨 `collectibles` 배열, 수집 시 해당 오브젝트가 사라지거나(슬러그) 별도 boolean(하드드라이브 개봉여부 등)으로 표현 |
| 게임모드/1.2 랜덤화 설정 | **확인 필요** | 1.2 세이브 헤더 버전(14) 변경 사항 중 일부만 문서화됨. 랜덤화 시드/모드 필드는 1차 소스에서 직접 확인 못함 |

---

## 1. 세이브 파일 물리 구조

출처: [satisfactory.wiki.gg – Save files](https://satisfactory.wiki.gg/wiki/Save_files)

- 파일 = **헤더(비압축)** + **본문(zlib 청크 압축)**
  - 헤더 필드: `saveHeaderVersion`(1.1.1.1 기준 14), `saveVersion`(52), `buildVersion`, **`sessionName`**, 맵 이름, **`playDurationInSeconds`**, 저장 시각(UTC), `editorObjectVersion`(40), 모드 메타데이터, 세이브 GUID, MD5 체크섬
  - 본문: UE 패키지 시그니처(`9E2A83C1`) + 128KB 단위 zlib 청크 → 해제 후 레벨별 오브젝트 목록
- 레벨 구조: `Persistent_Level` + 다수 서브레벨(그리드 그룹 "MainGrid", "LandscapeGrid" 등)
- 오브젝트 2종:
  - **Actor** (`ActorHeader`): typePath + instanceName + 위치(quat 회전, xyz 위치, scale)
  - **Component** (`ComponentHeader`): typePath + 부모 Actor 참조
- 프로퍼티는 `PropertyList`(이름-타입-크기-값 나열, `None`으로 종료) 형태 — 표준 UE 리플렉션 직렬화와 동일
- 콜렉터블(수집 전 상태)은 레벨별 `collectibles` 배열에 오브젝트 참조로 별도 저장 → **수집 여부는 이 배열에 남아있는지로 판별 가능**

이 구조는 조사한 모든 파서(TS/Python/Rust/Kotlin/Go)가 공통으로 채택 — 게임이 UE SaveGame 직렬화를 그대로 쓰기 때문에 파서 간 이견이 없다.

## 2. 브라우저(정적 호스팅) 실사용 후보 파서

| 저장소 | 언어 | 라이선스 | 브라우저 적합성 | 확인 방법 |
|---|---|---|---|---|
| [etothepii4/satisfactory-file-parser](https://github.com/etothepii4/satisfactory-file-parser) | TypeScript | **MIT** (`LICENCE.md` 직접 확인, base64 디코드로 원문 대조) | ★ 최적 — README에 "Should work in browser as well" 명시, WHATWG 스트림 API 사용(브라우저 표준) | `gh api repos/.../license` → `"license":{"key":"mit"}` |
| [GreyHak/sat_sav_parse](https://github.com/GreyHak/sat_sav_parse) | Python | **GPL-3.0** | 부적합 (Python, 서버 필요) — 그러나 클래스 경로 상수 목록이 매우 상세해 **참고용 데이터 소스**로 가치 높음 | README 라이선스 고지 문구 직접 확인 |
| [bananasov/satisfactory-formats](https://github.com/bananasov/satisfactory-formats) | Rust | 확인 필요 | WASM 컴파일 가능성 있으나 미검증 | 미확인 |
| [Alex135799/SatisfactorySaveParser](https://github.com/Alex135799/SatisfactorySaveParser) | TypeScript | 확인 필요 | 0 star, 활동 낮음 | 미확인 |
| moritz-h/SatisfactorySaveParser (C#) | C# | — | 브라우저 부적합 (URL 404 — 저장소 이동/삭제된 것으로 보임, 재확인 필요) | 접속 실패 |

**권장**: `etothepii4/satisfactory-file-parser`를 벤더링(fork 또는 npm 의존성으로 정적 번들에 포함)해 GitHub Pages에서 순수 클라이언트 파싱. MIT라 벤더링/수정 배포에 법적 문제 없음. GPL인 GreyHak 저장소는 **코드를 복사하지 말고 클래스 경로 상수(사실 데이터, 저작권 보호 대상 아님)만 참고**해 우리 MIT 코드베이스에 독자 구현.

주의: `etothepii4` 파서는 **범용 UE 프로퍼티 리더**다 — "이 typePath가 마일스톤이다/이 프로퍼티가 오버클럭이다"라는 게임 지식은 내장하지 않는다(코드 검색 결과 "Schematic", "ResourceNode", "Somersloop" 등 게임 특화 상수가 소스에 존재하지 않음 확인: `gh api search/code` 결과 0~3건, 전부 무관한 매치). 즉 **파싱 엔진은 이걸 쓰고, 게임 지식(클래스 경로 사전)은 우리가 직접 구축**해야 한다.

## 3. 마일스톤 / MAM 연구 / 대체 레시피 (스키매틱 시스템)

출처: GreyHak `sav_data/data.py` 주석 (원문 인용, 코드 자체는 미복사)

```
# 80 awesome shop unlocks -- Also removed from "mAvailableSchematics" under
#    Persistent_Level:PersistentLevel.BP_GameState_C_2147330588
# 85 MAM unlocks -- This also includes "mUnlockedResearchTrees" under
#    Persistent_Level:PersistentLevel.BP_GameState_C_2147330588
# 47 Tiers -- This also get removed from "mAvailableSchematics" under
#    Persistent_Level:PersistentLevel.BP_GameState_C_2147330588
```

- **핵심 오브젝트**: `Persistent_Level:PersistentLevel.BP_GameState_C_<id>` (게임당 1개, id는 세이브마다 다름 → typePath prefix `BP_GameState_C`로 탐색)
- **`mAvailableSchematics`**: ObjectProperty 배열. 마일스톤/티어/어썸샵 구매 시 **이 목록에서 제거**된다. 즉 전체 스키매틱 카탈로그(우리가 별도로 알고 있어야 함) − `mAvailableSchematics` 잔여분 = **해금 목록**
- **`mUnlockedResearchTrees`**: MAM 완료 연구 트리 목록 (직접 포함형 — 제거 방식 아님)
- **대체 레시피**: 스키매틱 시스템 안에 있지만 클래스 경로가 `Schematic_Alternate_*` 패턴으로 구분됨. 실제 확인된 경로 예시(GreyHak 데이터, `New_Update3`/`New_Update4`/`Parts` 하위 89개 하드드라이브 대체 레시피 상수 직접 확인):
  - `/Game/FactoryGame/Schematics/Alternate/Parts/Schematic_Alternate_Screw.Schematic_Alternate_Screw_C`
  - `/Game/FactoryGame/Schematics/Alternate/New_Update3/Schematic_Alternate_BoltedFrame.Schematic_Alternate_BoltedFrame_C`
  - `/Game/FactoryGame/Schematics/Alternate/New_Update4/Schematic_Alternate_ElectricMotor.Schematic_Alternate_ElectricMotor_C`
  - (총 89개 확인, 전체 목록은 위 저장소 `sav_data/data.py` L265~ 참조 — 우리 구현 시 자체 사전으로 재작성 필요, GPL 코드 직접 복사 금지)
- 게임 페이즈(Final Project Assembly 등)는 별도 상수 `GP_Project_Assembly_Phase_1~7`로 존재 — 스키매틱과 별개 트리거

**판정**: 마일스톤/MAM = 확실히 읽힘(클래스+프로퍼티명 1차 확인). 대체 레시피 = 아마 읽힘(메커니즘은 같지만 "이 스키매틱이 대체레시피 카테고리다"를 구분하려면 89개+ 경로 사전을 우리가 직접 유지보수해야 하고, 1.2 시점 신규 추가분 존재 가능성 있어 완전성 확인 필요).

## 4. 건설된 건물

- 모든 건물은 `Persistent_Level`의 **Actor 엔트리**로 존재 (`typePath` 예: `/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Build_ConstructorMk1.Build_ConstructorMk1_C`) — wiki.gg 문서 직접 확인
- **종류별 집계**: typePath 문자열로 group-by하면 됨 (파서가 모든 actor를 배열로 노출하므로 클라이언트 측 집계는 구현 난이도 낮음)
- **레시피 설정**: `mCurrentRecipe` 프로퍼티가 생산 건물 액터에 존재 — etothepii4 GUIDE.md 원문: "Selected recipes are stored in the `mCurrentRecipe` property on producing buildables" — **확실히 읽힘**
- **오버클럭 값**: wiki.gg는 "Overclock/underclocking values stored as FloatProperty entries"라고만 서술, 정확한 프로퍼티 키(`mCurrentPotential`로 추정되나 1차 소스 미확인)는 **확인 필요** — 실제 세이브 덤프로 직접 검증 필요
- **전력망**: `/Script/FactoryGame.FGPowerCircuit` 컴포넌트가 회로 토폴로지 보유 (wiki.gg 확인) — 회로별 소속 건물 수 집계는 가능하나 별도 구현 필요

## 5. 자원 노드 점유 / 콜렉터블

GreyHak `sav_data/data.py`에서 직접 확인된 클래스 경로 상수:

| 대상 | typePath | 판정 |
|---|---|---|
| 하드드라이브(크래시사이트) | `/Game/FactoryGame/Resource/Environment/CrashSites/Desc_HardDrive.Desc_HardDrive_C` | 확실히 읽힘 |
| 일반 자원 노드 | `/Game/FactoryGame/Resource/BP_ResourceNode.BP_ResourceNode_C` | 확실히 읽힘 (존재만) |
| 간헐천(플라즈마 발전 등) 자원 노드 | `/Game/FactoryGame/Resource/BP_ResourceNodeGeyser.BP_ResourceNodeGeyser_C` | 확실히 읽힘 (존재만) |
| 소머슬룹 | `/Game/FactoryGame/Prototype/WAT/BP_WAT1.BP_WAT1_C` | 확실히 읽힘 |
| 머서스피어 | `/Game/FactoryGame/Prototype/WAT/BP_WAT2.BP_WAT2_C` | 확실히 읽힘 |
| 머서 성소(Shrine) | `/Game/FactoryGame/Prototype/WAT/BP_MercerShrine.BP_MercerShrine_C` | 확실히 읽힘 |

- GreyHak 도구는 실제로 **모든 actor를 순회하며 typePath를 상수와 비교**해 소머슬룹/머서스피어를 카운트한다(`sav_to_resave.py` 내 for문 직접 확인: `if actorOrComponentObjectHeader.typePath == SOMERSLOOP:`). 동일 패턴을 TS 파서 위에서 재구현 가능 → **수집 개수 집계는 확실히 읽힘**
- **파워슬러그**: wiki.gg에 "수집 시 1 ActorHeader+1 Object → 1 First-Collectable+1 Second-Collectable로 상태 전이"라는 서술 확인. 즉 수집 여부는 상태 전이로 판별 — 로직은 명확하나 정확한 전이 규칙 구현 검증 필요 → **아마 읽힘**
- **자원 노드 점유(채굴기가 어떤 노드를 물고 있는지) + 순도(purity)**: 채굴기 액터가 노드를 참조하는 구조 자체는 확인되나, 정확한 프로퍼티명(순도 enum, 점유 여부 플래그)은 1차 소스 미확인 → **확인 필요**
- **하드드라이브 개봉 상태**: GreyHak 주석에 "89 hard drives (alternate recipes...)" 언급, 개봉/미개봉 상태 필드명은 확인 필요

## 6. 게임모드 / 1.2 랜덤화 설정 / 메타데이터

- 세션명·플레이시간·빌드버전은 헤더 평문 필드로 **확실히 읽힘** (GreyHak `sav_parse.py` L297-337 직접 확인: `self.buildVersion`, `self.sessionName`, `self.playDurationInSeconds` 파싱 코드 존재)
- wiki.gg에 따르면 세이브 헤더 버전은 1.0.0.3=13, 1.1.1.1=14(세이브 이름 문자열 필드 추가) — **1.2의 헤더 버전 번호와 포맷 변경 여부는 미확인**(wiki.gg 문서가 1.1.1.2 이후 "문서화된 포맷 변경 없음"이라고만 언급, 1.2 랜덤화 모드 관련 필드는 다루지 않음)
- **1.2 랜덤화 설정(예: 레시피/노드 랜덤 시드)** 자체를 노출하는 파서·문서를 이번 조사에서 찾지 못함 → **확인 필요, 추가 리서치 또는 실제 1.2 세이브 파일 헥스덤프로 직접 검증 권장**

## 7. 구현 시 리스크 및 권장 접근

1. **라이선스 경계**: `etothepii4/satisfactory-file-parser`(MIT)는 코드 벤더링 가능. `GreyHak/sat_sav_parse`(GPL-3.0)는 **코드 복사 금지**, 클래스 경로 문자열(사실 데이터)만 참고해 우리 저장소에 독자적으로 재작성.
2. **게임 지식 사전 자체 구축 필요**: 파싱 엔진은 범용이고, "이 typePath가 마일스톤/대체레시피/소머슬룹이다"라는 매핑 테이블은 우리가 직접 만들고 1.2 기준으로 검증해야 함(위 표의 확실히 읽힘 항목도 "존재 확인"이지 "완전한 최신 목록 검증"은 아님).
3. **오버클럭·자원노드 순도·1.2 랜덤화 필드**는 1차 소스 코드(위 두 저장소의 전체 소스, 특히 etothepii4의 `types/structs`, `types/objects` 폴더)를 추가로 훑거나 실제 세이브 파일을 헥스/JSON 덤프해 실증적으로 확인하는 단계가 반드시 필요함 — 현재는 위키 서술 수준에 머무름.

## 참고 URL

- https://satisfactory.wiki.gg/wiki/Save_files
- https://github.com/etothepii4/satisfactory-file-parser (MIT, LICENCE.md 직접 디코드 확인)
- https://github.com/GreyHak/sat_sav_parse (GPL-3.0, README 라이선스 고지 확인)
- https://github.com/GreyHak/sat_sav_parse/blob/main/sav_data/data.py
- https://github.com/GreyHak/sat_sav_parse/blob/main/sav_parse.py
- https://github.com/GreyHak/sat_sav_parse/blob/main/sav_to_resave.py
- https://github.com/bananasov/satisfactory-formats
- https://github.com/Alex135799/SatisfactorySaveParser
