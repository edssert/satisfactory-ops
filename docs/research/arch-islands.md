# 아키텍처 제안: 콘텐츠 우선 + 아일랜드 (Astro 7)

> satisfactory-ops 아키텍처 후보 A
> 작성일: 2026-08-19
> 관점: 이 앱은 **읽는 문서 80% + 조작하는 도구 20%** 다. 그 비율대로 만든다.

---

## 0. 한 문단 요약

6개 화면 중 **3개(단계도·용어집·레퍼런스 표)는 JavaScript가 단 1바이트도 필요 없다.** 나머지 3개도 페이지 전체가 아니라 화면의 일부만 인터랙티브하다. 그런데 SPA를 쓰면 용어집 한 항목을 읽으려고 계산기와 맵 뷰어 코드까지 전부 내려받는다. 알트탭으로 3초 보고 돌아가는 도구에서 이건 치명적이다.

Astro 7로 모든 페이지를 정적 HTML로 빌드하고, **계산기 / 맵 / 체크박스 열**만 Preact 아일랜드로 심는다. 결과: 문서 페이지 JS 0KB, 도구 페이지 JS 8~14KB. 그리고 결정적으로 — **생산 계산기의 해석 엔진(TypeScript 모듈 하나)을 빌드 시점과 브라우저에서 똑같이 돌린다.** 자주 쓰는 목표 30개는 빌드 때 미리 풀어서 정적 HTML로 뽑고, 커스텀 수치를 넣을 때만 아일랜드가 깨어난다. 이건 CSR SPA에서는 구조적으로 불가능한 것이다.

---

## 1. 왜 이 관점이 이 앱에 맞는가

### 1.1 사용 맥락이 아키텍처를 결정한다

명세에 적힌 사용 맥락을 그대로 요구사항으로 번역하면:

| 맥락 | 기술 요구사항 |
|---|---|
| 플레이 중 알트탭 | **TTI(상호작용 가능 시점)가 곧 제품 품질.** 게임이 GPU/CPU를 점유한 상태에서 브라우저가 300KB 번들을 파싱·실행하면 체감이 무너진다 |
| 두 번째 모니터에 띄워둠 | 페이지를 열어두고 **거의 조작하지 않는다.** 읽기가 기본 상태다 |
| 태블릿/폰 | 저사양 CPU. 파싱 비용은 다운로드 비용보다 크다 |
| 오프라인일 수도 | 서비스워커 프리캐시. **정적 HTML은 프리캐시가 자명하다** (URL = 파일). SPA는 라우팅 폴백 설정이 따로 필요하다 |
| 1인 유지보수 | 런타임 상태 관리 코드가 적을수록 좋다. 정적 HTML은 버그가 날 표면이 없다 |

### 1.2 화면별 인터랙티브 비율

프로젝트에 이미 있는 자산 실측:

```
C:/Dev/satisfactory-ops/assets
  맵 webp 2장   : 1600x1600, 191KB + 233KB = 420KB
  건물 아이콘   : 27개, 228KB
  src/data/glossary.json : 16개 항목, 13KB (현재)
```

| 화면 | 성격 | 필요 JS | 근거 |
|---|---|---|---|
| ① 마일스톤 체크리스트 | 문서 + 체크박스 | **~2KB** | 설명 텍스트는 정적. 체크박스 열만 아일랜드 |
| ② 입지 선정 (맵) | 도구 | **~6KB** | 줌/팬/핀. 단, 입지 설명글은 정적 HTML |
| ③ 공장 성장 단계도 | 순수 문서 | **0KB** | 인라인 SVG 다이어그램. 조작할 것이 없다 |
| ④ 생산 라인 계산기 | 도구 | **~8KB** (+순환 시 지연 로드) | 재귀 해석기 |
| ⑤ 용어집 | 순수 문서 | **0KB** | 팝오버·필터까지 CSS/HTML 네이티브로 |
| ⑥ 레퍼런스 표 | 순수 문서 | **0~1KB** | 빌드 때 정렬 변형 생성. 검색만 바닐라 |

**문서 4 : 도구 2.** 페이지 뷰 기준으로는 더 기울어진다 — 용어집과 레퍼런스는 자주 열리고 계산기는 가끔 열린다. 이 비율에 맞는 아키텍처는 하나뿐이다.

### 1.3 아일랜드가 아니면 생기는 일

SPA(Vite + React Router)로 만들면:

- 용어집 "매니폴드" 항목 하나를 보려고 → React(45KB) + 라우터(12KB) + 계산기 로직 + 맵 뷰어 + 전체 recipes.json(858개 레시피면 수백 KB)을 받는다
- 첫 페인트 전에 JS 실행이 끝나야 한다. 알트탭 상황에서 이건 흰 화면 1~2초
- GitHub Pages는 SPA 라우팅을 지원하지 않는다 → `404.html` 리다이렉트 해킹이 필요하고 딥링크가 한 번 깜빡인다
- 검색엔진 / 브라우저 읽기 모드 / 인쇄가 전부 망가진다. 공략 문서인데

---

## 2. 스택

```
런타임 (브라우저에 도달하는 것)
  HTML + CSS (수제)            문서 페이지의 전부
  Preact 10 + @preact/signals  아일랜드 3개 공용 런타임 (~3-4KB gzip, 아일랜드 간 공유)
  TypeScript 컴파일 결과        계산 엔진 / 맵 트랜스폼

빌드 (개발 기기와 CI에만 존재)
  Astro 7.x          2026-06-22 릴리스. Rust 컴파일러, Vite 8 + Rolldown
  Node.js 22 LTS     Astro 7 최소 요구
  @astrojs/preact
  @vite-pwa/astro    Workbox generateSW
  Zod                Astro Content Layer 스키마 (Astro에 포함)

데이터 생성 (수동 실행, CI에 없음)
  scripts/gen-data.mjs   Docs.json → src/data/*.json

배포
  GitHub Actions (withastro/action) → GitHub Pages
```

### 2.1 채택하지 않은 것과 이유

| 후보 | 기각 사유 |
|---|---|
| **Tailwind** | 이 사이트의 CSS 총량은 10KB 미만이다. 문서형 레이아웃에 유틸리티 클래스는 이득보다 의존성 비용이 크다. 최신 CSS(nesting, `@layer`, custom properties)로 충분하고 빌드 의존성이 하나 줄어든다 |
| **Leaflet** | 44KB gzip. 타일 피라미드 전제의 라이브러리를 1600px 단일 이미지에 쓰는 건 과잉. `CRS.Simple` 세팅 의례가 오히려 코드를 늘린다. 직접 짜면 150줄 |
| **OpenSeadragon** | Deep Zoom 피라미드 생성 필요. 1600px에 불필요 |
| **Mermaid (런타임)** | 500KB+ 런타임을 고정 삽화 8장에 쓴다. 게다가 공장 배치도는 플로차트가 아니라 **공간 배치도**라 Mermaid로는 애초에 안 그려진다 |
| **Next.js static export** | React 강제, RSC 개념 부하, 문서 사이트에 과한 프레임워크. 아일랜드 단위 하이드레이션 제어가 Astro만큼 세밀하지 않다 |
| **`sharp` (astro:assets 기본 이미지 서비스)** | 자산이 이미 최적화된 webp다. `passthroughImageService()`로 교체해 네이티브 의존성 하나를 통째로 제거한다 |
| **빌드 없이 순수 정적 HTML 수기 작성** | §7.3 참조. 858개 레시피 앞에서 무너진다 |

### 2.2 가장 강한 경쟁자: 11ty (정직하게)

11ty는 더 가볍고, 메이저 버전 변동이 적고, 의존성이 얕다. **1인 유지보수라는 제약만 놓고 보면 11ty가 더 낫다는 주장은 성립한다.** 그럼에도 Astro를 고르는 이유는 셋뿐이고, 이 셋이 이 앱의 핵심이다:

1. **`client:*` 디렉티브** — 11ty엔 아일랜드 프리미티브가 없다. 계산기/맵의 하이드레이션 경계를 손으로 짜야 하고, 그 코드가 곧 유지보수 부채다
2. **Content Layer + Zod** — `glossary.json`의 `see: ["load-balancer"]` 같은 상호참조가 깨지면 **빌드가 실패한다.** 런타임에 링크가 죽는 대신. 데이터 4종(레시피·마일스톤·건물·용어)을 다루는 프로젝트에서 이건 큰 안전망이다
3. **동형 실행** — `src/lib/solver.ts` 하나를 `getStaticPaths()`(Node)와 아일랜드(브라우저)에서 그대로 쓴다. §4.5의 사전계산 전략이 여기 걸려 있다

---

## 3. 라우트 구조

```
/                          정적            현재 티어 요약 + 다음 할 일 (허브)
/milestones/               정적+아일랜드    ① 체크리스트
/map/                      정적+아일랜드    ② 입지 선정
/stages/                   정적            ③ 단계도 인덱스
/stages/[slug]/            정적            ③ 각 성장 단계 (SVG + 해설)
/calc/                     정적+아일랜드    ④ 계산기
/calc/[target]-[rate]/     정적            ④ 사전계산된 상위 30개 목표 (JS 0KB)
/glossary/                 정적            ⑤ 용어 인덱스 (티어별 필터, JS 0KB)
/glossary/[id]/            정적            ⑤ 용어 상세
/ref/recipes/[tier]/       정적            ⑥ 레시피 표 (티어 분할)
/ref/power/                정적            ⑥ 전력 표
/ref/logistics/            정적            ⑥ 물류 표
/offline/                  정적            SW 네비게이션 폴백
```

`astro.config.mjs` 핵심:

```js
export default defineConfig({
  site: 'https://<user>.github.io',
  base: '/satisfactory-ops',          // 프로젝트 페이지이므로 필수
  output: 'static',
  trailingSlash: 'always',            // GH Pages 디렉토리 인덱스와 SW 프리캐시 키 일치
  image: { service: passthroughImageService() },
  integrations: [preact({ compat: false }), AstroPWA({ /* §6 */ })],
});
```

> 확인된 제약: GitHub Pages 사이트 크기 1GB, 대역폭 소프트 100GB/월, 배포 타임아웃 10분. Actions 워크플로 사용 시 시간당 10빌드 제한은 적용되지 않는다. 이 프로젝트는 전부 여유롭다 (사이트 총량 ~1.5MB 예상).
>
> 저장소에 이미 `.nojekyll`이 있다 — `_astro/` 디렉토리가 Jekyll에 먹히지 않게 하는 필수 파일이다. 유지할 것.

---

## 4. 화면별 구현 계획 (viewPlan)

### ① 마일스톤 진행 체크리스트 — 정적 문서 + 체크박스 아일랜드

**구조**

```astro
---
const milestones = await getCollection('milestones');
---
<ul class="milestone-list">
  {milestones.map(m => (
    <li id={m.id} data-tier={m.data.tier}>
      <ProgressToggle client:idle id={m.id} />   {/* 아일랜드: 체크박스 하나 */}
      <h3>{m.data.name}</h3>
      <CostTable items={m.data.cost} />          {/* 정적 */}
      <div set:html={m.rendered.html} />         {/* 정적: "왜 지금 이걸" 해설 */}
    </li>
  ))}
</ul>
```

핵심은 **아일랜드가 체크박스만 소유한다**는 것이다. 마일스톤 이름·비용표·해설은 전부 빌드 산출 HTML이다. JS가 죽어도 문서로서 100% 읽힌다.

**저장**: `localStorage['sfops.progress.v1']` = `{ v:1, checked:{ [id]: unixSec } }`. 쓰기는 300ms 디바운스.

**하이드레이션 깜빡임 해결** — 실무에서 제일 자주 놓치는 부분이다. 정적 HTML은 "미체크"로 빌드된다. 하이드레이션 후 체크가 켜지면 눈에 띄게 튄다. 다크모드 no-flash와 같은 기법으로 잡는다:

```astro
<script is:inline>
  // <head>에서 동기 실행. 하이드레이션보다 먼저 CSS가 상태를 반영한다
  try {
    const p = JSON.parse(localStorage.getItem('sfops.progress.v1') || '{}');
    document.documentElement.dataset.done = Object.keys(p.checked || {}).join(' ');
  } catch {}
</script>
```

**동기화**: 백엔드가 없으므로 없다. 대신 두 가지 탈출구를 준다.

- `내보내기` → `Blob` + `<a download>` 로 `sfops-progress.json` 저장
- `기기 간 전송` → 마일스톤 완료 상태를 **비트필드 → base64url**로 압축해 URL 해시에 넣는다. 마일스톤 200개면 25바이트 → base64url 34자. QR로도 옮길 수 있는 크기다

### ② 입지 선정 — 맵 줌/팬 오버레이 (아일랜드, 자체 구현 ~150줄)

**전체 그림**

```
<div class="viewport">            position:relative; overflow:hidden; touch-action:none
  <div class="world"              transform: translate(tx,ty) scale(k); transform-origin:0 0
    <img src="ingame-map.webp">   1600x1600, 활성 레이어 1장만 DOM에 존재
    <svg viewBox="0 0 1600 1600"> 같은 좌표계 → 핀·그리드가 공짜로 따라 움직인다
      <rect fill="url(#grid)">    그리드: <pattern> 1개
      <g class="pins">            핀: Preact가 locations.json으로 렌더
    </svg>
  </div>
</div>
```

**핵심 결정: 이미지와 오버레이를 같은 변환 공간에 넣는다.** 그러면 팬/줌은 부모 `transform` 문자열 하나만 갱신하면 되고, 핀 좌표 재계산이 전혀 필요 없다. 레이아웃을 건드리지 않으므로 컴포지터 스레드에서만 처리된다.

**입력 처리 — Pointer Events 단일 경로**

마우스/터치/펜을 분기하지 않는다. `pointerdown/move/up`만 쓰고 `Map<pointerId, {x,y}>`로 활성 포인터를 추적한다.

- 포인터 1개 → 팬: `tx += dx; ty += dy`
- 포인터 2개 → 핀치: 두 점 거리 비율로 `k`를 갱신하고 **두 점의 중점을 앵커로** 삼는다
- `wheel` (`{passive:false}`) → 커서 지점 앵커 줌

**커서 고정 줌 수식** (틀리면 맵이 어긋난다):

```ts
// p = 뷰포트 좌표계에서의 커서 위치, k → k2 로 확대
const k2 = clamp(k * factor, MIN_K, MAX_K);
tx = p.x - (p.x - tx) * (k2 / k);
ty = p.y - (p.y - ty) * (k2 / k);
k = k2;
```

줌 범위는 `MIN_K = 뷰포트폭 / 1600` (전체보기), `MAX_K = 4` (원본 4배까지 — 웹맵이 아니므로 그 이상은 픽셀이 뭉개진다).

**성능**

- 모든 변환 쓰기를 `requestAnimationFrame`으로 배칭. 포인터 이벤트는 상태만 갱신하고 DOM은 프레임당 1회
- `will-change: transform`은 상호작용 중에만 켠다 (항상 켜두면 1600px 레이어가 계속 GPU 메모리를 잡는다)
- **메모리 주의**: 1600×1600 디코딩 = 약 10MB RGBA. 인게임맵/바이옴맵 두 장을 동시에 DOM에 두지 않는다. 레이어 전환 시 비활성 `<img>`는 언마운트. `decoding="async"`, `fetchpriority="high"`

**그리드**

```svg
<pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
  <path d="M80 0H0V80" fill="none" stroke="currentColor"
        stroke-width="1" vector-effect="non-scaling-stroke"/>
</pattern>
```

`vector-effect="non-scaling-stroke"`가 핵심 — 확대해도 격자선이 1px로 유지된다. 이걸 안 쓰면 4배 줌에서 선이 4px 뭉치가 된다.

**핀 역스케일**

핀도 같이 커지면 안 되므로 각 핀은 `<g transform={translate(x,y) scale(1/k)}>`. `k`가 signal이라 Preact가 핀 27개만 리렌더한다 (이미지는 건드리지 않는다).

**게임 좌표 ↔ 이미지 픽셀 매핑**

`src/lib/map-config.ts`에 아핀 변환 상수를 둔다:

```ts
export const MAP = { originUu: { x: -324_698, y: -375_000 }, uuPerPx: 425.4 };
export const uuToPx = (u) => ({
  x: (u.x - MAP.originUu.x) / MAP.uuPerPx,
  y: (u.y - MAP.originUu.y) / MAP.uuPerPx,
});
```

**정직하게: 이 상수는 알려진 랜드마크 2개 이상으로 손으로 캘리브레이션해야 한다.** 자동 검증 수단이 없다 (§8 리스크 3).

**딥링크 — 문서와 도구를 잇는 다리**

URL 해시에 뷰 상태를 넣는다: `/map/#z=2.4&x=812&y=530&layer=biome&pin=northern-forest`

그러면 **정적 단계도 문서에서 `[북부 숲 시작 지점](/map/#…)` 으로 바로 링크할 수 있다.** 이게 콘텐츠 우선 설계의 실질적 이득이다 — 아일랜드가 문서의 링크 대상이 된다. SPA에선 이런 링크가 라우터 상태 복원 코드를 요구한다.

**SSR 폴백**

Astro는 아일랜드의 초기 HTML을 빌드 때 렌더한다. `<img>`와 정적 핀 목록이 HTML에 들어간다 → **하이드레이션 전에 맵 그림이 이미 보인다.** 그래서 `client:load`가 아니라 `client:idle`을 쓴다. 그림은 즉시, 조작은 브라우저가 한가해지면.

맵 아래에는 입지별 평가(자원 노드 구성, 물 접근성, 오염, 장단점)를 **정적 HTML**로 전부 깔아둔다. 오프라인·인쇄·JS 실패 어디서든 읽힌다.

### ③ 공장 성장 단계도 — 순수 정적, JS 0KB

- 각 단계를 `src/content/stages/*.md`로 작성. Content Layer + Zod 스키마(`tier`, `powerMw`, `prereq[]`, `unlocks[]`)
- 다이어그램은 **손으로 그린 인라인 SVG**를 `src/diagrams/*.svg`에 두고 Astro 컴포넌트로 인라인 삽입. 인라인이므로 `currentColor` / CSS 변수로 다크모드 대응이 공짜, 추가 요청 0회
- 배치·배관·배선을 3개 레이어로 그리고 `<input type=checkbox>` + `:has()`로 **JS 없이** 레이어 on/off
- 각 단계 문서 안에서 `/map/#…`, `/calc/#…`, `/glossary/[id]/`로 링크. 문서가 도구의 진입점이 된다
- Mermaid를 굳이 쓰겠다면 **빌드 시점에만** (rehype-mermaid + playwright → SVG 산출). 단 무거운 dev 의존성이 붙는다. 다이어그램 8장 정도면 수제 SVG가 총비용이 낮다

### ④ 생산 라인 계산기 — 재귀 해석기 (아일랜드 + 빌드 시점 사전계산)

이 앱에서 기술적으로 가장 어려운 부분이다. 2단 구조로 간다.

**데이터 모델**

```ts
type Recipe = {
  id: string;
  products: { item: string; amount: number }[];   // 부산물 포함
  ingredients: { item: string; amount: number }[];
  durationSec: number;
  machine: string;      // constructor | assembler | refinery | ...
  powerMw: number;
  alternate: boolean;
};
const perMin = (amount, durationSec) => amount * 60 / durationSec;
```

**4-1. 유리수 산술 (부동소수점 금지)**

`0.375/min` 같은 값이 20단계 재귀를 거치면 `2.9999999996 → ceil = 3` 대신 `3.0000000004 → ceil = 4`가 나온다. **기계 한 대 차이는 이 앱의 사실상 유일한 출력값이므로 치명적이다.** 40줄짜리 유리수 타입(`{ n: bigint, d: bigint }` + `gcd` 약분)을 직접 짠다. 라이브러리 불필요.

**4-2. 그래프 분석 먼저, 재귀는 그 다음**

```
1. 사용자가 고른 레시피 집합으로 의존성 그래프 구성
2. Tarjan SCC 실행
3. 모든 SCC 크기 == 1  →  순수 DAG → 재귀 해석 (정확하고 빠름)
4. 크기 > 1인 SCC 존재  →  순환 → LP 경로 (4-4)
```

이 판정 단계를 건너뛰면 **순환 레시피에서 조용히 틀린 숫자를 뱉는다.** 무한 재귀보다 나쁘다.

**4-3. DAG 재귀 해석 (95%의 경우)**

```ts
function solve(item: ItemId, rate: Rat, acc: Map<ItemId, Rat>, chosen: RecipeMap) {
  acc.set(item, add(acc.get(item) ?? ZERO, rate));
  const r = chosen.get(item);
  if (!r) return;                              // 원광 / 원유 / 물 = 리프
  const runs = div(rate, outputRatePerMin(r, item));   // 분당 레시피 실행 횟수
  for (const ing of r.ingredients) {
    solve(ing.item, mul(runs, inputRatePerMin(r, ing)), acc, chosen);
  }
}
```

- 메모이제이션은 **누산 Map** 자체가 담당한다. 같은 아이템이 여러 경로로 요구되면 합산되어야 하므로, 결과 캐시가 아니라 누산이 맞다
- 출력: 아이템별 총 소요 개/분, 기계별 대수(`ceil` = 건설 지시 / 소수 = 언더클럭 권고), 총 전력(MW), 원자재 소비(광석 개/분 → 노드 몇 개·몇 순도)
- **깊이 제한 없이도 종료가 보장된다** — 4-2에서 DAG임을 증명했으므로

**4-4. 순환 레시피 — 지연 로드되는 LP 솔버**

Recycled Plastic ↔ Recycled Rubber, Packaged Fuel ↔ Unpackage Fuel 루프는 재귀로 풀리지 않는다. 정확한 해는 선형계획이다:

```
min  Σ (원자재 소비)
s.t. A·x ≥ b        A = 레시피별 순 생산 행렬, x = 레시피 실행률
     x ≥ 0
```

- 구현: SCC가 감지될 때만 `await import('./lp-solver')` — **동적 임포트로 지연 로드.** 티어 1~4만 하는 대부분의 사용자는 솔버 코드를 아예 받지 않는다. 아일랜드 안에서 다시 아일랜드 원칙을 적용하는 셈이다
- `glpk.js`(WASM ~1MB)는 기각. `javascript-lp-solver` 급(~30KB) 또는 자작 dense simplex(~200줄)
- **v1 출시 전략: LP를 v1.1로 미룬다.** v1은 순환 감지 시 "이 체인은 순환 레시피를 포함해 정확한 해를 계산할 수 없습니다 (해당 대체 레시피를 끄면 계산됩니다)"를 명시적으로 띄운다. **틀린 숫자보다 거절이 낫다.** 이 앱은 신뢰가 곧 제품이다

**4-5. 빌드 시점 사전계산 — Astro를 고른 진짜 이유**

```astro
---
// src/pages/calc/[slug].astro
export async function getStaticPaths() {
  const { solve } = await import('../../lib/solver');   // 브라우저와 동일한 모듈
  return COMMON_TARGETS.map(t => ({                     // 모듈러 프레임 10/min 등 ~30개
    params: { slug: `${t.item}-${t.rate}` },
    props: { result: solve(t.item, t.rate) },           // Node에서 빌드 때 계산
  }));
}
---
<ProductionTable result={Astro.props.result} />         <!-- 순수 HTML -->
```

자주 찾는 목표 30개는 **JS 0KB의 정적 표**가 된다. 알트탭으로 "모듈러 프레임 10개/분 뭐 필요하지?" 확인하는 시나리오가 즉시 응답한다. 커스텀 수치를 넣을 때만 `/calc/`의 아일랜드가 뜬다.

상태는 해시에 넣어 공유·북마크 가능하게 한다: `/calc/#t=modular-frame&r=10&alt=iron-alloy-ingot,recycled-plastic`

**4-6. 데이터 로딩**

전체 `recipes.json`(858개 레시피면 수백 KB)을 아일랜드에 통째로 넣지 않는다. 빌드 때 **티어별로 샤딩**해 `_astro/recipes-t{1..9}.json`으로 뽑고, 사용자가 고른 목표의 티어까지만 동적 로드한다.

### ⑤ 용어집 — 순수 정적, JS 0KB

- `glossary.json` → Content Layer `file()` 로더 + Zod 스키마. 현재 필드(`term / en / tier / short / why / how / gotcha / see`)를 그대로 스키마화
- `see: ["load-balancer", ...]` 상호참조를 **빌드 때 해석한다. 존재하지 않는 id면 빌드 실패.** 16개일 땐 사소하지만 100개가 되면 이게 유일한 방어선이다
- **학습 레이어 = `<Term>` 컴포넌트.** 단계도/마일스톤 문서 본문에서 `<Term id="manifold">매니폴드</Term>`라고 쓰면 밑줄 친 용어 + **네이티브 Popover API**(`popovertarget` / `popover` 속성)로 `short` 설명이 뜬다. **JavaScript 0바이트.** (Popover API는 Chrome 114 / Safari 17 / Firefox 125부터 — 2026년 기준 Baseline로 판단되나 배포 전 재확인 권장)
- **티어별 점진 공개도 JS 없이**: 숨긴 `<input type=radio name=tier>` + `:has()` 선택자로 "티어 3까지만 보기" 필터. 초보자가 티어 7 용어에 압도되지 않게 하는 게 이 화면의 목적이므로 기본값을 낮게 잡는다

### ⑥ 레퍼런스 표 — 정적 + (선택) 1KB 바닐라 검색

- 빌드 때 데이터 → `<table>` HTML 생성. **행 수를 통제한다**: 858행 한 페이지는 DOM 부담이 크므로 티어별(`/ref/recipes/t3/`) 또는 기계별로 분할해 페이지당 ~80행
- **정렬**: 유용한 정렬 키 3개(이름 / 개당 소요시간 / 전력)를 **빌드 때 미리 정렬한 별도 URL**로 뽑는다 (`/ref/recipes/t3/by-power/`). 정적이면서 정렬이 되고, 링크 공유도 된다
- **검색**: 프레임워크 없이 ~40줄 바닐라. `input` 이벤트 → 행에 `hidden` 토글. 인라인 `<script>`, 1KB 미만
- **정직한 한계**: 다중 조건 필터 + 열 정렬 + 가상 스크롤이 필요해지면 이건 스프레드시트이고, 여기엔 진짜 테이블 아일랜드(8~15KB)가 필요하다. 그때 이 화면 **하나만** 아일랜드로 바꾸면 되고 나머지 5개 화면은 영향받지 않는다 — 이게 아일랜드 구조의 진짜 이득이다

---

## 5. 데이터 파이프라인

```
Satisfactory 설치 폴더
  CommunityResources/Docs/Docs.json     ← UTF-16 인코딩, 선두 BOM(0xFEFF) 스킵 필요
        │
        │  node scripts/gen-data.mjs      ← 수동 실행. CI에 없음
        ▼
  src/data/recipes.json      정규화 (perMin 사전계산, 티어별 샤딩)
  src/data/buildings.json    아이콘 파일명 매핑 포함
  src/data/milestones.json
  src/data/glossary.json     ← 수기 작성 (생성 대상 아님)
        │
        │  astro build (CI)
        ▼
  dist/  ← 순수 HTML/CSS/JS
```

**설계 원칙 3가지**

1. **생성 스크립트는 사이트 빌드의 일부가 아니다.** CI는 Docs.json을 본 적이 없다. 산출 JSON만 커밋한다 → CI 단순화 + 게임 데이터를 저장소에 넣지 않음
2. **Docs.json 자체를 public 저장소에 커밋하지 않는다.** 게임사 저작물이다. 파생 수치(개/분, MW)만 저장한다 (§8 리스크 4)
3. UTF-16 파싱 주의: `fs.readFileSync(p).toString("utf16le").replace(/^\uFEFF/, "")`. 이걸 놓쳐서 `JSON.parse`가 실패하는 게 가장 흔한 함정이다. 검증된 커뮤니티 파서(`satisfactory-docs-parser` 등)를 참고하되 **의존성으로 넣지 말고 로직만 가져온다** — 게임 패치마다 깨질 코드를 남의 릴리스 주기에 묶지 않는다

---

## 6. 오프라인 (PWA)

GitHub Pages는 `*.github.io`에 HTTPS를 제공하므로 서비스워커가 동작한다. 단 **스코프가 `/satisfactory-ops/`** 이므로 `base` 설정과 SW 등록 스코프가 정확히 맞아야 한다.

`@vite-pwa/astro` + Workbox `generateSW`:

```
프리캐시 (첫 방문 시 즉시)
  HTML 전 페이지     ~200KB   MPA이므로 각 URL이 개별 캐시 엔트리.
                             오프라인 네비게이션이 자명하게 동작한다
  CSS + 아일랜드 JS   ~50KB
  건물 아이콘 27개    228KB
  ─────────────────────────
  합계               ~480KB

런타임 캐시 (CacheFirst, 첫 사용 시)
  맵 webp 2장        420KB   프리캐시하지 않는다.
                             맵을 안 보는 방문에서 첫 로드를 420KB 늦출 이유가 없다
  recipes-t*.json            사용한 티어만 캐시
```

- `navigateFallback`은 `/satisfactory-ops/offline/`. MPA라서 SPA식 `index.html` 폴백은 오히려 틀린 페이지를 보여준다
- `skipWaiting: false` + 업데이트 감지 시 "새 버전이 있습니다 · 새로고침" 토스트. 게임 중에 페이지가 갑자기 갈아엎어지면 안 된다
- 사이트 총량 ~1.5MB → GH Pages 1GB 한도 대비 0.15%

---

## 7. 빌드 의존성의 비용 — 정직한 계산

이 제안의 핵심 대가다. 숨기지 않고 적는다.

### 7.1 정량

| 항목 | 값 |
|---|---|
| `node_modules` | 약 180~250MB, 400~600 패키지 (`sharp` 제거 시 하한) |
| 콜드 `npm ci` | 30~60초 |
| `astro build` (약 60페이지) | 10~25초 (Astro 7 Rolldown 기준. GH Pages 배포 타임아웃 10분 대비 여유) |
| CI 1회 총 소요 | 1~2분 |
| 저장소 추가 파일 | `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `.github/workflows/deploy.yml`, `.nvmrc` |

### 7.2 정성 — 진짜 아픈 것들

1. **"파일 고치고 새로고침"이 사라진다.** `npm run dev`를 띄워야 한다. 게임하다 오타 하나 고치려고 터미널을 여는 마찰은 실재한다
2. **메이저 버전 회전율.** Astro는 18개월 사이 5 → 6 → 7을 냈다. 대략 **연 1회 마이그레이션 세금**을 각오해야 한다. Astro 7은 특히 아프다 — Rust 컴파일러가 HTML 자동 교정을 없애서 닫지 않은 태그가 에러이고, Sätteri가 remark/rehype를 기본에서 밀어냈다
3. **공급망 표면.** public 저장소 + 500개 전이 의존성 = Dependabot PR이 매주 온다. 개인 프로젝트에서 이건 무시하게 되고, 무시하면 알림 피로만 남는다
4. **2년 방치 리스크.** 손 놓았다가 돌아왔을 때 `npm ci`가 재현되지 않을 수 있다 (레지스트리 삭제, Node ABI 변화). → `.nvmrc`로 Node 22 고정 + lockfile 커밋 필수
5. **디버깅 층위가 하나 늘어난다.** 브라우저에서 보이는 것과 소스가 1:1이 아니다. 소스맵으로 대부분 덮이지만 하이드레이션 불일치는 처음이면 반나절을 먹는다

### 7.3 그럼에도 — 탈출 비용이 유한하다는 것

**이 대가를 감당할 수 있는 이유는 산출물이 순수 정적 사이트이기 때문이다.**

Astro가 내일 사라져도 `dist/`는 그냥 HTML/CSS/JS다. 그걸 새 소스로 삼아 포크하면 사이트는 계속 산다. 데이터 하나 못 잃고 URL 하나 안 깨진다. 런타임 프레임워크에 묶인 SPA에는 없는 보험이다.

반대로 **빌드를 안 쓰는 선택의 비용도 정직하게 계산해야 한다.** 858개 레시피 × 6개 화면을 수기 HTML로 유지한다는 건:

- 레시피 하나 바뀌면 표·계산기·용어집 세 군데를 손으로 고친다
- `see` 상호참조가 조용히 깨진다 (빌드가 없으니 잡아줄 것이 없다)
- 게임 패치마다 수백 개 숫자를 손으로 옮긴다
- 결국 "JSON을 HTML로 바꾸는 스크립트"를 직접 짜게 되고, 그건 **Astro보다 못한 자작 SSG**다

즉 실제 선택지는 "빌드 있음 vs 없음"이 아니라 **"검증된 빌드 vs 자작 빌드"** 다.

---

## 8. 리스크

| # | 리스크 | 심각도 | 완화 |
|---|---|---|---|
| 1 | **Astro 메이저 회전** (5→6→7, 18개월). 1인 개발자의 연 1회 마이그레이션 세금 | 중 | 실험적 기능 사용 금지. `client:*` · Content Layer 등 안정 API만 사용. 마이너 버전 고정 |
| 2 | **순환 레시피 LP 솔버**. 이 계획에서 가장 불확실한 항목. 정확한 해가 선형계획이며 구현·검증 비용이 크다 | 높음 | v1은 SCC 감지 후 **명시적 거부**. 틀린 숫자를 내지 않는다. LP는 v1.1, 동적 임포트로 격리 |
| 3 | **맵 좌표 캘리브레이션**. 게임 좌표↔픽셀 아핀 변환을 손으로 맞춰야 하고 검증 수단이 없다. 핀이 어긋나면 없느니만 못하다 | 높음 | 랜드마크 3개 이상 교차검증. 초기엔 좌표 대신 **이미지 위 직접 클릭 배치**로 시작 |
| 4 | **Docs.json 저작권**. public 저장소에 게임 데이터 원본 커밋은 법적 노출 | 중 | 원본 미커밋. 파생 수치만. `LICENSE`에 게임 데이터 출처·비상업 명시 |
| 5 | **게임 패치 시 데이터 표류**. 생성 스크립트가 수동 실행이라 갱신을 잊으면 조용히 낡는다. CI가 잡아주지 못한다 | 중 | 각 데이터 파일에 `gameVersion` 필드. 사이트 푸터에 "Satisfactory 1.x 기준" 상시 표기 |
| 6 | **localStorage 유실**. 백엔드가 없으므로 브라우저 데이터 삭제 시 진척이 사라진다. iOS Safari의 스크립트 저장소 만료 정책(홈화면 PWA는 예외로 알려짐)은 **배포 전 실측 확인 필요** | 중 | 내보내기 버튼 + URL 해시 전송. iOS 사용자에게 "홈 화면에 추가" 유도 |
| 7 | **Astro 7 엄격 파싱**. 닫지 않은 태그·미종료 속성이 에러. 기존 HTML 습관이 깨진다 | 낮음 | 초기 셋업 때 한 번 겪고 끝나는 비용 |
| 8 | **저사양 기기의 1600px 맵**. 레이어당 ~10MB 디코딩, 구형 태블릿에서 버벅일 수 있다 | 중 | 활성 레이어 1장만 마운트. 필요 시 800px 축소본을 저해상 프리뷰로 선로딩 |
| 9 | **아일랜드 경계 오설계**. 아일랜드를 너무 크게 잡으면(예: 마일스톤 페이지 전체를 아일랜드로) 이 아키텍처의 이점이 그대로 증발한다 | 중 | 규칙 명문화: **"상태를 소유하는 최소 단위만 아일랜드"**. PR마다 페이지별 JS 예산 확인 |
| 10 | **한/영 이중언어 확장 시** Astro i18n 라우팅 도입이 라우트 수를 2배로 만든다 | 낮음 | 한국어 1차 확정. 영어는 `/en/` 하위로 나중에. 데이터의 `en` 필드는 지금부터 유지 |

---

## 9. 성공 기준 (측정 가능한 목표)

| 지표 | 목표 |
|---|---|
| 용어집 / 레퍼런스 / 단계도 페이지 JS | **0KB** |
| 맵 페이지 JS (gzip) | < 10KB |
| 계산기 페이지 JS (gzip, DAG 경로) | < 15KB |
| 문서 페이지 TTI (모바일 4G 시뮬) | < 1.0s |
| 오프라인 커버리지 | 전 라우트 + 아이콘 (맵은 1회 방문 후) |
| CI 빌드 시간 | < 2분 |
| 사이트 총량 | < 2MB |

이 숫자들을 `.github/workflows`에 예산 체크로 넣으면 리스크 9(아일랜드 비대화)가 자동으로 잡힌다.

---

## 참고 출처

- [Astro 7.0 릴리스 (2026-06-22)](https://astro.build/blog/astro-7/) — Rust 컴파일러, Vite 8 + Rolldown, 빌드 15~61% 단축, 엄격 파싱, Sätteri 마크다운 파이프라인
- [Astro GitHub Pages 배포 가이드](https://docs.astro.build/en/guides/deploy/github/) — `site` / `base` 설정, `withastro/action`, lockfile 커밋 필수
- [GitHub Pages 사용 한도](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — 1GB, 소프트 100GB/월, 10분 배포 타임아웃
- [vite-pwa/astro](https://github.com/vite-pwa/astro) — Workbox 기반 오프라인 지원
- [Satisfactory Community resources](https://satisfactory.wiki.gg/wiki/Community_resources) — Docs.json 경로 및 UTF-16 인코딩
- [satisfactory-docs-parser](https://github.com/lydianlights/satisfactory-docs-parser) — Docs.json 파싱 참고 구현
- [factory-calculator](https://github.com/marci07iq/factory-calculator) — 순환 레시피를 선형계획으로 푸는 선례
