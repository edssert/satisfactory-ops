# 매니폴드 vs 로드 밸런서 — r/SatisfactoryGame 원문 조사

조사일 2026-08-20. `guides-reddit.md` 가 "후보만 확보, 원문 미독"으로 남겨 둔 주제 2를 마쳤다.

**접근 경로**: `.rss` 엔드포인트(`https://www.reddit.com/comments/<id>.rss?limit=100`).
본문·`.json`·구 인터페이스·미러·헤드리스 브라우저는 전부 막힌다. 익명 RSS 는 속도 제한이 빡빡해
요청 간 12초를 두고 429 에는 지수적으로 물러선다(`scripts/fetch-reddit.mjs`).

읽은 스레드 7건:

| 날짜 | 제목 | 성격 |
|---|---|---|
| 2019-05-26 | Satisfactory Saturdays #2 - Balancers vs. Manifolds | 초기 논쟁 |
| 2022-05-14 | When it comes to manifolds vs load balancers... | 로드밸런서 옹호 가이드 |
| 2024-01-12 | Manifolds vs load-balancing... a nuclear experiment | **실측 실험** |
| 2025-05-18 | After using manifolds for 800 hours, i started load balancing | 전향 서사 |
| 2026-02-21 | My take on load balancers vs manifolds | 취향 논의 |
| 2026-02-26 | Understanding Manifolds | 초보 질문 |
| 2026-06-13 | Just discovered what manifolds are... | 반대 방향 전향 |

---

## 1. 합의된 것

**기본값은 매니폴드다.** 전향 서사 양쪽 스레드에서도 이 전제 자체는 다투지 않는다.

> "From what I understand from this debate, its been concluded that manifolds are just better,
> waste is easier to manage, easier to setup, better scaling and the 'disadvantage' of it taking
> time to start up won't matter in the long run." — u/ExperienceLast7561 (1rapbsi 본문)

**로드 밸런서가 존재하는 유일한 구조적 이유**는 기계 내부 버퍼 크기를 조절할 수 없다는 것이다.

> "Other than some edge cases the only practical reason for load balancers existing is the fact
> that we can't limit the sizes of the internal buffers in the machines." — u/RaulParson (1kpijvv)

**시작이 느린 것은 실제 손해가 맞다.** "결국 같아진다"는 말이 이 부분을 흐린다.

> "Your total production up to time T will lag behind what it would be if you had placed a
> balancer instead... whether you pre-fill a manifold (in which case the time for pre-filling
> constitutes the delay) or not." — u/MarioVX (1rew1rx)

**다만 순차 건설이면 그 손해가 사라진다.** 채굴기부터 차례로 지으면 다음 구간을 짓는 동안
앞 구간이 이미 차 있다.

> "if you build a factory incrementally from the miners, manifolds and belts are all full anyway,
> because they fill before you've built the next section." — u/WazWaz (1rapbsi)

**둘은 배타적이지 않다.** 큰 공장은 구역 단위로 밸런서, 구역 안은 매니폴드가 흔한 절충이다.

> "if you have three rows of say 8 machines, you can do first the load balancing to the three rows
> and then manifold to the 8 machines." — u/houghi (upggkw)

## 2. 로드 밸런서가 실제로 나은 경우 — 원문에서 확인된 것만

### 2-1. 원자력 (합의 수준: 강함, 실측 있음)

u/StigOfTheTrack 이 50GW 원자력 발전소를 **같은 설비로 두 번 지어 비교**했다(194rxut).

> "With this setup I can stand pretty close to the reactors with minimal radiation exposure and
> filter usage (sometimes none)... The second picture shows the same reactors but converted to
> manifold with backed-up belts and machines holding stacks of radioactive items. The recycling
> radiation zone is both larger and more intense and radiation levels around the reactors are
> higher too."

이유는 둘이다.
1. **방사능.** 매니폴드는 벨트와 기계 버퍼에 방사성 물질이 쌓인 채로 있다. 방사능 구역이 넓어지고 세진다.
2. **시작·복구 시간.** 연료봉은 생산·소비 속도가 워낙 낮아 매니폴드가 채워지는 데 오래 걸린다.
   공급이 한 번 끊겼다가 복구될 때 전력이 도로 오르는 데도 그만큼 걸린다.

> "if you run out of something, then re-establish supply, it can take a lot longer to get back to
> full power if you're using manifolds." — 익명 (194rxut)

**대안도 있다.** u/houghi 는 밸런서 대신 **선별 분배기**로 투입량을 단계적으로 올리는 방식을 쓴다 —
10%로 시작해 확인하고 늘린다(1rew1rx).

### 2-2. 열차 승강장 (단일 출처, 미검증)

> "load balancing is always necessary for loading/unloading trains... its super important for
> ensuring the train station fills/empties evenly." — u/Cblaser (upggkw)

한 사람만 말했고 반론도 없다. **`disputed` 로 두고 앱 데이터에 넣지 않는다.**

### 2-3. 초반 바이오매스 연소기 (갈림)

- 찬성: "manifolds aren't efficient for burners that don't run long stretches" — u/tar625
- 반대: "Biomass burners manifold just fine compared to nuclear. The consumption is very slow
  compared to the quantity of input." — u/GoldDragon149
- 절충: 연소기가 몇 대 안 되고 스택이 200이라 **빨리 켜지는 쪽이 더 값지다** — u/Tacitus_

**결론 없음.** 양쪽을 다 적는다.

## 3. 시작 지연을 줄이는 실전 요령 (합의)

- **청사진에 기계 버퍼를 미리 채워 저장한다.** — u/Blu_Falcon
- **상자로 초벌 급유한다.** 단계마다 마지막 기계 출력을 상자로 받아 두고, 상자 슬롯 수를
  필요한 기계 대수만큼 제한해 각 칸에 한 개씩 넣어 둔다. 다음 단계를 짓는 동안 한 스택씩 찬다. — u/JustNilt
- 유체는 인벤토리로 못 옮기므로, **포장 해제기 + 버퍼**를 초벌용 청사진으로 따로 둔다. — u/Protheu5

## 4. 이 조사가 앱에 주는 것

1. 용어집 「매니폴드」 항목에 **"로드 밸런서가 나은 경우"를 원자력 하나로 좁혀** 적는다.
   지금은 "초보의 흔한 실수" 정도로만 적혀 있다.
2. 방사능 이유는 게임 메커니즘이라 **후반 가이드의 원자력 절에 들어가야 한다.**
3. 열차 승강장 건은 `disputed` — 앱에 쓰지 않는다.
4. 초반 바이오매스는 갈리므로 **양쪽을 적고 어느 쪽도 규칙으로 만들지 않는다.**

## 5. 미확인

- 2019년 스레드(btexf7)와 최신 스레드 사이의 **여론 변화 추이** — 스레드별 점수를 RSS 로는 못 읽는다.
- 열차 승강장 밸런싱의 실제 필요성 — 반대 근거도 찾지 못했다.
- 1.0 이후 매니폴드 관련 게임 변경 — 이번 조사에서 확인된 것 없음.
