/**
 * 설계판의 계산을 잠근다.
 *
 * 사람이 이 숫자를 보고 실제로 공장을 짓는다. 화면을 고치다 계산이 어긋나도
 * 눈으로는 안 보이므로 여기서 막는다. 수치는 전부 게임 데이터에서 읽고,
 * 기대값은 게임에서 알려진 값(제련기 30/분, 석탄 발전기 물 45 m³/분 등)으로 검증한다.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  POWER_EXP,
  nodeRates,
  solve,
  type Catalog,
  type PlanEdge,
  type PlanNode,
  type PMachine,
  type PRecipe,
} from '../src/lib/planner-solve.ts';

import buildingsJson from '../src/data/app/buildings.json' with { type: 'json' };
import recipesJson from '../src/data/app/recipes.json' with { type: 'json' };
import itemsJson from '../src/data/app/items.json' with { type: 'json' };

type B = {
  id: string;
  ko: string;
  powerMW: number | null;
  powerMaxMW: number | null;
  powerGenMW: number | null;
  supplementalToPowerRatio: number | null;
  unlockTier: number | null;
  extraction: { perMinuteAtNormalPurity: number | null } | null;
  fuels: { fuel: string; supplemental: string | null; byproduct: string | null; byproductAmount: number | null }[];
};
type R = {
  id: string;
  ko: string;
  producedIn: string[];
  ingredients: { item: string; perMinute: number }[];
  products: { item: string; perMinute: number }[];
};

const buildings = buildingsJson as unknown as B[];
const recipes = recipesJson as unknown as R[];
const items = itemsJson as unknown as { id: string; energyMJ: number }[];

const asMachine = (b: B): PMachine => ({
  i: b.id,
  k: b.ko,
  t: b.unlockTier,
  p: b.powerMW ?? b.powerMaxMW ?? null,
  ...(b.extraction ? { e: b.extraction.perMinuteAtNormalPurity ?? 0, res: [] } : {}),
  ...(b.fuels.length
    ? {
        gen: b.powerGenMW ?? 0,
        sr: b.supplementalToPowerRatio ?? null,
        f: b.fuels.map((f) => ({
          f: f.fuel,
          s: f.supplemental,
          b: f.byproduct,
          ba: f.byproductAmount,
        })),
      }
    : {}),
  n: 0,
});

const asRecipe = (r: R): PRecipe => ({
  i: r.id,
  k: r.ko,
  m: r.producedIn[0] ?? '',
  g: r.ingredients.map((g) => [g.item, g.perMinute] as [string, number]),
  o: r.products.map((p) => [p.item, p.perMinute] as [string, number]),
});

const mById = new Map(buildings.map((b) => [b.id, asMachine(b)]));
const rById = new Map(recipes.map((r) => [r.id, asRecipe(r)]));
const eById = new Map(items.map((i) => [i.id, i.energyMJ]));

const cat: Catalog = {
  machine: (id) => mById.get(id),
  recipe: (id) => rById.get(id),
  energyMJ: (id) => eById.get(id) ?? 0,
};

let seq = 0;
const node = (p: Partial<PlanNode> & Pick<PlanNode, 'kind' | 'ref' | 'machine'>): PlanNode => ({
  id: ++seq,
  x: 0,
  y: 0,
  count: 1,
  clock: 100,
  ...p,
});
const edge = (from: PlanNode, to: PlanNode, item: string): PlanEdge => ({
  id: ++seq,
  from: from.id,
  to: to.id,
  item,
});

test('제련기 한 대는 철 광석 30/분을 먹고 철 주괴 30/분을 낸다', () => {
  const n = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const r = nodeRates(n, cat);
  assert.equal(r.ins.get('Desc_OreIron_C'), 30);
  assert.equal(r.outs.get('Desc_IronIngot_C'), 30);
  assert.equal(r.power, 4);
});

test('대수와 클럭이 처리량에 곱해진다', () => {
  const n = node({
    kind: 'recipe',
    ref: 'Recipe_IngotIron_C',
    machine: 'Build_SmelterMk1_C',
    count: 3,
    clock: 50,
  });
  const r = nodeRates(n, cat);
  assert.equal(r.outs.get('Desc_IronIngot_C'), 45);
});

test('생산 건물의 전력은 클럭의 1.321928 제곱이다 — 250%에서 약 3.5배', () => {
  const n = node({
    kind: 'recipe',
    ref: 'Recipe_IngotIron_C',
    machine: 'Build_SmelterMk1_C',
    clock: 250,
  });
  const r = nodeRates(n, cat);
  assert.equal(Math.round(r.power * 1000) / 1000, Math.round(4 * Math.pow(2.5, POWER_EXP) * 1000) / 1000);
  /* 2.5^1.321928 = 3.3577… — 제작기 4 MW 가 250% 에서 13.4 MW 가 된다 */
  assert.equal(Math.round((r.power / 4) * 1000) / 1000, 3.358);
});

test('채굴기 Mk.1 은 순도에 비례해 캔다 — 불순 30 · 보통 60 · 순수 120', () => {
  const mk1 = 'Build_MinerMk1_C';
  const got = [0.5, 1, 2].map(
    (purity) =>
      nodeRates(
        node({ kind: 'extract', ref: mk1, machine: mk1, resource: 'Desc_OreIron_C', purity }),
        cat
      ).outs.get('Desc_OreIron_C')
  );
  assert.deepEqual(got, [30, 60, 120]);
});

test('석탄 발전기 한 대는 석탄 15/분과 물 45 m³/분을 먹고 75 MW 를 낸다', () => {
  const g = 'Build_GeneratorCoal_C';
  const r = nodeRates(node({ kind: 'generator', ref: g, machine: g, fuel: 'Desc_Coal_C' }), cat);
  assert.equal(r.gen, 75);
  assert.equal(r.ins.get('Desc_Coal_C'), 15);
  assert.equal(r.ins.get('Desc_Water_C'), 45);
  /* 발전기는 전력을 소비하지 않는다 */
  assert.equal(r.power, 0);
});

test('원자력 발전소는 물 240 m³/분을 먹고 핵폐기물을 낸다', () => {
  const g = 'Build_GeneratorNuclear_C';
  const r = nodeRates(
    node({ kind: 'generator', ref: g, machine: g, fuel: 'Desc_NuclearFuelRod_C' }),
    cat
  );
  assert.equal(r.gen, 2500);
  assert.equal(r.ins.get('Desc_Water_C'), 240);
  assert.equal(r.ins.get('Desc_NuclearFuelRod_C'), 0.2);
  /* 연료봉 하나당 폐기물 50 → 0.2/분 × 50 = 10/분 */
  assert.equal(r.outs.get('Desc_NuclearWaste_C'), 10);
});

test('발전기 오버클럭은 선형이다 — 생산 건물과 다르다', () => {
  const g = 'Build_GeneratorCoal_C';
  const at = (clock: number) =>
    nodeRates(node({ kind: 'generator', ref: g, machine: g, fuel: 'Desc_Coal_C', clock }), cat);
  assert.equal(at(250).gen, 187.5);
  assert.equal(at(250).ins.get('Desc_Coal_C'), 37.5);
});

test('채굴기 → 제련기 두 대를 이으면 딱 맞아 가동률이 100%다', () => {
  const miner = node({
    kind: 'extract',
    ref: 'Build_MinerMk1_C',
    machine: 'Build_MinerMk1_C',
    resource: 'Desc_OreIron_C',
    purity: 1,
  });
  const smelt = node({
    kind: 'recipe',
    ref: 'Recipe_IngotIron_C',
    machine: 'Build_SmelterMk1_C',
    count: 2,
  });
  const s = solve([miner, smelt], [edge(miner, smelt, 'Desc_OreIron_C')], cat);
  assert.equal(s.ratio.get(smelt.id), 1);
  assert.equal(s.yields.get('Desc_IronIngot_C'), 60);
  assert.equal(s.feed.size, 0);
});

test('공급이 절반이면 가동률도 절반이 된다', () => {
  const miner = node({
    kind: 'extract',
    ref: 'Build_MinerMk1_C',
    machine: 'Build_MinerMk1_C',
    resource: 'Desc_OreIron_C',
    purity: 0.5,
  });
  const smelt = node({
    kind: 'recipe',
    ref: 'Recipe_IngotIron_C',
    machine: 'Build_SmelterMk1_C',
    count: 2,
  });
  const s = solve([miner, smelt], [edge(miner, smelt, 'Desc_OreIron_C')], cat);
  assert.equal(s.ratio.get(smelt.id), 0.5);
  assert.equal(s.yields.get('Desc_IronIngot_C'), 30);
});

test('갈라지는 산출은 목적지가 필요로 하는 양에 비례해 나뉜다', () => {
  const miner = node({
    kind: 'extract',
    ref: 'Build_MinerMk1_C',
    machine: 'Build_MinerMk1_C',
    resource: 'Desc_OreIron_C',
    purity: 1,
  });
  /* 30 을 요구하는 쪽과 90 을 요구하는 쪽. 60 을 1:3 으로 나눠 15 : 45 */
  const a = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const b = node({
    kind: 'recipe',
    ref: 'Recipe_IngotIron_C',
    machine: 'Build_SmelterMk1_C',
    count: 3,
  });
  const ea = edge(miner, a, 'Desc_OreIron_C');
  const eb = edge(miner, b, 'Desc_OreIron_C');
  const s = solve([miner, a, b], [ea, eb], cat);
  assert.equal(s.flow.get(ea.id), 15);
  assert.equal(s.flow.get(eb.id), 45);
  assert.equal(s.ratio.get(a.id), 0.5);
  assert.equal(s.ratio.get(b.id), 0.5);
});

test('안 이은 투입구는 "밖에서 넣어야 할 것"으로 뜬다', () => {
  const smelt = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const s = solve([smelt], [], cat);
  assert.equal(s.ratio.get(smelt.id), 1);
  assert.equal(s.feed.get('Desc_OreIron_C'), 30);
  assert.equal(s.yields.get('Desc_IronIngot_C'), 30);
});

test('되먹임이 있어도 수렴한다 — 산출을 자기 투입으로 되돌려도 멈춘다', () => {
  /*
   * 실제로 이렇게 짓지는 않지만, 사람이 실수로 이을 수 있다.
   * 수렴하지 않으면 화면이 멈추므로 반드시 끝나야 한다.
   */
  const a = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const b = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const s = solve([a, b], [edge(a, b, 'Desc_IronIngot_C'), edge(b, a, 'Desc_IronIngot_C')], cat);
  /* 철 광석이 안 들어오지만 철 주괴는 서로 물려 있다 — 무엇이 나오든 유한해야 한다 */
  for (const v of s.ratio.values()) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
});

test('솔버가 만드는 유량은 절대 목적지 요구량을 넘지 않는다', () => {
  const miner = node({
    kind: 'extract',
    ref: 'Build_MinerMk3_C',
    machine: 'Build_MinerMk3_C',
    resource: 'Desc_OreIron_C',
    purity: 2,
  });
  const smelt = node({ kind: 'recipe', ref: 'Recipe_IngotIron_C', machine: 'Build_SmelterMk1_C' });
  const e = edge(miner, smelt, 'Desc_OreIron_C');
  const s = solve([miner, smelt], [e], cat);
  assert.equal(s.flow.get(e.id), 30);
  /* 남는 480 - 30 은 밖으로 나오는 것으로 잡힌다 */
  assert.equal(s.yields.get('Desc_OreIron_C'), 450);
});
