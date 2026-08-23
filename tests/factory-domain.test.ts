import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { drawingPixelSize, factoryDrawingBounds } from '../src/domain/factory/drawing-bounds.ts';
import { isStoredPlan, migrateStoredPlan, restoreStoredPlan, toStoredPlan } from '../src/domain/factory/editor-state.ts';
import { portWorldPosition } from '../src/domain/factory/geometry.ts';
import { routeAroundMachines } from '../src/domain/factory/route.ts';
import { drawingSupported, requireMachineSpec } from '../src/domain/factory/specs.ts';
import { transportPathParts } from '../src/domain/factory/transport-geometry.ts';
import { transportSpecForFlow } from '../src/domain/factory/transport-specs.ts';
import type { FactoryPlan, Placement } from '../src/domain/factory/types.ts';
import { validateFactoryPlan } from '../src/domain/factory/validate.ts';
import portRows from '../src/data/curated/machine-ports.json' with { type: 'json' };
import topviewRows from '../src/data/curated/topview-assets.json' with { type: 'json' };
import { runtimeTopviewAssets } from '../src/lib/topview-assets.ts';
import { parsePlannerHandoff } from '../src/state/planner-handoff.ts';

function foundationGrid(minX: number, maxX: number, minY: number, maxY: number) {
  const tiles = [];
  for (let y = minY; y < maxY; y += 8) {
    for (let x = minX; x < maxX; x += 8) {
      tiles.push({ id: `foundation:${x}:${y}`, xM: x, yM: y, zM: 0, sizeM: 8 });
    }
  }
  return tiles;
}

const smelter: Placement = {
  id: 'smelter-1',
  spec: requireMachineSpec('Build_SmelterMk1_C'),
  positionM: { x: 0, y: 0, z: 0 },
  rotation: 0,
  operation: { inputRates: {}, outputRates: { Desc_IronIngot_C: 30 } },
};
const constructor: Placement = {
  id: 'constructor-1',
  spec: requireMachineSpec('Build_ConstructorMk1_C'),
  positionM: { x: 12, y: 0, z: 0 },
  rotation: 0,
  operation: { inputRates: { Desc_IronIngot_C: 30 }, outputRates: {} },
};

const output = smelter.spec.ports.find((port) => port.direction === 'output');
const input = constructor.spec.ports.find((port) => port.direction === 'input');
assert(output && input);

const validPlan: FactoryPlan = {
  schemaVersion: 1,
  id: 'verified-line',
  foundations: [
    { id: 'f0', xM: -4, yM: -8, zM: 0, sizeM: 8 },
    { id: 'f1', xM: -4, yM: 0, zM: 0, sizeM: 8 },
    { id: 'f2', xM: 8, yM: -8, zM: 0, sizeM: 8 },
    { id: 'f3', xM: 8, yM: 0, zM: 0, sizeM: 8 },
  ],
  placements: [smelter, constructor],
  transports: [{
    id: 'belt-1',
    from: { placementId: smelter.id, portId: output.id },
    to: { placementId: constructor.id, portId: input.id },
    medium: 'solid',
    itemId: 'Desc_IronIngot_C',
    flowPerMinute: 30,
    transportClass: 'Build_ConveyorBeltMk1_C',
    capacityPerMinute: 60,
    pathM: [portWorldPosition(smelter, output), portWorldPosition(constructor, input)],
  }],
  powerSources: [{ id: 'grid-1', capacityMW: 20 }],
  powerEdges: [
    { id: 'wire-1', from: 'grid-1', to: smelter.id },
    { id: 'wire-2', from: smelter.id, to: constructor.id },
  ],
};

test('반복 관측한 제작기·제련기 포트 좌표를 그대로 쓴다', () => {
  assert.deepEqual(input.positionM, { x: 0, y: -3, z: 1 });
  assert.deepEqual(output.positionM, { x: 0, y: 2, z: 1 });
  assert.equal(input.confidence, 'verified');
});

test('포트 일부만 관측한 설비는 도면 발행 대상으로 승격하지 않는다', () => {
  assert.equal(drawingSupported('Build_OilRefinery_C'), true);
  assert.equal(drawingSupported('Build_FoundryMk1_C'), true);
  assert.equal(drawingSupported('Build_ManufacturerMk1_C'), false);
  assert.equal(requireMachineSpec('Build_FoundryMk1_C').ports.length, 4);
  assert.equal(requireMachineSpec('Build_OilRefinery_C').ports.length, 5);
});

test('실제 포트·지지·용량·전력이 완결된 계획만 발행한다', () => {
  const result = validateFactoryPlan(validPlan);
  assert.equal(result.publishable, true, JSON.stringify(result.issues, null, 2));
});

test('충돌과 용량 초과, 포트 미접속을 동시에 보고한다', () => {
  const broken = structuredClone(validPlan);
  broken.placements[1].positionM.x = 2;
  broken.transports[0].capacityPerMinute = 20;
  broken.transports[0].pathM[0].x += 1;
  const result = validateFactoryPlan(broken);
  assert.equal(result.publishable, false);
  const codes = new Set(result.issues.map((entry) => entry.code));
  assert(codes.has('MACHINE_COLLISION'));
  assert(codes.has('TRANSPORT_CAPACITY'));
  assert(codes.has('ROUTE_ENDPOINT'));
});

test('빈 판은 시공 도면으로 발행하지 않는다', () => {
  const result = validateFactoryPlan({
    schemaVersion: 1,
    id: 'empty',
    foundations: [],
    placements: [],
    transports: [],
    powerSources: [],
    powerEdges: [],
  });
  assert.equal(result.publishable, false);
  assert.ok(result.issues.some((entry) => entry.code === 'EMPTY_PLAN'));
});

test('Anders 카탈로그에서 직접 그린 수동 벨트는 설비 포트 없이도 유효한 탑뷰 도면이다', () => {
  const result = validateFactoryPlan({
    schemaVersion: 1,
    id: 'manual-belt',
    placements: [],
    foundations: [],
    transports: [{
      id: 'route-1',
      from: { placementId: 'manual:route-1', portId: 'start' },
      to: { placementId: 'manual:route-1', portId: 'end' },
      medium: 'solid',
      itemId: 'unassigned',
      flowPerMinute: 0,
      transportClass: 'Build_ConveyorBeltMk1_C',
      capacityPerMinute: 60,
      pathM: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }, { x: 8, y: 8, z: 0 }],
    }],
    rails: [],
    powerSources: [],
    powerEdges: [],
  });
  assert.equal(result.publishable, true, JSON.stringify(result.issues, null, 2));
});

test('편집 JSON은 운전 설정·수동 경로·층고를 바꾸지 않고 왕복한다', () => {
  const edited = structuredClone(validPlan);
  edited.placements[0].positionM.z = 8;
  edited.placements[0].operation = {
    recipeId: 'Recipe_IngotIron_C',
    recipeName: '철 주괴',
    clockPercent: 150,
    powerShards: 1,
    somersloops: 1,
    outputMultiplier: 2,
    inputRates: { Desc_OreIron_C: 45 },
    outputRates: { Desc_IronIngot_C: 90 },
    powerDemandMW: 9.7,
  };
  edited.transports[0].pathM = [
    { x: 0, y: 2, z: 9 },
    { x: 0, y: 7, z: 9 },
    { x: 12, y: 7, z: 1 },
    { x: 12, y: -3, z: 1 },
  ];
  const rails = [{ id: 'rail-1', pathM: [{ x: -8, y: -8, z: 0 }, { x: 24, y: -8, z: 0 }] }];
  const stored = toStoredPlan(edited.placements, edited.foundations, edited.transports, rails);
  const parsed = JSON.parse(JSON.stringify(stored)) as unknown;
  assert.equal(isStoredPlan(parsed), true);
  if (!isStoredPlan(parsed)) return;
  const specs = new Map(edited.placements.map((placement) => [placement.spec.buildingClass, placement.spec]));
  const restored = restoreStoredPlan(parsed, specs);
  assert.deepEqual(toStoredPlan(restored.placements, restored.foundations, restored.transports, restored.rails), stored);
});

test('이전 도면의 고정 용량 경로는 게임 데이터 기반 최소 Mk로 마이그레이션된다', () => {
  const legacy = toStoredPlan(validPlan.placements, validPlan.foundations, validPlan.transports) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 4;
  legacy.transports = (legacy.transports as Array<Record<string, unknown>>).map(({ transportClass: _transportClass, ...route }) => ({
    ...route,
    flowPerMinute: 61,
    capacityPerMinute: 60,
  }));
  const migrated = migrateStoredPlan(legacy);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.transports[0].capacityPerMinute, 120);
  assert.equal(migrated.transports[0].transportClass, transportSpecForFlow('solid', 61).buildingClass);
});

test('철도 경로는 설비 없이도 유효한 미터 좌표 도면으로 저장·검증된다', () => {
  const plan: FactoryPlan = {
    schemaVersion: 1,
    id: 'rail-only',
    placements: [],
    foundations: [],
    transports: [],
    rails: [{ id: 'rail-1', pathM: [{ x: 0, y: 0, z: 0 }, { x: 32, y: 0, z: 0 }] }],
    powerSources: [],
    powerEdges: [],
  };
  assert.equal(validateFactoryPlan(plan, { validatePower: false }).publishable, true);
  plan.rails![0].pathM[1] = { x: 0, y: 0, z: 0 };
  assert.equal(validateFactoryPlan(plan, { validatePower: false }).issues.some((entry) => entry.code === 'RAIL_GEOMETRY'), true);
});

test('운송 규격은 게임 데이터에서 유량을 만족하는 최소 벨트·파이프 Mk를 고른다', () => {
  assert.equal(transportSpecForFlow('solid', 61).capacityPerMinute, 120);
  assert.equal(transportSpecForFlow('solid', 781).capacityPerMinute, 1200);
  assert.equal(transportSpecForFlow('fluid', 301).capacityPerMinute, 600);
});

test('계산→설계 대기열은 설비·레시피·클럭·남은 대수·목표 유량을 검증한다', () => {
  const handoff = parsePlannerHandoff({
    schemaVersion: 1,
    createdAt: '2026-08-23T00:00:00.000Z',
    entries: [{
      id: 'handoff:constructor',
      buildingClass: 'Build_ConstructorMk1_C',
      recipeId: 'Recipe_IronPlate_C',
      clockPercent: 50,
      remaining: 2,
      targetItemId: 'Desc_IronPlate_C',
      targetFlowPerMinute: 20,
    }],
  });
  assert.ok(handoff);
  assert.equal(handoff.entries[0].remaining, 2);
  assert.equal(parsePlannerHandoff({ ...handoff, entries: [{ ...handoff.entries[0], remaining: 0 }] }), null);
});

test('도면 내보내기 경계는 실제 미터 축척과 고해상도 픽셀 크기를 공유한다', () => {
  const bounds = factoryDrawingBounds([], [{ id: 'f0', xM: 0, yM: 0, zM: 0, sizeM: 8 }], [], 4);
  assert.deepEqual(bounds, { x: -4, y: -4, width: 16, height: 16 });
  assert.deepEqual(drawingPixelSize(bounds!), { width: 1536, height: 1536 });
  const large = drawingPixelSize({ x: 0, y: 0, width: 200, height: 100 });
  assert.deepEqual(large, { width: 8192, height: 4096 });
});

test('물류 경로는 평면 벨트·90도 곡선·수직 리프트 부품으로 분해된다', () => {
  const parts = transportPathParts([
    { x: 0, y: 0, z: 1 },
    { x: 4, y: 0, z: 1 },
    { x: 4, y: 4, z: 1 },
    { x: 4, y: 4, z: 9 },
    { x: 8, y: 4, z: 9 },
  ]);
  assert.equal(parts.belts.length, 3);
  assert.equal(parts.turns.length, 1);
  assert.equal(parts.turns[0].assetRotationDeg, 270);
  assert.equal(parts.turns[0].touchesIncline, false);
  assert.equal(parts.lifts.length, 1);
  assert.equal(parts.lifts[0].heightM, 8);
});

test('과경사와 경사 중 회전은 각각 시공 오류로 분리된다', () => {
  const broken = structuredClone(validPlan);
  broken.transports[0].pathM = [
    portWorldPosition(smelter, output),
    { x: 0, y: 6, z: 1 },
    { x: 4, y: 6, z: 9 },
    { x: 4, y: 10, z: 9 },
    { x: 4, y: 10, z: 1 },
    { x: 12, y: 10, z: 1 },
    portWorldPosition(constructor, input),
  ];
  const codes = new Set(validateFactoryPlan(broken).issues.map((entry) => entry.code));
  assert.equal(codes.has('ROUTE_INCLINE'), true);
  assert.equal(codes.has('ROUTE_TURN_INCLINE'), true);
});

test('설계판에 공개하는 설비는 현재 설치본에서 직접 만든 승인 탑뷰만 쓴다', () => {
  const assets = new Map(runtimeTopviewAssets
    .filter((entry) => 'buildingClass' in entry)
    .map((entry) => [entry.buildingClass, entry]));
  assert.ok(assets.size > 0);
  for (const [buildingClass, asset] of assets) {
    assert.equal(asset.sourceId, 'game-install-cl-502094', buildingClass);
    assert.equal(asset.reviewStatus, 'approved', buildingClass);
    assert.equal(existsSync(`public/${asset.path}`), true, buildingClass);
  }
});

test('외부 대조 자산은 매니페스트에 남아도 런타임 공개 집합에는 들어오지 않는다', () => {
  const runtimeIds = new Set(runtimeTopviewAssets.map((entry) => entry.assetId));
  const external = topviewRows.assets.filter((entry) => entry.sourceId === 'anders-2023');
  assert.ok(external.length > 0);
  assert.deepEqual(external.filter((entry) => runtimeIds.has(entry.assetId)), []);
});

test('직교 라우터는 중간 설비의 하드 클리어런스를 우회한다', () => {
  const pole: Placement = {
    id: 'pole-1',
    spec: requireMachineSpec('Build_PowerPoleMk1_C'),
    positionM: { x: 6, y: 4, z: 0 },
    rotation: 0,
  };
  const pathM = routeAroundMachines(smelter, output, constructor, input, [smelter, constructor, pole]);
  const routed: FactoryPlan = structuredClone(validPlan);
  routed.placements.push(pole);
  routed.transports[0].pathM = pathM;
  const result = validateFactoryPlan(routed);
  assert.ok(pathM.length >= 4, JSON.stringify(pathM));
  assert.equal(result.issues.some((entry) => entry.code === 'ROUTE_COLLISION'), false, JSON.stringify(pathM));
});

test('같은 높이의 벨트가 접속 장치 없이 교차하면 발행을 막는다', () => {
  const smelter = requireMachineSpec('Build_SmelterMk1_C');
  const constructor = requireMachineSpec('Build_ConstructorMk1_C');
  const placements = [
    { id: 'a', spec: smelter, positionM: { x: -12, y: -12, z: 0 }, rotation: 0 as const },
    { id: 'b', spec: constructor, positionM: { x: 12, y: 12, z: 0 }, rotation: 180 as const },
    { id: 'c', spec: smelter, positionM: { x: 12, y: -12, z: 0 }, rotation: 0 as const },
    { id: 'd', spec: constructor, positionM: { x: -12, y: 12, z: 0 }, rotation: 180 as const },
  ];
  const plan = {
    schemaVersion: 1 as const,
    id: 'crossing',
    placements,
    foundations: foundationGrid(-32, 32, -32, 32),
    transports: [
      {
        id: 'route-a', from: { placementId: 'a', portId: 'Output2' }, to: { placementId: 'b', portId: 'Input0' },
        medium: 'solid' as const, itemId: 'test', flowPerMinute: 0, transportClass: 'Build_ConveyorBeltMk1_C', capacityPerMinute: 60,
        pathM: [{ x: -12, y: -10, z: 1 }, { x: -12, y: 0, z: 1 }, { x: 12, y: 0, z: 1 }, { x: 12, y: 9, z: 1 }],
      },
      {
        id: 'route-b', from: { placementId: 'c', portId: 'Output2' }, to: { placementId: 'd', portId: 'Input0' },
        medium: 'solid' as const, itemId: 'test', flowPerMinute: 0, transportClass: 'Build_ConveyorBeltMk1_C', capacityPerMinute: 60,
        pathM: [{ x: 12, y: -10, z: 1 }, { x: 0, y: -10, z: 1 }, { x: 0, y: 9, z: 1 }, { x: -12, y: 9, z: 1 }],
      },
    ],
    powerSources: [],
    powerEdges: [],
  };
  const result = validateFactoryPlan(plan);
  assert.equal(result.issues.some((entry) => entry.code === 'ROUTE_CROSSING'), true);
});
