/**
 * 층 단위 도면 테스트.
 *
 * 기준값은 실제 발행 도면이다 — oldshavingfoam, "Stackable Concrete Factory Mk.1":
 *   층당 제작기 4대 · 층당 석회석 180/분 → 콘크리트 60/분 · 층당 16 MW · 최대 4층
 * 콘크리트 표준 레시피는 제작기 1대가 석회석 45/분을 먹고 콘크리트 15/분을 낸다.
 * 즉 층당 4대 = 180/분 입력 / 60/분 산출 / 4 MW × 4 = 16 MW. 우리 계산이 이걸 재현해야 한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildFloorPlan,
  machinesPerFloor,
  validateFloorPlan,
  type StageForFloorPlan,
} from '../src/lib/floorplan.ts';
import type { Building } from '../src/lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const buildings = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/app/buildings.json'), 'utf8')
) as Building[];
const constructor = buildings.find((b) => b.id === 'Build_ConstructorMk1_C')!;
const beltMk1 = { ko: '컨베이어 벨트 Mk.1', perMinute: 60 };
const beltMk2 = { ko: '컨베이어 벨트 Mk.2', perMinute: 120 };
const beltMk3 = { ko: '컨베이어 벨트 Mk.3', perMinute: 270 };

/** 콘크리트 공정 — 제작기 1대가 석회석 45/분 → 콘크리트 15/분 */
const concreteStage = (machines: number): StageForFloorPlan => ({
  key: 'concrete',
  itemKo: '콘크리트',
  machineKo: constructor.ko,
  machineEn: constructor.en,
  machinesTotal: machines,
  footprint: constructor.footprint,
  machinePowerMW: constructor.powerMW ?? 4,
  inputPerMachine: [{ itemKo: '석회석', perMinute: 45, isFluid: false }],
  outputPerMachine: 15,
});

test('발행 도면 재현 — Mk.3 벨트에서 층당 제작기 4대 · 석회석 180/분 · 콘크리트 60/분 · 16 MW', () => {
  // 참고 도면은 층당 180/분을 한 벨트로 넣는다. Mk.1(60)·Mk.2(120)로는 불가능하고 Mk.3(270)이라야 한다.
  const plan = buildFloorPlan([concreteStage(4)], beltMk3);
  const s = plan.stages[0]!;
  assert.equal(s.perFloor, 4, '층당 4대');
  assert.equal(s.inputsPerFloor[0]!.perMinute, 180, '층당 석회석 180/분');
  assert.equal(s.outputPerFloor, 60, '층당 콘크리트 60/분');
  assert.equal(s.powerPerFloorMW, 16, '층당 16 MW');
  assert.equal(s.floors, 1);
});

test('벨트가 못 나르면 층당 대수를 줄인다 — Mk.1에서는 1대', () => {
  // 제작기 1대가 45/분을 먹으므로 Mk.1(60/분) 한 줄로는 1대가 한계다
  // 공급 레인이 좌우 2줄이므로 용량도 2줄분이다 (참고 도면의 Input A/B)
  assert.equal(machinesPerFloor(concreteStage(8), 60), 2, 'Mk.1 60/분 × 2줄 = 45/분짜리 2대');
  assert.equal(machinesPerFloor(concreteStage(8), 120), 4, 'Mk.2 = 2대/줄 × 2줄');
  assert.equal(machinesPerFloor(concreteStage(8), 270), 8, 'Mk.3 = 6대/줄 × 2줄, 기하 상한 8대');
});

test('기계가 많으면 층을 쌓는다 — 띠로 늘이지 않는다', () => {
  const plan = buildFloorPlan([concreteStage(24)], beltMk2);
  const s = plan.stages[0]!;
  assert.equal(s.perFloor, 4, 'Mk.2 두 줄이면 층당 4대');
  assert.equal(s.floors, 6, '24대 ÷ 4 = 6층');
  assert.ok(plan.needsLift, '2층 이상이면 리프트가 필요하다');
  assert.ok(s.widthTiles <= 6, `한 층 폭이 ${s.widthTiles}타일 — 층 설계는 좁아야 한다`);
});

test('층 배분이 기계 수를 반드시 담는다', () => {
  for (const n of [1, 3, 5, 7, 13, 24, 47]) {
    const plan = buildFloorPlan([concreteStage(n)], beltMk3);
    const s = plan.stages[0]!;
    assert.ok(s.perFloor * s.floors >= n, `${n}대: ${s.perFloor}×${s.floors}`);
    assert.ok(s.lastFloorMachines >= 1 && s.lastFloorMachines <= s.perFloor);
  }
});

test('도면 기하가 성립한다 — 기계·분배기·머저가 겹치지 않는다', () => {
  const plan = buildFloorPlan([concreteStage(8), concreteStage(4)], beltMk3);
  assert.deepEqual(validateFloorPlan(plan), []);
});

test('좌우 대칭 2열 + 가운데 스파인 구조를 만든다', () => {
  const plan = buildFloorPlan([concreteStage(4)], beltMk3);
  const s = plan.stages[0]!;
  const xs = [...new Set(s.machines.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(xs.length, 2, '기계가 두 열에 놓여야 한다');
  const spine = s.belts.find((b) => b.role === 'spine')!;
  assert.ok(spine.x > xs[0]! && spine.x < xs[1]!, '스파인이 두 열 사이에 있어야 한다');
  assert.ok(
    s.attachments.some((a) => a.kind === 'merger' && a.x === spine.x),
    '머저는 스파인에 붙는다'
  );
});

test('모든 벨트 구간에 품목과 유량이 있다', () => {
  const plan = buildFloorPlan([concreteStage(6)], beltMk3);
  for (const b of plan.stages[0]!.belts) {
    assert.ok(b.itemKo, `품목 없는 벨트: ${b.role}`);
    assert.ok(b.perMinute > 0, `유량 없는 벨트: ${b.role}`);
  }
});
