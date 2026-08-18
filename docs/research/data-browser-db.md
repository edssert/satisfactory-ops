# 브라우저 내 SQL 엔진 조사 — Satisfactory Ops용 클라이언트 DB

조사일: 2026-08-19

방법: 공식 문서(sqlite.org/wasm, duckdb.org), npm registry API, jsdelivr 파일 리스팅 API, bundlephobia API, MDN, GitHub 저장소를 직접 fetch해서 실측했다. WebSearch는 세션 예산 소진으로 이번 조사부터 사용 불가 — 아래 수치는 전부 **직접 fetch한 1차 소스**에서 나온 것이고, 출처 URL을 각 항목에 명시했다. 마지막 절의 SQL은 로컬 Python `sqlite3`(SQLite 3.50.4, 브라우저 WASM 빌드와 동일 엔진)로 실제 실행해 결과를 검증했다.

---

## 0. 데이터 규모 재확인 — 이 판단의 전제

과제에서 준 규모를 그대로 쓴다: 아이템 ~160종, 레시피 ~300종, 건물 ~100종, 마일스톤 ~45개, MAM 노드 수십 개, 좌표 데이터(자원 노드 460 + 자원정 118 + 간헐천 31 + 슬러그 1242 + 하드드라이브 118 ≈ **2000행 미만**), 사용자 데이터는 수십~수백 건. 전체 JSON 직렬화 1~5MB 추정.

**이건 "분석 DB가 필요한 규모"가 전혀 아니다.** 행 수 기준으로 보면:
- 관계형 테이블(아이템/레시피/건물/마일스톤) 전체 = 대략 500~600행
- 좌표 데이터가 제일 크지만 그래도 2000행 미만, 컬럼도 적음(좌표 3개 + 타입 + 순도 정도)

RDB 상식으로 이 정도는 **인덱스 없이 JS 배열 `.filter()`/`.find()`로 돌려도 밀리초 단위**로 끝난다. SQL 엔진이 필요하다면 그 이유는 "데이터가 커서"가 아니라 "재귀적 그래프 탐색(생산 체인 해석)을 선언적으로 표현하고 싶어서" 여야 한다. 이 전제를 계속 참조하면서 아래를 읽어야 한다.

---

## 1. 요약 표

| 엔진 | 실측 wasm 크기(uncompressed) | JS glue gzip | 영속화 | OPFS 지원 | GH Pages 적합성 | 이 앱 규모에 대한 결론 |
|---|---|---|---|---|---|---|
| **공식 sqlite-wasm** (`@sqlite.org/sqlite-wasm`) | 864,752 B (~845 KB) | 62,994 B (index.mjs 기준) | OPFS(2종 VFS) / kvvfs | ✅ 공식 지원, 2가지 VFS | 가능하나 COOP/COEP 이슈 있음(§4) | 과함. 이 앱엔 영속 SQL DB 자체가 불필요 |
| **wa-sqlite** | 558,343 B(sync) / 1,139,398 B(async) | — | OPFS(5종 VFS) / IndexedDB | ✅ 가장 먼저 OPFS 구현한 프로젝트 | 가능 | 더 과함. VFS 선택지가 많아 결정 비용만 늘어남 |
| **sql.js** | 658,410 B | 13,980 B(loader) | ❌ **없음** (순수 메모리) | ❌ | 쉬움(헤더 불필요) | 영속화가 없어 이 앱엔 부적합(설정 저장 못 함) |
| **absurd-sql** | sql.js 포크 의존 | — | IndexedDB 블록 스토리지 | 대체재(OPFS 이전 세대) | COOP/COEP 필요, 유지보수 정체 | **채택 비추천** — OPFS로 대체된 레거시 |
| **DuckDB-WASM** | 35.3~40.6 **MB**(변형별) | — | OPFS 실험적 | 부분 지원 | COOP/COEP 필요(고성능 스레드 모드) | **명백히 과함** — OLAP 엔진을 500행짜리 앱에 |

**핵심 결론을 먼저**: 이 앱 규모에서는 위 다섯 옵션 전부 "쓸 수는 있지만 정당화가 안 되는" 쪽에 가깝다. 아래 각 절에서 왜 그런지, 그리고 SQL의 "선언적 재귀"라는 진짜 매력 포인트가 이 앱에 실제로 얼마나 유효한지를 다룬다.

---

## 2. 옵션별 상세

### 2-1. 공식 SQLite WASM — `@sqlite.org/sqlite-wasm`

- 최신 버전: `3.53.0-build1` (npm registry 실측, 2026-08-19 조회)
- 출처: https://registry.npmjs.org/@sqlite.org/sqlite-wasm/latest , 파일별 실제 크기는 jsdelivr 데이터 API로 확인 — https://data.jsdelivr.com/v1/packages/npm/@sqlite.org/sqlite-wasm@3.53.0-build1

| 파일 | 크기 |
|---|---|
| `sqlite3.wasm` | 864,752 B |
| `sqlite3-worker1.mjs` (워커 번들) | 571,858 B |
| `sqlite3-opfs-async-proxy.js` (OPFS용 프록시) | 32,289 B |
| `index.mjs` (ESM 진입점) | 578,559 B |

공식 문서(https://sqlite.org/wasm/doc/trunk/persistence.md)에 따르면 영속화 옵션은 3가지:

1. **OPFS VFS(표준)** — `sqlite3_vfs`를 JS로 완전히 재구현. **워커 스레드 전용**(메인 스레드 불가), 멀티탭 동시성을 지원하려면 **`SharedArrayBuffer`가 필요하고, 이는 `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` 헤더(=COOP/COEP)를 요구**한다. Safari 17 미만은 스토리지 버그로 비호환.
2. **OPFS SyncAccessHandle Pool VFS(`opfs-sahpool`)** — COOP/COEP 불필요, Safari 16.4+에서도 동작. 대신 **동시 다중 연결(멀티탭) 미지원**, 파일 경로가 가상화됨(실제 OPFS 경로 투명성 없음).
3. **kvvfs** — `localStorage`/`sessionStorage` 기반, 메인 스레드에서 바로 씀. 5MB 제한, DB 1개만.

→ 우리 앱 규모(사용자 데이터 수십~수백 건, KB 단위)라면 **kvvfs조차 과잉 스펙**이고, 사실 `localStorage.setItem(JSON.stringify(...))` 한 줄과 다를 게 없다.

### 2-2. wa-sqlite (rhashimoto/wa-sqlite)

출처: https://github.com/rhashimoto/wa-sqlite

- OPFS를 **SQLite에 최초로 결합한 프로젝트**로 공식 문서에서도 credit됨("first known implementation of OPFS storage of sqlite3 databases" — sqlite.org/wasm/doc 인용).
- VFS가 5종(`AccessHandlePoolVFS`, `OPFSAdaptiveVFS`, `OPFSAnyContextVFS`, `OPFSCoopSyncVFS`, `OPFSWriteAheadVFS`) + IndexedDB 2종 + 메모리 2종, 총 9종. 실측 wasm: sync 빌드 558,343 B, async(Asyncify/JSPI) 빌드 1,139,398 B (jsdelivr, `wa-sqlite@1.0.0`).
- npm 패키지 자체 unpacked 2.18MB(41개 파일) — 데모/빌드 스크립트 포함이라 실제 배포 크기와는 다름.
- **문제는 선택지 과잉**이다. VFS 9종 중 뭘 쓸지 결정하는 데만 리서치 시간이 든다. 공식 sqlite-wasm이 이미 그중 실전 검증된 2종(OPFS VFS, opfs-sahpool)을 골라서 제공하므로, 신규 프로젝트라면 wa-sqlite를 쓸 이유가 크지 않다(레거시 이유로 남아있는 선택).

### 2-3. sql.js (sql-js/sql.js)

출처: https://github.com/sql-js/sql.js , npm https://registry.npmjs.org/sql.js/latest (버전 1.14.2)

- **순수 인메모리**: 공식 README 인용 — "doesn't persist the changes made to the database". DB를 `Uint8Array`로 export/import해서 개발자가 직접 저장소(IndexedDB, localStorage 등)에 넣어야 함. **자체 영속화 메커니즘이 없다.**
- 실측: `sql-wasm.wasm` 658,410 B, 로더 `sql-wasm.js` gzip 13,980 B(bundlephobia API).
- OPFS 미지원. absurd-sql이 바로 이 공백(영속화 없음)을 메우려고 나온 프로젝트.
- **이 앱에 sql.js를 쓴다면**: 매번 앱 시작 시 게임 데이터(레시피 등)를 wasm에 로드하고, 사용자 데이터(마일스톤 체크, 대체 레시피 선택)는 SQL로 조작한 뒤 export해서 localStorage에 넣는 흐름이 되는데 — 이건 그냥 JS 객체 + localStorage보다 코드가 더 많아지는 구조다.

### 2-4. absurd-sql (jlongster/absurd-sql)

출처: https://github.com/jlongster/absurd-sql

- sql.js의 **포크 버전**에 의존(메인테이너가 "sql.js에 PR 올리고 머지되길 바란다"고 README에 써놓은 상태 — 정식 머지 안 됨).
- IndexedDB를 블록 디바이스처럼 취급해 영속화. 이게 필요했던 이유가 "당시엔 OPFS가 없었기 때문"인데, 2023년 3월부터 OPFS가 Baseline Widely Available이 되면서(§3) 존재 이유가 사라졌다.
- 커밋 63개, 이슈 37개 열린 채 정체 — 실질적으로 **레거시 취급**이 맞다. 게다가 SharedArrayBuffer/COOP·COEP 요구까지 있어 공식 sqlite-wasm의 opfs-sahpool보다 나은 점이 없다.
- **결론: 신규 프로젝트에서 채택할 이유 없음.**

### 2-5. DuckDB-WASM

출처: https://github.com/duckdb/duckdb-wasm , npm https://registry.npmjs.org/@duckdb/duckdb-wasm/latest

실측 파일 크기(jsdelivr, `@duckdb/duckdb-wasm@1.29.0`):

| 번들 변형 | wasm 크기 | 요구사항 |
|---|---|---|
| `duckdb-mvp.wasm` | 40,621,595 B (~38.7 MB) | 없음(가장 넓은 호환) |
| `duckdb-eh.wasm` | 35,659,694 B (~34.0 MB) | Exception Handling 지원 브라우저 |
| `duckdb-coi.wasm` | 35,272,630 B (~33.6 MB) | **Cross-Origin Isolation 필요** (COOP/COEP, 스레드 병렬화용) |

공식 README(GitHub, fetch 확인)는 예시로 확장 3개(h3, sqlite_scanner, quack) 로드 시 "약 3.2MB 압축 전송"이라고 언급 — 즉 **기본 코어 wasm만 해도 수십 MB대**이고 gzip으로도 최소 수 MB대(일반적 wasm gzip 압축률 40~55% 감안 시 코어만 15~20MB 내외 추정, 실측 gzip 수치는 이번 조사에서 직접 못 받음).

DuckDB는 컬럼형 OLAP 엔진 — 벡터화 실행, 병렬 조인, 대용량 집계에 강하다. 이 앱의 부하는 **500~600행짜리 레시피 그래프의 재귀 탐색**이다. OLAP 엔진의 강점(컬럼 스캔, 대량 집계)이 발휘될 지점이 원천적으로 없다. **번들 크기 대비 효용이 이 앱에서 가장 낮은 옵션.**

---

## 3. OPFS(Origin Private File System) 2026년 현황

출처: MDN https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system , caniuse (FileSystemHandle) https://caniuse.com/mdn-api_filesystemhandle

- MDN 기준 **"Baseline: Widely Available"**(2023년 3월부터) — Chrome/Firefox/Safari 모두 지원.
- **동기 접근(`createSyncAccessHandle`)은 Web Worker 안에서만 가능** — 메인 스레드 블로킹 방지 설계상 제약. 메인 스레드에서는 비동기 API(`getFileHandle`, `createWritable` 등)만 사용 가능.
- Safari: caniuse 기준 FileSystemHandle 계열은 **iOS/macOS Safari 15.2부터 지원**(94.81% 글로벌 커버리지). 단, sqlite.org 공식 문서는 **"Safari 17 미만에서는 OPFS 스토리지 버그로 비호환"**이라고 별도 명시 — caniuse의 "지원됨" 표기와 실사용 가능 여부 사이에 갭이 있다는 뜻이라 주의.
- 참고로 이번 조사 중 헷갈리기 쉬운 지점 하나: **"File System Access API"(로컬 파일 피커, `showOpenFilePicker` 등)와 OPFS는 별개 기능**이다. caniuse의 `native-filesystem-api` 항목(로컬 파일 접근)은 Safari/Firefox 미지원이 맞지만, **OPFS 자체(`navigator.storage.getDirectory()`)는 그 항목과 다르고 Safari도 지원한다.** 조사 중 이 둘을 섞어서 보도하는 자료가 많으니 앱 설계 시 정확히 구분할 것.
- 워커 필요 여부 요약: 동기 API(빠름, SQLite VFS가 원하는 방식) = 워커 필수. 비동기 API = 메인 스레드 가능하지만 SQLite 동기 I/O 모델과 안 맞아 별도 브리지(Atomics/SharedArrayBuffer) 필요 → 이게 §4의 COOP/COEP 요구로 이어짐.

---

## 4. GitHub Pages 배포 제약 — COOP/COEP, MIME

이 앱의 배포 전제("서버 없음, GitHub Pages 정적 호스팅")가 사실상 **모든 옵션의 실질적 채택 가능성을 결정**한다.

- **GitHub Pages는 커스텀 HTTP 응답 헤더를 설정할 수 없다.** 공식 문서(https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)에도 헤더 설정 기능 언급이 없고, Netlify/Cloudflare Pages류의 `_headers` 파일 개념이 없다. 즉 **`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`를 서버 단에서 못 준다** → `SharedArrayBuffer` 사용 불가 → 표준 OPFS VFS(§2-1의 방식 1), wa-sqlite의 SharedArrayBuffer 기반 VFS, absurd-sql, DuckDB-WASM의 EH/COI 스레드 병렬 모드가 **기본 배포로는 전부 막힌다.**
- 우회책은 있다: **서비스워커로 COOP/COEP 헤더를 주입하는 `coi-serviceworker`**(https://github.com/gzuidhof/coi-serviceworker) — "헤더를 제어할 수 없는 상황을 위한" 프로젝트라고 스스로 소개. 원리는 서비스워커가 첫 로드 시 자기 자신을 등록하고 페이지를 강제 리로드하며 응답에 COOP/COEP를 씌우는 것. 단점: 초회 로드 시 **리로드 1회 발생**(체감 로딩 지연), 서비스워커 등록/해제 관리 필요, 별도 오리진 파일로 서빙해야 함(CDN 번들 불가).
- **이 우회책 없이 GH Pages에서 쓸 수 있는 옵션은 딱 하나: `opfs-sahpool`(SyncAccessHandle Pool VFS)** — COOP/COEP 불필요가 정확히 이 제약을 피하려고 설계된 VFS다. 대신 멀티탭 동시 쓰기 미지원이라는 트레이드오프가 있는데, 이 앱은 애초에 단일 사용자·단일 탭 저장 계산기라 이 트레이드오프가 실질적으로 문제되지 않는다.
- **.wasm MIME 타입**: GitHub Pages는 확장자 기반으로 정적 파일을 서빙하며 `.wasm`은 `application/wasm`으로 내려간다(pyodide, sql.js 데모, duckdb-wasm 데모 등 다수 프로젝트가 실제로 GH Pages에 wasm을 올려 운영 중인 사례로 봐도 현재는 non-issue). `instantiateStreaming` 실패 시에도 `arrayBuffer()` + `instantiate()` 폴백이 표준 패턴이라 리스크는 낮다.

**결론**: GH Pages + 헤더 우회 없음 전제라면, 이 앱에서 유일하게 마찰 없이 쓸 수 있는 조합은 **공식 sqlite-wasm + opfs-sahpool**이다. 그런데 §0의 데이터 규모를 다시 보면, 이 조합조차 "쓸 수 있다"이지 "필요하다"가 아니다.

---

## 5. 초기 로딩 비용 비교와 "정당화되는 조건"

| 옵션 | 최소 전송량(핵심 wasm, uncompressed) | 이 앱(1~5MB 게임데이터 JSON) 대비 |
|---|---|---|
| JS 배열 + `fetch('data.json')` | 0 (엔진 자체가 없음) | 기준선 |
| sql.js | ~658 KB | 게임 데이터 자체보다 큰 경우도 있음 |
| 공식 sqlite-wasm (opfs-sahpool) | ~865 KB + 워커 571 KB ≈ **1.4 MB** | JSON 데이터 크기와 맞먹거나 더 큼 |
| wa-sqlite | ~558 KB~1.1 MB | 유사 |
| DuckDB-WASM | **34~41 MB** | 게임 데이터의 10~40배 |

수 MB급 WASM 로딩이 정당화되려면 최소한 다음 중 하나가 필요하다:
1. **데이터가 커서 인덱스/쿼리 최적화가 실질적 성능 차이를 만든다** — 이 앱은 아니다(§0, 600행 미만).
2. **SQL이 아니면 표현이 극도로 번거로운 연산**(다중 조인, 윈도우 함수, 집계)이 반복적으로 필요하다 — 마일스톤 진행률 집계나 자원 노드 필터링 정도는 JS `.reduce()`/`.filter()`로 충분히 짧다.
3. **영속 저장 자체가 SQL이어야 하는 이유**(예: 외부에서 만든 .sqlite 파일을 그대로 import/export해야 함) — 이 앱 사용자 데이터(마일스톤 체크, 대체 레시피 선택, 계산기 설정)는 애초에 스키마가 단순해서 JSON 한 덩어리로 충분.
4. **오프라인에서 임의 SQL을 사용자가 직접 짜야 하는 기능**(예: "SQL 콘솔로 내 팩토리 데이터 조회" 같은 파워유저 기능)을 의도적으로 넣는 경우.

이 앱은 1~4 중 어느 것도 강하게 해당하지 않는다. 특히 순환 레시피(§6) 때문에 "SQL 재귀 = 생산 체인 해석의 정답"이라는 직관이 실제로는 깨진다는 걸 아래에서 직접 보여준다.

---

## 6. 실제로 동작하는 SQL — 재귀 CTE로 생산 체인 풀기 (+ 순환의 함정)

아래는 의사코드가 아니라 **로컬 SQLite 3.50.4(Python `sqlite3` 바인딩, WASM 빌드와 동일 SQLite 코어)로 직접 실행해 검증한** 스키마와 쿼리다. 브라우저의 sqlite-wasm/wa-sqlite/sql.js 모두 SQL 방언 차이 없이 SQLite 코어 그대로이므로 이 SQL은 그대로 재사용 가능하다.

### 6-1. 스키마

```sql
CREATE TABLE items(id TEXT PRIMARY KEY, name TEXT);

CREATE TABLE recipes(
  id TEXT PRIMARY KEY,
  name TEXT,
  output_item TEXT REFERENCES items(id),
  output_qty REAL,
  time_sec REAL,
  is_alternate INTEGER
);

CREATE TABLE recipe_inputs(
  recipe_id TEXT REFERENCES recipes(id),
  item_id TEXT REFERENCES items(id),
  qty REAL,
  PRIMARY KEY(recipe_id, item_id)
);

-- 사용자가 아이템별로 고른 "이 아이템을 만들 때 쓸 레시피" 1건(기본 or 대체)
CREATE TABLE selected_recipe(
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  recipe_id TEXT REFERENCES recipes(id)
);
```

### 6-2. 재귀 CTE — 목표 산출량에서 원료까지 트리 전개

```sql
WITH RECURSIVE chain(item_id, recipe_id, depth, rate_per_min) AS (
  SELECT sr.item_id, sr.recipe_id, 0, :target_rate AS rate_per_min
  FROM selected_recipe sr
  WHERE sr.item_id = :target_item

  UNION ALL

  SELECT ri.item_id,
         sr2.recipe_id,
         chain.depth + 1,
         chain.rate_per_min * ri.qty / r.output_qty AS rate_per_min
  FROM chain
  JOIN recipes r        ON r.id = chain.recipe_id
  JOIN recipe_inputs ri ON ri.recipe_id = r.id
  LEFT JOIN selected_recipe sr2 ON sr2.item_id = ri.item_id
  WHERE chain.depth < 64   -- 순환 방지용 안전장치, 아래 6-4 참고
)
SELECT c.item_id, i.name, c.depth, ROUND(SUM(c.rate_per_min), 4) AS total_rate_per_min
FROM chain c
JOIN items i ON i.id = c.item_id
GROUP BY c.item_id
ORDER BY c.depth, c.item_id;
```

### 6-3. 정상 케이스 실행 결과 (Reinforced Iron Plate 분당 5개)

Iron Ingot → Iron Plate / Screw → Reinforced Iron Plate 체인으로 테스트한 실제 출력:

```
('reinforced-plate', 'Reinforced Iron Plate', 0, 5.0)
('iron-plate',       'Iron Plate',            1, 30.0)
('screw',            'Screw',                 1, 60.0)
('iron-ingot',       'Iron Ingot',             2, 60.0)
```

검산: Iron Plate 경로(output_qty=2, 투입 iron-ingot qty=3)에서 30 × 3/2 = 45, Screw 경로(output_qty=4, 투입 iron-ingot qty=1)에서 60 × 1/4 = 15, 두 경로가 `GROUP BY item_id`로 합산돼 45 + 15 = **60** — 출력값과 정확히 일치한다. 즉 이 쿼리는 한 아이템이 여러 상위 레시피에서 동시에 소비되는 다이아몬드형(비순환) 그래프도 `SUM` 집계로 올바르게 합산한다.

### 6-4. 진짜 위험한 부분 — Recycled Plastic ↔ Recycled Rubber 순환

같은 쿼리를 순환 레시피(Recycled Plastic이 Rubber를 먹고, Recycled Rubber가 Plastic을 먹는 구조, 각각 투입 6/산출 12 = 비율 0.5)에 그대로 돌린 실측 결과:

```
('plastic', 'Plastic', 0, 6.6667)
('fuel',    'Fuel',    1, 5.0)
('rubber',  'Rubber',  1, 3.3333)
```

목표 Plastic 분당 5개를 넣었는데 **총 Plastic 소요량이 6.6667로 계산됐다** — 이는 우연이 아니라 **재귀 CTE가 `depth < 64`까지 트리를 펼치고 `SUM`으로 합산하는 것이, 수학적으로 `(I - A)⁻¹b`를 급수(Neumann series)로 근사하는 것과 동일**하기 때문이다. 이 케이스는 루프 이득(loop gain, 여기선 0.25 = 0.5×0.5)이 1보다 작아서 **우연히 수렴**했다.

**하지만 이건 일반해가 아니다.** 대체 레시피 조합에 따라 루프 이득이 1 이상이 되는 조합이 존재하면(예: 산출/투입 비율이 뒤집히는 다른 대체 레시피 선택), 이 재귀 CTE는:
- `depth < 64` 안전장치가 없으면 **무한 루프**(SQLite `WITH RECURSIVE`는 종료 조건이 없으면 그냥 영원히 돎)
- 안전장치가 있어도 **발산하는 값을 64단계까지 합산한 쓰레기 숫자**를 "정답"인 것처럼 돌려줌

즉 **"재귀 CTE로 생산 체인을 SQL 한 방에 푼다"는 이 앱의 유력한 SQL 채택 근거 자체가, 이 게임 특유의 순환 레시피 앞에서 구조적으로 무너진다.** 이미 리서치된 `docs/research/eco-github.md`의 솔버들(SatisfactoryLP의 MILP, yet-another-factory-planner의 LP)이 전부 트리 전개가 아니라 **물질수지를 등식 제약(`Σ생산 - Σ소비 = 0`)으로 놓고 선형계를 직접 푸는 방식**을 쓰는 이유가 바로 이것이다 — 순환 그래프에서 등식 제약 기반 해법만이 일반적으로 옳다.

**따라서**: SQL 재귀 CTE는 "루프가 없는 하위 트리 미리보기/설명"용으로는 쓸 수 있어도, **순환이 존재하는 전체 그래프의 정확한 해는 SQL 바깥(JS의 반복 수렴 계산 또는 별도 LP/선형대수)에서 풀어야 한다.** SQL 엔진을 들이는 이유였던 핵심 연산(재귀적 생산 체인 해결)이 사실 SQL만으로는 못 끝나는 문제라는 뜻이다.

---

## 7. 결론 및 권고

1. **데이터 규모(§0)가 SQL 엔진을 요구하지 않는다.** 관계형 테이블 500~600행, 좌표 데이터 2000행 미만은 JS 배열 연산으로 충분하고, 인덱스가 주는 이점이 체감되지 않는 규모다.
2. **배포 제약(GH Pages, 헤더 불가)이 옵션을 강하게 좁힌다.** 표준 OPFS VFS·wa-sqlite의 SharedArrayBuffer 기반 VFS·absurd-sql·DuckDB-WASM의 스레드 병렬 모드는 모두 COOP/COEP가 필요해 `coi-serviceworker` 우회 없이는 못 쓴다. 우회 없이 마찰 없는 조합은 사실상 **공식 sqlite-wasm + `opfs-sahpool`** 하나뿐이다.
3. **핵심 연산(순환 포함 재귀 생산 체인 해석)이 SQL 재귀 CTE로 일반적으로 안 풀린다(§6).** Recycled Plastic/Rubber처럼 루프 이득이 우연히 1 미만이면 급수가 수렴해서 "그럴듯한 답"이 나오지만, 이건 구조적 보장이 없다. 이미 검토된 외부 솔버들(MILP/LP)이 전부 SQL이 아니라 등식 제약 선형계로 이 문제를 푸는 게 그 증거다.
4. **DuckDB-WASM은 이 규모에서 명백히 과하다** — wasm 코어만 34~41MB(§2-5), OLAP 강점(컬럼 스캔·대량 집계)이 발휘될 데이터가 애초에 없다.
5. **sql.js/absurd-sql은 채택 이유가 약하다** — sql.js는 영속화가 없어 export/import 코드가 추가로 필요하고, absurd-sql은 OPFS(2023년 Baseline 이후)로 사실상 대체된 레거시(§2-4)다.
6. **권고**: SQL 엔진 도입은 보류. 게임 데이터는 정적 JSON(1~5MB, 서비스워커/HTTP 캐시로 캐싱)으로 로드하고 JS 인메모리 구조(Map/인덱스)로 조회, 사용자 데이터(마일스톤·대체 레시피·계산기 설정)는 `localStorage` 또는 소규모면 OPFS 없이도 충분한 IndexedDB 한 스토어로 저장한다. 생산 체인 해석은 SQL 재귀 CTE가 아니라 **JS로 구현한 반복 수렴(fixed-point iteration) 또는 §2-2에서 언급한 `glpk.js` 같은 LP 솔버**로 순환을 정확히 처리하는 편이 옳다. SQL이 필요해지는 시점은 "사용자가 자기 팩토리 데이터에 임의 쿼리를 날리는 파워유저 기능"을 실제로 넣기로 결정했을 때뿐이며, 그때도 규모상 opfs-sahpool + 공식 sqlite-wasm 조합이면 충분하고 DuckDB는 여전히 과하다.

---

## 참고 출처

- SQLite Wasm 공식 문서: https://sqlite.org/wasm/doc/trunk/index.md , https://sqlite.org/wasm/doc/trunk/persistence.md
- `@sqlite.org/sqlite-wasm` npm: https://registry.npmjs.org/@sqlite.org/sqlite-wasm/latest / jsdelivr: https://data.jsdelivr.com/v1/packages/npm/@sqlite.org/sqlite-wasm@3.53.0-build1
- wa-sqlite: https://github.com/rhashimoto/wa-sqlite / jsdelivr: https://data.jsdelivr.com/v1/packages/npm/wa-sqlite@1.0.0
- sql.js: https://github.com/sql-js/sql.js / npm: https://registry.npmjs.org/sql.js/latest / jsdelivr: https://data.jsdelivr.com/v1/packages/npm/sql.js@1.14.2 / bundlephobia API: https://bundlephobia.com/api/size?package=sql.js@1.14.2
- absurd-sql: https://github.com/jlongster/absurd-sql
- DuckDB-WASM: https://github.com/duckdb/duckdb-wasm / npm: https://registry.npmjs.org/@duckdb/duckdb-wasm/latest / jsdelivr: https://data.jsdelivr.com/v1/packages/npm/@duckdb/duckdb-wasm@1.29.0
- OPFS(MDN): https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- caniuse FileSystemHandle: https://caniuse.com/mdn-api_filesystemhandle / caniuse File System Access API(로컬 파일, OPFS와 별개): https://caniuse.com/native-filesystem-api
- GitHub Pages 공식 문서: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- COOP/COEP 우회 서비스워커: https://github.com/gzuidhof/coi-serviceworker
- 이 프로젝트의 기존 솔버 리서치(비교 근거): `docs/research/eco-github.md`
