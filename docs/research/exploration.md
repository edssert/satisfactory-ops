# 탐험·수집 계획 (Exploration & Collection)

기준 버전: **Update 1.2** (스테이블 2026-06-02). 수치 대부분은 1.0에서 확정되었고 1.1/1.2에서 총량 변경은 확인되지 않음.

## 요약

- 수집물 총량은 **하드 드라이브(Hard Drive) 118, 파워 슬러그(Power Slug) 1,242(청 596/황 389/자 257), 소머슬룹(Somersloop) 106, 머서 스피어(Mercer Sphere) 298, SAM 노드 19개**로 고정된 유한 자원이다. SAM만 무한 노드다.
- 하드 드라이브는 **개당 10분·동시 1개만 스캔**되므로 118개 전량 소화에 **최소 1,180분(약 19.7시간)**의 실시간이 필요하다. 즉 수집보다 **스캔 파이프라인이 병목**이며, 게임 초반부터 MAM을 놀리지 않는 것이 핵심 설계 포인트다.
- 하드 드라이브 라이브러리(1.0 도입)는 **보상이 라이브러리 내에서 중복되지 않는다**. 미청구 드라이브를 쌓아두면 원치 않는 레시피를 "묶어두는" 필터로 쓸 수 있다 — 앱이 관리해줄 가치가 가장 큰 메커니즘.
- 이동 수단 해금 시점(차량 T3 → 하이퍼튜브 T4 → 제트팩 T5 → 호버팩 T7)과 스캔 해금 시점(오브젝트 스캐너 T1, 무선 신호 탐색 = MAM 석영 트리, 크리스탈 오실레이터 필요 = 실질 T5+)이 어긋난다. **T1~T2에서는 스캐너 없이 접근 쉬운 크래시 사이트만, 본격 회수는 제트팩(T5) + 무선 신호 탐색 이후**가 정석.
- 소머슬룹·머서 스피어는 **연구 소모분을 제외한 잔량 배분이 영구 결정**이다(어썸 싱크 불가, 되돌릴 수 없음). 소머슬룹 106 중 연구 2~3개 소모 → 잔여 103~104개를 에일리언 파워 증강기(10개/기, 최대 10기)와 생산 증폭 사이에 나눠야 한다.

## 핵심 사실

### 하드 드라이브 / 크래시 사이트

| 항목 | 값 | 출처 |
|---|---|---|
| 크래시 사이트 총 개수 | 118개 (= 하드 드라이브 118개) | wiki.gg Crash Site |
| MAM 스캔 시간 | 개당 **10분** | wiki.gg Hard Drive |
| 동시 스캔 | **1개**. MAM을 여러 대 지어도 늘지 않음 | wiki.gg Hard Drive |
| 스캔당 제시 옵션 | **2개** (1.0 기준) | wiki.gg Hard Drive |
| 리롤 | 드라이브당 **1회**. 결과적으로 1개 드라이브에서 최대 **4개 후보**를 볼 수 있음 | wiki.gg Hard Drive |
| 중복 방지 | 라이브러리에 이미 떠 있는 보상은 다시 뽑히지 않음 → 미청구 보관 = 풀 필터링 | wiki.gg Hard Drive |
| 대체 레시피 총 개수 | **106개**, 전부 하드 드라이브 스캔 보상 | wiki.gg Alternate recipe |
| MAM에 직접 소모되는 HDD | **4개** (압축 석탄/터보 연료/로켓 연료/이온화 연료, 유황 트리) | wiki.gg Alternate recipe |
| 인벤토리 확장 | Inflated Pocket Dimension 각 +6칸. 시작 18칸 → 최대 **78칸** (1.0 이전 81칸) | wiki.gg Inventory |
| 추가 입수 | 어썸 상점 **쿠폰 100개**/개 (T8 Particle Enrichment 이후), FICSMAS 1개 | wiki.gg Hard Drive |
| 사이트 개방 전력 | 대부분 100 MW 미만, **100 MW 초과는 7곳**, 최대 **400 MW** | wiki.gg Crash Site |
| 부품 불요 사이트 | 다수 존재(요구사항 0) — 초반 즉시 회수 가능 | wiki.gg Crash Site |
| 해체 | **1.1부터** 하드 드라이브 회수 후 크래시 사이트 전체 해체 가능(자원 회수) | wiki.gg Patch 1.1.0.0 / Crash Site |

**118개 사이트 개방에 필요한 총 부품** (앱의 "원정 준비 체크리스트" 원본 데이터):

| 부품 | 수량 | 부품 | 수량 |
|---|---|---|---|
| 강철 빔(Steel Beam) | 150 | 무거운 모듈식 프레임(Heavy Modular Frame) | 26 |
| 전자기 제어봉(Electromagnetic Control Rod) | 84 | 나사(Screw) | 25 |
| 실리카(Silica) | 70 | 크리스탈 오실레이터(Crystal Oscillator) | 20 |
| 고무(Rubber) | 70 | 컴퓨터(Computer) | 16 |
| 냉각 시스템(Cooling System) | 65 | 회로 기판(Circuit Board) | 15 |
| 퀵와이어(Quickwire) | 63 | 알루미늄 케이싱(Aluminum Casing) | 15 |
| 플라스틱(Plastic) | 60 | 융합 모듈식 프레임(Fused Modular Frame) | 12 |
| 알클래드 알루미늄 시트(Alclad Aluminum Sheet) | 57 | 고정자(Stator) | 10 |
| 방열판(Heat Sink) | 54 | 고형 바이오 연료(Solid Biofuel) | 10 |
| 터보 모터(Turbo Motor) | 41 | 철 막대(Iron Rod) | 5 |
| 구리 시트(Copper Sheet) | 40 | 강화 철판(Reinforced Iron Plate) | 5 |
| 모듈식 프레임(Modular Frame) | 37 | 흑색 화약(Black Powder) | 2 |
| 고속 커넥터(High-Speed Connector) | 35 | 중첩 오실레이터(Superposition Oscillator) | 1 |
| 석영 결정(Quartz Crystal) | 32 | 강화 산업용 빔(Encased Industrial Beam) | 30 |
| 모터(Motor) | 30 | 로터(Rotor) | 27 |

### 파워 슬러그

| 항목 | 값 | 출처 |
|---|---|---|
| 청/황/자 개수 | **596 / 389 / 257 = 1,242** (1.0 기준) | wiki.gg Power Slug, gamecore.wiki |
| 변환 | 청 1→1 샤드(8초), 황 1→2 샤드(12초), 자 1→5 샤드(24초). 컨스트럭터 또는 수동 제작 | wiki.gg Power Shard |
| MAM 소모 | 연구에 **4개 소모**(청 2, 황 1, 자 1) | gamecore.wiki 잔량표 역산 |
| 비재생 샤드 최대치 | **2,650개** | wiki.gg Power Slug |
| 소머슬룹 증폭 시 | 컨스트럭터 1슬롯 증폭 → 산출 2배 → **5,300개** | wiki.gg Power Shard |
| 오버클럭 한도 | 건물당 샤드 **최대 3개**, 개당 +50% → **최대 250%** | wiki.gg Power Shard |
| 재생 가능화 | **T9 합성 파워 샤드(Synthetic Power Shard)** — 퀀텀 인코더로 무한 생산 | wiki.gg Power Shard |
| 슬러그 스캐닝 해금 | MAM 파워 슬러그 트리 (철 막대 50, 와이어 100, 나사 200) | wiki.gg MAM |
| 재생성 | 슬러그는 리스폰하지 않음. 리자드 도고 사육으로 소량만 재생 | wiki.gg Power Slug |
| 위치 경향 | 청=평지·낮은 바위/나무(사다리 불요) / 황=가스 기둥 주변·절벽면 / 자=동굴 벽 상부·산정상·협곡 | bisecthosting |

### 소머슬룹

| 항목 | 값 | 출처 |
|---|---|---|
| 총 개수 | **106개** (Patch 1.0) | wiki.gg Somersloop, gamecore.wiki |
| 연구 소모 | 소머슬룹 분석 1 + 파워 증강기 1 + 생산 증폭기 1 = **3개** (일부 출처 2개, 이견 참조) | wiki.gg MAM |
| 에일리언 파워 증강기 건설비 | 소머슬룹 **10**, SAM 플럭추에이터 50, 케이블 100, 강화 산업용 빔 50, 모터 25, 컴퓨터 10 | wiki.gg Alien Power Augmenter |
| 증강기 효과 | 자체 발전 500 MW + 그리드 **+10%**(무연료) / **+30%**(에일리언 파워 매트릭스 5/분 공급 시) | wiki.gg Alien Power Augmenter |
| 증강기 최대 건설 | 잔여 소머슬룹 기준 **최대 10기** | wiki.gg Alien Power Augmenter |
| 생산 증폭 슬롯 | 제련소·컨스트럭터 1슬롯(슬롯당 +100%) / 조립기·주조소·정제소·컨버터 2슬롯(+50%) / 제조기·블렌더·입자 가속기·퀀텀 인코더 4슬롯(+25%) | wiki.gg Production amplifier |
| 증폭 전력 배수 | `(1 + 채운슬롯 / 전체슬롯)^2` → 만충 시 **4배**. 오버클럭과 곱연산 | wiki.gg Production amplifier |
| 증폭 불가 | 채굴기, 물/석유 추출기, 자원정 가압기, 패키저 | wiki.gg Production amplifier |
| 폐기 | 어썸 싱크 불가 (넣으면 입력이 막힘) | wiki.gg Somersloop |

### 머서 스피어

| 항목 | 값 | 출처 |
|---|---|---|
| 총 개수 | **298개** (Patch 1.0) | wiki.gg Mercer Sphere |
| 연구 전량 소모 | **98개** → 잔여 **200개** | wiki.gg Mercer Sphere |
| 98개 내역 | 분석 1 + 차원 창고 1 + SPWN 1(1.2 신규) + 수동 업로더 3 + 창고 확장 3/7/13/23(=46) + 업로드 속도 3/7/13/23(=46) | wiki.gg MAM / Dimensional Depot |
| 차원 창고 업로더 제작비 | 머서 스피어 **1**, SAM 플럭추에이터 10, 모듈식 프레임 10, 와이어 100 | wiki.gg Mercer Sphere |
| 창고 용량 | 기본 1스택 → 200 / 300 / 400 / 500% (최대 **5스택**) | wiki.gg Dimensional Depot |
| 업로드 속도 | 기본 15/분 → 30 → 60 → 120 → **240/분** | wiki.gg Dimensional Depot |
| 폐기 | 어썸 싱크 불가 | wiki.gg Mercer Sphere |

### SAM

| 항목 | 값 | 출처 |
|---|---|---|
| 노드 수 | **19개** (불순 10 / 보통 6 / 순수 3) — 무한 노드 | wiki.gg SAM |
| Mk.3 채굴 총량 | 전 노드 합계 **4,080개/분** (불순군 1,200 + 보통군 1,440 + 순수군 1,440) | wiki.gg SAM |
| 가공 | SAM 4 → 재생 SAM(Reanimated SAM) 1 (컨스트럭터) | wiki.gg SAM |
| 해금 체인 | SAM 분석(SAM 10) → SAM 재생(SAM 20) → SAM 플럭추에이터(재생 SAM 10, 강철 파이프 100, 와이어 200) | wiki.gg MAM, satisfactory.guru |
| 자동 채굴 | **T9 Matter Conversion** 필요 (그 전엔 휴대용 채굴기/수동) | wiki.gg SAM |
| 어썸 싱크 | 20 포인트 | wiki.gg SAM |

### 스캔·탐지 해금

| 대상 | 필요 연구 | 트리/티어 | 출처 |
|---|---|---|---|
| 오브젝트 스캐너 본체 | Field Research | **T1** | wiki.gg Object Scanner |
| 파워 슬러그 (청/황/자) | Slug Scanning | MAM 파워 슬러그 | wiki.gg Object Scanner |
| 크래시 사이트 | **Radio Signal Scanning** | MAM 석영 (크리스탈 오실레이터 100 등) | wiki.gg Object Scanner / MAM |
| 머서 스피어 | Mercer Sphere Analysis | MAM 에일리언 기술 | wiki.gg Object Scanner |
| 소머슬룹 | Somersloop Analysis | MAM 에일리언 기술 | wiki.gg Object Scanner |
| 적대 생물 | Hostile Organism Detection | MAM 에일리언 유기체 | wiki.gg Object Scanner |
| 베이컨 아가릭 / 베릴 너트 / 페일베리 | Nutrients 각 노드 | MAM 영양소 | wiki.gg Object Scanner |

**레이더 타워(Radar Tower)**: MAM 석영 트리 해금(크리스탈 오실레이터 50, 무거운 모듈식 프레임 50, 컴퓨터 50). 건설비 컴퓨터 10 / HMF 20 / 크리스탈 오실레이터 25 / 케이블 100, 소비 **30 MW**, 스캔 반경 **1 km 고정**. 반경 내 **자원 노드(순도 포함) + 동물 + 수집물 개수(슬러그·소머슬룹·머서 스피어·크래시 사이트)**를 표시한다. 전력이 끊겨도 안개 해제는 유지되고 오버레이 정보만 사라진다. (wiki.gg Radar Tower)

### 이동 수단 해금 시점

| 수단 | 해금 | 성능 / 비용 | 출처 |
|---|---|---|---|
| 휴대용 채굴기 | T0 HUB Upgrade 1 | — | wiki.gg Milestones |
| 오브젝트 스캐너 | T1 Field Research | — | wiki.gg Milestones |
| 블레이드 러너(Blade Runners) | **MAM 석영** (실리카 50, 모듈식 프레임 10) | 이동 9→**13.5 m/s**(+50%), 점프 2→4 m(슬라이드 8 m), 안전 낙하 13.5→20.5 m | wiki.gg Blade Runners |
| 집라인(Zipline) | **MAM 카테리움** (퀵와이어 100, 케이블 50) | 평지 13.5 m/s, 스프린트 최대 100 km/h, 전선에만 부착, 최대 전환각 60° | wiki.gg Zipline |
| 트랙터(Tractor) | **T3** Vehicular Transport | — | wiki.gg Milestones |
| 하이퍼튜브(Hypertube) | **T4** Hypertubes | 입구 스택 런처로 맵 횡단 1분 내 가능(커뮤니티 기법) | wiki.gg Milestones / Steam |
| 제트팩(Jetpack) | **T5** Jetpack (모터 5, 강철 파이프 10, 철판 25, 와이어 50) | 연료별 비행: 고형 바이오 12초/14 m → 포장 로켓 연료 27.5초/120 m → 포장 이온화 연료 **60초/160 m** | wiki.gg Jetpack |
| 트럭(Truck) | **T5** Logistics Mk.4 | — | wiki.gg Milestones |
| 익스플로러(Explorer) | **MAM 석영** | 12칸 + 제작대 내장, 거의 수직 지형 등반 | wiki.gg Explorer |
| 호버팩(Hover Pack) | **T7** Hoverpack (모터 8, HMF 4, 컴퓨터 8, 알클래드 알루미늄 시트 40) | 100 MW 무선 수전, 전원까지 **약 64 m** 이내, 23.4 / 스프린트 46.8 km/h | wiki.gg Hover Pack |

### Update 1.2 변경 (2026-06-02 스테이블)

- **게임 모드 메뉴 신설**: 비용/전력 소비 배율, **자원 노드 랜덤화**(Default / Random / Basic Resource Rich / Advanced Resource Rich / Fossil Fuel Rich), 순도 설정(All Pure ~ All Impure), 공유 가능한 **월드 시드**. 멀티플레이에도 적용.
- **SPWN** 신규 건물(MAM 에일리언 기술) — **머서 스피어 1개** 소모. 머서 스피어 연구 총 소모량이 97 → 98로 늘어난 것으로 보인다.
- 유체 트럭 / 유체 스테이션(T5), 차량 경로(Vehicle Path) 전면 재작성, 날씨 복귀, UE 5.6.1. PC/PS5/Xbox 동시 출시.
- **수집물(하드 드라이브·슬러그·소머슬룹·머서 스피어) 총량 및 배치 변경은 1.2 패치 노트에 없음.**
- 1.1 변경: 하드 드라이브 회수 후 크래시 사이트 **해체 가능**.

## 설계에 주는 시사점

1. **스캔 큐가 진짜 병목이다.** 118 × 10분 = 1,180분, 동시 1개. 앱은 "다음에 넣을 드라이브"와 예상 완료 시각을 알려주는 **MAM 큐 타이머**를 1급 기능으로 다뤄야 한다. 루트 최적화보다 이게 체감 가치가 크다.
2. **라이브러리 필터링 도구.** 보상 중복 방지 규칙 때문에 "쓸모없는 레시피를 미청구 상태로 묶어 풀에서 제거"하는 플레이가 성립한다. 앱은 (a) 청구한 레시피, (b) 라이브러리에 묶인 레시피, (c) 남은 풀 크기를 추적해 "지금 리롤하면 원하는 레시피가 나올 확률"을 계산할 수 있다. 풀이 106개로 유한하므로 계산 가능하다.
3. **하드 드라이브 예산 모델**: 118 − 대체 레시피 106 − MAM 유황 트리 직접 소모 4 = **8개 여유**. 인벤토리 확장분이 106 풀에 포함되는지 불명확하므로(이견 참조) 앱은 이 값을 상수가 아닌 설정 가능한 파라미터로 두는 편이 안전하다.
4. **원정 패킹 리스트 생성기.** 118개 사이트의 총 부품표가 존재하므로, "이번에 갈 사이트 N개"를 고르면 필요 부품 합계 + 필요 전력(바이오매스 버너 몇 대)을 산출하는 기능이 자연스럽다. 100 MW 초과가 7곳뿐이라는 사실이 "휴대용 발전으로 거의 다 커버된다"는 UI 카피의 근거가 된다.
5. **해금 시점 기반 게이팅.** 크래시 사이트는 요구 부품의 티어가 곧 접근 가능 시점이다. 앱은 사이트를 `열 수 있음 / 부품 부족 / 전력 부족`으로 3분류해야 한다. 스캔 대상도 MAM 노드 해금 여부로 게이팅된다.
6. **유한 자원 배분 계산기(소머슬룹·머서 스피어).** 둘 다 싱크 불가·비가역이다.
   - 머서 스피어 298 − 98(연구) = 200 → 업로더 1개당 1개이므로 **최대 200개 차원 창고 업로더**.
   - 소머슬룹 106 − 3(연구) = 103 → 증강기 1기당 10개. `증강기 N기(0~10) + 생산 증폭 (103 − 10N)슬롯` 트레이드오프 슬라이더가 앱 기능으로 적합하다.
7. **이동 수단 타임라인은 계단식이다.** T1 스캐너 → MAM 석영 블레이드 러너 → T3 트랙터 → T4 하이퍼튜브 → **T5 제트팩(최대 도약)** → T7 호버팩. 커뮤니티 정석은 "T1~T2 완료 후 T3 진입 전에 접근 쉬운 하드 드라이브 몰아 확보"이지만, 무선 신호 탐색이 크리스탈 오실레이터를 요구해 실질적으로 T5 이후에 열린다. 앱은 **좌표 기반 초반 루트(스캐너 없음)** 와 **스캐너 기반 T5+ 소탕 루트**를 분리한 2단계 계획을 제시해야 한다.
8. **1.2 월드 시드 대응.** 자원 노드가 랜덤화될 수 있으므로 노드 좌표를 하드코딩하면 깨진다. 수집물 좌표가 랜덤화 대상인지는 불명확 — "기본 시드 기준" 배지를 붙이고, **노드 데이터와 수집물 데이터를 분리 저장**하는 것이 안전하다.
9. **파워 샤드 정책.** T9 합성 파워 샤드로 재생 가능해지므로 슬러그는 **T9 이전에만 희소**하다. 앱의 슬러그 수집 우선순위는 T9 도달 시 자동으로 낮아져야 한다. 반대로 소머슬룹 증폭 컨스트럭터로 갈면 샤드가 2배(2,650 → 5,300)이므로, **슬러그를 샤드로 바꾸기 전에 증폭 컨스트럭터를 먼저 갖추라**는 경고가 가치 있다.
10. **레이더 타워를 진행도 소스로.** 1 km 반경 내 수집물 "개수"를 알려주므로, 앱의 지역별 수집 완료율 UI와 자연스럽게 대응한다. 타워 커버리지 계획(맵을 1 km 원으로 덮기) 자체가 하나의 기능이 될 수 있다.

## 이견과 미해결

| 쟁점 | 출처 A | 출처 B | 판단 |
|---|---|---|---|
| 슬러그 개수 | wiki.gg / gamecore.wiki: **596 / 389 / 257 = 1,242** | 나무위키: 583 / 387 / 247 | **A 채택.** 나무위키 수치는 1.0 이전(Update 8) 맵 기준으로 보이며, 두 독립 출처가 A로 일치한다. |
| 대체 레시피 총 개수 | wiki.gg: **106** | 나무위키: 109 | **A 채택.** wiki.gg가 1.0 기준으로 명시적이고 "106개 각각 하드 드라이브 1개 필요"라는 서술과 내부 정합성이 있다. 나무위키 109는 MAM 유황 트리분을 중복 계산한 것으로 추정. |
| 연구 소모 소머슬룹 | wiki.gg MAM 노드 목록: 분석 1 + 증강기 1 + 증폭기 1 = **3** | satisfactory.guru: **2** | **3 유력.** 노드별 비용 합산이 3. guru가 분석 노드를 누락한 것으로 보이나 확정하지 못함. |
| 연구 소모 머서 스피어 | wiki.gg: **98** | satisfactory.guru: 49 | **98 채택.** 확장/속도 두 갈래(각 3+7+13+23=46) + 1+1+3+1 = 98로 정확히 맞는다. guru의 49는 한쪽 갈래만 센 것. |
| 무선 신호 탐색 비용 | wiki.gg MAM: 크리스탈 오실레이터 100 | wiki.gg MAM 쇼핑 리스트: 크리스탈 오실레이터 100 + 모터 100 + 오브젝트 스캐너 1 | **미해결.** 둘 다 공식 위키 내부 출처. 앱에 넣기 전 인게임 확인 필요. |
| 증폭 후 최대 샤드 | wiki.gg: **5,300** | gamecore.wiki: 5,301 (연구 소모 반영 시 5,091) | 오차 범위. 5,300 표기 후 정확한 잔량은 계산으로 대체 권장. |
| HDD 보상에 인벤토리 확장 포함 여부 | wiki.gg Inventory: "하드 드라이브 해금 Inflated Pocket Dimension 2건" | wiki.gg Alternate recipe: "106개 전부 대체 레시피" | **미해결.** 106 풀 안인지 별도인지 불명. HDD 예산 계산에 직접 영향. |
| 크래시 사이트 최대 전력 | 본문 서술: **400 MW** | 개별 데이터 행 최대치: 256 MW (BP_DropPod5_13, 레드 정글) | **미해결.** 위키 본문과 데이터 테이블 불일치. |

### 미해결 항목 (앱 데이터 확정 전 검증 필요)

- 1.2 월드 시드 랜덤화가 **수집물 배치**에도 적용되는가? 패치 노트는 자원 노드만 언급.
- 118개 크래시 사이트 **개별** 요구 부품·전력 테이블(앱 핵심 데이터). 위키에 존재하나 이번 조사에서 전체 행을 추출하지 못함.
- MAM 각 노드의 실제 연구 소요 시간(위키 표 파싱이 일괄 3초로 나옴 — 플레이스홀더 의심).
- 익스플로러 최고 속도의 정확한 값/단위(파싱 결과 "107 m/h" — km/h 오기 추정).
- 하드 드라이브 리롤에 쿨다운이나 추가 비용이 있는가(일부 가이드가 "쿨다운 후 리롤"이라 서술, 공식 위키는 언급 없음).
- 공식/커뮤니티 표준 "수집 루트" 문서는 확인되지 않음. 실제로는 대화형 지도(satisfactory-calculator.com/en/interactive-map) 기반 개인 계획이 사실상 표준.
- 파워 슬러그 4개 MAM 소모(청 2/황 1/자 1)는 잔량표 역산 결과이므로 노드별 직접 확인 필요.

## 출처 목록

1. https://satisfactory.wiki.gg/wiki/Crash_Site
2. https://satisfactory.wiki.gg/wiki/Hard_Drive
3. https://satisfactory.wiki.gg/wiki/Power_Slug
4. https://satisfactory.wiki.gg/wiki/Power_Shard
5. https://satisfactory.wiki.gg/wiki/Somersloop
6. https://satisfactory.wiki.gg/wiki/Mercer_Sphere
7. https://satisfactory.wiki.gg/wiki/SAM
8. https://satisfactory.wiki.gg/wiki/MAM
9. https://satisfactory.wiki.gg/wiki/Object_Scanner
10. https://satisfactory.wiki.gg/wiki/Radar_Tower
11. https://satisfactory.wiki.gg/wiki/Alien_Power_Augmenter
12. https://satisfactory.wiki.gg/wiki/Production_amplifier
13. https://satisfactory.wiki.gg/wiki/Dimensional_Depot
14. https://satisfactory.wiki.gg/wiki/Alternate_recipe
15. https://satisfactory.wiki.gg/wiki/Inventory
16. https://satisfactory.wiki.gg/wiki/Milestones
17. https://satisfactory.wiki.gg/wiki/Jetpack
18. https://satisfactory.wiki.gg/wiki/Hover_Pack
19. https://satisfactory.wiki.gg/wiki/Blade_Runners
20. https://satisfactory.wiki.gg/wiki/Zipline
21. https://satisfactory.wiki.gg/wiki/Explorer
22. https://satisfactory.wiki.gg/wiki/Patch_1.2.0.0
23. https://satisfactory.wiki.gg/wiki/Patch_1.1.0.0
24. https://satisfactory.wiki.gg/wiki/Tutorial:MAM_shopping_list
25. https://satisfactory.wiki.gg/wiki/Talk:Hard_Drive
26. https://satisfactory.gamecore.wiki/en/fauna/power-slug/
27. https://satisfactory.gamecore.wiki/en/items/somersloop/
28. https://satisfactory.guru/articles/read/index/id/100/name/MAM+-+Alien+Technology
29. https://namu.wiki/w/Satisfactory/하드%20드라이브
30. https://www.bisecthosting.com/blog/satisfactory-power-slugs-guide-types-locations-usage-unlock-crafting-recipes
31. https://www.bisecthosting.com/blog/satisfactory-1-2-update-patch-notes-fluid-station-vehicle-pathing
32. https://coffeestain.com/news/satisfactory-1-2-update-out-now/
33. https://steamcommunity.com/games/526870/announcements/detail/520841474254835360
34. https://primagames.com/gaming/complete-satisfactory-hard-drives-guide-location-map-coordinates-tier-list-and-how-to-reroll
35. https://www.escapistmagazine.com/best-alternate-recipes-in-satisfactory-hard-drive-tier-list/
36. https://satisfactory-calculator.com/en/interactive-map
