/**
 * 진단 규칙 테스트.
 *
 * 규칙 엔진은 "그럴듯한 문장"을 내면 안 된다. 같은 입력이면 같은 판정이 나와야 하고,
 * 걸릴 상황에서 걸리고 안 걸릴 상황에서 안 걸려야 한다. 규칙마다 양쪽을 다 검사한다.
 *
 * 카탈로그는 실제 앱 데이터를 그대로 쓴다 — 표시 이름과 전력값을 테스트에 타이핑하지 않기 위해서다.
 * 데이터가 바뀌면 테스트도 같이 반응해야 한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { diagnose, type Finding } from '../src/lib/diagnose.ts';
import type { CheckupCatalog, FactoryMachine, FactoryModel } from '../src/lib/save-factory.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/app/checkup-catalog.json'), 'utf8')
) as CheckupCatalog;

/* 클래스명은 코드 식별자다. 화면에 나가는 이름은 전부 카탈로그에서 가져온다 */
const CONSTRUCTOR = 'Build_ConstructorMk1_C';
const SMELTER = 'Build_SmelterMk1_C';
const MINER = 'Build_MinerMk1_C';
const COAL_GEN = 'Build_GeneratorCoal_C';
const PLATE_RECIPE = 'Recipe_IronPlate_C';
const INGOT_RECIPE = 'Recipe_IngotIron_C';
const PLATE = 'Desc_IronPlate_C';

const B = (id: string) => catalog.buildings[id]!;
const R = (id: string) => catalog.recipes[id]!;

function machine(over: Partial<FactoryMachine> & { key: string }): FactoryMachine {
  const id = over.id ?? CONSTRUCTOR;
  const recipe = over.recipe === undefined ? PLATE_RECIPE : over.recipe;
  const r = recipe ? R(recipe) : undefined;
  const clock = over.clock ?? 1;
  return {
    key: over.key,
    id,
    ko: B(id).ko,
    recipe,
    recipeKo: r?.ko ?? null,
    clock,
    uptime: over.uptime === undefined ? 1 : over.uptime,
    fx: 0.5,
    fy: 0.5,
    node: over.node ?? null,
    ratePerMinute: r ? r.per * clock : null,
    outItem: over.outItem === undefined ? (r?.out ?? null) : over.outItem,
  };
}

/**
 * 세이브에서 읽어 온 모델을 흉내 낸다.
 *   - 지은 개수를 따로 주지 않으면 설비 목록에서 센다
 *   - 간선의 물건은 보내는 설비의 산출로 채운다 (실제 리더가 하는 일과 같다)
 *   - 설비가 아닌 도착지는 창고로 본다 (실제 그래프에는 설비와 창고만 들어간다)
 */
type ModelOver = Partial<Omit<FactoryModel, 'edges'>> & {
  edges?: { from: string; to: string; item?: string | null }[];
};

function model(over: ModelOver = {}): FactoryModel {
  const machines = over.machines ?? [];
  const outOf = new Map(machines.map((m) => [m.key, m.outItem]));
  const counts: Record<string, number> = {};
  for (const m of machines) counts[m.id] = (counts[m.id] ?? 0) + 1;
  const edges = (over.edges ?? []).map((e) => ({
    from: e.from,
    to: e.to,
    item: e.item === undefined ? (outOf.get(e.from) ?? null) : e.item,
  }));
  const keys = new Set(machines.map((m) => m.key));
  const base: FactoryModel = {
    session: '테스트',
    hours: 10,
    machines,
    counts: over.counts ?? counts,
    power: { genMW: 1000, useMW: 20, circuits: 1 },
    stock: {},
    edges,
    danglingOutputs: 0,
    storageKeys: [...new Set(edges.map((e) => e.to))].filter((k) => !keys.has(k)),
    objects: 1000,
    hazards: [],
  };
  return { ...base, ...over, machines, edges, counts: over.counts ?? counts };
}

const byId = (list: Finding[], prefix: string) => list.filter((f) => f.id.startsWith(prefix));
const one = (list: Finding[], prefix: string): Finding => {
  const hit = byId(list, prefix);
  assert.equal(hit.length, 1, `${prefix} 규칙이 정확히 하나 나와야 한다 (실제 ${hit.length}개)`);
  return hit[0]!;
};

/* ------------------------------------------------------------------ 1. 병목 */

test('병목 — 같은 레시피 설비들의 평균 가동률이 50% 아래면 stop', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'a', uptime: 0.4 }),
        machine({ key: 'b', uptime: 0.3 }),
        machine({ key: 'c', uptime: 0.5 }),
      ],
      edges: [
        { from: 'a', to: 'sink' },
        { from: 'b', to: 'sink' },
        { from: 'c', to: 'sink' },
      ],
    }),
    catalog
  );
  const f = one(found, 'bottleneck-');
  assert.equal(f.severity, 'stop');
  assert.match(f.title, /40%/); // (0.4 + 0.3 + 0.5) / 3 = 0.4
  assert.match(f.title, /3대/);
  assert.equal(f.rows?.length, 3);
  assert.match(f.title, new RegExp(R(PLATE_RECIPE).ko));
});

test('병목 — 평균이 90% 아래 50% 위면 warn, 90% 이상이면 아예 안 걸린다', () => {
  const warn = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 0.7 })],
      edges: [{ from: 'a', to: 'sink' }],
    }),
    catalog
  );
  assert.equal(one(warn, 'bottleneck-').severity, 'warn');

  const fine = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 0.95 })],
      edges: [{ from: 'a', to: 'sink' }],
    }),
    catalog
  );
  assert.equal(byId(fine, 'bottleneck-').length, 0);
});

test('병목 — 레시피가 다르면 따로 묶인다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'a', uptime: 0.4 }),
        machine({ key: 'b', id: SMELTER, recipe: INGOT_RECIPE, uptime: 0.6 }),
      ],
      edges: [
        { from: 'a', to: 'sink' },
        { from: 'b', to: 'sink' },
      ],
    }),
    catalog
  );
  assert.equal(byId(found, 'bottleneck-').length, 2);
  /* 심각한 쪽(40%)이 앞에 온다 */
  assert.equal(found[0]!.severity, 'stop');
});

/* ------------------------------------------------- 2. 막힘 vs 굶음 */

test('막힘과 굶음을 갈라낸다 — 하류가 없으면 막힘, 상류가 더 느리면 굶음', () => {
  const found = diagnose(
    model({
      machines: [
        /* 채굴기: 하류는 있지만 자기 가동률이 낮다 = 원인 쪽 */
        machine({ key: 'miner', id: MINER, recipe: null, uptime: 0.4 }),
        /* 제작기: 상류(채굴기)가 자기보다 느리다 = 굶음 */
        machine({ key: 'starving', uptime: 0.5 }),
        /* 제작기: 하류가 아예 없다 = 막힘 */
        machine({ key: 'stuck', uptime: 0.3 }),
      ],
      edges: [
        { from: 'miner', to: 'starving' },
        { from: 'starving', to: 'sink' },
      ],
    }),
    catalog
  );

  const blocked = one(found, 'output-blocked');
  assert.equal(blocked.severity, 'stop'); // 30% < 50%
  assert.equal(blocked.rows?.length, 1);
  assert.match(blocked.title, /1대/);

  const starved = one(found, 'input-starved');
  assert.equal(starved.rows?.length, 1);
  /* 굶는 설비 줄에는 원인이 된 상류 설비가 적혀야 한다 */
  assert.match(starved.rows![0]!.note, new RegExp(B(MINER).ko));
});

test('막힘·굶음 — 모두 잘 돌면 둘 다 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'miner', id: MINER, recipe: null, uptime: 1 }),
        machine({ key: 'a', uptime: 1 }),
      ],
      edges: [
        { from: 'miner', to: 'a' },
        { from: 'a', to: 'sink' },
      ],
    }),
    catalog
  );
  assert.equal(byId(found, 'output-blocked').length, 0);
  assert.equal(byId(found, 'input-starved').length, 0);
});

test('굶음 — 상류가 나보다 빠르면 원인이 아니므로 굶음으로 잡지 않는다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'miner', id: MINER, recipe: null, uptime: 1 }),
        machine({ key: 'slow', uptime: 0.6 }),
      ],
      edges: [
        { from: 'miner', to: 'slow' },
        { from: 'slow', to: 'sink' },
      ],
    }),
    catalog
  );
  assert.equal(byId(found, 'input-starved').length, 0);
  /* 그래도 병목으로는 잡힌다 — 문제 자체를 놓치지는 않는다 */
  assert.equal(byId(found, 'bottleneck-').length, 1);
});

/* --------------------------------------------- 3. 이어지지 않은 출력 */

test('출력이 안 이어진 설비 — 잘 돌고 있어도 잡아낸다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      danglingOutputs: 2,
    }),
    catalog
  );
  const f = one(found, 'dangling-output');
  assert.equal(f.severity, 'warn');
  assert.equal(f.rows?.length, 1);
  assert.match(f.detail, /2개/);
});

test('출력이 안 이어진 설비 — 막힘으로 이미 보고한 설비는 표에서 뺀다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'stuck', uptime: 0.2 }),
        machine({ key: 'ok', uptime: 1 }),
      ],
      danglingOutputs: 2,
    }),
    catalog
  );
  assert.equal(one(found, 'output-blocked').rows?.length, 1);
  assert.equal(one(found, 'dangling-output').rows?.length, 1);
});

test('출력이 안 이어진 설비 — 전부 이어져 있고 남는 출력구도 없으면 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
    }),
    catalog
  );
  assert.equal(byId(found, 'dangling-output').length, 0);
});

/* ------------------------------------------------------------ 4. 전력 */

test('전력 — 순간 소비가 낮아도 정격으로 보면 여유가 없으면 stop', () => {
  const machines = Array.from({ length: 30 }, (_, i) =>
    machine({ key: `c${i}`, uptime: 1 })
  );
  const found = diagnose(
    model({
      machines,
      edges: machines.map((m) => ({ from: m.key, to: 'sink' })),
      /* 저장 순간에는 대부분 대기 중이라 3MW 로 잡혔다 */
      power: { genMW: 100, useMW: 3, circuits: 1 },
    }),
    catalog
  );
  const f = one(found, 'power-margin');
  assert.equal(f.severity, 'stop');
  /* 정격 = 제작기 30대 × 기본 소비 */
  const rated = 30 * B(CONSTRUCTOR).p!;
  assert.match(f.title, new RegExp(String(rated)));
  /* 소비가 발전을 넘었으면 "여유 0%"로 얼버무리지 않고 넘은 양을 말한다 */
  assert.match(f.title, /많습니다/);
  assert.match(f.title, new RegExp(String(rated - 100)));
  /* 순간 소비를 detail 에 같이 적어 두 값을 함께 보여 준다 */
  assert.match(f.detail, /3 MW/);
});

test('전력 — 여유가 25%와 10% 사이면 warn', () => {
  const machines = Array.from({ length: 10 }, (_, i) => machine({ key: `c${i}`, uptime: 1 }));
  const rated = 10 * B(CONSTRUCTOR).p!; // 40 MW
  const found = diagnose(
    model({
      machines,
      edges: machines.map((m) => ({ from: m.key, to: 'sink' })),
      power: { genMW: rated / 0.8, useMW: 30, circuits: 1 }, // 여유 20%
    }),
    catalog
  );
  assert.equal(one(found, 'power-margin').severity, 'warn');
});

test('전력 — 여유가 넉넉하면 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
      power: { genMW: 100, useMW: 4, circuits: 1 },
    }),
    catalog
  );
  assert.equal(byId(found, 'power-margin').length, 0);
});

test('전력 — 오버클럭은 클럭보다 소비가 가파르게 는다', () => {
  const machines = Array.from({ length: 10 }, (_, i) =>
    machine({ key: `c${i}`, uptime: 1, clock: 2 })
  );
  const found = diagnose(
    model({
      machines,
      edges: machines.map((m) => ({ from: m.key, to: 'sink' })),
      power: { genMW: 100, useMW: 30, circuits: 1 },
    }),
    catalog
  );
  const f = one(found, 'power-margin');
  const linear = 10 * B(CONSTRUCTOR).p! * 2;
  const rated = 10 * B(CONSTRUCTOR).p! * Math.pow(2, B(CONSTRUCTOR).e!);
  assert.ok(rated > linear, '지수가 1보다 크므로 선형보다 커야 한다');
  const mw = (x: number) => `${x.toFixed(1).replace(/\.0$/, '')} MW`;
  assert.ok(f.title.includes(mw(rated)), `정격 소비 ${mw(rated)} 가 제목에 없다: ${f.title}`);

  /* 같은 사실을 info 로도 알려 준다 — 선형이었다면 안 들었을 몫이 추가 소비다 */
  const oc = one(found, 'overclock-power');
  assert.equal(oc.severity, 'info');
  assert.equal(oc.rows?.length, 10);
  assert.ok(oc.title.includes(mw(rated - linear)), `추가 소비가 제목에 없다: ${oc.title}`);
});

test('오버클럭 — 클럭 100%뿐이면 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
    }),
    catalog
  );
  assert.equal(byId(found, 'overclock-power').length, 0);
});

/* ---------------------------------------------------- 5. 레시피 없는 설비 */

test('레시피 없는 설비 — 지은 수와 레시피 걸린 수의 차이로 잡는다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
      counts: { [CONSTRUCTOR]: 4 },
      power: { genMW: 1000, useMW: 4, circuits: 1 },
    }),
    catalog
  );
  const f = one(found, 'no-recipe');
  assert.equal(f.severity, 'warn');
  assert.match(f.title, /3대/);
  assert.match(f.rows![0]!.ko, new RegExp(B(CONSTRUCTOR).ko));
});

test('레시피 없는 설비 — 지은 만큼 다 걸려 있으면 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 }), machine({ key: 'b', uptime: 1 })],
      edges: [
        { from: 'a', to: 'sink' },
        { from: 'b', to: 'sink' },
      ],
      counts: { [CONSTRUCTOR]: 2 },
    }),
    catalog
  );
  assert.equal(byId(found, 'no-recipe').length, 0);
});

test('레시피 없는 설비 — 생산 설비가 아닌 건물은 세지 않는다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
      counts: { [CONSTRUCTOR]: 1, [COAL_GEN]: 6 },
    }),
    catalog
  );
  assert.equal(byId(found, 'no-recipe').length, 0);
});

/* ------------------------------------------------------ 6. 쌓이기만 하는 것 */

test('쌓이는 재고 — 만드는 설비는 있는데 설비로 이어진 산출이 없으면 잡는다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'storage' }], // 창고에서 끝난다
      stock: { [PLATE]: 900 },
    }),
    catalog
  );
  const f = one(found, 'piling-');
  assert.equal(f.severity, 'warn');
  assert.match(f.title, new RegExp(catalog.items[PLATE]!));
  assert.match(f.title, /900/);
  /* 조사는 받침을 보고 고른다 — 이름이 데이터에서 오기 때문이다 */
  assert.match(f.detail, new RegExp(`${catalog.items[PLATE]}을 만드는`));
  assert.equal(f.rows?.[0]?.note.includes('창고에서 끝남'), true);
});

test('쌓이는 재고 — 다른 설비로 이어져 있으면 소비처가 있는 것이므로 안 걸린다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'a', uptime: 1 }),
        machine({ key: 'b', id: SMELTER, recipe: INGOT_RECIPE, uptime: 1 }),
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'sink' },
      ],
      stock: { [PLATE]: 900 },
    }),
    catalog
  );
  assert.equal(byId(found, 'piling-').length, 0);
});

test('쌓이는 재고 — 만드는 설비가 없으면(주워 온 것) 잡지 않는다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'b', id: SMELTER, recipe: INGOT_RECIPE, uptime: 1 })],
      edges: [{ from: 'b', to: 'sink' }],
      stock: { [PLATE]: 9000 },
    }),
    catalog
  );
  assert.equal(byId(found, 'piling-').length, 0);
});

test('쌓이는 재고 — 임계값 아래면 정상 완충 재고로 본다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'storage' }],
      stock: { [PLATE]: 120 },
    }),
    catalog
  );
  assert.equal(byId(found, 'piling-').length, 0);
});

/* --------------------------------------------------------- 발전기 예외 */

test('발전기는 가동률 규칙에서 뺀다 — 낮은 가동률이 곧 고장이 아니다', () => {
  const found = diagnose(
    model({
      machines: [
        machine({ key: 'g', id: COAL_GEN, recipe: null, uptime: 0.2 }),
        machine({ key: 'a', uptime: 1 }),
      ],
      edges: [{ from: 'a', to: 'sink' }],
      counts: { [CONSTRUCTOR]: 1, [COAL_GEN]: 1 },
    }),
    catalog
  );
  assert.equal(byId(found, 'bottleneck-').length, 0);
  assert.equal(byId(found, 'output-blocked').length, 0);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.id, 'all-clear');
});

/* ------------------------------------------------------------ 8. 문제 없음 */

test('문제가 없으면 빈 배열이 아니라 info 하나를 준다', () => {
  const found = diagnose(
    model({
      machines: [machine({ key: 'a', uptime: 1 })],
      edges: [{ from: 'a', to: 'sink' }],
    }),
    catalog
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]!.id, 'all-clear');
  assert.equal(found[0]!.severity, 'info');
  assert.match(found[0]!.title, /막힌 곳은 없습니다/);
});

test('설비가 하나도 없는 세이브도 무너지지 않는다', () => {
  const found = diagnose(model(), catalog);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.id, 'all-clear');
});

/* ------------------------------------------------------- 정렬과 문장 규칙 */

test('심각한 것부터 나온다 — stop, warn, info 순서', () => {
  const machines = [
    machine({ key: 'stuck', uptime: 0.2 }),
    ...Array.from({ length: 20 }, (_, i) => machine({ key: `c${i}`, uptime: 1, clock: 1.5 })),
  ];
  const found = diagnose(
    model({
      machines,
      edges: machines.filter((m) => m.key !== 'stuck').map((m) => ({ from: m.key, to: 'sink' })),
      counts: { [CONSTRUCTOR]: 24 },
      power: { genMW: 100, useMW: 10, circuits: 1 },
      stock: { [PLATE]: 4000 },
    }),
    catalog
  );
  const rank = { stop: 0, warn: 1, info: 2 } as const;
  const seq = found.map((f) => rank[f.severity]);
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b), '심각도 순서가 어긋났다');
  assert.ok(seq.includes(0) && seq.includes(1) && seq.includes(2), '세 등급이 모두 나와야 한다');
  /* 문제가 잡혔으면 문제 없음 항목은 나오지 않는다 */
  assert.equal(byId(found, 'all-clear').length, 0);
});

test('모든 문장이 규약을 지킨다 — 한국어, 별표 없음, 빈 말 없음', () => {
  const machines = [
    machine({ key: 'stuck', uptime: 0.2 }),
    machine({ key: 'miner', id: MINER, recipe: null, uptime: 0.3 }),
    machine({ key: 'starving', uptime: 0.4 }),
    machine({ key: 'oc', uptime: 1, clock: 2.5 }),
  ];
  const found = diagnose(
    model({
      machines,
      edges: [
        { from: 'miner', to: 'starving' },
        { from: 'starving', to: 'storage' },
        { from: 'oc', to: 'storage' },
      ],
      counts: { [CONSTRUCTOR]: 8, [MINER]: 1 },
      danglingOutputs: 3,
      power: { genMW: 40, useMW: 5, circuits: 1 },
      stock: { [PLATE]: 2500 },
    }),
    catalog
  );

  assert.ok(found.length >= 6, `규칙이 여러 개 걸려야 한다 (실제 ${found.length}개)`);
  const ids = new Set(found.map((f) => f.id));
  assert.equal(ids.size, found.length, '규칙 id 가 겹친다');

  for (const f of found) {
    assert.match(f.id, /^[a-z0-9-]+$/, `id 가 kebab-case 가 아니다: ${f.id}`);
    for (const [field, text] of [
      ['title', f.title],
      ['detail', f.detail],
      ['fix', f.fix],
    ] as const) {
      assert.ok(text.length > 0, `${f.id}.${field} 가 비었다`);
      assert.ok(!text.includes('**'), `${f.id}.${field} 에 마크다운 별표가 있다`);
      assert.match(text, /[가-힣]/, `${f.id}.${field} 에 한국어가 없다`);
    }
    assert.match(f.title, /\d/, `${f.id}.title 에 수치가 없다`);
    assert.ok(f.detail.length > 40, `${f.id}.detail 이 근거를 설명하기에 너무 짧다`);
    assert.ok(f.fix.length > 30, `${f.id}.fix 가 구체적이지 않다`);
    assert.ok(!/^확인하세요|확인해 보세요$/.test(f.fix), `${f.id}.fix 가 빈 말이다`);
    for (const row of f.rows ?? []) {
      assert.ok(row.ko.length > 0 && row.note.length > 0, `${f.id} 의 표에 빈 칸이 있다`);
    }
  }
});

test('같은 입력이면 같은 결과가 나온다', () => {
  const build = () =>
    model({
      machines: [
        machine({ key: 'a', uptime: 0.3 }),
        machine({ key: 'b', uptime: 0.8 }),
        machine({ key: 'miner', id: MINER, recipe: null, uptime: 0.2 }),
      ],
      edges: [{ from: 'miner', to: 'b' }],
      stock: { [PLATE]: 3000 },
      danglingOutputs: 1,
    });
  assert.deepEqual(diagnose(build(), catalog), diagnose(build(), catalog));
});
