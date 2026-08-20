import assert from 'node:assert/strict';
import test from 'node:test';
import { portWorldPosition } from '../src/domain/factory/geometry.ts';
import { drawingSupported, requireMachineSpec } from '../src/domain/factory/specs.ts';
import type { FactoryPlan, Placement } from '../src/domain/factory/types.ts';
import { validateFactoryPlan } from '../src/domain/factory/validate.ts';

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
  assert.equal(drawingSupported('Build_FoundryMk1_C'), false);
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
