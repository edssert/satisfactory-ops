-- 게임 데이터 관계 스키마 (ADR-0019)
--
-- 정본은 src/data/**/*.json 이다. 이 스키마는 **검증과 질의**를 위해 그것을 적재한 형태다.
-- .cache/game.db 는 gitignore 대상이며 언제든 JSON에서 다시 만든다.
--
-- 규칙:
--   · 게임 생성 데이터(app/)와 사람이 쓴 데이터(curated/)를 테이블 이름으로 구분하지 않고
--     `source` 열로 구분한다. 어느 행이 어디서 왔는지 질의로 알 수 있어야 한다.
--   · 사람이 쓴 행에는 confidence 를 반드시 둔다.

PRAGMA foreign_keys = ON;

CREATE TABLE item (
  id          TEXT PRIMARY KEY,
  ko          TEXT NOT NULL,
  en          TEXT NOT NULL,
  kind        TEXT,
  form        TEXT,
  is_fluid    INTEGER NOT NULL DEFAULT 0,
  stack_size  INTEGER,
  energy_mj   REAL,
  sink_points INTEGER
);

CREATE TABLE building (
  id            TEXT PRIMARY KEY,
  ko            TEXT NOT NULL,
  en            TEXT NOT NULL,
  category      TEXT,
  power_mw      REAL,
  power_gen_mw  REAL,
  power_exp     REAL,
  unlock_tier   INTEGER,
  -- 배치에 쓰는 실제 치수. mClearanceData 충돌 박스 **합집합** (첫 박스만 읽으면 높이가 틀린다)
  width_m       REAL,
  length_m      REAL,
  -- 하드 클리어런스(CT_Default) 합집합 높이. 배치·층고 계산에 쓴다.
  height_m      REAL,
  -- 굴뚝·안테나(CT_Soft)까지 포함한 실제 높이. 기계 위로 벨트를 지나가게 할 때 걸린다.
  visual_height_m REAL,
  hard_boxes    INTEGER,
  soft_boxes    INTEGER,
  belt_per_min  REAL,
  pipe_m3_per_min REAL,
  extract_per_min REAL,
  somersloop_slots INTEGER,
  power_shard_slots INTEGER
);

CREATE TABLE recipe (
  id            TEXT PRIMARY KEY,
  ko            TEXT NOT NULL,
  en            TEXT NOT NULL,
  duration_sec  REAL NOT NULL,
  is_alternate  INTEGER NOT NULL DEFAULT 0,
  is_building   INTEGER NOT NULL DEFAULT 0,
  in_handcraft  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recipe_io (
  recipe_id  TEXT NOT NULL REFERENCES recipe(id),
  item_id    TEXT NOT NULL REFERENCES item(id),
  role       TEXT NOT NULL CHECK (role IN ('in', 'out')),
  amount     REAL NOT NULL,
  per_minute REAL NOT NULL,
  PRIMARY KEY (recipe_id, item_id, role)
);

CREATE TABLE recipe_machine (
  recipe_id   TEXT NOT NULL REFERENCES recipe(id),
  building_id TEXT NOT NULL,
  PRIMARY KEY (recipe_id, building_id)
);

CREATE TABLE milestone (
  id       TEXT PRIMARY KEY,
  ko       TEXT NOT NULL,
  en       TEXT NOT NULL,
  tier     INTEGER NOT NULL,
  ord      INTEGER NOT NULL,
  time_sec REAL
);

CREATE TABLE milestone_cost (
  milestone_id TEXT NOT NULL REFERENCES milestone(id),
  item_id      TEXT NOT NULL REFERENCES item(id),
  amount       REAL NOT NULL,
  PRIMARY KEY (milestone_id, item_id)
);

CREATE TABLE milestone_unlock (
  milestone_id TEXT NOT NULL REFERENCES milestone(id),
  recipe_id    TEXT NOT NULL,
  PRIMARY KEY (milestone_id, recipe_id)
);

CREATE TABLE resource_node (
  id      TEXT PRIMARY KEY,
  res     TEXT NOT NULL,
  purity  TEXT NOT NULL CHECK (purity IN ('impure', 'normal', 'pure')),
  type    TEXT NOT NULL,
  fx      REAL NOT NULL,
  fy      REAL NOT NULL,
  cell    TEXT NOT NULL,
  is_item INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────── 사람이 쓴 표
--
-- 게임 데이터에 없어서 측정하거나 조사해야 하는 값들. 행마다 출처와 신뢰도를 둔다.

CREATE TABLE building_port (
  building_id TEXT NOT NULL REFERENCES building(id),
  port_index  INTEGER NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('in', 'out')),
  kind        TEXT NOT NULL CHECK (kind IN ('belt', 'pipe')),
  -- 기계 중심을 원점으로 한 상대 좌표(m). face 는 어느 면인가.
  face        TEXT NOT NULL CHECK (face IN ('front', 'back', 'left', 'right', 'top', 'bottom')),
  offset_x_m  REAL,
  offset_y_m  REAL,
  height_m    REAL,
  source      TEXT NOT NULL,
  confidence  TEXT NOT NULL CHECK (confidence IN ('verified', 'consensus', 'disputed', 'assumed', 'unsourced')),
  note        TEXT,
  PRIMARY KEY (building_id, port_index)
);

CREATE TABLE layout_rule (
  key        TEXT PRIMARY KEY,
  value_num  REAL,
  value_text TEXT,
  unit       TEXT,
  why        TEXT NOT NULL,
  source     TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'consensus', 'disputed', 'assumed', 'unsourced')),
  -- 값이 바뀐 이유(정정 이력). 틀린 값을 조용히 덮지 않는다.
  note       TEXT
);

CREATE INDEX idx_recipe_io_item ON recipe_io(item_id, role);
CREATE INDEX idx_node_res ON resource_node(res, purity);
CREATE INDEX idx_milestone_tier ON milestone(tier, ord);
