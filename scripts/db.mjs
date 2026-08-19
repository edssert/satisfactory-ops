#!/usr/bin/env node
/**
 * db.mjs — JSON 정본을 SQLite로 적재해 **관계 검증**과 **개발 질의**에 쓴다. (ADR-0019)
 *
 * 정본은 src/data/**\/*.json 이다. 이 스크립트는 그것을 읽어 .cache/game.db 를 만든다.
 * DB는 커밋하지 않는다 — 언제든 JSON에서 다시 만든다.
 *
 * 왜 필요한가:
 *   손으로 큐레이션하는 표(포트 위치, 배치 규칙)가 늘고 서로를 참조하기 시작했다.
 *   참조가 깨지는 사고가 실제로 났다 — 노드 데이터의 '철광석'과 게임의 '철 광석'을
 *   한글 이름으로 조인해 화면에 "근처에 노드 없음"이 떴다. 외래 키로 잡을 문제였다.
 *
 * 사용법:
 *   node scripts/db.mjs                 적재 + 검증
 *   node scripts/db.mjs --check         검증만 (CI)
 *   node scripts/db.mjs "SELECT ..."    질의
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const APP = path.join(ROOT, 'src/data/app');
const CURATED = path.join(ROOT, 'src/data/curated');
const CACHE = path.join(ROOT, '.cache');
const DB_PATH = path.join(CACHE, 'game.db');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const query = argv.find((a) => /^\s*(select|with|pragma|explain)/i.test(a));

const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const log = (...a) => console.log(...a);
const bool = (v) => (v ? 1 : 0);

function build() {
  fs.mkdirSync(CACHE, { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  const db = new DatabaseSync(DB_PATH);
  db.exec(fs.readFileSync(path.join(ROOT, 'scripts/db-schema.sql'), 'utf8'));

  const items = read(APP, 'items.json');
  const buildings = read(APP, 'buildings.json');
  const recipes = read(APP, 'recipes.json');
  const milestones = read(APP, 'milestones.json');
  const nodes = read(APP, 'resource-nodes.json').nodes;

  const ins = (sql) => db.prepare(sql);

  const itemIns = ins(
    'INSERT INTO item (id,ko,en,kind,form,is_fluid,stack_size,energy_mj,sink_points) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  for (const i of items) {
    itemIns.run(i.id, i.ko, i.en, i.kind ?? null, i.form ?? null, bool(i.isFluid), i.stackSize ?? null, i.energyMJ ?? null, i.sinkPoints ?? null);
  }

  const bIns = ins(
    `INSERT INTO building (id,ko,en,category,power_mw,power_gen_mw,power_exp,unlock_tier,
      width_m,length_m,height_m,visual_height_m,hard_boxes,soft_boxes,
      belt_per_min,pipe_m3_per_min,extract_per_min,somersloop_slots,power_shard_slots)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const b of buildings) {
    bIns.run(
      b.id, b.ko, b.en, b.category ?? null, b.powerMW ?? null, b.powerGenMW ?? null,
      b.powerExponent ?? null, b.unlockTier ?? null,
      b.footprint?.widthM ?? null, b.footprint?.lengthM ?? null, b.footprint?.heightM ?? null,
      b.footprint?.visualHeightM ?? null, b.footprint?.hardBoxes ?? null, b.footprint?.softBoxes ?? null,
      b.beltItemsPerMinute ?? null, b.pipeFlowM3PerMinute ?? null,
      b.extraction?.perMinuteAtNormalPurity ?? null,
      b.somersloopSlots ?? null, b.powerShardSlots ?? null
    );
  }

  const rIns = ins('INSERT INTO recipe (id,ko,en,duration_sec,is_alternate,is_building,in_handcraft) VALUES (?,?,?,?,?,?,?)');
  const ioIns = ins('INSERT OR IGNORE INTO recipe_io (recipe_id,item_id,role,amount,per_minute) VALUES (?,?,?,?,?)');
  const rmIns = ins('INSERT OR IGNORE INTO recipe_machine (recipe_id,building_id) VALUES (?,?)');
  for (const r of recipes) {
    rIns.run(r.id, r.ko, r.en, r.durationSec, bool(r.isAlternate), bool(r.isBuildingRecipe), bool(r.inHandcraft));
    for (const g of r.ingredients) ioIns.run(r.id, g.item, 'in', g.amount, g.perMinute);
    for (const g of r.products) ioIns.run(r.id, g.item, 'out', g.amount, g.perMinute);
    for (const m of r.producedIn) rmIns.run(r.id, m);
  }

  const mIns = ins('INSERT INTO milestone (id,ko,en,tier,ord,time_sec) VALUES (?,?,?,?,?,?)');
  const mcIns = ins('INSERT OR IGNORE INTO milestone_cost (milestone_id,item_id,amount) VALUES (?,?,?)');
  const muIns = ins('INSERT OR IGNORE INTO milestone_unlock (milestone_id,recipe_id) VALUES (?,?)');
  for (const m of milestones) {
    mIns.run(m.id, m.ko, m.en, m.tier, m.order, m.timeToCompleteSec ?? null);
    for (const c of m.cost) mcIns.run(m.id, c.item, c.amount);
    for (const r of m.unlocksRecipes ?? []) muIns.run(m.id, r);
  }

  const nIns = ins('INSERT INTO resource_node (id,res,purity,type,fx,fy,cell,is_item) VALUES (?,?,?,?,?,?,?,?)');
  for (const n of nodes) nIns.run(n.id, n.res, n.purity, n.type, n.fx, n.fy, n.cell, bool(n.isItem));

  // ── 사람이 쓴 표
  const portsFile = path.join(CURATED, 'building-ports.json');
  if (fs.existsSync(portsFile)) {
    const doc = read(CURATED, 'building-ports.json');
    const pIns = ins(
      `INSERT INTO building_port (building_id,port_index,role,kind,face,offset_x_m,offset_y_m,height_m,source,confidence,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const p of doc.ports) {
      pIns.run(p.building, p.index, p.role, p.kind, p.face, p.offsetXM ?? null, p.offsetYM ?? null,
        p.heightM ?? null, p.source ?? doc.source, p.confidence ?? doc.confidence, p.note ?? null);
    }
  }
  const rulesFile = path.join(CURATED, 'layout-rules.json');
  if (fs.existsSync(rulesFile)) {
    const doc = read(CURATED, 'layout-rules.json');
    const lIns = ins('INSERT INTO layout_rule (key,value_num,value_text,unit,why,source,confidence,note) VALUES (?,?,?,?,?,?,?,?)');
    for (const r of doc.rules) {
      lIns.run(r.key, r.valueNum ?? null, r.valueText ?? null, r.unit ?? null, r.why, r.source, r.confidence, r.note ?? null);
    }
  }

  return db;
}

/**
 * 관계 검증. 개별 스크립트에 흩어져 있던 검사를 선언적 질의로 바꾼다.
 * 각 항목은 **0행이어야 통과**다.
 */
const CHECKS = [
  ['레시피 재료가 존재하지 않는 아이템을 가리킨다',
    `SELECT io.recipe_id, io.item_id FROM recipe_io io
     LEFT JOIN item i ON i.id = io.item_id WHERE i.id IS NULL`],
  ['레시피가 존재하지 않는 건물에서 생산된다',
    `SELECT rm.recipe_id, rm.building_id FROM recipe_machine rm
     LEFT JOIN building b ON b.id = rm.building_id WHERE b.id IS NULL`],
  ['마일스톤 비용이 존재하지 않는 아이템을 가리킨다',
    `SELECT mc.milestone_id, mc.item_id FROM milestone_cost mc
     LEFT JOIN item i ON i.id = mc.item_id WHERE i.id IS NULL`],
  ['마일스톤 언락이 존재하지 않는 레시피를 가리킨다',
    `SELECT mu.milestone_id, mu.recipe_id FROM milestone_unlock mu
     LEFT JOIN recipe r ON r.id = mu.recipe_id WHERE r.id IS NULL`],
  ['자원 노드가 게임 아이템에 연결되지 않는다 (지열 제외)',
    `SELECT n.id, n.res FROM resource_node n
     LEFT JOIN item i ON i.id = n.res
     WHERE i.id IS NULL AND n.is_item = 1`],
  ['생산 건물에 치수가 없다 (도면 생성 전제)',
    `SELECT id, ko FROM building
     WHERE category = 'manufacturer' AND (width_m IS NULL OR length_m IS NULL OR height_m IS NULL)`],
  ['포트 표가 존재하지 않는 건물을 가리킨다',
    `SELECT p.building_id FROM building_port p
     LEFT JOIN building b ON b.id = p.building_id WHERE b.id IS NULL`],
  // 같은 면에 입력이 여러 개인 것은 정상이다 (조립기 2입력, 제조기 4입력).
  // 잡아야 하는 것은 포트가 **모자라는** 경우다 — 그 기계가 돌리는 레시피의 최대 재료 수보다 적으면
  // 벨트를 다 그릴 수 없다.
  ['입력 포트 수가 그 기계 레시피의 최대 재료 수보다 적다',
    `WITH need AS (
       SELECT rm.building_id AS bid, MAX(cnt) AS need_in FROM (
         SELECT recipe_id, COUNT(*) cnt FROM recipe_io WHERE role='in' GROUP BY recipe_id
       ) c JOIN recipe_machine rm ON rm.recipe_id = c.recipe_id
       GROUP BY rm.building_id
     ), have AS (
       SELECT building_id AS bid, COUNT(*) AS have_in FROM building_port WHERE role='in' GROUP BY building_id
     )
     SELECT h.bid, h.have_in, n.need_in FROM have h
     JOIN need n ON n.bid = h.bid
     WHERE h.have_in < n.need_in`],
  ['출력 포트가 없는 생산 기계가 포트 표에 있다',
    `SELECT DISTINCT p.building_id FROM building_port p
     WHERE NOT EXISTS (SELECT 1 FROM building_port q WHERE q.building_id = p.building_id AND q.role='out')`],
  ['포트 높이가 없는데 confidence가 verified로 표기됐다 (모르는 값을 확인된 값처럼 쓰면 안 된다)',
    `SELECT building_id, port_index FROM building_port
     WHERE height_m IS NULL AND confidence = 'verified'`],
  ['생산 기계에 입력 포트가 없다',
    `SELECT b.id, b.ko FROM building b
     WHERE b.category = 'manufacturer'
       AND b.id IN (SELECT DISTINCT building_id FROM building_port)
       AND NOT EXISTS (SELECT 1 FROM building_port p WHERE p.building_id = b.id AND p.role = 'in')`],
  ['레시피에 산출물이 없다',
    `SELECT r.id, r.ko FROM recipe r
     LEFT JOIN recipe_io io ON io.recipe_id = r.id AND io.role = 'out'
     WHERE io.recipe_id IS NULL`],
];

/** 값이 이 값이어야 통과하는 회귀 표본 — 게임 업데이트로 바뀌면 즉시 드러난다 */
const SAMPLES = [
  ['제작기 치수 8×10×6 m',
    `SELECT width_m, length_m, height_m FROM building WHERE id='Build_ConstructorMk1_C'`, [8, 10, 6]],
  // 제련기 8.5 m는 위키와 일치한다. 4.5 m로 나오면 클리어런스 파서가 Z 오프셋을 다시 무시한 것이다.
  ['제련기 치수 5×10×8.5 m (Z 오프셋 반영)',
    `SELECT width_m, length_m, height_m FROM building WHERE id='Build_SmelterMk1_C'`, [5, 10, 8.5]],
  ['조립기 치수 9×16×8 m · 굴뚝 포함 10.75 m',
    `SELECT width_m, length_m, height_m, visual_height_m FROM building WHERE id='Build_AssemblerMk1_C'`, [9, 16, 8, 10.75]],
  ['제작기 하드 6 m · 굴뚝 포함 8.5 m',
    `SELECT height_m, visual_height_m FROM building WHERE id='Build_ConstructorMk1_C'`, [6, 8.5]],
  ['채굴기 Mk.1 60/분',
    `SELECT extract_per_min FROM building WHERE id='Build_MinerMk1_C'`, [60]],
  ['벨트 Mk.1 60/분 · 티어 0',
    `SELECT belt_per_min, unlock_tier FROM building WHERE id='Build_ConveyorBeltMk1_C'`, [60, 0]],
  ['조립기 해금 티어 2',
    `SELECT unlock_tier FROM building WHERE id='Build_AssemblerMk1_C'`, [2]],
  ['청사진 설계소 해금 티어 4',
    `SELECT unlock_tier FROM building WHERE id='Build_BlueprintDesigner_C'`, [4]],
  ['보강된 철판 = 철판 30 + 나사 60 → 5',
    `SELECT (SELECT per_minute FROM recipe_io WHERE recipe_id='Recipe_IronPlateReinforced_C' AND item_id='Desc_IronPlate_C'),
            (SELECT per_minute FROM recipe_io WHERE recipe_id='Recipe_IronPlateReinforced_C' AND item_id='Desc_IronScrew_C'),
            (SELECT per_minute FROM recipe_io WHERE recipe_id='Recipe_IronPlateReinforced_C' AND item_id='Desc_IronPlateReinforced_C')`,
    [30, 60, 5]],
];

function verify(db) {
  let failed = 0;
  log('관계 검증:');
  for (const [name, sql] of CHECKS) {
    const rows = db.prepare(sql).all();
    const ok = rows.length === 0;
    log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name);
    if (!ok) {
      failed++;
      for (const r of rows.slice(0, 5)) log('        ' + JSON.stringify(r));
      if (rows.length > 5) log(`        … 총 ${rows.length}건`);
    }
  }
  log('회귀 표본:');
  for (const [name, sql, expect] of SAMPLES) {
    const row = db.prepare(sql).get();
    const got = row ? Object.values(row) : [];
    const ok =
      got.length === expect.length && got.every((v, i) => Math.abs(Number(v) - expect[i]) < 1e-6);
    log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name);
    if (!ok) {
      failed++;
      log('        기대 ' + JSON.stringify(expect) + ' / 실제 ' + JSON.stringify(got));
    }
  }
  return failed;
}

function summary(db) {
  const one = (sql) => Object.values(db.prepare(sql).get() ?? {})[0];
  log('');
  log('적재: 아이템 ' + one('SELECT COUNT(*) FROM item') +
    ' · 레시피 ' + one('SELECT COUNT(*) FROM recipe') +
    ' · 건물 ' + one('SELECT COUNT(*) FROM building') +
    ' · 마일스톤 ' + one('SELECT COUNT(*) FROM milestone') +
    ' · 노드 ' + one('SELECT COUNT(*) FROM resource_node') +
    ' · 포트 ' + one('SELECT COUNT(*) FROM building_port') +
    ' · 배치규칙 ' + one('SELECT COUNT(*) FROM layout_rule'));
}

const db = build();

if (query) {
  const rows = db.prepare(query).all();
  if (rows.length === 0) log('(0행)');
  else {
    const cols = Object.keys(rows[0]);
    log(cols.join(' | '));
    log(cols.map((c) => '-'.repeat(c.length)).join('-|-'));
    for (const r of rows) log(cols.map((c) => String(r[c] ?? '')).join(' | '));
    log(`\n${rows.length}행`);
  }
  process.exit(0);
}

const failed = verify(db);
summary(db);
if (failed) {
  log('');
  log(`검증 ${failed}건 실패.`);
  process.exit(2);
}
log('');
log(CHECK_ONLY ? '검증 통과.' : `완료. ${path.relative(ROOT, DB_PATH)} 생성.`);
