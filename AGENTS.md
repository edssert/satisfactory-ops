# AGENTS.md

문서 볼트 루트는 `C:\Dev\satisfactory-ops\satisfactory-ops-vault`다. 이 문서에서 `docs/`로
표기한 경로는 모두 해당 볼트 루트를 기준으로 한다. 저장소 루트는 Obsidian 볼트가 아니다.

이 저장소에서 일하는 **모든 AI 에이전트의 유일한 진입 문서**다. 사람용 소개는 [`README.md`](README.md),
제품 문서 진입점은 [`satisfactory-ops-vault/PROJECT-HUB.md`](satisfactory-ops-vault/PROJECT-HUB.md)다.
`CLAUDE.md`는 다른 도구의 호환용 포인터이며 별도 규칙 정본이 아니다.

문서·주석·커밋 메시지 본문은 한국어로 쓴다. 코드 식별자와 파일명만 영어다.

---

## 0. 실행 속도와 대화

- 프로젝트 기본 추론 강도는 `.codex/config.toml`의 `medium`이다. 사용자가 달리 지정할 때만 바꾼다.
- 우선순위는 **현재 사용자 지시 → 실제 파일·렌더·실행 결과 → 정본 문서 → 과거 계획**이다. 현재 증거와
  ROADMAP이 충돌하면 문서를 먼저 고치고 낡은 작업을 실행하지 않는다.
- `micro`·`bounded` 작업은 목표가 확인되면 읽기 배치 한 번 뒤 첫 코드·렌더·테스트 산출물을 만든다.
  계획 문서, 전수 조사, release 검증을 산출물보다 먼저 두지 않는다.
- 구현을 요청받은 가역적 앱 변경은 표적 검사와 실제 화면 확인 뒤 바로 앱에 연결한다. 사용자가 승인 게이트를
  요청했거나 권리·파괴적 변경·해결되지 않은 시각 이견이 있을 때만 멈춰 묻는다.
- 진행 보고는 중요한 결과·결정 변경·막힘만 자연스러운 한두 문장으로 쓰고 `완료/진행 중/다음` 틀을
  강제하지 않는다.
- 계획 UI는 여러 파일·단계가 실제로 남은 작업에만 쓰고, 별도 계획 문서는 `architectural` 작업에만 만든다.
- 변경 중에는 표적 검사를 쓰고 `verify:release`는 앱에 연결한 완료 경계에서 한 번만 실행한다.

---

## 1. 이 저장소가 무엇인가

Satisfactory(게임)의 **통합 공장 운영·설계 웹앱**이다. 목표 생산량 계산, 진행 가이드, 지도,
실축 수동 배치, 공정 검증과 시공 도면을 한 데이터 모델로 잇는다. 생산 계산기는 부가물이 아니라
기본 능력이다. SCIM의 기능 정확도를 바닥선으로 삼고, 더 명료한 UI와 계산→설계 인계로 앞선다.

기술적으로는 서버 없는 Astro 7 정적 사이트다. 게임 수치는 전부 게임 설치본에서 빌드타임에 뽑아 오고,
사용자 데이터는 브라우저를 벗어나지 않는다.

---

## 2. 절대 규칙

어기면 리뷰에서 되돌아온다. 각 줄의 "확인" 열이 기계로 잡는 방법이다.

| 규칙 | 왜 | 확인 |
|---|---|---|
| 게임 수치를 기억으로 쓰지 않는다 | 기억한 수치가 실제로 틀려 배포된 적이 있다 | 수치는 `src/data/app/*.json`에서 오거나 `src/lib/` 솔버가 계산한다. 새 사실은 `source` + `confidence`(`verified`/`consensus`/`disputed`/`unsourced`)를 붙이고 근거를 `docs/research/`에 남긴다 |
| 게임 자산의 transform·피벗·재질·포트 배치를 추정 보정하지 않는다 | 비활성 Euler, 메시 재중심화, 유사 재질 대체가 반복해서 거짓 통과했다 | 설치본 카탈로그→`game:graph`→공용 장면 계약 경로를 먼저 연결한다. 그래프 증거가 없거나 Blender가 원본 기능을 재현하지 못하면 `unknown/unimplemented`로 차단하고 제품별 각도·높이·색·투명도 보정을 만들지 않는다 |
| 설치 파일 조사를 일회성으로 버리지 않는다 | 같은 CDO·헤더·메시 피벗을 세션마다 다시 찾으며 오류와 비용이 반복됐다 | `FactoryGame/Content/` 전체 패키지와 `CommunityResources/Headers.zip`을 파생 그래프 입력으로 유지한다. 새 inspect 필드가 재사용 가치가 있으면 같은 작업에서 카탈로그·그래프 스키마·드리프트 검사로 승격한다 |
| 아이템·건물 이름을 코드나 마크업에 타이핑하지 않는다 | 게임 공식 한국어 로케일이 정본이라 손으로 쓰면 게임 화면과 대조가 안 된다 (D-011) | `src/lib/gamedata.ts`에서 조회한다. `npm run check:coverage`가 렌더된 HTML과 데이터를 대조해 잡는다 |
| 색은 `src/styles/tokens.css`의 커스텀 프로퍼티만 쓴다 | 하드코딩 hex는 테마 전환에서 깨진다 | `grep -rn "#[0-9a-fA-F]\{6\}" src/styles src/components \| grep -v tokens.css` — **기존 위반이 `map.css`·`ResourceMap.tsx`에 남아 있으니** 자기 diff에 새 줄이 늘지 않았는지만 본다. 의미와 진화 규격은 `docs/DESIGN.md` |
| 자원·상태 구분에 색상만 쓰지 않는다 | 색각 이상 대응 (`PRODUCT` QUAL-01) | 항상 텍스트·형태·패턴 중 하나를 병기한다 |
| 세이브 파일을 서버로 보내지 않는다 | `PRODUCT` 원칙 6, D-006 | `.sav` 파싱은 전부 브라우저 안에서 끝난다. 사용자 데이터를 외부로 보내는 코드를 추가하지 않는다 |
| 이 저장소를 OneDrive 안으로 옮기지 않는다 | `.git` 동기화가 저장소를 깨뜨릴 수 있다 | 위치는 `C:\Dev\satisfactory-ops` 고정 |
| `public/assets/` 게임 자산은 MIT 대상이 아니다 | 각 자산의 출처·사용 조건이 별도다 | `ASSETS.md`와 매니페스트의 출처 표기를 유지한다. 게임사 사칭을 금지한다 |
| 오래된 문서를 현재 규칙처럼 따르지 않는다 | Claude 조사와 초기 ADR을 근거에서 제외했다 | `PROJECT-HUB.md`에서 시작해 6개 정본과 다시 검증한 Research만 읽는다 |
| 값은 HTML에, 움직임만 JS로 | CSS 카운터 + 스크롤 애니메이션으로 숫자를 만들었다가 화면에 `0`이 남은 적이 있다 | `node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs <경로>` |
| 이견을 숨기지 않는다 | 커뮤니티 의견이 실제로 갈리는 주제가 여럿이다 (메인 버스 유용성 등) | 양쪽을 다 쓰고 어느 쪽이 왜 더 믿을 만한지 밝힌다 |

---

## 3. 처음 5분

```bash
node -v          # v22 이상. .nvmrc 는 22, 개발 기기는 v24.18.0 에서 돈다
npm ci
npm run data:check   # 커밋된 앱 데이터가 최신인지만 본다. 파일을 쓰지 않는다
npm run build        # dist/ 생성
```

기대 출력:

```
$ npm run data:check
  PASS  물 추출기 120 m³/분
  PASS  게임 원본 드리프트 없음
--check: 앱 데이터가 최신입니다. 파일을 쓰지 않았습니다.

$ npm run build
[build] 80 page(s) built
[sfops-service-worker] 서비스워커 생성: <파일 수>개 / <크기>MB 프리캐시 (버전 ...)
[build] Complete!
```

게임이 설치돼 있지 않아도 여기까지 전부 된다. `src/data/`가 커밋돼 있기 때문이다.

화면을 보려면:

```bash
npm run dev
```

`astro dev`는 **백그라운드로 떠서 명령이 즉시 끝난다.** 주소는
`http://localhost:4321/satisfactory-ops/` 다 — `base`가 `/satisfactory-ops`라 루트 `/`는 404다.
멈출 때는 `npx astro dev stop`.

---

## 4. 명령

`package.json`의 scripts 전부다. "판정"은 성공했을 때 보이는 것, "실패하면"은 그 코드가 뜻하는 것이다.

| 명령 | 언제 필요한가 | 판정 | 실패하면 |
|---|---|---|---|
| `npm ci` | 클론 직후 | — | Node 22 미만이면 `engines` 경고 |
| `npm run dev` | 화면을 눈으로 볼 때 | `Dev server running at http://localhost:4321` | 포트 충돌. `npx astro dev stop` 후 재실행 |
| `npm run build` | 배포물·스크린샷·커버리지 검사 전 | `80 page(s) built` + 서비스워커 생성 줄 | `gamedata.must()`가 던졌다면 데이터 참조가 깨진 것이다 — 없는 클래스명을 큐레이션 파일에 적었을 확률이 높다 |
| `npm run data:check` | 커밋 전 항상 | `앱 데이터가 최신입니다` | **exit 1** 입력 없음 · **exit 2** 검증 실패 · **exit 3** `src/data/app/*.json`이 낡음 → `npm run data:app`으로 다시 생성 |
| `npm test` | `src/lib/` 또는 `tests/`를 건드렸을 때 | `pass 152 / fail 0` | 골든 값 불일치. 수치를 바꾼 게 의도라면 테스트도 같이 고치고 근거를 남긴다 |
| `npm run check` | 타입만 볼 때 | `0 errors` | `npx astro check --minimumSeverity error`와 같다 |
| `npm run check:skills` | 저장소 스킬을 고쳤을 때 | `PASS 저장소 스킬 ...` | frontmatter·상대 참조가 깨졌거나 폐기 ADR·구형 모델·Claude 전용 검색 설정이 다시 들어왔다 |
| `npm run check:architecture` | 런타임 TS/TSX 경계를 고쳤을 때 | `no dependency violations found` | 순환, 미해결 import, lib/domain→UI, state→생성 데이터 경계를 위반했다 |
| `npm run check:hygiene` | 렌더·브라우저·테스트 뒤와 커밋 전 | 루트 임시 파일·비ASCII 폴더·테스트 번들 누출 0 | `debug.log`·`nul`·깨진 썸네일 경로·목적 폴더 밖 `output` 파일이 남았다 |
| `npm run db:check` | 큐레이션 JSON을 고쳤을 때 | `검증 통과.` + 적재 집계 줄 | **exit 2** 외래 키가 깨졌다 — 큐레이션이 참조하는 클래스명이 게임 데이터에 없다 |
| `npm run check:coverage` | 표·목록·그림을 고쳤을 때 | 모든 줄이 `PASS` | **exit 2** `dist/`가 없다(`npm run build` 먼저) · **exit 3** 화면이 데이터 행을 조용히 떨어뜨렸다. 필터가 행을 버리는 병이라 코드를 고쳐야 한다 |
| `npm run verify:quick` | 구현 체크포인트·커밋 전 빠른 회귀 | 데이터·단위 테스트·타입·문서·스킬·아키텍처·위생 검사 통과 | 실패한 개별 명령으로 좁힌다. 빌드·Chromium 전수 검사는 의도적으로 생략한다 |
| `npm run verify` / `verify:release` | **배포 또는 작업 전체를 끝냈다고 말하기 전** | 빠른 회귀 + 빌드 + 자산 + 접근성·반응형·설계판 실제 브라우저 검증이 순서대로 통과 | 앞 단계에서 죽으면 뒷 단계는 아예 안 돈다. 개별 명령으로 좁혀 본다 |
| `npm run data` | 게임이 패치됐을 때 (게임 설치 필요) | 1단→2단→테크→아이콘 색인까지 재생성 | 게임 설치본을 못 찾으면 exit 1. `--docs=` 나 `SATISFACTORY_DOCS`로 경로를 준다 |
| `npm run data:game` / `data:game:ko` / `data:app` | 위를 단계별로 | — | 1단은 새니티 13건, 2단은 검증 18건을 통과해야 파일을 쓴다 |
| `npm run db` | SQLite로 질의하고 싶을 때 | `.cache/game.db` 생성 | `node scripts/db.mjs "SELECT ..."` 로 임의 질의. DB는 커밋하지 않는다 |
| `npm run tech` / `npm run assets` | 테크 데이터·아이콘 색인을 다시 만들 때 | — | **`src/data/` 에 파일을 쓴다.** 다른 작업과 겹치면 충돌한다 |
| `npm run game:assets:check` | 설치본 메시·Blueprint·장면 레시피를 고쳤을 때 | `FactoryGame/Content` 패키지 23,057건 + Headers API + 모든 장면 계약 `PASS` | `.cache/game-asset-index/`가 없거나 CDO·Headers·메시 bounds·transform·재질·생산 표시등이 장면과 어긋났다 |
| `npm run game:graph` / `game:graph:check` | 설치본 색인·앱 데이터·탑뷰 계약을 연결하거나 검사할 때 | 노드·간선 수 + 드리프트 0 + 런타임 누출 0 | 입력 해시가 바뀌었거나 관계·상태 자산·런타임 경계가 끊겼다. 파생 DB는 `.cache/game-graph.db` |
| `npm run game:graph:query -- search <검색어>` | 설치 파일·메시·재질·장면·자산을 찾을 때 | 증거 경로가 붙은 JSON 행 | `building`, `trace`, `path`로 관계를 좁히고 포트는 `port <BuildClass> <PortId>`로 component·FactorySettings·bounds·material·Headers API를 한 번에 조회한다 |
| `npm run game:render:env` | Unreal 제품 렌더 환경을 재개할 때 | GitHub 조직·VS2022 필수 구성·UE 5.6.1-CSS·Starter Project·Wwise 통합 상태 | `WAIT`인 항목만 공식 설치/인증 경로로 복구한다 |
| `npm run game:assets:probe:unreal:package` | 실제 게임 probe 모드를 배치할 때 | Windows Shipping 모드가 `FactoryGame/Mods/SatisfactoryOpsRenderer`에 생성 | Wwise 미통합, UAT 빌드, 게임 CL/SML 범위 불일치를 먼저 고친다 |
| `npm run game:assets:probe:unreal` | fixture의 최종 런타임 자산 계약을 갱신할 때 | 기기마다 component·instance·material·texture·clearance·port JSON과 SHA | 스크린샷은 입력하지 않고 probe JSON만 그래프·Blender 장면에 연결한다 |
| `npm run test:sw` | 서비스워커를 고쳤을 때 | 런타임 테스트 통과 | 라우트가 자기 문서를 못 돌려주면 캐시 키가 빗나간 것이다 |
| `npm run test:save <경로.sav>` | 세이브 파서를 고쳤을 때 | 브라우저에서 실제 `.sav`를 먹여 본다 | 경로를 안 주면 `[실패] 세이브 파일 경로를 주세요` |
| `npm run font` | 서체를 바꿀 때 | 서브셋 생성 | 외부 도구 `pyftsubset`(fonttools)이 PATH에 있어야 한다 |
| `npm run render` | (현재 동작하지 않는다) | — | 대상 페이지(`dist/build/`)가 사라져 열지 못한다. 도면을 눈으로 볼 때는 아래 `shoot.mjs` / `shot-el.mjs`를 쓴다 |

### 화면을 본 뒤 판정하는 명령

```bash
npm run build
node .agents/skills/satisfactory-browser-evidence/scripts/squeeze.mjs guide      # 여러 폭에서 눌림·넘침·잘림
node scripts/shoot.mjs guide shot.png --w=1440                   # 화면 전체
node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs guide '.fc-svg' el.png   # 한 조각만
node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs guide        # JS 끄고 값이 남는지
```

경로는 **앞 슬래시 없이** 준다 (§7 참고). 첫 화면은 빈 문자열 `""`.
**찍은 PNG를 실제로 열어 봐야 한다.** 찍기만 하고 안 보는 것은 안 찍은 것과 같다.

---

## 5. 디렉터리 지도

| 경로 | 무엇 | 손대도 되나 |
|---|---|---|
| `src/pages/` | 라우트 = 파일. 정적 HTML이 기본값 | ○ |
| `src/components/` | Preact UI와 작업 공간. 화면 복잡도에 따라 컴포넌트 또는 라우트 단위 경계 | ○ |
| `src/lib/` | 순수 로직. DOM을 모른다 (솔버·배치·세이브 파싱) | ○ |
| `src/state/` | 사용자 데이터. 게임 데이터를 모른다 | ○ (스키마 바꾸면 마이그레이션 필수) |
| `src/styles/tokens.css` | 색·간격 실행 토큰. 의미 규격은 `satisfactory-ops-vault/docs/DESIGN.md` | ○ |
| `src/data/curated/*.json` | 수기 콘텐츠. 게임 객체는 **클래스명으로만** 참조하고 `confidence`·`sources` 필수 | ○ |
| `src/data/glossary.json` | 용어집 17건 (게임 원본에 없는 학습 레이어) | ○ |
| `src/data/*.json`, `src/data/ko/*.json` | **1단 생성물.** `scripts/build-data.mjs` 산출 | ✕ 손으로 고치지 않는다 |
| `src/data/app/*.json` | **2단 생성물.** 페이지가 import하는 유일한 데이터 | ✕ 손으로 고치지 않는다. 고쳐도 `data:check`가 exit 3로 잡는다 |
| `scripts/` | 데이터 생성·검증·스크린샷 도구 | ○ (파일 상단 주석에 목적·사용법·종료 코드가 적혀 있다) |
| `tests/` | `node --test`. 러너 의존성 0 | ○ |
| `public/assets/` | Coffee Stain Studios 자산 (맵·아이콘) | 추가만. 출처 표기 유지 |
| `satisfactory-ops-vault/` | 독립 Obsidian 볼트. 제품·기능·기술 정본, 결정, RFC, Runbook, Research | ○ (`docs/DOCUMENTATION.md` 적용) |
| `.agents/skills/` | Codex가 자동 라우팅하는 저장소 전용 정본 스킬 + 스크립트 | ○ |
| `.claude/skills/` | Claude Code 호환 포인터. 절차·스크립트 정본을 두지 않는다 | 포인터만 |
| `legacy/` | 이식 전 단일 HTML. 배포되지 않는다 | 참고용 |
| `output/` | 브라우저·시각 검수 증거. `playwright/`, `archive/<날짜-목적>/`처럼 목적별 하위 폴더만 둔다 | 생성물. gitignore 대상 |
| `dist/`, `.cache/`, `.astro/`, `.tmp-research/` | 생성물. gitignore 대상 | ✕ |

### 아일랜드 경계 (D-006)

- 문서·레퍼런스 화면은 HTML 우선이며, 상호작용이 실제 효용을 줄 때만 점진적으로 향상한다
- 계산기·공장 설계판·지도·세이브 진단은 각각 **독립 사용자 작업 공간** 하나를 라우트 단위 Preact 앱으로 구성할 수 있다
- 작업 공간 데이터는 페이지 props, 검증된 라우트 전용 정적 페이로드 또는 워커 청크로 공급한다. 전체 게임 데이터의 무분별한 번들링은 허용하지 않는다
- 경계의 크기는 관성으로 고정하지 않고 상태 결합도, 키보드 조작, Undo/Redo, 성능 프로파일로 판단한다

---

## 6. 데이터가 어디서 오는가

```
게임 설치본 CommunityResources/Docs/{en-US,ko}.json   ← 정본 (UTF-16LE)
      │  scripts/build-data.mjs            [1단] 정규화 + 새니티 13건
      ▼
src/data/*.json, src/data/ko/*.json        ← 커밋됨. 아이템 750 · 레시피 872(대체 110) · 건물 539 · 마일스톤 42
      │  scripts/build-app-data.mjs        [2단] en/ko 조인 + 최소 필드 + 역인덱스 + 검증 18건
      ▼  + src/data/curated/*.json (수기 판단. 클래스명으로만 참조)
src/data/app/*.json                        ← 커밋됨. 페이지가 import하는 것은 여기뿐
      │  astro build                       [3단] 빌드타임 렌더
      ▼
dist/                                      ← 정적 HTML + 아일랜드 JS + 서비스워커
```

**핵심 불변식: 마크업에 사람이 타이핑한 게임 수치가 0개여야 한다.**

- 1단은 **게임 설치가 필요하다.** 이 개발 기기에서는
  `C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json` 을 자동 탐색한다.
  다른 경로면 `node scripts/build-data.mjs --docs="D:/.../en-US.json"` 또는 환경변수 `SATISFACTORY_DOCS`.
- 게임이 없는 기기(그리고 CI)에서는 **1단을 돌리지 않는다.** 커밋된 산출물을 검증해 사용한다 (D-004).
- `--check`는 **최신성 검사**다. 파일을 쓰지 않고, 산출물이 원본·큐레이션과 어긋나면 exit 3로 죽는다.
  `npm run build`가 이것을 먼저 돌리므로, 조용히 틀린 수치가 배포될 수 없다.
- 게임 원본을 새로 해석해 필드를 쓰려 할 때는 §8의 `satisfactory-data-evidence` 절차를 반드시 밟는다.

---

## 7. 자주 밟는 지뢰

전부 이 저장소에서 실제로 난 일이다.

| 증상 | 원인 | 대처 |
|---|---|---|
| `node scripts/shoot.mjs /map/` 가 이상한 경로로 죽는다 | Git Bash가 `/map/`을 윈도 경로로 바꾼다 | **앞 슬래시 없이** 쓴다: `node scripts/shoot.mjs map`. 첫 화면은 `""` |
| `git add -A` 가 갑자기 깨진다 | Git Bash에서 `> /dev/null` 이 `nul` 이라는 **파일**을 만든다 | `rm -f nul`. 리다이렉트 대신 `2>&1 \| tail -n` 을 쓰거나 파일로 받는다 |
| node가 경로를 못 찾는다 | `/c/Users/...` 형태는 node에 안 먹는다 | `C:/Users/...` 를 쓴다 |
| `python - <<'PY'` 같은 큰 heredoc이 중간에 잘린다 | 셸 경유 heredoc이 자주 깨진다 | 패치 스크립트를 **파일로 써서** 실행한다 |
| `[hidden]` 을 걸었는데 요소가 계속 보인다 | `display`를 준 요소에는 `[hidden]`이 안 먹는다 | `[hidden] { display: none !important }` 를 명시하거나 조건부 렌더로 뺀다 |
| 세이브에서 수집품 개수가 16배 틀린다 | 세이브의 수집품 액터는 「주운 것」이 아니라 **「지나간 지역에 아직 놓여 있는 것」**이다 | 실제로 주운 목록은 레벨마다 따로 있는 `collectables` 다 |
| 화면이 "그때 필요한 벨트: 작업자용 엘리베이터"라고 답한다 | `mSpeed`는 컨베이어에서만 처리량이다. `FGBuildableElevator`에도 같은 필드가 있고 값이 800이다 | `node .agents/skills/satisfactory-data-evidence/scripts/field-scope.mjs mSpeed` 로 소유 클래스를 세고 `nativeClass`로 거른 뒤 쓴다 |
| 옆 칸이 한 글자 폭으로 눌렸다 | 한 칸에 `white-space: nowrap`을 주면 그 칸의 최소 너비가 벌어진다 | `min-width: 0`. 그리고 `squeeze.mjs`로 재 본다 |
| 숫자가 화면에 `0`으로 남는다 | 값을 CSS 카운터 + 스크롤 애니메이션이 만들었다 | 값은 서버가 렌더한 글자여야 한다. `nojs.mjs`로 확인 |
| 부동소수점 때문에 기계가 한 대 더/덜 나온다 | 올림 비교 | `src/lib/rational.ts`(BigInt 유리수)를 쓰고, 올림은 `Math.ceil(x - 1e-9)` |
| 조사가 첫 후보에 수렴한다 | 검색 결과가 한 해결 계열에 편향됐다 | 전역 `capability-harvest`로 공식·고별·최신 전문·인접 생태계를 능력 단위로 비교한다 |

---

## 8. 프로젝트 스킬 (`.agents/skills/`)

Codex가 요청에 맞는 스킬을 자동으로 라우팅한다. `.claude/skills/`는 Claude Code 호환 포인터만 두며
절차와 스크립트의 정본은 아래 네 스킬이다.

| 스킬 | 언제 | 딸린 스크립트 |
|---|---|---|
| `satisfactory-browser-evidence` | Astro·Preact·CSS 변경, no-JS 의미, 반응형·시각 완료 주장 | `squeeze.mjs`, `shot-el.mjs`, `nojs.mjs`를 한 브라우저 증거 경계로 통합 |
| `satisfactory-data-evidence` | 세이브·Docs.json·위키·커뮤니티 데이터의 의미를 제품 사실로 승격할 때 | `field-scope.mjs`로 필드 소유자를 센 뒤 독립 대조·자릿수·회귀 게이트 적용 |
| `satisfactory-knowledge-graph` | 설치본·생성 데이터·공정·설계·탑뷰 관계의 경로·영향·드리프트를 다룰 때 | 질문별 최소 투영, 출처·상태 보존, `game:graph:check` |
| `satisfactory-asset-reconstruction` | 메시·재질·Blueprint 조립과 제품 탑뷰 후보를 만들거나 승격할 때 | `run-validated-render.mjs`와 사람 승인 경계를 유지 |

사용자 전역 `~/.codex/skills/`에는 다음 자기개선 스킬이 있다. 저장소 클론에 포함되지는 않으므로 없는
환경에서는 `satisfactory-ops-vault/docs/research/capability-evaluation-method-2026.md`의 같은 절차를
직접 적용한다.

| 전역 스킬 | 책임 |
|---|---|
| `capability-harvest` | 기술·논문·저장소·스킬을 채택/기각하지 않고 능력 단위로 수집·다축 점수·파일럿·통합 |
| `skill-evolution` | 전역·프로젝트 스킬과 자기 자신을 감사해 낡은 가정·과도한 금지·범위 축소를 수정·검증 |
| `capability-radar` | 새 기술·릴리스·보안·호환성 변화를 주기 스캔해 앞의 두 스킬로 전달 |

`npm run build`가 선행돼야 하는 것: 프로젝트 브라우저 증거 스킬의 세 스크립트, `scripts/shoot.mjs`, `npm run check:coverage`.

> 참고: `factory-flow-diagram`(공정 흐름도 작도 규칙) 스킬은 이 저장소가 아니라 사용자 전역
> `~/.claude/skills/`에 있다. 저장소만 클론한 에이전트에게는 없으므로 찾지 마라.

---

## 9. 끝났다고 말하기 전 체크리스트

1. `npm run verify` 가 통과한다 — 데이터 최신성 → 단위 테스트 → 타입 검사 → 관계 검증 → 빌드 → 커버리지
2. 화면을 바꿨으면 `squeeze.mjs`를 돌리고 **스크린샷 PNG를 실제로 열어 봤다**
3. 새 게임 수치를 썼으면 `source` + `confidence`가 붙어 있고 근거가 `docs/research/`에 있다
4. 새 사실이 코드나 마크업에 타이핑돼 있지 않다 — 데이터에서 온다
5. 복수 도메인이나 데이터 계약을 바꾸는 기술 선택은 RFC와 결정 등록부에 반영했다
6. 기능을 바꿨으면 `PRODUCT.md`, 구조를 바꿨으면 `ENGINEERING.md`, 자산을 바꿨으면 `ASSETS.md`가 낡지 않았다
7. `git status`에 `nul`이나 `.tmp-research/` 산출물이 딸려 오지 않았다

검증 못 한 수치를 "대략"으로 채우지 않는다. 모르면 비워 두고 `openQuestions`에 남긴다.

---

## 10. 문서 지도

| 이 질문이면 | 이 문서 |
|---|---|
| 제품 범위·기능·품질·완료 조건은 | `satisfactory-ops-vault/docs/PRODUCT.md` |
| 모듈·데이터·런타임 경계는 | `satisfactory-ops-vault/docs/ENGINEERING.md` |
| 이 색·서체·모션을 어떻게 발전시키나 | `satisfactory-ops-vault/docs/DESIGN.md` (실행 토큰은 `src/styles/tokens.css`) |
| 자산·탑뷰·토대·운송 자산 규격은 | `satisfactory-ops-vault/docs/ASSETS.md` |
| 지금 유효한 큰 결정은 | `satisfactory-ops-vault/docs/DECISIONS.md` |
| 지금 무엇을 어떤 순서로 끝내나 | `satisfactory-ops-vault/docs/ROADMAP.md` |
| 검증된 외부 근거는 | `satisfactory-ops-vault/docs/research/` |
| Claude Code 운영 지침 | `CLAUDE.md` |
| 사람용 소개·라이선스 | `README.md` |

문서 변경은 `PRODUCT` → 영향받은 기술 정본 → `ROADMAP` 순서로 한다. 새 ADR·세션 로그·출처 채널별
조사 파일은 만들지 않는다.

---

## 11. 하지 않는 것

- 계산 기능 결손을 외부 도구 링크로 대신하지 않는다. 비교 링크는 교차 검증과 참고에만 쓴다
- 계산 결과를 자동 공간 배치하지 않는다. 필요한 설비와 조건을 대기열로 넘기고 사용자가 직접 설계한다
- 세이브 파일을 서버로 보내지 않는다
- 검증 못 한 수치를 "대략" 붙여 쓰지 않는다
- 게임사 브랜딩을 사칭하지 않는다. FICSIT 미학을 차용하되 공식 제품인 척하지 않는다
- 생성물(`src/data/*.json`, `src/data/app/*.json`, `dist/`)을 손으로 고치지 않는다
