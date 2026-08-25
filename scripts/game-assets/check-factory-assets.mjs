/**
 * 전수 게임 자산·Headers API 색인의 집계·행 수·실패 0·핵심 조립 계약을 검증한다.
 * 사용: node scripts/game-assets/check-factory-assets.mjs
 * 종료: 성공 0, 색인 누락/검증 실패 2.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const indexRoot = resolve(root, '.cache/game-asset-index');
const summaryPath = resolve(indexRoot, 'factory-assets-summary.json');
const graphPath = resolve(indexRoot, 'factory-assets.ndjson');
const failuresPath = resolve(indexRoot, 'factory-assets-failures.ndjson');
const scenesPath = resolve(indexRoot, 'factory-scenes.json');
const apiContractsPath = resolve(indexRoot, 'factory-api-contracts.json');
const nativeContractsPath = resolve(indexRoot, 'factory-native-contracts.json');
const errors = [];
for (const path of [summaryPath, graphPath, failuresPath, apiContractsPath, nativeContractsPath]) if (!existsSync(path)) errors.push(`파일 누락 ${path}`);
if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const rows = readFileSync(graphPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const failures = readFileSync(failuresPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const apiContracts = JSON.parse(readFileSync(apiContractsPath, 'utf8'));
const nativeContracts = JSON.parse(readFileSync(nativeContractsPath, 'utf8'));
const gameRoot = resolve(process.env.SATISFACTORY_ROOT ?? 'C:/Program Files (x86)/Steam/steamapps/common/Satisfactory');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
if (summary.schemaVersion !== 1) errors.push(`schemaVersion=${summary.schemaVersion}`);
if (summary.packages !== rows.length) errors.push(`패키지 집계 summary=${summary.packages}, rows=${rows.length}`);
if (summary.failedPackages !== 0 || failures.length) errors.push(`실패 패키지 summary=${summary.failedPackages}, rows=${failures.length}`);
if (summary.packages < 20_000) errors.push(`FactoryGame/Content 전수 범위 축소 packages=${summary.packages}`);
if (!summary.source?.headersSha256 || summary.source.headersSha256 !== apiContracts.SourceSha256) errors.push('Headers.zip SHA-256 계약 누락/불일치');
const apiSymbols = new Set((apiContracts.Symbols ?? []).map((entry) => entry.Id));
for (const id of [
  'api:UFGFactorySettings#mDefaultConveyorConnectionFrameMesh',
  'api:UFGFactorySettings#mDefaultConveyorConnectionArrowMesh',
  'api:UFGFactorySettings#mDefaultInputConnectionMaterial',
  'api:UFGFactoryConnectionComponent#GetConnectorNormal',
  'api:AFGBuildableHologram#SetupFactoryConnectionMesh',
]) if (!apiSymbols.has(id)) errors.push(`Headers API 심벌 누락 ${id}`);
const settings = rows.find((row) => row.Package.endsWith('/Buildable/Factory/BP_FactorySettings.uasset'))?.FactorySettings;
for (const field of [
  'mDefaultConveyorConnectionFrameMesh',
  'mDefaultConveyorConnectionArrowMesh',
  'mDefaultInputConnectionMaterial',
  'mDefaultOutputConnectionMaterial',
]) if (!settings?.[field]?.ObjectPath) errors.push(`FactorySettings 필드 누락 ${field}`);
const inputMesh = rows.find((row) => row.Package.toLowerCase().endsWith('/equipment/buildgun/mesh/input.uasset'))
  ?.Meshes?.find((mesh) => mesh.Name === 'Input');
const arrowsMesh = rows.find((row) => row.Package.toLowerCase().endsWith('/equipment/buildgun/mesh/arrows.uasset'))
  ?.Meshes?.find((mesh) => mesh.Name === 'Arrows');
if (!inputMesh?.Bounds?.Origin || !inputMesh?.Bounds?.BoxExtent) errors.push('Input 저자 bounds 누락');
if (!arrowsMesh?.Bounds?.Origin || !arrowsMesh?.Bounds?.BoxExtent) errors.push('Arrows 저자 bounds 누락');
const simpleInput = rows.flatMap((row) => row.Materials ?? []).find((material) => material.Name === 'Hologram_Simple_Transparent_Input');
const simpleMaster = rows.flatMap((row) => row.Materials ?? []).find((material) => material.Name === 'Hologram_Simple');
if (!simpleInput?.Parent?.endsWith('/Hologram_Simple.0')) errors.push('입력 포트 재질 부모 Hologram_Simple 누락');
if (simpleMaster?.Properties?.bDisableDepthTest !== true) errors.push('Hologram_Simple bDisableDepthTest 누락');
const native = nativeContracts.setupFactoryConnectionMesh;
const pdbPath = resolve(gameRoot, nativeContracts.source?.pdb ?? '');
const imagePath = resolve(gameRoot, nativeContracts.source?.image ?? '');
if (!existsSync(pdbPath) || sha256(pdbPath) !== nativeContracts.source?.pdbSha256) errors.push('FactoryGame PDB SHA-256 계약 누락/불일치');
if (!existsSync(imagePath) || sha256(imagePath) !== nativeContracts.source?.imageSha256) errors.push('FactoryGame DLL SHA-256 계약 누락/불일치');
if (native?.inputArrow?.relativeTranslationCm?.join(',') !== '-150,0,70' || native?.inputArrow?.relativeRotationDeg?.join(',') !== '0,180,0') errors.push('native input arrow transform 드리프트');
if (native?.outputArrow?.relativeTranslationCm?.join(',') !== '150,0,70' || native?.outputArrow?.relativeRotationDeg?.join(',') !== '0,0,0') errors.push('native output arrow transform 드리프트');
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
process.stdout.write('PASS  Headers API · FactorySettings 포트 메시/재질 · 저자 bounds · depth-test 계약\n');
process.stdout.write('PASS  PDB native SetupFactoryConnectionMesh frame/arrow transform · PDB/DLL SHA-256\n');
if (existsSync(scenesPath)) {
  const scenes = JSON.parse(readFileSync(scenesPath, 'utf8'));
  const smelterScene = scenes.contracts?.find((entry) => entry.buildingClass === 'Build_SmelterMk1_C');
  if (!smelterScene?.components.some((entry) => entry.id === 'FGVertexAnimatedMesh_GEN_VARIABLE')) {
    process.stderr.write('ERROR 제련기 자동 장면 계약에 VAT 본체 누락\n');
    process.exit(2);
  }
  process.stdout.write(`PASS  자동 장면 계약 ${scenes.buildings}건 · 제련기 VAT/정적/간접 구성품 보존\n`);
}
