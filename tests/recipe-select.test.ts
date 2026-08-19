/**
 * 기본 레시피 선택 규칙 테스트.
 *
 * 실제 사고: 계산기가 "순환 구간: 철 광석 → 석회석 → 황 → 석탄 → 철 광석"이라며 계산을 거부했다.
 * 원광 변환기 레시피를 생산 경로로 본 것이 원인이었고, 고치고 나니 포장/개봉 순환이 33건 남았다.
 * 여기서는 **모든 계산기 목표를 실제로 풀어** 순환이 0건인지 확인한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isUnpackaging, producerIndex, selectCalculatorRecipes } from '../src/lib/recipe-select.ts';
import { solve, type RecipeBook } from '../src/lib/solver.ts';
import type { Item, Recipe } from '../src/lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const allRecipes = read('src/data/app/recipes.json') as Recipe[];
const items = read('src/data/app/items.json') as Item[];
const buildings = read('src/data/app/buildings.json') as {
  id: string;
  ko: string;
  en: string;
  powerMW: number | null;
}[];

const itemById = new Map(items.map((i) => [i.id, i]));
const buildingById = new Map(buildings.map((b) => [b.id, b]));
const isRaw = (id: string) => itemById.get(id)?.kind === 'resource';

const usable = selectCalculatorRecipes(allRecipes, isRaw);
const producers = producerIndex(usable);
const recipeById = new Map(usable.map((r) => [r.id, r]));

const book: RecipeBook = {
  recipeFor: (id) => {
    const list = producers[id];
    return list?.[0] ? recipeById.get(list[0]) : undefined;
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

test('원광은 만들 수 있는 대상이 아니다 (광석 변환기 레시피 제외)', () => {
  const oreTargets = Object.keys(producers).filter(isRaw);
  assert.deepEqual(
    oreTargets,
    [],
    `원광이 생산 대상에 들어 있다: ${oreTargets.map((o) => itemById.get(o)?.ko).join(', ')}`
  );
  // 변환 레시피 자체는 데이터에 존재해야 한다 — 제외한 것이지 사라진 게 아니다
  assert.ok(
    allRecipes.some((r) => r.id === 'Recipe_Iron_Limestone_C'),
    '광석 변환 레시피가 데이터에서 사라졌다면 제외 규칙을 재검토해야 한다'
  );
});

test('개봉 레시피를 기본값으로 고르지 않는다', () => {
  const wrong: string[] = [];
  for (const [itemId, list] of Object.entries(producers)) {
    const first = recipeById.get(list[0]!);
    if (first && isUnpackaging(first)) wrong.push(`${itemById.get(itemId)?.ko} → ${first.ko}`);
  }
  assert.deepEqual(wrong, [], `개봉 레시피가 기본값으로 선택됨: ${wrong.join(' / ')}`);
});

test('부산물로만 나오는 레시피를 기본값으로 고르지 않는다 — 압축 석탄', () => {
  const first = recipeById.get(producers['Desc_CompactedCoal_C']![0]!)!;
  assert.equal(
    first.products[0]!.item,
    'Desc_CompactedCoal_C',
    `압축 석탄의 기본 레시피가 "${first.ko}"인데, 여기서 압축 석탄은 부산물이다`
  );
});

test('계산기의 모든 목표가 순환 없이 풀린다', () => {
  const targets = Object.keys(producers);
  assert.ok(targets.length > 100, `목표가 너무 적다: ${targets.length}`);

  const failures: string[] = [];
  for (const target of targets) {
    const result = solve(target, 60, book);
    if (!result.ok) {
      const label = itemById.get(target)?.ko ?? target;
      const cycle = result.cycle?.map((c) => itemById.get(c)?.ko ?? c).join(' → ') ?? result.reason;
      failures.push(`${label} :: ${cycle}`);
    }
  }
  assert.deepEqual(failures, [], `순환으로 계산 불가:\n  ${failures.join('\n  ')}`);
});

test('실제 게임 순환(재활용 플라스틱·고무)은 사용자가 켰을 때만 나타난다', () => {
  // 기본값에는 대체 레시피가 안 들어가므로 플라스틱은 정상적으로 풀려야 한다
  const result = solve('Desc_Plastic_C', 60, book);
  assert.ok(result.ok, '기본 레시피로는 플라스틱이 풀려야 한다');
});
