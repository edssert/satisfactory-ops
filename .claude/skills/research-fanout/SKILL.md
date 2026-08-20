---
name: research-fanout
description: Plans a parallel research fan-out before launching subagents — divides the WebSearch budget explicitly per agent, assigns one output file per agent so scopes cannot overlap, allocates model and effort by task type, and routes known endpoints through WebFetch or curl so they never consume the shared search budget. Use before spawning two or more research subagents, when a research run stalls or runs out of searches, when collecting wiki numbers or community consensus, or when writing a subagent prompt. Triggers on 병렬 리서치, 에이전트 여러 개, 조사 분담, 검색 한도, WebSearch 한도, 서브에이전트 프롬프트, docs/research 추가.
license: MIT
---

# 병렬 조사 — 나가기 전에 예산부터 나눈다

## 이 스킬이 존재하는 이유

에이전트 6개를 한꺼번에 내보냈다가 중반에 WebSearch 한도가 바닥났다. 10개 주제 중
**1개만** 끝났다. 나머지 5개 에이전트는 검색이 막힌 채로 "찾지 못했습니다"를 반환했고,
그게 진짜 없어서인지 예산이 없어서인지 구분할 수 없었다.

한도는 **세션 전체가 공유한다.** 메인 대화도, 모든 에이전트도 같은 통에서 꺼내 쓴다.
이 저장소는 `.claude/settings.json` 에서 `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` 을
1000으로 올려 뒀다(조사가 본 작업인 프로젝트라서). 그래도 무한은 아니다.

---

## 1. 검색 없이 되는 것부터 뺀다

**WebSearch 와 WebFetch 는 다른 통이다.** 검색이 아니라 특정 URL 을 여는 것은 한도에
걸리지 않는다. 실제로 검색이 막힌 상태에서 이 방법으로 조사 4건을 마쳤다.

엔드포인트를 **아는** 것은 전부 여기로 보낸다. 셸에서 바로 확인할 수도 있다:

```bash
# 위키 문서 원문 (파싱된 HTML 말고 위키텍스트 — 표가 그대로 나온다)
curl -s "https://satisfactory.wiki.gg/api.php?action=parse&page=Power_Slug&prop=wikitext&format=json&formatversion=2"

# 위키 안에서 검색 — WebSearch 예산을 한 번도 안 쓴다
curl -s "https://satisfactory.wiki.gg/api.php?action=query&list=search&srsearch=power%20slug&format=json&formatversion=2&srlimit=5"

# GitHub 저장소 안 파일 목록 · 원문
curl -s "https://api.github.com/repos/<owner>/<repo>/contents/<dir>"
curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>"

# 데이터 파일이 언제 마지막으로 갱신됐는가 (pushed_at 말고 이것을 본다)
curl -s "https://api.github.com/repos/<owner>/<repo>/commits?path=<데이터파일>&per_page=1"
```

WebSearch 를 써야 하는 것은 **어디에 있는지 모르는 것**뿐이다: 커뮤니티 여론, 공략 글의
존재 여부, 논쟁의 양상. 수치는 대개 검색이 필요 없다 — 어느 위키 문서인지 알기 때문이다.

## 2. 예산을 숫자로 나눈다

프롬프트에 **"검색은 N회 안에서"** 를 적는다. 안 적으면 첫 에이전트가 다 쓴다.

| 일의 성격 | 1인당 WebSearch | 비고 |
|---|---|---|
| 아는 URL 에서 수치 수집 | **0~2회** | 위키 API·raw 파일. 검색이 필요 없다 |
| 특정 저장소·도구 조사 | **3~6회** | 후보를 찾을 때만 |
| 커뮤니티 여론·논쟁 수집 | **8~15회** | Reddit·포럼. 여기가 제일 비싸다 |
| 넓은 탐색(무엇이 있는지 모름) | **15~25회** | 한 차수에 한 명만 내보낸다 |

**차수를 나눈다.** 1차 3~4명 → 결과를 보고 2차. 6명을 한꺼번에 내보내면 중간에 방향을
틀 수가 없고, 예산도 한 번에 날아간다.

## 3. 스코프 = 출력 파일 하나 = 에이전트 하나

파일이 겹치면 스코프가 겹친 것이다. `docs/research/` 는 접두사로 갈라 둔다:

`eco-*` 생태계 · `arch-*` 아키텍처 · `data-*` 데이터 · `design-*` 디자인 ·
`save-*` 세이브 · `guides-*` 공략 · `progression-*` 진행 · `layout-*` 배치

프롬프트에 **인접 문서를 명시**한다: "`guides-reddit-manifold.md` 는 다른 에이전트가
맡았으니 매니폴드 논쟁은 조사하지 마라." 이게 없으면 둘이 같은 스레드를 읽는다.

## 4. 모델과 effort

| 일 | 모델 / effort |
|---|---|
| 수집·목록화·표 옮기기 | `sonnet` / medium — 넓게 병렬 |
| 아키텍처 판단·스키마 결정·교차검증 판정·ADR | 기본 모델 / high — 좁게 직렬 |
| 적대적 검증(내 결론을 깨 봐라) | 기본 모델 / high — 반드시 **다른** 에이전트에게 |

판단이 갈리는 문제는 **독립 제안 → 심사위원 패널 → 합성안**으로 간다. 한 에이전트에게
"조사하고 결론까지 내라"고 하면 자기가 찾은 것만으로 결론을 낸다.

---

## 5. 서브에이전트 프롬프트 골격

이 다섯 줄은 **모든** 조사 프롬프트에 넣는다. 빠지면 반환값을 신뢰할 수 없다.

```
## 검색 예산
- WebSearch 는 최대 N회. 초과 금지.
- WebFetch·curl 은 제한 없음. 아래 URL 은 검색 없이 직접 열어라: <목록>

## 규칙
- 수치에는 출처 URL 을 붙여라. 확인 못 한 것은 "미해결"에 적고 본문 표에 넣지 마라.
- 2차 요약(블로그가 위키를 옮겨 적은 것) 인용 금지. 1차 출처를 열어라.
- 접근이 막히면(로그인 벽·봇 차단) 우회했다고 쓰지 말고 **막힌 사실과 대체 소스**를
  문서 머리에 적어라.
- 결과를 `docs/research/<접두사>-<주제>.md` 에 **파일로 써라.** 반환값만으로는 안 된다.
- 예산이 모자라 못 끝냈으면 **어디까지 했고 무엇이 남았는지** 마지막에 적어라.
```

마지막 줄이 핵심이다. 이게 있으면 "못 찾았다"와 "예산이 없었다"를 구분할 수 있다.

---

## 6. 돌아온 뒤

- **반환값을 믿지 말고 파일을 확인한다.** 파일이 없으면 그 조사는 없던 것이다
- 수치는 `external-data-claim` 스킬의 절차로 대조한다. 조사 결과도 외부 데이터다
- 등급을 붙인다: `verified` / `consensus` / `disputed` / 미검증(앱에 안 넣음)
- 이견이 나오면 **양쪽 다 남긴다.** 한쪽만 남기면 다음 사람이 같은 조사를 반복한다
- 되돌리기 어려운 결정이면 ADR 을 쓴다. **기각한 대안과 사유**가 ADR 의 절반이다

## 반려 기준

- [ ] 에이전트마다 검색 상한을 **숫자로** 줬는가
- [ ] 아는 URL 을 WebFetch/curl 로 돌렸는가 (검색으로 낭비하지 않았는가)
- [ ] 에이전트마다 출력 파일이 하나씩이고 서로 안 겹치는가
- [ ] 인접 에이전트가 무엇을 맡았는지 프롬프트에 적었는가
- [ ] "예산이 모자라면 남은 것을 적어라"를 넣었는가
- [ ] 돌아온 뒤 `docs/research/` 에 파일이 실제로 있는가
- [ ] 판단이 필요한 일을 수집 담당 경량 에이전트에게 맡기지 않았는가
