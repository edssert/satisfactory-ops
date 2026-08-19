# 영어권 YouTube 공략 채널 리서치 — Satisfactory

> **조사 방법론 주의사항 (반드시 읽을 것)**
> - YouTube 채널 페이지(`/videos`, `/about`)는 JS 렌더링 페이지라서 `WebFetch`로는 본문이 비어 있고 푸터(약관·저작권 링크)만 반환된다. 따라서 이 문서의 채널·영상 정보는 **`WebSearch` 스니펫**과 **`https://www.youtube.com/oembed?url=...&format=json`(oEmbed API)로 개별 영상의 제목·실제 채널명을 교차검증**한 결과다.
> - oEmbed로 확인한 항목에는 `[oEmbed 확인]` 태그를, 검색 스니펫만으로 파악한 항목에는 `[검색 스니펫]` 태그를 붙였다.
> - **중요한 함정 사례**: `WebSearch` 결과 제목만 보고 채널을 추정하면 틀리는 경우가 실제로 여러 번 나왔다. 예) "This Solves the Biggest Problem in Satisfactory..."는 검색 스니펫에서 Nefrums 관련으로 나왔지만 oEmbed로 확인하니 실제 업로더는 **Coffee Stain Studios**(공식 채널)였다. "Efficient Motor Factory - Satisfactory New Player Guide EP19"는 실제로는 **GMODISM**의 영상이었고, "SATISFACTORY 1.0 New Player Guide Part 2"는 **Merlin**, "Satisfactory New Player Guide"(단편)는 **Drawing Xaos**, "The Perfect Playthrough from Start to Finish"는 **Drawing Xaos**, "Revealing my Satisfactory 1.2 MEGA PROJECT!"는 **ImKibitz**였다 — 전부 최초 검색 스니펫에서는 다른 채널(Nefrums)로 오인될 뻔한 것을 oEmbed로 바로잡았다. **이 문서에 실린 채널 귀속은 전부 oEmbed로 재확인한 것만 "확정"으로 표시했다.**
> - 이번 세션은 `WebSearch` 호출 200회 한도를 도중에 소진했다(하드 캡, 세션 내 재시도 불가). 이후 구간은 `WebFetch`/oEmbed만으로 보강했다. 그래서 일부 주제(특히 전력 설계 전환 시점)는 채널별 전용 영상을 확정하지 못했다 — 4절 "확인 못 함"에 명시.
> - **1.0 버전 확인 기준**: Satisfactory 1.0은 2024-09-10 출시. 영상 제목/설명에 "1.0"이 명시되어 있거나, 업로드 시점이 2024-09-10 이후로 확인된 것만 "1.0 이후 콘텐츠 있음"으로 표시했다. 업로드일을 확인 못 한 경우 "업로드일 미확인"이라고 적었다.

---

## 1. 채널 표

| 채널명 | URL | 구독자 규모 | 콘텐츠 종류 | 1.0(2024-09) 이후 콘텐츠 |
|---|---|---|---|---|
| **TotalXclipse** | youtube.com/@TotalXclipse | 약 22.3만 (letsplayindex.com 집계, 오차 있음) | 공략 가이드·창의적 빌드·주간 정기 콘텐츠. 채널 소개문: "weekly content on Satisfactory... fun videos and informative guides and expressing myself through creative builds". Satisfactory가 전체 영상의 약 57%, 조회수의 약 69%를 차지 (letsplayindex.com 집계) | **있음** — "15 Blueprints I'll Be Taking To Satisfactory 1.0 And You Should Too"(2024-09), "The Best Start Location For Satisfactory 1.0?"(2024-07-27), "Beginners Guide To Making Blueprints in Satisfactory 1.0" 등 다수 [oEmbed 확인] |
| **ImKibitz** | youtube.com/@ImKibitz | 약 43만~62만 (집계 사이트마다 편차가 큼 — vidIQ 43.2만 vs 다른 스니펫 62만대. 갱신 시점 차이로 추정, 확정 수치 아님) | Let's Play 위주(스토리 진행형 플레이스루), 대형 프로젝트 리빌 콘텐츠 | **있음** — 전용 재생목록 "ImKibitz' Satisfactory 1.0 Let's Play" 존재. "The (Almost) Perfect Start for Satisfactory 1.0!"(2024-09-13), "Revealing my Satisfactory 1.2 MEGA PROJECT!" [oEmbed 확인] |
| **Scalti** | youtube.com/@Scalti | 약 3.7만 (socialcounts.org) | 채널 자기소개: "super sexy clean 100% efficient Satisfactory guides"를 표방하는 그래픽 디자이너 출신 크리에이터. Satisfactory가 업로드의 85.9%(67개 중), 누적 조회수 약 326만 (noxinfluencer 집계 스니펫) | **있음(가능성 높음, 완전확인은 못함)** — "Satisfactory 1.0 Tuesday Livestream 9-24-2024" 확인. 단, 확인된 대표작 "Water Tower Mechanics Guide"는 2021-01-10 업로드로 **1.0 이전** 콘텐츠 [검색 스니펫] |
| **Bitz (ItsBitz / Its_BitZ)** | youtube.com/@ItsBitz | 확인 못 함(트위치·유튜브 겸업 크리에이터, 구독자 수 불명) | 스토리 진행형 Let's Play, "Behind The Scenes" 비하인드 시리즈 병행 | **있음** — "Bitz Plays Satisfactory 1.0 - Part 30/31/40" 등 시리즈 다수, "Satisfactory 1.0 Behind The Scenes with Bitz - Part 5/6/19/30/35" [oEmbed 확인 (Part 30)] |
| **Nilaus** | youtube.com/@Nilaus (channel UCD80bzqJh1N7lOqn7n0vKTg) | 약 24.9만 | 원래 Factorio가 주력이나 자동화 게임 전반의 "정직한 플레이(과장·가짜 없음)"로 커뮤니티에서 추천받는 크리에이터. Satisfactory는 부차 콘텐츠 | **있음** — "Satisfactory 1.0 - Lets Play" 전용 재생목록 존재 [검색 스니펫, 재생목록 URL 확인] |
| **GMODISM** | youtube.com/user/gmodism | 확인 못 함 | "Satisfactory New Player Guide" 번호 매겨진 시리즈(EP1~EP30+)를 정규 발행. From the Depths·Space Engineers 2·Garry's Mod 등 크리에이티브/샌드박스 게임 전반을 다루는 채널의 하위 시리즈 | **있음** — "Efficient Nobelisk Explosives Factory - Satisfactory **1.0** New Player Guide EP30" [oEmbed 확인] |
| **Drawing Xaos** | (채널 URL 미확인, 영상 귀속만 oEmbed로 확인) | 확인 못 함 | "Satisfactory New Player Guide" 시리즈, "The Perfect Playthrough from Start to Finish" 등 진행 가이드형 콘텐츠 | 업로드일 미확인 — 제목에 "1.0" 명시 없어 확정 못 함 |
| **Merlin** | (채널 URL 미확인, 영상 귀속만 oEmbed로 확인) | 확인 못 함 | "SATISFACTORY 1.0 - New Player Guide - HOW TO GET STARTED BY LEARNING THE BASICS" 시리즈 | **있음** — 제목에 "1.0" 명시 [oEmbed 확인] |
| **Nefrums** | youtube.com/@nefrums4510 (channel UCo9CIGA3vGlkuGGzTLPvJ5g) | 약 2.3만 (socialcounts.org) | **본업은 Factorio 스피드러너/스트리머(스웨덴 거주, Twitch에서 Factorio 랭킹권)**. YouTube 채널 존재는 확인했으나, 이번 조사에서 검색된 "Nefrums Satisfactory" 후보 영상들은 oEmbed로 재확인한 결과 전부 **다른 채널(GMODISM, Drawing Xaos, ImKibitz, Coffee Stain Studios) 소유**로 판명됨 | **확인 못 함** — 이 채널에 귀속되는 Satisfactory 전용 영상을 하나도 확정하지 못했다. 사용자가 "속도 진행/효율" 채널로 지목했지만 그 특징은 Factorio 쪽 활동과 일치한다. 오인 가능성을 명시적으로 남긴다 |

### 확인 못 한 채널 (지정된 후보 중)

| 이름 | 상태 |
|---|---|
| **Random Nick** | `youtube.com/channel/UCSAo-iN_eVvCpmJ2Vop_KjQ` 이름의 채널은 존재하나, 검색 스니펫상 콘텐츠가 "일상 경험/실험" 계열로 Satisfactory와 무관해 보임. Satisfactory 콘텐츠를 다루는 "Random Nick" 채널을 특정하지 못했다 — **확인 못 함**, 지어내지 않음 |
| **The Game Dude** | 검색된 동명 채널은 2010년대 게임 리뷰 패러디 채널(캐나다 유튜버)로 Satisfactory와 무관. Satisfactory 전문 "The Game Dude" 채널을 찾지 못했다 — **확인 못 함** |

### 조사 중 추가로 발견한 채널 (특정 주제 단발 영상만 확인, 채널 전체 조사는 못함)

이 채널들은 "채널 전수조사" 대상은 아니었지만, 주제별 검색 중 개별 영상이 확인되어 3절 주제표에 함께 남긴다. 채널 전체 성격(구독자 규모, 1.0 이후 지속 활동 여부)은 **미조사**.

| 채널명 | 확인된 영상 (oEmbed) |
|---|---|
| Dekoba | "Alternate Recipe Guide - Best alternate recipes for each tier in Satisfactory 1.0" |
| TheValhallanPickle | "BEST STARTER LOCATIONS in Satisfactory 1.0" (2024-09-14) |
| Fjorim | "Manifold vs Load Balancer - Distributing Items Evenly in Satisfactory" (검색 스니펫상 2022-02, 1.0 이전) |
| SpectrumDad | "The ULTIMATE Satisfactory Manifold vs Load Balancers Guide! (For Everyone)" (검색 스니펫상 2024-04) |
| Gemzen | "Load Balancing vs Manifolds – Which Is Best in Satisfactory?" (검색 스니펫상 2025-12) |
| Epiphane | 스피드런 전문. "Top 10 Satisfactory Speedrunning Tricks!", "[Former WR] Beating Satisfactory in less than 2 hours! 4Package% speedrun in 1:59:37! [Glitched]" |
| Overclocked | "The Blueprints Every Satisfactory Player Needs !" |
| THEGAMINGTECH | "Satisfactory 1.0 Blueprint Designer Essential Tips and Creative Workarounds" |

---

## 2. 주제별 대표 영상

### (1) 초반 진행 가이드 (티어 0~3)

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| Essential Tips For Beginners! - Satisfactory New Player Guide EP1 | GMODISM | youtube.com/watch?v=cg5KXrYPFjo | 업로드일 미확인 | 번호 매겨진 정규 시리즈의 1편. EP30("Efficient Nobelisk Explosives Factory")까지 제목에 "1.0" 명시된 걸로 봐서 시리즈 전체가 1.0 기준으로 갱신됨 [oEmbed 확인] |
| The (Almost) Perfect Start for Satisfactory 1.0! | ImKibitz | youtube.com/watch?v=z1yIAyJW-fE | 2024-09-13 (1.0 출시 3일 후) | ImKibitz의 1.0 Let's Play 시리즈 첫 파트 성격 [oEmbed 확인] |
| SATISFACTORY 1.0 - New Player Guide - HOW TO GET STARTED BY LEARNING THE BASICS - Part 2 | Merlin | youtube.com/watch?v=1Ip6nImV-1o | 업로드일 미확인, 제목에 1.0 명시 | [oEmbed 확인] |
| Satisfactory New Player Guide | Drawing Xaos | youtube.com/watch?v=tobNPMVBgPk | 업로드일 미확인 | [oEmbed 확인] |
| I WISH I Did This at the Start of My Satisfactory Playthrough... | ImKibitz | youtube.com/watch?v=PtwrEsfhh0M | 업로드일 미확인 | 초반 실수/후회 회고형 — "지금 뭘 해야 하는지"에 직접 대응하는 소재 [oEmbed 확인] |

### (2) 공정 설계 방법론 (매니폴드 vs 밸런서)

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| Manifold vs Load Balancer - Distributing Items Evenly in Satisfactory | Fjorim | youtube.com/watch?v=EVomUcv2vuA | 검색 스니펫상 2022-02 (1.0 이전, 개념 자체는 버전 불변) | [oEmbed 확인] |
| The ULTIMATE Satisfactory Manifold vs Load Balancers Guide! (For Everyone) | SpectrumDad | youtube.com/watch?v=2u1friHNt6c | 검색 스니펫상 2024-04 | [oEmbed 확인] |
| Load Balancing vs Manifolds – Which Is Best in Satisfactory? | Gemzen | youtube.com/watch?v=gHqFkoI6jfg | 검색 스니펫상 2025-12 | "가장 논쟁적인 주제 중 하나"라고 스스로 소개 — 3절 참고 [oEmbed 확인] |
| Satisfactory BEGINNER Guide : Manifolds vs Load Balancing Tutorial | 미확인(oEmbed 미실행) | youtube.com/watch?v=O7cCL5sZgLE | 검색 스니펫상 2025-05 | 채널명 미확인 — 목록에만 남김 |

### (3) 대체 제작법 우선순위

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| Alternate Recipe Guide - Best alternate recipes for each tier in Satisfactory 1.0 | Dekoba | youtube.com/watch?v=zOuDWGegYQ8 | 제목에 1.0 명시, 업로드일 미확인 | 티어별 대체 레시피 우선순위를 직접 다룸 [oEmbed 확인] |

전반적으로 "97개 하드드라이브 중 어떤 대체법이 S급인가"류 콘텐츠는 텍스트 위키/티어리스트 사이트(tiermaker.com, dexerto.com 등)가 YouTube보다 검색 노출이 높았다. YouTube 전용 대체법 우선순위 영상은 이번 조사에서 위 1건 외 채널을 특정하지 못했다 — 추가 조사 여지 있음(4절 참고).

### (4) 전력 설계 (바이오매스 → 석탄 → 연료 → 원자력 전환 시점)

전용 영상을 이번 조사에서 확정하지 못했다. GMODISM의 New Player Guide 시리즈에 "Power Guide - Satisfactory New Player Guide EP18"이라는 회차가 존재하는 것은 검색 스니펫(및 Odysee 미러 페이지)으로 확인했으나, 해당 YouTube 영상 URL을 직접 확보해 oEmbed로 채널을 재확인하지는 못했다 — 4절에 미확인으로 남긴다.

### (5) 부지 선정 / 시작 지점 비교

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| The Best Start Location For Satisfactory 1.0? | TotalXclipse | youtube.com/watch?v=4aQmlMzSBQw | 2024-07-27 (1.0 출시 전, 예고 기준 분석) | [oEmbed 확인] |
| BEST STARTER LOCATIONS in Satisfactory 1.0 | TheValhallanPickle | youtube.com/watch?v=SQbx9WcFECA | 2024-09-14 (1.0 출시 4일 후) | [oEmbed 확인] |

### (6) 블루프린트 활용법

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| 15 Blueprints I'll Be Taking To Satisfactory 1.0 And You Should Too | TotalXclipse | youtube.com/watch?v=35LBdQ0KZyo | 2024-09 (1.0 출시 직전) | [oEmbed 확인] |
| Beginners Guide To Making Blueprints in Satisfactory 1.0 | TotalXclipse | youtube.com/watch?v=r6VMyiPPPKo | 제목에 1.0 명시, 업로드일 미확인(검색 스니펫상 2024-09) | [oEmbed 확인] |
| How To Build The Perfect ALL IN ONE Starter Factory Blueprint in Satisfactory | TotalXclipse | youtube.com/watch?v=Q67rfeVUrbA | 업로드일 미확인 | [oEmbed 확인] |
| Satisfactory 1.0 Blueprint Designer Essential Tips and Creative Workarounds | THEGAMINGTECH | youtube.com/watch?v=aG9WJF_5LQM | 검색 스니펫상 2024-09, 제목에 1.0 명시 | Blueprint Designer Mk.2(5x5x5, 1.0 신규)의 활용법·우회법 다룸 [oEmbed 확인] |
| The Blueprints Every Satisfactory Player Needs ! | Overclocked | youtube.com/watch?v=1wxjVfvmNtw | 검색 스니펫상 2026-05 | [oEmbed 확인] |

### (7) 속도 진행(speedrun) 루트

| 제목 | 채널 | URL | 시기 | 비고 |
|---|---|---|---|---|
| Top 10 Satisfactory Speedrunning Tricks! | Epiphane | youtube.com/watch?v=u9s5eWNWA8Q | 업로드일 미확인 | [oEmbed 확인] |
| [Former WR] Beating Satisfactory in less than 2 hours! 4Package% speedrun in 1:59:37! [Glitched] | Epiphane | youtube.com/watch?v=kSlNUjCYOSU | 업로드일 미확인. 제목상 "글리치 이용 + 구 WR"이므로 **일반 진행 참고용으로는 부적합** — 순수 진행 루트가 아니라 버그 악용 경로다 | [oEmbed 확인] |

speedrun.com에 Satisfactory 공식 리더보드(`speedrun.com/satisfactory`)가 별도 존재하며, "4Package%" 등 카테고리가 이 게임 스피드런 커뮤니티의 표준 분류로 보인다 — 단, 이는 YouTube 채널이 아니라 스피드런 집계 사이트라 이 문서의 담당 범위(영어권 YouTube) 밖으로 별도 표시만 해둔다.

---

## 3. 주장이 갈리는 지점

### 매니폴드 vs 로드 밸런서
- 이 주제 자체가 **"Satisfactory에서 가장 논쟁적인 주제 중 하나"**라고 Gemzen 채널이 영상 소개에서 직접 표현할 정도로, YouTube 공략 채널들 사이에서도 정답이 통일되어 있지 않다.
- 여러 채널(Fjorim, SpectrumDad, Gemzen, 그 외 미확인 채널 O7cCL5sZgLE)이 **각각 별도로 "매니폴드 vs 로드 밸런서" 단독 비교 영상**을 만들었다는 사실 자체가, 이 주제에 대해 커뮤니티가 반복적으로 재논쟁해왔음을 시사한다. 다만 이번 조사에서는 각 영상의 **결론(어느 쪽을 권장하는지)까지는 본문을 열람하지 못해 확인하지 못했다** — oEmbed는 제목·채널명만 반환하고 본문 내용은 알려주지 않는다. 어느 채널이 어느 편을 드는지는 **미확인**으로 남긴다. 실제 결론 비교가 필요하면 각 영상을 직접 시청하거나 자막을 받아와야 한다.
- (참고: `docs/research/eco-reddit.md`에 Reddit/Steam 커뮤니티 쪽 매니폴드 vs 버스 논쟁이 이미 정리되어 있다. 그 문서는 "국지적으로는 매니폴드, 광역은 버스"라는 하이브리드 절충안을 커뮤니티 총의로 제시했다 — YouTube 쪽 개별 채널들의 결론이 이와 같은 방향인지는 이번 조사로 검증하지 못했다.)

### "1.0 이후에도 유효한 콘텐츠인가"에 대한 채널별 편차
- TotalXclipse, ImKibitz, Bitz, Merlin, GMODISM은 제목에 "1.0"을 명시하거나 1.0 출시 직후(2024-09) 업로드가 확인되어 **현재도 참고 가능**하다고 판단할 근거가 있다.
- Scalti의 대표작으로 검색된 "Water Tower Mechanics Guide"는 **2021년 업로드**로 확인되어, 채널 자체는 활동 중(2024-09 라이브스트림 확인)이지만 개별 구작 영상은 게임 메커니즘 변경(유체 역학, Water Tower 자체가 이후 리메이크됨)으로 인해 **그대로 신뢰하면 안 된다** — 영상 게시일을 반드시 확인 후 사용해야 한다는 사례로 남긴다.
- Nefrums처럼 "커뮤니티에서 이름은 알려져 있으나 실제로는 다른 게임(Factorio)이 본업"인 경우가 있어, 채널명만으로 장르를 판단하면 안 된다는 게 이번 조사의 방법론적 교훈이다.

---

## 4. 확인 못 함

- **Nefrums 채널의 Satisfactory 전용 영상**: 채널 존재는 확인했으나(구독자 약 2.3만), 이 채널이 업로드한 Satisfactory 콘텐츠를 단 하나도 특정하지 못했다. 사용자가 "속도 진행/효율" 채널로 지목했으나 이는 Nefrums의 Factorio 활동(스웨덴 기반 Factorio 스피드러너)과 혼동됐을 가능성이 있다.
- **Random Nick, The Game Dude의 Satisfactory 콘텐츠**: 동명 채널을 찾았으나 둘 다 Satisfactory와 무관해 보이는 콘텐츠였다. 사용자가 지목한 실제 채널을 특정하지 못했다.
- **전력 설계 전환 시점(바이오매스→석탄→연료→원자력) 전용 영상**: GMODISM 시리즈에 "Power Guide - Satisfactory New Player Guide EP18" 회차가 존재한다는 것은 검색 스니펫/Odysee 미러로만 확인했고, 해당 YouTube 영상을 직접 열람해 채널을 oEmbed로 재확인하지 못했다.
- **매니폴드 vs 밸런서 각 영상의 실제 결론(어느 쪽을 권장하는가)**: 제목과 채널명만 확인했고 본문 내용(스크립트·설명)은 열람하지 못했다.
- **ImKibitz의 정확한 구독자 수**: 집계 사이트마다 43.2만~62만으로 편차가 커서 확정하지 못했다. 갱신 주기 차이로 추정되나 원인은 미확인.
- **Bitz, GMODISM, Drawing Xaos, Merlin의 구독자 규모**: 위 채널들의 About 페이지가 JS 렌더링이라 이번 세션에서는 수치를 확보하지 못했다.
- **대체 제작법(alternate recipe) 우선순위를 전문으로 다루는 YouTube 채널**: Dekoba의 영상 1건 외에는 특정하지 못했다. 이 주제는 YouTube보다 티어리스트 웹사이트(tiermaker.com 등) 쪽 콘텐츠가 검색 상위를 차지하는 경향이 있었다.
- 이번 세션은 `WebSearch` 200회 한도를 모두 소진했다. 위 미확인 항목들은 한도가 초기화된 후 `WebSearch`로 재조사하면 채워질 가능성이 높다 — 특히 전력 설계·구독자 수·영상 본문 결론 확인은 추가 검색이 필요하다.

---

## 참고 URL (직접 확인)

- https://www.youtube.com/oembed?url=...&format=json — 모든 [oEmbed 확인] 태그의 근거. 개별 영상 URL은 본문 표에 병기
- https://www.letsplayindex.com/channels/134271-totalxclipse — TotalXclipse 구독자·영상 수·장르 비중 집계
- https://socialcounts.org/youtube-live-subscriber-count/UCo9CIGA3vGlkuGGzTLPvJ5g — Nefrums 실시간 구독자 수
- https://socialcounts.org/youtube-live-subscriber-count/UCGyW-KsOEbdbESJyiWonPqQ — Scalti 실시간 구독자 수
- https://streamscharts.com/channels/nefrums, https://www.twitchmetrics.net/c/132723785-nefrums — Nefrums가 Factorio 위주 스트리머임을 보여주는 근거
- https://www.speedrun.com/satisfactory — Satisfactory 공식 스피드런 리더보드(YouTube 채널은 아니지만 7절 교차참고)
