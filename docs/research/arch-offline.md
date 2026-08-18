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
