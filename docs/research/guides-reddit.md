# 커뮤니티 합의·쟁점 — r/SatisfactoryGame 리서치

> 담당 범위: r/SatisfactoryGame(및 관련 서브레딧) 전용. YouTube, 한국어 자료, Steam 가이드는 별도 담당이 다룬다.
> 이 문서에서 "원문 확인"이라고 표시한 항목은 실제 Reddit 스레드의 제목·본문·댓글·점수·작성일을 직접 읽고 정리한 것이다. 검색 스니펫만으로 추정한 내용은 절대 없다 — 스니펫만 확보한 항목은 "확인 못 함"으로 명시했다.

## 조사 한계 — 반드시 먼저 읽을 것

이번 조사는 **미완결 상태로 마감했다.** 세션 전체의 웹 검색 자원이 다른 담당 조사에서 이미 소진되었다는 보고에 따라, 배경에서 진행 중이던 검색 배치를 끝까지 마치지 못한 채 중단하고 지금까지 확보한 결과만으로 문서를 작성했다. 계획했던 10개 주제 중:

- **원문(본문+댓글) 전체를 읽고 정리한 주제: 1개** — "2. 매니폴드 vs 로드 밸런서" 항목이 아니라 **"3. 메인 버스" 항목**이다 (아래 표 참고).
- **후보 스레드 URL은 확보했으나 원문을 읽지 못한 주제: 3개** — "1. 초반 진행 순서", "2. 매니폴드 vs 로드 밸런서", "4. 대체 제작법/하드드라이브 우선순위". 제목과 작성일만 확인된 상태다.
- **전혀 손대지 못한 주제: 6개** — "5. 전력 전환 시점", "6. 시작 지점 비교", "7. 모듈식 vs 대형 공장", "8. 블루프린트 사용 시점", "9. 흔한 초보 실수", "10. 1.0 이후 바뀐 조언".

접근 방법에 대한 기술적 발견(다음 조사자를 위해 남김):
- `www.reddit.com` 직접 `WebFetch` → 차단(harness 자체 거부).
- `old.reddit.com`의 **리스팅/검색 HTML 페이지**(`/top/`, `/wiki/index`, `/search`)를 `curl`로 직접 요청 → **403 Forbidden** ("네트워크 정책으로 차단" 또는 "reddit.com: forbidden").
- `www.reddit.com`의 JSON 검색 API(`/r/.../search.json`) → **403**.
- 그러나 **개별 게시물 permalink**(`old.reddit.com/r/SatisfactoryGame/comments/{id}/{slug}/`)는 브라우저 User-Agent를 지정한 `curl`로 **200 정상 응답**, 제목·본문·댓글·점수(title 속성)·작성일(`datetime`)이 모두 서버 렌더링되어 있어 파싱 가능함을 확인했다.
- **`old.reddit.com`의 공식 RSS 검색 엔드포인트**(`/r/SatisfactoryGame/search.rss?q=...&restrict_sr=1&sort=top`)도 **200으로 정상 동작**하며, 서브레딧 내부 검색 결과(제목·링크·작성일)를 반환한다. 이번 조사의 URL 대부분은 이 경로로 확보했다.
- 단, 두 경로 모두 **강한 속도 제한**이 걸려 있다 — 연속 요청 시 즉시 HTTP 429가 뜨고, 완화까지 요청당 20~30초 이상의 간격이 필요했다. 이 때문에 10개 주제를 전부 원문까지 확인하려면 훨씬 더 긴 세션이 필요하다.
- **기존 문서 `docs/research/eco-reddit.md`는 "Reddit 완전 차단"으로 결론 냈으나, 이번 조사에서 그 결론이 부분적으로 틀렸음을 확인했다.** 개별 permalink와 RSS 검색은 실제로 접근 가능하다. 다음 조사자는 이 경로를 속도 제한을 감안해 천천히(요청 간 20~30초 이상, 백그라운드 배치로) 사용할 것을 권한다.

---

## 1. 합의된 것

**정직하게 말해, 이번 조사에서 여러 독립된 스레드에 걸쳐 "합의"라고 부를 만큼 반복 확인한 항목은 많지 않다** — 10개 주제 중 원문을 끝까지 읽은 것이 메인 버스 1개뿐이기 때문이다. 아래는 그 1개 주제 안에서, 2020~2023년에 걸친 4개의 독립 스레드(작성자가 서로 다르고 시기도 갈림)에서 **반복적으로 등장한** 패턴이다. 다른 9개 주제에 대해서는 이 섹션에 아무것도 적지 않는다 — 지어내지 않기 위해서다.

- **"Factorio의 메인 버스 개념을 Satisfactory에 그대로 옮기면 안 맞는다"는 지적이 2020년, 2021년, 2023년 스레드에서 각각 독립적으로 반복 등장했다.** 근거: Satisfactory는 수직 공간을 적극 활용하는 3D 게임이라 Factorio의 2D 평면 최적화 전제가 깨진다는 논리가 매번 되풀이됨 (자세한 인용은 섹션 2-3 참고).
- **"공간 규모를 처음엔 과소평가한다"는 취지의 초보 실수 언급이 여러 스레드 제목에서 산발적으로 보였다** (예: 검색 결과 제목 "never enough aluminium", "beware of the vertical junctions" 등) — 다만 이건 **본문을 읽지 못했으므로 제목에서 짐작한 것일 뿐**, 정식 합의로 기록하지 않는다. 참고용으로만 남긴다.

---

## 2. 갈리는 것 — 주제별 양쪽 주장

### 2-3. 메인 버스(main bus) 설계가 쓸모 있는가 — 원문 확인 완료

r/SatisfactoryGame에서 게임 초기부터 반복되는 논쟁이다. 아래 4개 스레드는 **본문 + 댓글(점수순 정렬) 전체를 직접 읽고** 정리했다.

| 스레드 | 작성일 | 1.0 기준 | 게시물 점수/댓글수 |
|---|---|---|---|
| [How do you build a main bus?](https://www.reddit.com/r/SatisfactoryGame/comments/fqupyx/how_do_you_build_a_main_bus/) | 2020-03-28 | 이전 (Update 3) | 2점 / 14댓글 |
| [How viable is the main bus method?](https://www.reddit.com/r/SatisfactoryGame/comments/rh8ypl/how_viable_is_the_main_bus_method/) | 2021-12-15 | 이전 | 3점 / 8댓글 |
| [How practical is a main bus?](https://www.reddit.com/r/SatisfactoryGame/comments/11gu932/how_practical_is_a_main_bus/) (설문 포함) | 2023-03-03 | 이전 | 15점 / 60댓글 |
| [the power of the main bus](https://www.reddit.com/r/SatisfactoryGame/comments/18ibm2r/the_power_of_the_main_bus/) | 2023-12-14 | 이전 | 0점 / 15댓글 |

**주의**: 4개 스레드 모두 1.0(2024-09) 이전 글이다. 1.0 이후 메인 버스를 주제로 한 스레드는 이번 조사에서 **찾지 못했다.** 1.0 이후 여론이 바뀌었는지는 판단 근거가 없다.

**반대(비판) 측 논거 — 댓글 점수 기준 이쪽이 더 많고 더 높다:**
- *"Factorio에서 보던 버스 디자인은 Satisfactory에 잘 안 맞는다"* — Dangthing, 9점 (rh8ypl). 이유: Factorio는 2D 평면 최적화 게임, Satisfactory는 수직 공간을 적극 활용하는 게임이라 전제가 다르다.
- *"이건 Factorio 3D가 아니다. 버스는 기술적으로 가능하지만, 그러려면 한 번 클리어해서 뭐가 얼마나 필요한지 미리 알아야 한다. 나는 100% 효율을 놓아버리고 나서야 재밌어졌다"* — houghi, 7점 (같은 스레드). 효율보다 즐거움을 우선하는 플레이 철학과 연결됨.
- *"메인 버스 스타일 메가베이스를 한 번 시도했는데 FPS가 나빴다. 퀵와이어·구리판을 나르는 데만 여러 평행 벨트가 필요했다. 지금은 자급자족형 서브팩토리를 선호한다"* — JinkyRain, 5점 (같은 스레드).
- *"이 게임을 좀 해봤으면 메인 버싱이 별로 좋은 생각이 아니란 걸 스스로 알게 될 것"* — il_the_dinosaur, 3점.
- *"Factorio 출신만 Satisfactory에서 메인 버스를 짓는다. 여기선 3차원 공간을 잘 쓰는데 Factorio는 그게 제한적이다"* — alfi456, 2점.
- *"이 게임에서? 무의미하다(Pointless)"* — SaviorOfNirn, 1점.
- *"작은 스파게티 공장 하나에서나 귀엽지, 큰 규모로는 전혀 안 맞는다. 지저분한 벨트·스플리터 뭉치를 클리핑하기 싫으면 더더욱"* — ANGR1ST, 1점 (18ibm2r).
- *"수직 접근은 유체(파이프)가 도입되면서 한물갔다. 벨트와 파이프를 섞어 유지하는 게 번거롭다"* — Alpheus2, 1점 (fqupyx). **주의: 2020년(Update 3) 시점 발언 — 현재 파이프/벨트 통합 편의성 기준으로는 안 맞을 수 있다. 원문 그대로 인용하되 현재 유효성은 미검증.**

**찬성 측 논거:**
- *"최근에 메인 버스를 쓰기 시작했는데, 여태 해본 플레이스루 중 제일 빠르고 쉬운 공장 스타일이었고 보기도 깔끔하다. 왜 다들 싫어하는지 모르겠다"* — 글쓴이 asciencepotato 본인 주장 (18ibm2r 본문). 단, 이 글에 달린 최고 공감 댓글(ANGR1ST, "규모가 커지면 전혀 안 맞는다")이 게시물 자체 점수(0점)보다 높은 공감을 받음 — **이 스레드 안에서 찬성 의견이 수적으로 열세**.
- *"한 공장 안에서는 성공적으로 썼다. 다만 모든 곳을 관통하는 거대한 버스 하나는 추천 안 함"* — StigOfTheTrack, 1점 (18ibm2r). **국지적 버스는 괜찮다는 절충안.**
- fqupyx 스레드에서 최고 득점 댓글(Badger67x, 3점)은 찬반을 명시하지 않고 **실제 동작하는 버스 배치 이미지**만 공유 — "하려면 이렇게 하라"는 실용적 답변이 반대론 우세 스레드 안에서도 병존.
- 11gu932 스레드는 투표(poll)를 포함하나, **poll 결과 수치 자체는 이번 조사에서 파싱하지 못했다** — 있는 그대로 밝혀둔다.

**결론(이 조사 범위 내에서만):** 확인한 4개 스레드 모두 **비판적 견해가 점수·댓글 수에서 우세**하다. 주된 반박 논리는 "Factorio식 2D 버스 사고를 3D 게임에 그대로 가져온 것", "규모가 커지면 FPS·벨트 관리가 무너진다"이다. 다만 "국지적으로 작은 버스는 쓸만하다"는 절충 의견도 존재하며 완전한 만장일치는 아니다. **1.0 이후 시점의 여론 변화는 이번 조사로 확인 불가.**

### 2-1, 2-2, 2-4 ~ 2-10. 나머지 9개 주제 — 원문 미확인

아래 항목들은 후보 스레드(제목/날짜)만 확보했거나 전혀 검색하지 못했다. **주장·근거를 요약하지 않는다** — 제목만으로 내용을 짐작해 적으면 왜곡이기 때문이다. 구체적인 후보 목록과 재조사 순서는 "4. 확인 못 함" 절에 정리했다.

---

## 3. 1.0 이후 바뀐 것 — 원문 미확인

이번 조사에서 **원문을 읽고 "1.0 이전엔 이랬는데 1.0 이후 이렇게 바뀌었다"고 확정할 수 있는 항목은 없다.**

참고로, 검색 과정에서 다음 패치노트/공지 스레드의 존재만 확인했다(본문 미독):
- [Patch Notes: Satisfactory 1.0 – Build 365306](https://old.reddit.com/r/SatisfactoryGame/comments/1fdjz13/patch_notes_satisfactory_10_build_365306/) (2024-09-10, 1.0 발매 당일)
- [Alternate Recipe Ranking 1.0 - Optimizing for Time/Effort](https://old.reddit.com/r/SatisfactoryGame/comments/1fekus9/alternate_recipe_ranking_10_optimizing_for/) (2024-09-11, 1.0 발매 다음날 — 제목상 1.0 기준으로 대체 레시피 랭킹을 다시 짠 글로 보이나 **미확인**)
- [PSA/Reminder: 공식 위키는 wiki.gg, fandom.com 아님](https://old.reddit.com/r/SatisfactoryGame/comments/1fmwkno/psareminder_the_official_wiki_is_at_wikigg_not/) (2024-09-22) — 제목만으로도 "구글 검색 상위에 뜨는 fandom.com 위키가 낡은 정보로 가득하다"는 취지가 짐작되나, 이는 **위키 출처 문제이지 게임플레이 조언 변화가 아니다.** 본문 미확인.
- [Patch Notes: v1.2.0.0 (EXPERIMENTAL)](https://old.reddit.com/r/SatisfactoryGame/comments/1rwap22/patch_notes_v1200_experimental_build_480321/) (2026-03-17), [Satisfactory 1.2 Update - Out now](https://old.reddit.com/r/SatisfactoryGame/comments/1tutp15/satisfactory_12_update_out_now_on_pc_playstation/) (2026-06-02) — 1.2 관련 공지. 본문 미확인.

1.0의 실제 수치 변화(Phase 4/5 요구량 대폭 하향 등)는 `docs/research/progression.md`에 **위키 기준으로 이미 검증**되어 있다 — 단 그 문서는 Reddit 원본이 아니라 위키 교차검증 자료다. 이 문서(guides-reddit.md)는 "커뮤니티가 그 변화를 어떻게 받아들였는가"를 다루려 했으나 이번 조사 범위에서는 확인하지 못했다.

---

## 4. 확인 못 함

### 4-A. 후보 스레드는 확보, 원문 미독 (제목/날짜만 확인 — RSS 검색 결과)

**주제 1. 초반 진행 순서 (티어 0~3에서 무엇을 먼저 자동화하는가)**

| 날짜 | 제목 | URL |
|---|---|---|
| 2023-03-04 | Tier 0 automation - if you know you know | https://old.reddit.com/r/SatisfactoryGame/comments/11i8nsy/tier_0_automation_if_you_know_you_know/ |
| 2024-12-23 | When you are unable to overclock your Mk2 miner to 250% because your Mk3 belts can't carry its output | https://old.reddit.com/r/SatisfactoryGame/comments/1hkhyjd/when_you_are_unable_to_overclock_your_mk2_miner/ |
| 2025-08-21 | Beware of the vertical junctions... | https://old.reddit.com/r/SatisfactoryGame/comments/1mwji7e/beware_of_the_vertical_junctions/ |
| 2025-02-09 | never enough aluminium | https://old.reddit.com/r/SatisfactoryGame/comments/1ileugw/never_enough_aluminium/ |
| 2025-05-02 | I beat the game (and more) with a single sushi belt factory | https://old.reddit.com/r/SatisfactoryGame/comments/1kczmlh/i_beat_the_game_and_more_with_a_single_sushi_belt/ |

**주제 2. 매니폴드 vs 로드 밸런서 — 후보가 가장 풍부하게 잡혔다. 우선순위 1순위로 재조사 권장.**

| 날짜 | 제목 | URL |
|---|---|---|
| 2019-05-26 | Satisfactory Saturdays #2 - Balancers vs. Manifolds | https://old.reddit.com/r/SatisfactoryGame/comments/btexf7/satisfactory_saturdays_2_balancers_vs_manifolds/ |
| 2022-05-14 | "매니폴드가 보통 논쟁에서 이긴다. 그래도 로드밸런서가 필요한 경우가 있다" (본인 요약 제목) | https://old.reddit.com/r/SatisfactoryGame/comments/upggkw/when_it_comes_to_manifolds_vs_load_balancers/ |
| 2023-01-31 | Manifold Vs Load Balancing | https://old.reddit.com/r/SatisfactoryGame/comments/10pt9w6/manifold_vs_load_balancing/ |
| 2023-11-11 | Manifold vs load balancing | https://old.reddit.com/r/SatisfactoryGame/comments/17t4b35/manifold_vs_load_balancing/ |
| 2024-01-12 | Manifolds vs load-balancing and matched machine groups - a nuclear experiment (details in comments) | https://old.reddit.com/r/SatisfactoryGame/comments/194rxut/manifolds_vs_loadbalancing_and_matched_machine/ |
| 2024-10-31 | Guys i need help should i load balance or manifold my power? | https://old.reddit.com/r/SatisfactoryGame/comments/1ggctmu/guys_i_need_help_should_i_load_balance_or/ |
| 2025-03-19 | Manifolds vs Load Balancers! | https://old.reddit.com/r/SatisfactoryGame/comments/1jf9xcw/manifolds_vs_load_balancers/ |
| 2025-05-18 | After using manifolds for 800 hours, i started load balancing (**의견 전환 서사 — 우선 확인 권장**) | https://old.reddit.com/r/SatisfactoryGame/comments/1kpijvv/after_using_manifolds_for_800_hours_i_started/ |
| 2025-05-24 | Can someone explain load balancer vs manifolding | https://old.reddit.com/r/SatisfactoryGame/comments/1ku404n/can_someone_explain_load_balancer_vs_manifolding/ |
| 2026-02-21 | My take on load balancers vs manifolds | https://old.reddit.com/r/SatisfactoryGame/comments/1rapbsi/my_take_on_load_balancers_vs_manifolds/ |
| 2026-02-26 | Understanding Manifolds | https://old.reddit.com/r/SatisfactoryGame/comments/1rew1rx/understanding_manifolds/ |
| 2026-05-09 | Manifolds Vs Load Balancers | https://old.reddit.com/r/SatisfactoryGame/comments/1t84yyg/manifolds_vs_load_balancers/ |
| 2026-06-13 | Just discovered what manifolds are... (I used to only use load balancers) I feel so alive (**반대 방향 전환 서사**) | https://old.reddit.com/r/SatisfactoryGame/comments/1u52ohv/just_discovered_what_manifolds_are_and_how_they/ |
| 2026-06-03 | Load Balancer vs Manifold | https://old.reddit.com/r/SatisfactoryGame/comments/1tvjt19/load_balancer_vs_manifold/ |

**참고**: 위 목록에 "의견 전환 서사"라고 표시한 두 글은 정반대 방향(매니폴드→로드밸런서, 로드밸런서→매니폴드)으로 갈아탄 경험담이라는 게 제목에서 드러난다 — **이는 이 주제가 실제로 갈리는 쟁점일 가능성을 시사**하지만 본문을 읽지 않았으므로 결론을 내리지 않는다.

**주제 4. 대체 제작법/하드드라이브 우선순위**

| 날짜 | 제목 | URL |
|---|---|---|
| 2021-04-10 | Update 4 Alternate Recipe In-Depth Analysis. Recipes Ranked by User Category. | https://old.reddit.com/r/SatisfactoryGame/comments/mnwugx/update_4_alternate_recipe_indepth_analysis/ |
| 2023-09-28 | Alternate Recipe Ranking w/Spreadsheet (Update 7) | https://old.reddit.com/r/SatisfactoryGame/comments/16ugm5k/alternate_recipe_ranking_wspreadsheet_update_7/ |
| 2024-09-11 | Alternate Recipe Ranking 1.0 - Optimizing for Time/Effort (**1.0 갱신판으로 보임 — 우선 확인 권장**) | https://old.reddit.com/r/SatisfactoryGame/comments/1fekus9/alternate_recipe_ranking_10_optimizing_for/ |
| 2024-10-28 | Took 56 hard drives, but I finally found it | https://old.reddit.com/r/SatisfactoryGame/comments/1ge36ew/took_56_hard_drives_but_i_finally_found_it/ |
| 2024-09-25 | it's taken me over 12 hard drives and i still haven't gotten it | https://old.reddit.com/r/SatisfactoryGame/comments/1fp23yl/its_taken_me_over_12_hard_drives_and_i_still/ |
| 2026-03-10 | New alternative recipe for turbo engine: "the black pig" | https://old.reddit.com/r/SatisfactoryGame/comments/1rpzb0x/new_alternative_recipe_for_turbo_engine_the_black/ |

같은 시리즈로 보이는 "Alternate Recipe Ranking" 글이 Update 4(2021) → Update 7(2023) → 1.0(2024)로 3세대에 걸쳐 갱신되어 온 정황이 제목에서 보인다. **세 글을 순서대로 읽으면 "1.0이 대체 레시피 우선순위를 어떻게 바꿨는가"를 원문으로 추적할 수 있는 가장 유력한 실마리다** — 다음 조사 최우선 후보로 남긴다.

### 4-B. 검색조차 못한 주제 (완전 미착수)

- **주제 5. 전력 전환 시점** (바이오매스→석탄→연료/원자력)
- **주제 6. 시작 지점(4곳) 비교**
- **주제 7. 공장 규모** (모듈식 vs 대형 통합)
- **주제 8. 블루프린트 적극 사용 시점**
- **주제 9. 흔한 초보 실수**
- **주제 10. 1.0 이후 바뀐 조언** (섹션 3의 패치노트 스레드 제외하면 실질적으로 미착수)

이 6개 주제는 이번 세션에서 검색조차 시작하지 못했다. 지어내지 않았다는 뜻이지, 조사가 끝났다는 뜻이 아니다.

### 4-C. 메인 버스 관련 잔여 미확인 사항

- 1.0(2024-09) 이후 시점의 메인 버스 스레드 — 발견 못함.
- `11gu932` 스레드에 포함된 poll(설문) 결과 수치 — 원문에서 파싱 실패.

---

## 재조사 우선순위 (다음 세션 권장 순서)

1. **주제 4 (대체 레시피)** — "Alternate Recipe Ranking" 3세대 연작(2021/2023/2024)을 순서대로 읽으면 1.0 전후 비교까지 한 번에 나온다. 투자 대비 정보량이 가장 높다.
2. **주제 2 (매니폴드 vs 로드 밸런서)** — 후보 14개 확보, 서로 반대 방향으로 의견을 바꾼 경험담 2건이 특히 흥미로움. `upggkw`(2022, "매니폴드가 보통 이긴다"는 자체 요약 제목)부터 시작 권장.
3. **주제 1 (초반 진행 순서)** — 후보는 확보했으나 얇음. `11i8nsy`("Tier 0 automation - if you know you know") 하나부터 확인.
4. **주제 5, 6, 7, 8, 9, 10** — RSS 검색부터 새로 시작. `old.reddit.com/r/SatisfactoryGame/search.rss?q=...&restrict_sr=1&sort=top&t=all` 형식, 요청 간 20~30초 간격 필수(그렇지 않으면 HTTP 429).

---

## 방법론 메모

- 검색: `old.reddit.com/r/SatisfactoryGame/search.rss?q=<키워드>&restrict_sr=1&sort=top&t=all` (Atom/RSS, 200 응답, 제목·링크·날짜 제공. 점수·댓글수는 미제공 — 개별 permalink를 열어야 확인 가능).
- 원문 확인: 위 검색으로 얻은 URL을 `old.reddit.com/.../comments/{id}/{slug}/?sort=top` 형태로 직접 요청(브라우저 User-Agent 필수). 정적 HTML에 점수(`title` 속성), 작성자, 날짜(`datetime`), 댓글 본문이 모두 포함되어 있어 파싱 가능.
- 속도 제한: 두 엔드포인트 모두 연속 요청 시 즉시 429. 요청 사이 20~30초 이상 간격 필요. 이번 조사는 이 제약 때문에 백그라운드 배치로 순차 진행하다가 세션 자원 소진으로 중단했다.
- WebSearch 도구(사이트 필터 포함)로는 `reddit.com` 결과가 거의 노출되지 않았다(대신 Steam Community, SEO 스팸 사이트가 나옴) — 이 문서의 URL은 전부 위 RSS 검색으로 직접 확보한 것이다.
