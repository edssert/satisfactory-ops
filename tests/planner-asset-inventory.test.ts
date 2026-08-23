import { strict as assert } from 'node:assert';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import rawBuildings from '../src/data/buildings.json' with { type: 'json' };
import buildings from '../src/data/app/buildings.json' with { type: 'json' };
import generatedScope from '../src/data/app/planner-asset-scope.json' with { type: 'json' };
import policy from '../src/data/curated/planner-asset-policy.json' with { type: 'json' };
import topviewData from '../src/data/curated/topview-assets.json' with { type: 'json' };
import { derivePlannerAssetScope, sha256Ids } from '../scripts/lib/planner-asset-policy.mjs';
import { requiresOperationalStateAssets, requiresRasterTopview } from '../src/lib/planner-asset-scope.ts';

const derived = derivePlannerAssetScope(rawBuildings, buildings, policy);
const targetById = new Map(generatedScope.targets.map((target) => [target.buildingClass, target]));
const excludedIds = new Set(derived.excluded.map((target) => target.buildingClass));
const implicitPowerById = new Map(generatedScope.implicitPowerNetwork.map((target) => [target.buildingClass, target]));

test('설계 자산 정책은 모든 건설 가능 클래스를 손실 없이 분할하고 생성물과 일치한다', () => {
  assert.equal(derived.unclassified.length, 0);
  assert.equal(derived.counts.buildable,
    derived.counts.included + derived.counts.implicitPowerNetwork + derived.counts.excluded);
  assert.equal(derived.counts.buildable, policy.expected.buildable);
  assert.deepEqual(derived.hashes, policy.expected.hashes);
  assert.equal(sha256Ids(generatedScope.targets), policy.expected.hashes.included);
  assert.equal(generatedScope.targets.length, derived.included.length);
  assert.equal(generatedScope.implicitPowerNetwork.length, derived.implicitPowerNetwork.length);
});

test('nativeClass 정책은 생산 자산을 보존하고 전력망은 도감·계산 유지/배치 자동 연결로 분리한다', () => {
  assert.equal(targetById.get('Build_PipeStorageTank_C')?.plannerKind, 'storage');
  assert.equal(targetById.get('Build_IndustrialTank_C')?.plannerKind, 'storage');
  assert.equal(targetById.get('Build_ConveyorWallHole_C')?.representation, 'opening-attachment');
  assert.equal(targetById.get('Build_SpaceElevator_C')?.plannerKind, 'facility');
  assert.equal(targetById.get('Build_FoundationGlass_01_C')?.representation, 'foundation-piece');
  assert.equal(excludedIds.has('Build_Roof_A_01_C'), true);
  assert.equal(buildings.some((building) => building.id === 'Build_PowerLine_C'), true);
  assert.equal(targetById.has('Build_PowerLine_C'), false);
  assert.equal(implicitPowerById.get('Build_PowerLine_C')?.placementMode, 'assumed-connected');
  assert.deepEqual(implicitPowerById.get('Build_PowerLine_C')?.capabilities, ['catalog', 'power-calculation']);
});

test('상태 4종 요구는 category가 아니라 설치본 ProductionIndicator 증거를 따른다', () => {
  const stateful = generatedScope.targets.filter(requiresOperationalStateAssets);
  assert.equal(stateful.length, policy.productionIndicatorClasses.length);
  assert.equal(targetById.get('Build_PipelinePump_C')?.statusMode, 'production-indicator-4-state');
  assert.equal(targetById.get('Build_DroneStation_C')?.statusMode, 'production-indicator-4-state');
  assert.equal(targetById.get('Build_HadronCollider_C')?.statusMode, 'single-state');
  assert.equal(targetById.get('Build_FrackingExtractor_C')?.statusMode, 'single-state');
});

test('탑뷰 제작 범위는 고정 설비만 포함하고 토대·경로 합성 변형은 제외한다', () => {
  const topviewTargets = generatedScope.targets.filter(requiresRasterTopview);
  assert.equal(topviewTargets.length, 63);
  assert.equal(topviewTargets.some((target) => target.representation === 'foundation-piece'), false);
  assert.equal(topviewTargets.some((target) => target.representation.startsWith('parametric-')), false);
  assert.equal(topviewTargets.some((target) => target.representation === 'support-attachment'), false);
  assert.equal(topviewTargets.some((target) => target.representation === 'opening-attachment'), false);
  assert.equal(topviewTargets.some((target) => target.representation === 'rail-attachment'), false);

  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  const names = topviewTargets.map((target) => buildingById.get(target.buildingClass)?.ko);
  assert.equal(new Set(names).size, names.length);
});

test('인벤토리는 생성 범위 전체를 보고하고 현재 게임 승인·후보 경계를 숨기지 않는다', () => {
  const result = spawnSync(process.execPath, ['scripts/inventory-topview-assets.mjs', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as {
    total: number;
    counts: Record<string, number>;
    manifestCandidates: string[];
    runtimeForeignSources: string[];
    targets: Array<{ id: string; status: string }>;
    complete: boolean;
  };
  assert.equal(report.total, generatedScope.targets.filter(requiresRasterTopview).length);
  assert.equal(Object.values(report.counts).reduce((sum, count) => sum + count, 0), report.total);
  const approvedClasses = new Set(topviewData.assets
    .filter((asset) => asset.sourceId === 'game-install-cl-502094'
      && asset.reviewStatus === 'approved'
      && 'buildingClass' in asset)
    .map((asset) => asset.buildingClass));
  assert.equal(report.counts.approved,
    generatedScope.targets.filter(requiresRasterTopview).filter((target) => approvedClasses.has(target.buildingClass)).length);
  assert.equal(report.manifestCandidates.length, 0);
  assert.equal(report.runtimeForeignSources.length, 0);
  assert.equal(report.targets.find((target) => target.id === 'Build_SmelterMk1_C')?.status, 'approved');
  assert.equal(report.targets.find((target) => target.id === 'Build_GeneratorBiomass_Automated_C')?.status, 'approved');
  assert.equal(report.complete, true);
});
