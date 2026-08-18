# satisfactory-ops 아키텍처 제안 — 오프라인·설치형 우선 (PWA)

> 작성: 2026-08-19 · 관점: **오프라인/설치형 우선**
> 이 문서는 단일 관점을 최대한 밀어붙인 제안서다. 다른 관점과의 절충은 심사 단계에서 한다.
> 다만 tradeoffs 절은 방어하지 않는다 — 약점은 그대로 적었다.

---

## 0. 한 문장

**이 앱은 "웹사이트"가 아니라 게임 옆에 상주하는 도구다.** 따라서 첫 방문에서 전체 자산을
원자적으로 프리캐시하고, 그 이후로는 네트워크를 한 번도 쓰지 않는 설치형 앱으로 만든다.
프레임워크는 이 목표를 방해하지 않는 것 중 아무거나 고르면 된다.

---

## 1. 사용 맥락에서 역산한 설계 제약

사용자는 Satisfactory를 **풀스크린으로 실행 중**이다. 이 사실 하나가 모든 것을 결정한다.

| 관찰된 맥락 | 도출되는 하드 제약 |
|---|---|
| 알트탭으로 전환한다 | 전환 후 **화면이 이미 있어야** 한다. 스플래시·스켈레톤·스피너는 전부 실패다. |
| GPU를 게임이 다 쓰고 있다 | 앱의 렌더 비용이 게임 프레임을 갉아먹으면 안 된다. 유휴 시 CPU/GPU 0에 수렴해야 한다. |
| 알트탭은 짧다 (10~30초) | 한 번의 전환 안에서 답을 얻어야 한다. 3탭 이상 들어가는 정보는 실패다. |
| 두 번째 모니터에 띄워둔다 | 탭 하나가 아니라 **창 하나**여야 한다. 주소창·북마크바가 세로 공간을 먹으면 안 된다. |
| 태블릿/폰으로도 본다 | 터치 우선. 포인터 이벤트 통합. 44px 히트 타깃. |
| 오프라인일 수 있다 | 네트워크 실패가 **예외가 아니라 기본 경로**여야 한다. |
| 게임은 어둡다 | 다크 우선. 밝은 화면이 옆에 뜨면 눈이 아프다. |

여기서 나온 세 가지 원칙:

1. **네트워크는 선택 사항이다.** 온라인/오프라인 코드 경로를 나누지 않는다. 항상 오프라인 경로로
   동작하고, 네트워크는 오직 "업데이트 확인"에만 쓴다.
2. **부분 오프라인은 오프라인이 아니다.** "맵은 캐시됐는데 아이콘은 안 됐다"는 상태는
   버그 리포트를 유발하고, 1인 개발자에게는 재현 불가능한 지옥이다. → **전량 프리캐시, 원자적 설치.**
3. **자동 리로드 금지.** 플레이 중 화면이 혼자 새로고침되어 열어둔 계산 결과가 사라지는 것은
   구버전을 보는 것보다 나쁘다.

---

## 2. 조사한 사실 (추측 아님)

### 2.1 GitHub Pages 응답 헤더 — 실측

`curl -I https://pages.github.com/` (2026-08-18, 서울 엣지):

```
Cache-Control: max-age=600
ETag: "689c7eee-386e"
Last-Modified: Wed, 13 Aug 2025 12:02:54 GMT
Access-Control-Allow-Origin: *
Vary: Accept-Encoding
Age: 590
Via: 1.1 varnish
X-Cache: HIT
x-github-edge-region: koreacentral
```

읽어낼 것:

- **`Cache-Control: max-age=600`은 고정이고 변경 불가.** GitHub Pages에는 `.htaccess`도,
  `_headers`도, 커스텀 헤더 설정도 없다. 해시 없는 파일(`index.html`, `sw.js`)은 최대 10분 낡을 수 있다.
- **앞단이 Fastly다** (`Via: varnish`, `Age`, `X-Cache: HIT`). 즉 브라우저가 HTTP 캐시를 우회해도
  **엣지가 최대 600초 된 사본을 준다.** → **"즉시 배포 반영"은 이 플랫폼에서 물리적으로 불가능하다.**
  업데이트 UX는 이 10분을 전제로 설계해야 한다.
- `Vary: Accept-Encoding`이 있으므로 **gzip은 자동으로 걸린다.** JSON 데이터를 직접 압축할 필요 없다.
- `Access-Control-Allow-Origin: *` — 자산이 CORS 허용이라 서비스워커 프리캐시에서 opaque response
  문제가 없다. (동일 출처라 어차피 무관하지만, 확인됨.)

### 2.2 서비스워커 업데이트 사양

- 등록 옵션 `updateViaCache`의 기본값은 `'imports'` — **최상위 SW 스크립트는 HTTP 캐시를 우회**하고
  `importScripts()`만 캐시를 참조한다 (Chrome 68+에서 기본 동작으로 확정).
  → `sw.js`에 붙은 `max-age=600`은 **브라우저 캐시 차원에서는** 문제가 안 된다. 문제는 위의 Fastly 엣지다.
- SW 등록은 마지막 확인으로부터 **86400초가 지나면 자동으로 stale**로 간주되어 캐시를 무시하고 재확인한다.
  `max-age`가 86400보다 커도 86400으로 잘린다. → 최악의 경우에도 24시간 안에 갱신은 걸린다.
  하지만 **24시간을 기다릴 수는 없으므로 명시적 `registration.update()`가 필요하다.**
- Chrome 78+부터 최상위 SW 확인 시 **import된 스크립트의 바이트 변경도 함께 검사**하며,
  import만 바뀌어도 전체 업데이트 플로가 발동한다.

### 2.3 iOS / Safari 제약

- iOS 13.4부터 **script-writable storage(IndexedDB, LocalStorage, SW 등록, Cache API)에 7일 캡**이 있다.
- 단, WebKit 공식 문서: *"Web applications added to the home screen are not part of Safari and thus
  have their own counter of days of use."* → **홈 화면에 설치한 PWA는 자체 사용 카운터를 가지므로
  실사용이 있는 한 삭제되지 않는다.** 이것이 "설치를 적극 유도해야 하는" 기술적 근거다.
- Safari 17+에 Persistent Storage API가 있으나 알림 권한과 결합되어 있어 실용성이 낮다. 실패를 전제해야 한다.
- iOS의 Cache API 쿼터는 파티션당 약 50MB로 알려져 있다. → **총 프리캐시 예산은 5MB 이내로 잡는다.**
  현재 자산 총합 648KB이므로 여유는 충분하다.
- iOS에는 `beforeinstallprompt`가 없다. 설치는 "공유 → 홈 화면에 추가"를 **직접 안내**해야 한다.

### 2.4 GitHub Pages 운영 한도

권장 사이트 크기 1GB, 대역폭 소프트 한도 월 100GB, 빌드 소프트 한도 시간당 10회.
이 앱의 규모(<2MB)에서는 전부 무관하다. 다만 **시간당 10빌드**는 하루에 커밋을 여러 번 밀어넣는
개발 리듬에서는 실제로 닿을 수 있다.

### 2.5 게임 데이터 원본

- `Docs.json`은 게임 설치 경로 `CommunityResources/Docs/`에 있고, **UTF-16 인코딩**이다.
  (`utf8`로 읽으면 깨진다 — 실제로 가장 흔한 함정이다.)
- 커뮤니티 파서가 존재한다: `satisfactory-docs-parser` (npm), `satisfactory-recipe-parser`,
  `satisfactory-docs-exporter`. 직접 파싱하지 말고 **빌드타임 devDependency로** 쓴다.

### 2.6 프레임워크 현황 (2026-08 기준)

Svelte 5.55.10 (2026-05), React 19.2.6 (2026-05), Preact 10.27.2 (2025-09).
런타임 크기: Svelte 2~5KB / Preact ~3KB / React+ReactDOM ~42KB (gzip).
`vite-plugin-pwa`는 0.16.0부터 Workbox 7 사용, 저장소는 2026-05까지 활발히 유지보수 중.

---

## 3. 아키텍처 개요

```
┌─ 빌드타임 (내 PC) ───────────────────────────────────────────┐
│  Docs.json (UTF-16, 저장소에 커밋 안 함)                      │
│    └→ scripts/build-data.mjs                                 │
│         + i18n/ko.json (수기 번역 오버레이, 클래스명 키)       │
│         + src/data/curated/*.json (마일스톤 순서, 핀, 조언)   │
│       ↓                                                      │
│  src/data/generated/*.json  ← 커밋됨, 손으로 고치지 않음      │
└──────────────────────────────────────────────────────────────┘
                    ↓  vite build (base=/satisfactory-ops/)
┌─ 산출물 (dist/) ─────────────────────────────────────────────┐
│  index.html                 (해시 없음, max-age=600)          │
│  sw.js                      (해시 없음, max-age=600)          │
│  manifest.webmanifest                                        │
│  assets/*.[hash].js|css|json|webp   (해시됨, 불변)            │
└──────────────────────────────────────────────────────────────┘
                    ↓  GitHub Actions → gh-pages
┌─ 런타임 (브라우저) ──────────────────────────────────────────┐
│  Service Worker (Workbox 7, injectManifest)                  │
│    ├ precache: 앱 셸 + 전체 데이터 + 전체 이미지 (~1MB)       │
│    ├ NavigationRoute → precached index.html                  │
│    └ runtime cache: 없음 (의도적)                             │
│  IndexedDB (idb-keyval)                                      │
│    └ 사용자 상태: 마일스톤 진척 / 맵 핀 / 저장된 생산 계획     │
└──────────────────────────────────────────────────────────────┘
```

**백엔드는 없다. 필요하지도 않다.** 이 앱의 데이터는 (a) 게임 패치 때만 바뀌는 정적 데이터와
(b) 한 사람의 로컬 진척뿐이다. 둘 다 서버가 관여할 이유가 없다.
다기기 동기화 요구는 **JSON 내보내기/가져오기**로 해결한다 (§11-2에 정직한 한계를 적었다).

### 3.1 프레임워크 (부차적 — 짧게)

**Svelte 5 + Vite + TypeScript.**

고른 이유는 딱 두 가지뿐이다.
1. 런타임 2~5KB. 앱 셸 예산(§8)을 프레임워크가 절반 먹으면 안 된다.
2. 맵 팬/줌에서 **VDOM diff가 프레임 예산에 끼어들지 않는다.** (다만 실제로는 §7-②처럼
   프레임워크 밖에서 rAF로 직접 transform을 쓰므로, 이 이점은 보험에 가깝다.)

Preact 10 + signals도 사실상 동등하며, React 경험이 있다면 그쪽이 안전하다.
**이 선택은 이 제안의 어느 부분도 바꾸지 않는다.** 오프라인 설계는 프레임워크 독립적이다.
React 19(42KB)만 예산상 부적합하다.

라우팅은 **해시 라우터 자작(~40줄)**. 이유는 §5.4에 — 성능이 아니라 오프라인 정합성 때문이다.
상태 관리 라이브러리 없음. 스토어 3개(진척/핀/계획)면 충분하다.

---

## 4. 오프라인 정합성 설계 (이 제안의 핵심)

### 4.1 자산을 4계층으로 분류한다

| 계층 | 내용 | 크기 | 캐시 전략 | 무효화 |
|---|---|---|---|---|
| **A. 앱 셸** | JS, CSS, index.html, manifest, 앱 아이콘 | ~80KB | 프리캐시 | 파일명 해시 |
| **B. 게임 데이터** | recipes/buildings/milestones/glossary/pins JSON | ~150KB | 프리캐시 | 파일명 해시 + `dataVersion` |
| **C. 미디어** | 맵 webp 2장(420KB), 건물 아이콘 27개(228KB), 단계도 SVG | ~700KB | 프리캐시 | 파일명 해시 |
| **D. 사용자 상태** | 진척, 핀, 저장 계획 | ~10KB | IndexedDB | 스키마 마이그레이션 |

**A/B/C는 전부 프리캐시한다.** 런타임 캐싱(StaleWhileRevalidate 등)은 **하나도 쓰지 않는다.**

이건 게으름이 아니라 의도적 선택이다:

- 런타임 캐싱은 "언제 캐시됐는지"가 사용자 행동에 의존한다 → **재현 불가능한 상태 공간**이 생긴다.
  1인 개발자가 감당할 수 없는 디버깅 비용이다.
- 전량 프리캐시는 상태가 **둘뿐**이다: 설치됨 / 설치 안 됨. 이건 테스트할 수 있다.
- 총 1MB 미만이라 전량 프리캐시가 애초에 가능하다. **이 앱이 작다는 것이 이 전략을 허락한다.**
  (맵을 4K로 올리면 이 전제가 깨진다 — §7-②의 "고해상도 팩" 참고.)

### 4.2 서비스워커 — `injectManifest`, `generateSW` 아님

`vite-plugin-pwa`의 `strategies: 'injectManifest'`를 쓴다. 자동 생성(`generateSW`)을 안 쓰는 이유는
업데이트 프롬프트, 버전 메시지 채널, 진단용 우회 스위치를 직접 소유해야 하기 때문이다.

```ts
// vite.config.ts (요지)
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'prompt',              // autoUpdate 아님 — 5.2 참고
  injectRegister: null,                // 등록은 직접 (5.3)
  scope: '/satisfactory-ops/',
  base:  '/satisfactory-ops/',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,webmanifest,json,webp,svg}'],
    maximumFileSizeToCacheInBytes: 3000000,
  },
  manifest: { /* 5.5 */ },
})
```

```ts
// src/sw.ts (요지)
/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// 해시 라우팅이라 네비게이션은 항상 index.html 하나 — 오프라인에서 100% 결정적
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (e.data?.type === 'GET_VERSION') e.ports[0]?.postMessage(__BUILD_ID__)
})
// clients.claim() 은 호출하지 않는다 — 아래 참고
```

**`clients.claim()`을 쓰지 않는 이유:** 새 SW가 즉시 기존 탭을 장악하면, 이미 로드된 구버전 JS가
신버전 캐시에서 자산을 받게 되어 버전이 섞인다. 두 번째 모니터에 며칠씩 열려 있는 이 앱에서는
현실적인 사고다. 새 SW는 **명시적 사용자 동의 후 `skipWaiting` → 리로드**로만 활성화한다.

### 4.3 원자적 설치 — 실패는 곧 롤백

Workbox 프리캐시는 install 이벤트에서 매니페스트 전체를 받는다. **한 파일이라도 실패하면 install이
실패하고, 새 SW는 활성화되지 않으며, 기존 SW가 계속 서비스한다.**

이건 GitHub Pages에서 특히 중요하다. 배포는 CDN 전체에 원자적으로 반영되지 않으므로,
클라이언트가 **새 `index.html` + 옛 청크**를 받는 창(최대 10분)이 존재한다.
런타임 캐싱 기반 앱은 이 창에서 반쯤 깨진 상태로 캐시된다. 전량 프리캐시는 **install 실패 →
아무 일도 안 일어남 → 다음 방문에 재시도**로 끝난다.

즉 이 앱에서 **부분 실패라는 상태는 존재하지 않는다.** 이게 이 아키텍처의 가장 큰 값이다.

주의: Workbox 프리캐시는 URL별 revision 해시를 쓰므로, 변경되지 않은 파일은 **네트워크가 아니라
이전 캐시에서 복사**된다. 데이터 JSON 하나만 바뀐 배포에서는 delta만 내려온다.

### 4.4 데이터 버전 계약

생성되는 모든 데이터 JSON은 헤더를 갖는다:

```json
{
  "meta": {
    "dataVersion": 7,
    "gameVersion": "1.1.0.4",
    "generatedAt": "2026-08-19T00:00:00Z",
    "source": "Docs.json"
  },
  "recipes": []
}
```

- `dataVersion`은 **스키마** 버전, `gameVersion`은 **내용**의 출처 버전이다. 둘을 섞지 않는다.
- 앱은 부팅 시 `dataVersion`이 자기가 아는 값보다 크면 **경고 배너**를 띄우고 진행한다 (차단하지 않는다).
- 사용자 상태가 참조하는 recipe id / milestone id는 **로드 시 참조 무결성 검사**를 돌린다.
  깨진 참조가 있으면 크래시 대신 수리 배너: "게임 업데이트로 사라진 레시피 3개가 계획에 있습니다 → [확인]".
  게임이 패치되면 반드시 일어나는 일이므로 예외가 아니라 정상 경로로 취급한다.
- 설정 화면 하단에 `gameVersion` / 빌드 ID를 항상 노출한다. 버그 리포트를 받으려면 이게 필요하다.

### 4.5 사용자 상태 — IndexedDB, localStorage 아님

`idb-keyval`(~600B) 단일 스토어. 문서 단위 키.

localStorage를 쓰지 않는 이유:
1. **동기 API다.** 맵에서 핀을 드래그하는 중 매 프레임 write가 메인 스레드를 블로킹한다.
   60fps 팬을 지키려면 안 된다.
2. 5~10MB 제한이 있고 문자열만 저장한다.
3. iOS에서 어차피 IndexedDB와 같은 eviction 정책을 받는다 → 안전성 이점이 없다.

모든 저장 문서는 스키마 필드를 갖는다:

```ts
type StoredDoc<T> = { schema: number; updatedAt: number; data: T }

const migrations: Record<number, (d: any) => any> = {
  1: (d) => ({ ...d, pins: d.pins.map((p) => ({ ...p, u: p.x / 1600, v: p.y / 1600 })) }),
  2: (d) => ({ ...d, plans: d.plans ?? [] }),
}
// 읽을 때 schema < CURRENT 이면 사다리를 순서대로 적용하고 즉시 다시 쓴다
```

**스키마 필드 없이 쓰는 문서는 금지.** 1인 개발에서 6개월 뒤의 나를 구하는 유일한 장치다.

- 쓰기는 300ms 디바운스 + `visibilitychange`(hidden)에 즉시 플러시. 알트탭으로 나가는 순간이
  가장 흔한 이탈 시점이므로 여기서 반드시 저장한다.
- 첫 의미 있는 쓰기(마일스톤 첫 체크) 직후 `navigator.storage.persist()`를 시도한다.
  거부되어도 조용히 넘어간다. 성공 여부는 설정 화면에 표시한다.

---

## 5. 업데이트 전략

### 5.1 전제: 즉시 반영은 불가능하다

§2.1에서 실측했듯 GitHub Pages는 Fastly 뒤에 `max-age=600`으로 있다.
**푸시 후 최대 ~10분간 일부 사용자는 구버전 `index.html`/`sw.js`를 받는다.**
이걸 없애려 애쓰지 않는다. 대신 UX가 이 지연을 견디게 만든다.

### 5.2 `prompt` 방식 (`autoUpdate` 아님)

```
새 SW 발견
  → 프리캐시 install (백그라운드, 사용자 무관)
  → install 성공 시 waiting 상태로 대기
  → 화면 하단에 비침습적 토스트: "새 버전이 준비됐습니다 · [지금 적용]"
  → 사용자가 누르면 postMessage(SKIP_WAITING) → controllerchange 이벤트 → location.reload()
  → 안 누르면? 그냥 계속 구버전을 쓴다. 다음 방문에 다시 물어본다.
```

`autoUpdate`(silent reload)를 거부하는 이유는 명확하다. 사용자는 생산 계산기에 20개 항목을 입력해 둔
상태로 게임에 돌아가 있다. 돌아왔을 때 화면이 초기화되어 있으면 **그 앱은 다시 안 쓴다.**
구버전 레시피를 며칠 더 보는 손해보다 훨씬 크다.

예외: `dataVersion`이 **메이저로** 올라가는 배포(레시피가 실제로 틀리게 되는 경우)에는
토스트를 좀 더 강한 배너로 승격시킨다. 그래도 강제 리로드는 하지 않는다.

### 5.3 업데이트 확인 타이밍

```ts
const reg = await navigator.serviceWorker.register(
  `${import.meta.env.BASE_URL}sw.js`,
  { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }
)

let lastCheck = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (!navigator.onLine) return                     // 오프라인이면 아예 시도 안 함
  if (Date.now() - lastCheck < 30 * 60000) return   // 30분 쓰로틀
  lastCheck = Date.now()
  reg.update()
})
```

- **`visibilitychange`가 트리거인 이유:** 이 앱의 생명주기는 알트탭이다. 탭 포커스가 곧 세션 시작이다.
- **30분 쓰로틀:** 엣지 TTL이 600초이므로 그보다 잦은 확인은 낭비다. 30분이면 하루 사용에서
  충분히 여러 번 걸린다.
- **`updateViaCache: 'none'`**을 명시한다. 기본값 `'imports'`로도 최상위 스크립트는 우회하지만,
  Workbox가 import를 인라인하지 않는 빌드 설정으로 바뀌었을 때를 대비한 방어다. 비용 0.
- **`navigator.onLine === false`면 업데이트 UI를 절대 띄우지 않는다.** 오프라인에서 실패한 확인을
  사용자에게 노출하는 것은 순수한 소음이다.
- 사양상 24시간 자동 stale 확인이 별도로 존재하므로, 위 로직이 전부 실패해도 최종 안전망은 있다.

### 5.4 해시 라우팅 — 성능이 아니라 오프라인 정합성 문제

`/#/map`, `/#/calc` 형태를 쓴다. URL이 못생긴 건 안다. 그럼에도 쓰는 이유:

1. GitHub Pages에는 rewrite가 없다. History 라우팅은 `404.html` 리다이렉트 해킹이 필요하고,
   그 해킹은 **SW가 없는 첫 방문**과 **SW가 있는 오프라인 방문**에서 서로 다르게 동작한다.
   → 온라인/오프라인 코드 경로가 갈린다. §1 원칙 1 위반.
2. 해시 라우팅에서는 **모든 네비게이션의 문서 URL이 `index.html` 하나**다.
   `NavigationRoute → createHandlerBoundToURL('index.html')`이 자명하게 항상 맞는다.
   오프라인에서 딥링크가 깨지는 경우가 **구조적으로 존재하지 않는다.**
3. 설치된 PWA에서는 주소창이 안 보인다. 사용자가 URL을 볼 일 자체가 거의 없다.

비용은 정직하게 §11-1에 적었다 (SEO).

### 5.5 매니페스트 — 알트탭에 최적화

```json
{
  "id": "/satisfactory-ops/",
  "name": "Satisfactory 공장 설계 플레이북",
  "short_name": "SF Ops",
  "start_url": "/satisfactory-ops/#/milestones",
  "scope": "/satisfactory-ops/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "launch_handler": { "client_mode": "focus-existing" },
  "background_color": "#0d1117",
  "theme_color": "#0d1117",
  "orientation": "any",
  "lang": "ko",
  "icons": [
    { "src": "icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "생산 계산기", "url": "/satisfactory-ops/#/calc" },
    { "name": "맵",         "url": "/satisfactory-ops/#/map" }
  ]
}
```

핵심 세 가지:

- **`id`를 명시적으로 고정한다.** 없으면 `start_url`이 브라우저의 앱 식별자가 되고,
  나중에 `start_url`을 바꾸면 **기존 설치와 별개인 앱이 하나 더 생긴다** (진척 데이터는 남지만
  사용자는 아이콘 두 개를 보게 된다). `id`를 박아두면 이 사고가 원천 차단된다.
- **`launch_handler: focus-existing`.** 이 앱의 사용 패턴은 "게임 → 앱 → 게임 → 앱"이다.
  매번 새 창이 뜨면 최악이다. 이미 열린 창으로 포커스를 보낸다. **이 한 줄이 이 앱 UX의 절반이다.**
- `shortcuts`로 작업표시줄 우클릭에서 계산기/맵 직행. 알트탭 시간 절약에 직결된다.

### 5.6 킬 스위치와 롤백

- **롤백:** `git revert` + 재배포. 새로 배포된 `sw.js`가 현재 설치된 것과 바이트가 다르면 업데이트가
  발동한다. (비교 대상은 "현재 설치된 SW"이지 "역사상 어떤 SW"가 아니므로, 옛 버전으로 되돌려도
  정상 발동한다.) 반영은 §5.1대로 최대 10분.
- **킬 스위치:** 치명적 버그 배포 시, `sw.ts`를 전부 지우고 `self.registration.unregister()` +
  모든 캐시 삭제 + `clients.claim()`만 하는 SW를 배포한다. 다음 확인에서 모든 클라이언트가
  캐시 없는 상태로 복귀한다. **이 파일을 미리 `docs/killswitch-sw.ts`로 만들어 둔다.**
  사고가 난 뒤에 쓰기 시작하면 늦다.
- **개발자 우회:** `?nosw=1` 쿼리가 있으면 등록을 건너뛰고 기존 등록을 해제한다.
  설정 화면에 "캐시 초기화 후 재시작" 버튼도 둔다. **SW 디버깅은 1인 개발자에게 실제로 위험하다.**
  탈출구를 코드에 박아두는 것이 유일한 방어다.

---

## 6. GitHub Pages + 서비스워커 — 실제 함정 목록

배포 위치는 프로젝트 사이트 `https://<user>.github.io/satisfactory-ops/`를 가정한다.

| # | 함정 | 왜 생기나 | 대응 |
|---|---|---|---|
| 1 | **SW 스코프** | SW의 기본 스코프는 SW 파일이 놓인 **디렉터리**다. `/satisfactory-ops/sw.js`는 `/satisfactory-ops/` 하위만 제어한다. | 그게 정확히 맞다. `sw.js`를 반드시 사이트 루트(=`dist/` 최상단)에 둔다. `assets/` 안으로 들어가면 앱을 제어하지 못한다. |
| 2 | **스코프 확대 불가** | 스코프를 파일 위치보다 넓히려면 `Service-Worker-Allowed` 응답 헤더가 필요한데 **GitHub Pages는 커스텀 헤더를 못 준다.** | 스코프 확대를 시도하지 않는다. 앱 전체가 `/satisfactory-ops/` 안에 있으므로 필요 없다. |
| 3 | **`base` 3중 일치** | Vite `base`, manifest의 `scope`/`start_url`, `register()`의 `scope`가 하나라도 어긋나면 **오프라인에서만** 깨진다 (온라인에선 네트워크가 덮어줘서 안 보인다). | 세 곳 모두 `import.meta.env.BASE_URL`에서 파생시킨다. 하드코딩 금지. 커스텀 도메인으로 옮기면 `base`를 `/`로 바꿔야 함을 README에 명시. |
| 4 | **10분 전파 지연** | Fastly 엣지 `max-age=600` (실측). | 제거 불가. §5.1~5.2로 UX 흡수. "즉시 반영"을 약속하는 문구를 UI에 쓰지 않는다. |
| 5 | **`index.html`/`sw.js`가 해시 없음** | 이 둘만 `max-age=600`의 직접 영향을 받는다. | `index.html`은 첫 설치 후 SW가 프리캐시본을 준다. `sw.js`는 `updateViaCache:'none'`으로 브라우저 캐시 우회. 남는 건 엣지 지연뿐. |
| 6 | **쿼리스트링 버전닝의 유혹** | `data.json?v=3`으로 캐시를 깨려는 시도. | 하지 않는다. Vite 자산 파이프라인으로 **파일명에 해시**를 넣는다. 데이터 JSON도 `import`로 번들 파이프라인에 태워 해시를 받게 한다. |
| 7 | **`.nojekyll`** | 없으면 `_`로 시작하는 파일/디렉터리가 배포에서 사라진다. | 저장소에 **이미 있다** (확인함). 지우지 않는다. Actions 배포로 바꿔도 유지. |
| 8 | **HTTPS** | SW는 보안 컨텍스트 전용. `*.github.io`는 기본 HTTPS라 안전. | 나중에 커스텀 도메인을 붙이면 **"Enforce HTTPS"를 반드시 체크**한다. 안 하면 SW 등록이 조용히 실패한다. |
| 9 | **배포 비원자성** | CDN 전파 중 신 HTML + 구 청크 조합이 나올 수 있다. | 전량 프리캐시의 원자적 install이 이 문제를 흡수한다 (§4.3). |
| 10 | **공개 저장소** | 게임 자산(맵·아이콘)이 public repo에 올라간다. | `Docs.json` 원본은 **커밋하지 않는다**(파생 데이터만). Coffee Stain 저작권 고지와 비상업 명시를 README/앱 하단에. 삭제 요청 시 대응 가능하도록 자산을 한 디렉터리에 격리. |
| 11 | **시간당 10빌드 소프트 한도** | 잦은 푸시. | 배포를 `main` 푸시마다가 아니라 **태그/수동 dispatch**로. 어차피 10분 지연이 있어 잦은 배포는 무의미하다. |
| 12 | **Actions 배포 시 dist 전체 교체** | 이전 빌드의 해시 자산이 사라져, 아직 업데이트 안 한 클라이언트가 청크 404를 만날 수 있다. | 해당 클라이언트는 이미 **전량 프리캐시 상태**라 네트워크를 안 쓴다. 그래서 안 터진다. 단, 코드 스플리팅으로 지연 로드 청크를 만들면 이 방어가 깨지므로 — **동적 import를 쓰지 않는다** (§8). |

---

## 7. viewPlan — 6개 화면

### 공통 셸

- 좁은 화면: 하단 탭바 6개 (`env(safe-area-inset-bottom)` 반영). 넓은 화면: 좌측 레일.
- 키보드: `1`~`6` 탭 전환, `/` 검색 포커스, `Esc` 시트 닫기. 알트탭 사용자는 키보드 사용자다.
- **웹폰트 0개.** `system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif`.
  FOIT/FOUT이 구조적으로 없고, 프리캐시 예산도 아낀다. 한글 웹폰트는 서브셋해도 200KB+다 — 안 쓴다.
- 다크 기본. `prefers-color-scheme: light`면 라이트로 전환하되 **기본은 다크**다 (게임이 어둡다).
- 모든 화면이 **첫 페인트에 데이터를 가지고 있다.** 프리캐시된 JSON을 동기적으로 읽으므로
  로딩 스켈레톤이 존재하지 않는다.

### ① 마일스톤 진행 체크리스트

- 데이터: `milestones.json` = `Tier → Milestone → { item, qty }[] + unlocks[]`. Docs.json의 스키매틱에서 생성.
- 상태: `Set<milestoneId>` + 부분 진척 `Record<itemId, number>`를 IDB에.
- **핵심 화면은 목록이 아니라 "다음에 할 일" 카드 하나다.**
  현재 티어 → 다음 미완 마일스톤 → 아직 부족한 품목과 수량 → 이걸 열면 뭐가 풀리는지 →
  "이 품목을 만들려면" 버튼(→ ④ 계산기로 목표 자동 주입).
  알트탭 10초 안에 답이 나와야 한다는 §1 제약의 직접적 결과다. 전체 목록은 그 아래에 접어둔다.
- 체크는 낙관적 UI + 300ms 디바운스 쓰기. 스피너 없음. 실패할 수 있는 네트워크가 없으므로
  롤백 로직도 필요 없다. **오프라인 우선이 코드를 줄이는 사례다.**
- 진척 링(원형 게이지)은 CSS `conic-gradient` 하나. 차트 라이브러리 없음.

### ② 입지 선정 — 맵 줌/팬 오버레이 (상세)

**자산:** `ingame-map.webp` / `biome-map.webp`, 각 **1600×1600 (파일 헤더로 실측)**, 합계 420KB.
둘 다 프리캐시. 타일링 안 함 — 이 크기에서 타일 서버/타일 로직은 순수한 부채다.

**DOM 구조 (레이어 하나만 움직인다):**

```html
<div class="viewport">              <!-- overflow:hidden; touch-action:none -->
  <div class="world">               <!-- transform: translate3d(x,y,0) scale(k) -->
    <img class="layer" src="ingame-map.webp">    <!-- 1600x1600, 고정 -->
    <div class="grid"></div>                      <!-- CSS repeating-linear-gradient -->
    <svg class="pins">...</svg>                   <!-- 핀 -->
  </div>
  <div class="hud">...</div>        <!-- 좌표 표시, 레이어 토글, 줌 버튼 -->
</div>
```

`.world` 하나에만 transform을 건다. 팬 중에는 **DOM 노드가 단 하나도 재생성되지 않고,
스타일 쓰기도 딱 한 번**이다. 합성 레이어 하나의 이동이므로 게임과 GPU를 다투지 않는다.

**입력 — Pointer Events 통합 (마우스/터치/펜 단일 코드):**

```js
// touch-action:none 으로 브라우저 기본 제스처 차단
onPointerDown  → setPointerCapture, pointers.set(id, pt)
onPointerMove  → pointers.set(id, pt); pending = true      // 상태 갱신 없음, 변수만 씀
onPointerUp    → pointers.delete(id)

// 단일 rAF 루프가 실제 적용 (포인터가 눌렸을 때만 돈다)
function frame() {
  if (pending) {
    world.style.transform = `translate3d(${px}px,${py}px,0) scale(${k})`
    pending = false
  }
  if (pointers.size) requestAnimationFrame(frame)
}
```

**팬 중에 프레임워크 상태를 절대 건드리지 않는다.** 이게 60fps의 유일한 보장이다.
(Svelte든 Preact든 React든 무관해지는 지점이다 — §3.1에서 프레임워크가 부차적이라고 한 이유가 이것이다.)

**커서 고정 줌 — 휠과 핀치가 같은 수식을 쓴다:**

```
k'   = clamp(k * factor, kFit, kMax)
pan' = c - (c - pan) * (k' / k)      // c = 뷰포트 기준 커서(또는 두 손가락 중점) 좌표
```

- 휠: `factor = Math.exp(-deltaY * 0.0015)` — 연속적이고 `deltaMode` 차이를 흡수한다.
- 핀치: `factor = dist' / dist`, `c` = 두 포인터 중점.
- **같은 함수를 호출한다.** 코드 경로가 하나뿐이라 태블릿과 데스크톱이 동시에 맞는다.

**팬 클램프:** 이미지가 뷰포트 밖으로 완전히 나가지 못하게 축별로 clamp.
`kFit`(이미지가 뷰포트에 꽉 차는 배율) 미만으로는 축소 불가. 러버밴딩은 v1에서 생략.

**핀 좌표계 — 정규화 [0,1]:**
핀은 픽셀이 아니라 `{u, v} ∈ [0,1]`로 저장한다. 나중에 4K 맵으로 교체해도 **저장된 핀이 그대로 맞는다.**
(§4.5의 마이그레이션 예시가 정확히 이 전환이다.)

```
화면 → 이미지:  u = (sx - panX) / (k * W)
이미지 → 화면:  sx = u * k * W + panX
```

**핀 크기 유지 (역스케일):**
`.world`가 `scale(k)`되므로 핀도 같이 커진다. `.world`에 CSS 변수 `--inv-k: calc(1 / k)`를 쓰고
핀 내부 요소가 `transform: scale(var(--inv-k))`로 읽게 한다.
**이 변수는 `k`가 바뀔 때만 갱신하면 되고 팬 중에는 건드리지 않는다** — 그래서 팬은 여전히
스타일 쓰기 1회다.

**그리드 오버레이 — JS 0줄:**

```css
.grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    repeating-linear-gradient(to right,  var(--line) 0 1px, transparent 1px 100px),
    repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 100px);
}
```
`.world` 안에 있으므로 맵과 함께 확대/이동한다. 선 굵기만 `--inv-k`로 보정.

**게임 좌표 매핑:** `map-calibration.json`에 아핀 변환 계수를 **코드가 아니라 데이터로** 둔다.

```json
{ "gameX": { "a": 750000, "b": -324700 }, "gameY": { "a": 750000, "b": -375000 } }
```
`gameX = a*u + b`. HUD에 실시간 좌표를 표시해 위키/다른 도구와 대조 가능하게 한다.
**이 계수는 반드시 인게임에서 두 랜드마크로 검증해야 한다** (위 값은 자리표시자다).
데이터로 둔 이유가 그것이다 — 재빌드 없이 고칠 수 있어야 한다.

**핀 데이터:** 큐레이팅된 `map-pins.json` (스타터 4곳, 순수/보통 노드, 수원, 석유, 지열) +
사용자 핀(IDB). `<use href="#icon-node">`로 SVG 심볼 재사용.
**~200개까지는 DOM으로 충분**하다. 1000개를 넘기면 `<canvas>` 오버레이로 같은 rAF에서 그리도록
교체한다 — **이 임계점을 코드 주석에 명시해둔다** (미래의 내가 재측정하지 않도록).

**"입지 선정"을 플레이북답게 만드는 기능:** 후보지 2~3곳을 핀으로 찍으면 각 후보 반경 N 안의
노드 종류/순도/수원 유무를 `map-pins.json`에서 집계해 **비교 표**를 낸다.
"계산기가 아니라 지금 뭘 해야 하는지"라는 프로젝트 정체성이 이 화면에서 구현되는 지점이다.

**오프라인:** 위 전부가 정적 자산 + IDB. 타일 서버 없음, 지도 API 없음, 네트워크 호출 0.
**이 화면이 이 관점을 채택하는 가장 강한 근거다.** 일반적인 지도 라이브러리를 썼다면
"오프라인 타일 캐시"라는 완전히 다른 난이도의 문제를 떠안았을 것이다.

**해상도는 정직하게:** 1600px 원본을 8배 확대하면 12800px 상당 — **눈에 띄게 뭉갠다.**
v1은 `kMax`를 4~5로 제한해 이 한계 안에 머문다.
확장 경로(v2): 4096px 원본을 4분할한 WebP 4장(~1.5MB)을 **"고해상도 팩" 옵트인**으로 별도 캐시.
기본 설치를 가볍게 유지하면서 원하는 사람만 받는다. **이때가 런타임 캐싱을 도입하는 유일한 예외다.**

---
### ③ 공장 성장 단계도

**라이브 다이어그램 에디터를 만들지 않는다.** 1인 개발에서 노드 에디터는 프로젝트를 죽인다.

- 단계별(5~8개) **손으로 저작한 SVG**. Excalidraw/Figma에서 그려 SVG로 내보내고 인라인.
- 각 영역에 `<g id="zone-smelting">` 같은 id를 부여. 클릭은 `[id^="zone-"]`에 **이벤트 위임 하나**.
  탭하면 우측(넓은 화면) 또는 바텀시트(좁은 화면)에 해당 구역의 설명 + 체크리스트 + 용어 칩(⑤ 연동).
- 단계 스테퍼로 앞뒤 이동. 단계 간 전환은 CSS opacity 크로스페이드.
- SVG는 텍스트라 gzip이 잘 먹고(각 10~20KB), 무한 확대되며, `currentColor`로 다크모드가 공짜다.
- 벨트/파이프/전선을 색으로 구분하고 범례를 고정 배치.

정직한 비용: **단계도 하나당 1~2시간의 수작업 저작.** 자동 생성되지 않는다.
그 대신 런타임 의존성 0, 오프라인 100%, 유지보수 거의 0이다. 이 교환은 의도적이다.

### ④ 생산 라인 계산기 — 재귀 해결 (상세)

**모델**

```ts
type Recipe = {
  id: string; machine: string; timeSec: number
  inputs:  { item: string; qty: number }[]
  outputs: { item: string; qty: number }[]
  isAlternate: boolean
}
// 기계 1대의 분당 산출: qty * 60 / timeSec
```

**입력:** 목표 = `{ item, ratePerMin }[]`. 품목별로 어떤 레시피를 쓸지 선택(기본=표준, 사용자가 대체 레시피로 교체).
"외부 공급"으로 표시한 품목과 원광/물/원유는 **경계(leaf)** 로 취급해 더 파고들지 않는다.

**여기서 순진한 재귀는 반드시 터진다.** Satisfactory에는 **순환 레시피가 실재한다** —
Recycled Plastic(고무+연료→플라스틱)과 Recycled Rubber(플라스틱+연료→고무)를 함께 켜면
플라스틱↔고무 사이클이 생기고, 희석 연료/포장 계열에도 유사한 루프가 있다.
DFS 메모이제이션은 여기서 스택 오버플로 또는 **조용한 오답**을 낸다.
**"재귀 계산기"를 표방하면서 이걸 처리 못 하면 그건 틀린 계산기다.**

**해법 — 3단 파이프라인**

**1단계: 그래프 구성 + SCC 분해**
선택된 레시피 집합으로 `item → recipe → item` 유향 그래프를 만들고, 경계 품목에서 자른다.
**Tarjan 알고리즘**으로 강결합요소(SCC)를 구한다. O(V+E), 약 60줄.

**2단계: 비순환 부분 — 위상 정렬 + 누적**
자기 루프 없는 크기 1의 SCC들은 위상 순서로 한 번에 누적한다.
정확하고 빠르며 부동소수 누적 오차도 최소다. **실제 레시피의 90% 이상이 여기서 끝난다.**

**3단계: 순환 부분 — 선형 시스템 직접 해결**
비자명 SCC마다 그 안에서만 연립방정식을 세운다.
미지수 `x_r` = 레시피 r의 가동률(= 기계 수). 성분 내 품목 i에 대해:

```
Σ_r  x_r * (out[r][i] - in[r][i])  =  d_i      (d_i = 성분 외부에서 요구되는 순수요)
```

**부분 피벗 가우스 소거**로 푼다. 이 SCC는 실제로 2~4개 레시피 규모이므로
**40줄짜리 조밀 행렬 solver로 충분하다.** LP 라이브러리도, simplex도, 외부 의존성도 필요 없다.
(전체를 하나의 LP로 푸는 것도 가능하지만, SCC로 잘라내면 대부분이 O(V+E)로 끝나고
비싼 부분만 작게 남는다 — 정확도와 성능을 동시에 얻는다.)

**실패를 숨기지 않는다 — 이게 설계의 절반이다:**

| 상황 | 수학적 정체 | 사용자에게 보여줄 것 |
|---|---|---|
| 랭크 부족 (레시피 > 품목) | 해가 무한히 많음 | "이 대체 레시피 조합은 해가 하나로 정해지지 않습니다. {A, B} 중 하나의 가동률을 고정하세요." + 슬라이더 제공 |
| 해에 음수 존재 | 레시피를 역방향으로 돌려야 함 | "{레시피}가 음수 가동률입니다 → 이 조합으로는 목표를 만들 수 없습니다." |
| 특이 행렬 | 루프가 자기충족적 | "이 루프는 외부 투입 없이 닫혀 있습니다. 경계 품목을 지정하세요." |

**틀린 숫자를 자신 있게 보여주는 것보다 정직한 실패가 낫다.**
이 앱은 "지금 뭘 해야 하는지" 알려주는 도구다. 신뢰를 잃으면 존재 이유가 없다.

**출력 — 계산기를 넘어 플레이북으로:**
- 기계 수: 소수 + 올림값, 올림했을 때의 **클럭 %** 동시 표시.
- 전력: 기계별 소비 합. 오버클럭 시 비선형 증가 —
  **지수는 반드시 `Docs.json`에서 뽑아 데이터로 둔다.** 기억에 의존해 상수를 박지 않는다.
  이 값은 패치로 바뀔 수 있고, 틀리면 발전소 설계 전체가 어긋난다.
- **간선별 처리량 검사:** 각 품목 흐름이 분당 X개일 때 어떤 벨트/파이프 등급이 필요한지 판정하고
  "이 구간은 Mk.2(120/분)로는 부족 → Mk.3 필요 또는 2줄 분리"를 경고로 띄운다.
  **이것이 계산기를 플레이북으로 바꾸는 기능이다.**
- 매니폴드 vs 로드 밸런서 조언을 용어집(⑤)과 연결해 인라인 칩으로.
- 결과를 트리 뷰 + 요약 표 두 가지로. 트리의 접힘 상태를 IDB에 기억한다 (알트탭 복귀 시 그대로).

**성능:** 노드 500개 이하, 순수 동기 JS, **5ms 미만.** Web Worker 불필요.
입력할 때마다 매 키스트로크 재계산해도 프레임을 못 넘긴다.

**테스트 가능성 — 1인 개발의 생명줄:** solver가 순수 함수(입력 JSON → 출력 JSON)이므로
Vitest 골든 테스트로 고정한다. 특히 **순환 케이스(Recycled Plastic/Rubber)를 반드시 케이스로 박는다.**
이게 없으면 6개월 뒤 리팩터링에서 조용히 깨진다.

### ⑤ 용어집 (학습 레이어)

이미 `src/data/glossary.json`이 `short / why / how / gotcha / see` 구조로 잘 잡혀 있다. 이 구조를 유지한다.

- 목록 + 상세. 라우트 `#/glossary/manifold` — 링크 공유 가능, 오프라인에서도 동일하게 동작.
- **인라인 용어 칩이 진짜 기능이다.** 다른 화면의 본문에서 `[[manifold]]` 마크업을 만나면
  탭 가능한 칩으로 렌더하고, 누르면 바텀시트로 `short` + `gotcha` + "자세히" 링크.
  **학습이 별도 탭이 아니라 맥락 안에서 일어난다.** 알트탭 예산상 탭 이동은 비싸다.
- 검색: 용어 100여 개 규모에서 `String.includes`면 1ms 미만이다. **Fuse.js도 lunr도 넣지 않는다.**
- **한국어 검색을 위해 초성 인덱스를 빌드타임에 생성한다.**
  `chosung` 필드를 만들어 "ㅁㄴㅍ" → "매니폴드"가 잡히게 한다. 유니코드 한글 음절 분해 ~30줄.
  영문 `en` 필드도 함께 인덱싱 (영어 위키를 보다 온 사용자를 위해).
- `tier` 필드로 "지금 내 티어에서 알아야 할 용어"만 필터 — ①과 연동.
- `see` 배열로 관련 용어 상호 링크.

### ⑥ 레퍼런스 표

- 300행 내외 → **가상 스크롤 라이브러리를 넣지 않는다.** 대신 행 그룹에
  `content-visibility: auto` + `contain-intrinsic-size`를 걸면 렌더 비용이 거의 사라진다. 의존성 0.
- `position: sticky` 헤더 + 좁은 화면에서 첫 열 sticky.
- 열 정렬(클릭), 즉시 필터 — **데이터가 이미 메모리에 있으므로 입력마다 동기 필터가 지연 없이 돈다.**
  네트워크 기반 앱이라면 디바운스와 로딩 상태가 필요했을 자리다.
- 탭: 레시피 / 건물·전력 / 물류(벨트·파이프·열차) / 노드 산출량.
- 단위 토글(개/분 ↔ 개/초), 순도 배율 토글, 오버클럭 슬라이더.
- **인쇄 스타일시트를 넣는다.** 두 번째 모니터가 없는 사람은 종이로 옆에 둔다.
  `@media print`로 탭바/네비 숨기고 흑백 최적화. 비용 20줄, 효용 큼.

---

## 8. 성능 예산 (측정 가능한 목표)

| 항목 | 예산 | 근거 |
|---|---|---|
| 앱 셸 JS+CSS (gzip) | **≤ 60KB** | Svelte 런타임 2~5KB + 앱 코드. 이 예산을 넘기면 라이브러리를 뺀다. |
| 데이터 JSON (gzip 후) | ≤ 40KB | GH Pages가 자동 gzip (`Vary: Accept-Encoding` 실측). 필요한 필드만 남기고 trim. |
| 이미지 총합 | 648KB | 이미 확정 (맵 420KB + 아이콘 228KB, 실측). |
| **총 프리캐시** | **≤ 1MB** | iOS Cache API 쿼터(~50MB) 대비 2%. 안전 마진 충분. |
| 첫 설치 (4G) | ≤ 3초 | 약 1MB / ~3Mbps. |
| **재방문 → 상호작용 가능** | **≤ 300ms** | 전량 Cache Storage 히트, 네트워크 0. **이 숫자가 이 프로젝트의 성패다.** |
| 맵 팬/줌 | 60fps 유지 | rAF 1회 스타일 쓰기, 합성 레이어 1개. |
| 계산기 재계산 | ≤ 5ms | 동기, 워커 없음. |
| 유휴 시 CPU | ~0% | 타이머·폴링·상시 애니메이션 루프 금지. rAF 루프는 포인터가 눌렸을 때만 돈다. |

**코드 스플리팅(동적 import)을 쓰지 않는다.** 앱 전체가 60KB인데 쪼갤 이유가 없고,
쪼개면 §6-12의 "지연 청크 404" 위험을 스스로 불러들인다. **단일 번들이 오프라인에 더 안전하다.**

---

## 9. 데이터 빌드 파이프라인

```
scripts/build-data.mjs
  ├ 입력: <게임경로>/CommunityResources/Docs/Docs.json   ← UTF-16! 디코딩 필수, 커밋 안 함
  ├ 파싱: satisfactory-docs-parser (devDependency)
  ├ 병합: src/data/i18n/ko.json        (클래스명 → 한국어명, 수기 유지)
  │       src/data/curated/*.json      (마일스톤 순서, 맵 핀, 플레이북 조언, 용어집)
  └ 출력: src/data/generated/*.json    (커밋됨, 손대지 않음)
```

원칙 세 가지:

1. **생성 파일을 손으로 고치지 않는다.** 다음 게임 패치에서 전부 날아간다.
2. **한국어 번역은 클래스명을 키로 하는 별도 오버레이**에 둔다. 재생성해도 번역이 살아남는다.
   (게임 자체 `en-US.json`을 함께 읽어 영문명을 채우고, 한국어는 오버레이로 얹는다.)
3. **`Docs.json`은 저장소에 넣지 않는다.** 게임 배포 파일이고, 공개 저장소이며,
   UTF-16 수 MB짜리 diff 노이즈다. `.gitignore`에 추가.

재생성은 게임 패치 때만(연 몇 회) 수동 실행. **CI에 넣지 않는다** — 게임 파일이 CI에 없다.
회귀 방지: 생성 후 `npm test`가 계산기 골든 테스트를 돌려 레시피 변경으로 깨진 곳을 잡는다.

---

## 10. 리스크와 완화

| 리스크 | 심각도 | 완화 |
|---|---|---|
| iOS 저장소 축출 (7일 캡) | 높음 | 홈 화면 설치 시 예외 적용(WebKit 공식 문서). → **설치 유도 온보딩을 진지하게 만든다.** + `storage.persist()` 시도 + **JSON 내보내기/가져오기가 최종 안전망.** |
| SW 디버깅 지옥 | 높음 | `?nosw=1` 우회, 설정 내 "캐시 초기화", 킬 스위치 SW 사전 작성(§5.6), `autoUpdate` 금지. |
| 게임 패치로 데이터 무효화 | 중간 | 재생성 파이프라인 + `gameVersion` 표시 + 참조 무결성 수리 배너(§4.4) + 골든 테스트. |
| 순환 레시피 solver 오류 | 중간 | Tarjan + 가우스 소거(§7-④) + 순환 케이스 골든 테스트 + **불확정 시 정직한 실패**. |
| 맵 해상도 한계 (1600px) | 중간 | v1 `kMax`를 4~5로 제한. v2 고해상도 팩 옵트인. |
| 게임 자산 저작권 (공개 저장소) | 중간 | 원본 `Docs.json` 미커밋, 저작권 고지, 비상업 명시, 자산 디렉터리 격리로 즉시 제거 가능. |
| GH Pages 10분 전파 | 낮음 | 제거 불가 — UX로 흡수(§5). "즉시 반영" 문구 금지. |
| 손 저작 단계도(③)의 저작 부담 | 낮음 | 단계 수를 5~8개로 제한. 완벽 대신 완성. 3개로 시작해 증분. |
| `base` 경로 불일치 | 낮음 | 3곳 모두 `BASE_URL` 파생. 커스텀 도메인 전환 절차를 README에. |
| 1인 개발자의 이탈/공백 | 실질적 | **모든 게임 지식을 JSON 데이터로 밀어낸다.** 코드에 하드코딩하지 않으면 6개월 뒤에도 데이터만 고쳐 되살릴 수 있다. |

---

## 11. Tradeoffs — 정직하게

이 관점을 채택하면 **실제로 잃는 것들**. 방어하지 않는다.

**1. SEO를 사실상 포기한다.**
해시 라우팅 + SPA + 프리렌더 없음 → 검색 유입이 거의 없다. "Satisfactory 매니폴드"로 검색해서
이 앱에 도달하는 경로는 없다. 발견은 Reddit/커뮤니티/GitHub 링크에만 의존한다.
**공개 플레이북에게 이건 진짜 손실이다.** SSG로 용어집만이라도 정적 HTML을 뽑는 절충이 가능하지만,
그 순간 오프라인 네비게이션 경로가 둘로 갈라진다 — 이 제안은 그 절충을 거부했다.

**2. 다기기 동기화가 없다.**
백엔드가 없으므로 PC의 진척이 태블릿에 자동으로 가지 않는다. 내보내기/가져오기 JSON이 전부다.
사용자가 두 기기를 오가며 쓰면 확실히 불편하다. **이 아키텍처의 정면 약점이다.**
(대안인 Gist/Drive 연동은 인증을 끌고 들어와 "백엔드 없음"의 전제를 깬다.)

**3. 텔레메트리가 0이다.**
어떤 화면을 쓰는지, 계산기가 어디서 실패하는지 **영원히 모른다.** 오프라인 우선의 대가다.
개선 방향이 순전히 직감과 소수 피드백에 의존하게 된다.

**4. 일부 사용자는 며칠간 구버전을 본다.**
`prompt` 업데이트 + 10분 엣지 지연 + "안 눌러도 그만" 정책의 합계.
레시피 오류를 고쳐도 즉시 전파되지 않는다. 잘못된 숫자를 보고 공장을 지은 사용자가 나올 수 있다.

**5. 원자적 install은 불안정 네트워크에서 업데이트 성공률을 낮춘다.**
파일 하나만 실패해도 전체 install이 실패한다. 지하철에서 여는 사용자는 계속 구버전에 머물 수 있다.
부분 캐싱이라면 조금씩이라도 진행됐을 것이다. **견고함과 업데이트 도달률을 맞바꿨다.**

**6. ③ 단계도는 사용자의 공장을 그려주지 않는다.**
손 저작 SVG는 "일반적인 성장 경로"만 보여준다. "내 공장을 그리고 싶다"는 요구에 답이 없다.
그 기능은 이 제안의 범위 밖이고, 1인 개발에서는 아마 영원히 밖이다.

**7. 한국어 1차 = 영어는 진짜 i18n이 아니다.**
`en` 필드를 얹는 오버레이 수준이다. UI 문자열 전체 번역, 복수형, 로케일 포맷은 없다.
영어권 사용자가 늘면 구조를 다시 짜야 한다.

**8. iOS 설치 마찰이 데이터 손실로 이어질 수 있다.**
`beforeinstallprompt`가 없어 "공유 → 홈 화면에 추가"를 그림으로 안내해야 한다.
많은 사용자가 안 한다 → 안 하면 7일 축출 대상이 된다 → **iOS에서 데이터를 잃는 사용자가 실제로 나온다.**
내보내기 안내가 유일한 방어이고, 완전하지 않다.

**9. `injectManifest` 커스텀 SW는 내가 소유하는 코드다.**
`generateSW`보다 유연하지만 Workbox 메이저 버전업 시 깨질 수 있는 코드가 40~60줄 늘어난다.
1인 개발의 유지보수 예산에서 무시할 수 없다.

**10. 프레임워크 선택(Svelte 5)의 생태계 리스크.**
React 대비 라이브러리·예제·학습 자료가 적다. 막혔을 때 검색으로 풀릴 확률이 낮다.
이 앱은 외부 라이브러리를 거의 안 쓰므로 노출은 작지만 0은 아니다.

**11. 이 설계는 "데이터가 작다"는 전제 위에 서 있다.**
전량 프리캐시·전체 메모리 로드·동기 필터는 전부 1MB 가정에서만 성립한다.
사용자 공장 저장 파일 파싱이나 대규모 커뮤니티 청사진 같은 기능이 들어오면
**아키텍처를 다시 그려야 한다.** 확장 경로가 아니라 재설계다.

---

## 12. 실행 순서 (1인 개발 현실 기준)

1. **주 1:** Vite + Svelte + `base` 3중 일치 + 매니페스트 + `injectManifest` SW + `prompt` 업데이트 플로.
   **아무 화면도 만들기 전에 오프라인 설치가 되는지부터 확인한다.**
   나중에 얹으면 반드시 새는 곳이 생긴다.
   검증 절차: 배포 → 설치 → 비행기 모드 → 재실행 → 정상 동작 → 배포 → 업데이트 토스트 확인.
2. **주 2:** `build-data.mjs` + 데이터 스키마 확정 + IDB 저장 계층(마이그레이션 사다리 포함) +
   내보내기/가져오기.
3. **주 3:** ① 마일스톤 + ⑤ 용어집 (데이터가 이미 있고 UI가 단순 — 가장 먼저 쓸모가 생긴다).
4. **주 4:** ④ 계산기 (solver 먼저 + 순환 골든 테스트 → UI 나중).
5. **주 5:** ② 맵 (팬/줌 엔진 → 핀 → 좌표 보정).
6. **주 6:** ⑥ 레퍼런스 표 + ③ 단계도(단계 3개로 시작, 이후 증분).

**1번을 먼저 하는 것이 이 제안의 전부다.** 오프라인은 나중에 붙이는 기능이 아니라 기반 구조다.
6주차에 PWA를 얹으려 하면, 이미 만들어진 라우팅·자산 로딩·상태 저장 방식이 전부 온라인 가정 위에
서 있어서 하나씩 뜯어내야 한다.

---

## 부록: 근거 링크

- GitHub Pages 캐시 한계 논의 — https://github.com/orgs/community/discussions/11884
- Fresher service workers, by default (`updateViaCache`, Chrome 68/78 동작) — https://developer.chrome.com/blog/fresher-sw
- 24시간 자동 갱신 관련 사양 이슈 — https://github.com/w3c/ServiceWorker/issues/514
- Using Service Workers (MDN) — https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- WebKit: Full Third-Party Cookie Blocking and More (7일 캡 + 홈 화면 앱 예외 원문) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- PWA iOS Limitations and Safari Support (2026) — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Vite PWA — injectManifest 가이드 — https://vite-pwa-org.netlify.app/guide/inject-manifest.html
- Vite PWA — Workbox 시작하기 — https://vite-pwa-org.netlify.app/workbox/
- GitHub Pages 한도 (2026) — https://supadrop.host/blog/github-pages-limits/
- launch_handler (MDN) — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler
- Turning a GitHub page into a Progressive Web App — https://christianheilmann.com/2022/01/13/turning-a-github-page-into-a-progressive-web-app/
- satisfactory-docs-parser — https://github.com/lunafoxfire/satisfactory-docs-parser
- Satisfactory 커뮤니티 리소스 (Docs.json 위치·UTF-16 인코딩) — https://satisfactory.wiki.gg/wiki/Community_resources

---

### 검증 메모 (이 문서에서 실측/확인한 것)

- `assets/map/*.webp` = 각 1600×1600 (WebP VP8 헤더 직접 파싱), 합계 420KB
- `assets/buildings/` 27개 = 228KB
- `.nojekyll` 저장소에 이미 존재
- GitHub Pages 응답 헤더는 2026-08-18 서울 엣지에서 `curl -I`로 직접 측정
- **검증하지 않은 것:** 맵 좌표 아핀 계수(자리표시자), 오버클럭 전력 지수(Docs.json에서 추출 필요),
  `en-US.json`의 정확한 파일 구조. 이 셋은 구현 시 실물로 확인해야 한다.
