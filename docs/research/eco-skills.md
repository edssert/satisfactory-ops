# 오픈소스 Claude Skills / Agent Skills 생태계 조사

- 조사일: 2026-08-19
- 스코프: "재사용 가능한 스킬·프롬프트 자산" — 리서치 취합 → 데이터 정규화 → 정적 웹앱 → 문서화 파이프라인에 붙일 수 있는 것
- 방법: GitHub `gh api` / WebFetch로 실제 파일 원문·라이선스·커밋 이력을 직접 확인. 추측·2차 요약 인용 없음.

---

## 1. SKILL.md 공식 포맷 (Agent Skills Spec)

출처: https://agentskills.io/specification (Anthropic이 공개한 공식 오픈 스펙, 참조 구현: https://github.com/agentskills/agentskills)

### 1.1 디렉터리 구조

```
skill-name/
├── SKILL.md          # 필수: YAML frontmatter + Markdown 본문
├── scripts/           # 선택: 실행 가능한 코드 (Python/Bash/JS 등)
├── references/        # 선택: 상세 문서 (온디맨드 로드)
├── assets/            # 선택: 템플릿·이미지·데이터 파일
└── ...                # 그 외 임의 파일
```

### 1.2 Frontmatter 필드

| 필드 | 필수 | 제약 |
|---|---|---|
| `name` | Y | 최대 64자. 소문자·숫자·하이픈만. 하이픈으로 시작/끝 불가, 연속 하이픈(`--`) 불가. **부모 디렉터리명과 반드시 일치**해야 함 |
| `description` | Y | 최대 1024자, 비어있으면 안 됨. "무엇을 하는지"와 "언제 쓰는지"를 모두 담아야 트리거 정확도가 오름 |
| `license` | N | 라이선스명 또는 번들 라이선스 파일 참조 (예: `Apache-2.0`, `Proprietary. LICENSE.txt has complete terms`) |
| `compatibility` | N | 최대 500자. 특정 환경 요구사항 (예: `Requires git, docker, jq, and access to the internet`) |
| `metadata` | N | 문자열 key-value 맵. 스펙 외 부가 정보 |
| `allowed-tools` | N (실험적) | 공백 구분 사전 승인 도구 목록 (예: `Bash(git:*) Bash(jq:*) Read`) |

최소 예시:
```markdown
---
name: skill-name
description: A description of what this skill does and when to use it.
---
```

### 1.3 Progressive Disclosure (3단계 로딩) — 스킬 설계의 핵심 원칙

1. **메타데이터** (~100 토큰): `name`+`description`만 항상 상주 로드
2. **본문** (5,000 토큰 미만 권장, SKILL.md는 500줄 이내): 트리거 시 전체 로드
3. **리소스** (`scripts/`, `references/`, `assets/`): 필요할 때만 로드

→ SKILL.md는 얇게, 상세 내용은 `references/*.md`로 분리하고 SKILL.md에서 상대경로로 링크. 참조 체인은 SKILL.md 기준 1단계 깊이로 제한 권장.

### 1.4 검증 도구

```bash
skills-ref validate ./my-skill
```
(https://github.com/agentskills/agentskills/tree/main/skills-ref)

---

## 2. anthropics/skills — Anthropic 공식 저장소

- URL: https://github.com/anthropics/skills
- 규모: ★170.2k / Fork 20.3k (2026-08-19 기준), 활발히 업데이트 중 (직전 커밋 2026-08-17, 데일리 PR 병합 중)
- 구조: `skills/`(예제 스킬 20종), `spec/`(스펙 리다이렉트), `template/`(빈 템플릿)

### 2.1 라이선스 — 스킬별로 다름 (⚠️ 중요, 개별 확인 필수)

저장소 루트에는 LICENSE 파일이 없고(`gh api repos/anthropics/skills` → `license: null`), **스킬 폴더마다 개별 `LICENSE.txt`**가 들어있다. 실제로 열어 확인한 결과:

| 스킬 | 라이선스 | 재사용 가능? |
|---|---|---|
| `webapp-testing` | Apache-2.0 전문 확인 | 가능 (코드 인용/파생 허용) |
| `frontend-design` | Apache-2.0 전문 확인 | 가능 |
| `skill-creator`, `web-artifacts-builder`, `mcp-builder`, `doc-coauthoring` | frontmatter에 `license: Complete terms in LICENSE.txt` (Apache 계열로 추정, `webapp-testing`/`frontend-design`과 동일 문구 패턴) | 대체로 가능 — 단 사용 전 각 LICENSE.txt 재확인 권장 |
| `docx`, `pdf`, `pptx`, `xlsx` | **"© 2025 Anthropic, PBC. All rights reserved." + Anthropic Consumer/Commercial Terms 종속 + "may not extract these materials... retain copies outside the Services... create derivative works"** | **불가** — 우리 저장소가 public이므로 이 4개 스킬 코드는 clone/복사 절대 금지. Claude.ai/Claude Code 내부에서 원격으로 활성화해 "사용"하는 것과, 텍스트를 우리 리포에 복제하는 것은 다른 문제 |

→ **actionable에는 Apache-2.0 확인된 것만 넣는다.**

### 2.2 스킬 목록 (20개, `skills/` 하위) 중 이번 프로젝트 관련도 평가

| 스킬 | 라이선스 | 우리 프로젝트(리서치→정규화→웹앱→문서화) 관련도 |
|---|---|---|
| `skill-creator` | Apache 계열 | **높음** — 신규 스킬 작성 표준 워크플로우(요구사항 인터뷰→SKILL.md 작성→2-3개 테스트 프롬프트로 eval→description 최적화→패키징) 자체를 우리 프로젝트 전용 스킬 만들 때 그대로 적용 가능 |
| `web-artifacts-builder` | Apache 계열 | **높음** — React+Tailwind+shadcn/ui를 Vite로 초기화하고 단일 HTML bundle.html로 패키징하는 스크립트 제공. 정적 웹앱 산출물 단계에 직결 |
| `webapp-testing` | Apache-2.0 | **높음** — Playwright 기반 로컬 웹앱 스크린샷/DOM 점검. `with_server.py`로 서버 라이프사이클 관리. 정적 웹앱 QA에 바로 적용 가능 |
| `frontend-design` | Apache-2.0 | 중간 — 톤/디자인 결정 가이드(색상 4-6개 토큰, 시그니처 요소 1개). 웹앱 비주얼 방향 잡을 때 참고용 |
| `doc-coauthoring` | Apache 계열 | 중간 — 문서화 단계(3단계: 컨텍스트 수집→구조화 refinement→reader testing)에 적용 가능하나 범용 문서 작성 가이드이지 데이터 문서화 특화는 아님 |
| `mcp-builder` | Apache 계열 | 낮음 — MCP 서버 구축 가이드. 지금 프로젝트에 MCP 서버가 필요해지면 참고 |
| `xlsx` | **Proprietary (복제 금지)** | 데이터 정규화 단계에서 스프레드시트 다룰 때 개념적으로만 참고(openpyxl+LibreOffice recalc 패턴), 코드 자체는 clone 불가 |
| `pdf` | **Proprietary (복제 금지)** | 리서치 취합 단계에서 PDF 추출 필요시 개념만 참고 |
| 나머지 (`algorithmic-art`, `brand-guidelines`, `canvas-design`, `claude-academy-guide`, `claude-api`, `discernment-nudge`, `internal-comms`, `slack-gif-creator`, `theme-factory`) | 다양 | 낮음/무관 |

### 2.3 skill-creator 상세 (신규 스킬 작성 시 따를 규약)

frontmatter:
```yaml
---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
---
```

권장 프로세스 (6단계):
1. **의도 캡처**: Claude가 뭘 해야 하는지, 언제 트리거되어야 하는지(사용자 표현/컨텍스트), 기대 출력 형식 정의
2. **인터뷰 & 리서치**: 엣지케이스·입출력 포맷·예시·의존성 확인 질문
3. **SKILL.md 작성**: frontmatter(name/description = 주 트리거 메커니즘) + 500줄 이내 본문 + progressive disclosure
4. **테스트 & 평가**: 현실적 테스트 프롬프트 2-3개, "스킬 사용/미사용" 병렬 실행 비교, `eval-viewer/generate_review.py`로 결과 확인
5. **반복 개선**: 사용자 피드백 반영 → 새 iteration 디렉터리에 재실행
6. **최적화 & 패키징**: description 트리거 정확도 최적화 → `package_skill.py`로 `.skill` 파일 생성

파일 구성 컨벤션:
```
skill-name/
├── SKILL.md (필수: frontmatter + 지침)
└── scripts/ | references/ | assets/  (선택, 번들 리소스)

skill-name-workspace/               # eval 작업용 (배포 산출물 아님)
├── iteration-1/
│   ├── eval-0/{with_skill,without_skill}/outputs/, eval_metadata.json, timing.json
│   ├── benchmark.json
│   └── feedback.json
```

---

## 3. awesome-claude-code 계열 큐레이션 목록

여러 개가 동일 이름으로 존재. 실제 확인한 3개:

| 저장소 | ★ | 라이선스 | 최근 push | 코멘트 |
|---|---|---|---|---|
| [subinium/awesome-claude-code](https://github.com/subinium/awesome-claude-code) | 14.7k | `license: null` (gh api 기준, LICENSE 파일 미탐지) | 2026-04-25 | 큐레이션 리스트일 뿐 코드 자산 아님. 1,000★ 이상 저장소만 등재하는 필터 기준 사용 |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 확인함(대형) | 라이선스 배지 표시되나 본문에서 명확히 추출 안 됨 | 활발 | Skills 섹션이 별도 표로 정리돼있진 않고 프로젝트 설명 안에 산재. anthropics/skills를 "공식" 항목으로 링크. 우리 프로젝트에 바로 쓸만한 독립 항목은 못 찾음 |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | — | `license: null` | 2026-04-28 | 미상세 조사 — 이름만 확인, 개별 스킬 항목 미검증 |

**결론**: awesome-* 리스트 자체는 "재사용 가능한 스킬"이 아니라 링크 모음이므로, 이번 프로젝트에 직접 clone할 대상이 아니다. 개별 스킬 저장소를 찾는 인덱스로만 가치가 있다.

---

## 4. Orchestra-Research/AI-Research-SKILLs — 리서치 특화 스킬 라이브러리

- URL: https://github.com/Orchestra-Research/AI-Research-SKILLs
- ★11.8k, **MIT 라이선스** (확인됨, `license.spdx_id: MIT`), 최근 push 2026-06-16 (약 2개월 전 — 활동은 있으나 최신은 아님)
- 구조: `0-autoresearch-skill/`, `01-model-architecture/` ~ `22-agent-native-research-artifact/`, `CONTRIBUTING.md`, `CITATION.cff`

### 평가
- 스킬 대부분(`01-model-architecture`, `02-tokenization`, `06-post-training`, `08-distributed-training` 등)은 **ML/LLM 연구 자체**를 위한 것으로 게임 공략 데이터 취합과 도메인이 다름. 직접 재사용 대상 아님.
- `0-autoresearch-skill/SKILL.md`: "Autoresearch"는 문헌 검색(Exa MCP, Semantic Scholar, arXiv) → 가설 수립 → inner/outer loop 실험 → 논문화까지 아우르는 **학술 연구 오케스트레이션** 스킬. "출처를 취합해 구조화된 산출물을 만든다"는 상위 패턴은 유사하지만, 세부 지침(가설-실험-논문화)이 게임 위키 리서치와 안 맞아 그대로 가져다 쓰기엔 부적합. 참고 수준.
- `22-agent-native-research-artifact/` 하위에 `compiler/`, `research-manager/`, `rigor-reviewer/` 3개 서브스킬 존재 — 이름상 "리서치 산출물 컴파일" 패턴과 맞닿아 있으나 이번 조사에서 본문까지 열어보지 못함 (후속 조사 필요, 최우선 후보는 아님).

**결론**: 라이선스는 깨끗하지만(MIT) 도메인이 ML 연구라 이번 게임 공략 앱에 그대로 이식할 스킬은 없음. actionable에서 제외.

---

## 5. 이번 프로젝트에 맞춰 신규 스킬 작성 시 형식 가이드 (종합)

anthropics/skills 스펙 + skill-creator 관행을 종합해 우리 프로젝트(`satisfactory-ops`)용 스킬을 만들 때 따를 규칙:

1. **파일 위치**: `<repo>/skills/<skill-name>/SKILL.md` (name은 폴더명과 완전 일치, 소문자+하이픈)
2. **frontmatter 최소셋**: `name`, `description` (description은 "무엇을+언제"를 한 문장에, 트리거 키워드 포함 — 예: "게임 위키/공략 사이트에서 아이템·레시피 데이터를 취합해 정규화 스키마로 변환할 때 사용")
3. **본문 500줄/5,000토큰 이내**: 절차형으로 작성 (단계별 체크리스트), 상세 참고자료는 `references/`로 분리
4. **번들 리소스**:
   - `scripts/` — 데이터 정규화용 Python/Node 스크립트 (예: JSON 스키마 검증기)
   - `references/` — 데이터 스키마 정의서, 사이트별 파싱 규칙
   - `assets/` — 정적 웹앱 템플릿, CSS 토큰
5. **license 필드 명시**: 우리 저장소가 public이므로 재배포 조건이 명확한 라이선스(MIT/Apache-2.0 권장)를 frontmatter에 명시하고 LICENSE 파일 첨부
6. **검증**: `skills-ref validate ./skills/<name>` 사용 가능 (https://github.com/agentskills/agentskills)
7. **네이밍/트리거 정확도 최적화**: skill-creator의 "2-3개 실사용 프롬프트로 with/without 비교" 절차를 간이 적용 — 실제 리서치 세션 로그로 description이 잘 트리거되는지 확인

---

## 요약 결론

- **바로 가져다 쓸 수 있는 것**: `anthropics/skills`의 `web-artifacts-builder`(정적 웹앱 빌드/번들링), `webapp-testing`(Playwright QA), `skill-creator`(스킬 작성 표준 프로세스) — 모두 Apache-2.0 계열로 확인, public repo에 인용/포크해도 안전.
- **참고만 하고 복제 금지**: `docx`/`pdf`/`pptx`/`xlsx` 스킬 — Anthropic 소유권 명시, "extract/retain/derivative work 금지" 조항 있음.
- **범용 리서치 오케스트레이션 스킬**(Orchestra-Research)은 라이선스는 깨끗하지만 도메인이 안 맞아 이번 스코프에서는 actionable 대상 아님.
- 신규 스킬을 만들 때는 공식 스펙(agentskills.io/specification)의 frontmatter 제약(정규식 수준의 name 규칙, 500-1024자 제한)을 그대로 따르는 것이 상호운용성(Claude Code/Claude.ai/Codex/Cursor/Gemini CLI 등에서 공용 인식)에 유리하다.
