# 재사용 스킬·기법 카탈로그

- 조사일: 2026-08-19
- 스코프: Claude Code Agent Skills 작성 규약(모범 사례) + 실제 공개 SKILL.md 패턴 추출 + 웹디자인/프론트엔드 스캐폴딩 관련 공개 스킬 목록 + 병렬 에이전트 오케스트레이션 패턴(팬아웃/심사위원/적대적 검증/갭 비평)의 스킬화 요령 + "무엇을 스킬로 만들 가치가 있는가" 판단
- 방법: `platform.claude.com` 공식 문서, `github.com/anthropics/skills` 원문, 커뮤니티 저장소(실제 SKILL.md 파일) 직접 확인. 인용은 URL 필수.
- 인접 문서: `docs/research/eco-skills.md`(동일 프로젝트 병렬 리서치, 스펙 원문·라이선스 조사 중복 최소화를 위해 이 문서는 "어떻게 잘 쓰는가"에 집중하고 스펙 필드 표는 요약만)

---

## 1. SKILL.md 프론트매터 — 공식 필드와 실제 제약

출처: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview), [agentskills.io/specification](https://agentskills.io/specification)

| 필드 | 필수 | 핵심 제약 | 비고 |
|---|---|---|---|
| `name` | Y | ≤64자, 소문자/숫자/하이픈만, 시작/끝 하이픈 불가, `--` 불가, **부모 디렉터리명과 일치**, `anthropic`/`claude` 등 예약어 금지 | 젠런드(gerund) 형태 권장: `processing-pdfs`, `analyzing-spreadsheets` |
| `description` | Y | ≤1024자, 비어있으면 안 됨 | 트리거 정확도의 90%를 결정하는 필드 — 아래 2절에서 상세 |
| `license` | N | 라이선스명 또는 번들 파일 참조 | |
| `compatibility` | N | ≤500자 | "대부분의 스킬엔 불필요"라고 공식 문서가 명시 |
| `metadata` | N | 문자열 key-value 맵 | |
| `allowed-tools` | N | 공백구분 사전승인 도구 목록, **실험적** | 예: `Bash(git:*) Bash(jq:*) Read` |

로딩 모델(3단계, 반드시 이해해야 스킬을 얇게 설계할 수 있음):

| 레벨 | 로드 시점 | 토큰 비용 | 내용 |
|---|---|---|---|
| L1 메타데이터 | 항상(기동 시) | ~100 토큰/스킬 | `name`+`description`만 |
| L2 본문 | 트리거될 때 | 5,000 토큰 미만 권장 | SKILL.md 본문 |
| L3 리소스 | 필요할 때만 | 접근 전엔 0 | `scripts/`, `references/`, `assets/` |

→ 실무적 함의: **SKILL.md는 "목차"처럼 써야 한다.** 상세 내용을 본문에 다 넣으면 트리거 안 됐을 때도 다른 스킬 100개분 메타데이터와 경쟁하는 컨텍스트를 낭비하지 않지만, 트리거된 후엔 본문 전체가 컨텍스트에 들어가므로 500줄/5,000토큰을 넘기면 대화 히스토리와 경쟁한다.

---

## 2. `description` 작성법 — 가장 중요한 단일 결정

공식 가이드([best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices))의 핵심 규칙 3가지:

1. **반드시 3인칭으로 쓴다.** "I can help you..." / "You can use this to..." 금지 — 시스템 프롬프트에 그대로 주입되므로 시점 불일치가 판별 정확도를 떨어뜨린다.
2. **"무엇을 하는지" + "언제 쓰는지"를 한 문장 안에 모두 담는다.** 둘 중 하나만 있으면 discovery 실패율이 오른다.
3. **트리거 키워드를 구체적으로 박아넣는다.** 사용자가 실제로 말할 법한 단어(파일 확장자, 도메인 용어, "사용자가 ~라고 말하면")를 넣어야 한다.

좋은 예 vs 나쁜 예 (공식 문서 원문):

```yaml
# 좋음
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# 나쁨
description: Helps with documents
description: Processes data
description: Does stuff with files
```

Claude가 잠재적으로 100개 이상의 스킬 중에서 고른다는 전제이므로, description은 "이 스킬만의 고유 신호"를 담아야 한다. 모호한 description은 discovery 자체가 실패한다(스킬이 존재해도 안 불림) — 이건 본문 품질과 무관한, 별개의 실패 모드다.

---

## 3. 본문 구조 — Progressive Disclosure 3개 패턴

출처: [best-practices §Progressive disclosure patterns](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

| 패턴 | 언제 쓰나 | 구조 |
|---|---|---|
| **고수준 가이드 + 참조** | 스킬이 "빠른 시작"과 "고급 기능"으로 나뉠 때 | SKILL.md에 Quick start 코드 + `[FORMS.md](FORMS.md)`, `[REFERENCE.md](REFERENCE.md)` 링크만 |
| **도메인별 분리** | 여러 독립 도메인을 다루는 스킬(예: BigQuery의 finance/sales/product) | `reference/finance.md`, `reference/sales.md` 등으로 쪼개 필요한 도메인만 로드 |
| **조건부 상세** | 기본 케이스는 흔하고 고급 케이스는 드물 때 | 본문엔 기본만, "For tracked changes: see REDLINING.md" 식으로 escape hatch만 남김 |

핵심 규칙 두 가지 (둘 다 실측 실패 사례에서 나온 규칙):

- **참조는 SKILL.md에서 1단계 깊이만.** `SKILL.md → advanced.md → details.md` 식 중첩 참조는 Claude가 `head -100`으로만 미리보고 끝내는 경우가 관찰됨 → 정보 누락. 모든 references는 SKILL.md에서 직접 링크되어야 한다.
- **100줄 넘는 참조 파일엔 목차(Contents)를 맨 위에 둔다.** partial read로도 전체 스코프를 파악할 수 있게.

### 3.1 실제 저장소에서 확인한 파일 트리 컨벤션

`anthropics/skills` 저장소의 `mcp-builder` 스킬 ([raw](https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md)):
```
mcp-builder/
├── SKILL.md          # 4단계 프로세스(리서치→구현→리뷰→평가) 개요만
└── reference/
    ├── mcp_best_practices.md
    ├── python_mcp_server.md
    ├── node_mcp_server.md
    └── evaluation.md
```
→ "언어/프레임워크별로 쪼갠다" 도메인별 분리 패턴의 실사례.

`frontend-design` 스킬 ([raw](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md))은 반대로 **참조 파일이 전혀 없는 단일 SKILL.md**다. 이유가 구조적으로 타당하다: 이 스킬은 "절차"가 아니라 "판단 기준"(디자인 리스크 감수, 자기비평 루프, AI 생성 디자인의 3가지 클리셰 회피)을 가르치는 스킬이라 코드/스크립트로 쪼갤 대상이 없다. → **스킬의 본질이 "체크리스트/코드"인지 "판단 휴리스틱"인지가 references 분리 여부를 결정한다.**

---

## 4. 자유도(degrees of freedom) 조절 — 과소평가되는 설계 축

출처: [best-practices §Set appropriate degrees of freedom](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

| 자유도 | 형식 | 쓸 때 | 예 |
|---|---|---|---|
| High | 산문 지침 | 여러 접근이 유효, 맥락 의존적 판단 | 코드 리뷰 절차 |
| Medium | 파라미터화된 의사코드/스크립트 | 선호 패턴은 있으나 변주 허용 | 리포트 생성 템플릿 함수 |
| Low | 정확한 스크립트, 파라미터 최소 | 깨지기 쉬운 순서, 일관성이 생명 | `python scripts/migrate.py --verify --backup` 외 다른 플래그 금지 |

비유: "절벽 사이 좁은 다리"(=low freedom, 정확한 안전장치 필요) vs "장애물 없는 열린 들판"(=high freedom, 방향만 주고 신뢰). **한 스킬 안에서도 섹션마다 자유도를 다르게 줄 수 있다** — 예: `webapp-testing`은 "스크린샷을 찍고 판단하라"(high)와 "정확히 이 스크립트로 서버를 띄워라"(low)를 같이 가진다.

---

## 5. 언제 스킬로 만들고 언제 만들지 않는가 — 판단 기준

공식 문서가 명시적 "만들지 마라" 리스트를 주진 않지만, 문서 전체에서 반복되는 신호를 종합하면:

**스킬로 만들 가치가 있다 (신호):**
- 같은 맥락 설명을 **세션마다 반복해서** 제공하고 있다 (best-practices의 "Develop Skills iteratively" 6단계 프로세스가 정확히 이 신호에서 출발함: "Notice what information you repeatedly provide")
- 절차에 **깨지기 쉬운 순서**나 **결정적 스크립트**가 있어 매번 새로 생성시키면 실패율이 오른다 (low-freedom 케이스 — "Solve, don't defer" 원칙과 직결)
- 도메인 지식(스키마, 명명 규칙, "테스트 계정은 항상 제외" 같은 룰)이 있고 이게 **여러 미래 작업에 걸쳐 재사용**된다
- description 한 문장으로 "언제 트리거되는지"를 명확히 말할 수 있다 — 말할 수 없다면 스코프가 너무 넓거나 좁다는 신호

**스킬로 만들 가치가 없다 (신호):**
- 1회성 작업이다 — 스킬의 전체 가치는 "재사용"에서 나오는데 재사용이 없으면 discovery 비용(다른 스킬들과 컨텍스트 경쟁)만 지불한다
- Claude가 이미 아는 일반 지식을 설명하는 문서가 된다 (best-practices의 "Concise is key": "Only add context Claude doesn't already have" — PDF가 뭔지 설명하는 150토큰 나쁜 예시가 정확히 이 실패 사례)
- description으로 "언제"를 특정할 수 없을 만큼 범용적이다 (`helper`, `utils`, `tools` 같은 이름이 나온다면 이미 실패)
- **평가(evaluation) 시나리오를 3개도 못 만들겠다** — 공식 문서는 "Build evaluations first, BEFORE writing extensive documentation"을 명시. 대표 태스크 3개를 못 떠올리면 아직 패턴이 응고되지 않은 것

**애매한 경우 — 서브에이전트 vs 스킬:** 오케스트레이션이 필요한 복잡한 다단계 작업(아래 7절)은 "스킬 하나"가 아니라 "스킬(절차 지식) + 서브에이전트 위임(실행)"의 조합으로 가는 게 맞다. 스킬은 *지식*을, 서브에이전트/Task는 *격리된 실행*을 담당 — 이 둘을 혼동해 하나의 거대 SKILL.md에 병렬 실행 로직까지 산문으로 우겨넣으면 Claude가 순차 실행으로 오해하는 실패가 관찰된다(7절 참조).

---

## 6. 웹앱 디자인 / 프론트엔드 스캐폴딩 관련 공개 스킬 목록

| 스킬 | URL | 특징 | 라이선스/신뢰도 |
|---|---|---|---|
| **frontend-design** (Anthropic 공식) | https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md | "디자인 리드"로 역할부여, AI 생성 디자인의 3대 클리셰(크림베이지+세리프+테라코타 / 거의검정+비비드 단일 악센트 / 신문형 그리드) 명시하고 회피 지침. 브레인스토밍→탐색→계획→자기비평→빌드→재비평 6단계 프로세스, 컬러 토큰 4-6개+타이포 역할별 지정+"시그니처 요소 1개" 규칙 | Apache-2.0 계열 (eco-skills.md에서 원문 확인됨) |
| **design-loop** (jezweb) | https://github.com/jezweb/claude-skills/blob/main/plugins/frontend/skills/design-loop/SKILL.md | "baton-passing loop" — 다중 페이지 사이트를 자율 반복 생성. `.design/SITE.md`(비전+사이트맵+로드맵), `.design/DESIGN.md`(팔레트/타이포/컴포넌트 소스오브트루스), `.design/next-prompt.md`(다음 페이지를 위한 "배턴" 릴레이 파일)로 상태를 파일시스템에 영속화. 7단계 루프(배턴 읽기→컨텍스트 확인→생성→네비게이션 통합→스크린샷 검증→문서 갱신→다음 배턴 작성) | `allowed-tools: Read Write Edit Glob Grep Bash`, `compatibility: claude-code-only` 명시 — 실제 스펙 필드 사용 사례 |
| **web-artifacts-builder** (Anthropic 공식) | https://github.com/anthropics/skills (`skills/web-artifacts-builder/`) | React+Tailwind+shadcn/ui를 Vite로 초기화 후 단일 `bundle.html`로 패키징하는 스크립트 제공 (eco-skills.md에서 상세 확인됨) — 정적 산출물 파이프라인에 직결 | Apache 계열 |
| **premium-frontend-ui** (github/awesome-copilot) | https://github.com/github/awesome-copilot/blob/main/skills/premium-frontend-ui/SKILL.md | 페이지 스캐폴딩 시 "경험으로 전환"하는 아키텍처 레이어(프리로더, 전환 애니메이션) 가이드. Claude Code 전용 아님(Copilot용) — 프롬프트 구조 참고용 | 저장소 라이선스 별도 확인 필요 |
| **frontend-dev** (MiniMax-AI) | https://github.com/MiniMax-AI/skills/blob/main/skills/frontend-dev/SKILL.md | 프리미엄 UI + 시네마틱 애니메이션 + AI 생성 미디어 자산 + 설득형 카피라이팅을 묶은 "완결형 랜딩페이지" 스킬 | 별도 확인 필요 |
| **agent-skills-library / web design 계열** (ConardLi/garden-skills) | https://github.com/ConardLi/garden-skills | "웹 디자인 엔지니어" 역할 — 제품 맥락 이해→디자인 시스템 선언→전체 경험 구축. AI 아티팩트를 "완성도 있는 결과물"로 바꾸는 데 초점 | 별도 확인 필요 |

**판단**: 이번 프로젝트(satisfactory-ops, 정적 웹앱)에 바로 참고할 우선순위는 `frontend-design`(디자인 톤/판단 기준) > `web-artifacts-builder`(빌드 파이프라인) > `design-loop`(다중 페이지 자율 생성 시에만 — 우리는 단일 대시보드형이라 당장은 낮은 우선순위, 다만 `.design/` 상태 영속화 패턴 자체는 배울 가치 있음).

---

## 7. 병렬 에이전트 오케스트레이션 패턴을 스킬로 정착시키는 요령

### 7.1 왜 이게 일반 스킬과 다른 문제인가

일반 스킬은 "Claude 한 인스턴스가 순차적으로 따를 절차"를 기술하면 된다. 하지만 팬아웃/심사위원 패널/적대적 검증/갭 비평은 **여러 에이전트 인스턴스 간의 조정**이 핵심이라, 이걸 산문으로만 기술하면 실행 엔진(Claude Code)이 "병렬"을 "내가 머릿속으로 여러 역할을 순서대로 흉내낸다"로 오해하고 실제로는 순차 실행해버리는 실패가 흔하다.

이 문제를 다루는 두 갈래 접근이 실제로 관찰된다:

- **워크플로우 스크립트 접근**: Claude Code가 스폰/라우팅/병렬화/조건분기를 "산문 지시"가 아니라 **실제 JS 프로그램**(하네스가 실행)으로 작성하게 하는 패턴. 조정 로직은 코드가 담당하고, 모델은 각 서브태스크의 판단만 담당. ([alexop.dev](https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/))
- **명시적 페이즈 번호 SKILL.md 접근**: 실제 사례인 `agent-review-panel` ([github.com/wan-huiyan/agent-review-panel](https://github.com/wan-huiyan/agent-review-panel))이 이 계열의 가장 상세한 공개 구현이다.

### 7.2 `agent-review-panel` 구조 분석 — 4개 패턴이 실제로 어떻게 SKILL.md에 인코딩되는지

이 스킬은 "4-6개 AI 리뷰어가 코드/계획을 두고 토론한 뒤 최종 심사위원이 판결"하는 적대적 리뷰 패널이다. 16개 명시적 phase(+13.5, 14.5 게이트)로 나뉘며, 사용자 질문의 4개 패턴이 전부 이 안에 대응된다:

| 사용자가 물은 패턴 | `agent-review-panel`에서의 구현 |
|---|---|
| **팬아웃(Fan-out)** | Phase 3-4: 4-6명의 리뷰어가 **`Agent` 툴로 병렬 스폰**되어 독립적으로 평가. 각자에게 다른 `reasoning_strategy`를 프롬프트에 주입해 강제로 관점을 다양화 (동일 모델이 같은 질문에 같은 답을 내는 걸 구조적으로 방지) |
| **심사위원 패널** | Phase 14: "supreme judge arbiter"가 리뷰어+검증 에이전트의 증거를 모아 판결. 중요한 디테일 — Phase 7에서 **"blind final scoring"**(각 리뷰어가 동료 결론을 보기 전에 독립적으로 먼저 점수를 확정)을 강제해 앵커링/동조 편향을 구조적으로 차단 |
| **적대적 검증** | Phase 5-7: 리뷰어들이 서로의 결론을 보고 1-3라운드 교차심문(cross-examination)하는 "debate" 단계. Phase 8-13은 별도 "verification agents"가 인용을 원문 대조, P0/P1 발견을 실제 코드 읽어서 재확인, 외부 사실은 웹서치로 검증 |
| **갭 비평** | Phase 13.5 "Pre-Judge Verification Gate": 판결 전에 모든 phase 산출물이 실제로 디스크에 존재하는지 확인하는 게이트. Phase 14.5: 심사위원이 새로 도입한 P0/P1 발견도 ground truth로 재검증 — "심사위원의 판단 자체도 무검증 통과시키지 않는다" |

**추출 가능한 일반 원칙 (스킬 작성 시 그대로 적용 가능):**

1. **페이즈를 번호로 명시하고, 테스트로 강제한다.** 이 저장소는 "16개 top-level phase(+13.5/14.5)가 SKILL.md에 전부 존재하는지"를 자동 테스트로 검사한다 — 산문 지침이 시간이 지나며 리팩터링되다 슬그머니 빠지는 걸 막는 장치. 오케스트레이션 스킬은 검증 가능한 구조(번호, 체크리스트)로 쓰지 않으면 침식(erosion)된다.
2. **각 서브에이전트 호출에 고정 파라미터를 강제한다.** 이 스킬은 모든 서브에이전트 스폰에 `model: "opus"`를 명시해 추론 편차를 없앤다. "적당한 모델 아무거나"로 두면 리뷰어 간 품질 편차가 패턴 자체를 오염시킨다.
3. **"블라인드" 단계를 구조적으로 분리한다.** 팬아웃 결과를 다른 에이전트가 보기 전에 "먼저 독립적으로 점수를 확정"시키는 스텝을 명시적 phase로 박아넣지 않으면, Claude는 자연스럽게 "다른 리뷰어 의견도 참고해서" 판단하려 하고 이게 바로 적대적 검증이 막으려는 동조 편향이다.
4. **판결자도 무검증 통과시키지 않는다(갭 비평 → 자기 자신에게도 적용).** 최종 심사위원 출력조차 별도 재검증 phase를 거치게 한 것이 이 스킬의 가장 차별적인 설계 — "누가 마지막에 말하든 그 말이 곧 진실이 되는" 흔한 실패를 막는다.
5. **파일시스템을 조정 매체로 쓴다.** Progressive disclosure 원칙(1-2절)과 같은 이유로, 페이즈 간 산출물을 컨텍스트로 들고 다니지 않고 디스크에 쓰고 다음 phase가 다시 읽게 하면(`design-loop`의 `.design/` 패턴과 동일 아이디어) 각 서브에이전트의 컨텍스트가 필요 이상으로 부풀지 않고, 게이트(위 1,4)가 "파일 존재 여부"라는 검증 가능한 조건으로 표현 가능해진다.

**주의점**: `agent-review-panel`은 500줄 제한을 명백히 초과하는 스킬로 보인다(16 phase + 게이트 + persona 정의를 다 넣으면). 공식 500줄 권장과 충돌하는데, 이런 고밀도 오케스트레이션 스킬은 **phase별로 references/ 하위 파일로 쪼개고 SKILL.md는 phase 목록 + 각 phase가 뭘 읽어야 하는지의 색인만 남기는 게** 정석 progressive disclosure에 맞다(3절 "도메인별 분리" 패턴을 "페이즈별 분리"로 응용).

---

## 8. 종합 체크리스트 (신규 스킬 작성 시)

공식 [best-practices 체크리스트](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#checklist-for-effective-skills) + 이 조사에서 추출한 항목:

- [ ] description이 3인칭이고, "무엇을+언제"를 모두 담고, 트리거 키워드가 구체적인가
- [ ] SKILL.md 본문이 500줄/5,000토큰 미만인가 — 넘으면 references/로 쪼갰는가
- [ ] references는 SKILL.md에서 1단계 깊이로만 링크되는가 (중첩 참조 금지)
- [ ] 100줄 넘는 참조 파일에 목차가 있는가
- [ ] 시간에 민감한 정보(특정 날짜 이후 API 변경 등)를 본문에 직접 안 쓰고 "Old patterns" 접이식 섹션으로 격리했는가
- [ ] 스크립트가 있다면 에러를 Claude에게 떠넘기지 않고 스스로 처리하는가("Solve, don't defer"), 매직 넘버에 주석이 달려있는가
- [ ] 평가 시나리오 최소 3개를 먼저 만들었는가 (본문 작성보다 먼저)
- [ ] (오케스트레이션 스킬인 경우) 페이즈가 번호로 명시되어 있고, 블라인드 단계·재검증 게이트가 구조적으로 분리되어 있는가
- [ ] 이 스킬이 정말 "재사용"될 것인가, 아니면 1회성 작업을 스킬 포맷으로 과잉설계한 것인가 (5절 기준)

---

## 요약 결론

description 한 줄이 discovery를 결정하고 본문 구조가 실행 품질을 결정한다는 이분법이, 조사한 모든 자료에서 일관되게 나온다 — 3인칭·"무엇을+언제"·구체적 키워드라는 3원칙은 공식 문서가 반복 강조하는 만큼 타협 여지가 적다. 본문은 "체크리스트/코드"형(references로 쪼개기 유리)과 "판단 휴리스틱"형(frontend-design처럼 단일 파일이 오히려 맞음)이 갈리므로, 스킬의 본질이 절차인지 판단기준인지부터 먼저 정해야 references 분리 여부가 정해진다. 웹디자인/프론트엔드 계열은 Anthropic 공식 frontend-design(판단 기준)과 web-artifacts-builder(빌드 파이프라인)가 라이선스와 완성도 모두에서 우선순위가 높고, design-loop의 `.design/` 파일 영속화 패턴은 다중 페이지 자율 생성이 필요해질 때만 채택 가치가 있다. 병렬 오케스트레이션은 일반 스킬과 다른 실패 모드(산문 지시가 순차 실행으로 오해됨)를 가지므로, agent-review-panel처럼 페이즈를 번호로 명시하고 자동 테스트로 구조 침식을 막고, 블라인드 스코어링과 판결자 재검증 게이트를 별도 phase로 분리하는 것이 팬아웃/심사위원/적대적 검증/갭 비평을 실제로 동작하게 만드는 핵심이었다. 다만 이런 고밀도 스킬은 500줄 권장선을 쉽게 넘기므로 phase별 references 분리가 사실상 필수다. 스킬로 만들 가치의 최종 판단 기준은 "반복해서 설명하고 있는가", "결정적 스크립트가 필요한 low-freedom 구간이 있는가", "평가 시나리오 3개를 지금 당장 쓸 수 있는가" 세 가지이며, 이 중 하나도 답할 수 없으면 아직 스킬화할 때가 아니라 원 프롬프트로 몇 번 더 반복해보는 게 맞다.
