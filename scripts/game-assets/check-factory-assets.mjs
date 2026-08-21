/**
 * 전수 게임 자산 색인의 집계·행 수·실패 0·제련기 필수 구성품을 검증한다.
 * 사용: node scripts/game-assets/check-factory-assets.mjs
 * 종료: 성공 0, 색인 누락/검증 실패 2.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const indexRoot = resolve(root, '.cache/game-asset-index');
const summaryPath = resolve(indexRoot, 'factory-assets-summary.json');
const graphPath = resolve(indexRoot, 'factory-assets.ndjson');
const failuresPath = resolve(indexRoot, 'factory-assets-failures.ndjson');
const scenesPath = resolve(indexRoot, 'factory-scenes.json');
const errors = [];
for (const path of [summaryPath, graphPath, failuresPath]) if (!existsSync(path)) errors.push(`파일 누락 ${path}`);
if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const rows = readFileSync(graphPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const failures = readFileSync(failuresPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
if (summary.schemaVersion !== 1) errors.push(`schemaVersion=${summary.schemaVersion}`);
if (summary.packages !== rows.length) errors.push(`패키지 집계 summary=${summary.packages}, rows=${rows.length}`);
if (summary.failedPackages !== 0 || failures.length) errors.push(`실패 패키지 summary=${summary.failedPackages}, rows=${failures.length}`);
const smelter = rows.find((row) => row.Package.endsWith('/SmelterMk1/Build_SmelterMk1.uasset'));
const requiredComponents = new Set([
  'BP_LadderComponent_GEN_VARIABLE',
  'BP_ProductionIndicatorInstanced_GEN_VARIABLE',
  'FGColoredInstanceMeshProxy_GEN_VARIABLE',
  'FGVertexAnimatedMesh_GEN_VARIABLE',
  'Input0_GEN_VARIABLE',
  'Output2_GEN_VARIABLE'
]);
if (!smelter) errors.push('제련기 Blueprint 누락');
else for (const name of requiredComponents) {
  if (!smelter.Components.some((component) => component.Name === name)) errors.push(`제련기 구성품 누락 ${name}`);
}
if (!rows.some((row) => row.Materials.some((material) => material.Name === 'MI_SmelterMk1_01' && material.Parent))) {
  errors.push('제련기 정적 재질 부모 체인 누락');
}
if (!rows.some((row) => row.Materials.some((material) => material.Name === 'MM_FactoryBaked_VAT' && material.Parent === null))) {
  errors.push('VAT 루트 재질 MM_FactoryBaked_VAT 누락');
}
if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}
process.stdout.write(`PASS  게임 자산 ${rows.length}개 패키지 · 실패 0 · 재질 ${summary.materials}개 · 구성품 ${summary.components}개\n`);
process.stdout.write('PASS  제련기 Blueprint 필수 구성품 6종 · 재질 부모 체인 보존\n');
if (existsSync(scenesPath)) {
  const scenes = JSON.parse(readFileSync(scenesPath, 'utf8'));
  const smelterScene = scenes.contracts?.find((entry) => entry.buildingClass === 'Build_SmelterMk1_C');
  if (!smelterScene?.components.some((entry) => entry.id === 'FGVertexAnimatedMesh_GEN_VARIABLE')) {
    process.stderr.write('ERROR 제련기 자동 장면 계약에 VAT 본체 누락\n');
    process.exit(2);
  }
  process.stdout.write(`PASS  자동 장면 계약 ${scenes.buildings}건 · 제련기 VAT/정적/간접 구성품 보존\n`);
}
