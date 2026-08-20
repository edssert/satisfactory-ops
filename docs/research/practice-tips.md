# 초반 실전 요령 조사 (Hands-on Practice Tips)

> 담당 범위: **실제로 플레이하는 동안 손에 잡히는 요령**만 다룬다 — 조작·수집, 인벤토리, 초반 전력 운용, 기지 위치, 차원 창고, 유한 자원 소비 판단.
> **진행 순서·템포·마일스톤 비용은 `docs/research/progression-route.md`와 `progression.md` 소관이라 중복 조사하지 않았다.** 유한 자원의 *총량·좌표·업그레이드 비용*은 `docs/research/exploration.md`가 이미 검증했으므로 여기서는 **"언제 쓰고 언제 아끼는가"라는 판단만** 다룬다. 전력 수치는 `power.md`가 정본이다.
> 기준 버전: **1.2**(2026-06-02 스테이블). 조사 시점: 2026-08-20.
> 수집처: r/SatisfactoryGame(게시물 permalink RSS로 본문+댓글 직접 열람), Steam 커뮤니티 가이드(HTML 직접 파싱), 나무위키 `Satisfactory/팁`(2026-08-06 최종수정), 디시인사이드 새티스팩토리 마이너 갤러리(본문 + 댓글 API). 게임 메커니즘 주장은 전부 `satisfactory.wiki.gg`로 1차 대조했다.

---

## 조사 방법과 한계 (다음 조사자를 위해 먼저 적음)

- **Reddit 접근 경로가 또 바뀌었다.** `docs/research/guides-reddit.md`가 기록한 `old.reddit.com` permalink 경로는 이제 **로그인 페이지로 302 리다이렉트**되고, `www.reddit.com/....json`은 **403**이다. 현재 유효한 경로는 두 개다:
  - 서브레딧 검색: `https://www.reddit.com/r/SatisfactoryGame/search.rss?q=...&restrict_sr=1&sort=top&t=all&limit=50`
  - **게시물 본문 + 댓글**: `https://www.reddit.com/r/SatisfactoryGame/comments/{id}/.rss?sort=top&limit=100` → 엔트리 101개(원글 1 + 댓글 100)가 서버 렌더링되어 나온다. **이 경로가 이번 조사의 주력이었다.**
  - 레이트리밋이 매우 빡세다. 응답 헤더는 `x-ratelimit-reset: 26`이라 하지만 실제로는 **70초 간격에서도 429**가 났고 **150초 간격에서 약 70% 성공**했다. 브라우저 User-Agent 필수, 백그라운드 배치 필수.
  - **RSS 댓글 엔트리에는 점수(upvote)가 없다.** `sort=top` 정렬 순서만 얻을 수 있어, 이 문서에서 "댓글 몇 점" 같은 표현은 쓰지 않았다.
- Steam 가이드는 `curl` + 브라우저 UA로 직접 받는 편이 낫다. WebFetch로 연속 요청하면 "too many requests" 페이지가 오는데 **요약 모델이 그걸 그냥 요약해서 조용히 빈 결과를 낸다**(이번에 두 번 당했다). 받은 HTML에 `too many requests`가 있는지 먼저 grep 할 것.
- 디시인사이드는 본문이 `gall.dcinside.com/mgallery/board/view/`로 바로 열리고, **댓글은 별도 AJAX**(`POST https://gall.dcinside.com/board/comment/`)다. 본문 HTML의 `e_s_n_o` 토큰을 같이 보내야 200이 온다. **핵심 답변이 댓글에만 있는 경우가 많다.**
- 나무위키는 `curl`로 정적 HTML이 그대로 나온다. WebFetch 요약은 분량을 크게 잘라먹으므로 직접 받아 파싱할 것.
- **미완료:** Reddit 게시물 15건 중 이번 회차에 본문+댓글까지 읽은 것은 11건, 검색 배치 6건은 손대지 못했다. 5절에 남겼다.

---

## 1. 여러 출처가 반복하는 것

**서로 다른 최소 3개 출처(가급적 언어권도 다르게)에서 반복 등장**했고, 게임 메커니즘 주장인 경우 위키 1차 대조까지 마친 것들이다.

| 요령 | 출처 (독립 건수) | 위키 대조 |
|---|---|---|
| **E를 꾹 누른 채 움직이면 잎·나무가 자동 수집된다.** 연타할 필요 없다 | Steam 토론 PSA(2024-09-12, Jack-o-Lantern) / Steam 가이드 *Beginner & Intermediate Quick Tips*(ApathicAlpaca, 2023) / 디시 *[노하우]그나마 쉬운 20가지 기본 팁*(2024-09-13, #10) — **3건, 3개 언어권** | 조작 요령이라 위키 항목 없음. 3건 일치로 `consensus` |
| **작업대·장비 작업장에서 스페이스를 "한 번 탭"하면 재료가 떨어질 때까지 계속 제작한다.** 꾹 누를 필요 없다 | Reddit *A list of tricks…*(2024-10-21, im-d3) / Steam *Short, Satisfying Tips*(giggles, 2024-11) / Steam ApathicAlpaca / 디시 *1.1 기준 기초 가이드 1*(2025-06-20) — **4건** | `consensus` |
| **휠 클릭(MMB)으로 바라보는 건물을 그대로 복사**해 건설 모드에 넣는다 (스포이드) | Steam *Top 7 Mistakes Newbies Make*(Prios, 2020) / Steam ApathicAlpaca / Steam *Useful tricks*(okurimono748, 2023) / 디시 20가지 팁 #04 / Reddit 댓글(CaolIla64) — **5건** | `consensus` |
| **건설 모드에서 E = 같은 계열 건물 순환, E 꾹 = 방사형 선택 메뉴.** 벨트 등급·분배기 종류를 핫바에 다 등록할 필요가 없다 | Reddit im-d3 / Steam ApathicAlpaca / Steam okurimono748 / Steam *Secrets of the User Interface*(Miles Away, 2024-09) / 디시 20가지 팁 #15 — **5건** | `consensus` |
| **N = 퀵서치. 아이템·건물·청사진 검색이 되고 계산기로도 쓴다** (오버클럭 입력창에서도 수식이 먹힌다) | Reddit im-d3 / Steam ApathicAlpaca(+"Fallen Dog 제보") / Steam giggles / Steam okurimono748 — **4건** | `consensus` |
| **달리다 C(슬라이딩) → 점프를 반복하면 그냥 달리는 것보다 빠르다.** 착지 직전 다시 C로 무한 연결. 오르막에서는 안 된다 | 나무위키 3.2·10.1 / Steam giggles("bunny rabbit method") / Steam Prios / Steam ApathicAlpaca / 디시 스타팅 가이드 — **5건** | `consensus` |
| **맨땅에 토대를 놓을 때 Ctrl을 누르면 맵 전역 그리드에 스냅된다.** 멀리 떨어져 지은 토대끼리도 나중에 정렬이 맞는다 | Steam okurimono748 / 디시 20가지 팁 #07 / 디시 *1.1 기준 기초 가이드 1* / Reddit *Waste is the highest form of efficiency*(2024-10-09) 댓글 — **4건** | `consensus`. ⚠️ **1 m 토대로 하면 안 된다** — 아래 참고 |
| **해체는 Ctrl로 최대 50개 일괄 선택, G로 "같은 종류만" 필터.** 색칠 도구에도 같은 필터가 먹는다 | 위키 `Dismantle` / 디시 20가지 팁 #16·#17 / Reddit 댓글(pingponghobo, MoscowModder) | **verified** — 위키 원문 "holding down Ctrl … up to 50 structures can be selected", "Press G … only select buildings of the same type" |
| **해체하면 자재가 100% 돌아온다.** 초반 배치는 마음대로 지어도 손해가 없다 | 위키 `Dismantle` / Steam giggles | **verified** — "returning 100% of the materials used". 예외: 배치된 휴대용 채굴기·비컨, 상자, 주행 중인 열차, 바닥에 떨어진 아이템 |
| **잎·나무를 연소기에 바로 넣지 말고 바이오매스로 가공해서 넣는다.** 열량이 6배 차이 난다 | 나무위키 10.2 / 디시 *1.1 기초 가이드 1*("잎 10개 → 바이오매스 5개, 6배 정도의 효율 차이") / Steam *A Beginner's Guide to Satisfactory* | **verified(계산 일치)** — 위키 열량표(`power.md` 재인용) 잎 15 MJ, 바이오매스 180 MJ → 잎 10개(150 MJ) vs 바이오매스 5개(900 MJ) = **정확히 6배** |
| **석탄 발전으로 넘어간 뒤에도 바이오매스 연소기를 전부 철거하지 마라.** 연소기는 유일하게 수요에 맞춰 연료를 태우므로, 평소엔 놀다가 그리드가 트립됐을 때 재시동용이 된다 | 나무위키 10.2 / Steam *Ultimate Beginner Guide*(`progression-route.md`가 이미 인용) | **verified(메커니즘)** — 위키 "The fuel consumption of Biomass Burners scales to power demand, unlike other generators" |
| **어썸 상점에서 제일 먼저 살 것은 콘크리트 토대와 사다리.** 기본 토대는 철판을 먹는데 콘크리트 토대는 안 먹는다 | 디시 20가지 팁 #12("콘크리트 토대 부터 살것(철판 안들어감)") / Reddit *PSA: Don't sleep on Mercer Spheres* 댓글 Witch-Alice("concrete foundations so iron doesn't get consumed by building roads") / 나무위키 10.1·10.4 | **verified** — 위키 `Foundation` 기본 토대 = 콘크리트 5 + **철판 2**, 콘크리트 토대 = **콘크리트 7**(철판 0). 상점가 **3쿠폰**(사다리 3쿠폰, 컨베이어 벽 구멍 1쿠폰) |
| **차원 창고(Dimensional Depot)는 1.0 최대의 QoL이고 가능한 한 빨리 여는 것이 이득이다** | Reddit *This game gets 10x as fun once you unlock dimensional storage*(2024-10-10) / *To whomever told me to put a Dimensional Depot on the feed of each of my basic items*(2025-11-26) / *PSA: Don't sleep on Mercer Spheres early game*(2024-09-12) / 디시 41395 댓글 / 디시 43375 — **5건** | 2.5절 |
| **탐험용 지도는 인게임 지도가 아니라 satisfactory-calculator 인터랙티브 맵에 세이브를 올려서 본다.** 좌표·노드·추락정 요구 부품까지 다 보인다 | 디시 *1.1 기초 가이드 0/1/2* / Steam *Beginner Tips and Tricks*(Vioria) / Steam okurimono748 / 나무위키 10.3 — **4건** | 도구라 대조 대상 아님 |

---

## 2. 주제별 상세

### 2.1 초반 조작·수집

**수집**

- **E 꾹 누르기.** 잎·덤불 근처에서 E를 누른 채 마우스를 움직이면 시야에 들어오는 것을 계속 줍는다. (Steam 토론 PSA, 2024-09-12)
- **응용(단일 출처, 미검증):** E를 누른 상태에서 Tab으로 인벤토리를 열었다 닫으면, E에서 손을 떼도 다른 행동을 하기 전까지 자동 수집이 계속된다. (같은 스레드 답글 Tk421nz — **교차검증 안 됨**)
- **전기톱(Chainsaw)은 티어2 "장애물 제거".** 반경 5 m 초목을 한 번에 벤다. 손으로 못 캐는 나무를 캘 수 있고 잎도 벤다. (나무위키 10.2 + 위키 `Chainsaw`)
  - **비용을 알고 가라:** 보강된 철판 5 + 철봉 25 + **나사 160** + 케이블 15, 장비 작업장 30회 제작. 연료는 **고체 바이오 연료 전용**(액체 바이오 연료로는 안 돌아간다), 6초에 1개 소모. (`verified`)
- **휴대용 채굴기(Portable Miner)로 0~1티어를 버틴다.** 전력이 필요 없고 **한 노드에 여러 대를 겹쳐 설치할 수 있다.** 대신 **벨트 연결이 안 되므로 손으로 비워야 한다** — ADA가 굳이 이걸 짚어줄 만큼 흔한 착각이다(나무위키 3.3).
  - 채굴량: 낮음/보통/순수 = **분당 20 / 40 / 80개** (위키 `Portable Miner`, `verified`)
  - 추천 개수는 갈린다: 디시 *1.1 가이드*와 디시 *진행 로드맵*(2026-04-08)은 **9개(철4/구리2/석회석3)**, 나무위키 3.3은 **6개 만들어 철에 4개**, Steam *A Beginner's Guide*는 "노드당 2~3개". → **"철에 4개"는 3건 일치**, 총 개수만 다르다.

**조작 요약** (표에 "다수"라고 적은 것은 1절 참고)

| 키 | 기능 | 근거 |
|---|---|---|
| E 꾹 | 수집 자동 반복 / 건설 모드에서는 방사형 건물 선택 | 다수 |
| 스페이스 탭 1회 | 작업대 무한 제작 토글(다시 누르면 중지) | 다수 |
| MMB | 바라보는 건물 복사. **청사진 해체 모드에서는 청사진 통째로 복사** | 복사 = 다수 / 청사진 통째는 Reddit 댓글(Werrf) **단일** |
| N | 퀵서치 + 계산기(`+ - * / ^`, 괄호) | 다수 |
| R | 건설 모드(기본/주프/수직) 전환, 꾹 = 휠 | 다수 |
| Ctrl | 월드 그리드 스냅 / 기존 건물에 정렬 / **기존 건물을 자리에서 교체**(벽↔컨베이어 구멍 벽, 분배기↔선별 분배기) | 스냅 = 다수 / 교체는 Reddit(CarefreeRambler·interslicer) + Steam Miles Away **2건**. ⚠️ 같은 스레드에서 **"파이프에는 쓰지 마라 — 유체 흐름이 망가진다"**는 경고가 여러 명에게서 나왔다(Yoojine 외). 벨트는 안전 |
| G (해체·색칠 모드) | 조준한 것과 같은 종류만 필터 | 위키 검증 |
| H | 장비 집어넣기 / **청사진 위치 잠금**(잠근 뒤 방향키로 넛지) | Reddit(Betonfrosch, WazWaz). Ctrl + 넛지 = 절반 넛지는 **단일**(IAmTheFatman666) |
| C | 웅크리기·슬라이딩. **웅크린 채 접근하면 해처(Hatcher)가 반응하지 않는다** | 해처 건 Reddit im-d3 + 디시 *1.1 가이드 1* **2건** |
| B | 손전등 | 나무위키·Steam |
| Alt + 휠 | 핫바 10줄 전환 | 나무위키·Steam okurimono748·Steam Prios |
| Alt + 좌클릭 | 위치 핑(멀티·맵에서도 동작) | Reddit im-d3·Steam Prios |
| **Alt + 우클릭** | **지도를 열지 않고 바라보는 곳에 스탬프.** Alt 꾹 = 이미 찍은 스탬프가 실세계에 홀로그램 기둥으로 보인다 | Reddit 댓글(bargle0, Troldann) + 나무위키 10.1 **2건**. 슬러그·하드드라이브 마킹에 직결. ⚠️ 스탬프 **최대 개수 제한**이 있다(나무위키, 수치 미기재) |
| P (포토 모드) | 망원경 대용. 멀리 있는 추락정·슬러그를 확대해 찾는다 | Steam okurimono748 **단일** |
| Tab → 화면 우측 끝 | **인게임 메모장 / 할 일 목록.** 굵게·체크박스 서식, 인벤토리를 닫아도 화면 옆에 남는다 | Reddit im-d3 + Steam Miles Away + Steam giggles **3건** |
| 건설 메뉴에서 스페이스 | 검색창으로 커서 이동 → 타이핑 후 엔터 | Reddit 댓글(Vinnie420) **단일**. ⚠️ 같은 스레드에서 "제트팩 비행 중에 하면 죽는다"는 농담 섞인 경고가 붙었다 |
| **전신주를 기존 전선에 조준해서 설치** | 전선 중간에 전신주·벽 콘센트를 끼워 넣으면 전선이 그쪽으로 재배선되며 연결 슬롯이 늘어난다 | Reddit im-d3 + Reddit *160 hours in and just learned…*(2023-03-29) 댓글(Whiptail84, triplegerms) + 디시 20가지 팁 #01 — **3건.** Update 6.0.5에 추가됐다는 댓글 증언(Cinch24) |
| **Ctrl+C / Ctrl+V** | 기계 설정(클럭 값 등) 복사·붙여넣기. **기계를 열 필요 없이** "E로 설정" 프롬프트가 뜨는 거리면 조준만으로 된다 → 설정 하나 잡고 나머지를 **지나가면서 Ctrl+V 연타**. 클립보드는 **오브젝트 종류별로 따로 기억**한다 | Steam okurimono748(기본 동작) + Reddit 125egis 댓글(ThickestRooster, 상세) — **2건.** 오버클럭 값을 붙여넣으면 인벤토리의 동력 조각이 자동 소모된다(okurimono748) |

**설정** (디시 *1.1 기준 기초 가이드 0*, 2025-06-20 — **세 항목 전부 위키로 1차 확인함**)

| 설정 | 권장값 | 이유 | 위키 대조 |
|---|---|---|---|
| 게임플레이 > **인벤토리 유지(Keep Inventory)** | **모두 유지(Keep Everything)** | 죽어도 템을 주우러 갈 필요가 없다. 더 큰 이득은 **원정 중 ESC → 재생성으로 즉시 허브 복귀**가 가능해져 왕복 시간이 사라진다는 것 | **verified.** 위키 `Settings`: Gameplay 탭의 **일반 설정**, `Keep Nothing / Keep Equipment(기본) / Keep Everything` 3택. **도전과제와 무관.** ⚠️ 위키 `Creative Mode` 문서도 같은 이름 항목을 나열해 "도전과제 영구 비활성" 서술과 겹친다 — **두 위키 문서가 상충한다.** 3절 이견 참고 |
| 게임플레이 > 알림 > **자동 저장 간격** | **1분** | 자동 저장을 불러오는 상황은 대부분 "탐험 중 실수로 죽음"이다. 5분이면 허탈해진다 | **verified.** 범위 0~120분, **기본 5분**. ⚠️ 슬롯은 **항상 3개 고정**이라 간격을 줄이면 되돌릴 수 있는 시간 폭도 줄어든다 — **어느 출처도 이 부작용을 지적하지 않았다** |
| 오디오 > 접근성 > **지향성 자막** | **켜기** | 몹은 거의 항상 여러 마리다. 안 보이는 개체의 행동이 자막으로 뜬다 | **verified.** 정식 명칭 "[Experimental] Enable Directional Subtitles", **기본값 꺼짐** |
| 컨트롤 > **홀드 투 스프린트 끄기** | 취향 | Shift를 계속 누르지 않아도 된다 | Steam giggles가 "Shift 꾹 누른 채 인벤토리를 열었다 닫으면 계속 달린다"는 편법을 본문에 적었다가, 댓글(Loucifer)로 설정에 옵션이 있다는 걸 알고 본문을 고쳤다 — **편법 말고 설정을 쓸 것** |

**고급 게임 설정(Creative Mode)은 켜면 되돌릴 수 없고 도전과제가 막힌다.** 대체 제작법 전체 해금, 머서 구체·소머슬룹 지급 등이 여기 들어 있다. (디시 *1.1 가이드 0* + 위키 `Creative Mode` — "Enabling Creative Mode disables achievements, and it cannot be disabled once enabled")

### 2.2 인벤토리 관리

- **시작 18칸 → 최대 78칸.** 확장은 대체 제작법 보상(`Inflated Pocket Dimension`, 1건당 +6칸)과 MAM 도구 벨트. (`exploration.md` 검증치 재인용)
- **초반 하드 드라이브 3개로 인벤토리 확장을 확정으로 뽑을 수 있다.** 티어2 시점에는 뽑힐 수 있는 대체 제작법 풀이 매우 작아 **주조된 나사 / 철 전선 / 인벤토리 +6칸** 셋만 남는다. 그래서 이 시점에 3개를 스캔하면 셋 다 확보된다. (디시 *1.1 기초 가이드 1* — **단일 출처지만 메커니즘상 설득력 있음**)
  - 같은 저자의 *진행 로드맵*(2026-04-08)이 조건을 붙인다: **"이 시점까지 M.A.M 연구는 진행하지 않음. 미리 진행 시 해당 대체 제작법이 생산 가능 여부와 관계없이 활성화됨"** — 카테리움·석영 등 다른 MAM 가지를 먼저 열면 풀이 커져 확정 뽑기가 깨진다는 취지로 읽힌다. **원문이 압축돼 있어 해석에 자신이 없다. 인게임 확인 필요.**
- **Shift 클릭 = 스택 통째 이동, Ctrl 클릭 = 가능한 만큼 이동.** 컨테이너·허브 단말기·우주 엘리베이터 모두 동일. (Reddit im-d3)
- **핫바는 10줄이고 건물·청사진·색상·이모트까지 등록된다.** 슬롯 비우기는 "다른 것에 커서를 올린 채 같은 숫자를 두 번". (Steam Miles Away, Reddit im-d3)
- **원정 나갈 때:** 이 시기엔 **철판·철봉·나사·전선·구리판을 각 2스택 이상** 지니고 나머지는 현장에서 작업대를 지어 만든다. (디시 *1.1 기초 가이드 2* — **단일**)
- **죽으면 사망 상자가 생기고 사라지지 않는다.** 그래서 "지금 안 쓰는 건 컨테이너에 두고 나가라"는 조언이 나온다(Steam KILASIK). 다만 위의 **인벤토리 유지 = 모두 유지** 설정을 켜면 문제 자체가 사라진다 — **두 조언은 충돌이 아니라 설정에 따라 갈린다.**
- **바닥에 떨어뜨린 아이템은 사라지지 않는다.** 컨테이너 옆에 내용물 1개를 떨어뜨려 라벨 대용으로 쓴다. (Steam giggles + 나무위키 10.3 **2건**)
- **[차원 창고 이전의 장거리 운반 요령]** 일괄 해체 시 **인벤토리를 넘치는 분량은 "마지막으로 지정한 건물" 자리에 상자로 떨어진다.** 이걸 이용해 이사를 한 번에 끝낼 수 있다 — 옮길 자재를 컨테이너들에 채워 넣고 전부 해체 대상으로 지정한 뒤, **목적지까지 걸어가서 거기 있는 토대 하나를 마지막으로 지정하고 해체**하면 짐이 목적지에 쏟아진다. (Reddit 125egis 댓글 IlyBoySwag·Kidiri90 **2명이 독립적으로 서술**, 미검증)
- 차원 창고를 열면 인벤토리 관리 자체가 거의 사라진다 → 2.5절.

### 2.3 바이오매스·전력 초반 운용

**핵심: 1.0에서 바이오매스 연소기에 컨베이어 입력 포트가 생겼다.** 위키 `Biomass Burner` History 원문: **"Patch 1.0: Biomass Burners now have a Conveyer Belt input port."** (`verified`)

- **그래서 "컨테이너에 잎·나무를 비워 넣으면 그 다음은 자동"이 성립한다.** 1.0 이전 가이드가 말하는 "연소기를 일일이 손으로 채워야 한다"는 서술은 **이 시점부터 틀렸다.**
- 1.0 출시 당일 Reddit 스레드(*This is one of the largest quality of life improvements of 1.0*, 2024-09-10)의 최상위 반응이 이것이다: **"the biggest for me is being able to auto feed the biomass burners. I don't feel like I'm in a huge rush for coal now."**(CliffDraws) — **석탄 러시의 체감 압박 자체가 줄었다**는 진술이다. `progression-route.md`의 "티어3 석탄 즉시 러시" 결론과 충돌하지는 않지만(그건 여전히 다수 의견), **1.0 이후에는 그 압박이 약해졌다는 반대 방향의 목소리가 존재한다**는 점은 기록해 둔다.

**실제 배선 (같은 스레드, TheRealBoz — 수치를 직접 검증했다)**

> 컨테이너 3개(균사·잎·나무) → 각각 제작기 1대로 **바이오매스** → 셋을 병합 → 제작기 1대로 **고체 바이오 연료** → 3분기 분배기 → 각 출구를 다시 3분기 → **연소기 9대 = 270 MW**.
> 원문 주석: "The solid biofuel constructor has a 60/min output, and a burner uses 4/min, meaning you could theoretically expand this to up to 15 burners, 450MW."

- **검증:** 고체 바이오 연료 제작기 산출 60/분 ÷ 연소기 소모 4/분 = **15대**. 위키 `Biomass Burner`도 "Each Constructor … Solid Biofuel — **15**"라고 적는다. 나무위키 8.1도 **"컨베이어 벨트 Mk.1 기준 최대 15대"**로 같다.
  - → **`docs/research/power.md`가 "위키는 4대라고 적었지만 15대가 맞다"고 남겨둔 이견은 해소됐다.** 현재 위키 본문은 15로 고쳐져 있고, 커뮤니티 계산·나무위키도 15다. **15 채택.**
  - ⚠️ GameRant *How To Automate Biomass Burners*(2024-09-14, Marc Santos)는 **"up to 12 Biomass Burners"**라고 적는다. **산술적으로 맞지 않아 채택하지 않는다.**

**허브 내장 연소기 (초반 전력의 실체)**

- 허브에는 **연소기 2대가 내장**돼 있고 **각 20 MW**다. 별도로 짓는 연소기(30 MW)보다 작지만 **연료도 그만큼 천천히 태워 효율은 같다.** (위키 `HUB` — "Each Biomass Burner produces 20 MW … they also burn fuel proportionally slower, thus are just as energy-efficient", `verified`)
- 해금 시점이 출처마다 다르다:

| 출처 | 1번째 연소기 | 2번째 |
|---|---|---|
| 위키 `HUB` | HUB 업그레이드 **2** | 업그레이드 **5** |
| 디시 *1.1 기초 가이드 1* | 업그레이드 **2** | 미기재 |
| 나무위키 3.3 | 업그레이드 **3** | 업그레이드 **6** |

→ **위키와 디시가 일치(업그레이드 2)하므로 그쪽을 채택.** 나무위키는 "업그레이드 N을 완료하면"과 "업그레이드 N 화면에서"를 세는 방식이 한 칸씩 다른 것으로 보인다.

- **연소기 1대(20 MW)에 제련기(4 MW) 몇 대를 물릴 수 있는가**도 갈린다. 디시 *1.1 가이드*는 **"20 ÷ 4 = 최대 5대, 철4 + 구리1 권장"**, 나무위키 3.3은 **"5대일 것 같지만 최대 전력에 닿으면 퓨즈가 나가므로 4대가 안정적"**. → **나무위키 쪽이 안전하다.** 실제로 `progression-route.md`가 이미 검증한 "소비가 생산에 근접하면 트립" 메커니즘과 정합적이다.

**연소기를 여러 대 두면 AFK 시간이 늘어난다 (비직관적, 나무위키 8.1 단일 출처지만 메커니즘상 성립)**

> "바이오매스 연소기는 요구하는 전력 수요에 따라 출력이 결정되기에, 1개로 충분한 수요라도 n개를 동시에 돌리면 출력도 1/n이 되어 더 오랜 시간 자동화를 돌릴 수 있다."

수요 추종은 위키로 검증된 메커니즘이므로 이 귀결은 신뢰할 만하다. **초반 전력은 "수요/공급"이 아니라 "연료라는 소모품"으로 보라**는 같은 문단의 표현이 이 조사에서 본 가장 좋은 초보 설명이었다.

**부수 수치 (전부 위키 또는 계산 검증)**

- 물 추출기 120 ㎥/분 → **동력 조각 1개로 150% 오버클럭하면 180 ㎥/분 = 석탄 발전기 정확히 4대분.** (Steam ApathicAlpaca 가이드 + `progression.md` 검증치로 계산 확인)
- 파이프 Mk.1 한계 **300 ㎥/분**이라 석탄 발전기 8대(360 ㎥/분)는 **파이프 라인을 반드시 둘로 쪼개야 한다.** (디시 *1.1 기초 가이드 2* + Steam Vioria 가이드 **2건 일치**)
- 지능형 도금판 50개는 **50% 언더클럭한 조립기 기준 고체 바이오 연료 40개**(또는 바이오매스 100개)로 만들어진다. (나무위키 8.1 **단일**, 미검증)
- **퓨즈가 나가는 도전과제가 있다.** 1.0 이후 연소기 자동 급유 때문에 오히려 퓨즈가 안 나가서, 튜토리얼 중에 일부러 잎 1장만 넣고 터뜨려 도전과제를 챙기는 사람이 있다. (Reddit 1fdsddz 댓글 다수 — 재미 요소지만 실제 행동)

### 2.4 허브·기지 위치, 언제 옮기는가

**"첫 기지를 영구화하지 말라"는 결론은 `progression-route.md`가 이미 4개 출처로 확정했다.** 여기서는 그 위에 얹을 수 있는 **구체적인 것만** 적는다.

- **허브는 아무 데나 지어도 된다. 해체·재설치가 자유롭다.** 튜토리얼 동안은 손 제작이 많으므로 ADA 조언대로 **철 노드 바로 옆**에 지어 동선을 줄이는 게 낫다. (나무위키 3.2)
- **디시 *1.1 기초 가이드 0*는 "지도가 열리면 이사 가라"를 전제로 깔고, 숙련도별 시작 지역을 나눈다** (2025-06-20, 조회 18,513):

| 대상 | 추천 | 이유 (원문 요지) |
|---|---|---|
| 완전 초보 | **초원(Grass Fields)**, 아무 데나 | "지도도 안 열린 상황에서 위치 추천해봐야 못 찾아간다." 지도가 열린 뒤 두 후보 중 하나로 이사 — ① 자원량은 애매하지만 북쪽 석탄이 가까운 자리, ② 자원 많고 순수 석탄 + SAM 노드가 붙어 있어 3~4티어까지 좋지만 석탄 발전 가기가 번거로운 자리 |
| 3~4티어 경험자 | **북부 숲(Northern Forest)** | "역사와 전통". 다만 너프를 연달아 먹어 카테리움 보통 노드 하나만 남고 석탄·황·석영 순수 노드를 전부 잃었다. **"여기서 엔딩까지 보는 건 추천하지 않는다 — 중후반 자원 수급이 너무 구리다"** |
| 5~6티어 경험자 | **1.0 이후 뜬 핫스팟**(원문은 지도 이미지로만 표시) | 거의 모든 자원을 순수로, 멀지 않은 거리에서. 물도 매우 가깝고 많다 |
| 멀티플레이 | **사구 사막(Dune Desert)** | "멀티는 사람 수만큼 자원이 더 든다." 기본 자원이 풍부한 곳이 맞다 |

- **디시 *공략) 뉴비들을 위한 스타팅 가이드*(2023-12-04)의 4개 시작 지역 난이도 평가** — 위 가이드와 독립된 출처이고 결론이 대체로 겹친다:
  - **초원**: 초반 ★ / 후반 ★★★. 넓고 노드가 많지만 "다 보통이거나 썩어 있고" 후반 자원이 멀다
  - **바위 사막**: 초반 ★★ / 후반 ★★. "전부 장점이 단점" — 다 어중간. 단 **석탄과 석유 접근성이 아주 좋고 가는 길도 평지**
  - **북부 숲**: 초반 ★★★★★("뉴비 환불 스타팅") / 후반 ★★★. 자원이 거의 순수, 나무가 많음. 대신 "길이 복잡한데 몹이 사방에서" + 부지가 좁다
  - **사구 사막**: 초반 ★★★★ / 후반 ★★★. 토대로 덮으면 **고도 40 m에 1.5 km × 1.5 km 평면**을 만들 수 있다. 다만 혼자 하면 노동력이 끝이 없고 물이 좀 멀다
  - ⚠️ **두 출처 모두 개인 평가이며 순도·개수를 수치로 대지 않았다.** `exploration.md`가 지적한 대로 **1.2의 월드 시드/노드 랜덤화 옵션을 켜면 이 평가는 전부 무효**다.
- **석탄 발전소 부지는 "석탄이 있는 곳"이 아니라 "물이 넉넉한 곳"으로 잡는다.** 근거: 벨트는 아무리 길게 끌어도 건설 자원만 쓰고 끝이지만, 파이프는 흐르는지 계속 확인해야 하는 물건이라 **파이프 구간을 최소화하는 게 이득**이다. 그리고 **수면보다 아주 조금만 높게** 지어라 — 헤드리프트 때문. (디시 *1.1 기초 가이드 2* **단일 출처지만 유체 메커니즘상 타당**, `fluids.md` 참고)
- **가는 길에 토대를 깔아 길을 만들어 두라.** 나중에 다시 갈 때도, 자원을 끌고 올 때도 그 토대를 그대로 쓴다. (디시 *1.1 기초 가이드 2*)
- **월드 그리드 스냅은 2 m 또는 4 m 토대로 해야 한다.** Reddit *Waste is the highest form of efficiency*(2024-10-09) 댓글: **1 m 토대는 Ctrl 스냅 시 수직으로 0.5 m 어긋날 수 있고, 2 m·4 m는 같은 높이 그리드에 맞으므로 나중에 위아래로 이어붙일 수 있다.** ("off by 0.5m, so you can't fix it.. at all" — Droidatopia·XsNR **2명**, 다만 templar4522는 **"최근에 고쳐진 것 같은데 시험해볼 용기가 없다"**고 단다 → **1.2 기준 미검증**). 디시 *1.1 기초 가이드 1*이 **"토대 높이는 보통 2미터를 추천"**이라 한 것과 결론이 같다
  - **이미 어긋나게 지어버렸다면** SCIM(satisfactory-calculator 인터랙티브 맵)에 세이브를 올려 해당 구역을 선택하고 **"align to world grid"**를 쓸 수 있다. 선택 범위가 크면 사이트가 멈춘다는 경고가 붙는다. (Reddit 댓글 Dialkis **단일**)
- **"한곳에 다 몰지 마라"는 별개의 다수 의견이다.** 나무위키 10.6, Steam ApathicAlpaca("gigafactories have their merits but you want to start with separate production buildings"), Reddit *1.0 Tips for the easily overwhelmed*(2024-10-03)가 각각 같은 말을 한다. 특히 마지막 글의 도입부는 실제 사례다 — **친구가 초원 전체를 콘크리트로 덮고 나서 그 규모를 보고 게임을 접었다.**

### 2.5 차원 창고(Dimensional Depot)를 초반에 어떻게 쓰는가

**먼저 메커니즘 (전부 위키 1차 확인, `verified`)**

| 항목 | 값 |
|---|---|
| 정체 | **입력 전용**이다. 눈에 안 보이는 가상 창고가 있고, 짓는 건물(`차원 창고 업로더`)은 그 창고에 넣는 **투입구**일 뿐 — 출력이 없어 **이걸로 자동화는 못 한다** (디시 41395 댓글, 원문 그대로) |
| 용량 | **아이템 종류당** 기본 1스택 → 연구로 2/3/4/**5스택**. **한 덩어리를 나눠 쓰는 게 아니다** |
| 업로드 속도 | **업로더 1대당** 15/분 → 30 → 60 → 120 → **240/분** |
| 업로더 | 컨베이어 **입력 1개**, 내부 버퍼 **1스택** |
| 쓸 수 있는 곳 | **빌드 건(건설)**, **작업대·장비 작업장 제작** — 인벤토리로 옮기지 않고 바로 쓴다 |
| **못 쓰는 곳** | **MAM 연구**, 무기 자동 재장전, **허브 단말기·우주 엘리베이터 납품** |
| 해금 | MAM 외계 기술 트리. 연구 비용 **머서 스피어 1 + SAM 플럭추에이터 10~11**, 업로더 **1대 제작**에 **머서 스피어 1 + 플럭추에이터 10 + 모듈식 골조 10 + 와이어 100**. ⚠️ 위키 `Dimensional_Depot_Uploader`가 연구 비용을 "11"로, `Mercer Sphere`(=`exploration.md` 인용치)가 "10"으로 적어 **1개 차이가 난다** — 앱 데이터에 넣기 전 확인 필요 |

**⚠️ 가장 중요한 함정:** 위키 원문 — **"In order to complete any research nodes the unlock requirement MUST be in your Inventory and NOT just only in your Dimensional Depot Uploader."** MAM 연구 재료는 차원 창고에 있으면 안 되고 **인벤토리에** 있어야 한다.

**언제 열 수 있는가**

- SAM 플럭추에이터 연구가 **재생 SAM 10 + 강철 파이프 100 + 와이어 200**을 요구하므로 **강철(티어3 기본 철강 생산) 이후**가 현실적인 하한이다. (위키 `SAM Fluctuator`, `verified`)
- 플럭추에이터 자동 생산은 제조기(티어4~5)가 필요하지만 **작업대 손 제작이 가능하다.** Reddit(TheManyMilesWeWalk, 2025-11): *"You can't automate the fluctuators until phase 3 with manufacturers but you can craft them manually from basic steel production onwards — Unlock the depot and get steel pipes, wire and reanimated SAM uploaded and you can craft them as you search for spheres."* → **강철 파이프·와이어·재생 SAM을 먼저 차원 창고에 올려두고, 머서 스피어를 주우러 다니는 동안 현장에서 손으로 플럭추에이터를 찍는다.** 부트스트랩 경로가 명확하다.
- 디시 *진행 로드맵*도 **티어4에 차원 창고를 배치**한다: SAM 노드에 채굴기 → 재생 SAM 자동화 → 그 컨테이너 위에 업로더, 그리고 석영 공장 결과물(석영 수정·이산화규소) 2개에도. 그 뒤 **"이후 생산하는 물품들이 저장되는 컨테이너 상단에 전부 설치."**
- 디시 *1.1 기초 가이드 2*의 평가: **"업그레이드가 하나도 안 된 차원 창고는 아이템 종류당 1스택, 15/분이라는 환장할 수용 능력을 가진다. 3~4티어에선 어디까지나 보조적인 물건이다."** — **초반에 무리해서 여는 것보다 업그레이드를 몇 단 올리는 게 실질 이득**이라는 뜻이다.

**무엇을 먼저 올리는가 — 출처가 겹치는 목록**

| 우선 | 아이템 | 근거 |
|---|---|---|
| 1군 (건설 재료) | **콘크리트, 철판, 철봉, 전선, 케이블, 보강된 철판** | Reddit 1p7fs3z 원글("pipes, beams, plates, rods, concrete, Alclad, wire, cable, plastic, rubber") / jeu.video 가이드 / Steam *Targets for building supplies*(DK, 2021)의 "Cat1 벌크" 목록과 거의 동일 / 나무위키 10.3의 "건축 — 철판, 철봉, 전선, 케이블, 보강된 철판, 회전자, 모터…" — **4건 일치** |
| 2군 | 강철 파이프·강철 빔, 포장된 산업용 빔 | 위와 동일 출처들 |
| 특수 | **재생 SAM / 석영 수정 / 이산화규소** — 현장 자동화 후 바로 올려두면 나중에 편하다 | 디시 *진행 로드맵*·*1.1 기초 가이드 2* |
| 손으로 올릴 것 | **무기·탄약·회복 아이템·전기톱 + 고체 바이오 연료** | Reddit 1g0svil 댓글(Nefai) **단일** |

**실전 배선·운용 요령 (Reddit 3개 스레드 + 디시 댓글)**

- **업로더는 저장 컨테이너 위에 올려서 컨테이너를 버퍼로 쓴다.** 생산 라인에서 분배기로 갈라 컨테이너 → 업로더 순. 이러면 **차원 창고가 가득 차도 생산 라인이 막히지 않는다.** (Reddit 1feq56i 원글 + 1g0svil 여러 댓글 + jeu.video **3건**)
- **업로더 1대에 여러 종류를 섞어 넣지 마라.** 한 아이템이 상한에 닿는 순간 벨트가 막혀 **뒤에 있는 다른 아이템도 못 들어간다.** (Reddit 1feq56i 댓글 agitatedandroid — 원문: *"the belt will clog on the 101st iron plate and your iron rods won't go through"*. 위키도 "ill-suited for configurations which attempt to upload more than one item type per single Uploader"로 같은 말을 한다 — **verified**)
- **속도는 업로더 단위이므로, 많이 쓰는 아이템에는 업로더를 여러 대 붙인다.** (Reddit 1feq56i 댓글 LegoBanana1 + 1g0svil 댓글 다수 + 디시 41395 댓글 **3건**)
  - 실측 진술: **콘크리트는 240/분 업로더 8대로도 부족할 때가 있다**(Reddit Elmindra) / **"거의 모든 아이템은 1대로 충분한데 콘크리트만 예외"**(같은 댓글) / 디시 41395 댓글도 **"콘크리트·전선처럼 대량으로 쓰는데 스택이 커서 넣는 데 한세월 걸리는 것, 강철 빔·알루미늄 판처럼 자주 쓰는 것은 2대"**
- **초반에는 스택 확장보다 속도 업그레이드가 체감이 크다.** (Reddit 1feq56i 원글: *"Stack size is less important unless you're building a lot all at once, its the speed upgrades that seems to make the most difference"* + 디시 43375: **"3단계 정도 업글해도 충분히 쓸만해(3배 창고, 속도)"** — **2건**)
- **탐험 중에 주운 것을 차원 창고에 던져 넣어 인벤토리를 비운다.** 특히 **추락정에서 나온 부품을 넣어 두면, 다른 추락정이 그 부품을 요구할 때 그 자리에서 꺼내 문을 열 수 있다.** (Reddit 1g0svil 댓글 Nefai **단일**, 매우 구체적)
- **자주 쓰는 것은 핀 고정.** 목록 상단에 뜬다. 핀 추천 대상은 **탄약·필터·회복·연료**. (Reddit 1g0svil 댓글 Nefai·jeo123 **2건**. ⚠️ 같은 스레드에서 **"목록 정렬은 안 된다"**는 불만이 반복 등장)
- **인벤토리의 반쯤 찬 스택 위로 차원 창고 스택을 드래그하면 딱 채워지고 나머지는 창고에 남는다.** (Reddit Nefai / 위키도 "Transfers to partial stacks refill them automatically" — **verified**)
- **쿠폰 벌이와 결합:** 장비 작업장에서 **손으로만 만들 수 있는 장비**가 쿠폰 효율이 좋다(초반 **외계 파쇄기 17,800점**). 인벤토리를 비우고 **재료를 차원 창고에서 공급받게 해 둔 채** 스페이스 탭으로 무한 제작을 걸고 자리를 뜨면 된다. ⚠️ 외계 박멸 장치는 **차원 창고에 5개밖에 안 들어가지만 저장 컨테이너에는 24개**까지 들어가므로, 컨테이너 → 업로더로 데이지 체인을 걸어야 끊기지 않는다. (나무위키 10.11 **단일 출처, 미검증** — 숫자를 앱에 넣기 전 인게임 확인 필요)

**흔한 오해:** *"창고 전체가 1스택인 줄 알고 티어7~8까지 안 썼다"* — Reddit 1p7fs3z 원글 작성자 본인의 고백. **"아이템 종류마다 1스택"**이다. 디시 41395도 정확히 같은 질문("엔더상자마냥 통합 창고인가?")으로 시작한다. → **앱에서 이 오해를 먼저 깨주는 게 값어치가 있다.**

---

## 3. 유한 자원을 언제 쓰고 언제 아끼는가

> 총량·좌표·업그레이드 비용은 `docs/research/exploration.md`가 검증했다. 여기서는 **소비 판단**만.

### 3.1 파워 슬러그 / 동력 조각

| 판단 | 내용 | 출처 |
|---|---|---|
| **초반에는 거의 쓰지 마라** | "이 단계에서는 꼭 필요한 지점을 제외하곤 오버클럭 하지 않는 걸 추천한다. **오버클럭으로 인한 생산량 증가보다 늘어나는 전력 소모량이 크다.**" | 디시 *1.1 기초 가이드 2* |
| **정량 근거** | 전력 = 기본 × (클럭%/100)^**1.321928**. 즉 생산 150%에 전력 **170%**, 200%에 **250%**, 250%에 **335%**. → **250% 오버클럭은 100% 기계 2.5대보다 전력을 34% 더 먹는다.** 반대로 40% 언더클럭은 전력을 70% 아낀다 | 나무위키 5.1. **지수는 `power.md`가 이미 검증했다**(1.321928, Patch 0.7.0.0에서 1.6 → 1.321928 변경). 나무위키 표기 `1.321925`는 끝자리 오타로 보인다 — **`power.md` 값을 정본으로 쓸 것.** ⚠️ **발전기는 예외로 오버클럭이 완전 선형**이므로 같은 식을 쓰면 안 된다(`power.md` 9절) |
| **그럼에도 쓴다면 채굴기·추출기에 먼저** | 노드 산출에는 상한이 있고 **그 상한을 뚫는 유일한 수단이 오버클럭**이다. 조립기·제작기는 그냥 한 대 더 지으면 된다 | 나무위키 10.5 / jeu.video 오버클럭 가이드 / GameRant / diamondlobby — **4건 일치** |
| **구체적 첫 사용처** | **물 추출기 1대를 150%로** → 180 ㎥/분 = 석탄 발전기 정확히 4대분 | Steam ApathicAlpaca (수치는 계산으로 검증) |
| **소수점 맞추기용** | 분당 요구치가 37.5 같은 애매한 값일 때 언더클럭으로 맞춘다. 소수 넷째 자리까지 설정되지만 **부동소수점 문제 때문에 셋째에서 올림해 둘째까지만 쓰는 게 안정적** | 나무위키 10.5 **단일** (이 저장소의 `Math.ceil(x - 1e-9)` 규약과 같은 문제) |
| **아껴야 하는가?** | **길게 보면 아니다.** 티어9 합성 파워 샤드로 무한 생산이 가능해진다. "나중가서 직접 생산이 가능하니 **보이는 거 줍는 정도만** 해도 충분하다" | 디시 *1.1 기초 가이드 2* + `exploration.md` 검증치 |
| **단, 샤드로 바꾸기 전에 소머슬룹을 먼저** | 슬러그 → 샤드 변환은 제작기에서 하므로 **소머슬룹을 꽂은 제작기로 변환하면 샤드가 2배**가 된다 | 디시 43375("달팽이는 꼭 서머슬롭을 이용해서 2배로 뽑아먹어") + 나무위키 5.x + `exploration.md`(2,650 → 5,300) — **3건** |

### 3.2 소머슬룹

| 판단 | 내용 | 출처 |
|---|---|---|
| **초반 목표치** | **4개면 이 단계(티어3~4)에는 충분하다.** "대충 지도 보고 할만하다 싶으면 줍고 아니면 깔끔하게 포기해라" | 디시 *1.1 기초 가이드 2* |
| **초반 최고의 사용처** | **우주 엘리베이터 부품을 만드는 조립기.** 페이즈 2(지능형 도금판 1,000 / 다용도 골조 1,000 / 자동 배선기 100)에서 산출이 2배가 되므로 **필요 재료가 반으로 준다** | 디시 *1.1 기초 가이드 2* — 원문: "우리에겐 합법 치트키 소머슬룹이 있다 … 필요 재료가 반으로 줄어든다" |
| **전제 조건** | **전력 4배 페널티**를 감당할 수 있어야 한다. 같은 가이드가 **석탄 발전기를 8대 → 16대로 먼저 확충하라**고 하는 이유가 이것이다 | 동일 |
| **"4개"가 왜 4개인가 (교차 계산)** | 조립기는 증폭 슬롯이 **2개**이고 전력 배수는 `(1 + 채운슬롯/전체슬롯)²`이므로, **산출 2배 = 슬롯 2개를 다 채워야 하고 그때 전력이 4배**다. 즉 **소머슬룹 4개 = 우주 엘리베이터 부품 조립기 2대를 만충 증폭**한다는 뜻이다. 제련기·제작기는 슬롯이 1개라 **1개로 2배**가 된다 | `exploration.md`의 위키 검증치(슬롯 수·배수 공식)로 이 조사가 직접 계산. **디시 가이드의 "4개"와 정확히 맞아떨어진다** |
| **일반 원칙** | **생산 체인의 중간이 아니라 끝에** 넣는다 | 위키 `Production amplifier` / satisfactory.guru — `exploration.md` 검증치 |
| **초반 대안 사용처(단일 출처)** | 고체 바이오 연료 제작기에 꽂아 바이오매스 발전 총량을 늘리기 | Facebook 그룹 인용(검색 스니펫) — **원문 미확인, 채택 보류** |
| **쿠폰 벌이** | 외계 단백질·외계 DNA 캡슐 제작기에 꽂으면 **총 4배**의 DNA 캡슐 | 나무위키 10.11 **단일** |
| **주의(단일 출처, 1.1 기준)** | 일부 레시피에서 생산 증폭을 쓰면 **생산 → 정지 → 반출 → 재개** 사이클이 생겨 실질 분당 생산량이 크게 떨어지는 버그가 있다. 건물 내 유체 저장 한도 50 ㎥를 넘기는 조합(이온화 연료 + 최대 오버클럭 + 증폭)에서 발생 | 나무위키 6절 — **1.2에서 고쳐졌는지 확인 못 함** |

### 3.3 머서 스피어 / 차원 창고

| 판단 | 내용 | 출처 |
|---|---|---|
| **초반 목표치** | **20개** 정도면 티어3~4 구간에는 충분 | 디시 *1.1 기초 가이드 2* |
| **엔딩까지** | **"대충 150개 정도만 주워도 엔딩까진 충분. 심심하면 다 주워도 된다"** (총 298개) | 동일 |
| **아껴야 하는가?** | **아니다.** "머서구체 생각보다 존나 넘쳐남", "풀업글 + 건축에 쓰이는 모든 재료 창고 할당하고도 조금 남는다더라", "연구에 98개 쓰고 나머지는 창고용인데 널널하다" | 디시 41395 댓글 3건 / Reddit *PSA: Don't sleep on Mercer Spheres* 댓글(GerardBrouillard: "레이더 타워 하나 반경에 33개 뜨더라, 별로 안 걱정") — **4건 일치** |
| **⚠️ 반대 신호** | 같은 Reddit 스레드에 **"업그레이드 트리를 보니 엄청 많이 필요할 것 같은데 충분할지 모르겠다"**(Far_Function7560)는 반응도 있다. 다만 후속 댓글들이 "300개쯤 있다"로 정정하는 흐름 | Reddit 1feq56i |
| **판정** | **`exploration.md`의 산술(298 − 98 = 200개 여유)과 커뮤니티 체감이 일치한다. "아껴 쓰라"는 조언은 근거가 약하다.** 앱에서는 "충분하다"로 안내해도 된다 |

### 3.4 하드 드라이브

| 판단 | 내용 | 출처 |
|---|---|---|
| **초반 목표치** | 티어2에 **3개**(확정 3종), 티어3 후반에 **5~8개** | 디시 *1.1 기초 가이드 1·2* |
| **미청구 보관 = 풀 필터** | **두 선택지 모두, 고르기 전까지 풀에서 제외된다.** 그래서 마음에 안 드는 드라이브를 청구하지 않고 쌓아두면 쓰레기 레시피를 묶어둘 수 있다 | Reddit 1feq56i 댓글(ajdeemo, Linesey — Linesey는 실제로 8개를 미청구로 쌓아두고 운용 중이라 진술) + 위키 "Storing multiple Hard Drives in the library narrows down the pool" — **verified**, `exploration.md`와도 일치 |
| **세이브 스컴이 되는 지점** | **스캔을 누른 순간 두 선택지가 고정**되므로 완료 직전에 저장하고 반복 로드하는 건 **무의미**하다. 반면 **재스캔(리롤)은 버튼을 누른 순간 결정**되므로, **리롤 직전에 저장하면 원하는 게 나올 때까지 반복**할 수 있다 | 디시 *1.1 기초 가이드 1* + Reddit 1feq56i 댓글(RMHaney: "save before rerolling a drive … It's significantly faster (ie instant) than the previous iteration of HD savescumming") — **2건, 언어권 다름, 서로 정확히 일치** |
| **우선 순위** | **나사를 다른 자원으로 대체하거나 덜 쓰는 레시피 우선.** "나사는 컨베이어 벨트를 포화시키는 주범" | 나무위키 10.8 + 디시 *1.1 기초 가이드 1*("주조된 나사 … 나중가서 이 레시피 뽑아봐야 꽝이다") — **2건** |
| **MAM 철거 트릭** | 하드 드라이브를 주운 **바로 그 자리에서 MAM을 짓고 스캔을 건 뒤 MAM을 철거해도 연구는 계속 진행된다.** 10분 뒤 아무 MAM에서나 받으면 된다. 어썸 싱크 포인트도 여러 대가 공유 | 나무위키 10.8 + Steam okurimono748 + 디시 *1.1 기초 가이드 1*("mam은 전력을 소비하지 않고 모든 mam은 진행 상황을 공유") — **3건**. 위키도 "If all MAMs are dismantled, the research will still progress internally and will not pause", "Multiple MAMs … all share the same UI and research progress" — **verified**. ⚠️ 단 **"MAM이 전력을 소비하지 않는다"는 부분은 위키에 서술이 없어 미검증**이다 |
| **1.0에서 바뀐 것** | 선택지가 **3개 → 2개 + 리롤 1회**로 바뀌었다 | **verified.** 위키 `Hard Drive` 패치노트 원문: "Each Hard Drive now only gives two Alternative Recipe options instead of three. Each Hard Drive can be 'rerolled' once". → **`progression-route.md`가 "미해결"로 남긴 2 vs 3 쟁점은 모순이 아니라 버전 차이였다.** "3개"라고 적은 자료(예: Steam Vioria 가이드, 2020년 원본)는 전부 1.0 이전 기준 |

### 3.5 추락정(크래시 사이트) 여는 요령 — 유한 자원은 아니지만 같이 묶임

- **전력을 요구하는 추락정**은 근처에 **바이오매스 연소기를 `필요 MW ÷ 30` 올림 개수**만큼 짓고 잎을 넣은 뒤 전선을 연결해 열고, 하드 드라이브를 챙긴 다음 **전부 해체**하면 최소 자원으로 끝난다. (디시 *1.1 기초 가이드 1*, 스크린샷 포함 — **단일 출처지만 절차가 구체적**)
  - **대안(나무위키 10.8, 단일):** 전력 저장소의 방전률이 사실상 무제한인 점을 이용해 **전력 저장소 + 연료 발전기 + 포장기 + 연소기 각 1대**로 충전해 두고, 저장소만 남겨 추락정에 연결한다. 철봉 소모가 적다
- **적 리젠 방지(나무위키 10.8, 단일):** 힘들게 싸워 확보했는데 부품이 없어 못 열 때, **연소기 + 전신주를 세우고 연료를 넣어두면** 소비 전력 0이라 연료는 안 줄지만 "전기가 공급되는 지역"으로 인식돼 **적이 리젠되지 않는다**. 단 추락정에는 전선을 연결하면 안 된다. → **미검증. 재미있지만 앱에 넣기 전 인게임 확인 필요**
- **1.1부터 하드 드라이브 회수 후 크래시 사이트를 통째로 해체해 자원을 회수할 수 있다.** (`exploration.md` 검증치)
- **추락정 근처에 떨어져 있는 부품이 초반 살림에 크다.** Reddit 1feq56i 댓글에서 **"티어1에 슈퍼컴퓨터와 회전자 50개를 주웠다"**, **"보강된 철판 80개"**, **"석탄 발전 전에 터보 모터 뭉치를 주워 어썸 싱크에 넣고 즉시 70쿠폰"** 같은 진술이 이어진다 — **탐험은 티어를 건너뛰는 수단**이다

---

## 4. 하지 말 것 / 시간 낭비 / 흔한 후회

`progression-route.md`가 이미 확정한 6가지(첫 기지 조기 영구화, 손 제작 장기화, 500 m 벨트 스파게티, 전력 여유 없이 운영, 완벽주의 재시작, 청사진 Mk.1)는 **반복하지 않는다.** 아래는 이번 조사에서 새로 확인한 것만.

**다수 출처(2건 이상)**

1. **벨트를 무조건 상위 등급으로 갈아엎기.** Steam *Top 7 Mistakes*(Prios)가 스크린샷으로 반박한다 — 나사 제작기는 철봉을 분당 10개밖에 안 먹으므로 Mk.1(60/분)로 이미 넘친다. **뒤에 있는 기계가 60/분 넘게 밀어주지 않는 한 벨트 업그레이드는 아무 효과가 없다.** 나무위키 10.5도 "Mk 레벨마다 분당 운반량 제한을 반드시 확인"으로 같은 말을 한다. (**2건**)
   - 관련 소수의견(나무위키 10.3, 단일): **벨트는 1·3·5티어만 쓰는 게 편하다** — 2티어(보강된 철판), 4티어(포장된 산업용 빔)보다 1(철판)·3(강철 빔)·5(알클래드 알루미늄 판) 재료가 양산이 쉽기 때문
2. **발전기를 전력망마다 따로 나누기.** Steam Prios: "여러 개의 분리된 전력망을 만들어 관리 지옥에 빠지는 초보가 많다. **다 하나로 묶으면 용량이 합산된다.**" + 같은 글의 부록 — **"발전기를 더 짓기를 두려워하는 것이 숨은 8번째 실수다. 발전기가 많으면 각자가 더 천천히 태울 뿐 낭비되는 건 없다."** 나무위키 8.1도 같은 논리를 편다. (**2건**, 바이오매스 연소기의 수요 추종 메커니즘으로 검증됨)
   - ⚠️ **정반대 조언도 있다.** Steam KILASIK 가이드는 **"전력망을 나눠라 — 하나로 묶으면 기계 하나가 퓨즈를 터뜨렸을 때 공장 전체가 꺼진다"**고 한다. → **초반(연소기)에는 합치는 게 맞고, 규모가 커지면 나누는 게 맞다**는 시점 차이로 읽는 게 타당하다. 이 문서의 다른 출처들도 "전력 스위치를 나중에 우선전력 스위치로 교체"(디시 진행 로드맵, 티어6)처럼 **후반에 분리**를 전제한다
3. **분배기·병합기를 벨트 중간에 놓으려다 실패하기.** 벨트를 **정확히** 조준해야 한다. 요령은 **벨트 위에 올라서서 내려다보기** — 벨트는 정중앙을 밟았을 때만 사람을 밀기 때문에 **가장자리에 서면 안 밀린다.** (Steam Prios + Steam ApathicAlpaca **2건**)
4. **트럭·차량에 초반 투자.** 디시 *1.1 기초 가이드 2*는 아예 **가이드 전체에서 운송 수단을 하나도 안 쓴다**고 선언한다: **"벨트는 전력을 안 먹고 한번 이어주면 아무 문제 없이 안정적이다. 다른 운송수단은 연료·전력을 먹는데 툭하면 고장나거나(차량/철도) 운송량이 매우 적어(드론) 가성비가 먹튀 수준이다."** Steam ApathicAlpaca도 "vehicular exploration is dead … 트럭 정거장은 경로를 직접 녹화해야 해서 귀찮다. 벨트가 더 쉽고 빠르다." (**2건**, `progression-route.md`의 기존 판단과 정합)
   - ⚠️ **트랙터 평가는 여전히 갈린다.** Steam KILASIK은 **"트랙터는 쓰지 마라, 충돌 판정이 이상해서 성층권으로 날아간다"**고 하고, `progression-route.md`가 인용한 *Ultimate Beginner Guide*는 **"트랙터는 나쁘지 않다"**고 한다. **미해결**

**단일 출처지만 구체적이라 기록**

5. **생산 라인을 원료 → 완제품 순서로 짓기.** 디시 *[팁] 뉴비/초보 초반 필수 팁*(2024-09-18): **"철괴 → 중간단계 → 결과물 이렇게 하지 말고 반대로 결과물 → 중간단계 → 철괴로 지어라."** 이유가 명확하다 — "대부분의 사람은 머리 속에 10개 이상의 숫자와 3가지 이상의 종류가 뒤섞이면 제대로 된 생각을 못 한다. 그러다 플탐 3시간 찍고 접고 두 번 다시 안 온다."
6. **티어2에 보강된 철판·회전자·모듈식 골조까지 자동화하기.** 디시 *1.1 기초 가이드 1*: **"이 부품들은 나중에 더 좋은 대체 레시피를 얻어서 자동화하는 것이 효율적이고, 지금 단계에선 얘네까지 자동화하면 필요한 전력을 감당할 수 없다."** 같은 저자는 티어3의 조립기 자동화도 **"어차피 4티어 초반에 다 갈아엎어야 하므로 나는 안 한다"**고 한다
7. **파이프를 Ctrl로 제자리 교체하기.** Reddit 1g8ui9f 댓글(Yoojine): 벨트와 달리 **유체 흐름이 망가지고, 어느 구간이 문제인지 찾으려면 파이프라인 전체를 감사해야 한다.** 여러 명이 같은 경험을 보고
8. **파이프 용량을 100% 쓰기.** 역류 때문에 **10% 정도는 여유로 남겨야 한다.** (디시 *1.1 기초 가이드 2*)
9. **펌프를 한계 거리(20 m / 50 m)에 딱 맞춰 짓기.** **18 m / 48 m 안쪽**으로 촘촘히 — "모종의 이유로 유체가 거기까지 안 올라가는 경우가 생각보다 자주 발생한다." (나무위키 10.3)
10. **대체 제작법을 새로 얻었다고 기존 공장을 뜯기.** Reddit *Waste is the highest form of efficiency*(2024-10-09, mikerayhawk): **"안 뜯고 그냥 계속 돌게 두면서 다른 데다 새 공장을 지으면 된다. 노동력 절반에 공장 두 배다."** 이유가 게임 설계에 있다고 본다 — 자원 노드가 무한하고 넓은 맵이므로, **개발진은 건물을 제자리 업그레이드하게 만들지 않았다.** 특히 초반에는 **어설픈 공장을 여기저기 흩뿌리는 쪽이 하나를 계속 재최적화하는 것보다 투자 대비 회수가 항상 낫다.** (`progression-route.md`의 "완벽주의형 재시작" 항목과 같은 방향이지만, 이쪽은 **"왜 그렇게 설계됐는지"**를 설명한다는 점에서 앱의 학습 레이어에 그대로 쓸 만하다)
11. **초반에 완벽한 배치를 계획하기.** Reddit *1.0 Tips for the easily overwhelmed*(2024-10-03, SmartAlec13)의 8원칙이 이 문제만 다룬다: **① 아무것도 소중하지 않다 ② 어질러진 걸 받아들여라 ③ 최소한만 만들어라 ④ 큰 걸 작게 쪼개라 ⑤ 전력이 우선이다(새 공장 전에 새 발전소부터) ⑥ 메모를 써라 ⑦ 매니폴드를 써라 ⑧ 급할 것도, 파괴될 것도 없다.** 그리고 게임 내 슬로건을 그대로 인용한 댓글(artrald-7083): **"FICSIT: Short Term Solutions For Long Term Problems — 그게 문자 그대로 최적 전략이다. 지금 있는 문제를 고쳐라. 새 문제가 생기면 그때 고쳐라."**
12. **완성한 우주 엘리베이터 부품 공장을 부수기.** Steam giggles: **"목표를 달성했다고 건물을 부수지 마라. 나중에 또 필요하다."** 단 **우주 엘리베이터 부품은 완제품을 빼내는 벨트를 끊어라** — 그래야 계속 생산하면서 엘리베이터가 막히지 않는다
13. **왕복하려고 하이퍼튜브를 두 줄 깔기.** **한 줄에 양쪽 끝 모두 입구를 달면 양방향으로 쓸 수 있다.** Reddit 125egis에서 여러 명이 "80시간 동안 두 줄 깔았다", "2 km짜리 왕복선을 짓던 중인데 진짜냐"로 반응했다. (**댓글 3명 이상 일치**) 튜브 안에서 방향을 되돌리는 것도 가능하지만 그건 **속도가 너무 느리다는 뜻**이라는 지적이 붙었다(Dazvsemir)
14. **부피가 커지는 부품을 멀리서 벨트로 실어오기.** **나사·전선처럼 원료보다 개수가 늘어나는 것은 소비 지점 바로 앞에서 만든다.** 반대로 철광석 3개 → 주괴 2개처럼 줄어드는 가공은 현지에서 한다. (Reddit *Satisfactory Progression Guide Checklist and Tips*(2022-12-07, Garrala28) + 나무위키 10.6 — **2건.** 단 나무위키는 **"철도 수송이라면 부피가 커져도 스택 수량이 같이 늘어나 괜찮다"**는 예외를 단다)

---

## 5. 확인 못 함

- **Reddit 게시물 4건**과 **Reddit 검색 6건**은 레이트리밋 때문에 이번 회차에 끝내지 못했다. **URL과 접근 방법은 위 "조사 방법" 절에 남겼으므로 그대로 이어서 하면 된다.**
  - 못 읽은 게시물: *Actually obscure tips*(`1fy4i6g`, 2024-10-07, **429로 두 번 실패**), *PSA: after hundreds of hours I finally learned…*(`1gg5mkn`, 2024-10-31, **429로 두 번 실패**), *Finished and 100% the game today, my thoughts*(`1ogleeg`, 2025-10-26), *First time playing … completed after 113 hours*(`1v7dvy7`, 2026-07-26)
  - 못 돌린 검색: 바이오매스 자동화 / 기지 위치 / 시간 낭비 / 슬러그 우선순위 / 차원 창고 / 하드드라이브 우선순위
  - 읽었으나 **실전 요령이 거의 없어 인용하지 않은 것**: *1,100 hours later…*(`g2m6v3`, 2020-04-16) — 청사진·텔레포터 위시리스트 글이라 이 문서 범위 밖이다
- **"MAM 연구를 미리 하면 초반 하드 드라이브 확정 3종이 깨진다"**는 디시 *진행 로드맵*의 서술. 원문이 압축돼 있어 해석이 두 갈래로 갈린다. **인게임 확인 필요.** 확정되면 앱의 "지금 뭘 해야 하나"에 직접 들어갈 만한 고가치 정보다.
- **초반 하드 드라이브 3개로 나오는 대체 제작법 풀이 정확히 무엇인지.** "티어2에는 주조된 나사 / 철 전선 / 인벤토리 +6칸 셋뿐"이라는 주장이 **단일 출처**다. `alternate-recipes.md`의 106개 목록과 각 레시피의 해금 선행조건을 대조하면 계산으로 검증할 수 있을 것 같은데 이번엔 못 했다.
- **위키 두 문서의 상충:** `Settings`는 "Keep Inventory"를 일반 게임플레이 옵션으로, `Creative Mode`(구 Advanced Game Settings)는 같은 이름을 크리에이티브 모드 옵션으로 나열한다. **도전과제가 막히는지 여부가 걸려 있어 실제로 중요하다.** 검색 스니펫 수준에서는 "일반 옵션이라 도전과제와 무관"이 우세하지만 **1차 확인 못 함**.
- **스탬프 최대 개수.** 나무위키가 "제한이 있고, 베리·견과류에 일일이 표시하면 금세 떨어진다"고만 하고 수치를 안 적었다.
- **넛지(H) 이동 거리.** 디시 20가지 팁은 "좌우 4미터씩"이라 적었는데 다른 어디에서도 4 m라는 수치를 못 봤고, Reddit에서는 "Ctrl로 절반 넛지"라는 언급만 있다. **수치 미검증.**
- **"허브 화장실에 방사성 폐기물을 버릴 수 있다"**(디시 20가지 팁 #14). 위키에서 대응 서술을 못 찾았다.
- **"노드에 작업대를 붙여 놓으면 캐면서 동시에 주괴를 만들 수 있다"**(디시 41394). 작업대에 주괴 레시피가 있는지 확인 못 했다. **조회수 낮은 짧은 글이라 신뢰도 낮음.**
- **1.2에서 소머슬룹 생산 증폭 버그(생산 정지 → 반출 사이클)가 고쳐졌는지.** 나무위키 서술이 1.1 기준이다.
- **소머슬룹을 고체 바이오 연료 제작기에 꽂는 초반 전술.** 검색 스니펫(Facebook 그룹)으로만 봤고 **원문 미확인이라 채택하지 않았다.**
- **트랙터 평가**(쓸 만하다 vs 성층권으로 날아간다) — 여전히 갈린다.
- **1.0 출시 직후 보고된 석탄 발전기 버그가 1.2에서도 있는지.** Reddit *By far my favorite Quality of Life update*(2024-09-11) 댓글에서 여러 명이 **"벨트로 석탄을 넣었는데 발전기가 받지 않는다"**는 증상과 우회법(**벨트 맨 앞의 석탄 1개를 손으로 집거나, 인벤토리에 석탄을 든 채 발전기 UI를 열었다 닫는다. 그 뒤에는 발전기를 건드리지 말 것**)을 서로 확인했다. **1.0 출시 시점 이슈이며 1.2에서 고쳐졌는지 확인 못 함.**
- **일괄 해체 시 초과분이 "마지막 지정 건물" 자리에 상자로 떨어진다**는 이사 요령(2.2절). Reddit 댓글 2명이 독립적으로 서술했으나 **위키에 대응 서술이 없어 미검증.**
- **MAM 연구가 끝난 상태로 접속을 끊으면 하드 드라이브를 잃을 수 있다**는 주장(Reddit 125egis, Mad_madman99). 같은 스레드에서 **"3번 시험했는데 다 남아 있었다"**(Drakamos)는 반박이 있었다. **옛날 버그로 보이나 확정 못 함.**

---

## 출처 목록

**1차 (공식 위키, 직접 조회 2026-08-20)**
- https://satisfactory.wiki.gg/wiki/Biomass_Burner — 30 MW, 컨베이어 입력 1.0 추가, 고체 바이오 연료 = 연소기 15대
- https://satisfactory.wiki.gg/wiki/HUB — 내장 연소기 2대 × 20 MW, 업그레이드 2·5
- https://satisfactory.wiki.gg/wiki/Dimensional_Depot — 용량/속도/사용처/금지처
- https://satisfactory.wiki.gg/wiki/Dimensional_Depot_Uploader — 비용, 버퍼 1스택, 혼합 업로드 부적합
- https://satisfactory.wiki.gg/wiki/SAM_Fluctuator — 강철 파이프 100 + 와이어 200 + 재생 SAM 10
- https://satisfactory.wiki.gg/wiki/MAM — 티어1 해금, 트리별 진입 아이템, **연구 재료는 인벤토리에 있어야 함**, 철거해도 진행
- https://satisfactory.wiki.gg/wiki/Hard_Drive — 2선택 + 리롤 1회, 라이브러리 풀 축소, **1.0 패치노트 3→2 변경**
- https://satisfactory.wiki.gg/wiki/Dismantle — 100% 환급, Ctrl 50개, G 필터
- https://satisfactory.wiki.gg/wiki/Portable_Miner — 20/40/80 per min, 벨트 불가, 중복 설치 가능
- https://satisfactory.wiki.gg/wiki/Chainsaw — 티어2, 나사 160, 고체 바이오 연료 전용, 반경 5 m
- https://satisfactory.wiki.gg/wiki/Foundation — 기본 콘크리트5+철판2, 콘크리트 토대 콘크리트7
- https://satisfactory.wiki.gg/wiki/AWESOME_Shop — 콘크리트 토대 3쿠폰, 사다리 3쿠폰, 컨베이어 벽 구멍 1쿠폰
- https://satisfactory.wiki.gg/wiki/Settings — Keep Inventory 3택, 자동저장 0~120분(기본 5, 슬롯 3), 지향성 자막
- https://satisfactory.wiki.gg/wiki/Advanced_Game_Settings (현 `Creative Mode`) — 되돌릴 수 없음, 도전과제 비활성

**Reddit (본문 + 댓글 100개까지 직접 열람)**
- https://www.reddit.com/r/SatisfactoryGame/comments/1g8ui9f/ — *A list of tricks that a lot of people don't seem to know* (2024-10-21, im-d3)
- https://www.reddit.com/r/SatisfactoryGame/comments/1fvgzgf/ — *1.0 Tips for the easily overwhelmed* (2024-10-03, SmartAlec13)
- https://www.reddit.com/r/SatisfactoryGame/comments/1feq56i/ — *PSA: Don't sleep on Mercer Spheres early game* (2024-09-12)
- https://www.reddit.com/r/SatisfactoryGame/comments/1p7fs3z/ — *To whomever told me to put a Dimensional Depot on the feed of each of my basic items* (2025-11-26)
- https://www.reddit.com/r/SatisfactoryGame/comments/1g0svil/ — *This game gets 10x as fun once you unlock dimensional storage* (2024-10-10)
- https://www.reddit.com/r/SatisfactoryGame/comments/1fdsddz/ — *This is one of the largest quality of life improvements of 1.0* (2024-09-10) — 연소기 벨트 급유 반응, 9대 270 MW 배선
- https://www.reddit.com/r/SatisfactoryGame/comments/125egis/ — *160 hours in and just learned…* (2023-03-29) — 전신주 전선 삽입, Ctrl+C/V, 제자리 업그레이드, 일괄 해체 이사
- https://www.reddit.com/r/SatisfactoryGame/comments/1fzwsdk/ — *Waste is the highest form of efficiency* (2024-10-09) — 뜯지 말고 새로 지어라, 1 m 토대 그리드 함정
- https://www.reddit.com/r/SatisfactoryGame/comments/zen6hf/ — *Satisfactory Progression Guide Checklist and Tips* (2022-12-07, Garrala28) — 부피가 커지는 부품은 소비 지점 앞에서
- https://www.reddit.com/r/SatisfactoryGame/comments/1fe4bs0/ — *By far my favorite Quality of Life update* (2024-09-11) — 1.0 출시 직후 석탄 발전기 급유 버그와 우회법

**Steam 커뮤니티 (HTML 직접 파싱, 작성·갱신일 확인)**
- https://steamcommunity.com/sharedfiles/filedetails/?id=3004127434 — *Beginner & Intermediate Quick Tips* (ApathicAlpaca, 2023-07/09)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2181910801 — *Top 7 Mistakes Newbies Make* (Prios, 2020-07/08) — **1.0 이전, 벨트·전력망 논지는 여전히 유효**
- https://steamcommunity.com/sharedfiles/filedetails/?id=3373330498 — *Short, Satisfying Tips* (giggles, 2024-11 / 2025-10 갱신)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2983095748 — *Useful tricks in Satisfactory* (okurimono748, 2023)
- https://steamcommunity.com/sharedfiles/filedetails/?id=3337549614 — *Secrets of the User Interface* (Miles Away, 2024-09/11)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2124946046 — *Beginner Tips and Tricks + Coal Power* (Vioria, 2020-06 / 2023-12 갱신) — **하드드라이브 "3선택"은 1.0 이전 값**
- https://steamcommunity.com/sharedfiles/filedetails/?id=2680466676 — *Targets for building supplies* (DK, 2021-12, Update 5 기준)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2844792931 — *The Idiot's Guide To How Not To Die When Starting* (The_Mess, 2022-08)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2600065765 — *Short tips for beginners* (Simply1, 2021-09 / 2025-04 갱신) — **제트팩 티어 표기 등 낡은 수치 다수, 주의**
- https://steamcommunity.com/sharedfiles/filedetails/?id=3465441955 — *🏭 Satisfactory - Tips and Tricks* (KILASIK, 2025-04/08) — **오류 다수, 아래 참고**
- https://steamcommunity.com/app/526870/discussions/0/4755327108894461528/ — *PSA: for new players, how to collect wood and foliage in easy way* (2024-09-12)

**한국어**
- https://namu.wiki/w/Satisfactory/팁 — 2026-08-06 최종수정. 2절 조작키, 3~4절 초기 튜토리얼, 5절 오버클럭, 8.1 발전 방향, 10절 기타 팁 전체
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=35896 — *1.1 기준 기초 가이드 0. 초기 세팅 및 시작 지역 추천* (2025-06-20, 조회 18,513)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=35897 — *1.1 기준 기초 가이드 1. 0-2티어* (조회 16,718)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=35902 — *1.1 기준 기초 가이드 2. 3-4티어* (조회 20,964)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=41565 — *게임 진행 참고용 로드맵* (2026-04-08, 같은 저자)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=26723 — *[팁] 뉴비/초보 초반 필수 팁* (2024-09-18)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=25326 — *[노하우]그나마 쉬운 20가지 기본 팁* (2024-09-13)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=22421 — *공략) 뉴비들을 위한 스타팅 가이드* (2023-12-04)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=41395 — *차원 창고 어캐쓰는거임?* (2026-03-31) — **답은 댓글 12개에 있다**
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=43375 — *개인적인 플레이 방식 팁* (2026-08-19)
- https://gall.dcinside.com/mgallery/board/view/?id=satisfactory&no=43273 — *새붕이 엔딩봤다 & 초보용 미세팁 몇개* (2026-08-08)

**신뢰도가 낮다고 판단해 인용을 제한한 것**
- Steam *🏭 Satisfactory - Tips and Tricks*(KILASIK, 2025): 검증 가능한 수치가 여러 개 틀렸다 — 제트팩을 **티어6**이라 했으나 실제 **티어5**(`exploration.md` 검증), 오버클럭이 **"최대 3배"**라 했으나 실제 **최대 250%**, 허브 연소기를 20 MW라 한 것은 맞지만 **일반 연소기 30 MW와 구분하지 않았다.** 판단(트랙터 부정론 등)만 참고용으로 인용하고 **수치는 하나도 쓰지 않았다.**
- GameRant *How To Automate Biomass Burners*(2024-09-14): 제작기 1대당 연소기 **12대**라고 적었으나 산술적으로 **15대**가 맞다. **미채택.**
- 검색 엔진이 "Satisfactory 가이드"로 반환한 Steam 가이드 중 **다른 게임의 가이드가 두 건 섞여 있었다**(`id=3282434765`, `id=2967727045` — 각각 다른 게임). 제목만 보고 인용하면 안 된다.
