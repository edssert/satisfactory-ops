# 리서치: 기계판독 게임 데이터 원본 (Satisfactory)

- 조사일: 2026-08-19
- 스코프: 아이템/레시피/건물/스키매틱(마일스톤)을 손으로 타이핑하지 않고 **원본에서 생성**할 수 있는 경로
- 결론 먼저: **가장 확실한 경로는 로컬에 이미 설치된 게임의 `CommunityResources/Docs/en-US.json`을 직접 파싱하는 것**이다. 이 머신에 게임이 설치돼 있고, 실제로 열어서 1.2 콘텐츠가 들어있음을 확인했다.

## 1. 로컬 확인 결과 (가장 중요)

이 환경에 Satisfactory가 실제로 설치되어 있어 원본 파일을 직접 열어 검증했다.

| 항목 | 값 |
|---|---|
| 설치 경로 | `C:\Program Files (x86)\Steam\steamapps\common\Satisfactory` |
| appmanifest buildid | `24656030` (`steamapps\appmanifest_526870.acf`) |
| 데이터 경로 | `CommunityResources\Docs\en-US.json` (10.6MB, **UTF-16** 인코딩) |
| 형제 파일 | 같은 폴더에 `af.json`, `de.json`, `ko.json` 등 로케일별 파일이 다수 존재. **`Docs.json`이라는 단일 파일은 더 이상 없다** — wiki가 확인해주듯 예전 단일 `Docs.json` 포맷은 폐기되고 로케일별 `Docs/{locale}.json`으로 대체됨 |
| 구조 | 최상위가 `[{NativeClass, Classes:[...]}, ...]` 리스트, 114개 NativeClass 그룹 (기존에 알려진 Docs.json 스키마와 동일) |
| 부가 파일 | `CommunityResources/CustomVersions.json`, `CommunityResources/DedicatedServerAPIDocs.md`도 함께 배포됨 |

### 1.2 버전 데이터인지 직접 검증

`en-US.json`을 Python으로 파싱해서 1.2 패치노트(공식 wiki `Patch_1.2.0.0`)에만 나오는 항목명을 grep했다. 전부 존재를 확인했다:

| 1.2에서 추가된 것 (wiki 기준) | 로컬 `en-US.json`에서 검색 결과 |
|---|---|
| Fluid Truck / Fluid Truck Station | 발견 (`Fluid Truck`, `Fluid Truck Station` 각 2건) |
| Cross Beam (AWESOME Shop) | 발견 (2건) |
| SPWN (스폰 변경 시설) | 발견 (3건) |
| Pipeline T-Junction | 발견 |
| Alternate: Wet Concrete (레시피/스키매틱) | 발견 |

→ **로컬 설치본은 1.2 콘텐츠를 포함한 최신 데이터다.** 이 파일을 그대로 프로젝트로 복사해 파싱 스크립트를 돌리면 손으로 타이핑할 필요가 없다.

### 경로 요약 (자동화 기준, Steam 기본 경로)

```
<SteamLibrary>/steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json   ← 실제 데이터 (영문)
<SteamLibrary>/steamapps/common/Satisfactory/CommunityResources/Docs/ko.json     ← 한글 로케일 (표시명만 한글, 클래스 구조는 동일)
```
과제 지시문에 있던 `.../Docs/Docs.json` 경로는 **구버전 기준 경로**이며 현재(1.0+) 게임은 이 이름의 파일을 만들지 않는다. 이 차이를 몰라서 삽질하는 서드파티 README가 여전히 많다(아래 표 참고).

## 2. 파싱 라이브러리/파이프라인 비교

| 저장소 | 언어 | 라이선스 | 최근 push | 1.2 지원 근거 | 비고 |
|---|---|---|---|---|---|
| [SatisfactoryTools/DocsParser](https://github.com/SatisfactoryTools/DocsParser) | PHP | MIT | 2026-07-10 | 같은 조직 [world-data-generator](https://github.com/SatisfactoryTools/world-data-generator)가 "Satisfactory 1.2+" 명시, 조직 전체가 활발히 갱신 중 | `AssetsExtractor`(MIT, 2026-07-10 push), `ToolsApi`(PHP), `SFTools`(라이선스 미표기)와 한 생태계. greeny 개인 저장소의 "차세대" 버전으로 추정 |
| [SatisfactoryTools/AssetsExtractor](https://github.com/SatisfactoryTools/AssetsExtractor) | PHP | MIT | 2026-07-10 | 위와 동일 조직, "Pipeline to automatically extract and parse data from Satisfactory" | DocsParser와 짝을 이루는 추출 파이프라인 |
| [lunafoxfire/satisfactory-docs-parser](https://github.com/lunafoxfire/satisfactory-docs-parser) (npm: `satisfactory-docs-parser`) | TypeScript/Node | MIT | 2024-10-08 (마지막 릴리즈 v7.0.1은 2023-01-12, "Update 7"용) | **없음** — 1.0/1.1/1.2용 릴리즈가 없다 | items/resources/equipment/buildables/productionRecipes/buildableRecipes/customizerRecipes/schematics로 깔끔하게 분리해주는 유일한 성숙 라이브러리지만 **2년 넘게 방치**. 스키마가 크게 안 변했으면 동작할 수 있으나 검증 안 됨 → 리스크 |
| [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools) | JS + `yarn parseDocs` | MIT (코드) / CoffeeStain 이미지 자산은 재배포 금지 | 저장소 자체는 2026-03-29 push(활발) | `dev` 브랜치 `data/data.json` 마지막 갱신 커밋이 **"1.1 update" (2026-01-28)** — 1.2 갱신 커밋 없음. `master` 브랜치 데이터는 더 오래됨(1.0) | 실서비스(satisfactorytools.com)는 별도 빌드 파이프라인으로 최신화할 가능성 있으나, **공개 git 데이터는 1.2 미반영** — 그대로 clone해서 쓰면 안 됨 |
| [satisfactory-dev/Fetch-Docs.json](https://github.com/satisfactory-dev/Fetch-Docs.json) | 셸/문서 | 코드 Apache-2.0, README는 CC BY-NC-SA 4.0(위키용) | 2026-04-28 | 표에 `1.2.2.0`까지의 steamcmd depot 다운로드 커맨드 명시 | 데이터 자체를 배포하지 않고, **특정 버전을 steamcmd로 고정 다운로드**하는 방법만 제공 (버전 고정 스냅샷이 필요할 때 유용) |
| [dmryabov/satisfactory-docs-files](https://github.com/dmryabov/satisfactory-docs-files) | - | MIT | 커밋 2개뿐, 정체 | `Files/`에 **`Docs_CL-273254_v1.0.zip` 딱 1개** (초기 얼리엑세스 빌드) | 사실상 죽은 아카이브, 1.2 근처도 없음 → 사용 불가 |
| [satisfactory-dev/Docs.json.ts](https://github.com/satisfactory-dev/Docs.json.ts) | TypeScript | Apache-2.0 | README 로딩 실패로 상세 미확인, 이슈 #6 "1.1 Support"가 Done 처리됨(담당 SignpostMarv) | 1.1까지는 타입 갱신 확인, 1.2 여부는 리포에서 직접 재확인 필요 | Docs.json 스키마의 TS 타입 정의만 제공 (파서 로직 아님) |
| [Maurdekye/satisfactory-recipe-parser](https://github.com/Maurdekye/satisfactory-recipe-parser) | - | **라이선스 없음** | 2023-11-28 (정체) | 없음 | 라이선스 미표기라 재배포·재사용 근거가 없음. 공개 저장소인 우리 프로젝트에 코드 포함/포크 금지 |
| [FerricDonkey/SatisfactoryRecipes](https://github.com/FerricDonkey/SatisfactoryRecipes) | - | **라이선스 없음** | 2026-06-20 (최근) | 최근 커밋이므로 가능성 있으나 미확인 | 라이선스 없어 재사용 근거 부족. 참고용으로만 |
| [vassbo/satisfactory-factories](https://github.com/vassbo/satisfactory-factories) | TS(pnpm) | GNU(정확한 버전 미확인, 재확인 필요) | 639 커밋, 최근 활동 있음 | 자체 파서가 `Docs.json → parser/gameData.json → web/public/gameData_v1.x-xx.json` 파이프라인을 갖고 있고 버전별 파일명을 씀(예: v1.0-11, v1.0-12 등) — 즉 **버전 추적을 자체 관례로 하고 있다는 것 자체가 신뢰 신호** | GPL 계열이면 카피레프트 전파 이슈 있으니 코드를 그대로 가져오지 말고 **접근 방식만 참고**할 것 |

## 3. 공개 API / 정적 데이터셋

| 이름 | URL | 평가 |
|---|---|---|
| aringadre76/satisfactory-api | [repo](https://github.com/aringadre76/satisfactory-api) / 배포판 `https://satisfactory-api-yfw1.onrender.com` (`/docs`) | MIT. items/recipes/buildings/milestones 등 REST 엔드포인트 제공. 단 **데이터 소스가 사용자가 직접 넣는 `Docs/en-US.json`** — 즉 이 프로젝트도 결국 게임 설치본에 의존하며, 배포 인스턴스가 어떤 버전 데이터로 구동 중인지 불명. 개인 Render 무료 인스턴스라 가동 안정성/지속성 낮음 → **원본 대체재로 신뢰하지 말 것**, 코드(동기화 스크립트 `sync_game_data.py`)만 참고 가치 있음 |
| SatisfactoryTools/ToolsApi | [repo](https://github.com/SatisfactoryTools) 조직 내 PHP API | 공개 엔드포인트 URL 미확인(리서치 시간 내 미도달). 조직 자체는 활발 |
| greeny data.json (raw) | `https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data.json` | 접근은 가능하나 위에서 확인했듯 1.2 미반영. items/recipes/schematics/generators/resources/miners/buildings 키 구조라 **스키마 참고용**으로는 쓸만함 |

**결론: 믿을 수 있는 상시 공개 API는 없다.** 전부 개인/소규모 프로젝트이고 최신성이 보증되지 않는다. 원본(Docs 폴더) 직접 파싱이 유일하게 신뢰 가능한 경로다.

## 4. 권장 경로 (실행 순서)

1. 로컬 설치본에서 `CommunityResources/Docs/en-US.json` (필요하면 `ko.json`도 같이) 복사 → 이 저장소 안(`C:/Dev/satisfactory-ops`)의 데이터 소스로 보관. UTF-16 → UTF-8 변환 필요.
2. `SatisfactoryTools/DocsParser` (PHP, MIT, 2026-07-10 최신)와 `AssetsExtractor`를 구조 참고용으로 확인 — 우리 프로젝트가 JS 정적 사이트(`src/js`, 빌드 파이프라인 없음)이므로 코드를 그대로 가져오기보다 **스키마 매핑 로직만 참고**해 Node/Python 스크립트를 직접 작성하는 편이 낫다.
3. `lunafoxfire/satisfactory-docs-parser`의 `TYPES.md`/소스는 **NativeClass → 카테고리 매핑표**로서 여전히 읽을 가치가 있다(1.2 검증은 안 됐지만 항목 구조는 크게 안 바뀜). 이걸 참고해 자체 파서의 매핑 테이블을 만든다.
4. 버전 고정 스냅샷이 필요해지면(예: 회귀 테스트, "1.2.2.0 기준 데이터 고정") `Fetch-Docs.json`의 steamcmd `download_depot` 표를 사용해 특정 빌드를 별도로 받는다.
5. 파싱 스크립트 출력은 `src/data/`에 `items.json`, `recipes.json`, `buildings.json`, `schematics.json` 식으로 저장 — 이미 있는 `src/data/glossary.json`과 나란히.

## 5. 리스크

- **라이선스/재배포 근거 미확정**: Coffee Stain의 fan-content/커뮤니티 리소스 정책이 데이터 재배포를 어디까지 허용하는지 이번 조사에서 원문 확인을 못 했다(세션 웹서치 한도 소진). 공개 저장소에 파싱된 게임 데이터(아이템명, 수치, 아이콘 제외 텍스트 데이터)를 올리기 전에 `CommunityResources` 폴더 내 안내문(예: `DedicatedServerAPIDocs.md` 인근 정책 문서, 공식 위키 "Community resources" 페이지의 이용 조건)을 재확인할 것. 이미지/아이콘 자산은 greeny 저장소 LICENSE가 보여주듯 명확히 재배포 금지 대상이니 **텍스트/수치 데이터만** 다루고 이미지는 손대지 말 것.
- **greeny/SatisfactoryTools의 공개 데이터는 1.2 미반영** (dev 브랜치 기준 1.1까지). 이 저장소를 데이터 소스로 clone하면 안 된다.
- **lunafoxfire/satisfactory-docs-parser는 2023년 이후 릴리즈 없음.** 라이브러리를 그대로 의존성으로 추가하면 최신 스키마 변경(예: 로케일 분리, 새 NativeClass)에 대응이 안 될 수 있다.
- **Maurdekye/satisfactory-recipe-parser, FerricDonkey/SatisfactoryRecipes는 라이선스가 없다.** 코드를 참고만 하고 그대로 포크/포함하지 말 것.
- **aringadre76/satisfactory-api의 배포 인스턴스(Render 무료 티어)는 sleep/만료 가능성이 있고 데이터 버전이 불명확** → 프로덕션 의존처로 쓰지 말 것.
- **로컬 en-US.json은 이 머신의 특정 시점 buildid(24656030) 기준**이다. 게임이 자동 업데이트되면 파일이 다시 바뀌므로, 파싱 스크립트를 1회성으로 돌리지 말고 재실행 가능하게 만들어 둘 것.

## 6. 참고 URL 전체 목록

- https://github.com/SatisfactoryTools/DocsParser
- https://github.com/SatisfactoryTools/AssetsExtractor
- https://github.com/SatisfactoryTools/world-data-generator
- https://github.com/SatisfactoryTools/SFTools
- https://github.com/SatisfactoryTools/ToolsApi
- https://github.com/lunafoxfire/satisfactory-docs-parser
- https://www.npmjs.com/package/satisfactory-docs-parser
- https://github.com/greeny/SatisfactoryTools
- https://github.com/satisfactory-dev/Fetch-Docs.json
- https://github.com/satisfactory-dev/Docs.json.ts
- https://github.com/dmryabov/satisfactory-docs-files
- https://github.com/dmryabov/satisfactory-docs-exporter
- https://github.com/Maurdekye/satisfactory-recipe-parser
- https://github.com/FerricDonkey/SatisfactoryRecipes
- https://github.com/vassbo/satisfactory-factories
- https://github.com/aringadre76/satisfactory-api
- https://satisfactory.wiki.gg/wiki/Community_resources
- https://satisfactory.wiki.gg/wiki/Patch_1.2.0.0
- https://docs.ficsit.app/contentlib/latest/Reference/JsonSchema.html
