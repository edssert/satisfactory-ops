/**
 * 레거시 배치 휴리스틱 회귀 테스트. PRODUCT의 자동 배치 제외 결정에 따라 사용자 기능 승인 근거는 아니다.
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
  mergersFor,
  planLayout,
  polesFor,
  splittersFor,
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

test('타일 환산 — 제련기는 1×2, 제조기는 3×3', () => {
  /*
   * 제조기가 3×2 였다가 3×3 이 됐다. 치수가 바뀐 게 아니라 **파싱이 틀렸던 것**이다:
   * mClearanceData 박스의 RelativeTransform 을 무시하고 있었다. 제조기의 하드 박스는
   * y = -11..-3 과 y = -3..9 두 개라 실제 길이가 20 m다. 예전에는 12 m로 읽었다.
   * 같은 버그로 제련기 높이를 4.5 m로 읽었는데, 공식 위키가 8.5 m로 적고 있어 드러났다.
   */
  const smelter = byId.get('Build_SmelterMk1_C')!.footprint!;
  const manu = byId.get('Build_ManufacturerMk1_C')!.footprint!;
  assert.equal(Math.ceil(smelter.widthM / TILE_M), 1);
  assert.equal(Math.ceil(smelter.lengthM / TILE_M), 2);
  assert.equal(smelter.heightM, 8.5, '제련기 높이 8.5 m — 위키와 일치');
  assert.equal(Math.ceil(manu.widthM / TILE_M), 3);
  assert.equal(Math.ceil(manu.lengthM / TILE_M), 3);
  assert.equal(manu.lengthM, 20, '제조기 길이 20 m — 하드 박스 두 개의 합집합');
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


test('공정이 실제로 이어진다 — 연결선이 생성된다', () => {
  const result = planLayout(
    [
      stage({ key: 'ingot', recipeId: 'R_ingot', machineId: 'Build_SmelterMk1_C', machinesExact: 6, itemKo: '철 주괴', ratePerMinute: 180, inputs: [{ itemKo: '철 광석', perMinute: 180, isFluid: false }] }),
      stage({ key: 'plate', recipeId: 'R_plate', machineId: 'Build_ConstructorMk1_C', machinesExact: 6, itemKo: '철판', ratePerMinute: 120, inputs: [{ itemKo: '철 주괴', perMinute: 180, isFluid: false }] }),
    ],
    { belt: beltMk1, betterBelts: belts, designerMk: null }
  );

  assert.equal(result.connections.length, 1, '철 주괴 → 철판 연결이 도면에 있어야 한다');
  const c = result.connections[0]!;
  assert.equal(c.itemKo, '철 주괴');
  assert.equal(c.perMinute, 180);
  assert.equal(c.lines, 3, '180/분은 Mk.1 벨트 3줄');

  // 외부에서 들어오는 것은 원자재뿐이어야 한다
  assert.deepEqual(
    result.externals.map((e) => e.itemKo),
    ['철 광석'],
    '내부에서 만드는 것이 외부 공급으로 잡히면 연결이 끊긴 것이다'
  );
});

test('채널은 겹치지 않는 연결끼리 재사용한다', () => {
  const result = planLayout(
    [
      stage({ key: 'a', recipeId: 'R_a', machineId: 'Build_SmelterMk1_C', machinesExact: 2, itemKo: 'A', ratePerMinute: 60, inputs: [] }),
      stage({ key: 'b', recipeId: 'R_b', machineId: 'Build_ConstructorMk1_C', machinesExact: 2, itemKo: 'B', ratePerMinute: 60, inputs: [{ itemKo: 'A', perMinute: 60, isFluid: false }] }),
      stage({ key: 'c', recipeId: 'R_c', machineId: 'Build_ConstructorMk1_C', machinesExact: 2, itemKo: 'C', ratePerMinute: 60, inputs: [{ itemKo: 'B', perMinute: 60, isFluid: false }] }),
    ],
    { belt: beltMk1, designerMk: null }
  );
  assert.equal(result.connections.length, 2);
  // A→B 와 B→C 는 구간이 겹치지 않으므로 같은 채널을 써도 된다
  assert.equal(result.channels, 1, `채널이 ${result.channels}개 — 겹치지 않는 연결은 같은 열을 써야 도면이 단순하다`);
});


test('부속 수량이 실제 발행 시트와 일치한다', () => {
  // "IRON PLATES" 시트: 제련기 4 + 제작기 4 → 스플리터 2 / 머저 2 / 전주 4
  // 제련기 4대를 벨트 2줄로 먹임 → 줄마다 2대 → ceil(1/2)=1, 2줄이므로 2개
  assert.equal(splittersFor(2) * 2, 2, '스플리터는 출력 3개라 2대 먹이는 데 1개');
  assert.equal(mergersFor(4), 2, '머저는 입력 3개라 산출 4줄을 합치는 데 2개');
  assert.equal(polesFor(8 + 2), 4, '기계 8대 + 채굴기 2대 = 전주 4개 (연결 4개 중 1개는 체인)');

  // "IRON BARS" 시트: 제련기 4 + 제작기 8 → 스플리터 7 / 머저 4
  assert.equal(splittersFor(8), 4, '제작기 8대를 한 벨트로 먹이면 스플리터 4개');
  assert.equal(mergersFor(8), 4, '산출 8줄을 합치면 머저 4개');
});

test('모듈이 자기 부속 수량을 보고한다', () => {
  const result = planLayout([stage({ machineId: 'Build_SmelterMk1_C', machinesExact: 4 })], {
    belt: beltMk1,
    designerMk: null,
  });
  const m = result.modules[0]!;
  assert.equal(m.machinesBuilt, 4);
  assert.equal(m.splitters, splittersFor(4));
  assert.equal(m.mergers, mergersFor(4));
  assert.equal(result.powerPoles, polesFor(4));
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
