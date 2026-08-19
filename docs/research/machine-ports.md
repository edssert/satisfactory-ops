# 리서치: 기계별 벨트·파이프 접속부(포트) 위치

- 조사일: 2026-08-19
- 스코프: 제련기·제작기·조립기·제조기·주조소·정제소·포장기·혼합기·채굴기 Mk.1·물 추출기의 컨베이어/파이프 접속부가
  **어느 면·어느 높이·중심에서 얼마나 떨어진 위치**에 있는지
- 배경: `docs/research/layout-knowledge.md` §2.1에서 이미 확인했듯, 게임 배포 데이터
  (`CommunityResources/Docs/en-US.json`)의 `mFactoryInputConnections` / `mFactoryOutputConnections`는
  **빈 문자열**이다. 접속부는 블루프린트 액터의 컴포넌트(소켓)라서 `Docs.json` 텍스트 덤프에 실리지 않는다.
  이번 조사는 이 결손을 커뮤니티 출처로 메울 수 있는지 확인하는 것이 목적이었다.

## 0. 결론 먼저

**어느 출처에도 면·높이·오프셋을 담은 수치 표는 없었다.** 공식 위키(`satisfactory.wiki.gg`),
satisfactory-calculator.com(SCIM), Steam 커뮤니티, Reddit 검색, GitHub(AnthorNet/SC-InteractiveMap)를
모두 확인했지만 전부 "입력 몇 개·출력 몇 개"라는 **개수**까지만 제공하고 **기하학적 위치**는 제공하지 않는다.
유일하게 건진 것은 아래 두 가지 **정성적** 사실뿐이다:

1. 제조기(Manufacturer)는 예외적으로 입력이 **앞면**에 있고, 그 외 모든 생산 기계는 입력이 **뒷면**에 있다
   (공식 위키 Trivia, `consensus`).
2. 핵발전소(Nuclear Power Plant, 이번 스코프 밖)는 입출력이 토대 그리드에서 0.5 m 어긋나 있어 분배기와
   맞추려면 짧은 벨트가 필요하다는 커뮤니티 보고가 있다 — **일부 기계는 그리드에 딱 맞지 않을 수 있다**는
   경고 신호로만 기록한다.

높이·수평 오프셋의 정밀값은 **어떤 출처에도 없다**. 아래 §2에 기계별로 확인 못 함을 명시한다.

---

## 1. 확인된 것

### 1.1 제조기 입력은 앞면 — `consensus`

> "The Manufacturer is the only production machine which has the inputs on the front.
> All other machines have the input on the back."

출처: [Manufacturer — Official Satisfactory Wiki](https://satisfactory.wiki.gg/wiki/Manufacturer) (Trivia 절, 2026-08-19 확인).
Confidence: `consensus` — 위키 편집자가 직접 관찰해 적은 서술이고 게임 데이터로 재확인은 못 했지만,
공식 위키(커뮤니티 운영이지만 Coffee Stain이 공식으로 지정)에 명시된 단일하고 구체적인 주장이며
반박하는 출처가 없다.

**여기서 끌어낼 수 있는 일반화** (이 문장 자체는 위키에 없고, 문장의 논리적 귀결이라 `assumed`로 표시):
- 제조기를 제외한 나머지 9개 기계(제련기·제작기·조립기·주조소·정제소·포장기·혼합기·채굴기·물 추출기)는
  **입력이 뒷면**이라는 것까지는 `consensus`.
- "출력은 앞면"이라는 것은 위키가 명시적으로 말하지 않았다. 뒷면이 입력이라는 것에서 출력이 반드시
  앞면이라는 결론이 자동으로 나오지 않는다(옆면일 수도 있다). 이 부분은 `assumed`로 남긴다.

### 1.2 위키 갤러리에 앞/옆/뒤 사진이 존재함 — 활용 못 함

조립기(Assembler) 위키 문서에는 "Front of an assembler", "Side of an assembler", "Back of an assembler"라는
캡션의 이미지 3장이 있다. 캡션 자체는 포트 위치를 설명하지 않지만, **사람이 직접 사진을 보면 포트 면을
육안 확인할 수 있는 소재**다. 이번 조사에서는 접근하지 못했다 — `satisfactory.wiki.gg`는 콘텐츠가
자바스크립트로 렌더링되는 SPA라 이미지 URL이 정적 HTML에 없고, WebFetch 툴의 텍스트 요약으로는
이미지 자체를 볼 수 없었다. **후속 조사 시**: 브라우저로 직접 열어 스크린샷을 찍거나, wiki.gg의 이미지
CDN 경로(`https://static.wikitide.net/...` 계열로 추정, 미검증)를 찾아 다운로드하면 육안 확인이 가능할
것으로 보인다.

### 1.3 개수(입력/출력 몇 개) — `verified` (게임 데이터 기준, 이미 확보)

이 값들은 이번 조사 대상이 아니라 이미 `docs/research/layout-knowledge.md`에 정리돼 있다. 참고로 위키·SCIM도
같은 개수를 보고해 교차 확인된다.

| 기계 | 입력 | 출력 |
|---|---|---|
| 제련기 | 벨트 1 | 벨트 1 |
| 제작기 | 벨트 1 | 벨트 1 |
| 조립기 | 벨트 2 | 벨트 1 |
| 제조기 | 벨트 4 | 벨트 1 |
| 주조소 | 벨트 2 | 벨트 1 |
| 정제소 | 벨트 1 + 파이프 1 | 벨트 1 + 파이프 1 |
| 포장기 | 벨트 1 + 파이프 1 | 벨트 1 + 파이프 1 |
| 혼합기 | 벨트 2 + 파이프 2 | 벨트 1 + 파이프 1 |
| 채굴기 Mk.1 | (자원 노드에서 흡입, 벨트 입력 없음) | 벨트 1 |
| 물 추출기 | (수원에서 흡입, 파이프 입력 없음) | 파이프 1 |

### 1.4 치수 — 출처 간 불일치, 게임 데이터가 정본

위키(`satisfactory.wiki.gg`)와 satisfactory-calculator.com이 보고하는 치수가 서로 다르고,
`layout-knowledge.md`에 이미 확보된 게임 데이터(`mClearanceData` 합집합, `verified`)와도 다르다.

| 기계 | 게임 데이터(`verified`, 이미 확보) | wiki.gg 표기 | SCIM 표기 |
|---|---|---|---|
| 제련기 | 5×10×4.5 m | 5×10×**8.5** m | **6×9×10** m |

프로젝트 절대 규칙 1(수치는 출처 우선순위대로)에 따라 **게임 데이터 값이 정본**이며 위키·SCIM 값은 쓰지 않는다.
차이의 원인으로 추정되는 것(미검증, `assumed`): wiki.gg의 8.5 m는 `mClearanceData`의 위쪽 CT_Soft 박스
(굴뚝/안테나, `layout-knowledge.md` §2.1에서 이미 포트가 아니라고 확인한 그 기둥)까지 포함한 시각적 전체
높이로 보인다. SCIM의 6×9×10은 아예 다른 측정 기준(클리어런스가 아니라 렌더 모델 바운딩 박스?)일 가능성이
있으나 확인하지 못했다. **이 불일치 자체를 기록해 둔다** — 향후 누군가 "위키엔 8.5 m라던데 왜 4.5 m를
쓰냐"고 물으면 이 절이 답이다.

---

## 2. 확인 못 함 (기계별)

아래 전부 "확인 못 함"이다. 표는 무엇을 시도했고 무엇이 없었는지 기록하기 위한 것이다.

| 기계 | 입력 면 | 입력 높이 | 입력 수평 오프셋 | 출력 면 | 출력 높이 | 출력 수평 오프셋 | 시도한 출처 |
|---|---|---|---|---|---|---|---|
| 제련기 | 확인 못 함 (뒷면 `assumed`, §1.1 일반화) | 확인 못 함 | 확인 못 함 | 확인 못 함 (앞면 `assumed`) | 확인 못 함 | 확인 못 함 | wiki.gg/Smelter, SCIM(403 차단) |
| 제작기 | 확인 못 함 (뒷면 `assumed`) | 확인 못 함 | 확인 못 함 | 확인 못 함 (앞면 `assumed`) | 확인 못 함 | 확인 못 함 | wiki.gg/Constructor (패치노트 "Adjusted alignments of I/O:s on Constructors" 0.1.9만 확인, 수치 없음) |
| 조립기 | 확인 못 함 (뒷면 `assumed`) — **2개가 같은 면에 나란히인지, 다른 면에 나뉘는지도 확인 못 함** | 확인 못 함 | 확인 못 함 | 확인 못 함 (앞면 `assumed`) | 확인 못 함 | 확인 못 함 | wiki.gg/Assembler (패치노트 "Adjusted alignments of inputs/outputs and clearance" 0.1.11만 확인). 갤러리에 앞/옆/뒤 사진 있으나 접근 못 함(§1.2) |
| 제조기 | **앞면** (`consensus`, §1.1) — 4개의 배치(가로 일렬/2×2 등)는 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 (뒷면으로 추정되나 `assumed`조차 근거 약함 — 위키가 "input이 앞"이라고만 했지 output 면은 언급 안 함) | 확인 못 함 | 확인 못 함 | wiki.gg/Manufacturer (패치노트 "0.2.1.19에서 모델 갱신 시 앞뒤가 뒤바뀜"만 확인, 위치 수치 없음) |
| 주조소 | 확인 못 함 (뒷면 `assumed`) — 2개 배치도 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 (앞면 `assumed`) | 확인 못 함 | 확인 못 함 | wiki.gg/Foundry (패치노트 "Re-aligned Foundry and Smelters inputs to allow for tighter connections" 0.1.10만 확인, 수치 없음) |
| 정제소 | 확인 못 함 (벨트·파이프가 같은 면인지 다른 면인지도 확인 못 함) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | wiki.gg/Refinery — 개수만 확인 |
| 포장기 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | wiki.gg/Packager — 개수만 확인 |
| 혼합기 | 확인 못 함 (벨트 2·파이프 2가 어느 면에 나뉘는지 전혀 모름) | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | 확인 못 함 | wiki.gg/Blender — 개수만 확인 |
| 채굴기 Mk.1 | 해당 없음(노드에서 직접 흡입, 벨트 입력 없음) | — | — | 확인 못 함 — **높이가 특히 중요한데도 못 구함** | 확인 못 함 | 확인 못 함 | wiki.gg/Miner — 개수만 확인 |
| 물 추출기 | 해당 없음(수원에서 직접 흡입) | — | — | 확인 못 함 (헤드리프트 10 m는 파이프 출구 **중심점 기준**이라는 서술은 있음 — 아래 §2.1 참고) | 확인 못 함 | 확인 못 함 | wiki.gg/Water_Extractor |

### 2.1 물 추출기의 유일하게 건진 반쪽짜리 단서

> "A Water Extractor provides a head lift of 10 meters, measured from the center point of its pipe outlet."

출처: [Water Extractor — Official Satisfactory Wiki](https://satisfactory.wiki.gg/wiki/Water_Extractor).
이건 파이프 출구가 "중심점(center point)"이라는 기준점의 **존재**만 알려줄 뿐, 그 중심점이 건물 어느 면·
어느 높이에 있는지는 말하지 않는다. `unsourced`에 준하는 반쪽 정보 — 화면에 쓸 수 있는 수치가 아니다.

### 2.2 시도했으나 막힌 경로

- **satisfactory-calculator.com 개별 건물 페이지의 3D/치수 상세**: WebFetch가 403으로 차단됨. `defuddle`
  CLI로도 접근했으나 정적 HTML에는 아이콘 이미지와 레시피 표만 있고 3D 모델/커넥터 좌표는 자바스크립트로만
  렌더링되어 텍스트 추출 도구로는 못 얻음.
- **AnthorNet/SC-InteractiveMap (GitHub)**: 코드 검색을 시도했으나, 이 저장소는 "자원 노드가 찍힌 월드
  지도"이지 "건물의 3D 소켓 좌표"를 다루는 저장소가 아니다. 스코프가 다르다 — 애초에 없을 가능성이 높다.
- **`satisfactory.wiki.gg`의 MediaWiki API(`api.php`)를 직접 curl로 호출**: "Blocked" 페이지 반환 (자동화
  요청 차단, User-Agent 조작으로도 우회 안 됨). WebFetch 툴 경유는 정상 동작했으나 이건 텍스트 요약만
  주고 이미지·raw wikitext는 안 줌.
- **Reddit 검색**: WebSearch로 여러 차례 시도했으나 `site:reddit.com` 결과가 거의 없었고(검색 엔진이
  Steam 커뮤니티 결과로 대체함), 있는 결과도 일반적인 "벨트는 지상 3 m에서 시작한다", "리프트 최소
  높이가 3이라 기계를 3단·5단에 짓는다" 같은 **레이아웃 관행**이지 기계별 포트 좌표가 아니었다.
- **`FGFactoryConnectionComponent`/`RelativeLocation` 같은 언리얼 엔진 내부 클래스명으로 검색**: 모딩
  문서·디컴파일 자료가 검색에 걸리지 않음. `SatisfactoryModLoader`(GPL-3.0) 소스를 직접 열어보면 나올
  가능성이 있으나, 이번 조사에서는 열지 못했다 — 다음 조사 후보로 남긴다.

---

## 3. 도면 생성기가 지금 무엇을 가정해야 하는가

수치가 없는 상태에서 도면을 그려야 하므로, 아래를 **표기된 가정(labeled assumption)**으로 채택할 것을
제안한다. 전부 `assumed`이며 실측이 아니다.

1. **입출력 면**: 제조기만 입력=앞면/출력=뒷면(추정)으로, 나머지 9개는 입력=뒷면/출력=앞면으로 가정한다.
   근거는 §1.1의 위키 인용 하나뿐이므로 신뢰도가 낮다. 조립기·제조기·혼합기·정제소처럼 입력이 2개 이상인
   기계는 "같은 면에 나란히 있다"고 가정하되, 이 가정은 §1.1보다도 근거가 약하다(순수 추측).
2. **높이**: 모든 포트가 **기계 밑면(바닥)에서 같은 높이**에 있다고 가정한다 — 실제로는 기계마다 다를
   수 있다. 근거 없음, 순수 편의상 단순화.
3. **수평 오프셋**: 모든 포트가 **해당 면의 폭 중앙**에 있다고 가정한다. 입력이 여러 개인 기계는
   폭을 입력 개수만큼 균등 분할한 위치에 있다고 가정한다.
4. **화면 표기 방법**: 가정에 기반해 그린 접속선(벨트/파이프)은 실선이 아니라 **점선 + 옅은 색 + "포트
   위치 추정" 각주**로 표시한다. 범례에 "추정: 실측 데이터 없음, 게임 화면과 다를 수 있음"을 명시한다.
   이건 프로젝트 규칙(검증 못 한 수치를 그냥 쓰지 않는다, `openQuestions`에 남긴다)을 화면 차원에서
   지키는 방법이다. 색으로만 구분하지 말고 텍스트 라벨을 반드시 병기한다(색각 이상 대응, CLAUDE.md
   코딩 규약).
5. **실측이 확보되면 교체할 자리**: `src/data/curated/`에 `machine-ports.json` 같은 파일을 새로 만들어
   기계별 면·높이·오프셋을 담고, 값이 없는 필드는 `null` + `confidence: "assumed"`로 채워 두면 나중에
   실측치가 나왔을 때 그 필드만 갈아 끼울 수 있다. 지금 이 문서(§2 표)가 그 초안 역할을 한다.

---

## 4. 참고 URL 전체 목록

- https://satisfactory.wiki.gg/wiki/Smelter
- https://satisfactory.wiki.gg/wiki/Constructor
- https://satisfactory.wiki.gg/wiki/Assembler
- https://satisfactory.wiki.gg/wiki/Manufacturer
- https://satisfactory.wiki.gg/wiki/Foundry
- https://satisfactory.wiki.gg/wiki/Refinery
- https://satisfactory.wiki.gg/wiki/Packager
- https://satisfactory.wiki.gg/wiki/Blender
- https://satisfactory.wiki.gg/wiki/Miner
- https://satisfactory.wiki.gg/wiki/Water_Extractor
- https://satisfactory.wiki.gg/wiki/Conveyor_Belts
- https://satisfactory.wiki.gg/wiki/Tutorial:Production_line
- https://satisfactory-calculator.com/en/buildings/detail/id/Build_SmelterMk1_C/name/Smelter (403 차단, defuddle로 부분 접근)
- https://github.com/AnthorNet/SC-InteractiveMap (스코프 밖으로 판단, 포트 좌표 없음)
- https://ficsit.app/mod/HologramLocation ("Location and Rotation" 모드 — 건물 배치 좌표/회전 HUD, 포트
  좌표는 아님)

## 5. 다음 조사 후보 (이번엔 못 한 것)

- wiki.gg 이미지를 실제로 열어(브라우저 스크린샷 또는 이미지 CDN 직접 다운로드) 조립기의 "앞/옆/뒤" 3장
  사진에서 포트 위치를 육안으로 확인. 수치는 못 얻어도 "어느 면에 있는가"는 확정할 수 있다.
- `SatisfactoryModLoader`(GPL-3.0) 소스에서 `FGFactoryConnectionComponent`를 직접 검색해 블루프린트
  기본값(`RelativeLocation`)이 C++ 쪽에 상수로 박혀 있는지 확인. 있다면 `verified`급 수치를 얻을 수 있는
  유일한 경로일 수 있다 — 단, GPL-3.0이라 수치만 발췌 인용(사실은 저작권 보호 대상이 아님)하고 코드는
  가져오지 않아야 한다.
- 실제로 게임을 설치해 창의 모드에서 기계를 세우고 F2 콘솔 또는 "Location and Rotation" 모드로 벨트
  연결점의 좌표를 직접 재는 것 — 가장 확실하지만 이번 조사 세션에서는 실행하지 않았다(게임 미실행).
