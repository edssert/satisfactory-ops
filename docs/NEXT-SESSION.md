# 이어받기 — 다음 세션 시작점

작성: 2026-08-19 (세션 한도로 중단)

## 지금 상태

저장소: https://github.com/edssert/satisfactory-ops (public, main, 푸시 완료)
로컬: `C:\Dev\satisfactory-ops`

### 끝난 것
- 문서 체계: `PRD.md` / `FRD.md` / `TRD.md` / `CLAUDE.md` / ADR 0001~0008
- 리서치 근거 28건: `docs/research/`
- 디자인 지시서: `docs/DESIGN-BRIEF.md`
- 게임 자산: 월드맵 2 + 건물 아이콘 27 (WebP, 648KB)
- **데이터 파이프라인 완성** — 아래 참조
- 스킬 3개 생성: `~/.claude/skills/{game-guide-app, landing-page-craft, modern-web-baseline}`

### 데이터 (가장 중요)
`scripts/build-data.mjs`가 로컬 게임 설치본의 공식 데이터 덤프에서 생성했다.
손으로 타이핑한 수치가 아니다.

    소스: Steam/.../CommunityResources/Docs/en-US.json (10.6MB, UTF-16LE)
    빌드: steamBuildId 24656030
    산출: items 750 / recipes 872 (대체 110) / buildings 539 / schematics 574 / milestones 42

게임 업데이트 시 `node scripts/build-data.mjs` 재실행으로 갱신 끝.

## 남은 것

### 1순위 — 결정 문서화 (리서치는 이미 있음, 쓰기만 하면 됨)
| 문서 | 근거 파일 |
|---|---|
| `adr/0009-frontend-architecture.md` | `research/arch-{zero-build,islands,spa,offline}.md` |
| `adr/0010-no-backend.md` | `research/arch-scope-backend.md` |
| `adr/0011-state-and-persistence.md` | `research/arch-scope-quality.md`, `data-clientside.md` |
| `adr/0012-data-storage.md` | `research/data-{browser-db,modeling,clientside,server-sql}.md` |
| `adr/0013-production-solver.md` | `research/data-modeling.md` (재귀 CTE / 순환 처리) |
| `adr/0014-save-file-import.md` | `research/save-{format,parsers,perf,extract}.md` |
| `ARCHITECTURE.md` | 위 결정들 종합 |
| `DATA-MODEL.md` | `research/data-modeling.md` |

**주의**: 아키텍처 심사위원 패널이 완주하지 못했다. 4개 제안서(`arch-*.md`)는 있으나
비교·채점이 없다. 직접 읽고 판단하거나, 심사 단계만 다시 돌린다.

### 2순위 — 구현
1. `index.html` + 앱 셸 + 라우팅
2. **F1 마일스톤 체크리스트** (중심 기능, `src/data/milestones.json` 이미 있음)
3. F2 입지 선정 — 맵 오버레이. 캘리브레이션 값은 `adr/0006`에 있음
4. F4 용어집 (`src/data/glossary.json` 이미 있음)
5. F5 계산기 (`src/data/recipes.json` 이미 있음)
6. GitHub Pages 활성화 — **`index.html`이 생긴 뒤에** 켤 것 (지금 켜면 404 배포)

### 3순위
F3 단계도 / F7 대체레시피 / F8 하드드라이브 / F9 공장상태 / F10 세이브파서 / F11 랜딩

## 미완료 리서치 (필요하면 재실행)
- 게임 진행/레시피/배치/전력/유체/물류/탐험/벤치마킹 8개 스코프 → 일부만 도착
- Reddit 커뮤니티 지식, GitHub 생태계 → 미도착
- `DIFFERENTIATION.md`, `RESEARCH-SUMMARY.md` → 미작성

워크플로 스크립트는 세션 디렉터리에 남아 있으나 **다른 세션에서 resume 불가**하다.
필요하면 새로 띄운다. 다만 `docs/research/`에 이미 근거가 많으니 재조사 범위를 좁힐 것.

## 확정된 제품 결정 (변경 시 PRD §6 갱신)
- 대상: 공개 제품 + 개인 진행 추적 1급
- 세이브 파서: 구현한다 (범위는 ADR-0014에서 조정 가능)
- 진행 추적: 공장 상태까지
- 언어: 한국어 + 게임용어 영문 병기

## 첫 명령 제안
```
docs/NEXT-SESSION.md 읽고 이어서 진행해줘.
1순위 ADR부터 쓰고 마일스톤 체크리스트 화면을 만들자.
```
