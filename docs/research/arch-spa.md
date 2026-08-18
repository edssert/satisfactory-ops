# 아키텍처 제안 — 반응형 SPA, 상태 중심

> 제안자 관점: **프론트엔드 아키텍트 / 상태 중심 SPA**
> 대상: satisfactory-ops (Satisfactory 공장 설계 플레이북)
> 작성일: 2026-08-19
> 결론 한 줄: **Vite 8 + Svelte 5 + 단일 진행상태 스토어 + 서비스워커 오프라인 캐시.** 6개 화면은 독립된 페이지가 아니라 **하나의 상태에서 파생된 6개의 뷰**다.

---

## 0. 이 제안의 핵심 주장

이 앱의 가치는 "계산해준다"가 아니라 **"지금 내 상황에서 다음에 뭘 해야 하는지 알려준다"** 이다.
"내 상황"은 곧 상태다. 어떤 마일스톤을 깼는가, 어떤 대체 레시피를 갖고 있는가, 본진을 어디에 잡았는가, 벨트는 몇 티어인가.

정적 문서 6장을 나열하면 이 가치는 **사라진다.** 사용자가 자기 상황을 매번 머릿속에서 문서에 대입해야 하기 때문이다.
그 대입을 앱이 대신 해주는 것이 이 프로젝트의 존재 이유이며, 그것은 정의상 **상태 중심 SPA**다.

구체적으로, 상태 하나가 바뀌면 여섯 화면이 동시에 달라진다.

| 사용자 행동 | 파생되는 변화 |
|---|---|
| ① 마일스톤 "Coal Power" 체크 | ④ 계산기의 사용 가능 레시피 집합 확대, 기본 벨트 Mk.1 → Mk.2, ② 맵에서 석탄 노드와 인접 수원 강조, ③ 성장단계도가 "석탄 발전 단계"로 이동, ⑤ 용어집에서 `매니폴드`·`오버플로 싱크` 잠금 해제 |
| ② 맵에 "석탄 A (순수, 4노드)" 핀 등록 | ④ 계산기가 원료 공급 상한을 알게 됨 → "석탄 480/min 필요, 이 부지 최대 240/min" 경고 |
| ④ 계산기 결과 "제련기 24대" | ⑥ 레퍼런스 표에서 해당 행 강조, ① 체크리스트에 "제련기 24대 필요 → 철 주괴 생산 확장" 액션 제안, 전력 예산 자동 가산 |
| ⑤ 용어 학습 완료 표시 | ③ 다이어그램의 해당 툴팁이 사라짐 (학습 레이어가 점점 걷힌다) |

이 표의 화살표들이 곧 **derived 그래프**다. 이 그래프를 코드로 자연스럽게 표현할 수 있는 도구를 고르는 것이 아키텍처 선택의 전부다.

---

## 1. 스택 결정과 근거

### 1.1 프레임워크: Svelte 5 (SolidJS 아님)

두 후보 모두 컴파일러 + 파인그레인드 시그널이고 런타임은 한 자릿수 KB다. 성능 차이는 이 앱 규모에서 **측정 불가**다. 그래서 성능이 아니라 **1인 유지보수 리스크**로 갈랐다.

- **SolidJS 2.0은 2026년 3월부터 베타다.** 알파를 건너뛰고 beta.0이 나왔고, async 일급 지원·Suspense 재작업·결정적 배칭 등 breaking change가 진행 중이다. SolidStart도 2.0 알파다. 지금 1.x로 시작하면 이 앱의 수명 안에 2.0 마이그레이션이 걸리고, 2.0 베타로 시작하면 API가 발밑에서 움직인다. **1인 개발자에게 둘 다 나쁜 선택이다.**
- **Svelte 5는 안정판이고 runes가 표준이다.** Svelte 6은 아직 없다 (2026년 8월 기준 svelte.dev 공식 블로그가 다루는 것은 Svelte 5 계열과 SvelteKit 2.70 안정 / 3.0 프리뷰다). 즉 **지금 쓰는 API가 당분간 그대로 간다.**
- 결정적 이유: **runes는 `.svelte.ts` 파일에서 컴포넌트 밖으로 나온다.** `$state`/`$derived`를 순수 TS 모듈에 쓸 수 있으므로, 상태 스토어를 컴포넌트 트리와 무관한 도메인 모듈로 만들 수 있다. 별도 상태관리 라이브러리(zustand/nanostores/xstate)가 **필요 없다.** 의존성 1개 줄이는 문제가 아니라, "상태의 진실은 어디에 있는가"라는 질문 자체가 사라진다.
- 생태계도 Svelte가 약 2배 규모다(주간 다운로드 기준). 막혔을 때 검색으로 풀릴 확률이 그만큼 높다. 1인 개발에서 이건 실질 비용이다.

### 1.2 SvelteKit을 **쓰지 않는다**

의도적 선택이다.

- SSR/프리렌더가 필요 없다. 이 앱은 최초 1회 방문 후 **서비스워커 캐시에서 뜬다.** 알트탭 사용 맥락에서 지배적인 시나리오는 "재방문"이고, 재방문 TTI를 결정하는 것은 SSR이 아니라 SW다.
- SvelteKit 3가 프리뷰 중이다. 프레임워크 위의 프레임워크는 **업그레이드 트레드밀을 하나 더 얹는다.** 1인 개발의 최대 적이다.
- GitHub Pages base path(`/satisfactory-ops/`) 처리, adapter-static 설정, prerender entry 지정 같은 순수 설정 노동이 사라진다.

대신 **약 40줄짜리 해시 라우터**를 직접 쓴다(§2.3). 이것이 GitHub Pages의 SPA 문제를 통째로 회피한다.

### 1.3 최종 스택

```
빌드        Vite 8 (2026-03 안정, Rolldown 단일 번들러 — 빌드 10~30배 빠름)
UI          Svelte 5 (runes)
언어        TypeScript strict
라우팅      자작 해시 라우터 (~40 LOC) + 동적 import 코드 스플리팅
상태        runes 스토어 (src/state/*.svelte.ts) — 외부 상태 라이브러리 0개
영속화      localStorage (버전드 스키마 + 마이그레이션) + JSON 내보내기/가져오기
오프라인    vite-plugin-pwa (Workbox) — 전량 precache
스타일      순수 CSS + CSS 변수 (다크 기본). UI 프레임워크 0개
아이콘      기존 webp 27개 그대로 + 인라인 SVG 소량
도식        손으로 그린 SVG (그래프 레이아웃 라이브러리 없음)
테스트      Vitest (솔버 집중) + Playwright 스모크 1개
CI/CD       GitHub Actions → size-limit 게이트 → actions/deploy-pages
데이터      scripts/build-data.mjs (Docs.json UTF-16 → 압축 JSON, 결과물 커밋)

런타임 의존성 총합: svelte 1개. 그 외 전부 devDependencies.
```

**런타임 의존성 1개**가 이 제안의 자랑이자 방어선이다. 3년 뒤 `npm i`가 깨질 확률이 가장 낮은 구성이다.

---

## 2. 상태 아키텍처 — 이 앱의 실체

### 2.1 단일 스토어, 파생 그래프

```ts
// src/state/progress.svelte.ts
class ProgressStore {
  // ── 원천 상태 (persist 대상, 이게 전부다) ─────────────────
  schemaVersion = 1;
  milestones = $state<Record<MilestoneId, boolean>>({});
  mamNodes   = $state<Record<MamNodeId, boolean>>({});
  altRecipes = $state<Record<RecipeId, boolean>>({});  // 하드드라이브로 얻은 대체 레시피
  sites      = $state<Site[]>([]);                     // ② 맵 핀
  learned    = $state<Record<TermId, boolean>>({});    // ⑤ 학습 레이어
  prefs      = $state<Prefs>({ lang: 'ko', theme: 'dark', ceilMachines: true });

  // ── 파생 상태 (저장하지 않음, 항상 재계산) ────────────────
  tier              = $derived(highestCompletedTier(this.milestones));
  unlockedRecipes   = $derived(recipeIndex.filter(r => isUnlocked(r, this.milestones, this.altRecipes)));
  unlockedBuildings = $derived(buildingsOf(this.milestones));
  beltTier          = $derived(bestBelt(this.milestones));   // → 계산기 벨트 포화 판정 기준
  minerTier         = $derived(bestMiner(this.milestones));  // → 원료 채굴 상한
  pipeTier          = $derived(bestPipe(this.milestones));
  powerBudget       = $derived(sumPower(this.sites));
  nextActions       = $derived(suggestNext(this.tier, this.milestones, this.sites)); // ① 화면의 본체
  visibleTerms      = $derived(glossary.filter(t => t.tier <= this.tier + 1));        // 스포일러 차단
}
export const progress = new ProgressStore();
```

핵심: **저장되는 것은 위쪽 6개 필드뿐이다.** 나머지는 전부 파생이다. 직렬화 대상이 작고 평평해서 마이그레이션이 쉽고, "상태가 두 군데에 있어 어긋나는" 버그 계열이 원천 봉쇄된다.

계산기 결과조차 파생이다.

```ts
// src/state/solver.svelte.ts
export function createSolve(target: () => Target) {
  const result = $derived.by(() =>
    solve(target(), progress.unlockedRecipes, progress.beltTier, progress.minerTier)
  );
  return { get result() { return result; } };
}
```

마일스톤 체크박스를 누르면 계산기 결과가 **자동으로** 다시 풀린다. 이벤트 배선도, 무효화 코드도 없다. 이것이 "상태 중심"의 실제 이득이다.

### 2.2 영속화

```ts
$effect.root(() => {
  $effect(() => {
    const snap = serialize(progress);   // 원천 6필드만
    debounce200(() => localStorage.setItem(KEY, snap));
  });
});
const KEY = 'satisfactory-ops:v1';
```

- 부팅 시 **동기** 읽기 → 체크박스가 잠깐 비었다가 채워지는 깜빡임이 없다. IndexedDB는 비동기라 이 깜빡임이 생긴다. 상태가 수 KB인데 IDB를 쓸 이유가 없다.
- **키 네임스페이싱은 선택이 아니라 필수다.** GitHub Pages의 `username.github.io/satisfactory-ops/`는 같은 계정의 다른 모든 리포지토리 사이트와 **origin을 공유한다.** localStorage · SW 등록 · IndexedDB가 전부 같은 저장소를 본다. 접두사 없이 `progress` 같은 키를 쓰면 다른 프로젝트와 충돌한다.
- 스키마 버전 + `migrate(v)` 체인을 처음부터 넣는다. 1인 개발에서 가장 흔한 사고가 "데이터 형식 바꿨더니 내 진행상황이 날아감"이다.
- **내보내기/가져오기**: 상태 JSON 다운로드 + 드래그앤드롭 복원. 이것이 백엔드 없는 기기 간 동기화다. PC ↔ 태블릿은 파일 하나면 된다.
- (선택, v2) URL 해시에 압축 상태를 실어 "이 진행상황 공유" 링크. 여전히 서버 0개.

### 2.3 라우팅 — GitHub Pages 문제를 회피하는 법

GitHub Pages는 **SPA 리라이트를 지원하지 않고, 커스텀 헤더도 지원하지 않는다.** 관행적 해법은 `404.html`을 `index.html` 복사본으로 두는 것인데, 이건 실제로 **HTTP 404 상태코드**로 응답한다. 크롤러, 일부 프록시, 오프라인 캐시 정책에서 미묘한 문제를 만든다.

→ **해시 라우팅을 쓴다.** `#/calc/iron-plate`, `#/map`, `#/milestones`.

```ts
// src/router.svelte.ts (~40 LOC)
const routes = {
  '/':         () => import('./views/Milestones.svelte'),
  '/map':      () => import('./views/Map.svelte'),
  '/stages':   () => import('./views/Stages.svelte'),
  '/calc':     () => import('./views/Calculator.svelte'),
  '/glossary': () => import('./views/Glossary.svelte'),
  '/ref':      () => import('./views/Reference.svelte'),
};
```

얻는 것:

- 404 해킹 불필요, base path 계산 불필요.
- 서비스워커 navigation fallback이 자명해진다. 문서 요청은 언제나 `index.html` 하나다.
- **`file://`로 열어도 동작한다.** 리포지토리를 zip으로 받아 태블릿에서 열어도 앱이 뜬다. 인터넷 없는 상황의 최후 보루.

포기하는 것: URL이 예쁘지 않고, 라우트별 SEO/프리렌더가 없다. §7에서 정직하게 다룬다.

---

## 3. 번들 크기와 초기 로딩 — 구체적 예산

"로딩이 느리면 안 쓴다"는 요구를 숫자로 못 박는다.

| 항목 | 예산 (gzip) | 방법 |
|---|---|---|
| 초기 JS (셸: 라우터 + 스토어 + 네비 + 테마) | **≤ 25 KB** | Svelte 5 클라이언트 런타임 2~3KB + 앱 코드. 외부 런타임 의존성 0 |
| 초기 CSS | **≤ 8 KB** | 순수 CSS, UI 프레임워크 없음 |
| 초기 HTML | ≤ 2 KB | |
| **최초 페인트까지 총합** | **≤ 35 KB** | |
| 뷰 청크 (라우트당) | ≤ 15 KB | 동적 import |
| recipes/items 데이터 | ≤ 60 KB | 컬럼형 인코딩(§3.2). ④⑥ 진입 시에만 lazy |
| 맵 이미지 | 420 KB (기존) | `#/map` 진입 시에만. 초기 경로 아님 |
| 폰트 | **0 KB** | 시스템 폰트 스택(§3.3) |

목표: **콜드 4G TTI < 1.0s, 재방문(SW 캐시) < 150ms.** 알트탭 왕복은 재방문이므로 실사용을 지배하는 것은 후자다.

### 3.1 예산을 지키는 장치 — 선언이 아니라 CI 게이트

```yaml
# .github/workflows/deploy.yml 중
- run: npm run build
- run: npx size-limit          # 초과하면 빌드 실패
```

```json
// .size-limit.json
[{ "path": "dist/assets/index-*.js",  "limit": "25 kB" },
 { "path": "dist/assets/index-*.css", "limit": "8 kB" }]
```

여기에 `rollup-plugin-visualizer`로 회귀 원인을 추적한다. **예산은 문서가 아니라 실패하는 테스트여야 한다.** 이 게이트를 1주차에 세우는 것이 이 제안에서 가장 중요한 실행 항목이다.

### 3.2 데이터 인코딩

`Docs.json`의 레시피를 그대로 두면 이름·클래스경로가 반복되어 수백 KB다. 빌드 시 컬럼형으로 압축한다.

```js
// recipes.gen.json — 문자열 테이블 + 정수 인덱스
{ "items":     ["철광석", "철 주괴", "철판", ...],       // 문자열은 1회만
  "buildings": ["제련기", "조립기", ...],
  "recipes":   [[12, 1, 30, [[0,1]], [[1,1]]], ...] }   // [id, bldg, timeSec, in[], out[]]
```

gzip 후 60KB 이하. 파싱은 부팅 시가 아니라 **계산기 뷰 진입 시** 1회, 이후 동결된 인덱스로 메모리에 상주.

레퍼런스 표(⑥)와 계산기(④)는 **같은 청크를 공유**하므로 한쪽을 이미 봤다면 다른 쪽은 즉시 뜬다(Rollup manual chunk로 `data-core` 고정).

### 3.3 폰트

한국어 웹폰트(Pretendard 등)는 서브셋해도 수백 KB다. **알트탭 도구에 쓸 수 없는 비용이다.** 시스템 스택으로 간다.

```css
font-family: "Pretendard Variable", -apple-system, "Segoe UI Variable", "Segoe UI",
             "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
```

설치돼 있으면 쓰고 없으면 OS 기본 한글 폰트. 정직한 대가는 §7-7에 적었다.

### 3.4 이미지

- 맵 webp 2장은 이미 최적화되어 있다(각 약 200KB). 빌드 시 `sharp`로 **2048px 기본본 + 4분할 고해상 타일**을 생성해 줌 레벨에 따라 교체한다(§4.2).
- 건물 아이콘 27개(228KB)는 개별 파일로 유지한다. GitHub Pages는 CDN 뒤에서 HTTP/2로 서빙되므로 요청 수 오버헤드가 낮고, **SW가 전부 precache**하므로 두 번째부터 네트워크가 0이다. 스프라이트 시트로 묶으면 캐시 무효화 단위가 커져 오히려 손해다.
- `<img loading="lazy" decoding="async" width height>`를 전부 명시 → CLS 0.

### 3.5 오프라인 — 요구사항 중 가장 과소평가되기 쉬운 부분

```ts
VitePWA({
  base: '/satisfactory-ops/',
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,webp,json,svg}'],  // 전량 precache (~1.2MB)
    navigateFallback: 'index.html',
  },
})
```

- 앱 총량이 1.2MB 수준이라 **전량 precache**가 가능하다. 부분 캐시 전략 같은 복잡도가 필요 없다.
- SW 스코프는 `/satisfactory-ops/`로 제한되어 같은 origin의 다른 프로젝트를 건드리지 않는다.
- **필수 안전장치**: 재배포 후 구 SW가 살아 있는 상태에서 동적 import가 404를 맞으면 앱이 죽은 화면이 된다. 전역 방어를 반드시 넣는다.

  ```ts
  window.addEventListener('vite:preloadError', () => location.reload());
  ```

  여기에 새 버전 감지 시 "새 버전이 있습니다 [새로고침]" 토스트를 더한다. **선택이 아니라 필수다.**

---

## 4. viewPlan — 6개 화면 구현 계획

### ① 마일스톤 진행 체크리스트 (`#/`)

앱의 홈이자 상태의 입력구. 단순 체크리스트가 아니라 **"다음 액션" 엔진**이다.

- 데이터: `milestones.gen.json` (티어 → 마일스톤 → 필요 아이템. Docs.json의 Schematic에서 생성).
- UI: 티어별 아코디언, 각 마일스톤에 필요 아이템 진척 입력. 완료 시 잠금 해제되는 건물/레시피를 **인라인으로 미리 보여준다**(`unlockedBuildings` 파생).
- 핵심 위젯 `nextActions`: 현재 티어 + 등록된 부지 + 미완 마일스톤을 입력으로 3~5개의 문장형 제안을 생성한다.
  예: *"석탄 발전 전에 물 펌프 자리를 먼저 정하세요 — 등록된 부지에 수원이 없습니다 (② 맵에서 지정)"*
  규칙은 `rules.ts`의 순수 함수 배열(`(state) => Action | null`)로 둔다. 테스트 가능하고, 규칙 추가가 파일 한 줄이다. **머신러닝도 LLM도 아니다. if문이다.** 이 앱의 "플레이북"다움은 정확히 여기서 나온다.
- 체크 하나가 `$derived` 그래프 전체를 흔들고 나머지 5개 화면이 조용히 갱신된다.

### ② 입지 선정 — 맵 줌/팬 오버레이 (`#/map`)

**라이브러리를 쓰지 않는다.** Leaflet(약 42KB gz + 타일 피라미드 인프라)이나 OpenSeadragon(100KB+)은 "웹 지도"를 위한 도구다. 우리는 **정지 이미지 2장**이고 통째로 메모리에 올라간다. 자작이 약 120줄이고, 초기 예산의 절반 이상을 지킨다.

**렌더 구조 — DOM + CSS transform (canvas 아님)**

```html
<div class="viewport">   <!-- overflow:hidden; touch-action:none -->
  <div class="world"
       style="transform: translate3d({x}px,{y}px,0) scale({k}); transform-origin:0 0">
    <img src={mapSrc} width={W} height={H}>
    <svg class="grid" viewBox="0 0 {W} {H}"> ... </svg>
    {#each sites as s}<Pin {s} {k}/>{/each}
  </div>
</div>
```

- 상태는 `{x, y, k}` 단 3개의 룬. transform은 GPU 합성이라 리페인트가 없다.
- **핀은 `.world`의 자식**이라 좌표 변환을 공짜로 얻는다. 대신 핀 자체에 역스케일 `transform: scale(1/k)`을 걸어 **줌해도 마커 크기는 일정**하게 유지한다.
- **그리드 선**은 SVG `<line>`에 `vector-effect="non-scaling-stroke"`. 줌해도 선 굵기가 1px로 유지된다. canvas였다면 매 프레임 다시 그려야 할 것이 속성 하나로 끝난다.
- **히트 테스팅이 없다.** 핀 클릭은 그냥 DOM `onclick`이다. canvas를 골랐다면 좌표 역변환과 히트박스 관리를 직접 써야 한다. 핀이 수십 개 규모라면 DOM이 명백히 옳다.

**제스처 — Pointer Events 단일 코드경로**

```ts
const active = new Map<number, PointerEvent>();   // 포인터 ID → 최신 이벤트

// pointerdown: el.setPointerCapture(e.pointerId); active.set(...)
// pointermove:
//   active.size === 1 → 드래그:  x += dx; y += dy;
//   active.size === 2 → 핀치:    zoomAbout(midpoint(now), k * dist(now)/dist(prev));
// pointerup/cancel: active.delete(e.pointerId)
```

마우스 드래그와 터치 드래그가 **같은 코드**다. mouse/touch 이벤트를 따로 쓰는 흔한 실수를 처음부터 피한다.

**커서 기준 줌 — 수식 하나가 전부다**

```ts
function zoomAbout(cx, cy, k2) {          // (cx,cy) = 뷰포트 좌표
  k2 = clamp(k2, fitScale, 8);
  x = cx - (cx - x) * (k2 / k);
  y = cy - (cy - y) * (k2 / k);
  k = k2;
}
// 휠: zoomAbout(e.clientX - rect.left, e.clientY - rect.top,
//               k * Math.exp(-e.deltaY * 0.0015))
```

휠은 `addEventListener('wheel', h, { passive: false })`로 직접 등록한다. **Svelte 5는 이벤트 수식어(`on:wheel|preventDefault`)를 제거했으므로** 이 부분은 `$effect` 안에서 수동 바인딩해야 한다. 모르면 반나절 태우는 함정이라 미리 적어 둔다.

**해상도 전략**: `k ≤ 2.5`는 2048px 기본본, 초과하면 보이는 사분면의 고해상 타일을 lazy로 얹는다(`<img>` 4장, opacity 크로스페이드). 조건문 두 줄이고, 타일 서버도 피라미드 생성기도 없다.

**게임 좌표 매핑**: `map.meta.json`에 이미지 픽셀 ↔ 게임 월드 좌표의 아핀 변환을 기준점 2개로 저장한다. 경계값을 하드코딩하는 대신 **캘리브레이션 값**을 두면 맵 이미지를 교체하거나 게임이 업데이트돼도 JSON 한 줄 수정으로 끝난다.

**상태 연동(이 화면의 존재 이유)**: 핀에는 자원 종류·순도·노드 수를 붙인다. 이 값이 ④ 계산기의 **원료 공급 상한**이 되고, 반대로 계산기가 요구하는 원료가 ② 맵에서 **부족 자원으로 하이라이트**된다. 티어가 오르면(`minerTier` 상승) 같은 핀의 채굴량 상한이 자동 갱신된다.

### ③ 공장 성장 단계도 (`#/stages`)

정직하게 말하면 **가장 손이 많이 가는 화면**이고, 여기서 라이브러리 유혹을 이겨야 한다.

- **자동 레이아웃(dagre/ELK)을 쓰지 않는다.** 100KB+ 의존성인데, 배치·배관·배선은 *물리적 공간 배치*라 그래프 자동 레이아웃이 만드는 그림은 쓸모가 없다. 사용자가 원하는 건 "이렇게 놓아라"이지 노드 위치 최적화가 아니다.
- **손으로 그린 SVG 6~8장**(시작 공장 / 석탄 발전 / 강철 / 석유 / 알루미늄 / 원자력). 각 15KB 이하, 스테이지별 lazy import. Figma나 Inkscape로 그리고 `svgo`로 최적화.
- 각 SVG 요소에 `data-*` 훅을 심어 상태로 조작한다.

  ```html
  <g data-req-milestone="coal-power" data-term="manifold"> ... </g>
  ```

  미달성 마일스톤 요소는 자동으로 흐려지고 "Tier 3에서 잠금 해제" 배지가 붙는다. `data-term`이 붙은 요소는 ⑤ 용어집 팝오버가 자동 연결된다. **SVG를 상태로 조명하는 것**이지 다시 그리는 게 아니다.
- 큰 도식에는 **② 맵의 pan/zoom 컴포넌트를 그대로 재사용**한다. 두 번 만들지 않는다. 이것이 자작을 정당화하는 두 번째 근거다.

### ④ 생산 라인 계산기 — 재귀 해결 (`#/calc`)

이 앱의 기술적 심장. 1인 개발에서 버그가 가장 많이 날 곳이므로 설계를 명시적으로 둔다.

**모델**

```ts
type Recipe = { id; building; timeSec; in: {item,amount}[]; out: {item,amount}[]; alternate: boolean };
// 기계 1대당 산출률(개/분) = amount / (timeSec / 60) × clock
```

**1단계 — 메모이즈드 DFS (기본 경로, 대부분의 경우)**

```ts
function solve(item, rate, ctx) {
  if (ctx.leaves.has(item)) { ctx.raw[item] += rate; return leaf(item, rate); }
  const r = ctx.pick(item);                          // 사용자 지정 > 정책(기본/대체) > 유일 레시피
  const perMachine = out(r, item) / (r.timeSec / 60);
  const machines = rate / perMachine;
  const children = r.in.map(i =>
    solve(i.item, machines * i.amount / (r.timeSec / 60), ctx));
  return { item, rate, recipe: r, machines, children };
}
```

- `leaves` = 원광석 + **사용자가 "기존 라인에서 공급"으로 표시한 아이템**. 이것이 "플레이북"다운 부분이다. 이미 돌아가는 철판 라인을 다시 계산하지 않는다.
- 트리 구조를 그대로 반환하므로 UI가 **접히는 트리**로 바로 렌더된다. 플레이어가 실제로 생각하는 모양이다.

**2단계 — 순환 처리 (여기서 대부분의 계산기가 무너진다)**

재활용 플라스틱/고무 ↔ 연료, 알루미나 ↔ 물처럼 **레시피 그래프에 사이클이 있으면 순수 재귀는 발산한다.**

해법: 선택된 레시피 집합에 **Tarjan SCC**를 돌려 강결합 성분을 찾고, 사이클이 있는 SCC만 **선형계로 푼다.**

```
A · x = d
  x = 각 레시피의 가동 배율 벡터
  A = 순생산 행렬 (A[item][recipe] = 산출률 − 투입률)
  d = 해당 SCC에 대한 외부 수요
```

부분 피벗 가우스 소거 약 80줄, 의존성 0개. 실제 SCC는 보통 2~6개 레시피라 행렬이 아주 작다. 푼 결과를 트리에 다시 접합한다.
→ **사이클 없는 부분은 사람이 이해하는 트리로, 사이클 부분은 수학적으로 정확하게.** 부산물(정유의 다중 산출)도 같은 메커니즘으로 흡수된다.

**3단계 — 상태를 곱해서 "플레이북"으로 만들기 (계산기와의 차별점)**

결과 트리를 `progress` 스토어와 대조해 경고를 붙인다.

- **벨트 포화**: 엣지 산출률 > `beltTier` 처리량 → *"이 구간 240/min은 Mk.2 한 줄로 부족합니다. 2줄로 나누거나 Mk.3을 먼저 여세요"*
- **잠금 레시피**: `unlockedRecipes`에 없으면 회색 + *"Tier 5 필요"*
- **원료 상한**: 필요 원광 총량 vs ② 맵 핀의 노드 순도·개수 × `minerTier` 채굴량 → 부지 부족 경고
- **전력**: 기계 기본 전력 × 대수 합산 후 현재 발전량과 비교. 오버클럭 시 전력은 비선형으로 증가하는데, **이 지수와 벨트 처리량 같은 게임 상수는 하드코딩하지 않고 Docs.json 생성값에서 읽는다.** 게임 업데이트로 수치가 바뀌면 재생성만 하면 된다.
- **기계 대수 반올림**: 기본은 올림 + 잉여율 표시, 옵션으로 소수(오버클럭 전제) 표시.

**성능**: 현실적 그래프에서 전체 풀이가 1ms 미만이다. Web Worker 불필요, `$derived` 안에서 동기 실행. 예외는 "최적 대체 레시피 조합 탐색"(조합 폭발/LP 문제)이며 **v1 범위 밖으로 명시적으로 자른다.**

**테스트**: 솔버는 순수 함수다. Vitest 골든 테스트 20~30개로 고정한다(철판 20/min → 제련기 대수, 강철 라인 표준비, 재활용 플라스틱 순환 케이스). **이 앱에서 테스트가 반드시 필요한 유일한 부분이다.**

### ⑤ 용어집 — 학습 레이어 (`#/glossary`)

이미 `src/data/glossary.json`(13KB)이 있고 스키마에 `tier`가 있다. 그 `tier`가 이 화면을 상태 중심으로 만든다.

- **독립 페이지 + 인라인 팝오버 이중 노출.** 다른 화면 어디서든 `<Term id="manifold">매니폴드</Term>`로 감싸면 점선 밑줄과 팝오버(`short`/`why`/`how`)가 뜬다. 팝오버 컴포넌트는 셸에 포함(1KB 미만), 용어 데이터 13KB는 초기 번들에 넣어도 예산 안이다.
- **스포일러 차단**: `visibleTerms = tier <= progress.tier + 1`. 티어 3인 사람에게 원자력 용어를 보여주지 않는다. 목록이 게임 진행과 함께 자라는 경험 자체가 상태 중심의 산물이다.
- **학습 완료 토글**: `learned[id] = true`로 표시하면 ③ 다이어그램의 해당 툴팁이 사라진다. 보조바퀴가 점점 걷힌다.
- 검색은 로컬 문자열 매칭. Fuse.js 같은 의존성이 필요 없는 규모다.

### ⑥ 레퍼런스 표 (`#/ref`)

- ④와 **같은 데이터 청크**를 공유하므로 추가 다운로드 0.
- 정렬/필터/검색은 `$derived` 배열 하나. 가상 스크롤 라이브러리 없이 CSS `content-visibility: auto`로 오프스크린 행 렌더 비용을 없앤다. 수백 행 규모에서 충분하다.
- **상태 연동**: 상단 토글 "내가 가진 것만" → `unlockedRecipes`로 필터. 대체 레시피는 `altRecipes` 보유 여부에 따라 배지가 달라진다. 즉 이 표는 위키의 복사본이 아니라 **내 세이브의 표**다.
- 셀에서 바로 "④ 이 아이템으로 계산" 링크(`#/calc/iron-plate`). 딥링크가 라우터로 흘러들어 계산기 초기값이 된다.

---

## 5. 데이터 파이프라인

```
Steam\...\Satisfactory\CommunityResources\Docs\Docs.json   (UTF-16LE + BOM)
        │  scripts/build-data.mjs
        │    readFileSync(p, 'utf16le').replace(/^﻿/, '') → JSON.parse
        │    + src/data/overlay.ko.json (한국어 명칭·주석·플레이북 노트, 손으로 유지)
        ▼
src/data/*.gen.json  ← 생성물을 **리포지토리에 커밋한다**
```

`.gen.json`을 커밋하는 이유: GitHub Actions 러너에는 게임이 설치되어 있지 않다. 빌드가 게임 설치에 의존하면 CI가 성립하지 않는다. 게임 업데이트 때만 로컬에서 재생성 → 커밋하면 되고, diff로 무엇이 바뀌었는지 리뷰까지 된다. 한국어 오버레이는 별도 파일이라 재생성해도 **번역이 날아가지 않는다.**

---

## 6. i18n

라이브러리를 쓰지 않는다. "한국어 1차 / 영어 선택"이라는 요구에 정확히 맞는 최소 구조다.

```ts
const t = (k: string) => dict[progress.prefs.lang]?.[k] ?? dict.ko[k] ?? k;
```

데이터 레벨은 `name: { ko, en? }`, `en`이 없으면 `ko`로 폴백. **영어를 끝까지 안 채워도 앱은 완전히 동작한다.** i18next(수십 KB)를 넣고 번역 파일 절반이 비어 있는 상태보다 낫다.

---

## 7. 정직한 약점 (심사용)

1. **초기 구축 비용이 가장 크다.** 정적 HTML 6장이면 주말이면 뜬다. 이 제안은 라우터·스토어·솔버·pan/zoom·SW·CI를 다 세워야 하고, 현실적으로 **2~4주(1인, 파트타임)** 다. 상태 연동이 만드는 가치를 믿지 않는다면 이 비용은 순손실이다.
2. **해시 URL이 예쁘지 않다.** `#/calc/iron-plate`. 라우트별 SEO/프리렌더도 없다. 검색 유입을 원한다면 이 제안은 **불리하다.** (완화책으로 용어집만 빌드 시 정적 페이지로 별도 출력할 수 있지만, 그건 이미 절충이다.)
3. **JS 없이는 아무것도 보이지 않는다.** 정적 문서라면 최악의 경우에도 텍스트는 읽힌다. SPA는 JS 실패 = 백지다.
4. **Svelte 5 runes의 함정.** `$state` 프록시를 구조분해하면 반응성이 끊기고, 클래스 필드 룬의 `this` 캡처와 `$effect` 무한루프도 처음 한 번은 반드시 밟는다. 문서에 다 있지만 학습 비용을 0으로 계산하면 안 된다.
5. **순환 솔버가 버그 밀도 1위 구역이다.** 선형계 접근은 옳지만, 수치적으로 특이한 행렬(중복 레시피 선택 등)에서 조용히 틀린 답을 낼 수 있다. 테스트로 덮되, "계산기가 가끔 틀린다"는 신뢰 붕괴가 크다는 점을 인정한다.
6. **localStorage는 취약한 저장소다.** 브라우저 데이터 삭제, 시크릿 모드, iOS의 장기 미사용 스토리지 정리로 진행상황이 사라질 수 있다. 내보내기 UX로 완화하지만 **사용자가 백업을 안 하면 소용없다.** `user.github.io` origin 공유 문제(§2.2)도 네임스페이싱으로 완화될 뿐 사라지지 않는다.
7. **폰트를 포기했다.** 시스템 폰트라 기기마다 한글 렌더링이 다르고, Windows 기본 한글 폰트의 조판 품질은 좋지 않다. 디자인 완성도를 성능과 맞바꾼 것이다.
8. **자산 저작권.** Docs.json 파생 데이터, 게임 맵 이미지, 건물 아이콘을 **public 저장소**에 재배포하는 것은 Coffee Stain의 IP 문제다. 커뮤니티 관행상 널리 용인되지만 "안전하다"고 단언할 수 없다. 최소한 출처 명기와 삭제 요청 대응 방침을 README에 두어야 한다. 어떤 아키텍처를 골라도 동일한 문제지만, 성능 예산 때문에 이미지를 전부 리포지토리에 번들하는 이 안에서 더 두드러진다.
9. **③ 성장 단계도가 일정의 장대다.** SVG 6~8장을 손으로 그리는 건 코딩이 아니라 디자인 작업이고, 개발자 1인의 시간 예측이 가장 크게 빗나가는 종류의 일이다.
10. **SW 업데이트 사고.** 재배포 후 구 청크 404로 앱이 죽는 시나리오는 실제로 자주 발생한다. §3.5의 방어를 반드시 구현해야 하며, 이건 정적 사이트에는 아예 없는 위험이다.

---

## 8. 백엔드는 필요한가 — 아니다

- 사용자 1명(+소수)의 진행상황은 **클라이언트 상태**다. 계정·인증·DB를 두는 순간 유지보수 비용이 앱 본체를 넘는다.
- 기기 간 동기화는 **JSON 내보내기/가져오기**로 충분하다. 더 원하면 사용자 자신의 GitHub Gist에 개인 토큰으로 저장하는 방식이 있다. **여전히 서버 0개**다.
- 백엔드가 정당화되는 유일한 시나리오는 다수 사용자의 공장 설계 공유·랭킹이다. **v1 범위 밖이며 그때 다시 판단한다.**

---

## 9. 구현 순서 (1인 기준)

| 단계 | 산출물 | 이유 |
|---|---|---|
| W1 | Vite + Svelte 셸, 해시 라우터, `progress` 스토어, localStorage, CI + size-limit | 예산 게이트를 **먼저** 세운다. 나중에 세우면 이미 초과해 있다 |
| W1 | `build-data.mjs` → `.gen.json` | 나머지 전부의 전제 |
| W2 | ① 마일스톤 + `nextActions` 규칙 | 상태의 원천. 이게 없으면 파생될 것이 없다 |
| W2 | ④ 계산기 DFS + Vitest 골든 테스트 | 기술적 위험 1위를 앞으로 당긴다 |
| W3 | ⑥ 레퍼런스(④ 데이터 재사용, 거의 공짜) / ⑤ 용어집 + 팝오버 | 저비용 고효용 |
| W3 | ② 맵 pan/zoom + 핀 | ③에서 재사용할 컴포넌트이므로 먼저 |
| W4 | ④ 순환 SCC 선형 솔버 / ③ 성장 단계도 SVG / PWA + 업데이트 토스트 | 가장 무거운 것을 마지막에, 잘라낼 수 있게 |

**순환 솔버와 ③은 v1.1로 미룰 수 있도록 설계했다.** DFS만으로도 대부분의 실사용은 성립한다. 1인 개발에서 잘라낼 수 있는 지점을 미리 정해두는 것이 일정 관리의 전부다.

---

## 10. 확인한 사실 (추측이 아닌 근거)

- Vite 8 안정 릴리스 2026-03-12, Rolldown이 단일 번들러로 통합 — https://vite.dev/blog/announcing-vite8
- Svelte 6 미출시, SvelteKit 2.70 안정 / 3.0 프리뷰 (2026-08 기준) — https://svelte.dev/blog/whats-new-in-svelte-august-2026
- SolidJS 2.0 베타 (2026-03-03 beta.0, async 일급화·Suspense 재작업 등 breaking) — https://www.infoq.com/news/2026/05/solidjs-2-async/
- GitHub Pages: 사이트 1GB, 대역폭 100GB/월 소프트 리밋, 빌드 10회/시간 소프트 리밋 — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub Pages는 SPA 라우팅/커스텀 헤더 미지원, `404.html` 우회는 404 상태코드로 응답 — https://github.com/orgs/community/discussions/64096
- Docs.json 위치(`CommunityResources\Docs`)와 UTF-16 + BOM 처리 필요 — https://satisfactory.wiki.gg/wiki/Community_resources , https://github.com/lunafoxfire/satisfactory-docs-parser
- vite-plugin-pwa(Workbox) 오프라인 precache / autoUpdate — https://vite-pwa-org.netlify.app/guide/
