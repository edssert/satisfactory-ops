/**
 * 배치 생성 테스트 (FRD F13 P1).
 *
 * 도면은 "그럴듯하게 보이는 그림"이면 안 된다. 겹치지 않고, 벨트 상한을 지키고,
 * 블루프린트 경계를 넘지 않는지 코드로 검사한다.
 * 치수는 실제 게임 데이터에서 읽는다 — 테스트가 데이터 변화에도 반응해야 한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  DESIGNERS,
  TILE_M,
  chooseDistribution,
  findOverlaps,
  mergeStages,
  planLayout,
  validateGeometry,
  type BeltSpec,
  type StageInput,
} from '../src/lib/layout.ts';
import type { Building } from '../src/lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const buildings = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/app/buildings.json'), 'utf8')
) as Building[];
const byId = new Map(buildings.map((b) => [b.id, b]));

const belts: BeltSpec[] = buildings
  .filter((b) => b.beltItemsPerMinute != null)
  .sort((a, b) => a.beltItemsPerMinute! - b.beltItemsPerMinute!)
  .map((b) => ({ ko: b.ko, perMinute: b.beltItemsPerMinute!, tier: b.unlockTier }));

const beltMk1 = belts.find((b) => b.perMinute === 60)!;

function stage(over: Partial<StageInput> & { machineId: string }): StageInput {
  const b = byId.get(over.machineId)!;
  return {
    key: over.key ?? 'stage',
    recipeId: over.recipeId,
    itemKo: over.itemKo ?? '아이템',
    itemEn: over.itemEn ?? 'Item',
    recipeKo: over.recipeKo ?? '레시피',
    ratePerMinute: over.ratePerMinute ?? 60,
    machinesExact: over.machinesExact ?? 1,
    machineId: b.id,
    machineKo: b.ko,
    machineEn: b.en,
    footprint: b.footprint,
    powerMW: b.powerMW,
    inputs: over.inputs ?? [],
    byproducts: over.byproducts ?? [],
  };
}

// ---------------------------------------------------------------- 치수

test('건물 치수가 게임 데이터에서 온다 — 제작기 8×10×6 m', () => {
  const f = byId.get('Build_ConstructorMk1_C')!.footprint!;
  assert.equal(f.widthM, 8);
  assert.equal(f.lengthM, 10);
  assert.equal(f.heightM, 6);
});

test('타일 환산 — 제련소는 1×2, 제조기는 3×2', () => {
  const smelter = byId.get('Build_SmelterMk1_C')!.footprint!;
  const manu = byId.get('Build_ManufacturerMk1_C')!.footprint!;
  assert.equal(Math.ceil(smelter.widthM / TILE_M), 1);
  assert.equal(Math.ceil(smelter.lengthM / TILE_M), 2);
  assert.equal(Math.ceil(manu.widthM / TILE_M), 3);
  assert.equal(Math.ceil(manu.lengthM / TILE_M), 2);
});

// ---------------------------------------------------------------- 분배 방식 (F13-J)

test('벨트 한 줄에 들어가면 매니폴드', () => {
  const d = chooseDistribution(4, [{ itemKo: '철 주괴', perMinute: 60, isFluid: false }], beltMk1);
  assert.equal(d.kind, 'manifold');
  assert.equal(d.lines, 1);
});

test('벨트 한 줄을 넘으면 매니폴드를 제안하지 않는다 (F13-52)', () => {
  const d = chooseDistribution(6, [{ itemKo: '철 주괴', perMinute: 180, isFluid: false }], beltMk1);
  assert.equal(d.kind, 'injected-manifold');
  assert.equal(d.lines, 3);
  assert.match(d.reason, /굶/);
});

test('기계가 한 대면 분배 자체가 없다', () => {
  assert.equal(
    chooseDistribution(1, [{ itemKo: '철 주괴', perMinute: 30, isFluid: false }], beltMk1).kind,
    'direct'
  );
});


test('재료 유량을 더하지 않고 품목별로 판정한다', () => {
  // 보강된 철판: 철판 360/분 + 나사 720/분. 합치면 1080이지만 벨트는 품목마다 따로다.
  const d = chooseDistribution(
    12,
    [
      { itemKo: '철판', perMinute: 360, isFluid: false },
      { itemKo: '나사', perMinute: 720, isFluid: false },
    ],
    beltMk1
  );
  assert.equal(d.binding, '나사', '가장 많이 흐르는 품목이 판정을 지배해야 한다');
  assert.equal(d.lines, 12, '720 / 60 = 12줄 — 1080을 기준으로 삼으면 18줄이 나온다');
});

test('디자이너가 없어도 한 줄이 32m를 넘지 않는다 (F13-19)', () => {
  const result = planLayout([stage({ machineId: 'Build_AssemblerMk1_C', machinesExact: 12 })], {
    belt: beltMk1,
    designerMk: null,
  });
  const m = result.modules[0]!;
  assert.ok(m.widthTiles <= 4, `한 줄 폭이 ${m.widthTiles}타일 — Mk.1 블루프린트 4타일을 넘으면 나중에 묶을 수 없다`);
});


test('같은 레시피를 쓰는 공정은 한 라인으로 합친다', () => {
  // 철 주괴는 철판 가지와 철봉 가지에 각각 매달려 두 번 나온다
  const merged = mergeStages([
    stage({ key: 'a', recipeId: 'Recipe_IngotIron_C', machineId: 'Build_SmelterMk1_C', machinesExact: 6, ratePerMinute: 180, inputs: [{ itemKo: '철 광석', perMinute: 180, isFluid: false }] }),
    stage({ key: 'b', recipeId: 'Recipe_IngotIron_C', machineId: 'Build_SmelterMk1_C', machinesExact: 18, ratePerMinute: 540, inputs: [{ itemKo: '철 광석', perMinute: 540, isFluid: false }] }),
  ]);
  assert.equal(merged.length, 1, '같은 레시피가 두 라인으로 갈라지면 도면이 공장이 아니라 트리를 그린 것이다');
  assert.equal(merged[0]!.machinesExact, 24);
  assert.equal(merged[0]!.ratePerMinute, 720);
  assert.equal(merged[0]!.inputs[0]!.perMinute, 720);
});

// ---------------------------------------------------------------- 배치

test('기계가 겹치지 않는다', () => {
  const result = planLayout(
    [
      stage({ key: 'plate', machineId: 'Build_ConstructorMk1_C', machinesExact: 4.5, inputs: [{ itemKo: '철 주괴', perMinute: 135, isFluid: false }] }),
      stage({ key: 'ingot', machineId: 'Build_SmelterMk1_C', machinesExact: 4.5, inputs: [{ itemKo: '철 광석', perMinute: 135, isFluid: false }] }),
    ],
    { belt: beltMk1, betterBelts: belts, designerMk: null }
  );
  assert.deepEqual(findOverlaps(result), []);
});

test('소수 대수는 올려서 짓는다 — 4.5대 → 5대', () => {
  const result = planLayout([stage({ machineId: 'Build_ConstructorMk1_C', machinesExact: 4.5 })], {
    belt: beltMk1,
    designerMk: null,
  });
  assert.equal(result.modules[0]!.machinesBuilt, 5);
  assert.equal(result.modules[0]!.placements.length, 5);
});

test('부동소수점 오차로 대수가 하나 늘지 않는다', () => {
  const result = planLayout([stage({ machineId: 'Build_ConstructorMk1_C', machinesExact: 4.0000000001 })], {
    belt: beltMk1,
    designerMk: null,
  });
  assert.equal(result.modules[0]!.machinesBuilt, 4);
});


test('도면 기하가 성립한다 — 기계·레인·모듈이 겹치지 않는다', () => {
  const result = planLayout(
    [
      stage({ key: 'rip', machineId: 'Build_AssemblerMk1_C', machinesExact: 12, inputs: [{ itemKo: '철판', perMinute: 360, isFluid: false }] }),
      stage({ key: 'plate', machineId: 'Build_ConstructorMk1_C', machinesExact: 18, inputs: [{ itemKo: '철 주괴', perMinute: 540, isFluid: false }] }),
      stage({ key: 'ingot', machineId: 'Build_SmelterMk1_C', machinesExact: 18, inputs: [{ itemKo: '철 광석', perMinute: 540, isFluid: false }] }),
    ],
    { belt: beltMk1, betterBelts: belts, designerMk: null }
  );
  assert.deepEqual(validateGeometry(result), [], '도면 기하 문제가 있으면 지을 수 없는 그림이다');
});

test('기계 줄마다 공급 레인이 하나씩 있다', () => {
  const result = planLayout([stage({ machineId: 'Build_SmelterMk1_C', machinesExact: 12 })], {
    belt: beltMk1,
    designerMk: null,
  });
  const m = result.modules[0]!;
  const rows = new Set(m.placements.map((p) => p.y)).size;
  assert.equal(m.supplyLanes.length, rows, '줄 수와 공급 레인 수가 같아야 분기선이 다른 기계를 가로지르지 않는다');
});

// ---------------------------------------------------------------- 블루프린트 경계 (F13-16)

test('입자 가속기는 Mk.1 디자이너에 들어가지 않는다 — 위키와 같은 결론', () => {
  const result = planLayout([stage({ machineId: 'Build_HadronCollider_C', machinesExact: 1 })], {
    belt: beltMk1,
    designerMk: 1,
  });
  assert.equal(result.ok, false);
  const err = result.modules[0]!.warnings.find((w) => w.code === 'machine-too-big');
  assert.ok(err, '경계 초과가 잡혀야 한다');
  assert.match(err!.message, /52/);
});

test('제련소 10대는 Mk.1 한 장에 안 들어가 스탬프가 여러 장 필요하다', () => {
  const result = planLayout([stage({ machineId: 'Build_SmelterMk1_C', machinesExact: 10 })], {
    belt: beltMk1,
    designerMk: 1,
  });
  const m = result.modules[0]!;
  assert.equal(m.machinesBuilt, 10);
  assert.ok(m.stamps >= 1);
  assert.equal(m.widthTiles <= DESIGNERS[0].innerM / TILE_M, true, '모듈 폭이 디자이너 폭을 넘으면 안 된다');
});

test('디자이너 미해금이면 32m 배수 정렬을 안내한다 (F13-19)', () => {
  const result = planLayout([stage({ machineId: 'Build_ConstructorMk1_C', machinesExact: 2 })], {
    belt: beltMk1,
    designerMk: null,
  });
  const note = result.warnings.find((w) => w.code === 'no-designer');
  assert.ok(note);
  assert.match(note!.message, /티어 4/);
});

// ---------------------------------------------------------------- 경고

test('부산물이 있으면 양쪽을 다 빼라고 경고한다 (F13-56)', () => {
  const result = planLayout(
    [stage({ machineId: 'Build_OilRefinery_C', machinesExact: 2, byproducts: [{ itemKo: '중유 잔여물', perMinute: 30 }] })],
    { belt: beltMk1, designerMk: null }
  );
  const w = result.modules[0]!.warnings.find((x) => x.code === 'byproduct');
  assert.ok(w);
  assert.match(w!.message, /멈춥니다/);
});

test('벨트 상한을 넘으면 더 높은 등급을 제안한다', () => {
  const result = planLayout(
    [stage({ machineId: 'Build_ConstructorMk1_C', machinesExact: 6, inputs: [{ itemKo: '철 주괴', perMinute: 180, isFluid: false }] })],
    { belt: beltMk1, betterBelts: belts, designerMk: null }
  );
  const w = result.modules[0]!.warnings.find((x) => x.code === 'belt-over-capacity');
  assert.ok(w);
  assert.match(w!.message, /Mk\.\d/);
});

test('높이가 층고를 넘는 기계를 알려준다 — 제조기 15m', () => {
  const result = planLayout([stage({ machineId: 'Build_ManufacturerMk1_C', machinesExact: 1 })], {
    belt: beltMk1,
    designerMk: null,
    floorHeightM: 8,
  });
  const w = result.modules[0]!.warnings.find((x) => x.code === 'tall-machine');
  assert.ok(w, '15m 기계가 8m 층고를 넘는 것을 잡아야 한다');
  assert.match(w!.message, /2개분/);
});

test('유체 입력이 있으면 1층 배치를 권고한다', () => {
  const result = planLayout(
    [stage({ machineId: 'Build_OilRefinery_C', machinesExact: 1, inputs: [{ itemKo: '원유', perMinute: 30, isFluid: true }] })],
    { belt: beltMk1, designerMk: null }
  );
  assert.ok(result.modules[0]!.warnings.some((w) => w.code === 'fluid'));
});
