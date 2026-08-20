# 초반~중반 진행 순서 조사 (Progression Route & Tempo)

> 담당 범위: **진행 순서와 템포**만 다룬다. 대체 레시피 우선순위·도구 목록·배치 기법은 다른 조사 문서(`recipes.md`, `layout.md` 등) 소관이다.
> 기준 버전: **1.2**(2026-06-02 정식). 조사 시점: 2026-08-19.
> 교차 검증 축: 공식 위키(satisfactory.wiki.gg), 이 저장소의 `src/data/app/milestones.json`·`recipes.json`·`items.json`(1단 정규화 게임 데이터), speedrun.com 공개 API, 커뮤니티 가이드(Steam, GameRant, 개인 블로그).
> 기존 문서 `docs/research/progression.md`(마일스톤 비용·병목 정량 분석)와 상호 보완 관계다. 비용표·병목 계산은 그 문서가 이미 검증했으므로 여기서는 **중복 재검증 없이 인용**하고, 이 문서는 **순서·템포·스피드런·전력 전환 시점**에 집중한다.

---

## 요약

- 티어별 "먼저/나중/후회" 순서는 **다수 출처가 일치**한다: 물류(분배기·병합기) → 조립기 자동화 → 티어3 석탄 동력 즉시 러시 → 영구 기지는 석탄 이후. 이 원칙들은 이미 `progression.md`와 `milestone-advice.json`에 반영되어 있고, 이번 조사에서 3개 이상의 신규 독립 출처로 재확인됐다.
- speedrun.com 공개 API로 확인한 결과, Phase 1(스마트 플레이팅 50개, 티어3·4 개방)의 **글리치 없는(NMG) 세계기록은 696초(11분 36초)**, 5단계 전부 클리어(Any%)의 **글리치 없는 최신 기록은 23,481초(6시간 31분, 2026-08-17 갱신, 1.2 버전)**다. 반면 "효율적인 초보자" 가이드가 제시하는 현실적 목표는 티어3까지 **90분**이다 — 스피드런 최적해와 "잘 짜인 루트"의 실제 격차는 약 7.8배.
- 초반 자동화 목표 수치(순수 노드 기준)는 게임 데이터로 검증됨: 철광석 60/분(Mk.1 채굴기), 제련기 30/분 처리, 철봉 제작기 15/분, **나사 표준 레시피 40/분**(1개 출처가 "4/분"이라 적었으나 오기로 판단, 근거는 아래 3절). 석탄 발전기는 벨트 Mk.1 한 줄(60/분)에 정확히 4대까지, 급수 추출기는 120 ㎥/분.
- 이번 조사에서 저장소 데이터 자체에서 **1.0의 마일스톤 티어 재배치 흔적**을 발견했다: `Schematic_ID`의 접두 숫자(EA 시절 티어 번호)와 현재 `tier` 필드가 8건 불일치한다(예: `Schematic_4-2_C`는 ID상 티어4지만 현재 티어3). 패치노트의 "티어3~8 마일스톤 비용 조정" 서술이 비용뿐 아니라 **소속 티어 자체의 재배치**까지 포함했음을 시사한다.
- 가장 크게 갈리는 판단은 **FICSIT 청사진 Mk.1(티어4)을 완전히 건너뛰라는 단일 출처 주장**과, 하드 드라이브 선택지 개수(2+리롤 vs 3)다.

---

## A. 티어별 권장 순서 표

범례: **자동화 우선**(먼저 자동화) / **후순위**(손 제작으로 버텨도 됨) / **후회 유발**(하면 나중에 손해). 마일스톤 한글명은 `src/data/app/milestones.json`의 `ko` 필드(게임 공식 로케일, ADR-0017 정본)를 그대로 썼다.

| 티어 | 자동화 우선 | 후순위 | 후회 유발 | 출처(신뢰도) |
|---|---|---|---|---|
| **0 (온보딩)** | HUB 업그레이드 1~6 순차 진행 그 자체 (강제 순서, 선택지 없음) | — | "시작 레벨로 건너뛰기" 선택 — 채굴·전력 기초를 못 배우고 시작 | wiki.gg Milestones(검증) / Ultimate Beginner Guide(단일, "highly recommend DO NOT SELECT skip to level 1") |
| **1** | **물류(분배기·병합기·리프트)** — 벨트 Mk.1(60/분)이 순수 노드 Mk.1 채굴기(120/분)를 이미 절반 버리므로 분배 인프라가 없으면 자동화 위상 자체가 안 열림 | 기초 건축물(파운데이션·벽) — 정렬 편의일 뿐 처리량과 무관 | 파운데이션부터 완벽하게 깔고 시작 — 티어3 이전 기지는 어차피 버림 | Prima/xgamingserver(다수, `progression.md` 재인용) vs jeu.video(소수) — 이미 물류 우선으로 판정됨. 이번 조사의 "90분 컷 가이드"도 Tier 1.1(기초 건축)을 최후순위 목록에 배치해 재확인 |
| **2** | 조립기 자동화(강화 철판·로터 라인) → 스마트 플레이팅 자동 생산 | 점프 패드(2-3), 자원 싱크 보너스 프로그램(2-5), 물류 Mk.2(3-2, 순서상 2에 배치되지만 코일·석탄 준비 단계에서 필요) | 강화 철판·로터·나사를 계속 손으로 채우기 — "5분 넘게 작업대 앞에 서 있다면 공장이 뒤처진 것" | gamefoundry(신규, 명시적) / PC Gamer(신규) / Ultimate Beginner Guide(신규, "AUTOMATE EVERY NEW PART") — 3개 독립 출처 일치. 나사 자체 수치 근거는 `progression.md` C절 |
| **3** | **석탄 동력(Coal Power)을 최우선으로 즉시 러시**, 그다음 기본 철강 생산(강철 빔·파이프로 다음 우주 엘리베이터 부품 준비) | 차량 운송(트럭) — "벨트만으로 충분, 초반엔 안 급함" | 석탄 동력 열기 전에 영구 기지를 확정 — 철·석탄·석유·알루미늄이 다 멀어짐 | 5개 이상 독립 출처 일치(아래 D절 참고) / 차량 운송 후순위는 gamefoundry + Ultimate Beginner Guide 2건 일치("피와 고통을 자처하고 싶지 않다면 그냥 벨트로") |
| **4** | 하이퍼튜브(장거리 이동), 고급 철강 생산(채굴기 Mk.2), 확장 동력 인프라(전력 저장소) | 물류 Mk.3은 순서상 order 2지만 실사용은 석탄망 확장(8→16대) 시점에 맞춰도 무방 | **FICSIT 청사진 Mk.1을 아예 건너뛰라**는 강한 단일 의견(4×4×4 규격이 티어6의 Mk.2 청사진 5×5×5와 호환 안 됨) | Ultimate Beginner Guide(단일, "complete and utter trash... skip it") — **다른 출처로 교차검증 안 됨. `milestone-advice.json`에도 이 항목 없음.** 단일 출처이므로 앱에 "정설"로 넣지 말 것 |
| **5** | 석유 처리 계열(정제소·플라스틱·고무) — 이후 모든 티어의 병목 원자재 | — | 대체 레시피 없이 진입 — 나사·케이블·구리판·플라스틱 자체 제작 규모가 폭증 | Ultimate Beginner Guide(신규): "대체 레시피 없이 가면 나사·케이블·구리판·플라스틱 공장이 어마어마해진다" — `progression.md`의 "한국 커뮤니티 이탈 지점" 서술과 정합 |

**티어0 HUB 강제 순서 원가(재확인, `src/data/app/hub.json`):** ①철봉10 ②철봉20+철판10 ③철판20+철봉20+전선20 ④철판75+케이블20+콘크리트10 ⑤철봉75+케이블50+콘크리트20 ⑥철봉100+철판100+전선100+콘크리트50. 이 값은 `progression.md` G절과 완전히 일치(재검증 완료).

---

## B. 속도 진행(Speedrun) 루트

speedrun.com은 접근이 막혀 있어(스크래핑 방지, WebFetch/defuddle 모두 403) 공식 공개 API(`https://www.speedrun.com/api/v1/...`, 인증 불필요)로 직접 조회했다. 카테고리는 5단계로 나뉘며, 각각 우주 엘리베이터 Phase 진행과 정확히 대응한다.

| 카테고리 | 종료 조건 | 세계기록(글리치 허용) | 글리치 없음(NMG) 최고기록 |
|---|---|---|---|
| Package% | Phase 1 납품(스마트 플레이팅 50, 티어3·4 개방) | 696초 (11분 36초) — Epiphane, 2025-07-28, v1.1, 솔로, NMG | 위와 동일(1위 자체가 NMG) |
| 2Package% | Phase 2 납품 | 761초 (12분 41초) | 미분리 조사(위 기록도 변형값 미기재, 표준 취급) |
| 3Package% | Phase 3 납품 | 2,014초 (33분 34초) | 11,644초 (3시간 14분) — 2024-06-01, **v1.0 이전 Update 시절로 추정, 재검증 필요** |
| 4Package% | Phase 4 납품 | 5,970초 (1시간 39분) — Epiphane | 60,562초 (16시간 49분) — 2024-01-02, **Update 시절, 현재 1.2 수치와 직접 비교 불가** |
| Any% | 전체 클리어(Phase 5 + 발사 레버) | 8,959초 (2시간 29분) — 글리치(BDE/컨베이어 듀프) 사용, v1.0 | **23,481초 (6시간 31분)** — 2026-08-17 갱신, **v1.2**, 솔로, Passive, NMG, 청사진 리와인드 사용 |

카테고리 정의(자체 조회, 1차 출처):
- Package% 규칙: "run ends by launching the first elevator shipment"
- Any% 규칙: "run ends by completing the launch sequence and pulling the final Space Elevator lever. Time does not end when you submit Phase 5"

**해석 및 유의점:**
1. 스피드런 커뮤니티는 "필요한 마일스톤에 필요한 만큼만" 생산하고 그 외는 만들지 않는 전략을 쓴다는 것이 포럼 스니펫 수준에서 확인된다(speedrun.com 포럼 "category ideas" 검색 스니펫: "the run aims to complete all milestones as fast as possible by producing only resources required for the current milestone plus some additional resources"). **VOD를 직접 시청하지 않고는 프레임 단위 루트를 재구성할 수 없어, 이 이상의 세부 빌드오더는 "확인 못 함"으로 남긴다.**
2. Any%의 글리치 버전(8,959초)은 자산/컨베이어 듀프를 쓰므로 **"효율적 진행"의 근거로 쓰면 안 된다** — 정상 경제 규모를 벗어난다. NMG 버전(23,481초, v1.2, 2026-08-17 매우 최신)이 이 앱의 목적(현실적인 "지금 뭘 해야 하나")에 맞는 참고치다.
3. 3Package%·4Package%의 NMG 최고기록은 각각 2024-06-01·2024-01-02로 **1.0 정식 출시(2024-09) 이전**이라 Phase 4 비용이 대폭 하향된 현재(`progression.md` I절 참고) 수치와 직접 비교할 수 없다. 최신 NMG 갱신이 없다는 뜻이므로, 이 구간의 "1.2 기준 최적 시간"은 **확인 못 함**으로 분류한다.
4. Package%(Phase1) WR 696초 대 "90분 컷" 초보자 가이드(아래 D절) 목표 5,400초의 비율은 약 **7.8배** — 스피드런 최적해는 게임 내 지식·경로 암기가 완전할 때의 이론적 하한이고, 커뮤니티가 실전에서 권장하는 "효율적이지만 배우면서 하는" 속도는 그보다 훨씬 느리다. 앱의 목표 수치는 후자(90분대)를 기준선으로 삼아야 한다.

**출처:** speedrun.com 공개 API(`/api/v1/games/46w3wol1/categories`, `/api/v1/leaderboards/...`, `/api/v1/runs/...`) — 2026-08-19 직접 조회, 원 데이터는 이 조사의 1차 근거.

---

## C. 초반 자동화 목표 수치

게임 데이터(`src/data/app/recipes.json`, `items.json`)와 커뮤니티 가이드 수치를 대조했다.

| 항목 | 수치 | 검증 상태 |
|---|---|---|
| 순수 철 노드 + Mk.1 채굴기 | 120/분 (표준), 보통 노드는 60/분 | `progression.md` F절에서 위키 기준 이미 검증(verified) |
| 제련기 | 30 광석 in → 30 주괴 out | Ultimate Beginner Guide 수치와 게임 표준 제련 시간(4초, 재료1:생산1) 일치 |
| 철봉 제작기 | 15 주괴/분 in → 15 철봉/분 out | 동일 |
| **나사(Screw) 표준 레시피** | 철봉 10/분 소모 → **나사 40/분** 생산 | **위키 1차 검증**(`progression.md` C절, wiki.gg Screw). Ultimate Beginner Guide는 "10 iron rods per min, produce 4 screws a min"이라 적었는데 **40의 오기로 판단**(레시피가 철봉1→나사4, 6초 주기이므로 10 rod/분 입력 시 40 screw/분 산출이 산술적으로 맞음). 단일 출처 오류이므로 앱 데이터에 반영 금지 |
| 석탄 발전기 소비 | 석탄 15/분, 물 45 ㎥/분 | `progression.md` E절 검증 + Ultimate Beginner Guide 인게임 UI 스크린샷 판독치("15 per minute") 일치 |
| **벨트 Mk.1 한 줄당 석탄 발전기 한계** | 60 ÷ 15 = **정확히 4대** | 3개 독립 출처 일치: wiki.gg(`progression.md`), Ultimate Beginner Guide("if a single coal power plant requires 15/min... you can supply coal to 4 power plants"), 90분 컷 가이드(암묵적으로 4대 단위 빌드오더 사용) |
| 급수 추출기 | 120 ㎥/분 | `progression.md` E절 검증. Ultimate Beginner Guide: 발전기 4대(180 ㎥/분 필요) → 추출기 1.5대(1대+1대 50% 언더클럭 권장) — 3추출기:8발전기(360:360) 비율의 절반과 정확히 일치 |
| 콘크리트 초반 필요량(티어0~4 누적) | 2,980개, 제작기 1대로 약 3.3시간 | `progression.md` D절에서 이미 산출·검증. 이번 조사에서 재사용만 함(중복 검증 안 함) |

**결론:** 커뮤니티 수치는 위키 1차 데이터와 대부분 정합적이다. 유일한 불일치(나사 4/분 vs 40/분)는 단일 출처의 표기 오류로 판단되며, 이미 검증된 위키 수치(40/분)를 정본으로 유지해야 한다.

---

## D. 전력 전환 시점 — 바이오매스 → 석탄

**5개 이상 독립 출처가 "티어3 석탄 동력 해금 즉시 전환"에 일치한다:**

1. gamefoundry: "Coal Power is not optional comfort—it is your first real quality-of-life milestone... Treat this as a headline goal for the early game, not a side quest."
2. GameRant(7 Beginner Mistakes): "players should aim to unlock Tier 3 upgrades as soon as possible by manually crafting whatever they need... Only after Coal Power unlocks in Phase 2 should they aim to build a 'proper' base"
3. Ultimate Beginner Guide(Steam): "Coal Power so you can stop feeding your biomass burners and this will be the major item that completes this beginner guide" — 티어3·4 진입 시 3개 추천 순서 중 1순위
4. "90 minutes to Coal" 가이드(Steam, Maehlice, REDUX는 1.0 출시 직전 갱신): 제목 자체가 목표 — "Tier 1부터 90분 안에 완전 자동화된 석탄 동력 전환"이 가능하다고 주장하며 상세 빌드오더 제공
5. `progression.md` E·F절(위키 1차 검증) — 이미 동일 결론

**구체적 조건(정수 비율, 재확인):**
- 벨트 Mk.1 한 줄 = 석탄 발전기 4대 (C절 참고)
- 급수 추출기 1.5대 ≈ 발전기 4대분 물 수요(180 ㎥/분) — 실전에서는 2대 배치 후 1대를 50% 언더클럭 권장(Ultimate Beginner Guide)
- 확장 시 8대·16대 단위로 늘리려면 물류 Mk.2(120/분)·Mk.3(270/분)이 선행돼야 함(동일 출처, `progression.md` F절과 정합)

**전환 이후에도 바이오매스 버너를 완전히 철거하지 말 것** — 그리드가 트립(정지)됐을 때 재시동용 "점프 스타터"로 남겨두라는 실전 팁(Ultimate Beginner Guide, 단일 출처지만 `progression.md`의 "그리드 트립은 수동 리셋이 필요하다"는 검증된 메커니즘의 자연스러운 귀결이라 신뢰도 있음).

**1.0 이후 변화 여부:** 이 전환 시점(티어3=Phase1 이후) 자체는 EA 시절부터 구조가 동일했다는 정황(위키 문서에 버전별 서술 분리 없음)이나, **명시적으로 "EA에서는 달랐다"고 말하는 출처는 찾지 못함 — 확인 못 함.**

---

## E. 우주 엘리베이터 단계별 요구

wiki.gg에서 1차로 직접 확인(2026-08-19 조회)했다. `progression.md` B절과 완전히 일치하며, 이번 조사로 **재검증(2차 확인) 완료**.

| Phase | 명칭 | 요구 물량 | 개방 티어 |
|---|---|---|---|
| 1 | Distribution Platform | 지능형 도금판(Smart Plating) 50 | 3, 4 |
| 2 | Construction Dock | 지능형 도금판 1,000 / 다용도 골조(Versatile Framework) 1,000 / 자동 배선기(Automated Wiring) 100 | 5, 6 |
| 3 | Main Body | 다용도 골조 2,500 / 모듈 엔진(Modular Engine) 500 / 적응형 제어 장치(Adaptive Control Unit) 100 | 7, 8 |
| 4 | Propulsion | 어셈블리 지휘 시스템(Assembly Director System) 500 / 자기장 발생기(Magnetic Field Generator) 500 / 열 추진 로켓(Thermal Propulsion Rocket) 250 / 핵 파스타(Nuclear Pasta) 100 | 9 |
| 5 | Assembly | 핵 파스타 1,000 / 생화학 조형기(Biochemical Sculptor) 1,000 / 인공지능 확장 서버(AI Expansion Server) 256 / 탄도 워프 드라이브(Ballistic Warp Drive) 200 | 발사 + 'Employee of the Planet' 컵 |

파트 아이템 존재는 `src/data/app/items.json`(`Desc_SpaceElevatorPart_1_C`~`_12_C`)과 대조해 **명칭·개수 일치 확인**(12개 파트 아이템 전부 존재, ID 순번과 Phase 순번 일치).

**"언제부터 준비해야 하는가":** Phase2 부품(다용도 골조·자동 배선기)은 강철 빔·파이프·스테이터를 요구하므로, **티어3 기본 철강 생산이 선행되지 않으면 Phase2 레시피 자체가 조립기 메뉴에 뜨지 않는다**(Ultimate Beginner Guide: "New parts are made with parts or machines you haven't unlocked... you have to unlock Basic Steel Production on Tier 3 before you can see these parts"). 따라서 A절 표의 "석탄 동력 다음 곧바로 기본 철강 생산" 순서는 이 요구사항에서 직접 도출된다.

**주의 — 오래된/불일치 출처:** satisfactory-calculator.com의 일부 블루프린트 페이지는 Phase2를 "500/500/100"으로 표기한다. wiki.gg 1차 확인 결과 현재 값은 "1,000/1,000/100"이므로, **calculator 사이트 쪽이 EA 시절 값을 갱신 안 한 것으로 판단**하고 위키 값을 정본으로 채택한다.

---

## F. 1.0에서 바뀐 진행 (재확인)

`progression.md` I절이 이미 다룬 내용에 더해, 이번 조사로 신규 확인·보강한 것만 정리한다.

| 변경 | 확인 방법 | 신뢰도 |
|---|---|---|
| 티어9 신설(최종 티어, 신규 마일스톤 5개) | wiki.gg 1차 조회 + PCGamesN 기사 + 저장소 데이터(`milestones.json`에 tier9 5건 존재, 물질 변환/양자 인코딩/청사진Mk.3/공간 에너지 조절/극한의 효율) | verified |
| Phase 4 요구량 대폭 하향 | wiki.gg 1차 조회로 changelog 문구 직접 확인: "the cost for unlocking Phase 4 has been reduced" | verified |
| Phase 5 신설(EA에는 없었음) | wiki.gg 1차 조회로 changelog 문구 직접 확인 | verified |
| 티어7에 "제어 시스템 개발(Control System Development)" 신설 | 저장소 데이터로 존재 확인(`Schematic_7-5_C`, tier7 order5) — **단, "1.0에서 신설됐다"는 서술 자체는 2차 검색 스니펫 1건뿐, EA 데이터가 없어 신설 여부 자체는 대조 불가** | 마일스톤 존재는 verified, "신설" 주장은 unsourced(교차검증 안 됨) |
| 컴퓨터(Computer) 표준 레시피에서 나사 제거 | 저장소 데이터로 현재 레시피 확인: `Recipe_Computer_C` = 회로 기판4+케이블8+플라스틱16, **나사 없음**. "EA에는 나사가 있었다"는 주장은 2차 출처(검색 스니펫)뿐이고 EA 레시피 데이터가 없어 직접 대조 불가 | 현재 상태는 verified, "변경됐다"는 서술은 consensus 수준(다수 후기 기사가 동일하게 언급) |
| **마일스톤의 소속 티어 재배치**(신규 발견) | 저장소 데이터 자체 분석: `Schematic_ID`의 티어 접두 숫자(EA식 넘버링 추정)와 현재 `tier` 필드가 8건 불일치 — `3-2`→tier2, `4-2`→tier3, `5-3`→tier4, `6-1`·`6-2`→tier5, `5-2`→tier6, `8-3`→tier7, `7-4`→tier8. 패치노트의 "티어3~8 비용 조정" 서술이 재배치까지 포함했을 가능성 | **이 저장소 데이터로 직접 도출한 발견 — 외부 출처로 별도 확증되지 않음. 참고용으로만 취급할 것** |
| 하드 드라이브 선택지 "2개+리롤" | Ultimate Beginner Guide(1.0 출시 이후 작성 명시): "made it worse with the 1.0 release by giving only two options and a re-roll" | `progression.md`가 이미 미해결로 분류한 쟁점에 **2개+리롤 쪽 손을 드는 3번째 출처** 추가. 그래도 "3개 중 1개"라는 반대 서술이 여전히 존재하므로 완전히 해소되지는 않음 — G절 참고 |

---

## 근거가 된 출처 목록

**1차(공식 위키·공식 API)**
- https://satisfactory.wiki.gg/wiki/Space_Elevator — Phase 1~5 요구량, 1.0 changelog 문구 직접 확인
- https://satisfactory.wiki.gg/wiki/Milestones — 티어 게이트 구조(10개 티어, HUB→T1·T2, Phase1~4→나머지)
- https://www.speedrun.com/api/v1/games/46w3wol1/categories — 카테고리 정의(1차, 직접 조회)
- https://www.speedrun.com/api/v1/leaderboards/46w3wol1/category/{id} — 순위·기록(1차, 직접 조회)
- https://www.speedrun.com/api/v1/runs/{id} — 개별 런의 버전/변형 값(1차, 직접 조회)
- `C:\Dev\satisfactory-ops\src\data\app\milestones.json`, `hub.json`, `recipes.json`, `items.json` — 저장소 1단 정규화 게임 데이터(정본)

**2차(커뮤니티, 이번 조사에서 신규 사용)**
- https://gamefoundry.games/blog/satisfactory-beginner-guide-first-12-hours (2026년 작성 추정, 명확한 날짜 미기재)
- https://www.pcgamer.com/games/sim/satisfactory-game-tips-getting-started-guide/
- https://gamerant.com/satisfactory-beginner-mistakes-to-avoid-tips-tricks/
- https://steamcommunity.com/sharedfiles/filedetails/?id=3379008083 ("Ultimate Beginner Satisfactory Guide" — 1.0 출시 이후 작성 명시, 티어3까지 다룸)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2686103223 ("90 minutes to Coal -- onboarding 2.0", 저자 Maehlice — REDUX 버전은 "1.0 출시 한 달 전" 갱신 명시)
- https://satisfactory-calculator.com/en/blueprints/index/details/id/4028/ (Phase2 요구량 500/500/100 — **wiki.gg와 불일치, EA 시절 값으로 추정, 미채택**)

**이미 `progression.md`가 검증한 것을 재인용한 부분**(중복 조사 안 함, 출처는 해당 문서 참고)
- 나사·콘크리트·전력 병목 정량 계산(C·D·E절)
- 마일스톤 비용 전표(G절)
- 초보 리스타트 원인 Top5, 티어5~6 이탈 서술(한국 커뮤니티 arca.live 포함)

---

## 게임 데이터와 대조한 결과

| 조사한 조언 | 게임 데이터 대조 결과 |
|---|---|
| "나사는 철봉 10/분 → 나사 4/분" (Ultimate Beginner Guide) | **불일치.** `recipes.json`상 표준 레시피(철봉1→나사4, 6초 주기)로 역산하면 철봉10/분 입력 시 나사 **40/분**이 맞다. 해당 가이드의 오기로 판단, 40/분(위키 검증치)을 정본으로 유지 |
| "석탄 발전기는 벨트 한 줄에 4대까지" | **일치.** 발전기 소비 15/분 × 4 = 60/분 = 벨트 Mk.1 처리량과 정확히 같음(`progression.md` 검증치와 재일치) |
| "우주 엘리베이터 Phase2 = 스마트 플레이팅·다용도 골조 각 1,000, 자동 배선기 100" | **일치.** wiki.gg 1차 재확인 + 저장소 `items.json`의 파트 12종 존재 확인. calculator.com의 "500/500/100"은 **불일치 — 오래된 값으로 판단** |
| "컴퓨터 표준 레시피에 나사가 없다"(현재 상태) | **일치.** `recipes.json`의 `Recipe_Computer_C` 확인, 나사 미포함 |
| "제어 시스템 개발이 티어7에 있다" | **일치.** `Schematic_7-5_C`가 tier7 order5로 존재 |
| 마일스톤 ID 접두 숫자와 실제 소속 티어 | **8건 불일치 발견**(F절 표). 1.0 패치의 "비용 조정" 서술이 재배치까지 포함했을 가능성 — 저장소 데이터 자체로 도출한 결과이며 외부 문서로 별도 확증되지 않음 |
| "석탄 동력은 Phase2에서 열린다"(GameRant 기사 중 일부 서술) | **불일치.** 위키·저장소 데이터 모두 Phase1 이후(티어3)로 확인. `progression.md`가 이미 지적한 오류(GameRant 자체 기사 내 다른 문단은 맞게 서술) |

---

## 이견과 갈리는 것

| 쟁점 | 출처별 주장 | 판단 |
|---|---|---|
| **FICSIT 청사진 Mk.1(티어4)을 완전히 건너뛰어야 하는가** | Ultimate Beginner Guide(단일): "complete and utter trash... just completely skipping this" | **단일 출처.** 다른 어떤 가이드도 이 정도로 강하게 부정하지 않음. `milestone-advice.json`에도 반영 안 돼 있음. 앱에 "건너뛰기 권장"으로 못 박지 말고, "4×4×4 규격이 티어6 Mk.2(5×5×5)와 비호환"이라는 **사실 관계**만 검증해서 쓰는 게 안전 |
| **하드 드라이브 선택지 개수** | wiki.gg + Ultimate Beginner Guide(1.0 이후 작성, 2건): "2개+리롤" / 일부 커뮤니티 가이드·영상(다수, 미상): "3개 중 1개" | `progression.md`가 이미 "미해결"로 분류. 이번 조사로 2개+리롤 쪽에 출처 1건 추가됐으나 **완전히 해소되지 않음** — 인게임 재확인 전까지 앱 데이터에 확정값으로 넣지 말 것 |
| **차량 운송(트럭)의 우선순위** | gamefoundry: "nice later, not urgent" / Ultimate Beginner Guide: "throw yourself at this piss-poor implementation... be my guest, but without my help" (부정적) / Ultimate Beginner Guide 동시에: "tractor is actually not bad" (트랙터는 긍정) | 트럭에는 부정적 의견이 우세(2건)하지만 트랙터는 예외로 취급하는 세부 차이가 있음. "차량 전체를 후순위로"가 아니라 "트럭은 후순위, 트랙터는 탐사용으로 예외"가 더 정확한 요약 |
| **효율적 진행의 현실적 목표 시간** | "90분 컷" 가이드: 티어3(석탄)까지 90분 / Ultimate Beginner Guide: 명확한 시간 목표 제시 안 함, 대신 "150~200시간이 첫 플레이 기준"이라 언급 | 상충이라기보다 **관점 차이** — 전자는 "효율 루트를 따라간 결과", 후자는 "처음 배우면서 즐기는 플레이 전체 소요 시간". 앱에서 목표 수치를 노출할 때 이 둘을 구분해서 라벨링해야 함 |

---

## 하지 말라는 것 (흔한 시간 낭비)

다수 출처 일치(3건 이상)만 "확정"으로 표시, 나머지는 출처 수 명시.

1. **첫 기지를 너무 일찍 영구화하기** (4건 일치: GameRant, gamefoundry, `progression.md`/arca.live, Steam 'restart syndrome' 토론) — 철 노드 옆에 지은 첫 기지는 석탄·석유·알루미늄이 다 멀어져서 못 씀. 석탄 동력 해금 후에 "제대로 된" 기지를 잡으라는 게 공통 결론.
2. **손 제작을 오래 끌기** (3건 일치: gamefoundry, PC Gamer, Ultimate Beginner Guide) — "5분 넘게 작업대 앞에 서 있다면 이미 늦은 것"(gamefoundry), "새 부품이 뜨면 무조건 자동화부터"(Ultimate Beginner Guide).
3. **500m 넘는 구간을 벨트로 스파게티화하기** (`progression.md` 재인용, 2건: Steam 가이드 + 저장소 재검증 안 함) — 장거리는 열차(티어6)로 대체 권장.
4. **전력 여유 없이 운영하다가 그리드 트립 반복** (`progression.md` 재인용, 위키 1차 검증) — 소비가 생산에 근접한 채로 두면 전체 정지·수동 리셋 지옥. 이번 조사에서 "바이오매스 버너를 재시동용으로 남겨두라"는 실전 팁 추가 확인(단일 출처).
5. **완벽주의형 재시작** (`progression.md` 재인용, Steam 전용 토론 스레드 존재할 만큼 흔함).
6. **(단일 출처, 참고용) FICSIT 청사진 Mk.1 제작** — 위 "이견" 절 참고, 확정된 권고 아님.
7. **(단일 출처, 참고용) 트럭 인프라를 초반에 우선 투자** — 벨트로 충분하다는 의견이 우세하지만 완전한 컨센서스는 아님.

---

## 확인 못 함

- speedrun.com Any%/Package% 런의 **프레임 단위 빌드오더**(VOD를 직접 시청해야 확인 가능 — 텍스트 조사로는 접근 불가. speedrun.com 웹사이트 자체가 자동화 접근을 차단해 포럼 게시글 원문도 대부분 읽지 못함).
- 3Package%·4Package% 카테고리의 **1.2 기준 NMG 최신 기록** — 현재 최고 NMG 기록이 각각 2024-06-01·2024-01-02(1.0 출시 이전)에 머물러 있어, Phase4 하향 이후의 "진짜 최적 시간"은 갱신된 런이 없다.
- "제어 시스템 개발(티어7)"이 **1.0에서 신설**됐다는 서술의 1차 확증 — 검색 스니펫 1건뿐이고 EA 시절 마일스톤 목록 원본을 확보하지 못해 대조 불가.
- 컴퓨터 레시피에서 "나사가 빠졌다"는 **변경 이력**의 1차 확증 — 현재 레시피에 나사가 없다는 것은 저장소 데이터로 검증했으나, EA 레시피 데이터가 없어 "빠졌다(변경)"는 서술 자체는 2차 출처 의존.
- 마일스톤 소속 티어 재배치(8건)가 **의도된 밸런싱**인지 **단순 표시상의 우연**인지 — 저장소 데이터 분석으로 불일치 패턴만 확인했고, 왜/언제 바뀌었는지에 대한 1차 문서(패치노트 원문의 티어별 상세 목록)는 확보하지 못함.
- 바이오매스 전력을 "정확히 티어3 진입 시점까지만" 쓰라는 조언이 **EA 시절과 다른지** — 구조가 EA부터 동일했다는 정황은 있으나 명시적으로 비교한 출처를 찾지 못함.

## 추가 확인 — 허브 이동 가능 여부 (2026-08-20)

| 주장 | 판정 | 근거 |
|---|---|---|
| "허브는 한 번 놓으면 옮길 수 없다" | **거짓** | 공식 위키 The HUB 문서: "Dismantling the HUB returns the Iron Ore required to build it, retaining all upgrades and Milestone progress, including inserted parts... it can be freely relocated, just like all other player-built structures." (문서 최종 갱신 2026-08-12, [satisfactory.wiki.gg/wiki/The_HUB](https://satisfactory.wiki.gg/wiki/The_HUB)) |

허브 위치 조언은 "못 옮기니 신중하라"가 아니라 **"채굴기 해금 전까지 손 운반 거리를 줄여라"**가 되어야 한다.
개인 저장 상자에 든 물건은 철거 시 인벤토리로 옮겨진다.

## 추가 확인 — 초반 공장의 기준 수치가 왜 "5/분"인가 (2026-08-20)

게임 데이터로 전개한 소요량(클럭 100%, 표준 레시피):

| 목표 | 철 광석 | 철 주괴 | 철판 | 철봉 | 나사 |
|---|---|---|---|---|---|
| 보강된 철판 5/분 | **60/분** | 60/분 | 30/분 | 15/분 | 60/분 |
| 지능형 도금판 5/분 | **116.25/분** | 116.25/분 | 30/분 | 71.25/분 | 185/분 |

**보강된 철판 5/분이 철광석 정확히 60/분이다.** 채굴기 Mk.1 한 대가 벨트 Mk.1 로 낼 수 있는
최대치와 정확히 같다. 커뮤니티 초반 공장이 하나같이 "보강된 철판 5/분"을 기준으로 잡는 이유가
이것이다 — 노드 하나·벨트 한 줄이 딱 떨어진다.

**지능형 도금판 5/분은 그 두 배에 가깝다(116.25/분).** 회전자 5/분이 나사를 125/분 먹기 때문이다
(회전자 레시피는 4/분당 나사 100/분). 노드 하나로는 안 되고, 순수 노드 + 벨트 Mk.2(120/분)
한 줄이거나 노드 두 개가 필요하다.

### 앞선 판본의 오류
가이드 티어 2 절이 "조립기 2대, 철광석 22.5/분"이라고 적었다. 조립기 **입력**만 세고 그 입력을
만드는 상류(나사 185/분 → 철봉 71.25/분)를 세지 않은 값이다. 5배 넘게 적게 잡았다.

### 45:15 는 밸런서로 못 나눈다
철괴 60/분을 철판용 45 와 철봉용 15 로 나눠야 하는데 정수비가 아니다. 표준 해법은 매니폴드다 —
제련기 두 대의 출력을 병합기로 한 줄에 합치고, 제작기들을 그 한 줄에 차례로 물려 각자 뽑아 쓰게 한다.
