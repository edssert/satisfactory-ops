/**
 * 생산 체인 계산 골든 테스트 (TRD 8.1 — MUST).
 *
 * 실행: node --test tests/
 *
 * 여기 박힌 기대값은 공식 위키 공표값이다. 게임 패치로 레시피가 바뀌면 이 테스트가 먼저 깨진다 —
 * 그게 목적이다. 화면이 조용히 틀린 값을 내는 것보다 테스트가 실패하는 편이 낫다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { add, ceil, div, format, fromNumber, mul, toNumber } from '../src/lib/rational.ts';
import { solve, machineAdvice, type RecipeBook, type SolverRecipe } from '../src/lib/solver.ts';
import { solveProductionNetwork } from '../src/domain/production/network-solver.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

test('복수 목표와 재활용 순환을 하나의 순생산 방정식으로 푼다', () => {
  const recipes = new Map([
    ['A', { id: 'make-a', primaryItemId: 'A', outputPerMinute: 10, machineId: 'MachineA', ingredients: [{ itemId: 'B', rate: 5 }, { itemId: 'Ore', rate: 2 }], products: [{ itemId: 'A', rate: 10 }] }],
    ['B', { id: 'make-b', primaryItemId: 'B', outputPerMinute: 10, machineId: 'MachineB', ingredients: [{ itemId: 'A', rate: 2 }], products: [{ itemId: 'B', rate: 10 }] }],
  ]);
  const result = solveProductionNetwork([{ itemId: 'A', rate: 10 }, { itemId: 'B', rate: 5 }], (itemId) => recipes.get(itemId));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cyclic, true);
  assert.ok(Math.abs(result.nodes.find((node) => node.itemId === 'A')!.runs - 1.2222222222) < 1e-8);
  assert.ok(Math.abs(result.nodes.find((node) => node.itemId === 'B')!.runs - 1.1111111111) < 1e-8);
  assert.ok(Math.abs(result.raw.find((part) => part.itemId === 'Ore')!.rate - 2.4444444444) < 1e-8);
});
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const recipes = read('src/data/app/recipes.json') as (SolverRecipe & {
  isAlternate: boolean;
  isBuildingRecipe: boolean;
})[];
const buildings = read('src/data/app/buildings.json') as {
  id: string;
  ko: string;
  en: string;
  powerMW: number | null;
}[];
const items = read('src/data/app/items.json') as { id: string; ko: string; en: string; kind: string }[];

const itemById = new Map(items.map((i) => [i.id, i]));
const buildingById = new Map(buildings.map((b) => [b.id, b]));

type TestRecipe = SolverRecipe & { isAlternate: boolean; isBuildingRecipe: boolean };

const producers = new Map<string, TestRecipe[]>();
for (const r of recipes) {
  if (r.isBuildingRecipe || r.producedIn.length === 0) continue;
  for (const p of r.products) {
    if (!producers.has(p.item)) producers.set(p.item, []);
    producers.get(p.item)!.push(r);
  }
}

/** 앱과 같은 기본 레시피 선택 규칙 (gamedata.defaultRecipeOf) */
function defaultRecipe(itemId: string): SolverRecipe | undefined {
  const list = (producers.get(itemId) ?? []).filter((r) => !r.isAlternate);
  if (list.length === 0) return undefined;
  return list.find((r) => r.products.length === 1) ?? list[0];
}

const book: RecipeBook = {
  recipeFor: (id) => {
    const it = itemById.get(id);
    if (it?.kind === 'resource') return undefined;
    return defaultRecipe(id);
  },
  machine: (id) => {
    const b = buildingById.get(id);
    return b ? { id, ko: b.ko, en: b.en, powerMW: b.powerMW } : undefined;
  },
  nameOf: (id) => {
    const i = itemById.get(id);
    return { ko: i?.ko ?? id, en: i?.en ?? id };
  },
};

const rateOf = (r: ReturnType<typeof solve>, itemId: string): number => {
  assert.ok(r.ok, '해가 있어야 함');
  const hit = r.raw.find((x) => x.itemId === itemId);
  return hit ? toNumber(hit.rate) : 0;
};

// ---------------------------------------------------------------- 유리수

test('유리수 — 기본 연산이 정확하다', () => {
  const third = div(fromNumber(1), fromNumber(3));
  const sixth = div(fromNumber(1), fromNumber(6));
  assert.equal(format(add(third, sixth)), '0.5');
  assert.equal(format(mul(third, fromNumber(3))), '1');
  assert.equal(ceil(third), 1);
  assert.equal(ceil(fromNumber(4)), 4);
});

test('유리수 — 0.1 + 0.2 가 0.3 이다 (부동소수점 오차 없음)', () => {
  assert.equal(format(add(fromNumber(0.1), fromNumber(0.2))), '0.3');
});

test('유리수 — 스케일 곱셈 후에도 정수가 정수로 남는다', () => {
  // 실제 버그: 철광석 60/분이 60.000004가 되어 채굴기가 2대로 표시됐다
  const base = fromNumber(14.166666666666666);
  const scale = div(fromNumber(60), base);
  const scaled = mul(base, scale);
  assert.equal(ceil(div(scaled, fromNumber(60))), 1);
});

// ---------------------------------------------------------------- 위키 공표값 대조

test('철판 20/분 — 제작기 1대, 철광석 30/분', () => {
  const r = solve('Desc_IronPlate_C', 20, book);
  assert.ok(r.ok);
  assert.equal(format(r.root.machines!), '1');
  assert.equal(r.root.machineKo, buildingById.get('Build_ConstructorMk1_C')!.ko);
  assert.equal(rateOf(r, 'Desc_OreIron_C'), 30);
});

test('보강된 철판 15/분 — 조립기 3대 · 제작기 4.5대 · 철광석 180/분', () => {
  const r = solve('Desc_IronPlateReinforced_C', 15, book);
  assert.ok(r.ok);
  assert.equal(format(r.root.machines!), '3');
  assert.equal(rateOf(r, 'Desc_OreIron_C'), 180);

  // 철판 노드는 4.5대여야 한다 (90/분 ÷ 20/분)
  const plate = r.root.children.find((c) => c.itemId === 'Desc_IronPlate_C');
  assert.ok(plate, '철판 하위 노드가 있어야 함');
  assert.equal(format(plate.machines!), '4.5');
  assert.equal(format(plate.rate), '90');
});

test('로터 4/분 — 나사 100/분이 필요하다 (나사 병목의 정량 근거)', () => {
  const r = solve('Desc_Rotor_C', 4, book);
  assert.ok(r.ok);
  const screw = r.root.children.find((c) => c.itemId === 'Desc_IronScrew_C');
  assert.ok(screw, '나사 하위 노드가 있어야 함');
  assert.equal(format(screw.rate), '100');
});

test('원자재는 재귀를 멈춘다 — 철광석은 자식이 없다', () => {
  const r = solve('Desc_IronIngot_C', 30, book);
  assert.ok(r.ok);
  const ore = r.root.children[0]!;
  assert.equal(ore.itemId, 'Desc_OreIron_C');
  assert.equal(ore.children.length, 0);
  assert.equal(ore.recipeId, null);
});

test('전력 합계는 지어야 하는 대수(올림) 기준이다', () => {
  const r = solve('Desc_IronPlate_C', 25, book);
  assert.ok(r.ok);
  // 제작기 1.25대 → 2대, 제련기 1.875대 → 2대
  const constructor = buildingById.get('Build_ConstructorMk1_C')!;
  const smelter = buildingById.get('Build_SmelterMk1_C')!;
  assert.equal(r.totalPowerMW, (constructor.powerMW ?? 0) * 2 + (smelter.powerMW ?? 0) * 2);
});

// ---------------------------------------------------------------- 순환 거부 (ADR-0013)

test('순환 레시피는 계산을 거부한다 — 무한 루프에 빠지지 않는다', () => {
  const cyclic: Record<string, SolverRecipe> = {
    A: {
      id: 'R_A',
      ko: 'A 레시피',
      en: 'A',
      durationSec: 60,
      ingredients: [{ item: 'B', amount: 1, perMinute: 1 }],
      products: [{ item: 'A', amount: 1, perMinute: 1 }],
      producedIn: ['M'],
    },
    B: {
      id: 'R_B',
      ko: 'B 레시피',
      en: 'B',
      durationSec: 60,
      ingredients: [{ item: 'A', amount: 1, perMinute: 1 }],
      products: [{ item: 'B', amount: 1, perMinute: 1 }],
      producedIn: ['M'],
    },
  };
  const cyclicBook: RecipeBook = {
    recipeFor: (id) => cyclic[id],
    machine: () => ({ id: 'M', ko: '기계', en: 'Machine', powerMW: 4 }),
    nameOf: (id) => ({ ko: id, en: id }),
  };

  const r = solve('A', 10, cyclicBook);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason === 'cycle');
  assert.ok(!r.ok && r.cycle?.includes('A'));
  assert.ok(!r.ok && r.message.includes('순환'));
});

test('실제 게임의 순환 레시피(재활용 플라스틱·고무)도 거부된다', () => {
  const recycled: RecipeBook = {
    ...book,
    recipeFor: (id) => {
      if (id === 'Desc_Plastic_C') return recipes.find((r) => r.id === 'Recipe_Alternate_Plastic_1_C');
      if (id === 'Desc_Rubber_C') return recipes.find((r) => r.id === 'Recipe_Alternate_RecycledRubber_C');
      return book.recipeFor(id);
    },
  };
  // 재활용 플라스틱(고무+연료 → 플라스틱) ↔ 재활용 고무(플라스틱+연료 → 고무)
  assert.ok(recycled.recipeFor('Desc_Plastic_C'), '재활용 플라스틱 레시피가 있어야 함');
  assert.ok(recycled.recipeFor('Desc_Rubber_C'), '재활용 고무 레시피가 있어야 함');
  const r = solve('Desc_Plastic_C', 60, recycled);
  assert.equal(r.ok, false, '순환이므로 해를 내면 안 된다');
  assert.ok(!r.ok && r.reason === 'cycle');
});

// ---------------------------------------------------------------- 조언 계산

test('소수 대수 조언 — 4.5대는 5대 시 10% 유휴, 4대 + 112.5% 오버클럭', () => {
  const a = machineAdvice(div(fromNumber(9), fromNumber(2)));
  assert.equal(a.built, 5);
  assert.equal(a.idlePercent, 10);
  assert.equal(a.clock, 112.5);
});

test('정확히 맞아떨어지면 유휴가 0이다', () => {
  const a = machineAdvice(fromNumber(3));
  assert.equal(a.built, 3);
  assert.equal(a.idlePercent, 0);
});
