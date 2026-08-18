# 클라이언트 데이터 계층 리서치 — IndexedDB와 대안

> 담당: 데이터 엔지니어링 리서처 | 조사일: 2026-08-19
> 전제: 아이템 ~160종 / 레시피 ~300종 / 건물 ~100종 / 마일스톤 ~45개 / MAM 노드 수십 개 /
> 좌표 데이터(자원노드 460 + 자원정 118 + 간헐천 31 + 슬러그 1242 + 하드드라이브 118) /
> 게임 데이터 JSON 직렬화 시 약 1~5MB / 사용자 데이터는 마일스톤 ~50 + 대체 레시피 선택 ~90 + 계산기 설정 수십 건(수 KB~수십 KB) /
> GitHub Pages 정적 호스팅, 서버 없음.

## 결론 먼저

이 앱의 데이터는 **두 가지 성격이 완전히 다른 계층**으로 나뉜다. 이걸 하나의 저장소로 뭉뚱그려 고민하면 과설계로 빠진다.

| 계층 | 크기 | 변경 빈도 | 쿼리 패턴 | 권고 저장소 |
|---|---|---|---|---|
| 게임 정적 데이터 (아이템/레시피/건물/좌표) | 1~5MB, 읽기전용 | 앱 배포 시에만 | 키로 lookup, 그래프 순회 | **fetch → 메모리(JS 객체+Map)**. DB 불필요 |
| 사용자 진척 데이터 (마일스톤/대체레시피/계산기 설정) | 수 KB~수십 KB | 사용자 조작마다 | 전체 read/write, 거의 쿼리 없음 | **localStorage + 버전드 JSON 스키마**. IndexedDB도 과함 |

IndexedDB(및 Dexie/idb)가 정당화되려면 "인덱스를 걸고 부분 조회해야 할 만큼 큰 데이터"나 "메인 스레드를 막으면 안 될 만큼 큰 동기 쓰기"가 있어야 하는데, 이 앱의 두 계층 모두 그 임계치에 한참 못 미친다. 아래에 근거를 수치로 정리한다.

---

## 1. "그냥 JSON fetch해서 메모리에 두고 JS로 질의" — 이 규모에서 충분한가

### 1.1 파싱 비용
5MB급 JSON의 `JSON.parse` 비용은 최신 V8/JSC 기준 수십 ms 단위다(수백 KB당 수 ms대가 일반적으로 보고되는 수준). 앱 초기 로드 1회에 한정되고, `fetch().then(r => r.json())`은 스트리밍 파싱까지 지원해 메인 스레드 블로킹도 최소화된다. 300개 레시피, 160개 아이템 규모는 사실상 파싱 비용을 신경 쓸 필요가 없는 크기다(대규모 SPA들이 수십MB JSON도 부담 없이 파싱하는 사례가 흔함).

### 1.2 메모리 사용량
JS 파싱 후 객체 표현은 원본 JSON 대비 대략 2~4배 정도로 부풀 수 있지만(문자열 인터닝, 객체 헤더, 히든클래스 오버헤드), 5MB 원본 기준으로도 최악 20MB 내외다. 모바일 브라우저 탭의 실질 힙 한도가 수백 MB~1GB대인 것을 감안하면 무시 가능한 수준이다. 좌표 데이터(슬러그 1242개 등)도 각 레코드가 `{id, x, y, z, type}` 정도면 항목당 100바이트 미만이라 전체를 합쳐도 수백 KB.

### 1.3 질의 성능 — 핵심 연산은 "재귀적 생산 체인 해결"
이 앱의 진짜 부하는 DB 쿼리가 아니라 **그래프 순회**다. 300개 레시피를 `Map<itemId, Recipe[]>`로 인덱싱해두면 목표 아이템 → 하위 재료 전개는 O(레시피 수 × 평균 깊이) 수준이며, 실측상 이런 규모는 즉시(<1ms~수 ms) 완료된다. IndexedDB로 이런 그래프 탐색을 하면 오히려 **손해**다 — 인덱스 조회마다 비동기 왕복이 발생하고, 재귀 호출마다 트랜잭션을 열어야 해서 순수 JS 배열/Map 순회보다 몇 배 느려진다. IndexedDB는 "디스크에 있는, 메모리에 다 못 올리는 데이터를 인덱스로 부분 조회"하는 용도로 설계된 것이지, 이미 메모리에 다 올라간 5MB짜리 그래프를 순회하는 용도가 아니다.

**순환 레시피(Recycled Plastic ↔ Recycled Rubber) 처리**는 DB 기능이 아니라 알고리즘 문제다. 표준 해법은 방문 집합(visited set) + 메모이제이션으로, SQL의 재귀 CTE(`WITH RECURSIVE`)로도 순환을 원천 차단하기 어렵고(무한 루프 방지 로직이 결국 필요), JS 재귀/반복 순회 쪽이 오히려 구현이 간단하다.

```javascript
// 재귀적 생산 체인 해결 예시 — 메모리 내 Map만으로 충분
function resolveChain(itemId, rate, recipesByOutput, selectedAltRecipes, visiting = new Set(), memo = new Map()) {
  const key = `${itemId}:${rate}`;
  if (memo.has(key)) return memo.get(key);
  if (visiting.has(itemId)) {
    // 순환 레시피(Recycled Plastic <-> Recycled Rubber) 감지 시
    // 여기서 종료 조건을 명시적으로 건다 (예: 외부 입력으로 취급)
    return { itemId, rate, isCycleBoundary: true, inputs: [] };
  }

  const recipe = pickRecipe(itemId, recipesByOutput, selectedAltRecipes); // O(1) Map lookup
  if (!recipe) return { itemId, rate, isRawResource: true, inputs: [] };

  visiting.add(itemId);
  const inputs = recipe.inputs.map(input => {
    const childRate = rate * (input.amount / recipe.outputAmount);
    return resolveChain(input.itemId, childRate, recipesByOutput, selectedAltRecipes, visiting, memo);
  });
  visiting.delete(itemId);

  const result = { itemId, rate, recipe: recipe.id, inputs };
  memo.set(key, result);
  return result;
}
```

**결론: 게임 정적 데이터는 DB가 필요 없다.** `fetch()` → 메모리 상주 객체 + `Map` 인덱스 몇 개(아이템ID→아이템, 아이템ID→해당 아이템을 산출물로 갖는 레시피 목록, 레시피ID→레시피) 구성으로 전 계산이 끝난다. IndexedDB/Dexie/SQL(sql.js 등) 도입은 이 규모에서 순전히 오버엔지니어링이며, GitHub Pages 정적 호스팅이라는 전제와도 어긋난다(서버가 없으니 SQL 서버는 애초에 선택지가 아니고, sql.js/WASM SQLite를 쓰면 수백 KB~1MB대 WASM 바이너리를 추가로 내려받아야 해서 오히려 5MB 데이터 자체보다 무거워질 수 있다).

---

## 2. IndexedDB 직접 사용 vs Dexie.js vs idb (2026년 기준)

셋 다 "쓸 필요가 없다"는 결론은 같지만, 만약 향후 요구사항이 커져서(예: 오프라인 대량 로그, 사용자가 직접 만드는 커스텀 레시피 수천 건) 실제로 필요해질 경우를 대비해 비교해둔다.

| 방식 | 최신 크기(gzip) | API 스타일 | 비고 |
|---|---|---|---|
| **IndexedDB 원생** | 0 (브라우저 내장) | 콜백/이벤트(`onsuccess`/`onerror`) 기반, `IDBRequest` | 트랜잭션·커서·keyRange를 손으로 다뤄야 해서 코드량이 많고 실수하기 쉬움 |
| **idb** (jakearchibald) | **~1.19 kB (brotli)** [출처: GitHub README] | 원생 API를 얇게 Promise로 감쌈, `await db.get(store, key)` 식 | 쿼리 빌더 없음. 트랜잭션/스토어 개념은 그대로 알아야 함 |
| **Dexie.js** | **min 95,403 bytes / gzip 31,145 bytes (v4.4.5)** [출처: bundlephobia.com/package/dexie] | 체이닝 쿼리(`.where().equals()`), 버전드 스키마, 라이브 쿼리(`liveQuery`) | "A Minimalistic Wrapper for IndexedDB" 표방. 브라우저 IndexedDB 버그 우회 로직 포함, 멀티탭 동기화·React 훅 등 부가 기능 풍부 |

- idb: https://github.com/jakearchibald/idb — "This is a tiny (~1.19kB brotli'd) library that mostly mirrors the IndexedDB API, but with small improvements that make a big difference to usability."
- Dexie: https://github.com/dexie/Dexie.js , 크기 확인: https://bundlephobia.com/package/dexie (v4.4.5, uncompressed 95,403B / gzip 31,145B)

**판단**: idb는 사실상 공짜(1.2kB)라 "IndexedDB를 쓰기로 했다면" 항상 idb를 얹는 게 이득이다(콜백 지옥 제거, 번들 비용 무시 가능). Dexie는 30kB gzip이라는, 이 앱의 게임 데이터(1~5MB)에 비하면 작지만 사용자 진척 데이터(수 KB)에 비하면 압도적으로 큰 비용을 지불하고 버전 관리·쿼리 빌더를 얻는 도구다. **이 앱처럼 저장할 사용자 데이터가 수십 KB 규모, 쿼리도 "전체를 읽고 쓰기"뿐이라면 Dexie가 주는 이점(인덱스 쿼리, 라이브 쿼리, 멀티탭 동기화)을 쓸 일이 없다.** 즉 Dexie/idb/원생 IndexedDB 세 선택지 모두 "필요할 때 쓸 도구"로만 기억해두고, 지금은 어느 것도 채택하지 않는다.

---

## 3. localStorage의 실제 용량 한계와 동기 API 문제

### 3.1 용량 한계
MDN 최신 문서(Storage quotas and eviction criteria) 기준:

- **localStorage + sessionStorage 합산 최대 10 MiB**, 그중 localStorage 단독 최대 **5 MiB**가 사실상 모든 주요 브라우저(Chrome/Edge/Firefox/Safari)에서 공통 절대 한도로 적용된다.
- 초과 시 동기 예외 `QuotaExceededError` 발생 (try/catch 필수).
- 참고: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

대비: IndexedDB는 origin quota가 디스크 용량 기반으로 산정되어 Chrome은 디스크의 60%, Firefox는 best-effort 모드에서 `min(디스크의 10%, 그룹당 10GiB)`, Safari(macOS14+/iOS17+)는 브라우저 앱 기준 디스크의 최대 80%까지 허용 — 즉 IndexedDB는 GB 단위, localStorage는 5MB 단위로 자릿수 자체가 다르다.

**이 앱 적용**: 사용자 데이터(마일스톤 ~50건 + 대체 레시피 선택 ~90건 + 계산기 설정 수십 건)를 JSON으로 직렬화하면 각 항목이 `{id: boolean}` 또는 `{itemId, recipeId}` 수준이라 전체가 잘해야 수십 KB. 5MB 한도의 1% 미만이므로 **localStorage 용량은 전혀 문제가 되지 않는다.**

### 3.2 동기 API 문제
web.dev(Storage for the web) 명시: *"localStorage is synchronous and will block the main thread."* IndexedDB가 비동기로 설계된 이유는 대용량 데이터/복잡한 쿼리 처리 중 UI를 막지 않기 위함이다.
출처: https://web.dev/articles/storage-for-the-web

**이 앱 적용**: 블로킹 비용은 저장 데이터 크기에 비례한다. 수십 KB짜리 JSON을 `localStorage.setItem`으로 쓰는 비용은 실무적으로 1ms 미만이며(브라우저 벤치마크상 localStorage 쓰기는 KB당 마이크로초 단위), 마일스톤 체크박스 하나 토글할 때마다 발생해도 사용자가 체감할 프레임 드랍이 없다. "동기라서 위험하다"는 경고는 **MB~수십MB급 데이터를 자주 쓸 때** 유효한 것이지, 이 앱의 수십 KB급 저빈도 쓰기에는 해당하지 않는다.

**단, 저장 시점에 주의할 점**: 계산기가 매 프레임/매 슬라이더 드래그마다 저장을 시도하면(디바운스 없이) 체감 렉이 생길 수 있다. → `debounce(saveToLocalStorage, 300~500ms)` 적용 권장. 이건 저장소 선택 문제가 아니라 저장 빈도 제어 문제다.

---

## 4. 사용자 진척 데이터의 스키마 버전 관리 및 마이그레이션

앱이 배포될 때마다 저장 스키마가 바뀔 수 있으므로(예: 마일스톤 ID 체계 변경, 계산기 설정에 필드 추가), **버전 필드 + 순차 마이그레이션 함수 배열** 패턴을 쓴다. Dexie를 쓴다면 이 패턴이 `db.version(N).upgrade()`로 내장되어 있지만(§2 참조), localStorage로 직접 구현해도 동일한 효과를 20줄 이내로 얻을 수 있다.

```javascript
const SCHEMA_VERSION = 3;
const STORAGE_KEY = 'satisfactory-ops:progress';

// 마이그레이션은 "이전 버전 → 다음 버전" 단위로 순차 정의.
// 절대 기존 마이그레이션 함수를 수정하지 말고, 새 버전을 추가할 것 (Dexie 원칙과 동일).
const migrations = {
  1: (data) => data, // 최초 스키마, no-op
  2: (data) => ({
    ...data,
    // v2: 마일스톤을 배열에서 Set 직렬화(배열) + 완료시각 기록으로 변경
    milestones: (data.milestones ?? []).map(id => ({ id, completedAt: null })),
  }),
  3: (data) => ({
    ...data,
    // v3: 대체 레시피 선택 키를 itemId 기준에서 recipeId 기준으로 변경
    altRecipes: Object.fromEntries(
      Object.entries(data.altRecipes ?? {}).map(([itemId, recipeId]) => [recipeId, true])
    ),
  }),
};

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: SCHEMA_VERSION, milestones: [], altRecipes: {}, calculators: [] };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('진척 데이터 파싱 실패 — 백업 후 초기화');
    localStorage.setItem(`${STORAGE_KEY}:corrupt-backup`, raw);
    return { version: SCHEMA_VERSION, milestones: [], altRecipes: {}, calculators: [] };
  }

  let { version = 1, ...data } = parsed;
  while (version < SCHEMA_VERSION) {
    version += 1;
    data = migrations[version](data);
  }
  const migrated = { version, ...data };

  if (parsed.version !== SCHEMA_VERSION) {
    // 마이그레이션 결과를 즉시 재저장해 다음 로드부터는 마이그레이션 스킵
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  }
  return migrated;
}
```

핵심 규칙:
1. **저장 데이터에 항상 `version` 필드를 포함**한다.
2. 마이그레이션 함수는 **불변**으로 취급하고(과거 버전 재현을 위해), 스키마가 바뀌면 새 버전 번호와 새 함수를 추가한다 — Dexie 공식 문서의 "업그레이드 함수가 있는 버전은 변경하지 않는다" 원칙과 동일 (https://dexie.org/docs/Tutorial/Design).
3. `JSON.parse` 실패(손상된 데이터, 브라우저 확장 프로그램 간섭 등) 시 **원본을 백업 키로 보존한 뒤 초기화** — 조용히 덮어써서 사용자 진척을 날리지 않는다.
4. 게임 데이터 자체의 스키마가 바뀌어 사용자가 저장한 `recipeId`/`itemId`가 더 이상 존재하지 않을 수 있다(밸런스 패치 등) — 로드 시 게임 데이터 마스터와 대조해 **존재하지 않는 ID는 조용히 드롭**하고 콘솔에 경고만 남기는 방어 코드를 마이그레이션과 별도로 둔다.

---

## 5. 진척 내보내기/가져오기 포맷 설계

서버가 없는 정적 앱이므로 "공유"는 곧 **클라이언트 간 파일 또는 URL 전달**이다. 두 경로를 모두 지원하는 설계:

### 5.1 파일 내보내기 (JSON, 비압축)
사용자 데이터가 수십 KB 수준이므로 압축 없이 그대로 다운로드해도 무방하다. 가독성과 디버깅 용이성이 압축보다 이득.

```javascript
function exportProgress() {
  const data = loadProgress();
  const payload = {
    app: 'satisfactory-ops',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `satisfactory-ops-progress-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  return file.text().then(text => {
    const payload = JSON.parse(text);
    if (payload.app !== 'satisfactory-ops') throw new Error('호환되지 않는 파일');
    // schemaVersion이 낮으면 loadProgress()와 동일한 migrations 체인을 재사용
    let { version = payload.schemaVersion, ...rest } = payload.data;
    while (version < SCHEMA_VERSION) {
      version += 1;
      rest = migrations[version](rest);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version, ...rest }));
  });
}
```

### 5.2 URL 공유 (압축 + URL-safe 인코딩)
"계산기 설정 하나를 링크로 공유"처럼 짧은 데이터를 URL 쿼리스트링/해시에 담는 경우, `encodeURIComponent(JSON.stringify(...))`만으로는 URL이 과도하게 길어진다. **lz-string**의 `compressToEncodedURIComponent`가 이 용도로 표준적으로 쓰인다.

- 출처: https://github.com/pieroxy/lz-string — "LZ-based compression algorithm for JavaScript", URL-safe 인코딩(`encodeduri`/`compressToEncodedURIComponent`) 지원.

```javascript
import LZString from 'lz-string';

function buildShareUrl(calculatorConfig) {
  const compact = LZString.compressToEncodedURIComponent(JSON.stringify(calculatorConfig));
  return `${location.origin}${location.pathname}#share=${compact}`;
}

function parseShareUrl() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const compact = hash.get('share');
  if (!compact) return null;
  const json = LZString.decompressFromEncodedURIComponent(compact);
  return json ? JSON.parse(json) : null;
}
```

**적용 범위 판단**: 마일스톤 50건 + 대체 레시피 90건 전체를 URL로 공유하기엔 계산기 설정 하나에 비해 크지만(여전히 수 KB대라 실용적으로는 가능), 브라우저 URL 길이 한계(실무적으로 약 2000자 안전선, 최신 브라우저는 더 허용하지만 서버·프록시 호환성 고려 시 2000자 기준이 관례)를 고려하면 **"계산기 설정 1건" 단위 공유는 URL 방식**, **"전체 진척 백업"은 파일 다운로드 방식**으로 용도를 분리하는 게 맞다.

---

## 6. 최종 권고 요약

1. 게임 정적 데이터(1~5MB): `fetch()` 1회 → 메모리 객체 + `Map` 인덱스. IndexedDB/Dexie/SQL(sql.js) 전부 불필요 — 이 규모에서 도입 비용(코드 복잡도·번들 크기)이 이득보다 크다.
2. 재귀 생산 체인 계산: DB 쿼리가 아니라 순수 JS 그래프 순회 + 메모이제이션으로 처리. 순환 레시피는 `visiting` Set으로 방어.
3. 사용자 진척 데이터(수십 KB): `localStorage` + 버전드 JSON 스키마(`version` 필드 + 순차 마이그레이션 함수). 5MB 한도의 1% 미만이라 용량 문제 없음. 동기 API의 블로킹 우려는 이 데이터 크기·저장 빈도(디바운스 적용 시)에서는 무의미.
4. 만약 향후 사용자 커스텀 데이터(예: 직접 만든 대량의 커스텀 레시피, 대용량 로그)가 생겨 localStorage 5MB를 근접하게 되면, 그때 가서 **idb**(1.2kB, 얇은 Promise 래퍼)를 우선 검토하고, 인덱스 쿼리·라이브 쿼리가 실제로 필요해지면 **Dexie**(gzip 31kB)로 승격하는 단계적 채택을 권고. 지금 시점에 선제 도입은 과설계.
5. 내보내기/가져오기: 전체 백업은 비압축 JSON 파일 다운로드, 단건 공유는 lz-string으로 압축한 URL 해시 인코딩. 둘 다 `schemaVersion` 필드를 포함해 §4의 마이그레이션 체인을 재사용한다.
