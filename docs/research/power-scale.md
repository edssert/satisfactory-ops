# 전력 단계별 규모 조사 (Power Scale) — "몇 대를, 언제, 왜"

> 담당 범위: **규모와 시점만** 다룬다. 발전기 사양·연료 에너지값·오버클럭 규칙·정전 메커니즘의 1차 검증은
> `docs/research/power.md`가 이미 끝냈으므로 **재검증하지 않고 인용**한다. 진행 순서·전환 시점의 서사는
> `docs/research/progression-route.md` D절이 다뤘다. 이 문서는 그 사이의 빈틈 — **"그래서 몇 대를 두라는 것인가"** — 를 채운다.
> 기준 버전: **1.2**(2026-06-02 정식). 조사 시점: 2026-08-19.
> 계산 근거: `src/data/app/buildings.json`, `items.json`, `recipes.json`, `resource-nodes.json`(1단 정규화 게임 데이터, 정본).

---

## 이 문서의 한 줄 결론

커뮤니티가 말하는 "몇 대"는 **딱 두 종류**다. ① 노드·벨트·파이프가 정수로 떨어지는 **비율 단위**(석탄 8대, 연료 8대 …),
② 그 단위를 몇 개 쌓아야 다음 티어까지 버티는지의 **누적 목표**(석탄 16대 ≈ 1.2 GW, 그다음 연료로). 앱은 이 둘을
구분해서 보여줘야 한다. 비율 단위는 게임 데이터로 **정확히 검증되고**, 누적 목표는 **커뮤니티 경험치라 폭이 넓다**.

---

## 1. 단계별 요약 표

MW는 모두 **100% 클럭 기준 총 발전량**이다. "순 MW"는 그 발전소가 자체적으로 먹는 전력(물 추출기·채굴기·정제소)을 뺀 값이며
`buildings.json`의 `powerMW`로 직접 계산했다.

| 단계 | 발전 방식 | 해금 | 권장 대수 | 총 MW | 순 MW | 필요 자원 | 전환 시점 |
|---|---|---|---|---|---|---|---|
| 0 | HUB 내장 연소기 | HUB 업그레이드 1·5 | 2대(고정, 철거 불가) | **40** (20×2) | 40 | 손수집 이파리·나무 | 자동으로 주어짐 |
| 0~2 | **바이오매스 연소기** | Tier 0 · HUB 업그레이드 6 | **2대**(다수 출처) ~ **5대**(빌드오더 가이드) | 60~150 (+HUB 40) | 동일 | 이파리·나무 손수집 → 바이오매스 | Tier 3 석탄 해금 **즉시** |
| 0~2 (선택) | 바이오매스 연소기 + 고체 바이오 연료 자동 공급 | Tier 0 | **최대 15대**(제작기 1대분) | 450 | 450 | 나무 24/분 손수집 | 손수집이 지겨워지는 시점 |
| 3 | **석탄 발전기** — 최소 단위 | Tier 3 · 석탄 동력 | **2대** (물 추출기 1대 @75%) | 150 | **125** | 석탄 30/분, 물 90 m³/분 | 첫 점화용 |
| 3 | 석탄 발전기 — 벨트 단위 | Tier 3 | **4대** (벨트 Mk.1 한 줄 포화) | 300 | **265** | 석탄 60/분, 물 180 m³/분 | 표준 1차 확장 |
| 3 | 석탄 발전기 — **황금비 블록** | Tier 3 | **8대** : 물 추출기 **3대** | 600 | **525** | 석탄 120/분(순수 노드 Mk.1), 물 360 m³/분 | 확장 단위 |
| 3~5 | 석탄 발전기 — 누적 목표 | Tier 3~5 | **16대**(가장 흔한 답) | 1,200 | ~1,050 | 석탄 240/분, 물 720 m³/분 | 여기서 석유로 |
| 5 | **연료 발전기** — 노드 단위 | Tier 5 · 석유 발전 | 순수 원유 노드 1개 = **8대** + 정제소 4대 | 2,000 | **1,840** | 원유 240 m³/분 | 석탄 그리드가 ~5 GW에 닿을 때(단일 출처) |
| 5~6 | 연료 발전기 — 실전 블록 | Tier 5 | **10대** + 정제소 5대 | 2,500 | ~2,310 | 원유 300 m³/분(순수 노드 125%) | 커뮤니티 표준 블록 |
| 6~8 | 터보 연료 전환 | Tier 5(정제소) + 대체 레시피 | 같은 파이프로 **연료 대비 2.67배** 대수 | — | — | 압축 석탄 또는 황 | 유체 처리량이 병목이 될 때 |
| 8 | **원자력 발전소** | Tier 8 · 원자력 | **2기 단위**(제조기 1대가 연료봉 0.4/분 = 2기분) | 5,000 | **4,920** | 우라늄 원광 40/분, 물 480 m³/분 | **선택** — 건너뛰어도 됨 |
| 3+ | 지열 발전기 | MAM 카테리움 연구 | 간헐천 1개당 1대, 맵 전체 **31개** | 평균 7,100 (전체) | 동일 | 없음 | 지나가는 길에 하나씩 |
| 9 | 외계 전력 증강기 | MAM 외계 기술 | 소머슬루프 10개/대 → 최대 10대 | 500/대 + 그리드 % | — | 소머슬루프(유한) | 그리드가 60 GW 넘을 때(단일 출처) |
| 4+ | **전력 저장고** | Tier 4 · 확장 동력 인프라 | 상황별 (아래 2-7절) | 100 MWh, 충전 100 MW | — | 전선 100 등 | 지열·입자 가속기 도입 시 필수 |

**"이 정도면 다음 티어까지 버틴다" 요약 (커뮤니티 경험치, 검증 아님):**

| 구간 | 목표 MW | 근거 |
|---|---|---|
| Tier 0~1 | **100 MW** (HUB 40 + 연소기 2대 60) | 4netplayers Tier 1 가이드가 명시한 수치 |
| Tier 2 (Phase 1 납품까지) | 100~150 MW | 위 + 연소기 1~2대 추가 |
| Tier 3~4 | **500~600 MW** (석탄 8대 블록 1개) | 8:3 황금비 블록 1개의 순출력 525 MW |
| Tier 5 진입 | **1,200 MW** (석탄 16대) | "16대면 연료 발전 시작할 때까지 충분했다" — 다수 후기 |
| Tier 5~6 | **2,000~2,500 MW** (연료 발전기 8~10대) | 순수 원유 노드 1개 = 2,000 MW |
| Tier 7~8 | **5 GW** | "석탄으로 ~5 GW까지 가다가 연료로 넘어가라" — 단일 출처 |
| Tier 8~9 (완주) | **10~65 GW** (실측 편차 매우 큼) | 후기별 10 GW 소비/40 GW 생산, 45 GW, 65 GW 등 |

---

## 2. 단계별 상세

### 2-1. 바이오매스 연소기 (Biomass Burner) — 초반

#### 처음에 몇 대?

**답이 두 갈래로 갈린다.**

| 출처 | 권장 대수 | 근거로 든 것 |
|---|---|---|
| [4netplayers Tier 1 가이드](https://www.4netplayers.com/en-us/blog/satisfactory/satisfactory-tier-1-factory-expansion-energy-logistics/) (2025-09-24) | **독립형 2대** | "We recommend building two of them to raise your total capacity to 100 MW" — HUB 내장 40 MW + 30×2 = 100 MW |
| [supercraft.host 바이오매스 가이드](https://supercraft.host/article/biomass-burner-satisfactory-guide/) (날짜 미기재) | **2대** | "Place two biomass burners near the HUB so you can split load and avoid a single point of failure" |
| [Steam "90 minutes to Coal"](https://steamcommunity.com/sharedfiles/filedetails/?id=2686103223) | **5대** (구리 노드 1 + 철 구역 4) | 석탄까지 90분 루트의 실제 빌드오더. "Every time you're in the Iron area, top off all Burners" |
| [나무위키 Satisfactory/건물/전력](https://namu.wiki/w/Satisfactory/%EA%B1%B4%EB%AC%BC/%EC%A0%84%EB%A0%A5) | 대수 미지정 | "마중물 역할로 주로 사용된다" — 상시 전원이 아니라 순간 부하·재점화용으로 규정 |

**정리:** "처음 몇 대"의 **다수 답은 2대(총 100 MW)**다. 5대는 석탄까지 최단 루트를 타면서 손수집 빈도를 줄이려는
빌드오더 특유의 값이고, 총량(HUB 40 + 150 = 190 MW)이 필요해서가 아니라 **연료 버퍼를 늘려 재급유 주기를 늘리려는** 것이다.
이 구분이 중요하다 — 아래 "왜 대수를 늘리는가" 참고.

#### 몇 대면 충분한가 — 부하 기준

`buildings.json`의 소비 전력으로 직접 계산했다.

| 초반 기계 | 소비 |
|---|---|
| 제련기(Smelter) | 4 MW |
| 제작기(Constructor) | 4 MW |
| 채굴기 Mk.1 | 5 MW |
| 조립기(Assembler) | 15 MW |

- HUB 내장 2대(40 MW)만으로 = 제련기 4 + 제작기 4 + 채굴기 2대 정도가 한계.
- 독립형 2대 추가(100 MW) = 조립기 라인 2~3줄 + 제련·제작 라인이 여유 있게 돈다.
- **10~20% 여유를 남기라**는 권고(supercraft.host)를 적용하면 100 MW 용량에서 실제 부하 상한은 **80~90 MW**다.

#### 왜 대수를 늘리는가 — 총량이 아니라 버퍼 때문

바이오매스 연소기는 **유일하게 수요 추종형**이다. 위키 원문: *"The fuel consumption of Biomass Burners scales to power
demand, unlike other generators... if power consumption is not 100%, the resource consumption is automatically lowered."*
([Biomass Burner](https://satisfactory.wiki.gg/wiki/Biomass_Burner))

따라서 **연소기를 더 지어도 연료가 더 빨리 없어지지 않는다.** 소비는 그리드 부하로 결정되고, 그것이 여러 대에 나뉠 뿐이다.
Steam 토론의 표현: *"Building more Biomass Burners than necessary means the fuel consumption will be split among all of them,
therefore all of them will have to be refuelled less frequently."*

**결론: 초반 연소기 대수는 "필요 MW ÷ 30"이 아니라 "손으로 채우러 가는 주기를 얼마나 늘리고 싶은가"로 정한다.**
이것이 이 앱이 설명해야 할 "왜"다. 계산기는 이 답을 낼 수 없다.

부수 효과 하나: **전력 저장고는 바이오매스 연소기로 충전되지 않는다.** 수요 추종형이라 잉여 전력이 발생하지 않기 때문이다.
개발자(Snutt) 직접 답변: *"Power Storages can only take excess power, and since biomass generators only generate power on
demand no excess power goes towards the power storages."*
([Steam](https://steamcommunity.com/app/526870/discussions/0/4325125547784056738))

#### 연료를 어떻게 대는가 — 자동화의 경계

**자동화되는 것과 안 되는 것이 명확히 갈린다.**

- ❌ **채집은 자동화 불가.** 이파리·나무를 줍는 것은 끝까지 손이다. GameRant: *"there is no way to automatically harvest
  biomass, which means players will need to load containers manually."*
- ✅ **가공과 급유는 자동화 가능.** Update 1.0에서 연소기에 **컨베이어 입력 포트가 생겼다.** 위키 원문:
  *"Introduced in Update 1.0, the Biomass Burner now has an input for conveyor belts."*
  저장 컨테이너 → 제작기 → 연소기를 벨트로 잇는다.

**게임 데이터로 계산한 체인** (`recipes.json`):

| 단계 | 레시피 | 입력/분 | 출력/분 | 건물 |
|---|---|---|---|---|
| 잎 → 바이오매스 | `Recipe_Biomass_Leaves_C` | 이파리 120 | 바이오매스 60 | 제작기 |
| **나무 → 바이오매스** | `Recipe_Biomass_Wood_C` | 나무 **60** | 바이오매스 **300** | 제작기 |
| 바이오매스 → 고체 바이오 연료 | `Recipe_Biofuel_C` | 바이오매스 120 | 고체 바이오 연료 **60** | 제작기 |

여기서 나오는 결정적 수치:

- **제작기 1대(고체 바이오 연료 60/분) = 연소기 15대 = 450 MW.** (연소기의 고체 바이오 연료 소모 4/분)
- 그 제작기를 먹이려면 바이오매스 120/분 → **나무 24/분**(제작기 0.4대) 또는 **이파리 240/분**(제작기 2대).
- **나무가 이파리보다 10배 효율적이다.** 나무 24/분 vs 이파리 240/분으로 같은 결과. 손수집 시간이 곧 비용이므로
  **나무를 우선 줍는 것이 정답**이고, 이것이 "90 minutes to Coal" 가이드가
  *"Never place leaves or wood directly into any burner"* 라고 못 박은 이유다.
- 에너지 배수: 나무 60개(6,000 MJ) → 고체 바이오 연료 150개(**67,500 MJ**) = **11.25배**. 나무를 연소기에 직접 넣으면
  이 11.25배를 통째로 버린다.

**벨트 한 줄이 먹일 수 있는 연소기 수** (게임 데이터 계산):

| 벨트 | 바이오매스 직공급(10/분) | 고체 바이오 연료(4/분) |
|---|---|---|
| Mk.1 (60/분) | 6대 | **15대** |
| Mk.2 (120/분) | 12대 | 30대 |

#### 언제까지 쓰는가 / 몇 대를 넘으면 지옥인가

- **다수 출처 일치: Tier 3 석탄 해금 즉시 주 전원에서 내린다.** Steam 토론 요약:
  *"There's no benefit to delaying Coal Generation. You build that sucker the moment it's available."*
  (`progression-route.md` D절이 5개 이상 독립 출처로 이미 확인한 결론과 동일)
- **완전 철거는 하지 마라.** 그리드가 트립되면 발전기부터 다시 살려야 하는데, 손으로 채우는 연소기가
  블랙스타트의 유일한 무조건적 시동 수단이다. 나무위키도 같은 표현으로 "마중물"이라 부른다.
- **"몇 대를 넘으면 관리가 지옥인가"에 대한 명시적 수치를 제시한 출처는 찾지 못했다.**
  다만 위 자동화 계산이 실질적 경계선을 준다: **제작기 + 벨트로 묶으면 15대(450 MW)까지 한 줄로 관리되고,
  그 이상은 벨트를 늘려야 한다.** 손수집만 하는 경우 "90 minutes to Coal"이 실제로 굴린 최대치가 **5대**이고,
  그 가이드조차 "철 구역에 갈 때마다 전부 채워라"를 별도 루틴으로 지시한다 — 즉 5대가 이미 상시 잡일이라는 뜻이다.

#### "손으로 넣어야 함" 문제에 대한 커뮤니티의 대응

세 갈래가 확인된다.

1. **버퍼를 키운다** (다수) — 필요 MW보다 많이 짓고 짝지어 채운다. supercraft.host:
   *"Always refuel multiple burners in pairs so your early factory does not blackout."*
2. **반자동화한다** (다수, 1.0 이후 표준) — 저장 컨테이너 → 제작기(고체 바이오 연료) → 벨트 → 연소기.
   채집만 손으로 남긴다.
3. **아예 건너뛴다** (소수) — [Steam "Early permanent power guide (biofuel/coal skip)"](https://steamcommunity.com/sharedfiles/filedetails/?id=3533125237)
   (2025-10-31 갱신)는 **지열 발전기로 러시**해서 바이오매스 후반부와 석탄 전체를 건너뛴다.
   주장: 순수 간헐천 2 + 보통 1 + 1 = **지열 4대면 초반 전력이 해결된다**(평균 400×2 + 200 + α ≈ 1,000 MW 이상).
   **단일 출처이며 카테리움 MAM 연구를 선행해야 해 표준 루트가 아니다.** 아래 4절 참고.

---

### 2-2. 석탄 발전 (Tier 3)

#### 첫 규모 — 여기가 가장 크게 갈린다

| 출처 | 첫 규모 | 물 공급 | 성격 |
|---|---|---|---|
| [Steam "90 minutes to Coal"](https://steamcommunity.com/sharedfiles/filedetails/?id=2686103223) | **석탄 발전기 2대** + 채굴기 Mk.1 1대 + 물 추출기 1대 | 추출기 1대 | 최소 점화 규모. *"The two Coal Generators are just barely enough to power everything built"* |
| [나무위키](https://namu.wiki/w/Satisfactory/%EA%B1%B4%EB%AC%BC/%EC%A0%84%EB%A0%A5) + [Steam 토론](https://steamcommunity.com/app/526870/discussions/0/3814039097894737812/) | **발전기 2대 : 물 추출기 1대 @클럭 75%** | 정확히 90 m³/분 | 초보용 최소 정수 단위 |
| [Steam "How many coal gens for one node?"](https://steamcommunity.com/app/526870/discussions/0/2963922521554677550/) | **4대** (보통 노드 + Mk.1 채굴기 = 벨트 Mk.1 한 줄) | 추출기 1.5대 (2대 언더클럭) | *"Start conservatively with 4 generators per MK1 belt/normal node"* |
| [공식 위키](https://satisfactory.wiki.gg/wiki/Coal-Powered_Generator) · [TheGamer](https://www.thegamer.com/satisfactory-coal-generator-power-guide/) (2024-09-15) · [deltacalculator](https://www.deltacalculator.com/satisfactory/coalgenerator/) | **8대 : 물 추출기 3대** (황금비) | 정확히 360 m³/분 | 확장의 정수 단위 |

**판단:** 셋 다 맞고 목적이 다르다. 앱은 이렇게 구분해서 내야 한다.

- **2대** = "지금 당장 연소기에서 벗어나기" 위한 최소 규모. 순 **125 MW**.
- **4대** = "벨트 Mk.1 한 줄이 정확히 채우는" 규모. 순 **265 MW**. 벨트를 업그레이드하지 않아도 되므로 Tier 3 시점에 자연스럽다.
- **8대** = "물 추출기 3대와 정확히 맞아떨어지는" 확장 단위. 순 **525 MW**. TheGamer가 명시한 확장 방식:
  *"This also allows you to easily expand by adding three more Water Extractors and eight Coal-Powered Generators."*

#### 확장 단위와 누적 목표

| 대수 | 총 MW | 순 MW | 석탄/분 | 물 m³/분 | 물 추출기 | 파이프 Mk.1 |
|---|---|---|---|---|---|---|
| 2 | 150 | **125** | 30 | 90 | 1대 @75% | 1줄(30%) |
| 4 | 300 | **265** | 60 | 180 | 1.5대 (2대 @75%) | 1줄(60%) |
| 8 | 600 | **525** | 120 | 360 | 3대 @100% | **1.2줄 — 넘침** |
| 16 | 1,200 | ~1,050 | 240 | 720 | 6대 | 2.4줄 |

순 MW 계산: 총 MW − 물 추출기 20 MW/대 − 채굴기(Mk.1 5 MW / Mk.2 15 MW). 전부 `buildings.json` 값이다.

**주의 — 8대부터 파이프가 터진다.** 물 360 m³/분 > 파이프라인 Mk.1 **300 m³/분**. 파이프를 두 줄로 나누거나
Tier 6의 Mk.2(600 m³/분)를 기다려야 한다. 이 함정은 `power.md`가 이미 지적했고, 위키도
*"3 Water Extractors will produce enough water for 8 Coal Generators, provided the 300 m³/min throughput limit
of the Mk.1 Pipeline isn't exceeded"* 라고 조건을 붙인다.

**누적 목표는 16대가 가장 흔한 답이다.** [Steam "Coal power longevity?"](https://steamcommunity.com/app/526870/discussions/0/3791506981620823399/)에서
복수의 플레이어가 독립적으로 같은 수를 말한다: *"I also have 16 coal generators up and running"*,
*"16 coal generators and they were enough until I started fuel power"*, *"I think I end up with 16 or so generators"*.
같은 맥락의 다른 스레드에도 *"a good 8 or 16 Coal Generators running stable carrying you until you can unlock Oil/Fuel"* 가 있다.
**3개 이상 독립 발언 일치 → consensus 수준.**

#### 물 공급 구성 — 언더클럭 권장

정확한 정수 관계는 셋뿐이다(게임 데이터 계산, 물 추출기 120 m³/분):

- **발전기 2 : 추출기 1 @클럭 75%** → 90 m³/분, 오차 0
- 발전기 4 : 추출기 2 @클럭 75% → 180 m³/분, 오차 0
- **발전기 8 : 추출기 3 @클럭 100%** → 360 m³/분, 오차 0

**언더클럭이 오버클럭보다 권장된다.** 위키가 대안으로 든 "추출기 1대를 225%로 올려 발전기 6대"는 성립하지만
*"the power needs for that 1 extractor are going to be greater than 3 running at 100%"* 라고 스스로 경고한다.
추출기는 생산 건물이라 전력이 `클럭^1.321928`로 오르기 때문이다(`power.md` 9절).

#### 석탄 노드 몇 개면 충분한가

노드 1개가 지탱하는 발전기 수 (게임 데이터: 채굴기 정격 × 순도 배수 ÷ 15):

| 채굴기 | 불순 | 보통 | 순수 |
|---|---|---|---|
| Mk.1 | 2대 | 4대 | **8대** |
| Mk.2 (Tier 4) | 4대 | 8대 | **16대** |
| Mk.3 (Tier 8) | 8대 | 16대 | 32대 |

**따라서 "16대 목표"는 노드 1개로 끝난다** — 순수 노드 + 채굴기 Mk.2(Tier 4), 또는 보통 노드 2개 + Mk.2.
석탄 노드는 맵 전체에 **62개**(불순 15 / 보통 31 / 순수 16, `resource-nodes.json`) 있으므로 자원 자체는 전혀 부족하지 않다.
**병목은 노드 수가 아니라 물과 파이프다.**

---

### 2-3. 연료 발전 (Tier 5~6)

#### 노드 1개 = 발전기 몇 대 (공식 위키 표, 게임 데이터로 재계산 일치)

| 원유 노드 | 원유 m³/분 | 정제소 | 연료 m³/분 | **연료 발전기** | 총 MW | 순 MW | 폴리머 수지 |
|---|---|---|---|---|---|---|---|
| 불순 | 60 | 1대 | 40 | **2대** | 500 | **430** | 30/분 |
| 보통 | 120 | 2대 | 80 | **4대** | 1,000 | **900** | 60/분 |
| 순수 | 240 | 4대 | 160 | **8대** | 2,000 | **1,840** | 120/분 |

순 MW = 총 MW − 정제소 30 MW/대 − 원유 추출기 40 MW. 표준 연료 레시피(원유 60 → 연료 40 + 폴리머 수지 30) 기준.

**커뮤니티 표준 블록은 10대다.** [Steam](https://steamcommunity.com/app/526870/discussions/0/3814039097894737812/):
*"10 fuel generators consuming 120/min fuel and producing 1500 MW"* — 여기서 1,500 MW는 **1.0 이전 값(150 MW/대)**이다.
1.2 기준으로 같은 구성은 **2,500 MW**다. 원유 300 m³/분(순수 노드 125% 또는 불순 2개 250%) → 정제소 5대 → 연료 200 m³/분 → 발전기 10대.

**폴리머 수지를 반드시 처리하라.** 표준 레시피는 부산물이 나오고, **막히면 연료 생산 자체가 멈춘다** — 즉 발전소가 죽는다.
AWESOME 싱크로 보내거나 잔여 고무·플라스틱으로 돌린다.

#### 파이프 제약

게임 데이터 계산 (연료 20 m³/분/대, 터보 연료 7.5 m³/분/대):

| 파이프 | 연료 | 터보 연료 |
|---|---|---|
| Mk.1 (300 m³/분) | 15대 = 3,750 MW | 40대 = 10,000 MW |
| Mk.2 (600 m³/분) | 30대 = 7,500 MW | 80대 = 20,000 MW |

**터보 연료가 같은 파이프로 2.67배를 낸다.** 대수 자체가 아니라 **유체 처리량이 병목이 되는 순간**이 전환 시점이다.

#### 석탄에서 언제 넘어가는가

- **다수 의견: 완전 전환하지 말고 병렬로 붙여라.** 석탄 발전소를 철거하지 말고 같은 그리드에
  연료 발전소를 새로 지어 넘어서게 한다.
- **구체적 MW 기준을 제시한 유일한 출처(단일):** *"use coal and water for coal power until you reach ~5 GW.
  This should be the time to switch for fuel power"* ([Steam](https://steamcommunity.com/app/526870/discussions/0/3791506981620823399/)).
  5 GW는 석탄 발전기 **67대**에 해당한다 — 위의 "16대" 컨센서스와 4배 차이다. 갈리는 항목으로 분류한다.
- **실용적 판단 근거(계산):** 순수 원유 노드 **1개(2,000 MW)**가 석탄 8대 블록 **3.3개분**이다.
  석탄 16대(1,200 MW)를 지은 뒤라면 순수 원유 노드 하나로 그리드를 2.7배 키운다.

#### 중간 경로 — 석유 코크스

Tier 5에서 정제소는 열리지만 연료 발전기(석유 발전, Tier 5 order 5)는 나중이다. 그 사이에
**중유 잔여물 → 석유 코크스 → 기존 석탄 발전기**로 태우는 우회로가 있다(발전기 1대당 코크스 25/분).
장점: 기존 석탄 발전소 재활용, 중유 잔여물 처리 동시 해결. 단점: 위키가
*"slightly less efficient than fuel produced from heavy oil residue due to the extra power needed for additional
refineries and water extractors"* 라고 명시.

---

### 2-4. 원자력 (Tier 8)

#### 몇 대

**증설 단위는 2기다.** 게임 데이터 계산:

| 항목 | 값 | 계산 근거 |
|---|---|---|
| 원자로 1기 | 2,500 MW, 물 240 m³/분 | `buildings.json` |
| 물 추출기 | **정확히 2대**(240 m³/분) | 120 × 2 |
| 순출력 | **2,460 MW** | 2,500 − 40 |
| 우라늄 연료봉 제조기 1대 | 0.4봉/분 = **원자로 2기** | `Recipe_NuclearFuelRod_C` |
| 원자로 1기당 우라늄 원광 | **20/분** | 원광 2개 → 전지 1개, 전지 20/분 → 봉 0.4/분 |
| 폐기물 | **10/분 · 기** | 봉 0.2/분 × 50 |

**맵 전체 우라늄으로 몇 기까지 가능한가(계산):** 채굴 가능한 우라늄 노드는 **5개**(불순 3, 보통 2 — 순수 노드는 없다,
`resource-nodes.json`). 채굴기 Mk.3 @100% = 840 원광/분 → **원자로 42기 = 105 GW**. 250% 오버클럭 시 105기 = 262 GW.
(검색 결과에 나온 *"a single uranium node can sustain 252 Nuclear Power Plants"* 는 이 계산과 두 자릿수 어긋난다 — 채택하지 않는다.)

#### 폐기물 처리 — `power.md`의 수치를 정정한다

`power.md` 5절은 *"입자 가속기 1대(25/분 소비)가 원자로 2.5기분을 처리한다"* 고 적었다.
**이것은 플루토늄 펠릿 레시피의 직접 투입분만 센 값이다.** 게임 데이터로 전체 체인을 계산하면:

| 단계 | 레시피 | 폐기물 소모 |
|---|---|---|
| 비분열성 우라늄 (혼합기) | 폐기물 37.5 + 실리카 25 + 질산 15 + 황산 15 → NFU 50 | 37.5/분 |
| 플루토늄 펠릿 (입자 가속기) | NFU 100 + **폐기물 25** → 펠릿 30 | 25/분 |

가속기 1대는 NFU 100/분이 필요 → **혼합기 2대** → 혼합기에서 75/분 + 가속기에서 25/분 = **총 100/분**.
**즉 입자 가속기 1대 계열이 원자로 10기분의 폐기물을 소각한다.** 2.5기가 아니다.

**하드 제약 재확인:** 우라늄 폐기물은 AWESOME 싱크에 넣을 수 없고, 배출이 막히면 원자로가 멈춘다.
즉 **원자로를 켜기 전에 폐기물 출구가 준비돼 있어야 한다.**

#### 언제 가는가 / 안 가도 되는가

**커뮤니티 컨센서스는 "안 가도 된다"에 가깝다.**
[Steam "Nuclear more trouble than it's worth?"](https://steamcommunity.com/app/526870/discussions/0/4843149419128315931/):

- 반대: *"all that time I wasted with nuclear, and I still have plenty of oil sources that I don't even use."*
  로켓 연료가 훨씬 적은 수고로 비슷하거나 더 큰 출력을 낸다.
- 찬성: *"One pure uranium node with a mk3 miner at 100% can support 6 power plants producing 15000MW"*
  — **이 발언은 신뢰할 수 없다. 게임에 순수 우라늄 노드는 존재하지 않는다**(`resource-nodes.json`: pure 0).
  보통 노드 Mk.3 @100%는 240 원광/분이므로 **12기**가 맞다.
- 우라늄의 유일한 장점: *"uranium is pretty much used solely for power generation"* — 원유는 고무·플라스틱과 경쟁하지만
  우라늄은 발전 전용이라 다른 라인을 잠식하지 않는다.

**결론: 원자력은 "필요"가 아니라 "선택"이다.** 게임 클리어(Phase 5)에 원자력 발전소는 요구되지 않는다.
다만 **핵 파스타(Nuclear Pasta)**는 Phase 4·5에 필요하고 입자 가속기가 500~1,500 MW를 먹으므로,
그 전력을 어디서 대느냐의 문제로 되돌아온다.

---

### 2-5. 지열·기타

#### 지열 발전기

- 맵 전체 간헐천 **31개**(불순 9 / 보통 13 / 순수 9) — `resource-nodes.json`이 wiki.gg와 정확히 일치.
- 총 평균 **7,100 MW**(범위 3,550~10,650 MW).
- **연료·물 불필요, 오버클럭 불가, 출력이 평균의 0.5~1.5배로 변동.**

**얼마나 보태는가 — 시점에 따라 극과 극이다.**

| 시점 | 평가 | 근거 |
|---|---|---|
| MAM 카테리움 연구를 **일찍** 끝냈을 때 | **초반을 통째로 해결한다.** 순수 2 + 보통 1 + 1 = 4대면 초반 충분 | [Steam 지열 러시 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=3533125237) (2025-10-31, **단일 출처**) |
| 보통 진행 속도로 해금했을 때 | *"even if you place one on every geyser, the power gain would be a fraction of what you're already producing"* | Steam 토론(다수) |

**설계 함의:** 지열 총량 7.1 GW는 석탄 16대(1.2 GW) 대비 크지만, 연료 발전 단계(수 GW~수십 GW)에 들어서면 미미하다.
**보조 전원으로 취급하고, 변동폭(±50%)을 전력 저장고로 흡수해야 한다.** 나무위키의 표현이 정확하다:
"최대·최소 발전량 차만큼 전력 저장고를 추가하면 안정적으로 운용 가능".

#### 외계 전력 증강기 (Alien Power Augmenter)

- 자체 500 MW + 그리드 기본 생산량에 **무연료 +10% / 연료 공급 시 +30%** (가산 누적).
- **건설 비용에 소머슬루프 10개** (`buildings.json`: `Desc_WAT1_C` ×10). 맵 전체 소머슬루프가 106개이므로
  **이론상 최대 10대**이고, 소머슬루프를 생산 증폭에 쓸 몫과 경쟁한다.
  (`power.md`가 적은 "소머슬루프 1"은 MAM **연구 해금 비용**이고 **건설 비용이 아니다** — 구분 필요.)
- 손익분기 주장: *"For fueled augmenters, a minimum of 60,000 MW generator production is needed to just break even"*
  — **단일 출처, 계산 과정 미공개.** 참고용.

---

### 2-6. 전력 여유율

#### 커뮤니티 권장치

| 출처 | 권장 여유 | 표현 |
|---|---|---|
| supercraft.host (초반 한정) | **10~20%** | "keep a 10-20% margin between consumption and the 30 MW a biomass burner provides" |
| Steam 토론(다수) | **20~30%** | "keep at least a 20-30% spare buffer on your power generation" |
| Steam 토론(개별) | **25%** (=사용률 75% 상한) | "if you start using more than 75% of your power capacity, it's time to upgrade" |
| Steam 토론(엄격파) | **최대 부하 < 정상 생산** | "Your maximum factory demand should NEVER be higher than your steady power production to have zero chance of tripping" |
| xgamingserver (2026) | 수치 없음, "round, over-provisioned blocks" | "if a new production wing draws 200 MW, bring up enough generators to cover it plus a buffer before you switch the machines on" |

**"1.5배"라는 수치를 명시한 Satisfactory 출처는 찾지 못했다.** 검색 결과에 나온 1.4~1.5배는 실제 PC 파워서플라이
권장치이지 이 게임 이야기가 아니다. **다수 출처가 수렴하는 값은 20~30% 여유(= 생산이 소비의 1.25~1.43배)**다.

**중요한 함정 — "최대 부하"는 표시된 소비량이 아니다.**
- 입자 가속기·양자 인코더는 사이클 내에서 소비가 **최소→최대로 비선형 진동**한다(250~750 MW, 500~1,500 MW, 0~2,000 MW).
  평균만 보면 정전이 난다.
- **호버팩은 100 MW를 먹는데 전력 그래프에 표시되지 않는다.** 위키 명시:
  *"The Hoverpack draw 100 MW by default, but that power consumption does not appear on the power chart, which can lead
  to confusing situations when trying to restart electric grids, especially small ones."*
  → 초반 그리드(100 MW)에서 호버팩을 켜면 **그것만으로 그리드가 죽는다.**

#### 정전이 나면 어떤 일이 벌어지는가

`power.md` 6절이 이미 검증했다. 규모 관점에서 추가되는 것만:

- **부분 감속(brownout)이 없다. 이진 조건이다.** 소비 > 생산 + 저장 잔량 → **그리드 전체 즉시 정지.**
- 발전기까지 같이 멈추므로 **자력 복구가 안 된다.** 발전기·전신주에서 [E] → 레버를 내려 차단기를 리셋한다.
- **리셋만 하면 즉시 다시 죽는다.** 위키: *"Before resetting it is advised to either attach more power generators
  to the grid or temporarily remove power cables to some of the areas of the factory."*
- **새 석탄 발전소를 메인 그리드에 그냥 붙이면 안 된다** — 채굴기·물 추출기가 먼저 전력을 먹는데 발전은 연료가
  도착한 뒤에 시작되므로, 여유가 없으면 메인 그리드까지 같이 죽는다.
- 규모가 클수록 손실이 크다: 진행 중이던 모든 사이클이 멈추고, 유체 파이프가 비고, 재기동에 버퍼 재충전 시간이 든다.

---

### 2-7. 전력 저장고

- **해금: Tier 4 · 확장 동력 인프라.** 용량 100 MWh, **충전율 100 MW/대**, 방전은 무제한(부족분을 즉시 메움).
- **바이오매스 연소기로는 충전되지 않는다**(위 2-1 참고). 즉 **실질적으로 석탄 발전 이후의 장치**다.
- 80% 아래로 방전되면 경고음이 난다. 여러 대를 데이지 체인하면 경고음도 커진다.

**몇 개를 두는가 — 목적별로 답이 다르다.**

| 목적 | 필요 개수 | 근거 |
|---|---|---|
| **변동 부하 흡수**(입자 가속기 등) | `ceil( Σ(레시피 평균 MW − 최소 MW) ÷ 100 )` | `power.md` 8절. 250~750 MW 레시피 = 2.5대, 500~1,500 MW = 5대 |
| **지열 변동 흡수** | (최대 − 최소) ÷ 100. 순수 간헐천 1개(200~600 MW) = **4대** | 나무위키 원칙 + 계산 |
| **정전 유예 시간 확보** | 잔량(MWh) ÷ 부족분(MW) × 60분. 1대 = 100 MW 부족을 **1시간** 버팀 | 계산 |
| **일반 안전 버퍼** | 생산의 **50%**(단일 출처, 근거 미공개) — 예: 2 GW 그리드에 10대 | Steam 개별 발언, "gives ample time to trace problems" |

**앱에 넣을 실용 기준(설계 제안, 게임 규칙 아님):** Tier 4에 처음 1~2대(석탄 그리드 안전판), Tier 7 입자 가속기 도입 시
레시피별 공식대로, 지열을 붙일 때마다 (최대−최소)÷100.

---

## 3. 게임 데이터 대조

`node -e` 로 `src/data/app/*.json` 을 직접 읽어 커뮤니티 수치와 대조했다.

### 3-1. 전부 일치한 것

**모든 연료 소모율이 `발전량 ÷ 에너지값 × 60` 으로 정확히 재현된다.** (유체는 MJ/L → ×1000)

| 발전기 | 연료 | 게임 데이터 계산 | 위키/커뮤니티 | 결과 |
|---|---|---|---|---|
| 바이오매스 연소기 30 MW | 이파리 15 MJ | 120/분 | 120/분 | ✅ |
| " | 균사 20 MJ | 90/분 | 90/분 | ✅ |
| " | 나무 100 MJ | 18/분 | 18/분 | ✅ |
| " | 바이오매스 180 MJ | 10/분 | 10/분 | ✅ |
| " | 고체 바이오 연료 450 MJ | **4/분** | 4/분 | ✅ |
| 석탄 발전기 75 MW | 석탄 300 MJ | **15/분** | 15/분 | ✅ |
| " | 압축 석탄 630 MJ | 7.1429/분 | 7.142857/분 | ✅ |
| " | 석유 코크스 180 MJ | 25/분 | 25/분 | ✅ |
| 연료 발전기 250 MW | 연료 750 MJ/m³ | **20 m³/분** | 20 m³/분 | ✅ |
| " | 터보 연료 2,000 MJ/m³ | 7.5 m³/분 | 7.5 m³/분 | ✅ |
| 원자력 발전소 2,500 MW | 우라늄 연료봉 750,000 MJ | **0.2/분** | 0.2/분 | ✅ |
| " | 픽소니움 연료봉 150,000 MJ | 1/분 | 1/분 | ✅ |

**보조 자원(물)도 재현된다.** `supplementalToPowerRatio` 는 **GJ당 m³** 단위다:
- 석탄 발전기: 75 MW × 60초 = 4,500 MJ/분 = 4.5 GJ × **10** = **45 m³/분** ✅
- 원자력 발전소: 2,500 MW × 60초 = 150 GJ/분 × **1.6** = **240 m³/분** ✅

**그 외 일치 항목:**

| 커뮤니티 주장 | 게임 데이터 | 결과 |
|---|---|---|
| "석탄 발전기 8대 : 물 추출기 3대" | 8 × 45 = 360 = 3 × 120 | ✅ 오차 0 |
| "발전기 2대 : 물 추출기 1대 @75%" (나무위키·Steam) | 2 × 45 = 90 = 120 × 0.75 | ✅ 오차 0 |
| "벨트 Mk.1 한 줄 = 석탄 발전기 4대" | 60 ÷ 15 = 4 | ✅ |
| "순수 원유 노드 = 정제소 4 + 연료 발전기 8 = 2,000 MW" | 240 → 연료 160 → 8대 × 250 | ✅ |
| "제조기 1대 = 원자로 2기" | 연료봉 0.4/분 ÷ 0.2 | ✅ |
| "원자로 1기 = 물 추출기 정확히 2대" | 240 ÷ 120 | ✅ |
| "간헐천 31개(9/13/9)" | `resource-nodes.json` 동일 | ✅ |
| "벨트 Mk.1 = 연소기 6대(바이오매스 직공급)" | 60 ÷ 10 | ✅ |
| **"제작기 1대 = 연소기 15대"** (현재 wiki.gg) | 고체 바이오 연료 60/분 ÷ 4/분 | ✅ |

### 3-2. 어긋난 것 — 커뮤니티 쪽이 틀렸다

| 주장 | 출처 | 게임 데이터 | 판정 |
|---|---|---|---|
| **"연료 발전기는 12 m³/분을 소모하고 150 MW를 낸다"** | Fandom 위키 튜토리얼, 복수 Steam 게시물 | **20 m³/분, 250 MW** | ❌ **1.0 이전(Update 8) 값.** Fandom 계열 전반이 갱신되지 않았다 |
| "10 fuel generators producing **1500 MW**" | Steam 토론 | 10 × 250 = **2,500 MW** | ❌ 위와 같은 원인(150 MW/대 가정) |
| "순수 원유 노드는 **13.3대**의 연료 발전기 = 2,000 MW" | Steam 토론 | 2,000 MW는 맞으나 **8대**다 | ❌ 내부 모순이 증거다. 13.3 = 2,000 ÷ 150(구값). MW만 우연히 맞았다 |
| **"제작기 1대 = 연소기 12대"** | [GameRant](https://gamerant.com/satisfactory-how-automate-biomass-burners-conveyor-biofuel-layout/) (2024-09-14, 1.0 명시) | **15대** (60 ÷ 4) | ❌ 근거 불명. 세 번째 값이다(구 위키 4 / GameRant 12 / 현 위키·데이터 15) |
| "간헐천은 **18개**, 평균 4,500 MW" | 검색 스니펫(Fandom 계열 추정) | **31개, 7,100 MW** | ❌ 구값 |
| "우라늄 노드: 순수 0, 보통 2, 불순 3, **총 5개**" | 검색 스니펫 | **총 6개**(불순 3, 보통 3) 중 **채굴 가능 5개** — 1개는 노드가 아니라 **매장지(deposit)** | ⚠️ 결론(순수 0)은 맞고 집계 기준이 다르다 |
| "순수 우라늄 노드 + Mk.3 = 발전소 6기" | Steam 토론 | **순수 우라늄 노드는 존재하지 않는다** | ❌ 전제가 틀렸다 |
| "우라늄 노드 1개가 발전소 **252기**를 지탱" | 검색 스니펫 | 채굴 가능 노드 **전부** 합쳐 Mk.3 @100% = **42기** | ❌ 두 자릿수 어긋남 |
| "물 추출기 4대 : 석탄 발전기 8대" | [deltacalculator](https://www.deltacalculator.com/satisfactory/coalgenerator/) | 3대면 정확히 맞는다(4대는 480 m³로 33% 과잉) | ⚠️ 틀린 건 아니고 과잉 설계. 언더클럭 언급 없음 |

### 3-3. 어긋난 것 — 이 저장소의 기존 문서가 틀렸다

**`docs/research/power.md` 를 고쳐야 할 항목 3건:**

1. **터보 혼합 연료 레시피에 석유 코크스가 빠졌다.**
   - `power.md` 4절: "연료 15 m³ + 중유 잔여물 30 m³ + 황 22.5 → 터보 연료 45 m³"
   - `recipes.json` `Recipe_Alternate_TurboBlendFuel_C`: 연료 15 + 중유 잔여물 30 + 황 22.5 + **석유 코크스 22.5** → 터보 연료 45
   - 코크스 22.5/분이 통째로 누락되어 있다. 자원 수지 계산이 틀어진다.

2. **폐기물 처리 능력이 4배 과소평가돼 있다.**
   - `power.md` 5절: "입자 가속기 1대(25/분 소비)가 원자로 2.5기분을 처리한다"
   - 전체 체인 계산: 가속기 1대 = 혼합기 2대(폐기물 75/분) + 가속기 자체(25/분) = **100/분 = 원자로 10기분**
   - 2-4절 참고.

3. **외계 전력 증강기의 소머슬루프 비용이 연구비와 건설비로 뒤섞여 있다.**
   - `power.md` 11절: "해금: 소머슬루프 1, SAM 변동기 100, 컴퓨터 50" — 이것은 MAM **연구** 비용이다.
   - `buildings.json` `Build_AlienPowerBuilding_C` **건설** 비용: **소머슬루프 10**, SAM 변동기 50, 전선 100,
     강화 철판 50, 모터 25, 컴퓨터 10. 소머슬루프가 106개뿐이므로 **최대 10대**라는 상한이 여기서 나온다.

**표기 문제(ADR-0017):** `power.md`가 쓴 한글명 여러 개가 게임 공식 로케일과 다르다.
`바이오매스 버너` → **바이오매스 연소기**, `나뭇잎` → **이파리**, `목재` → **나무**, `균사체` → **균사**,
`픽소늄` → **픽소니움**, `우선순위 전력 스위치` → **우선전력 스위치**. 이 문서는 `buildings.json`·`items.json`의 `ko` 를 따랐다.

### 3-4. 저장소 데이터 자체의 빈틈

| 항목 | 상태 |
|---|---|
| 지열 발전기 `powerGenMW` | **`null`** — 변동 출력이라 게임 데이터에 단일값이 없다. 앱이 범위값(50~150 / 100~300 / 200~600)을 별도로 들고 있어야 한다 |
| 외계 전력 증강기 `powerGenMW` | **`null`** — 500 MW 및 그리드 보너스가 데이터에 없다. 큐레이션 필요 |
| 전력 저장고 용량·충전율 | `buildings.json`에 해당 필드 없음(100 MWh / 100 MW). 큐레이션 필요 |
| 모든 발전기 `powerShardSlots` | **전부 0.** 저장소 전체에 `powerShardSlots > 0`인 건물이 **하나도 없다** — 파워 셰이드 슬롯 정보가 파이프라인에서 누락된 것으로 보인다 |
| 발전기 `powerExponent` | 전부 **1.6** — 그러나 발전기 오버클럭은 **선형**이고, 생산 건물의 지수도 현재는 **1.321928**이다(Patch 0.7.0.0에서 1.6 → 1.321928 변경). **이 필드를 그대로 쓰면 틀린 값이 나온다** |

마지막 두 항목은 데이터 파이프라인 이슈다. `power.md` 9절의 오버클럭 규칙과 정면으로 어긋나므로
**`scripts/build-app-data.mjs`에 검증을 추가하거나 필드를 신뢰하지 않도록 표시해야 한다.**

---

## 4. 갈리는 것

| 쟁점 | 주장 A | 주장 B | 판단 |
|---|---|---|---|
| **초반 바이오매스 연소기 대수** | **2대**(총 100 MW) — 4netplayers, supercraft.host | **5대** — "90 minutes to Coal" 빌드오더 | 목적이 다르다. 2대는 **필요 전력** 기준, 5대는 **재급유 주기** 기준. 연소기는 수요 추종형이라 대수를 늘려도 연료 총소모가 늘지 않으므로 **둘 다 옳다**. 앱은 "2대면 충분하고, 손이 덜 가고 싶으면 더 지어도 손해가 없다"로 함께 제시해야 한다 |
| **첫 석탄 발전소 규모** | **2대**(최소 점화) / **4대**(벨트 한 줄) | **8대**(황금비) | 셋 다 정수로 떨어진다. 2·4는 "지금 당장", 8은 "확장 단위". 다만 **8대는 파이프 Mk.1(300 m³) 한 줄을 넘긴다**(360 필요)는 함정을 반드시 함께 말해야 한다 |
| **석탄에서 연료로 넘어가는 MW 기준** | **16대 ≈ 1.2 GW** (3건 이상 독립 발언 일치) | **~5 GW** (단일 출처) | 4배 차이. 16대 쪽이 출처 수로 우세. 5 GW는 대형 공장 지향 플레이의 값으로 보인다. **앱은 1.2 GW를 기본으로 제시하고 5 GW를 상한 사례로 병기** |
| **원자력을 해야 하는가** | 필요 없다 — 로켓 연료가 더 쉽고 더 크다 (다수) | 해야 한다 — 우라늄은 발전 전용이라 다른 라인과 경쟁하지 않는다 (소수, 메가팩토리 지향) | **컨센서스 없음.** 원자력은 게임 클리어 필수가 아니다. 단, Phase 4·5의 핵 파스타가 입자 가속기(최대 1,500 MW)를 요구하므로 "전력을 어디서 대느냐"는 남는다 |
| **지열로 석탄을 건너뛸 수 있는가** | 가능 — 지열 4대면 초반 해결 (단일 출처, 2025-10-31) | 무의미 — 정상 진행 속도로 해금하면 이미 있는 발전량의 일부에 불과 (다수) | **단일 출처 vs 다수.** 앱에 정설로 넣지 마라. 카테리움 MAM 연구(고속 커넥터 100·퀵와이어 1000·모터 50)를 선행해야 성립하는 특수 루트다 |
| **전력 여유율** | 10~20% (초반 한정) | 20~30%, 또는 "사용률 75% 상한", 또는 "최대 부하 < 정상 생산" | 초반은 좁게, 중반 이후는 넓게 잡는 것으로 정리된다. **1.5배(=50% 여유)를 말한 Satisfactory 출처는 없었다** |
| **전력 저장고 개수** | 변동 부하 공식대로 (계산 근거 명확) | 생산의 50% (단일 출처, 근거 미공개) | 공식 쪽이 근거가 명확하다. 50%는 참고용 |
| **제작기 1대가 먹이는 연소기 수** | **15대**(현 wiki.gg + 게임 데이터) | 12대(GameRant) / 4대(구 wiki.gg) | **15대가 정답.** `power.md`가 "위키가 4라고 하지만 15가 맞다"고 판정했는데, 그 사이 **wiki.gg가 15로 수정됐다.** 쟁점 해소 |

---

## 5. 확인 못 함

- **"연소기 몇 대를 넘으면 관리가 지옥이 되는가"의 명시적 수치.** 어떤 출처도 상한선을 숫자로 말하지 않는다.
  자동화 경계(제작기 1대 = 15대, 벨트 Mk.1 = 15대)와 손수집 빌드오더의 실측 최대치(5대)를 대리 지표로 적었을 뿐이다.
- **티어별 "표준 공장의 소비 MW".** 어느 출처도 "Tier 5 공장은 보통 N MW를 먹는다"는 표를 제시하지 않는다.
  후기의 실측치는 10 GW 소비/40 GW 생산, 45 GW, 65 GW 등으로 **편차가 6배 이상**이라 대표값을 낼 수 없다.
  1절의 "다음 티어까지 버틴다" 표는 **발전 측 목표**이지 소비 측 실측이 아니다.
- **공식 위키의 연료 발전기 파이프 제약 표 해석.** 판독 결과가 "Mk.1 파이프라인 300 m³/분 → 발전기 10대"로 나왔는데
  산술은 **15대**(300 ÷ 20)다. 판독 오류인지 위키 표기 오류인지 원문 재확인이 필요하다.
  이 문서는 **산술값(15/30)을 채택**했다.
- **터보 연료·로켓 연료 단계의 "권장 대수".** 커뮤니티 값이 22.22대(5,555 MW), 88.89대(22,222 MW) 등
  **소수점 이하까지 있는 최적화 계산값**이라 "몇 대를 지어라"는 조언으로 쓸 수 없다. 이 단계는 대수가 아니라
  **파이프 처리량과 대체 레시피 선택**으로 규모가 결정된다.
- **외계 전력 증강기의 손익분기 60,000 MW 주장의 계산 근거.** 단일 출처이고 유도 과정이 공개되지 않았다.
- **전력 저장고의 자체 전력 소비 여부** (`power.md`에서도 미해결, 이번에도 해소 못 함).
- **우선전력 스위치의 자동 재연결 여부** (`power.md`에서 미해결, 이번 조사 범위 밖이라 손대지 않음).
- **`buildings.json`의 `powerExponent: 1.6`이 왜 1.321928이 아닌지.** 게임 배포 데이터가 legacy 필드를
  그대로 갖고 있는 것인지, 정규화 스크립트가 잘못 매핑한 것인지 확인하지 못했다. 파이프라인 점검 필요.
- **`powerShardSlots`가 전 건물 0인 이유** — 게임에는 파워 셰이드 슬롯이 존재하므로 데이터 누락으로 보이나 원인 미확인.

---

## 출처

**게임 데이터 (정본)**
- `src/data/app/buildings.json` — 발전량, 보조 자원 비율, 소비 전력, 건설 비용, 해금 티어
- `src/data/app/items.json` — 연료 에너지값(MJ)
- `src/data/app/recipes.json` — 바이오매스·연료·우라늄 체인 전체
- `src/data/app/resource-nodes.json` — 노드 수·순도 (원 출처: rockfactory/satisfactory-logistics, MIT)
- `src/data/app/milestones.json` — 석탄 동력 T3-1, 확장 동력 인프라 T4-4, 석유 발전 T5-5, 원자력 T8-2

**공식 위키 (satisfactory.wiki.gg) — 1차**
- https://satisfactory.wiki.gg/wiki/Biomass_Burner — HUB 내장 20 MW × 2, 수요 추종, 1.0 벨트 입력, 제작기 1대 = 15대
- https://satisfactory.wiki.gg/wiki/Coal-Powered_Generator — 8:3 황금비, 노드·채굴기별 발전기 수, Mk.2 파이프 13대
- https://satisfactory.wiki.gg/wiki/Fuel-Powered_Generator — 원유 노드 순도별 정제소·발전기 수 표
- https://satisfactory.wiki.gg/wiki/Nuclear_Power_Plant — 240 m³/분, 폐기물 배출률
- https://satisfactory.wiki.gg/wiki/Geyser — 간헐천 31개(9/13/9), 평균 7,100 MW
- https://satisfactory.wiki.gg/wiki/Power — 정전 조건·복구 절차, 호버팩 100 MW 미표시
- https://satisfactory.wiki.gg/wiki/Power_Storage — 100 MWh, 80% 경고
- https://satisfactory.wiki.gg/wiki/Petroleum_Coke — 코크스 경로의 효율 열위

**커뮤니티 — 규모 권장치**
- https://www.4netplayers.com/en-us/blog/satisfactory/satisfactory-tier-1-factory-expansion-energy-logistics/ (2025-09-24) — **연소기 2대, 총 100 MW**
- https://supercraft.host/article/biomass-burner-satisfactory-guide/ — 연소기 2대, 10~20% 여유, 짝지어 급유
- https://steamcommunity.com/sharedfiles/filedetails/?id=2686103223 — "90 minutes to Coal": **연소기 5대, 첫 석탄 발전기 2대**
- https://steamcommunity.com/app/526870/discussions/0/2963922521554677550/ — "보통 노드 + Mk.1 = 4대부터 보수적으로"
- https://steamcommunity.com/app/526870/discussions/0/3791506981620823399/ — **"16대"** 복수 발언, "~5 GW에서 연료로"
- https://steamcommunity.com/app/526870/discussions/0/3814039097894737812/ — 연료 발전기 10대 블록, 추출기 1 : 발전기 2 @75%
- https://steamcommunity.com/app/526870/discussions/0/4843149419128315931/ — 원자력 찬반
- https://steamcommunity.com/app/526870/discussions/0/4325125547784056738 — **전력 저장고는 바이오매스로 충전 안 됨**(개발자 Snutt)
- https://steamcommunity.com/sharedfiles/filedetails/?id=3533125237 (2025-10-31) — 지열 4대로 석탄 건너뛰기(**단일 출처**)
- https://www.thegamer.com/satisfactory-coal-generator-power-guide/ (2024-09-15) — 8:3 블록 단위 확장
- https://www.deltacalculator.com/satisfactory/coalgenerator/ — 8대 기본 레이아웃(물 추출기 4대 — 과잉)
- https://gamerant.com/satisfactory-how-automate-biomass-burners-conveyor-biofuel-layout/ (2024-09-14) — 반자동화 배치, "12대"(**미채택**)
- https://xgamingserver.com/blog/satisfactory-power-guide/ (2026) — "over-provisioned blocks" 원칙
- https://namu.wiki/w/Satisfactory/%EA%B1%B4%EB%AC%BC/%EC%A0%84%EB%A0%A5 — 발전기 2 : 추출기 1 @75%, 연소기 = "마중물"
- https://www.4netplayers.com/en/blog/satisfactory/satisfactory-nuclear-power-guide-without-waste/ (2025-12-27) — 3단 폐기물 처리

**미채택 (구버전 값)**
- satisfactory.fandom.com 계열 전반 — 연료 발전기 150 MW / 12 m³, 간헐천 18개 등 Update 8 시절 값
