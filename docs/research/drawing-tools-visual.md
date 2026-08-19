# 도면 시각 표현 조사 — 기존 도구는 기계를 어떻게 그리는가

- 조사일: 2026-08-19
- 목적: 우리 도면 생성기(`src/components/FactoryDrawing.tsx`)는 현재 기계를 **번호 붙은 빈 사각형**(`<rect class="fd-machine">`)으로만 그린다.
  사용자가 "이걸로는 부족하다"고 판단했다. 게임 렌더를 못 쓰는 조건에서 품질을 어디까지 올릴 수 있는지, 기존 도구·커뮤니티
  산출물이 실제로 무엇을 하는지 확인한다.
- 인접 문서: `docs/research/layout-design-tools.md`(도구 지형도·자동 배치 여부), `docs/research/layout-expert-techniques.md` §6(스파게티
  다이어그램·산키 굵기·직각 라우팅 — 이미 반영됨), `docs/research/conveyor-geometry.md`
- 방법: 각 도구 웹사이트 실사(WebFetch), GitHub 저장소 실사, 웹 검색(WebSearch). **여러 사이트가 자동화 접근을 403으로
  차단해 직접 확인하지 못했다** — 그 경우 검색 스니펫 근거를 명시하고 "간접 확인"으로 표시했다.
- 표기 원칙: 모든 항목에 **[검증]**(직접 접근해 확인) / **[간접 확인]**(검색 결과 스니펫·타 사이트의 인용을 통해 확인,
  원본 페이지는 직접 못 봄) / **[추론]**(직접적 근거 없이 정황상 판단) 을 붙인다.

---

## 1. 도구별 조사 결과

### 1.1 SaLT (Satisfactory Layout Tool) — autumnfallstudios.itch.io/salt

**[검증]** itch.io 페이지를 직접 읽었다. 드래그·드롭으로 게임 내 건물을 배치하고 "line-node 방식"으로 컨베이어·파이프를
연결하는 Unity 제작 데스크톱/웹 도구다. 개발자가 "Unity와 GIMP로 만들었다"고 명시한다 — 즉 **자체 제작 그래픽**이지 게임에서
추출한 3D 모델이 아니다. 최근 개발 로그는 "벨트·파이프의 새 텍스처링 시스템", "벨트 노드용 신규 그래픽" 등을 언급한다.

**[추론]** "새 텍스처링 시스템", "노드용 그래픽" 표현으로 볼 때 기계는 **커스텀 2D 아이콘/스프라이트**로 그려질 가능성이
높다(순수 사각형보다는 나은 수준). 다만 페이지 텍스트만으로는 기계 자체가 아이콘인지 사각형인지, 축척이 실제 8m 격자와
일치하는지 확정할 수 없었다. `docs/research/layout-design-tools.md`도 이 도구를 "낡음(Update 6 기준)"으로 기록해 두었다.

- 출처: [SaLT — itch.io](https://autumnfallstudios.itch.io/salt), [Devlog: Release InDev0.2.14](https://autumnfallstudios.itch.io/salt/devlog/250252/release-indev0214-standalone-indev0214-web)

### 1.2 satisfactory-layouts.com

**[검증(부분)]** 사이트 타이틀은 "Satisfactory Layouts - 2D Satisfactory Layout Tool"이다. WebFetch가 페이지 본문을
가져오지 못해(타이틀만 반환) 렌더링 방식을 직접 확인하지 못했다. `docs/research/layout-design-tools.md`에는 이미 이
도구가 "기계 배치, 레시피·클럭 지정, 블루프린트로 묶기" 기능이 있다고 기록되어 있으나 그 기록도 시각 표현 방식(아이콘
vs 사각형)까지는 다루지 않는다.

**결론: 이 조사에서는 시각 표현 방식을 확정하지 못했다.** 별도로 브라우저 스크린샷을 떠서 확인해야 한다(자동화 도구로는
막힘).

- 출처: [satisfactory-layouts.com](https://www.satisfactory-layouts.com)

### 1.3 satisfactoryproductionplanner.com

**[간접 확인]** 여러 차례의 WebSearch에서 사이트 자체 텍스트로 보이는 동일한 문구가 반복 확인됐다: *"Full Production
Diagram — a plan-wide, pan-and-zoom diagram of your whole factory with every step as a node and every material flow as
a labeled directed edge... **zoom in to reveal each step's actual building layout**"*. 즉 사용자가 인용한 "줌인하면 실제
건물 배치가 나온다"는 주장은 사이트 마케팅 문구로 실재한다.

**[검증 불가]** WebFetch로 `satisfactoryproductionplanner.com/factories`에 직접 접근했으나 페이지가 클라이언트 사이드
렌더링(SPA)이라 정적 HTML에 내용이 없어 "타이틀만" 돌아왔다. **그 "실제 건물 배치"가 사각형인지, 아이콘인지, 실제 축척
스프라이트인지는 확인하지 못했다** — 문구만으로는 판단 불가. 과장 마케팅일 가능성을 배제할 수 없다.

- 출처: [satisfactoryproductionplanner.com/factories](https://satisfactoryproductionplanner.com/factories)

### 1.4 satisfactory-calculator.com (SCIM) — Interactive Map / Production Planner / Blueprints

**[검증]** SCIM 인터랙티브 맵은 세이브 파일(언리얼 엔진 바이너리)을 JSON으로 변환해 **Leaflet.js 기반 2D 지도**에 표시하는
도구다. 위키·개발자 본인 사이트(anthor.net) 설명에 "2D 지도 렌더링 엔진"이라고 명시되어 있고, 별도 3D 지도 도구
(`moritz-h/satisfactory-3d-map`)와는 다른 프로젝트다. **인터랙티브 맵 자체는 3D가 아니라 2D 지도(Leaflet) 위에 노드·건물을
표시하는 방식이다.**

**[검증 불가 — 사용자 전제와 다를 수 있음]** 사용자가 제시한 "SCIM이 브라우저에서 실제 3D 건물 모델을 렌더링한다"는 전제는
**Production Planner/Blueprint Designer 쪽**을 가리키는 것으로 보이는데, `satisfactory-calculator.com`의 실제 페이지들
(`/en/blueprints`, `/en/buildings/detail/...`)은 모두 **403으로 자동화 접근을 차단**해 직접 확인하지 못했다. 검색으로는
Babylon.js/glTF 같은 구체적 기술 언급을 찾지 못했다 — 즉 **3D 렌더링 여부·엔진·모델 포맷을 이번 조사로 확정할 수 없다.**
사람이 직접 브라우저로 접속해 확인해야 한다.

**[검증]** GitHub 저장소(`AnthorNet/SC-InteractiveMap`, `AnthorNet/SC-ProductionPlanner`)는 소스 공개용이 아니라
"교육 목적으로만 열람 가능"이며, 라이선스가 명시적으로 **"소스 코드·데이터 자산의 재사용을 어떤 경우에도 허용하지
않는다(Reuse... is not permitted in any case)"**, "satisfactory-calculator.com 도메인에서만 사용되도록 의도됨"이라고
못 박는다. → **여기서 자산을 참고용으로도 가져올 수 없다.** 코드 구조를 보는 것 자체는 교육 목적으로 허용되지만, 이미지·모델
파일을 재사용하는 것은 라이선스 위반이다.

- 출처: [GitHub — AnthorNet/SC-InteractiveMap](https://github.com/AnthorNet/SC-InteractiveMap), [GitHub — AnthorNet/SC-ProductionPlanner](https://github.com/AnthorNet/SC-ProductionPlanner), [anthor.net/en/satisfactory](https://anthor.net/en/satisfactory)

### 1.5 Satisfactory Modeler (itch.io)

**[검증(부분)]** itch.io 페이지 텍스트: "Model your Satisfactory builds. Set up your machines however you like...
the tool will calculate how the parts will flow." 기능(생산 계산기 모드 + 레이아웃 모드)은 확인되나, **시각 렌더링 방식은
페이지 텍스트에 없다.** Blender 기반이라는 사용자 전제는 검색으로 뒷받침하는 근거를 찾지 못했다 — 오히려 별도의
Windows/macOS/Linux 독립 실행 도구로 보인다. **Blender 워크플로 여부는 확인하지 못했다.**

- 출처: [satisfactorymodeler.itch.io](https://satisfactorymodeler.itch.io/satisfactorymodeler)

### 1.6 오픈소스 SVG/2D 스프라이트 저장소

**[검증]** 이번 조사에서 "Satisfactory 기계용 완성된 탑다운 SVG 심볼 세트"를 제공하는 공개 저장소는 찾지 못했다.
발견한 관련 프로젝트는 다음과 같다.

| 저장소 | 성격 |
|---|---|
| `DavidHGillen/Satisfactory_ModelingTools` | 모드용 3D 모델링 **툴체인**(Blender 등)이지 완성 스프라이트 세트가 아님. "게임에서 추출한 자산을 참고해 처음부터 새로 만든" 모드용 모델이며 재배포 제한이 명시됨 |
| `moritz-h/satisfactory-3d-map` | 세이브 파일을 3D로 시각화하는 별도 오픈소스 도구(공식 SCIM과 무관) — 렌더링에 실제 건물 지오메트리를 쓰는지는 이번 조사에서 미확인 |

→ **결론: "가져다 쓸 수 있는 완성된 오픈소스 탑다운 아이콘 세트"는 발견하지 못했다.** 직접 만들어야 한다.

- 출처: [GitHub — DavidHGillen/Satisfactory_ModelingTools](https://github.com/DavidHGillen/Satisfactory_ModelingTools), [GitHub — moritz-h/satisfactory-3d-map](https://github.com/moritz-h/satisfactory-3d-map)

---

## 2. 비교표

| 도구 | 기계 표현 방식 | 축척 정확도 | 벨트 표현 | 자산 출처 | 확인 수준 |
|---|---|---|---|---|---|
| SaLT | 커스텀 2D 그래픽(자체 제작, Unity+GIMP) — 사각형보다는 나을 가능성 | 불명 | 라인+노드 | 개발자 자체 제작 | **[간접 확인]** |
| satisfactory-layouts.com | 불명 | 불명 | 불명 | 불명 | **확인 불가**(자동화 차단) |
| satisfactoryproductionplanner.com | "줌인하면 실제 건물 배치"라고 주장 — 진위·형식 미확인 | 불명(주장뿐) | 불명 | 불명 | **[간접 확인]**(마케팅 문구만) |
| SCIM 인터랙티브 맵 | Leaflet 기반 **2D 지도** — 3D 아님 | 노드·자원 위치는 정확(세이브 파일 좌표 기반) | 해당 없음(공정 배치 도구 아님) | 세이브 파일 직접 파싱 | **[검증]** |
| SCIM 생산/블루프린트 플래너 | **미확인** (사용자 전제인 "3D 브라우저 렌더"는 확인도 반증도 못 함) | 미확인 | 미확인 | 코드·자산 재사용 명시적 금지 | **확인 불가**(403) |
| Satisfactory Modeler | 불명(페이지에 렌더링 언급 없음) | 불명 | 불명 | 불명 | **확인 불가** |
| 오픈소스 SVG 세트 | 완성품 없음 | — | — | — | **[검증]**(부재 확인) |
| **우리 현재 구현** (`FactoryDrawing.tsx`) | **빈 사각형 + 번호**(`fd-machine` rect) | **정확**(8m 파운데이션 격자 = `PX` 단위) | **있음** — 산키 굵기 비례, 직각 라우팅, 입출력 포트 마커(`fd-port`) | 없음(순수 SVG 도형) | **[검증]**(코드 직독) |

**핵심 발견**: 조사 대상 대부분이 시각 표현의 세부사항을 검증 가능한 형태로 공개하지 않는다(다운로드 필요, SPA라
크롤링 불가, 자동화 접근 차단). 반면 **우리 도구는 이미 축척 평면도·산키 굵기·직각 라우팅·입출력 포트**라는, 조사한
어떤 경쟁 도구보다 명확히 검증된 "도면 관행"을 갖추고 있다(`docs/research/layout-expert-techniques.md` §6 참고). 부족한
건 정확히 하나 — **기계 종류를 구분하는 시각 기호**뿐이다.

---

## 3. 한국 커뮤니티 "모듈 시트" — 어떻게 만드는가

**[검증]** "앤디스팩토리" YouTube 채널(`[앤팩 설계 연구소]` 시리즈)이 새티스팩토리 공정 설계 콘텐츠를 다루는 채널로
확인된다. 채널·영상 존재는 검색으로 확인했으나, **영상 설명란에 제작 도구(카메라 모드, 편집 프로그램)를 명시한 텍스트는
가져오지 못했다**(YouTube 페이지가 설명란을 정적으로 노출하지 않음 — 자동화 접근 한계).

**[검증 — 정황 근거]** 대신 이 워크플로가 기술적으로 가능한 이유는 확인했다:

- Satisfactory 1.1 패치로 **Photo Mode**가 대폭 개편되어 "카메라를 플레이어에게서 분리해 자유 이동"(디컵드 카메라,
  파이오니어 기준 150~160m 반경), **수직 이동(위/아래)**, **UI/핫바 숨김**(스크린 레코딩용) 기능이 추가됐다.
  즉 **게임 자체 기능만으로 진짜 위에서 내려다본 무-UI 스크린샷을 찍을 수 있다.**
- 출처: [Photo Mode — Official Satisfactory Wiki](https://satisfactory.wiki.gg/wiki/Photo_Mode)

**[추론]** 이 두 사실(1. 한국 커뮤니티 모듈 시트가 실제 게임 화면과 정확히 일치하는 탑다운 사진처럼 보인다는 것은
일반적으로 알려진 관찰, 2. Photo Mode가 그런 촬영을 정확히 지원한다는 것)을 종합하면, 가장 가능성 높은 제작 과정은
다음과 같다 — **단, 이것은 추론이며 특정 창작자가 이렇게 만든다고 직접 확인한 것은 아니다**:

1. 게임 내에서 모듈을 실제로 건설
2. Photo Mode로 카메라를 디태치해 수직 위로 이동, 진짜 탑다운(또는 살짝 기운 등각에 가까운) 앵글로 이동
3. UI 숨김 상태로 스크린샷 촬영
4. 외부 이미지 편집 프로그램(포토샵/피그마 등 — 어떤 프로그램인지는 미확인)에서 스크린샷에 격자선·번호·화살표를
   오버레이하고, 옆에 건물 목록(BOM)·특징 텍스트 패널을 합성

**이 워크플로를 우리가 그대로 따라 할 수 없는 이유**: 이 방식은 **사람이 게임 안에 이미 지은 모듈을 사후 촬영**하는
것이지, **웹 앱이 좌표 데이터로부터 자동 생성**하는 것이 아니다. 우리 문제(자동 생성)와 근본적으로 다른 파이프라인이다.
참고할 점은 "결과물의 톤"(실사 배경 위에 도면 오버레이)이지, 기술을 그대로 가져올 수는 없다.

---

## 4. 자산 가용성과 라이선스

**[검증]** 확인된 선택지와 각각의 법적 상태:

| 선택지 | 상태 | 근거 |
|---|---|---|
| 게임 파일에서 직접 추출(FModel 등) | 기술적으로 가능. 모딩 공식 문서가 추출 절차를 안내한다 | [Extracting Game Files — Satisfactory Modding Docs](https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html) |
| 추출물의 **재배포** | **불가.** 커뮤니티 모델링 툴 저장소도 "모드·밈·영상·리뷰 등 무료 사용 목적에 한함, 그 외(유료 포함) 용도는 개발사 의사에 반하며 중단 대상"이라고 명시 | [DavidHGillen/Satisfactory_ModelingTools](https://github.com/DavidHGillen/Satisfactory_ModelingTools) |
| 공식 위키(satisfactory.wiki.gg) 이미지 | 업로드 시 "This is from the game or other materials owned by Coffee Stain Studios" 라이선스 태그 필요 — **저작권은 CSS가 보유**, 위키가 재라이선싱하는 게 아니다 | [Tutorial:Extracting UI icons](https://satisfactory.fandom.com/wiki/Tutorial:Extracting_UI_icons)(직접 열람은 402/결제 페이지로 막혀 간접 확인) |
| SCIM 자산(아이콘/모델) | **명시적으로 재사용 금지** — 다른 도메인에서 쓸 수 없다 | GitHub 라이선스 문구(위 1.4 인용) |
| 위키 건물 페이지 이미지 | 대부분 **등각/3D 렌더 스크린샷**이지 탑다운이 아니다(Constructor 문서 페이지 확인) — 우리가 원하는 "탑다운 실루엣"과 형식이 다르다 | [satisfactory.wiki.gg/wiki/Constructor](https://satisfactory.wiki.gg/wiki/Constructor) |

**우리 프로젝트의 현재 정책(CLAUDE.md 규칙 4)과 대조**: 이미 "위키 자산은 출처 표기 조건으로 사용, 상업적 사용·게임사
사칭 금지"로 운영 중이다. 이번 조사로 확인된 사실은 이 정책과 **정합적**이다 — 즉 위키에서 가져온 등각 이미지를 "기계가
무엇인지 보여주는 참고 썸네일"로 곁들이는 것은 기존 원칙 내에서 가능하나, **탑다운 실루엣 자체는 위키에 없으므로
직접 그려야 한다.**

- 위키 이미지가 대부분 등각(isometric)인 이유(추론): Coffee Stain의 공식 스크린샷·인게임 카메라 앵글 관행이 등각에
  가깝고, 커뮤니티가 그 앵글을 그대로 업로드하는 경향 때문으로 보인다. 위키가 의도적으로 탑다운을 배제한다는 근거는
  찾지 못했다.

---

## 5. 산업 도면(P&ID/설비 배치도) 관행 — 베낄 만한 것

**[검증]** P&ID(Piping & Instrumentation Diagram)·설비 배치도 관련 자료(Vista Projects, ESAin, LineCAD, Creately 등
업계 가이드)에서 공통으로 확인되는 관행:

1. **표준화된 설비별 기호** — ISA S5.1 / ISO 10628 / ANSI 표준 심볼 라이브러리를 쓴다. 탱크·반응기·열교환기·펌프 등
   **설비 종류마다 고유한 실루엣**이 있고, 그 실루엣만으로 설비 종류를 구분할 수 있다(색이나 텍스트 없이도).
2. **실제 축척 배치** — 배관·기기 배치도는 실제 치수 비율을 유지한다(우리는 이미 8m 격자로 이를 만족).
3. **포트/노즐 표시** — 입출력 연결부에 명시적 마커를 찍는다(우리는 이미 `fd-port`로 구현).
4. **흐름 방향 화살표** — 라인에 화살표로 흐름 방향을 명시한다(우리는 이미 `marker-end="url(#fd-arrow)"`로 구현).
5. **라인 종류로 배관/전선/신호를 구분** — 실선/파선/굵기·색으로 유체 종류(공정 배관 vs 계장 신호 등)를 구분한다.
6. **관련 기기를 공정 흐름 순서로 배치**하고, 흐름과 무관한 정렬(예: 알파벳순)은 피한다.

**우리 도면과의 격차**: 위 6개 관행 중 1번(설비별 고유 기호)만 우리가 아직 안 하고 있다. 나머지 5개는
`FactoryDrawing.tsx`가 이미 구현했다(격자 축척, 포트 마커, 화살표, 산키 굵기, 공정 순서 배치). **즉 우리 도면은 이미
P&ID 관행의 대부분을 따르고 있고, 정확히 사용자가 지적한 지점(기계가 다 똑같은 사각형)만 비어 있다.**

- 출처: [Vista Projects — 363 Common P&ID Symbols](https://www.vistaprojects.com/common-pid-symbols/), [ESAin — P&ID Symbols Legend](https://esain.com/p-and-id-symbols-legend-for-piping/), [LineCAD — P&ID Symbols Complete Guide](https://linecad.com/pid-symbols-complete-guide-for-engineers-and-designers/)

---

## 6. 권장안 — 게임 렌더 없이 품질을 올리는 방법

전제: 3D 게임 렌더·SCIM 자산·위키 스크린샷 재사용은 라이선스·기술적 이유로 모두 배제(§4). **우리가 통제할 수 있는
것은 SVG로 직접 그리는 2D 탑다운 기호뿐이다.** 아래는 효과 대비 노력(effort vs payoff) 순.

### 6-A. 건물 종류별 SVG 실루엣 심볼 (노력: 낮음~중간 / 효과: 큼) — **최우선 권장**

지금 `fd-machine`은 모든 기계에 대해 동일한 `<rect>`다. 건물 클래스(제작기/조립기/제련기/정제기/입자 가속기 등)별로
**서로 다른 실루엣**을 가진 작은 SVG `<symbol>` 세트를 만들어 `<use>`로 인스턴스화한다.

- P&ID 관행(§5)이 근거: 종류만 봐도 구분되는 고유 실루엣이 핵심이다. 색만으로 구분하지 않는다(CLAUDE.md 색각 이상
  규칙과도 정합적 — 실루엣이 1차 구분 신호, 색은 보조).
- 구현 방법: 게임 배포 데이터(`Docs.json`)에는 건물 클래스명(`Build_ConstructorMk1_C` 등)과 실제 치수가 있다(이미
  `layout.ts`가 `fp.widthM`/`fp.lengthM`/`fp.heightM`을 씀). 이 치수 비율에 맞춰 각 건물 종류마다 손으로 그린 단순
  아이콘(사다리꼴=제련기, 컨베이어 벨트 모양의 좁고 긴 직사각형=제작기, 원통형=파이프 관련 등 게임 실제 형태를 단순화한
  실루엣)을 5~10종만 만들면 대부분의 화면을 커버한다(제작기·조립기·제련기·정제기·입자 가속기·용광로가 압도적 다수).
- 데이터-표현 분리 원칙(CLAUDE.md) 준수: 심볼은 `src/lib/gamedata.ts`가 참조하는 건물 클래스명에 매핑된 정적 SVG
  심볼 테이블로 관리하고, 좌표·치수는 계속 솔버(`layout.ts`)에서 계산한다.

### 6-B. 입출력 포트에 방향·종류 아이콘 추가 (노력: 낮음 / 효과: 중간)

이미 `fd-port`(사각형 마커)가 있다. 여기에 유체(파이프)와 고체(벨트)를 **모양으로** 구분(원 vs 삼각형 등)하면
P&ID의 "라인 종류로 매체 구분" 관행을 완성한다. `strokeFor()`가 이미 유량을 굵기로 표현하고 있으니, 포트 모양만 추가
비용으로 매체 구분까지 얻는다.

### 6-C. 기계 내부에 축소 레시피 아이콘 배치 (노력: 중간 / 효과: 중간~큼)

`fd-mno`(번호)만 있는 자리에, 게임 아이템 아이콘(우리가 이미 위키 출처로 보유 중인 `public/assets/` 자산 — 코드
규약상 이미 사용 중인 리소스)을 24×24px 정도로 작게 넣는다. 이러면 "이 사각형이 무슨 기계인지"뿐 아니라 "무엇을
만드는지"까지 한눈에 보인다. 단, CLAUDE.md 규칙(자원 구분에 색만 쓰지 않기, 텍스트 라벨 병기)을 지켜 아이콘 옆에
여전히 텍스트를 유지해야 한다.

### 6-D. 배경에 "참고용" 등각 썸네일 패널 추가 (노력: 낮음 / 효과: 작음~중간, 리스크 있음)

위키에서 이미 출처 표기하에 쓰고 있는 등각 이미지(§4)를, 도면 옆 범례(legend) 영역에 "이 기호가 실제로는 이렇게
생겼다"는 작은 참고 썸네일로 곁들인다. **도면 본체(축척 SVG)에는 넣지 않는다** — 등각 이미지는 축척이 다르므로 도면에
섞으면 오히려 §5의 "실제 축척 배치" 원칙을 깬다. 범례에만 국한.

### 6-E. 벨트 라우팅을 곡선/코너 처리 (노력: 중간 / 효과: 작음)

현재 직각 라우팅은 이미 P&ID·스파게티 다이어그램 관행에 부합한다(§5). 곡선화는 시각적 "고급스러움"은 올리지만
가독성·관행 정합성 면에서 우선순위가 낮다. **권장하지 않음** — 직각 유지가 오히려 정답에 가깝다.

### 하지 않을 것

- **3D 렌더 흉내(가짜 아이소메트릭)**: 진짜 3D 없이 아이소메트릭을 SVG로 흉내 내면 축척·정렬이 깨지기 쉽고, 유지비용 대비
  효과가 낮다. 현재 탑다운 방식을 고수하는 편이 낫다.
- **SCIM/위키 3D 모델 임베드**: §4에서 확인했듯 라이선스상 명시적으로 금지되어 있거나(SCIM), 애초에 탑다운 포맷으로
  존재하지 않는다(위키).

---

## 7. 확인하지 못한 것 (다음 조사에서 이어갈 것)

- satisfactory-layouts.com, satisfactoryproductionplanner.com, SCIM 생산 플래너/블루프린트 디자이너의 실제 렌더링
  방식 — 자동화 접근이 막혀 있어 **사람이 직접 브라우저로 열어 스크린샷을 남기는 방식의 후속 조사가 필요하다.**
- 앤디스팩토리(또는 다른 한국 창작자)가 실제로 어떤 카메라 모드·편집 툴을 쓰는지 — 영상 설명란·커뮤니티 댓글을
  사람이 직접 확인해야 한다. 이번 조사는 "가능한 워크플로 추론"에 그쳤다.
- Satisfactory Modeler가 Blender 워크플로를 쓰는지 여부 — 확인 못 함.
