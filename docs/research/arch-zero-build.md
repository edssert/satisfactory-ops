# 아키텍처 제안 — 무빌드 극단 (의존성 0)

> satisfactory-ops / 관점: **빌드 스텝 없음 · npm 의존성 없음 · 바닐라 ES 모듈 + CSS**
> 작성일 2026-08-19 · 심사용 단일 관점 제안서 (절충 없음, 단점은 12장에 정직하게)

---

## 0. 한 줄 요약

**`git push` = 배포. 그 사이에 아무것도 없다.**

바닐라 ES 모듈 + 순수 CSS + 정적 JSON으로 6개 화면을 전부 구현하고, GitHub Pages에 그대로 올린다.
빌드 산출물이 없으므로 **저장소에 보이는 것이 곧 배포된 것**이고, 5년 뒤 `npm install`이 깨질 일 자체가 존재하지 않는다.
어려운 부분(맵 줌/팬, 재귀 계산기, 상태 저장)은 프레임워크가 필요한 문제가 아니라 **알고리즘 문제**이며, 각각 60~140줄로 해결된다. 아래에 구현 설계를 전부 적었다.

---

## 1. 먼저, 전제 하나를 정정한다 (정직성)

브리핑에 "file:// 로도 열린다"가 무기로 적혀 있다. **이 전제는 절반이 틀렸다.**

- HTML 스펙상 모듈 스크립트는 CORS 검사를 거쳐 페치된다. `file://`의 origin은 `null`이므로 **`<script type="module">`은 Chrome/Firefox에서 차단된다.**
  (`Access to script at 'file:///...' from origin 'null' has been blocked by CORS policy` — [whatwg/html#8121](https://github.com/whatwg/html/issues/8121))
- 같은 이유로 `fetch('./data/recipes.json')`도 `file://`에서 실패한다.
- 서비스워커도 `file://`에서는 등록되지 않는다.

추측으로 무기를 세우면 심사에서 죽는다. 그래서 이 제안은 **file:// 를 1순위 무기로 쓰지 않는다.** 대신 실제 요구사항("알트탭, 두 번째 모니터, 태블릿, 오프라인, 느리면 안 씀")을 충족하는 진짜 무기는 이것이다.

| 요구 | 무빌드 정적 사이트의 답 |
|---|---|
| 알트탭 즉시 표시 | 서비스워커 프리캐시 → 네트워크 왕복 0, 콜드 스타트 수십 ms |
| 오프라인 | SW + 전체 자산 1MB 미만 → **앱 전체를 통째로 캐시** |
| 태블릿/폰 | PWA 설치(홈 화면 추가) → 주소창 없는 전용 창 |
| 5년 뒤에도 동작 | 툴체인이 없으니 썩을 툴체인이 없다 |
| 1인 유지보수 | 디버깅 대상 = 내가 쓴 코드뿐. 소스맵도 필요 없다 |

**file:// 는 "보험"으로만 쓴다.** 11장 / 12.1 참고 — 선택적 60줄 pack 스크립트로 단일 HTML을 뽑아 USB/아카이브용으로 남긴다. 이 스크립트가 없어도 사이트는 완전히 동작한다.

---

## 2. 사실 확인 결과 (2026-08 기준, 근거 링크 포함)

| 항목 | 확인된 사실 | 설계 영향 |
|---|---|---|
| GitHub Pages 용량 | 사이트 1GB, 대역폭 100GB/월(소프트), 빌드 10회/시(소프트) | 우리 자산 총합 ~1MB. 무관 |
| GitHub Pages 헤더 | **커스텀 헤더 불가**, `Cache-Control: max-age=600` 고정 | SW 갱신이 배포 후 최대 10분 지연. 허용 가능 |
| ES 모듈 on file:// | CORS로 차단 | 1장 참조 |
| import maps | Chrome 89+/Safari 16.4+/Firefox 108+ — Baseline | 경로 별칭 사용 가능(단, 상대경로로 충분해 안 씀) |
| JSON 모듈 (`with { type:'json' }`) | Chrome 123+/Firefox 128+/Safari 17.2+, ES2025 Baseline newly available | 쓸 수 있으나 **캐시·지연로딩 제어 때문에 `fetch` 채택** |
| CompressionStream | 2023-05부터 전 브라우저(Baseline widely available) | 공유 링크 압축을 **의존성 0으로** 구현 |
| Safari ITP | 7일 미사용 시 localStorage/SW 등록까지 삭제. **홈 화면 추가한 웹앱은 예외** | 진척 데이터 소실 리스크 → 백업 UX 필수(9.3) |
| Satisfactory Docs.json | `<게임경로>/CommunityResources/Docs/Docs.json`, **UTF-16 + BOM** | 데이터 생성 스크립트에서 `utf16le` 디코딩 + BOM 제거 |

출처: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [GH community #60087 (캐시 헤더)](https://github.com/orgs/community/discussions/60087) · [whatwg/html#8121](https://github.com/whatwg/html/issues/8121) · [MDN import attributes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with) · [web.dev CompressionStreams](https://web.dev/blog/compressionstreams) · [WebKit: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) · [Satisfactory Modding Docs: Extracting Game Files](https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html)

---

## 3. 왜 이 프로젝트에서 무빌드가 "그냥 괜찮은" 정도가 아니라 최적인가

### 3.1 이 앱은 프레임워크가 잘하는 일을 요구하지 않는다

프레임워크의 핵심 가치는 **잦은 상태 변경을 대량의 DOM에 안전하게 반영**하는 것이다. 이 앱의 상태 변경을 실제로 세어 보자.

- ① 체크리스트: 클릭당 체크박스 1개 + 진척률 텍스트 1개
- ② 맵: 초당 60회 갱신이지만 갱신 대상은 **`transform` 문자열 하나**. VDOM이 개입하면 오히려 방해다
- ③ 다이어그램: 정적 SVG의 레이어 토글
- ④ 계산기: 입력 변경 → 결과 표 수십 행 재생성. 40행 재생성은 1ms
- ⑤ 용어집: 검색 필터링 — `content-visibility`로 브라우저에 위임
- ⑥ 레퍼런스 표: 정렬/필터 — 위와 동일

**리액티브 렌더링이 정산해 줄 복잡도 부채가 애초에 발생하지 않는다.** 이런 앱에 React를 얹는 것은 200KB를 내고 아무것도 사지 않는 것이다.

### 3.2 성능 예산이 무빌드에 유리하다

사용 맥락이 "알트탭으로 0.3초 안에 확인"이다. 예산:

| 리소스 | 예산 | 근거 |
|---|---|---|
| 초기 HTML+CSS+부트 JS | ≤ 30KB (전송 기준) | 프레임워크 런타임 0 |
| 라우트별 JS | ≤ 15KB | 동적 `import()`로 지연 로드 |
| 데이터 JSON | 그 라우트가 쓰는 것만 | 계산기 진입 시에만 recipes.json |
| 재방문 네트워크 | **0바이트** | SW cache-first |

동적 `import()`는 브라우저 네이티브다. **번들러 없이도 코드 스플리팅이 공짜로 온다** — 자주 간과되는 사실이다.

### 3.3 유지보수 부담(1인)의 실체

프레임워크 스택의 유지보수 비용은 코드가 아니라 **주변부**에서 나온다: 번들러 메이저 업, TS 버전 충돌, 플러그인 폐기, lockfile 취약점 알림, Node EOL, CI 캐시 깨짐. 게임 하다가 짬 내서 만드는 프로젝트에서 이 비용은 "6개월 방치 후 돌아왔더니 `npm run dev`가 안 됨" 형태로 청구되고, 그게 이런 프로젝트가 죽는 실제 원인이다.

무빌드에서는 6개월 뒤에 돌아와도 그냥 된다. 고칠 것은 내 코드뿐이다.

### 3.4 데이터가 게임 패치에 종속된다

게임이 업데이트되면 레시피가 바뀐다. 이때 필요한 작업은 "Docs.json 다시 파싱해서 JSON 커밋"이다. **빌드 파이프라인이 있든 없든 이 작업은 똑같이 필요하다.** 무빌드에서는 이 스크립트가 유일한 자동화이며, 그마저 **깨져도 사이트는 계속 돈다**(산출물이 커밋되어 있으므로). 빌드가 있는 스택에서는 이 스크립트가 빌드에 엮이면서 사이트 생존과 운명을 같이한다.

---

## 4. 전체 구조

```
satisfactory-ops/
├─ index.html            # 유일한 HTML. 앱 셸 + <template> 정의
├─ manifest.webmanifest
├─ sw.js                 # 서비스워커 (루트에 있어야 스코프 전체)
├─ .nojekyll             # (이미 있음) _ 접두 파일 보호
├─ assets/
│  ├─ map/*.webp         # 400KB
│  └─ buildings/*.webp   # 170KB, 27개
├─ src/
│  ├─ css/
│  │  ├─ tokens.css      # 색/간격/타이포 커스텀 프로퍼티
│  │  ├─ base.css        # 리셋 + 레이아웃 프리미티브
│  │  └─ views/*.css     # 뷰별 (라우트 진입 시 <link> 주입)
│  ├─ js/
│  │  ├─ main.js         # 부트스트랩 + 라우터 등록 + SW 등록
│  │  ├─ core/
│  │  │  ├─ router.js    # 해시 라우터 (~70줄)
│  │  │  ├─ store.js     # 상태 + 영속화 + 마이그레이션 (~90줄)
│  │  │  ├─ dom.js       # tpl(), keyedList(), 위임 헬퍼 (~80줄)
│  │  │  ├─ panzoom.js   # 줌/팬 엔진 (~140줄) ← 맵/다이어그램 공용
│  │  │  ├─ fraction.js  # 유리수 산술 (~50줄)
│  │  │  ├─ solver.js    # 선형 생산계 풀이 (~120줄)
│  │  │  └─ share.js     # URL 해시 인코딩 + CompressionStream (~50줄)
│  │  └─ views/
│  │     ├─ milestones.js   map.js        diagram.js
│  │     ├─ calculator.js   glossary.js   reference.js
│  └─ data/
│     ├─ recipes.json  items.json  buildings.json
│     ├─ milestones.json  glossary.json  map-pins.json
├─ scripts/
│  └─ gen-data.mjs      # Docs.json → src/data/*.json (Node stdlib만, 수동 실행)
├─ tests/
│  ├─ index.html        # 브라우저 테스트 러너 (의존성 0)
│  └─ *.test.js         # node --test 로도 동일 실행
└─ docs/{adr,research}/
```

**규칙 3개로 아키텍처가 정의된다.**

1. `core/`는 게임 지식을 모른다(순수 유틸). `views/`는 DOM을 만든다. `data/`는 로직을 모른다.
2. 모든 뷰는 `export function mount(root, params) → () => void`(정리 함수 반환) 시그니처를 따른다. 라우터는 이것만 안다.
3. 계산은 전부 순수 함수로 뽑아 `core/`나 `views/x.logic.js`에 둔다. **DOM을 만지는 코드와 계산하는 코드를 절대 같은 함수에 두지 않는다.** — 무프레임워크에서 유일하게 중요한 규율이고, 테스트 가능성과 나중의 프레임워크 이주 가능성을 동시에 산다.

### 4.1 상태 (store.js)

```js
// src/js/core/store.js
const KEY = 'sfops.v1';
const subs = new Set();
let state = migrate(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? initial();

export const get = () => state;

export function set(patch) {
  const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  if (next === state) return;
  state = next;
  for (const fn of subs) fn(state);
  persist();                       // 400ms 디바운스
}

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

let pending = 0;
function persist() {
  clearTimeout(pending);
  pending = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(state)), 400);
}
```

- 상태는 **하나의 평범한 객체**. 불변 갱신 규약만 지킨다.
- `schemaVersion` 필드 + `migrate()`의 버전별 함수 체인. 데이터 구조를 바꿔도 사용자의 100시간짜리 진척이 안 날아간다. **프레임워크가 해주지 않는 일이고, 이 앱에서 제일 중요한 일이다.**
- 용량: 체크박스 수백 개 + 계산기 프리셋 = 수 KB. localStorage 5MB 한계와 무관.
- 뷰는 `mount`에서 `subscribe`하고 정리 함수에서 해제한다. 누수 방지는 이 한 줄 규약으로 끝난다.

### 4.2 라우팅

```js
const routes = {
  '':         () => import('./views/milestones.js'),
  'map':      () => import('./views/map.js'),
  'growth':   () => import('./views/diagram.js'),
  'calc':     () => import('./views/calculator.js'),
  'glossary': () => import('./views/glossary.js'),
  'ref':      () => import('./views/reference.js'),
};
```

- 해시 라우팅(`#/calc?item=iron-plate&rate=60`). **GitHub Pages에서 404 리라이트 트릭이 필요 없다.**
- 뷰 전환: 이전 뷰의 정리 함수 호출 → 컨테이너 비움 → 새 모듈 `mount`. 20줄.
- 첫 페인트는 라우트 모듈을 기다리지 않는다. 앱 셸(네비 + 스켈레톤)이 먼저 뜬다.
- 뷰별 CSS는 `<link rel="stylesheet">`를 한 번만 주입하고 유지(재방문 시 재파싱 없음).

### 4.3 렌더링 전략 (프레임워크 없이 감당하는 법)

도구 세 개만 쓴다. 그 이상은 금지한다.

1. **정적 구조는 `<template>`** — `index.html`에 마크업을 두고 `cloneNode(true)`. HTML이 HTML 파일에 있으므로 검색·수정이 쉽다.
2. **텍스트/속성 갱신은 직접 대입** — mount 시 `const el = { rate: root.querySelector('[data-rate]'), … }`로 노드 참조 맵을 한 번 만들고 이후 `el.rate.textContent = …`. querySelector를 갱신 루프에서 반복하지 않는다.
3. **리스트는 keyed 헬퍼(80줄)** — `keyedList(container, items, keyFn, createFn, updateFn)`. 있는 노드는 재사용, 없어진 것만 제거, 순서는 `insertBefore`로 맞춘다. 이 80줄이 VDOM이 해주는 일의 95%다.

렌더 규약: 각 뷰는 `render(state)` **하나만** 노출하고, 스토어 구독은 `render`를 `requestAnimationFrame`으로 코얼레싱해 호출한다. "어디서 DOM이 바뀌는지 모르겠다"가 발생할 여지를 구조적으로 줄인다.

---

## 5. 화면 ② 입지 선정 — 맵 줌/팬 (핵심 난제 1)

### 5.1 왜 라이브러리가 필요 없나

Leaflet은 **타일 피라미드 + 지리 투영 + 플러그인 생태계**를 위한 물건이다. 우리는 타일이 없고(단일 webp 2장), 투영이 없고(평면 게임 좌표), 플러그인이 필요 없다. 실제로 필요한 것은 `{k, x, y}` 상태 하나와 그것을 갱신하는 포인터 수학이다. 그게 아래 140줄이다.

### 5.2 DOM 구조

```html
<div class="map-viewport">          <!-- overflow:hidden; touch-action:none; contain:layout paint -->
  <div class="map-world">           <!-- transform-origin:0 0; will-change:transform -->
    <img class="map-layer" src="assets/map/ingame-map.webp" decoding="async">
    <img class="map-layer" src="assets/map/biome-map.webp" style="opacity:var(--biome)">
    <div class="pins"><!-- 핀들 --></div>
  </div>
</div>
```

핵심: **레이어 하나에만 `transform`을 건다.** 이미지·핀·그리드가 같은 변환을 공유하므로 정렬이 깨질 수 없다. 브라우저는 이 변환을 합성 스레드에서 처리하므로 레이아웃/페인트가 발생하지 않는다 → 구형 노트북에서도 60fps.

### 5.3 변환 수학

상태는 `{k, x, y}`(스케일, 이동). 스크린 좌표 `s` ↔ 월드 좌표 `w`:

```
s = w·k + t          w = (s − t)/k
```

**커서 고정 줌**(줌해도 커서 밑 지점이 안 움직여야 한다 — 이게 안 되면 지도가 쓰레기가 된다):

```js
function zoomAt(px, py, factor) {          // px,py = 뷰포트 기준 커서 좌표
  const k2 = clamp(st.k * factor, MIN_K, MAX_K);
  st.x = px - (px - st.x) * (k2 / st.k);   // 앵커 보존
  st.y = py - (py - st.y) * (k2 / st.k);
  st.k = k2;
  schedule();
}
```

### 5.4 입력 처리 (Pointer Events 하나로 마우스/터치/펜 통합)

```js
const pts = new Map();                       // pointerId -> {x,y}

el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId);         // 뷰포트 밖으로 나가도 드래그 유지
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
});

el.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const prev = [...pts.values()];
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const cur = [...pts.values()];
  if (cur.length === 1) {                    // 팬
    st.x += cur[0].x - prev[0].x;
    st.y += cur[0].y - prev[0].y;
  } else {                                   // 핀치: 거리비 = 배율, 중점 = 앵커
    const m0 = mid(prev[0], prev[1]), m1 = mid(cur[0], cur[1]);
    zoomAt(m1.x - rect.left, m1.y - rect.top, dist(cur[0], cur[1]) / dist(prev[0], prev[1]));
    st.x += m1.x - m0.x;                     // 두 손가락 동시 이동
    st.y += m1.y - m0.y;
  }
  schedule();
});

// wheel: ctrlKey면 트랙패드 핀치(브라우저가 그렇게 보낸다), 아니면 휠 줌
el.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
```

`touch-action: none`(CSS)이 브라우저 기본 제스처를 막는 필수 스위치다. `wheel`은 `passive:false`로 등록해야 `preventDefault`가 먹는다. `pointercancel`/`pointerup`에서 `pts.delete` 필수.

### 5.5 rAF 코얼레싱 (성능의 전부)

```js
let raf = 0;
function schedule() { raf ||= requestAnimationFrame(apply); }
function apply() {
  raf = 0;
  world.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.k})`;
  world.style.setProperty('--k', st.k);              // 핀 역보정용
  viewport.classList.toggle('detail', st.k > 2.5);   // 라벨 표시 임계값
}
```

포인터 이벤트는 프레임당 여러 번 온다. **이벤트에서는 숫자만 갱신하고 DOM은 프레임당 1회만 만진다.** 이 한 가지가 "프레임워크 없이 60fps"의 실체다.

### 5.6 핀 오버레이

- 핀 좌표는 **이미지 정규화 좌표(0~1)** 로 `map-pins.json`에 저장 → 나중에 더 좋은 맵 이미지로 교체해도 데이터가 안 깨진다.
- 배치: world 레이어 안에서 `position:absolute; left: calc(var(--u)*100%); top: calc(var(--v)*100%)`.
- **크기 역보정**: `transform: translate(-50%,-100%) scale(calc(1 / var(--k)))` — 부모의 `--k` 하나만 갱신하면 수백 개 핀이 동시에 화면상 고정 크기를 유지한다. **JS 루프 없음.**
- 라벨/상세는 `.detail` 스코프에서만 표시(줌인 시에만). CSS가 처리하므로 JS 비용 0.
- 클릭은 `pins` 컨테이너에 **이벤트 위임 1개**. 핀이 1000개여도 리스너는 1개.
- 핀이 수천을 넘어 DOM이 버거워지면(현실적으로 안 넘는다) 같은 `{k,x,y}` 상태를 `<canvas>` 렌더러에 먹이면 된다 — panzoom 엔진은 그대로 재사용된다.

### 5.7 게임 좌표 ↔ 이미지 좌표

게임 내 좌표(cm)를 쓰려면 **하드코딩된 월드 바운즈를 믿지 말고 2점 캘리브레이션**한다. 좌표를 아는 지점 2곳(스폰 지점, 특정 자원 노드)을 맵 이미지에서 클릭해 픽셀 좌표를 얻고 `{cmPerPx, offsetX, offsetY}`를 계산해 `map.json`에 저장. 앱은 이 3개 숫자로만 변환한다. 맵 이미지가 바뀌면 캘리브레이션만 다시 한다.
개발용 "캘리브레이션 모드"를 `#/map?cal=1`로 숨겨두면 도구까지 앱 안에서 해결된다.

### 5.8 상태 보존

줌/센터를 URL 해시에 `#/map?z=2.14&u=0.42&v=0.31`로 300ms 스로틀 `replaceState`. → 새로고침 복원 + **"내 다음 공장 부지 여기"를 링크로 공유**. 서버 없이 공유 기능이 생긴다.

---

## 6. 화면 ④ 생산 라인 계산기 — 재귀 해결 (핵심 난제 2)

### 6.1 순진한 재귀는 왜 틀리는가

`need(item, rate)` → 하위 재료로 재귀. 튜토리얼에선 되지만 Satisfactory에서는 **세 번 틀린다.**

1. **부산물(byproduct)**: 플라스틱을 만들면 중유 잔여물이 나온다. 그걸 고무 생산에 돌리면 필요한 원유가 줄어든다. 단방향 재귀는 이 크레딧을 못 센다.
2. **순환(cycle)**: 중유 잔여물 ↔ 연료 ↔ 재활용 플라스틱/고무는 서로를 먹는다. DFS는 무한루프에 빠지거나 임의로 자른다.
3. **공유 중간재**: 여러 경로가 같은 철판을 요구할 때 합산 시점이 어긋나면 기계 수가 틀린다.

### 6.2 제안: 생산 계획은 재귀가 아니라 **선형계**다

미지수 `x_r` = 레시피 r의 **가동 배수**(= 100% 클럭 기준 기계 대수, 실수 허용).
각 아이템 i에 대해 순 생산 = 목표:

```
Σ_r  net[i][r] · x_r  =  d_i        (net = 산출률 − 투입률, 개/분/기계)
```

- `d_i` = 사용자가 요구한 최종 산출(예: 강화 철판 15/분). 나머지 중간재는 0(자급자족).
- **원료(광석/물/원유/석회석…)는 방정식에서 제외** — 외부 무한 공급으로 보고, 해를 구한 뒤 소비량만 역산한다.
- 아이템마다 레시피를 **하나씩 선택**(기본 or 대안 레시피 토글)하면 미지수 수 = 방정식 수 → **정사각 선형계**. 유일해가 존재한다.

이게 아름다운 이유: **부산물 크레딧과 순환이 자동으로 풀린다.** 특수 케이스 분기가 필요 없어 코드가 오히려 짧아진다.

```js
// src/js/core/solver.js (핵심부, 부분 피벗팅 Gauss-Jordan)
export function solve(targets, recipeFor, recipes, isRaw) {
  const items = reachableItems(targets, recipeFor, recipes, isRaw); // 관련 아이템만 수집
  const A = items.map(i => items.map(j => F.of(netRate(recipeFor[j], i, recipes))));
  const b = items.map(i => F.of(targets[i] ?? 0));
  return gaussJordan(A, b);          // x[j] = 레시피 recipeFor[j]의 가동 배수
}
```

- 규모: 후기 티어 최악의 경우도 관련 아이템 30~40개 → `O(n³) ≈ 64,000` 연산 → **1ms 미만**. 워커도 최적화도 불필요.
- **해가 음수로 나오면** = 그 조합에서 부산물이 과잉이라 물리적으로 성립하지 않는다는 뜻. 이걸 에러가 아니라 **조언**으로 바꾼다: "중유 잔여물이 X/분 남습니다 → 연료 발전기 N대 또는 싱크로 처리하세요." 계산기가 아니라 플레이북이라는 정체성이 여기서 살아난다.
- 특이행렬(레시피 선택이 모순)일 때는 피벗 실패 지점의 아이템 이름을 그대로 UI에 노출한다 — "이 아이템의 레시피를 골라야 합니다".

### 6.3 정확한 수 (유리수 산술, 50줄)

Satisfactory 비율은 유리수다(30/분, 4.5/분, 1/3 기계). float로 하면 `2.9999999996 기계`가 뜨고 신뢰가 무너진다. `{n: BigInt, d: BigInt}` + gcd 정규화 Fraction 50줄이면 끝난다. 표시할 때만 소수/분수로 변환한다(`4⅔대` 또는 `5대 @ 93.33% 클럭`).

### 6.4 화면에 내보내는 것 (계산기가 아니라 플레이북이 되는 지점)

1. **기계 대수** + 올림 시 남는 여유, 또는 **언더클럭 제안**. 전력은 `P = P₀ × clock^1.321`(게임 공식 상수를 데이터에 저장)로 계산.
2. **총 전력(MW)** 및 필요한 발전기 대수.
3. **원료 소비량** → "이 설계는 노말 철광 노드 1.5개를 먹습니다"(채굴기 등급별 산출을 데이터로 환산).
4. **벨트/파이프 등급**: 구간 유량 → Mk.2로 충분한가, 파이프 1줄로 되는가.
5. **부산물 잔량과 처리 방법**.
6. **건설 순서**: 위상 정렬로 "원료 → 제련 → 조립" 단계를 뽑아 체크리스트로 출력 → 화면 ①과 연결.

### 6.5 트리 뷰와 해의 분리

사람은 트리(무엇이 무엇을 먹는지)로 이해하고, 수치는 선형해에서 나온다.
→ **트리는 표현(DFS로 그리고 사이클은 "↩ 재활용" 배지로 접는다), 수치는 `solve()`의 x 벡터에서 조회.** 이 둘을 섞지 않는 것이 이 화면 설계의 요체다.

### 6.6 공유/저장

대안 레시피 선택 + 목표를 URL 해시로 인코딩. 짧으면 그대로, 길면 `CompressionStream('deflate-raw')` + base64url(2장 확인 완료, **의존성 0**). 디스코드에 붙여넣는 순간 상대방은 설치 없이 내 설계를 본다.

---

## 7. 나머지 4개 화면

### ① 마일스톤 진행 체크리스트

- `milestones.json`(티어 → 마일스톤 → 필요 부품/수량) + 스토어의 `checked` 집합.
- 마크업은 `<details>`로 티어 접기 — **JS 없이 접힘이 동작**하고 접근성이 공짜다.
- 상단 "지금 할 일" 카드: 미완료 마일스톤 중 첫 항목 + 부족 부품 + **그 부품을 만드는 라인 설계 링크(→ ④에 프리셋 파라미터로 진입)**. 이 앱이 계산기와 다른 지점이다.
- 체크 변경은 이벤트 위임 1개 + 해당 행 DOM만 갱신 + 진척률 텍스트 갱신. 전체 재렌더 없음.
- 진척 백업: 내보내기(Blob → `<a download>`), 가져오기(`<input type="file">`). 9.3 Safari 리스크에 대한 방어선.

### ③ 공장 성장 단계도 (배치/배관/배선)

- **손으로 그린 SVG**를 진실의 원천으로 삼는다. 단계별로 `<g id="stage-1">…`, 배관/배선은 `<g id="layer-pipes">`.
- 뷰는 (a) 단계 슬라이더 → `stage-N` 이하만 표시, (b) 레이어 토글 → `hidden` 속성 토글. **JS 30줄.**
- 확대/이동은 **5장의 `panzoom.js`를 그대로 재사용**. 무프레임워크의 재사용은 그냥 함수 호출이다 — 어댑터도 래퍼 컴포넌트도 없다.
- SVG 안의 건물 아이콘은 `<image href="assets/buildings/*.webp">`로 참조(이미 번들됨).
- 나중에 "노드를 드래그해 편집"까지 원하면 비용이 급증한다 → 12.3에 정직하게 적었다.

### ⑤ 용어집 (학습 레이어)

- 기존 `glossary.json`은 이미 좋은 스키마(`short/why/how/gotcha/see` + `tier`)를 갖고 있다. 그대로 쓴다.
- 검색: 13KB 전량 메모리 필터. **한글 초성 검색**(`ㅁㄴㅍㄷ` → 매니폴드)을 20줄로 구현 — 유니코드 산술 `(code − 0xAC00) / 588`. 라이브러리가 필요 없는 대표 사례.
- **핵심 기능**: 다른 화면 어디서든 `<b data-term="manifold">매니폴드</b>`로 쓰면 `document`에 붙인 **위임 리스너 1개**가 팝오버를 띄운다. 네이티브 `<dialog>` 또는 Popover API 사용(백드롭/포커스 트랩/ESC가 공짜).
- `tier` 필드로 "지금 티어에서 알아야 할 용어"만 먼저 보여준다 → 학습 레이어가 진행도와 연동된다.

### ⑥ 레퍼런스 표

- 수백~수천 행. **가상 스크롤을 직접 짜지 않는다.** 행에 `content-visibility: auto` + `contain-intrinsic-size: 0 40px`를 걸면 브라우저가 화면 밖 행의 렌더링을 건너뛴다. 가상 스크롤 라이브러리가 필요한 이유의 대부분이 CSS 두 줄로 사라진다.
- 정렬/필터는 배열 조작 후 keyedList 갱신. 정렬은 `Intl.Collator`(한글 정렬 정확).
- 열/헤더 고정은 `position: sticky`.

---

## 8. 오프라인 / PWA (알트탭 요구의 실질적 답)

```js
// sw.js
const V = 'sfops-2026-08-19a';                       // 배포 시 이 문자열만 바꾼다
const SHELL = ['./', './index.html', './src/css/tokens.css', './src/css/base.css',
               './src/js/main.js', './src/js/core/router.js' /* … 10여 개 */];

self.addEventListener('install', e => e.waitUntil(
  caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
        .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const immutable = /\.(webp|png|woff2)$/.test(url.pathname);
  e.respondWith(immutable ? cacheFirst(e.request) : staleWhileRevalidate(e.request));
});
```

- 전략: 이미지/폰트 = cache-first(불변), HTML/JS/CSS/JSON = **stale-while-revalidate** → 항상 즉시(0ms) 표시하면서 백그라운드로 갱신. 알트탭 요구에 정확히 맞는다.
- 총 자산 1MB 미만 → **앱 전체 프리캐시**가 부담이 아니다. 오프라인 완전 지원.
- 프리캐시 목록은 손으로 유지한다(파일 20개 수준, 자주 안 바뀜). **목록 생성 스크립트를 만들면 그게 빌드가 되므로 만들지 않는다.** 대신 `tests/`에 "SHELL의 모든 경로가 실제로 200을 반환하는가" 검사를 넣어 실수를 잡는다.
- 갱신 UX: `registration.waiting` 감지 시 "새 버전 · 새로고침" 토스트. GitHub Pages `max-age=600` 때문에 최대 10분 지연될 수 있다(2장) — 플레이북 앱에서 10분은 문제가 아니다.
- `manifest.webmanifest`: `"display":"standalone"`, `start_url`/`scope`는 **상대 경로**(프로젝트 페이지가 `/satisfactory-ops/` 서브패스이므로 절대 경로 금지). 태블릿에서 홈 화면에 추가하면 전용 창 + Safari 7일 삭제 예외(2장)를 동시에 얻는다.

---

## 9. 운영상의 세부

### 9.1 데이터 생성 (Docs.json → JSON)

```js
// scripts/gen-data.mjs — Node 표준 라이브러리만, npm install 없음
const raw = readFileSync(process.argv[2], 'utf16le').replace(/^﻿/, ''); // UTF-16 + BOM
```

- 게임 패치 때 **손으로 1회 실행**하고 산출 JSON을 커밋한다.
- **이건 빌드가 아니다**: 산출물이 저장소에 있고, 스크립트가 썩어도 사이트는 계속 동작한다. 빌드는 "배포마다 반드시 성공해야 하는 것"이고 이 스크립트는 "가끔 쓰는 도구"다. 이 구분이 무빌드 원칙의 핵심이며 타협이 아니다.
- 산출 시 앱이 쓰는 최소 형태로 줄인다(원본 수 MB → 필요한 것만 남겨 수백 KB).
- 산출 JSON에는 `gameVersion` 필드를 박는다. 게임 패치 후 데이터 불일치를 UI가 경고할 수 있다.

### 9.2 품질 (의존성 0으로)

- **테스트**: `tests/index.html`이 60줄짜리 assert 러너를 띄우고 `*.test.js`를 import. 같은 파일이 `node --test`로도 돈다(Node 내장, 설치 0). 대상: `solver.js`, `fraction.js`, 초성 검색, 스토어 마이그레이션. **DOM 코드는 테스트하지 않는다** — 그래서 4장 규칙 3(로직/DOM 분리)이 중요하다.
- **타입**: 파일 상단 `// @ts-check` + JSDoc. VS Code 내장 TS가 즉시 검사한다. 설치도 설정도 없다. CI 타입 체크를 원하면 `npx -y typescript` 한 줄 — 선택 사항이고 없어도 무방.
- **린트**: 없음. 1인 프로젝트에서 ESLint 설정 유지비 > 이득.

### 9.3 데이터 소실 방어 (실사용 리스크 1위)

Safari(홈 화면 미추가)는 7일 미사용 시 localStorage를 삭제한다(2장 확인). 100시간 플레이의 체크리스트가 날아가면 앱이 죽는다. 3중 방어:

1. PWA 설치 유도 배너(iOS는 "홈 화면에 추가" 안내) — 예외 조건 충족.
2. 변경 시 `IndexedDB`에도 복제(둘 다 지워질 수 있지만 비용이 0).
3. **명시적 내보내기 + URL 해시 백업**: 진척을 압축해 해시로 만들어 북마크하면 브라우저 저장소와 무관하게 살아남는다.

---

## 10. 접근성 · 국제화

- 한국어 1차: `<html lang="ko">`, `word-break: keep-all` + `text-wrap: pretty`로 한글 줄바꿈 품질 확보(게임 중 흘깃 보는 화면이라 가독성이 곧 기능이다).
- 영어(선택): `data/i18n/en.json` 지연 로드 + `data-i18n` 속성 치환. 빌드타임 추출기가 없으므로 **문자열은 반드시 JSON에만 둔다**는 규율로 대체(12.6에 위험 기재).
- 다크/라이트: `prefers-color-scheme` + `[data-theme]` 오버라이드. 게임 화면이 어두우므로 다크 기본.
- 두 번째 모니터/태블릿: 컨테이너 쿼리로 레이아웃 전환(Baseline). 터치 타겟 44px.

---

## 11. 탈출구 (이 선택은 일방통행이 아니다)

| 상황 | 대응 | 비용 |
|---|---|---|
| 뷰 하나가 너무 복잡해짐 (③이 편집기로 진화) | 그 뷰만 Preact/Solid를 ESM으로 import해 `mount()` 안에서 렌더 | 낮음. 라우터 계약이 `mount/unmount`뿐이라 뷰 단위 교체 가능 |
| 전면 프레임워크 이주 | `core/`(solver, panzoom, fraction, store)는 DOM 비의존 순수 모듈이라 그대로 이식 | 중간. 재작성 대상은 `views/`뿐 |
| 파일 수가 감당 안 됨 | 나중에 Vite를 얹어도 소스가 이미 표준 ESM이라 설정 0에 가깝다 | 낮음 |
| file:// 단일 파일이 꼭 필요 | `scripts/pack.mjs` 60줄(Node stdlib)로 모듈 인라인 → `satisfactory-ops.html` 1개 산출 | 낮음(단, 이건 형식상 빌드다 — 12.1) |

**즉 무빌드는 "나중에 빌드를 넣을 수 있는 상태"를 유지하는 선택이다.** 반대 방향(번들러 전제 코드에서 빌드를 제거)은 훨씬 비싸다.

---

## 12. 정직한 단점 (숨기지 않는다)

1. **file:// 순정 실행은 안 된다.** ES 모듈 CORS 차단(1장). 로컬 개발엔 `python -m http.server` 같은 정적 서버가 필요하고, 진짜 단일 파일이 필요하면 pack 스크립트를 써야 하는데 **그건 형식상 빌드다.** "무빌드 = 아무 도구도 없음"은 아니다.
2. **DOM 동기화가 내 책임이다.** 상태 3개가 얽힌 화면(④: 목표 + 대안 레시피 + 클럭)에서 "표는 갱신됐는데 전력 합계가 안 바뀜" 류 버그가 반드시 한 번은 난다. 규약(뷰당 단일 `render(state)`)으로 억제하지만 프레임워크처럼 **구조적으로 불가능하게 만들지는 못한다.**
3. **UI 생태계가 0이다.** 드래그앤드롭 편집, 자동 그래프 레이아웃, 가상 스크롤, 날짜 피커가 필요해지면 전부 자작이다. ③이 "보는 다이어그램"에서 "편집하는 다이어그램"으로 진화하는 순간 이 제안의 비용 곡선이 꺾인다. **그 시점에 재평가해야 한다.**
4. **타입 안전망이 약하다.** JSDoc + ts-check는 80% 커버지만 대규모 리팩터링에서 TS만큼 잡아주지 않는다. 레시피 데이터 스키마가 바뀌면 런타임에 터진다.
5. **HMR 없음.** F5로 충분하지만, 맵을 특정 줌/위치에 두고 CSS를 만지는 작업에서는 체감된다(URL 해시 복원으로 완화).
6. **i18n이 규율에만 의존한다.** 하드코딩 문자열을 잡아줄 추출 도구가 없어 영어 번역에 누락이 생긴다. 영어를 진지하게 할 거면 명확한 약점이다.
7. **성능은 자동으로 오지 않는다.** 무프레임워크라도 이벤트마다 DOM을 만지면 프레임워크보다 느려진다. rAF 코얼레싱·이벤트 위임·keyedList 규율이 지켜지는 동안만 빠르다.
8. **SW 갱신 최대 10분 지연** (GitHub Pages 커스텀 헤더 불가, 2장). Cloudflare를 앞에 두는 것 외에 되돌릴 방법이 없다.
9. **데이터 파이프라인에는 Node가 필요하다.** 의존성 0은 "npm 패키지 0"이지 "런타임 0"이 아니다.
10. **기여자 진입장벽이 역설적으로 높을 수 있다.** 남들은 React를 알지 내 바닐라 관례를 모른다. 지금은 1인이라 비용이 아니지만, 공개 저장소이므로 PR을 받고 싶어지면 얘기가 달라진다.

---

## 13. 착수 순서 (2주 스케치)

1. `index.html` 셸 + `router.js` + `store.js` + tokens/base CSS → **동작하는 껍데기 배포** (반나절)
2. ⑤ 용어집 (데이터가 이미 있다) → 렌더링 규약을 여기서 확립 (반나절)
3. `gen-data.mjs`로 recipes/items/milestones 생성 (1일)
4. ① 체크리스트 → 상태 영속화·마이그레이션·백업 UX 완성 (1일)
5. `fraction.js` + `solver.js` + 테스트 → ④ 계산기 (2~3일, 최대 난도)
6. `panzoom.js` → ② 맵 (1~2일)
7. ⑥ 레퍼런스 표 (반나절)
8. ③ 성장 단계도 (SVG 제작이 코딩보다 오래 걸린다)
9. `sw.js` + manifest → PWA (반나절)

**1번이 끝난 시점부터 URL이 살아 있고, 이후 매 커밋이 곧 배포다.**

---

## 14. 결론

이 앱은 데이터가 정적이고, 상호작용이 국소적이며, 사용자가 1명이고, 오프라인 즉시성이 최우선이고, 개발자가 혼자다. 다섯 조건이 전부 무빌드를 가리킨다.

난제로 지목된 셋 — 맵 줌/팬(140줄), 재귀 계산기(선형계 120줄 + 유리수 50줄), 상태 저장(90줄) — 은 **프레임워크가 풀어주는 문제가 아니라 어차피 내가 풀어야 하는 문제**다. 프레임워크를 얹으면 이 400줄은 그대로 남고 그 위에 툴체인 유지보수가 추가될 뿐이다.

정직하게 말하면 이 제안의 가장 큰 약점은 file:// 신화가 아니라 **12.2(상태-DOM 동기화가 사람의 규율에 의존)** 와 **12.3(③이 편집기로 진화하면 붕괴)** 이다. 그 둘이 현실이 되기 전까지, 이 구조는 이 프로젝트에서 가장 빠르고 가장 오래 사는 선택이다.
