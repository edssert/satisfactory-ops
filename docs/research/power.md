# 전력 설계 로드맵 (Power) — Satisfactory Update 1.2 기준

## 요약
- 전력 로드맵은 **바이오매스 버너(30MW) → 석탄 발전기(75MW) → 연료 발전기(250MW) → 원자력 발전소(2,500MW) → 외계 전력 증강기(Alien Power Augmenter, 500MW + 그리드 %보너스)** 5단계다. 지열 발전기(50~600MW)는 어느 단계에서든 끼워넣는 보조 전원이다.
- **발전기는 오버클럭이 완전 선형**(출력·연료 모두 ×클럭)이다. 생산 건물·채굴기만 지수 1.321928을 쓴다. 따라서 발전기 오버클럭은 손해가 없지만 이득도 없다 — 공간 절약용이다.
- 황금비 3종만 외우면 된다: **석탄 = 물추출기 3 : 석탄발전기 8 : 석탄 120/분**, **원자력 = 물추출기 2 : 원자로 1**, **연료 = 정유소 1(연료 40m³/분) : 연료발전기 2**.
- 그리드는 열화(brownout)가 없다. 소비 > 생산 + 파워 스토리지 잔량이면 **전 그리드가 즉시 정지**하고, 발전기나 전신주에서 수동으로 차단기 레버를 내려야 복구된다. 그래서 **우선순위 전력 스위치(1번 그룹 = 발전·연료 생산 라인)**와 **파워 스토리지**가 사실상 필수 안전장치다.
- Update 1.2의 전력 관련 변경은 밸런스가 아니라 배선이다: MAM 카테리움 연구 **Upgraded Power Connectors**로 건물당 전력 연결 2개 + 건물 간 데이지 체인이 가능해졌고, 게임 모드에서 전력 소비 배수(0.25~5)를 설정할 수 있다. 발전기 수치 자체는 1.0에서 바뀐 것이 확인되지 않는다.

---

## 핵심 사실

### 1. 발전기 사양 (100% 클럭 기준)

| 발전기 | 출력 | 연료 소모 | 물 소모 | 해금 | 비고 |
|---|---|---|---|---|---|
| 바이오매스 버너(Biomass Burner) | 30 MW | 아래 표 참조 | 없음 | Tier 0 · HUB Upgrade 6 | **유일하게 수요에 맞춰 소모량 감소**. 컨베이어 입력 O |
| 석탄 발전기(Coal-Powered Generator) | 75 MW | 석탄 15/분 · 압축 석탄 7.142857/분 · 석유 코크스 25/분 | **45 m³/분** | Tier 3 · Coal Power | 연료 종류 무관하게 물 45 |
| 연료 발전기(Fuel-Powered Generator) | 250 MW | 아래 표 참조 | **없음** | Tier 5 · Petroleum Power | 액체/포장 연료 모두 사용 가능 |
| 지열 발전기(Geothermal Generator) | 불순 50~150(평균 100) / 보통 100~300(평균 200) / 순수 200~600(평균 400) MW | 없음 | 없음 | MAM 카테리움 연구 (고속 커넥터 100, 퀵와이어 1000, 모터 50) | **오버클럭 불가**, 약 1분 주기로 평균의 0.5~1.5배 변동 |
| 원자력 발전소(Nuclear Power Plant) | 2,500 MW | 우라늄 연료봉 0.2/분 · 플루토늄 연료봉 0.1/분 · 픽소늄 연료봉 1/분 | **240 m³/분** | Tier 8 · Nuclear Power | 폐기물 배출(아래) |
| 외계 전력 증강기(Alien Power Augmenter) | 500 MW + 그리드 보너스 | 외계 전력 매트릭스 5/분 (선택) | 없음 | MAM 외계 기술 연구 (소머슬루프 1, SAM 변동기 100, 컴퓨터 50) | 무연료 +10% / 연료 공급 시 +30% |

출처: [Coal-Powered Generator](https://satisfactory.wiki.gg/wiki/Coal-Powered_Generator), [Fuel-Powered Generator](https://satisfactory.wiki.gg/wiki/Fuel-Powered_Generator), [Nuclear Power Plant](https://satisfactory.wiki.gg/wiki/Nuclear_Power_Plant), [Biomass Burner](https://satisfactory.wiki.gg/wiki/Biomass_Burner), [Geothermal Generator](https://satisfactory.wiki.gg/wiki/Geothermal_Generator), [Alien Power Augmenter](https://satisfactory.wiki.gg/wiki/Alien_Power_Augmenter)

### 2. 연료 에너지값과 소모율

**바이오매스 버너 (30MW)**

| 연료 | 에너지 | 연소 시간 | 소모율(계산) |
|---|---|---|---|
| 나뭇잎(Leaves) | 15 MJ | 0.50 s | 120/분 |
| 균사체(Mycelia) | 20 MJ | 0.67 s | 90/분 |
| 목재(Wood) | 100 MJ | 3.33 s | 18/분 |
| 바이오매스(Biomass) | 180 MJ | 6.00 s | 10/분 |
| 고체 바이오 연료(Solid Biofuel) | 450 MJ | 15.00 s | 4/분 |
| 포장 액체 바이오 연료 | 750 MJ | 25.00 s | 2.4/분 |

고체 바이오 연료 생산: 조립기(Constructor) 4초, 바이오매스 8 → 고체 바이오 연료 4 = **120 바이오매스/분 → 60 고체 바이오 연료/분 = 바이오매스 버너 15대분**(위키는 "1 Constructor = 4 burners"라고 적었으나 60 ÷ 4/분 = 15대가 산술적으로 맞다 — 아래 이견 참조).

**연료 발전기 (250MW)**

| 연료 | 에너지 | 연소 시간 | 소모율 |
|---|---|---|---|
| 연료(Fuel) / 액체 바이오 연료 | 750 MJ | 3 s | **20 m³/분** |
| 터보 연료(Turbofuel) | 2,000 MJ | 8 s | **7.5 m³/분** |
| 로켓 연료(Rocket Fuel) | 3,600 MJ | 14.4 s | **4.1667 m³/분** |
| 이온화 연료(Ionized Fuel) | 5,000 MJ | 20 s | **3 m³/분** |

**석탄 계열**: 석탄 300 MJ(4 s), 압축 석탄 630 MJ(8.4 s), 석유 코크스 180 MJ(2.4 s). 압축 석탄은 출력이 아니라 **연소 시간이 2배 이상**이라 벨트 부담이 줄어든다.

출처: [Biomass Burner](https://satisfactory.wiki.gg/wiki/Biomass_Burner), [Solid Biofuel](https://satisfactory.wiki.gg/wiki/Solid_Biofuel), [Fuel-Powered Generator](https://satisfactory.wiki.gg/wiki/Fuel-Powered_Generator), [Compacted Coal](https://satisfactory.wiki.gg/wiki/Compacted_Coal), [Turbofuel](https://satisfactory.wiki.gg/wiki/Turbofuel)

### 3. 석탄 발전 황금비

| 항목 | 수치 | 근거 |
|---|---|---|
| **황금비** | 물 추출기 3 : 석탄 발전기 8 : 석탄 120/분 | 공식 위키 + Steam 커뮤니티 공통 ("3:8:120") |
| 물 수지 | 추출기 3 × 120 = 360 m³/분 = 발전기 8 × 45 m³/분 (정확히 일치) | 계산 |
| 총 출력 | 8 × 75 = **600 MW** | 계산 |
| 자체 소비 | 물 추출기 3 × 20 MW = 60 MW, 채굴기 Mk.2(보통 노드, 120/분) 15 MW | [Water Extractor](https://satisfactory.wiki.gg/wiki/Water_Extractor), [Miner](https://satisfactory.wiki.gg/wiki/Miner) |
| **순 출력** | 약 **525 MW** (600 − 60 − 15) | 계산 |
| 배관 제약 | 파이프라인 Mk.1 = 300 m³/분 → 추출기 3대(360)를 한 파이프에 못 올린다. 분기하거나 Mk.2(600 m³/분) 사용 | [Pipeline](https://satisfactory.wiki.gg/wiki/Pipeline) |
| 압축 석탄 변형 | **석탄 발전기 7대가 압축 석탄 50/분 소비**(= 석탄 50 + 황 50/분) → 525 MW. 조립기(Assembler) 1대 25/분당 발전기 3.5대 | [Compacted Coal](https://satisfactory.wiki.gg/wiki/Compacted_Coal) |
| 석유 코크스 변형 | 발전기 1대당 25/분 | [Coal-Powered Generator](https://satisfactory.wiki.gg/wiki/Coal-Powered_Generator) |
| 노드 대응 | 채굴기 Mk.2 보통 노드 120/분 = 정확히 발전기 8대. Mk.3 순수 노드 480/분 = 발전기 32대(2,400 MW) | [Miner](https://satisfactory.wiki.gg/wiki/Miner) |

채굴기 정격(개/분, 불순/보통/순수): Mk.1 30/60/120 (5 MW), Mk.2 60/120/240 (15 MW), Mk.3 120/240/480 (45 MW).

### 4. 연료·터보연료 발전 비율

| 레시피 | 건물 | 입력(/분) | 출력(/분) | 지원 연료발전기 | 출력 MW |
|---|---|---|---|---|---|
| 연료(Fuel) | 정유소 | 원유 60 m³ | 연료 40 m³ + 폴리머 수지 30 | 2대 | 500 |
| 잔여 연료(Residual Fuel) | 정유소 | 중유 잔여물 60 m³ | 연료 40 m³ | 2대 | 500 |
| 희석 연료(Diluted Fuel, 대체) | 블렌더 | 중유 잔여물 50 m³ + 물 100 m³ | 연료 100 m³ | 5대 | 1,250 |
| 터보 연료(Turbofuel) | 정유소 | 연료 22.5 m³ + 압축 석탄 15 | 터보 연료 18.75 m³ | 2.5대 | 625 |
| 터보 중유 연료(Turbo Heavy Fuel, 대체) | 정유소 | 중유 잔여물 37.5 m³ + 압축 석탄 30 | 터보 연료 30 m³ | 4대 | 1,000 |
| 터보 혼합 연료(Turbo Blend Fuel, 대체) | 블렌더 | 연료 15 m³ + 중유 잔여물 30 m³ + 황 22.5 | 터보 연료 45 m³ | 6대 | 1,500 |

- 핵심 규칙: **터보 연료는 같은 250MW를 7.5 m³/분으로 낸다** — 일반 연료 대비 유체량 기준 2.67배 효율.
- 커뮤니티 실측: 희석 연료 + 터보 혼합 연료 조합으로 **원유 180/분 + 황 120/분 → 터보 연료 240 m³/분 → 연료 발전기 53.33대(약 13.3 GW)**. 같은 원유 180/분을 표준 경로로 쓰면 연료 480 m³/분 → 40대(10 GW).

출처: [Fuel](https://satisfactory.wiki.gg/wiki/Fuel), [Turbofuel](https://satisfactory.wiki.gg/wiki/Turbofuel), [Steam 토론](https://steamcommunity.com/app/526870/discussions/0/3279192886594614246/)

### 5. 원자력: 물·연료봉·폐기물

| 항목 | 수치 |
|---|---|
| 출력 | 2,500 MW / 기 |
| 물 | **240 m³/분 = 물 추출기 정확히 2대**(추출기 2 × 20 = 40 MW 소비) |
| 우라늄 연료봉 | 0.2/분 소비 → **우라늄 폐기물 10/분** 배출 (사이클 300초) |
| 플루토늄 연료봉 | 0.1/분 소비 → **플루토늄 폐기물 1/분** 배출 |
| 픽소늄 연료봉(Ficsonium Fuel Rod) | 1/분 소비 → **폐기물 0** |
| 우라늄 연료봉 생산 | 제조기(Manufacturer) 150초, 0.4/분 = 봉인된 우라늄 셀 20/분 + 봉인 산업용 빔 1.2/분 + 전자기 제어봉 2/분 → **원자로 2기 지원** |
| 대체: 우라늄 연료 유닛 | 제조기 300초, 0.6/분 (봉인된 우라늄 셀 20 + 전자기 제어봉 2 + 수정 진동자 0.6 + 로터 2) → **원자로 3기 지원** |
| 플루토늄 펠릿 | 입자 가속기 60초: 비핵분열성 우라늄 100/분 + **우라늄 폐기물 25/분** → 펠릿 30/분, 소비 250~750 MW |
| 픽소늄 연료봉 생산 | 양자 인코더 24초: 픽소늄 5/분 + 전자기 제어봉 5/분 + 픽사이트 트라이곤 100/분 + 여기 광자 물질 50 m³/분 → **2.5/분 = 원자로 2.5기 지원**, 소비 0~2,000 MW |
| **폐기물 처리 규칙** | **우라늄 폐기물은 AWESOME 싱크에 넣을 수 없고 입력이 막힌다(clog).** 컨테이너 보관하거나 플루토늄 라인으로 소각해야 함 |
| 대체 소각 경로 | 우라늄 폐기물 → 블렌더에서 비핵분열성 우라늄으로 재처리(37.5/분 소비) |

폐기물 수지(계산): 원자로 1기(우라늄 구동) = 폐기물 10/분 → 입자 가속기 1대(25/분 소비)가 **원자로 2.5기분**을 처리한다. 최종 무폐기물 루프는 우라늄 폐기물 → 플루토늄 연료봉 → 플루토늄 폐기물 → 픽소늄 → 픽소늄 연료봉이다.

출처: [Nuclear Power Plant](https://satisfactory.wiki.gg/wiki/Nuclear_Power_Plant), [Uranium Waste](https://satisfactory.wiki.gg/wiki/Uranium_Waste), [Uranium Fuel Rod](https://satisfactory.wiki.gg/wiki/Uranium_Fuel_Rod), [Ficsonium Fuel Rod](https://satisfactory.wiki.gg/wiki/Ficsonium_Fuel_Rod)

### 6. 그리드 정지(정전)와 블랙스타트

| 항목 | 내용 |
|---|---|
| 정전 조건 | 소비 > 생산이고 파워 스토리지 잔량이 0일 때 그리드 트립 |
| 정전 시 동작 | **연결된 모든 발전기·소비기가 정지.** 부분 감속(brownout) 없음 |
| 복구 | 연결된 **발전기 또는 전신주에서 [E] 상호작용 → UI의 레버를 내려** 차단기 리셋 |
| 함정 | 호버팩(Hoverpack)은 기본 100 MW를 소비하는데 **전력 그래프에 표시되지 않는다** |
| 발전기 거동 | 바이오매스 버너를 제외한 모든 발전기는 항상 최대 출력으로 동작(수요 추종 없음) |
| 블랙스타트 절차(커뮤니티 정석) | ① 발전 그리드를 공장 부하에서 분리 → ② 석유/석탄 채굴기, 물 추출기, 정유소, 연료봉 라인 등 **발전에 기여하는 것만 통전** → ③ 각 발전기 내부 연료 버퍼가 찰 때까지 대기 → ④ 부하를 단계적으로 재연결 |
| 신규 석탄 플랜트 기동 | **빈 석탄 플랜트를 메인 그리드에 바로 붙이지 말 것** — 채굴기·물 추출기가 먼저 전력을 먹으므로 여유가 없으면 메인 그리드까지 같이 죽는다 |

출처: [Power](https://satisfactory.wiki.gg/wiki/Power), [ScreenRant: How to Fix a Broken Power Grid](https://screenrant.com/satisfactory-fix-broken-power-grid/), [TheGamer Coal Power Guide](https://www.thegamer.com/satisfactory-coal-generator-power-guide/)

### 7. 우선순위 전력 스위치 (Priority Power Switch)

| 항목 | 내용 |
|---|---|
| 그룹 수 | **1~8 + "Undefined"** (총 9칸) |
| 차단 순서 | **Undefined가 가장 먼저 꺼지고, 이어서 그룹 8 → 7 → … → 1** 순으로 공급이 충족될 때까지 차단 |
| 권장 배치 | **그룹 1 = 발전소 + 연료 생산 체인** (위키 명시 권장) |
| 해금 | MAM 카테리움 연구 (고속 커넥터 25, 퀵와이어 500) |
| 건설 비용 | 고속 커넥터 2, 강철 빔 6, 퀵와이어 50 |
| 자체 소비 전력 | 위키에 기재 없음 |
| 재연결 | 위키에 자동 복귀 규칙 명시 없음 (미해결) |

권장 그룹 설계(설계 제안, 게임 규칙 아님):
- 1: 발전기, 물 추출기, 석유/석탄 채굴기, 정유소, 연료봉 라인
- 2: 기초 소재(제련·구성) 라인
- 3~5: 중간재/최종 조립 라인
- 6~8: 입자 가속기, 양자 인코더, 조명/장식, AWESOME 싱크 등 끊겨도 되는 것

출처: [Priority Power Switch](https://satisfactory.wiki.gg/wiki/Priority_Power_Switch)

### 8. 파워 스토리지와 변동 부하

| 항목 | 수치 |
|---|---|
| 용량 | **100 MWh** (100 MW × 1시간) |
| 최대 충전율 | **100 MW / 대** |
| 방전율 | **무제한** — 부족분을 정확히, 즉시 메움 |
| 완충 시간 | 여유 전력 100 MW 기준 실시간 1시간 |
| 표시 | 건물 표면 게이지 — 파랑=충전, 주황=방전, 회색=대기 |
| 해금 | Tier 4 · Expanded Power Infrastructure |
| 건설 비용 | 봉인 산업용 빔 5, 모듈형 프레임 10, 전선 100 |
| 크기 | 6 m × 6 m × 12 m |
| 전력 연결 | 파워 스토리지와 조명은 예외적으로 **연결 2개** 가능 |

**입자 가속기(Particle Accelerator) 등 변동 부하**

| 레시피 | 소비 | 사이클 |
|---|---|---|
| 플루토늄 펠릿 | 250~750 MW | 60 s |
| 핵 파스타(Nuclear Pasta) | 500~1,500 MW | 120 s |
| 암흑 물질 결정(Dark Matter Crystal) | 500~1,500 MW | 2 s |
| 픽소늄(Ficsonium) | 500~1,500 MW | 6 s |
| 다이아몬드 | 250~750 MW | 2 s |
| (참고) 양자 인코더 — 픽소늄 연료봉 | 0~2,000 MW | 24 s |

- 소비는 사이클 동안 **최소 → 최대로 비선형 상승**한다. 평균 = (최소 + 최대) / 2.
- 버퍼 규칙: **가속기 1대당 (평균 − 최소) ÷ 100 MW 만큼의 파워 스토리지**. 즉 250~750 MW 레시피는 **2.5대**, 500~1,500 MW 레시피는 **5대**. 스토리지가 대당 100 MW로만 충전되기 때문이다.

출처: [Power Storage](https://satisfactory.wiki.gg/wiki/Power_Storage), [Particle Accelerator](https://satisfactory.wiki.gg/wiki/Particle_Accelerator), [Power Line](https://satisfactory.wiki.gg/wiki/Power_Line)

### 9. 오버클럭 규칙

| 대상 | 규칙 |
|---|---|
| **발전기** | **완전 선형**: 출력 = 기본 × 클럭, 연료 소모 = 기본 × 클럭. 오버클럭해도 자원당 전력량은 동일 |
| 생산 건물 / 채굴기 / 추출기 | 전력 = 기본 × 클럭^**1.321928** (Patch 0.7.0.0에서 1.6 → 1.321928로 변경) |
| 클럭 상한 | 파워 셰이드(Power Shard) 1개당 +50%, 최대 3개 → **250%** |
| 참고 소비율 | 10%→4.76%, 50%→40%, 100%→100%, 150%→170.91%, 200%→250%, 250%→335.77% |
| 예시 | 물 추출기 250% = 300 m³/분, 67.2 MW (= 파이프라인 Mk.1 한 줄을 정확히 포화) |
| 소머슬루프(Somersloop) | **발전기에는 장착 불가**. 생산 건물 증폭 전용(최대 +100% 산출, 전력 최대 4배) |

출처: [Clock speed](https://satisfactory.wiki.gg/wiki/Clock_speed), [Power Shard](https://satisfactory.wiki.gg/wiki/Power_Shard), [Somersloop](https://satisfactory.wiki.gg/wiki/Somersloop)

### 10. 지열 발전기

- 맵 전체 간헐천(Geyser) **31개** — 불순 9 / 보통 13 / 순수 9.
- 총 이론 출력 **3,550~10,650 MW (평균 7,100 MW)**.
- 오버클럭 불가, 연료·물 불필요. 약 1분 주기로 평균의 0.5~1.5배 사이를 진동하며 위상은 건설 시 랜덤.
- 설계 함의: 지열은 **기저 부하가 아니라 보조 전원**. 그리드 여유가 지열 총량의 ±50%보다 크거나, 파워 스토리지로 흡수해야 한다.

출처: [Geothermal Generator](https://satisfactory.wiki.gg/wiki/Geothermal_Generator), [Geyser](https://satisfactory.wiki.gg/wiki/Geyser)

### 11. 외계 전력 증강기 (Alien Power Augmenter)

- 자체 **500 MW** 발전 + 그리드 기본 생산량에 대한 **배수 보너스**.
- 배수 = 1 + 0.1 × (무연료 APA 수) + 0.3 × (연료 공급 APA 수), **기본 생산량(base production)에 적용**.
- 연료: 외계 전력 매트릭스(Alien Power Matrix) **5/분**.
- 해금: MAM 외계 기술 연구 (소머슬루프 1, SAM 변동기 100, 컴퓨터 50). 각 APA가 소머슬루프를 소비하므로 **건설 가능 수량이 유한**하다.

출처: [Alien Power Augmenter](https://satisfactory.wiki.gg/wiki/Alien_Power_Augmenter)

### 12. Update 1.2에서 바뀐 것 (전력 관련)

| 변경 | 내용 |
|---|---|
| **Upgraded Power Connectors** (신규 MAM 카테리움 연구) | 건물당 전력 연결 **2개** 허용 + **건물 간 데이지 체인**으로 전력 전달. 해금 비용: 컴퓨터 15, 고속 커넥터 50, 퀵와이어 500 |
| **게임 모드(Game Modes)** | 전력 소비 배수 선택 가능: **0.25 / 0.50 / 0.75 / 1(기본) / 2 / 5**. 자원 노드·순도 랜덤화 및 월드 시드 포함 |
| 발전기 밸런스 | **변경 확인되지 않음** — 1.2.0.0 패치 노트에 발전기·스토리지·우선순위 스위치 수치 변경 항목 없음 |
| 버전 | 1.2.0.0 실험판 2026-03-17, 안정 최신 **1.2.4.0** (2026-08 기준) |

출처: [Patch 1.2.0.0](https://satisfactory.wiki.gg/wiki/Patch_1.2.0.0), [Patches](https://satisfactory.wiki.gg/wiki/Patches), [Power Line](https://satisfactory.wiki.gg/wiki/Power_Line), [BisectHosting 1.2 패치 노트 정리](https://www.bisecthosting.com/blog/satisfactory-1-2-update-patch-notes-game-modes-spwn-fluid-station-vehicle-pathing)

---

## 설계에 주는 시사점

1. **데이터 모델은 generator 엔티티 하나로 통일 가능**: `{id, mw, fuels:[{item, ratePerMin, energyMJ}], waterPerMin, unlockTier, overclockable, demandScaling}`. 바이오매스 버너만 `demandScaling: true`, 지열만 `overclockable: false` + `outputRange`.
2. **비율 계산기는 물 제약이 지배적**이다. 석탄(45 m³/발전기)과 원자력(240 m³/원자로)만 물을 먹고 연료 발전기는 물이 없다. 물 추출기 120 m³/분과 파이프라인 300/600 m³/분 두 상수를 같이 넣어야 실제 배치 가능한 답이 나온다.
3. **오버클럭 계산은 분기 필수**: 발전기는 선형, 그 외는 `clock^1.321928`. 한 함수로 뭉개면 물 추출기 250% = 67.2 MW 같은 값이 틀린다.
4. **정전 시뮬레이터**를 넣을 가치가 있다. 부분 감속이 없으므로 "생산 ≥ 소비"는 이진 조건이고, 스토리지 버팀 시간 = 잔량(MWh) ÷ 부족분(MW) × 60분으로 단순 계산된다.
5. **변동 부하 버퍼 공식**을 앱에 넣어라: 필요 스토리지 대수 = ceil( Σ(레시피 평균 − 최소 MW) ÷ 100 ). 가속기가 여러 대면 위상이 어긋나 평균화되므로 이 값은 보수적 상한이다.
6. **우선순위 그룹 UI는 9칸**(Undefined + 1~8)으로 만들고, Undefined가 가장 먼저 끊긴다는 점을 기본 경고로 표시하라.
7. **폐기물은 싱크 불가**라는 규칙이 원자력 설계의 하드 제약이다. 우라늄 폐기물 배출량(원자로당 10/분)과 처리 능력(가속기당 25/분) 균형을 경고로 띄워야 한다.
8. 1.2의 **전력 소비 배수(0.25~5)**는 소비 측을 전부 스케일하므로 계산기에 전역 배수 파라미터를 두는 편이 안전하다.

---

## 이견과 미해결

| 쟁점 | 내용 | 판단 |
|---|---|---|
| Update 1.2 배포일 | 공식 위키 Patch 1.2.0.0 = **2026-03-17**(실험판), BisectHosting 블로그 = **2026-06-02 라이브** | 실험판/안정판 차이로 보인다. 위키의 패치별 날짜가 1차 출처로 더 신뢰할 만하며 6/2는 안정판 전환일로 추정. 확정 필요 |
| Fandom 위키 vs wiki.gg | Fandom(satisfactory.fandom.com)은 Update 8 시절 수치가 섞여 있고 현재 접근 제한(HTTP 402)까지 걸린다 | **wiki.gg가 공식 이관처.** Fandom 수치는 채택하지 않았다 |
| 고체 바이오 연료 → 바이오매스 버너 대수 | 위키 문장은 "Constructor 60/분 = 버너 4대"라고 하지만, 버너의 고체 바이오 연료 소모는 4/분이므로 60 ÷ 4 = **15대**가 맞다 | 위키 서술이 계산 실수로 보인다. **15대 채택**, 앱에는 소모율(4/분)만 저장하고 대수는 파생값으로 계산할 것 |
| 터보 연료 최적 레시피 | Steam 토론에서 "정유소 터보 연료가 희석 연료 대비 +122.2%지만 황 2.6배·석탄 동량", "블렌더 터보 혼합은 +33.3%" 등 비교 결론이 엇갈림 | 비교 기준(원유당 / 유체량당 / 자원 총량당)이 달라서 생긴 차이. 앱은 **자원 종류별로 별도 지표**를 내는 게 맞다 |
| 우선순위 스위치 재연결 | 전력 회복 시 자동 복귀인지 수동인지 위키에 명시 없음 | 미해결 |
| 가속기당 파워 스토리지 2.5대 | 위키의 팁 수준 서술이고 유도 과정이 명시되지 않음 | 산술(250 MW 잉여 ÷ 100 MW 충전율)은 일관됨. 상한값으로 사용 권장 |
| 물 추출기 실효 산출 | 얕은 물/부분 침수 시 120 m³/분 미만이라는 커뮤니티 주장이 있으나 공식 수치 확인 못 함 | 미검증 — 앱에는 120 고정으로 넣고 주석 처리 |

**openQuestions (수치 미확보)**
- 픽소늄(Ficsonium) 자체 레시피의 정확한 입출력/분 (입자 가속기, 6초, 500~1,500 MW라는 것만 확인)
- 봉인된 우라늄 셀 → 우라늄 원광/분 환산 (원자로 1기당 필요한 우라늄 원광량)
- 비핵분열성 우라늄(Non-Fissile Uranium) 블렌더 레시피의 전체 입력 구성과 속도
- 우선순위 전력 스위치의 자체 전력 소비 및 자동 재연결 여부
- 지열 발전기 변동 주기가 정확히 60초인지, 그리드 통계 그래프에 어떤 값으로 집계되는지
- 1.2 게임 모드의 전력 소비 배수가 발전량에도 적용되는지(소비 전용인지)
- 1.2 안정판 정확 배포일
- 파워 스토리지의 자체 전력 소비 여부(위키 미기재)

---

## 출처 목록

**공식 위키 (satisfactory.wiki.gg) — 1차 출처**
- https://satisfactory.wiki.gg/wiki/Power
- https://satisfactory.wiki.gg/wiki/Biomass_Burner
- https://satisfactory.wiki.gg/wiki/Coal-Powered_Generator
- https://satisfactory.wiki.gg/wiki/Fuel-Powered_Generator
- https://satisfactory.wiki.gg/wiki/Nuclear_Power_Plant
- https://satisfactory.wiki.gg/wiki/Geothermal_Generator
- https://satisfactory.wiki.gg/wiki/Geyser
- https://satisfactory.wiki.gg/wiki/Alien_Power_Augmenter
- https://satisfactory.wiki.gg/wiki/Power_Storage
- https://satisfactory.wiki.gg/wiki/Priority_Power_Switch
- https://satisfactory.wiki.gg/wiki/Power_Line
- https://satisfactory.wiki.gg/wiki/Power_Pole
- https://satisfactory.wiki.gg/wiki/Water_Extractor
- https://satisfactory.wiki.gg/wiki/Pipeline
- https://satisfactory.wiki.gg/wiki/Miner
- https://satisfactory.wiki.gg/wiki/Fuel
- https://satisfactory.wiki.gg/wiki/Turbofuel
- https://satisfactory.wiki.gg/wiki/Compacted_Coal
- https://satisfactory.wiki.gg/wiki/Solid_Biofuel
- https://satisfactory.wiki.gg/wiki/Uranium_Fuel_Rod
- https://satisfactory.wiki.gg/wiki/Uranium_Waste
- https://satisfactory.wiki.gg/wiki/Ficsonium_Fuel_Rod
- https://satisfactory.wiki.gg/wiki/Particle_Accelerator
- https://satisfactory.wiki.gg/wiki/Clock_speed
- https://satisfactory.wiki.gg/wiki/Power_Shard
- https://satisfactory.wiki.gg/wiki/Somersloop
- https://satisfactory.wiki.gg/wiki/Patch_1.2.0.0
- https://satisfactory.wiki.gg/wiki/Patches

**커뮤니티 / 공략 사이트 — 교차 검증**
- Steam 토론 "Ideal coal generator ratio": https://steamcommunity.com/app/526870/discussions/0/2924479876985663766/
- Steam 토론 "water setup for coal plant (fully operational)": https://steamcommunity.com/app/526870/discussions/0/4625854988055231910/
- Steam 토론 "Turbofuel -- how much more effective is it?": https://steamcommunity.com/app/526870/discussions/0/3279192886594614246/
- Steam 토론 "Purpose of power storage": https://steamcommunity.com/app/526870/discussions/0/3105768154688409184/
- Satisfactory Q&A "Why you need 3 water extractors to 8 coal generators": https://questions.satisfactorygame.com/post/61c25d72831c8520523669fb
- ScreenRant "Satisfactory: How to Fix a Broken Power Grid": https://screenrant.com/satisfactory-fix-broken-power-grid/
- TheGamer "Satisfactory: Coal Power Guide": https://www.thegamer.com/satisfactory-coal-generator-power-guide/
- xGamingServer "Satisfactory Power Guide: Biomass to Nuclear (2026)": https://xgamingserver.com/blog/satisfactory-power-guide/
- BisectHosting "Satisfactory 1.2 Update: Patch Notes, Game Modes...": https://www.bisecthosting.com/blog/satisfactory-1-2-update-patch-notes-game-modes-spwn-fluid-station-vehicle-pathing
- Steam 가이드 "90 minutes to Coal -- onboarding 2.0": https://steamcommunity.com/sharedfiles/filedetails/?id=2686103223
- Satisfactory Guru "Coal Power Tutorial": https://satisfactory.guru/articles/read/index/id/6/name/Coal+Power+Tutorial
- SCIM (Satisfactory Calculator) Particle Accelerator: https://satisfactory-calculator.com/en/buildings/detail/id/Build_HadronCollider_C/name/Particle+Accelerator
