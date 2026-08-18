# 랜딩페이지 설계 원리 — 2026년 기준 리서치

조사일: 2026-08-19. 방법: WebSearch로 트렌드/비평 확인 + WebFetch로 실제 라이브 페이지(linear.app, cursor.com 계열, raycast.com, warp.dev, figma.com, stripe.com, notion.com, wemod.com) 및 문서(w3.org, KRDS, Evil Martians 등)를 직접 열람. "어떤 사이트들은..." 식 서술 없이 각 발견에 출처 URL을 붙였다.

---

## 1. 실례 8건 구조 분해

전부 실제 페이지를 WebFetch로 직접 읽고 분해한 것이다 (2026-08-19 스냅샷 기준. 이 페이지들은 자주 리디자인되므로 "현재 시점" 기록으로 취급할 것).

| 제품 | 히어로가 보여주는 것 | 섹션 수(대략) | CTA 위치/개수 | 스크린샷·데모의 역할 |
|---|---|---|---|---|
| **Linear** [linear.app](https://linear.app) | "The product development system for teams and agents" — 헤드라인 3회 변주 + 실제 이슈트래킹 UI 스크린샷 3장 | 9 (히어로→Intake→Plan→Build→Diffs→Monitor→Changelog→고객 추천사→푸터) | 히어로 2, 섹션마다 1개(화살표), 하단 4개 — 총 12개 이상 전환 지점 | 각 섹션이 제품의 실제 기능(코드 diff, 대시보드)을 그대로 잘라 붙여 "사전 체험"시킴. 목업이 아니라 실제 UI |
| **Cursor** (VoltAgent DESIGN.md 분해, [github.com/VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)) | 72px `display-mega` 헤드라인 + 서브헤드 + 다운로드 버튼 아래 중앙 배치된 멀티팬 IDE 목업 | 8 (Nav→히어로→기능카드→비교/증언→타임라인→가격→CTA밴드→푸터) | 히어로(다운로드 대버튼+텍스트링크), 카드마다 소형 CTA, 푸터 전 풀폭 CTA밴드 | 실제 IDE 화면을 히어로에 바로 노출. 타이포는 전부 400 weight(매거진 스타일)로 "SaaS스럽지 않음"을 의도적으로 추구 |
| **Raycast** [raycast.com](https://raycast.com) | "Your shortcut to everything" + 키보드 레이아웃을 인터랙티브 비주얼로 표현, Fast/Ergonomic/Native/Reliable 4속성 강조 | 10 (Nav+히어로→핵심가치→확장성→AI기능→사용자증언→자동화→부가기능→커뮤니티→개발자API→푸터) | Mac/Windows 다운로드 2개(상단), 섹션 중간 다수, 하단 재강조 — 5+ 전환 지점 | 다크모드 전체 통일, 글래스모피즘 배경. 명령창 UI 자체가 브랜드 아이덴티티라 스크린샷=제품 그 자체 |
| **Warp** [warp.dev](https://www.warp.dev) | "The open platform for automating development" — 라이브 데모는 없고 대신 2버튼 분기(Factories 요청 vs 터미널 즉시 다운로드) | 9 (Nav→히어로→신뢰지표→고객로고→제품소개→고객평가→다운로드→설치가이드→푸터) | 히어로 상단 2버튼, 제품카드마다 개별 링크 | "718K active developers", "Fortune 500의 51%" 같은 숫자로 신뢰부터 쌓은 뒤 제품 설명 진입 |
| **Figma** [figma.com](https://www.figma.com) | "The intelligent canvas for infinite creativity" — 정적 스크린샷/브라우저 목업 다수, **인터랙티브 라이브 데모는 없음** | 4단계 메시지 계층(헤드라인→설명→시각증거→탐색경로) | 히어로 CTA + 하단 제품별 페이지 링크 | "보여주기"보다 "설명하며 보여주기". 방문자를 이해시킨 뒤 하위 페이지로 유도하는 깔때기형 |
| **Stripe** [stripe.com](https://stripe.com) | "Financial infrastructure to grow your revenue" + Amazon/Shopify/Uber/OpenAI 등 12개사 로고 슬라이더 | 8 (헤드라인+CTA→로고슬라이더→기능별 솔루션 6종→통계→사용사례별 세분화→기술스택→최신뉴스→최종CTA) | 히어로 2개("Get started", "Sign up with Google") + 최종 CTA | 신뢰(로고)→기능→증거(통계 "1.9T 거래액")→사례→기술→뉴스 순 점진적 설득 구조. 애니메이션 웨이브 배경은 장식이지 데모가 아님 |
| **Notion** [notion.com](https://www.notion.com) | "Where teams and agents Think together" + 파일 스택들이 회전하는 애니메이션 | 8 (Nav→히어로→신뢰지표→브랜드로고→기능3단계(Capture/Find/Automate)→유스케이스5종→고객증언→푸터) | "Get Notion free" + "Request a demo" 2트랙 분기 | "98% of Forbes Cloud 100" 같은 구체적 정량 수치 + CEO급 인물 실명 인용("Michael Truell, Cursor CEO") |
| **WeMod** (게임 컴패니언 앱) [wemod.com](https://www.wemod.com) | "Play Games Your Way, Without Limits" + Trustpilot 4.7/5 배지 + 이메일 캡처 오버레이 스크린샷 | 11 (Nav→히어로→가치제안→게임라이브러리(3,000+)→기능3종→인터랙티브맵→3단계프로세스(다운로드→커스터마이즈→플레이)→리뷰4종→접근성→FAQ→푸터) | "Download for Windows" 주CTA + "Get Started"/"Get download link" 보조 | 별점 배지와 실명 유저 리뷰(Oliver P., Emma F. 등)로 소셜프루프를 히어로에 바로 노출 — 개인 개발자 도구가 아니라 이미 대형화된 도구의 패턴 |

**8건에서 공통되는 것**: (1) 히어로는 거의 전부 **중앙 정렬 + 헤드라인 위/아래 시각요소**(Evil Martians 표현으로 "안정적이고 신뢰가 가는" 기본형)이고 좌우 분할형은 소수다. (2) CTA는 히어로에 1~2개(주+보조), 섹션마다 소형 CTA, 마지막에 풀폭 재강조라는 3계층 구조가 반복된다. (3) 스크린샷은 "목업"이 아니라 실제 제품 UI를 그대로 잘라 쓰는 경우(Linear, Cursor, Raycast)와 정적 예시 이미지로 설명을 보조하는 경우(Figma, Stripe)로 나뉜다.

### 메타 연구: Evil Martians, 개발자 도구 랜딩페이지 100개 분석
[evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025) (2025년 발표, 2026년에도 유효한 구조론)

공통 6단계 뼈대: **히어로 → 신뢰구축 블록 → 기능블록 → 사회적 증명 → 보조블록(비교표/FAQ/가격/체인지로그) → 최종 CTA**.

히어로 유형 6종을 실례와 함께 분류:
1. **정적 제품 UI** — Linear (스크린샷 중심, 담백)
2. **애니메이션 제품 UI** — PlayAI (동작으로 기능 시연)
3. **라이브 임베드** — Pixelcut (실제 작동하는 UI 요소를 페이지에 직접 삽입)
4. **코드 스니펫** — Tailwind (SDK/라이브러리형 도구에 적합)
5. **추상 일러스트레이션** — Recraft (UI가 없거나 기술이 숨겨진 제품용)
6. **전환 가능한 다중 UI** — 여러 사용 사례를 탭/토글로 보여주는 방식

기능 설명 카피의 강도 5단계(약→강): 기능 나열(Voiso) < 행동지향("빠르게 빌드하기", Fastgen) < 문제→해결 순서(Devinsight) < 담대한 진술("예산이 필요 없습니다", Animoto) < 미션 선언(Circle, CEO 명의).

신생 프로젝트의 신뢰 구축에 대한 이 리포트의 명시적 조언: "첫 고객, 팀 동료, 심지어 친구에게 한 문장 의견을 요청하라. 그것만으로도 충분하다."

---

## 2. 히어로 3유형 — 언제 무엇을 쓰는가

| 유형 | 정의 | 적합한 경우 | 실례 |
|---|---|---|---|
| **설명하는 히어로** (Tell) | 헤드라인+서브카피 중심, 시각요소는 보조적 정적 이미지 | 제품이 추상적(인프라·API·백엔드)이라 화면 자체가 매력을 설명 못 할 때, B2B 의사결정자 대상 | Stripe(결제 인프라), Warp(플랫폼 서사 — 라이브데모 없이 "Build your factory"/"Download" 2분기로 처리) |
| **보여주는 히어로** (Show) | 실제 제품 UI 스크린샷/애니메이션을 헤드라인과 동급 비중으로 배치, 클릭은 안 되지만 "이게 실물이다"를 증명 | 제품의 UI 자체가 차별점이거나(디자인 도구, 에디터), 한눈에 값어치를 알아볼 수 있을 때 | Linear(이슈트래커 UI), Cursor(IDE 목업), Raycast(커맨드팔레트), Figma("설명하며 보여주기"에 가까움) |
| **바로 써보게 하는 히어로** (Live Demo) | 히어로 안에 실제로 조작 가능한 위젯/임베드가 존재 — 방문자가 로그인 없이 핵심 동작을 즉시 체험 | 도구의 가치가 "한 번 만져보면 안다" 유형일 때(변환기, 계산기, 플레이그라운드류), 신뢰 자산이 없는 신생 프로젝트가 말 대신 행동으로 증명해야 할 때 특히 강력 | Evil Martians 리포트의 Pixelcut(라이브 임베드 사례) |

판단 기준: **"제품을 한 문장으로 설명 가능한가"**와 **"화면이 곧 셀링포인트인가"**의 교차로 결정된다. 인프라/API류는 Tell, 시각적 도구는 Show, 사용자가 로그인 전에 15초 안에 값어치를 느낄 수 있는 단일 기능형 도구는 Live Demo가 전환율에 가장 유리하다 — [saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)의 2026 트렌드 요약도 "임베디드 제품 미리보기·가이드투어가 히어로에 들어오는 추세"를 명시. 소규모 게임 유틸리티(세이브 에디터, 계산기, 배치 플래너류)는 대개 Live Demo 유형이 정답이다 — 신뢰 자산이 없는 만큼 "말로 설명"보다 "즉시 조작 가능한 계산표"가 가장 값싸고 확실한 신뢰 신호이기 때문.

---

## 3. 소셜 프루프 없는 신생 개인 프로젝트가 신뢰를 만드는 법

Indie Hackers 커뮤니티글 다수를 종합([indiehackers.com/post/low-hanging-social-proof-opportunities-for-indie-hackers-87718d4776](https://www.indiehackers.com/post/low-hanging-social-proof-opportunities-for-indie-hackers-87718d4776), [indiehackers.com/post/social-proof-when-you-have-none-fake-it-till-you-make-it-or-not-7361a4bf41](https://www.indiehackers.com/post/social-proof-when-you-have-none-fake-it-till-you-make-it-or-not-7361a4bf41)):

1. **사회적 증명이 없으면 그냥 없앤다** — 억지로 채우지 않는다. "0명의 리뷰"보다 "리뷰 섹션 자체가 없음"이 낫다.
2. **실명·실물을 내건다** — 만든 사람의 얼굴, 이름, SNS 링크를 붙이는 것만으로 신뢰가 급상승한다. "누군가 실제로 만들었다"는 신호 자체가 프루프다.
3. **투명성을 프루프로 바꾼다** — "private beta", "혼자 만들고 있음", 진행 상황 공개(체인지로그, 빌드 로그)가 텅 빈 증언 섹션보다 낫다.
4. **1문장짜리 지인 피드백도 충분하다** — Evil Martians 리포트와 동일한 결론. 첫 사용자·동료·친구의 한 줄 의견으로 시작하고, 나중에 실 사용자 후기로 교체.
5. **거짓 후기는 절대 금지** — 커뮤니티 컨센서스가 명확히 "가짜 소셜 프루프는 발각되면 신뢰를 영구히 잃는다"는 쪽. 없으면 없는 대로 두는 게 전략이다.
6. **제품 자체를 프루프로 쓴다** — 라이브 데모 히어로(위 2번 항목)는 사실상 "증언 없이도 되는 신뢰 구축"의 가장 강력한 대체재다. 계산이 실제로 맞으면, 그게 리뷰보다 강하다.

이 도메인(게임 유틸리티/컴패니언 도구)에 적용하면: 개발자 개인 이름과 왜 만들었는지 한 문단, Github 링크(오픈소스면 스타 수는 자연스러운 정량 프루프), 그리고 실제로 동작하는 계산기/뷰어를 히어로에 바로 노출하는 조합이 가장 정직하고 효과적이다.

---

## 4. AI가 만든 티가 나는 랜딩페이지 — 구체적 특징 (회피 대상)

3개 소스([www.925studios.co/blog/ai-slop-design-tells](https://www.925studios.co/blog/ai-slop-design-tells), [www.monet.design/blog/posts/escape-ai-slop-landing-page-design](https://www.monet.design/blog/posts/escape-ai-slop-landing-page-design), [prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)) 종합.

| 항목 | AI 티가 나는 패턴 | 근본 원인 |
|---|---|---|
| **폰트** | Inter(또는 Poppins) 하나로 전체 통일, 위계 없음 | "Inter가 선택됐다는 것 자체가 아무도 타이포그래피를 결정하지 않았다는 신호" — 튜토리얼 기본값이 그대로 학습데이터에 흡수됨 |
| **색상** | 파랑→보라 그라디언트, shadcn 기본 회색만 사용 | Tailwind UI가 5년 전 버튼 기본색으로 `bg-indigo-500`을 채택 → 수천 튜토리얼에 확산 → LLM 학습데이터의 통계적 중앙값이 됨. "2026년 가장 시끄러운 AI 티" |
| **레이아웃** | 아이콘 얹은 카드 3열 그리드, 모든 요소 중앙정렬, 예측 가능한 균등 간격 | Tailwind 그리드 데모 튜토리얼의 표준 구성이 그대로 복제됨. "The universal AI template" |
| **모서리/그림자** | 과도한 둥근 모서리 + 은은한 그림자를 모든 카드에 균일 적용 | 컴포넌트 라이브러리 기본값을 무비판적으로 사용 |
| **아이콘** | Heroicons/Lucide의 얇은 선 아이콘을 카드마다 상단에 하나씩, 상호교환 가능할 정도로 무개성 | "모든 튜토리얼이 이 아이콘셋을 쓰기 때문" |
| **카피** | "Build faster. Ship smarter." 류의 무게감 없는 헤드라인, 구체성 없는 동사+형용사 조합 | 특정 인물/문제를 겨냥하지 않은 평균적 표현으로 수렴 |
| **애니메이션/효과** | 글래스모피즘 남용, 미묘한 페이드인만 반복 | 목적 없는 장식적 모션 |
| **빠져 있는 것** | 의도적 색채 이론, 타이포그래피 페어링, 여백의 전략적 활용, 브랜드 특유의 개성, 접근성 디테일(포커스 상태, 필수필드 표시 등) | "LLM은 디자이너가 아니라 통계적 패턴 매칭기 — 모호한 프롬프트를 받으면 학습데이터의 평균값으로 채운다" |
| **피드백 루프** | 2025년 초에 신선했던 패턴이 2026년 중반엔 이미 클리셰 | 튀는 사이트가 주목받으면 다음 학습데이터에 편입되어 "더 표준적인" 패턴으로 재생산됨(자기강화) |

회피 전략 (Monet 정리):
1. Mobbin/Dribbble/Lapa Ninja 등에서 고품질 레퍼런스를 먼저 모아 AI에 시각 자료로 제시 (텍스트 프롬프트만으로 맡기지 않는다)
2. 색상·폰트·간격 토큰을 디자인 시스템으로 먼저 정의하고 그 안에서만 생성
3. 목적 있는 모션만 사용(스크롤 페이드인, 마퀴 루프 등, 300ms 이하)
4. 검증된 컴포넌트 라이브러리로 시작해 커스터마이징
5. 브랜드 보이스, 고유 색상, 비표준 레이아웃, 실제 콘텐츠·실사례로 개성을 주입

**이모지를 섹션 마커로 쓰는 것**은 위 3개 소스에 직접 언급되진 않았지만 동일 계열의 "무비판적 기본값" 패턴이다(🚀 "Fast", 💡 "Ideas" 같은 표제 이모지) — Cursor DESIGN.md 등 실제 프로덕션 페이지 어디에도 이런 이모지 마커는 없었다는 점이 방증: 대신 정제된 타이포와 얇은 라인 일러스트/실스크린샷을 쓴다.

---

## 5. 한국어 랜딩페이지 타이포그래피 관행

### 본문 폰트
- 정부 디자인 시스템 KRDS는 국문·영문 모두 **Pretendard GOV**를 기본 서체로 지정 — [krds.go.kr/html/site/style/style_03.html](https://www.krds.go.kr/html/site/style/style_03.html)
- 일반적으로 고딕(산세리프) 계열이 표준이며 노토 산스·나눔고딕·스포카 한 산스가 대체 후보로 흔히 언급됨.

### 폰트 크기 체계 (KRDS 기준, PC/모바일)
| 레벨 | PC | 모바일 |
|---|---|---|
| Display | 60px → 36px | 44px → 28px |
| H1 | 40px | 28px |
| H2 | 32px | 24px |
| H3 | 24px | 22px |
| H4 | 19px | 19px |
| H5 | 15~17px | 15~17px |
| Body Large | 19px | 19px |
| Body Medium(기본) | 17px | 17px |
| Body Small | 15px | 15px |
| Body Xsmall | 13px | 13px |

### 행간(line-height)
- WCAG 2.1 기준 **최소 1.5배**, 실무 권장값은 **1.5~1.75배** — [remain.co.kr/page/designsystem/line-height.php](https://www.remain.co.kr/page/designsystem/line-height.php)
- KRDS는 본문 최소 150% 이상을 명시.
- 한글은 라틴 알파벳보다 글자 자체가 정사각형 블록에 가까워 좁은 행간에서 더 빨리 답답해 보이므로, 영문 웹 관행(1.4~1.5)보다 한 단계 더 여유 있게 잡는 것이 일반적.

### 자간(letter-spacing)
- KRDS 기준 본문(Body large/medium/small/xsmall)은 **자간 0px**이 기본값. Display는 1px, Heading은 0~1px로 크기에 따라 소폭 조정.
- 20pt 이상 큰 사이즈에서는 폰트 자체의 넓은 기본 자간을 줄여줘야 가독성이 유지된다는 것이 일반 원칙(국문·영문 공통).

### 국영문 혼용
- W3C 한국어 텍스트 레이아웃 요구사항([w3.org/TR/2015/WD-klreq-20150414/ko](https://www.w3.org/TR/2015/WD-klreq-20150414/ko/))의 권고: 부호류·연산기호류와 한글 사이는 8분각 공백을 기본으로 삽입하되, 숫자·로마자와의 사이는 0을 기본으로 한다 — 즉 한글과 영단어가 바로 붙을 때는 추가 공백을 넣지 않는 것이 원칙.
- 한글 조판은 **양끝 정렬(justify)**이 기본이며, 영문이 섞일 경우 좌측 정렬을 우선한다는 것이 실무 가이드의 공통된 조언 — 영문은 대소문자 혼용으로 국문보다 여백 편차가 커서 우측/양끝 정렬 시 시각적 안정성이 떨어지기 때문.
- 랜딩페이지 실무에서는 제품명·기술 용어(예: "API", "CTA", "Live Demo")는 영문 그대로 두고 조사만 한글을 붙이는 방식이 일반적이며, 이때 영문 앞뒤에 최소한의 자간 여유(0~1px)를 주는 것이 KRDS 수치와도 일치한다.
- 글줄 길이는 한 줄에 40~60자 권장 — 넘으면 다단 레이아웃 고려.

---

## 요약 판단 (이 문서를 만드는 사람에게)

실제 프로덕션 8건을 다 열어보면, "화려함"으로 신뢰를 사는 페이지는 하나도 없었다 — Linear·Cursor·Raycast는 실제 제품 화면을 그대로 히어로에 박아 넣고, Stripe·Notion은 화면 대신 숫자와 로고로 신뢰를 먼저 깔고 들어간다. 이 두 갈래(제품 실물을 보여주거나, 신뢰 지표를 먼저 보여주거나) 바깥의 "설명형 카피 + 장식적 그라디언트"는 실무 레퍼런스 어디에도 주력으로 쓰이지 않았다.

