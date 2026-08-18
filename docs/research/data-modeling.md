# 관계형 모델링 — 정규화 스키마와 재귀 CTE 실사 (2026-08 조사)

> 담당: 데이터 엔지니어링 리서처 | 범위: 게임 레퍼런스 데이터의 정규화 스키마 설계, 재귀 CTE로 생산 체인을 실제로 풀어 검증, 좌표 데이터 공간 인덱싱.
> 자매 문서: `data-clientside.md`(런타임 저장소 결론: JS 메모리+Map), `data-server-sql.md`(사용자 동기화용 서버 DB). 이 문서는 그 두 문서가 다루지 않은 **"관계형으로 모델링하면 어떤 모양이 나오는가"와 "재귀 CTE가 실제로 정답을 내는가"를 검증**하는 데 집중한다.

## 결론 먼저

1. **정규화 스키마 자체는 유효하고 유용하다** — 단, **런타임 SQL 엔진이 아니라 "데이터 저작/검증 단계의 개념 모델"로**. `items/recipes/recipe_inputs/recipe_outputs/buildings/milestones/milestone_costs/unlocks`를 관계형으로 짜두면 무결성 제약(FK, CHECK)으로 데이터 오류를 빌드 타임에 잡아낼 수 있다. 빌드 스크립트에서 SQLite(Python `sqlite3`, Node `better-sqlite3` 등 네이티브 바인딩)로 이 스키마를 만들고 검증한 뒤, 최종 산출물은 이 관계를 그대로 반영한 정적 JSON으로 내보내면 된다.
2. **`WITH RECURSIVE`는 실제로 동작한다 — 실사로 검증했다.** 아래 4장의 SQL은 Python 3.13 내장 SQLite 3.50.4에서 직접 실행해 결과를 확인했다(의사코드 아님).
3. **그러나 순환 레시피(Recycled Plastic ↔ Recycled Rubber)에서 "경로 기반 방문 집합으로 재귀를 끊는" 표준 기법은 무한루프는 막지만 값이 틀린다.** 실제로 두 대체 레시피를 함께 선택한 케이스를 SQL로 재현했더니, 원광 소요량이 **67.5/min(경로 차단 시) vs 90/min(연립방정식으로 푼 실제 정답)**으로 **25% 과소 계산**됐다(4-3절, 손으로 검산 완료). 이건 "무한루프 방지 로직이 필요하다"보다 더 강한 문제로, **재귀 CTE(그리고 동일한 방식의 JS DFS)는 진짜 닫힌 루프의 정상상태(steady state)를 원천적으로 풀 수 없다** — 이건 선형연립방정식/LP의 영역이다.
4. **satisfactorytools(satisfactory-calculator.com의 실제 엔진)를 소스코드까지 조사한 결과, 클라이언트 저장소에는 LP/simplex 로직이 전혀 없다.** `Solver.ts`는 `https://api.satisfactorytools.com/v2/solver`로 axios POST만 보내는 API 클라이언트일 뿐이다 — 즉 **업계에서 가장 정교한 이 도구조차 최적화 계산은 서버로 넘긴다.** 서버 없는 이 프로젝트에서 동일 수준의 LP를 흉내내려면 클라이언트에 심어야 하는데, 아래 5장에서 그 비용(번들 크기)과 실제 필요성(사용자가 이미 대체 레시피를 직접 고르는 구조)을 근거로 **불필요하다**고 판단한다.
5. **좌표 데이터(약 1,970개 포인트)에 R-tree 공간 인덱스는 과잉이다.** SQLite 네이티브에는 R-tree 모듈이 있지만(6장, 직접 테스트 확인), **브라우저에서 쓰는 sql.js WASM 빌드는 R-tree를 컴파일에 넣지 않는다**(GitHub 이슈로 확인, 커스텀 빌드 필요). 이 규모에서는 그냥 그리드 버킷 + 선형 스캔이 낫다.

---

## 1. 정규화 스키마 — DDL

8개 참조 테이블 + 2개 사용자 오버레이 테이블. SQLite 방언(브라우저에서 쓰겠다는 뜻이 아니라, **빌드 스크립트에서 데이터 검증용으로 돌리기 위한 방언** — 3장 참고).

```sql
CREATE TABLE items (
  item_id      TEXT PRIMARY KEY,                 -- 'iron-plate'
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('raw','part','fluid','equipment')),
  sink_value   INTEGER,                            -- AWESOME Sink 포인트, 없으면 NULL
  stack_size   INTEGER
);

CREATE TABLE buildings (
  building_id   TEXT PRIMARY KEY,                 -- 'constructor'
  name          TEXT NOT NULL,
  power_mw      REAL,                              -- 기본 소비 전력(가변 전력 건물은 min/max 별도 컬럼 필요 — 생략)
  building_type TEXT NOT NULL CHECK (building_type IN ('manufacturer','extractor','generator','logistics'))
);

CREATE TABLE recipes (
  recipe_id     TEXT PRIMARY KEY,                 -- 'alt-recycled-rubber'
  name          TEXT NOT NULL,
  building_id   TEXT NOT NULL REFERENCES buildings(building_id),
  craft_time_s  REAL NOT NULL CHECK (craft_time_s > 0),
  is_alternate  INTEGER NOT NULL DEFAULT 0 CHECK (is_alternate IN (0,1))
);

-- 레시피의 입력/출력을 별도 테이블로 분리 = 다대다 관계의 정규화.
-- 한 레시피가 여러 입력/부산물(byproduct)을 가질 수 있고(Plastic 표준 레시피가
-- Plastic + Heavy Oil Residue를 동시에 출력하는 식), 한 아이템을 여러 레시피가
-- 만들 수 있다(recipe_outputs.item_id 에 대해 다대다) — 이게 "여러 레시피가 한
-- 아이템을 만들 수 있다"는 요구사항을 충족하는 지점이다.
CREATE TABLE recipe_inputs (
  recipe_id     TEXT NOT NULL REFERENCES recipes(recipe_id),
  item_id       TEXT NOT NULL REFERENCES items(item_id),
  qty_per_cycle REAL NOT NULL CHECK (qty_per_cycle > 0),
  PRIMARY KEY (recipe_id, item_id)
);

CREATE TABLE recipe_outputs (
  recipe_id     TEXT NOT NULL REFERENCES recipes(recipe_id),
  item_id       TEXT NOT NULL REFERENCES items(item_id),
  qty_per_cycle REAL NOT NULL CHECK (qty_per_cycle > 0),
  PRIMARY KEY (recipe_id, item_id)
);

CREATE TABLE milestones (
  milestone_id  TEXT PRIMARY KEY,                 -- 'tier3-coal-power'
  tier          INTEGER NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL
);

CREATE TABLE milestone_costs (
  milestone_id  TEXT NOT NULL REFERENCES milestones(milestone_id),
  item_id       TEXT NOT NULL REFERENCES items(item_id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (milestone_id, item_id)
);

-- 마일스톤이 무엇을 풀어주는가(레시피/건물/슬롯) — 다형 참조(polymorphic reference)라
-- FK 제약을 걸 수 없다는 게 이 설계의 유일한 약점. unlock_type별로 별도 테이블(unlocks_recipe,
-- unlocks_building)로 쪼개면 FK를 완전히 걸 수 있지만, 마일스톤 45개 규모에서는 실익이 적어
-- 애플리케이션 레벨 검증(빌드 스크립트에서 unlock_ref가 실제 recipe_id/building_id에 존재하는지
-- 대조)으로 대체하는 편이 실용적이다.
CREATE TABLE unlocks (
  milestone_id  TEXT NOT NULL REFERENCES milestones(milestone_id),
  unlock_type   TEXT NOT NULL CHECK (unlock_type IN ('recipe','building')),
  unlock_ref    TEXT NOT NULL,
  PRIMARY KEY (milestone_id, unlock_type, unlock_ref)
);

-- ── 사용자 오버레이 (참조 데이터와 분리 저장. data-server-sql.md §5 스키마와 1:1 대응) ──

-- "이 아이템을 만들 때 어떤 레시피를 쓸지" 사용자가 고른 값.
-- 값이 없으면 기본 레시피(is_alternate=0)를 쓴다 — effective_recipe 뷰(2장)가 이 우선순위를 구현.
CREATE TABLE user_recipe_selection (
  item_id       TEXT PRIMARY KEY REFERENCES items(item_id),
  recipe_id     TEXT NOT NULL REFERENCES recipes(recipe_id)
);

CREATE TABLE user_milestones (
  milestone_id  TEXT PRIMARY KEY REFERENCES milestones(milestone_id),
  completed_at  TEXT
);
```

**설계 근거**
- `recipe_inputs`/`recipe_outputs`를 각각 별도 테이블로 둔 이유: 레시피:아이템이 입력/출력 양쪽 다 다대다이기 때문. `recipes` 테이블에 컬럼으로 박으면(예: `input1_item, input1_qty, input2_item, ...`) 레시피마다 입력 개수가 다른 걸(1~4개) 감당 못 한다 — 1NF 위반의 전형적 사례.
- "한 아이템 → 여러 레시피"는 스키마가 이미 자연스럽게 허용한다: `recipe_outputs`에서 같은 `item_id`를 가진 행이 여러 `recipe_id`에 걸쳐 존재하면 그게 표준 레시피 + 대체 레시피들이다. 별도의 "대체 레시피 매핑 테이블"이 필요 없다 — `recipes.is_alternate` 플래그와 `recipe_outputs`의 자연스러운 다대다 구조로 충분하다.
- 사용자가 어떤 레시피를 쓸지 고르는 구조는 **"아이템 하나당 레시피 하나를 고르는 오버레이 테이블"**(`user_recipe_selection`)로 표현한다. 참조 데이터(`recipes`)와 사용자 데이터를 물리적으로 분리해두면(파일도 따로, 저장소도 따로) 게임 업데이트로 참조 데이터가 바뀌어도 사용자 데이터를 건드릴 필요가 없다 — `data-clientside.md` §4가 다루는 마이그레이션 문제와도 맞물린다.
- 어떤 레시피가 "유효 레시피"인지 결정하는 로직(사용자 선택이 있으면 그것, 없으면 기본값)은 아래처럼 뷰로 캡슐화한다:

```sql
CREATE VIEW effective_recipe AS
SELECT i.item_id,
       COALESCE(
         u.recipe_id,
         (SELECT ro.recipe_id FROM recipe_outputs ro
            JOIN recipes rr ON rr.recipe_id = ro.recipe_id
           WHERE ro.item_id = i.item_id AND rr.is_alternate = 0
           LIMIT 1)
       ) AS recipe_id
FROM items i
LEFT JOIN user_recipe_selection u ON u.item_id = i.item_id;
```

주의: 이 `LIMIT 1` 폴백은 시연용 단순화다. 실제 게임 데이터에는 "표준 레시피가 여러 개"(예: Biomass 계열)이거나 "부산물이라 직접 만드는 표준 레시피가 없는" 아이템(Heavy Oil Residue 등)이 존재한다 — 실제 구현에서는 이런 아이템에 우선순위 컬럼(`recipes.is_default`)을 명시적으로 데이터에 박아 폴백 로직의 애매함을 없애야 한다.

---

## 2. 재귀 CTE — 정상 케이스 (실행 검증됨)

아래는 Python 3.13 내장 SQLite 3.50.4에서 **실제로 실행해 얻은 결과**다(스크립트: 프로젝트 외부 스크래치패드에 보관, 재현 가능). 스키마는 1장 그대로 사용하고, Reinforced Iron Plate 생산 체인(비순환)으로 검증했다.

```sql
WITH RECURSIVE chain(depth, item_id, recipe_id, rate_per_min, path) AS (
  -- 기저: 목표 아이템을 목표 산출량(rate/min)만큼 만든다
  SELECT
    0,
    :root_item,
    er.recipe_id,
    :root_rate,
    '/' || :root_item
  FROM effective_recipe er
  WHERE er.item_id = :root_item

  UNION ALL

  -- 재귀: 현재 노드가 쓰는 레시피의 입력들을 비율만큼 전개
  SELECT
    c.depth + 1,
    ri.item_id,
    er2.recipe_id,
    ri.qty_per_cycle / ro.qty_per_cycle * c.rate_per_min,   -- BOM 비율 스케일링 (craft_time은 상쇄되어 무관)
    c.path || '/' || ri.item_id
  FROM chain c
  JOIN recipe_outputs ro ON ro.recipe_id = c.recipe_id AND ro.item_id = c.item_id
  JOIN recipe_inputs  ri ON ri.recipe_id = c.recipe_id
  LEFT JOIN effective_recipe er2 ON er2.item_id = ri.item_id
  WHERE c.recipe_id IS NOT NULL                              -- 원료(레시피 없음)면 더 전개하지 않음
    AND c.depth < 30                                         -- ① 하드 깊이 제한(SQLite 공식 권고: "항상 LIMIT을 안전장치로")
    AND instr(c.path || '/', '/' || ri.item_id || '/') = 0    -- ② 방문 집합: 자기 경로(조상)에 이미 있으면 확장 중단
  LIMIT 100000                                                 -- ③ 총 행수 상한(SQLite 문서가 명시적으로 권고하는 안전장치)
)
SELECT depth, item_id, recipe_id, round(rate_per_min, 4) AS rate_per_min
FROM chain
ORDER BY depth, item_id;
```

**실행 결과** (Reinforced Iron Plate @ 5/min):

| depth | item_id | recipe_id | rate_per_min |
|---|---|---|---|
| 0 | reinforced-iron-plate | r-rip | 5.0 |
| 1 | iron-plate | r-iron-plate | 30.0 |
| 1 | screw | r-screw | 60.0 |
| 2 | iron-ingot | r-iron-ingot | 45.0 (iron-plate 경유) |
| 2 | iron-ingot | r-iron-ingot | 15.0 (screw 경유) |
| 3 | iron-ore | NULL | 45.0 |
| 3 | iron-ore | NULL | 15.0 |

**다이아몬드(재사용) 구조가 정확히 보존됨**을 확인: Iron Ingot이 Iron Plate 경로와 Screw 경로 양쪽에서 각각 다른 비율로 재등장하고(45+15=60개의 Iron Ingot 필요), 이건 순환이 아니라 정상적인 DAG의 다이아몬드 의존이므로 방문 집합 체크(`instr` 조건)에 걸리지 않는다 — **경로별로 독립된 `path` 문자열을 물려받기 때문**이다. 원자재 롤업은 다음 한 줄로 얻는다:

```sql
SELECT item_id, round(SUM(rate_per_min), 4) AS total_per_min
FROM chain
WHERE recipe_id IS NULL
GROUP BY item_id;
-- → iron-ore: 60.0
```

### 순환 방지 3중 장치 정리

| 장치 | SQLite 구문 | 막는 것 |
|---|---|---|
| 방문 집합(경로 기반) | `instr(path\|\|'/', '/'\|\|item\|\|'/') = 0` | **같은 계보(조상-자손) 안에서** 아이템 재방문 — 진짜 순환만 차단, 다이아몬드는 통과 |
| 깊이 상한 | `WHERE depth < N` | 방문 집합 로직 자체에 버그가 있어도 무한 재귀로 가지 않게 하는 2차 방어선 |
| 행수 상한 | 컴파운드 SELECT 끝의 `LIMIT` | SQLite 공식 문서가 "WHERE로 종료를 보장하기 어려운 복잡한 쿼리에서도 LIMIT은 반드시 재귀를 멈춘다"고 명시한 최종 안전장치 |
| (참고) `UNION` vs `UNION ALL` | `UNION`은 중복 행 제거로 순환을 자동 차단 | 이 쿼리는 `UNION ALL`을 쓴다 — 같은 아이템이라도 `rate_per_min`이 다르면 다른 행이라 `UNION`의 중복 제거가 안 통하기 때문. 방문 집합 로직이 그 자리를 대신한다 |

출처: SQLite `WITH RECURSIVE` 공식 문서(https://www.sqlite.org/lang_with.html) — "it is good practice to always include a LIMIT clause as a safety", "UNION is used instead of UNION ALL to prevent the recursion from entering an infinite loop if the graph contains cycles."

PostgreSQL을 쓴다면 SQL:2003 표준의 `CYCLE ... SET ... USING ...` 절이 위 경로-문자열 트릭을 대체한다(PostgreSQL 공식 문서, https://www.postgresql.org/docs/current/queries-with.html):

```sql
WITH RECURSIVE search_graph(id, link, depth) AS (
    SELECT g.id, g.link, 1 FROM graph g
  UNION ALL
    SELECT g.id, g.link, sg.depth + 1
    FROM graph g, search_graph sg WHERE g.id = sg.link
) CYCLE id SET is_cycle USING path
SELECT * FROM search_graph;
```
SQLite에는 이 표준 절이 없어 위처럼 문자열 경로를 손으로 구현해야 한다.

---

## 3. 재귀 CTE — 순환 레시피 케이스 (여기서 진짜 문제가 드러난다)

Satisfactory Wiki에서 실제 수치를 확인했다(https://satisfactory.wiki.gg/wiki/Rubber):

| 레시피 | 입력 | 출력 |
|---|---|---|
| Recycled Rubber (대체) | Plastic 6 + Fuel 6 | Rubber 12 |
| Recycled Plastic (대체) | Rubber 6 + Fuel 6 | Plastic 12 |

두 대체 레시피를 **동시에 선택**하면(사용자가 "고무는 Recycled Rubber로, 플라스틱은 Recycled Plastic로" 둘 다 고르는, 실제로 있을 법한 설정) Rubber↔Plastic 순환이 만들어진다. 2장과 동일한 쿼리를 Rubber @ 60/min에 돌린 실제 결과:

| depth | item_id | recipe_id | rate_per_min | path |
|---|---|---|---|---|
| 0 | rubber | alt-recycled-rubber | 60.0 | /rubber |
| 1 | plastic | alt-recycled-plastic | 30.0 | /rubber/plastic |
| 1 | fuel | r-fuel | 30.0 | /rubber/fuel |
| 2 | fuel | r-fuel | 15.0 | /rubber/plastic/fuel |
| 2 | crude-oil | NULL | 45.0 | /rubber/fuel/crude-oil |
| 3 | crude-oil | NULL | 22.5 | /rubber/plastic/fuel/crude-oil |

**depth 2에서 `rubber`가 다시 등장해야 하는데(Recycled Plastic 레시피가 Rubber 6을 입력으로 요구) 통째로 빠져 있다** — `instr` 조건이 `/rubber/plastic/` 안에 이미 `/rubber/`가 있는 걸 감지해 그 행 자체를 생성하지 않았기 때문이다. 무한루프는 확실히 막았지만, **plastic을 만드는 데 필요한 rubber 6개/cycle의 수요 자체가 결과에서 통째로 사라졌다.**

### 3-1. 손으로 검산한 정답

이 루프의 실제 정상상태(steady state)는 연립방정식이다. Rubber 순생산량을 60/min으로 고정하고, Plastic은 전량 Rubber 재생산에 재투입한다고 하면:

```
R = Recycled Rubber 레시피 처리량(rubber 산출 기준, /min)
P = Recycled Plastic 레시피 처리량(plastic 산출 기준, /min)

P = 0.5 R           (Recycled Rubber가 plastic 6개당 rubber 12개 → plastic 소모 = 0.5R)
순생산 rubber = R - 0.5P = R - 0.25R = 0.75R = 60  →  R = 80, P = 40

fuel 소요 = 0.5R(=40, Recycled Rubber용) + 0.5P(=20, Recycled Plastic용) = 60/min
crude-oil 소요 = fuel 60/min × (6 oil / 4 fuel) = 90/min
```

**정답은 crude-oil 90/min, SQL 재귀 CTE(경로 차단)의 답은 67.5/min — 25% 과소 계산.** 이건 버그가 아니라 **재귀 CTE(그리고 동일한 로직의 순수 JS DFS + visited Set)라는 접근법 자체의 한계**다: 트리 순회는 나무(DAG)를 펼치는 데는 완벽하지만, 진짜 사이클의 정상상태는 "무한히 접어야 할 급수의 극한"이라 유한 깊이 순회로는 원리적으로 못 푼다(등비급수 합 공식과 동치 — 위 계산에서 `0.75R=60`으로 접힌 것이 바로 그 극한).

### 3-2. 그래서 실무적으로 어떻게 하나

- **가장 현실적인 답: 감지해서 경고하고 막는다.** 위 시나리오(Rubber↔Plastic 대체 레시피 둘 다 선택)는 실제로는 **사용자 실수**에 가깝다 — 두 대체 레시피는 "석유를 고무/플라스틱으로 바꾸는 대체 경로"로서 서로 경쟁 관계지, 체인으로 묶어 쓸 이유가 없다. `instr` 기반 순환 감지가 이미 사이클의 *존재*는 정확히 찾아내므로(3장 표에서 `rubber`가 조상 경로에 있다는 걸 알아냄), 그 신호를 "0으로 자르고 계속 진행"이 아니라 **"UI에 경고 배지 표시 + 해당 지점 이후 rate를 NULL로 남겨 사용자가 인지하게"** 하는 게 맞는 제품 결정이다. `data-clientside.md`의 `resolveChain` 예시가 `isCycleBoundary: true`를 리턴하는 것도 같은 철학이다.
- **진짜로 닫힌 루프의 최적 처리량을 풀어야 한다면** → 2×2(또는 N×N) 선형연립방정식이므로 SQL도 JS DFS도 아니라 **작은 선형대수**(또는 그 일반화인 LP)가 맞는 도구다. 이 앱 규모(사이클에 관여하는 아이템이 기껏해야 2~4개)에서는 라이브러리 없이 직접 가우스 소거를 20줄 안팎으로 짜는 게 `javascript-lp-solver`(5장) 전체를 들이는 것보다 싸다.

---

## 4. 재귀 CTE vs 애플리케이션 그래프 순회 vs LP 솔버

| 기준 | 재귀 CTE (SQL) | 앱 코드 그래프 순회 (JS DFS+memo) | LP 솔버 (simplex 등) |
|---|---|---|---|
| **이 앱에 필요한 전제** | 데이터가 SQL 엔진 안에 있어야 함(서버 DB 또는 sql.js) | 데이터가 메모리 객체/Map이면 충분 — 이미 그렇게 로드됨 | 목적함수+제약을 정식화할 별도 모델링 계층 필요 |
| **DAG(비순환) 전개** | 잘 됨 — 2장에서 검증 | 잘 됨, 동일 결과 | 과잉 — 굳이 최적화할 게 없는 결정론적 계산에 심플렉스를 돌리는 격 |
| **순환(닫힌 루프) 처리** | 방문집합으로 무한루프는 막지만 **값이 틀림**(3장) | SQL과 동일한 한계 — 알고리즘이 사실상 같음(`instr` path ≒ `visiting` Set) | **유일하게 정확한 정상상태를 구조적으로 풀 수 있음**(연립방정식이 LP의 특수 케이스) |
| **"어떤 레시피 쓸지"가 이미 정해져 있을 때(이 앱의 실제 상황: 사용자가 대체 레시피 ~90건을 직접 선택)** | 트리 전개만 하면 되므로 충분 | 충분, 오히려 더 간단 | **불필요** — 선택할 게 없으면 최적화 문제 자체가 성립하지 않음 |
| **"이 목표 산출량을 최소 건물/전력으로 어떻게 배분할까"를 앱이 자동으로 골라주려는 경우** | 부적합 | 부적합(휴리스틱 짜야 함) | **적합 — 이게 LP의 원래 용도** |
| **실행 위치** | 서버 DB 또는 클라이언트 WASM SQL 엔진 | 브라우저 메인 스레드, 의존성 0 | 클라이언트 라이브러리(수십~수백KB) 또는 서버 |
| **satisfactorytools의 실제 선택** (아래 실사) | 안 씀 | 화면에 그래프 시각화(cytoscape/elkjs)는 쓰지만 그건 렌더링용이지 계산 로직 아님 | **씀 — 단, 서버(`api.satisfactorytools.com`)에서** |

### satisfactorytools 실사 결과

GitHub `greeny/SatisfactoryTools`(satisfactory-calculator.com의 실제 소스, https://github.com/greeny/SatisfactoryTools)를 직접 열어 확인했다:

- `package.json`에 `glpk.js`, `javascript-lp-solver`, `lp_solve` 등 LP 라이브러리 **없음**. 대신 `cytoscape`, `elkjs`, `vis-network` — 전부 **그래프 시각화용**이지 계산 로직이 아니다.
- `src/Solver/Solver.ts`의 전체 로직은 다음이 사실상 전부다: `axios.post('https://api.satisfactorytools.com/v2/solver', productionRequest)`. **클라이언트 저장소에는 심플렉스/그래프 순회 로직 자체가 없다** — 최적화 계산을 통째로 서버 API로 위임한다.
- PHP 백엔드가 별도로 존재(README에 PHP 7.1+ 요구사항 명시)한다는 것도 "서버 없이는 이 수준의 최적화를 못 한다"는 방증이다.

**해석**: 이 바닥에서 가장 널리 쓰이는 도구조차 "여러 목표를 동시에 만족시키는 최적 대체 레시피 조합을 자동으로 찾아줘" 같은 진짜 LP 문제는 서버에 위임했다. 이 프로젝트는 GitHub Pages 정적 호스팅(서버 없음)이 전제이고, 사용자 데이터 규모(대체 레시피 선택 ~90건)를 보면 **"레시피는 사용자가 이미 고른다"는 설계**다 — 즉 애초에 LP가 풀어야 할 "최적 조합 탐색" 문제 자체가 이 앱에는 없다. 남는 건 "고른 레시피대로 전개하면 얼마나 필요한가"라는 결정론적 BOM 전개뿐이고, 이건 표에서 보듯 JS 그래프 순회로 충분하다.

### 클라이언트에서 SQL/LP를 쓴다면 드는 비용 (번들 크기 실측)

| 구성요소 | 크기 | 확인 방법 |
|---|---|---|
| sql.js WASM (`sql-wasm.wasm`) | **660 kB** | unpkg 파일 리스팅 실측(sql.js@1.13.0) |
| sql.js JS 글루 코드(`sql-wasm.js`) | 48.8 kB | 〃 |
| **sql.js 합계** | **~709 kB** | 게임 데이터 전체(1~5MB)의 15~70%에 맞먹는 순수 엔진 비용 |
| javascript-lp-solver (`prod/`) | **~89.4 kB** | unpkg 파일 리스팅 실측(v0.4.24) — 순수 JS 심플렉스, 비교적 가벼움 |

출처: https://app.unpkg.com/sql.js@1.13.0/files/dist , https://app.unpkg.com/javascript-lp-solver@0.4.24/files , https://github.com/sql-js/sql.js

**결론**: 709KB짜리 WASM SQL 엔진을 순전히 "레시피 트리 전개"(재귀 CTE 없이도 JS 재귀 함수 20줄로 되는 일)를 위해 들이는 건 명백한 과잉이다. `javascript-lp-solver`(89KB)는 상대적으로 싸지만, 애초에 이 앱에 최적화 대상(4장 표의 "자동으로 골라주려는 경우")이 없으므로 역시 불필요 — `data-clientside.md`의 결론과 일치한다.

---

## 5. 좌표 데이터 — 공간 인덱스가 필요한가

자원 노드 460 + 자원정 118 + 간헐천 31 + 슬러그 1242 + 하드드라이브 118 = **총 1,969개 좌표 포인트**.

### 5-1. SQLite R-tree — 있고, 동작도 확인했지만

SQLite는 R\*Tree(Beckmann et al. 1990) 기반 공간 인덱스를 가상 테이블로 제공한다(https://www.sqlite.org/rtree.html):

```sql
CREATE VIRTUAL TABLE node_index USING rtree(
   id,              -- 정수 PK
   minX, maxX,      -- 2D 바운딩 박스 (포인트면 minX=maxX)
   minY, maxY
);

-- 반경 검색 예: 플레이어 좌표 (px,py) 주변 사각형 범위의 노드
SELECT id FROM node_index
 WHERE minX <= :px + 5000 AND maxX >= :px - 5000
   AND minY <= :py + 5000 AND maxY >= :py - 5000;
```

Python 내장 SQLite(3.50.4)에서 `CREATE VIRTUAL TABLE ... USING rtree(...)`를 **직접 실행해 동작을 확인**했다 — 즉 R-tree 자체는 실재하고, "수백만 건 중 후보를 수십 건으로 줄여주는" 용도로 설계되어 있다는 게 공식 문서 표현이다.

### 5-2. 그런데 브라우저(sql.js)에는 없다

GitHub `sql-js/sql.js` 이슈 트래커를 확인한 결과, **R-tree 모듈(`SQLITE_ENABLE_RTREE`)이 기본 WASM 빌드에 컴파일되어 있지 않다** — "How to turn on and use rtree spatial?"(#390) 같은 이슈가 해결되지 않은 채 남아 있고, 쓰려면 sql.js를 직접 커스텀 빌드해야 한다. 즉 "서버 없이 브라우저에서 SQLite+R-tree"라는 조합 자체가 기성 패키지로는 안 되는 조합이다.

### 5-3. 1,969개면 애초에 인덱스가 필요 없다

R-tree(또는 쿼드트리 등 어떤 공간 인덱스든)가 정당화되는 지점은 "선형 스캔이 체감되게 느려지는 규모"인데, 최신 JS 엔진에서 2,000개 미만 배열의 `Array.filter`는 실무적으로 서브 밀리초다. 이 앱에 맞는 실전 패턴:

```javascript
// 빌드 타임에 그리드 버킷으로 사전 분류 (100m x 100m 셀 등, 게임 좌표계에 맞춰 조정)
function buildGridIndex(points, cellSize = 10000) {
  const grid = new Map(); // key: "gx,gy" → 좌표 배열
  for (const p of points) {
    const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)).push(p);
  }
  return grid;
}

// 조회: 인접 3x3 셀만 훑고, 그 안에서 정확 거리 필터
function queryNear(grid, cellSize, x, y, radius) {
  const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const cell = grid.get(`${gx+dx},${gy+dy}`);
    if (!cell) continue;
    for (const p of cell) if ((p.x-x)**2 + (p.y-y)**2 <= radius*radius) out.push(p);
  }
  return out;
}
```

이 그리드 버킷은 R-tree의 "바운딩 박스로 후보 좁히기"와 개념적으로 동일한 일을 하지만, 별도 엔진/WASM 없이 순수 JS 20줄로 끝난다. 지도 UI가 "화면에 보이는 영역만 렌더링"(뷰포트 컬링) 용도로 쓰기에 충분하고, 1,969개 규모에서는 사실 그리드조차 없이 전체 선형 스캔 + `filter`만 해도 체감차가 없다 — 그리드는 "혹시 나중에 포인트가 수만 개로 늘어날 때"를 위한 여유 설계 정도로 보면 된다.

**결론: 좌표 데이터에 R-tree/SQLite는 불필요.** `data-clientside.md`가 이미 결론 낸 "좌표도 정적 JSON + 메모리"에 공간 인덱스 관점에서도 근거가 추가된 것 — 인덱스가 필요할 규모(수백만 건)에도 못 미치고, 설령 필요해져도 브라우저에서 R-tree를 쓰려면 sql.js 커스텀 빌드라는 비표준 경로를 타야 한다.

---

## 6. 종합 권고

| 층위 | 권고 | 근거 |
|---|---|---|
| 게임 참조 데이터의 **개념 모델** | 1장의 정규화 스키마(8테이블)를 **빌드 스크립트 단계의 검증 도구**로 채택 — Node/Python에서 실제 SQLite에 로드해 FK/CHECK 위반을 CI에서 잡고, 최종 배포물은 이 관계를 반영한 정적 JSON으로 내보낸다 | 정규화가 주는 무결성 이득은 "저작 시점"에 가장 크고, "런타임"에는 대가(709KB WASM, 5장)만 크다 |
| 생산 체인 전개 **런타임 로직** | JS 재귀 함수 + memo + visiting Set(`data-clientside.md`의 예시와 동일 알고리즘) | 재귀 CTE로 실제 검증해보니(2~3장) SQL이라고 더 정확하거나 간단하지 않았다 — 순환 처리 한계까지 동일 |
| 순환 레시피 | "감지 → UI 경고 + 그 지점 이후 미확정 표시", 정말 필요하면 국소적 연립방정식(2~4변수) | 3-1절 손검산으로 경로 차단 방식의 25% 과소계산을 실증 — 트리 순회 계열 알고리즘(SQL이든 JS든) 공통의 구조적 한계이므로 알고리즘을 바꿔야 함 |
| 최적 레시피 조합 자동 탐색(LP) | **도입하지 않는다** | 이 앱은 사용자가 대체 레시피를 직접 고르는 구조(요구사항 자체에 명시)라 LP가 풀 문제가 없다. 업계 최고 도구(satisfactorytools)도 이 계산을 서버로 위임했는데, 이 프로젝트는 서버가 없다 |
| 좌표 공간 질의 | 그리드 버킷(순수 JS) 또는 선형 스캔 | 1,969개는 R-tree가 정당화되는 규모의 한참 아래이고, 브라우저 R-tree는 비표준 빌드가 필요 |

**핵심 한 줄**: 관계형 스키마는 "데이터를 올바르게 설계하는 사고 도구"로서는 이 프로젝트에 확실히 값어치가 있지만, 그 스키마를 **실행하는 엔진**(SQL이든 LP든)을 런타임에 들이는 순간 이 프로젝트의 전제(서버 없음, 1~5MB 데이터, 사용자가 이미 레시피를 고르는 구조)와 충돌한다 — 이번 조사로 "왜 그런지"를 실측 SQL·번들 크기·소스코드 조사로 구체화했다.

**조사 시 실행한 스크립트**: `test_recursive_cte.py`(Python 3.13 + 내장 SQLite 3.50.4로 2~3장의 모든 쿼리를 실제 실행해 결과 확인 — 재현 가능, 별도 의존성 없음).

**출처**
- https://github.com/greeny/SatisfactoryTools (소스코드, package.json, src/Solver/Solver.ts 직접 확인)
- https://www.sqlite.org/lang_with.html (WITH RECURSIVE 공식 문서)
- https://www.postgresql.org/docs/current/queries-with.html (CYCLE/SEARCH 절)
- https://www.sqlite.org/rtree.html (R-tree 모듈)
- https://github.com/sql-js/sql.js (issues 검색: R-tree 미지원 확인)
- https://app.unpkg.com/sql.js@1.13.0/files/dist , https://app.unpkg.com/javascript-lp-solver@0.4.24/files (번들 크기 실측)
- https://satisfactory.wiki.gg/wiki/Rubber (Recycled Rubber/Recycled Plastic 정확한 수치)
