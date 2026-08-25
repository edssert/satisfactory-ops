#!/usr/bin/env node
/**
 * 설치본 장면을 제품용 아이소메트릭으로 만드는 단일 진입점.
 * 사용: node scripts/topview/build-isometric-scene.mjs <scene.json> <output-dir>
 * 종료: 0 제품 후보 생성, 1 재질 어댑터/검증 미완료, 2 입력 오류.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { readFactoryAssetRows, resolveSceneGameMaterials } from './material-resolver.mjs';
import { buildRuntimeMaterialIr, filterSceneToRuntimeVisuals } from './build-runtime-material-ir.mjs';

const root = resolve(import.meta.dirname, '../..');
const sceneArgument = process.argv[2];
const outputArgument = process.argv[3];
if (!sceneArgument || !outputArgument) {
  process.stderr.write('장면 JSON과 출력 디렉터리가 필요합니다.\n');
  process.exit(2);
}

const scenePath = resolve(root, sceneArgument);
const outputDir = resolve(root, outputArgument);
const outputRoot = resolve(root, '.cache/topview/isometric/builds');
if (!existsSync(scenePath) || !(outputDir === outputRoot || outputDir.startsWith(`${outputRoot}${sep}`))) {
  process.stderr.write(`입력 또는 출력 범위가 잘못됐습니다: ${scenePath} / ${outputDir}\n`);
  process.exit(2);
}

mkdirSync(outputDir, { recursive: true });
for (const stale of [
  'candidate.png', 'technical.png', 'candidate.blend', 'technical.blend', 'material-ir.json', 'resolved-scene.json',
  'normal-decal-fixture.blend', 'normal-decal-fixture.png', 'normal-decal-fixture-mask.png',
  'fixture-candidate.blend', 'fixture-candidate.png',
  'candidate-045.png', 'candidate-135.png', 'candidate-225.png', 'candidate-315.png',
  'technical-045.png', 'technical-135.png', 'technical-225.png', 'technical-315.png',
  'top.png', 'top-machine.png', 'product.blend',
]) {
  const path = resolve(outputDir, stale);
  if (existsSync(path)) rmSync(path, { force: true });
}

const sceneText = readFileSync(scenePath, 'utf8');
const scene = JSON.parse(sceneText);
execFileSync(process.execPath, ['scripts/topview/build-factory-array-profile.mjs', '.cache/topview/factory-array-profile.json'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [
  'scripts/topview/build-material-atlas.mjs',
  '.cache/topview/factory-array-profile.json',
  '.cache/topview/factory-array-albedo.png',
  '.cache/topview/factory-array-mreo.png',
  '.cache/topview/factory-array-normal.png',
], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/topview/audit-factory-array-adapter.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/topview/audit-isometric-generality.mjs'], { cwd: root, stdio: 'inherit' });
const rows = readFactoryAssetRows(root);
const exportRoot = resolve(root, '.tmp-research/cue4parse-pilot/exports');
const renderContract = JSON.parse(readFileSync(resolve(root, 'scripts/unreal-render/render-contract.json'), 'utf8'));
const probePath = resolve(root, `.cache/game-asset-index/runtime-probes/CL-${renderContract.gameBuild}/${scene.buildingClass}.json`);
if (!existsSync(probePath)) throw new Error(`${scene.buildingClass} runtime probe가 없습니다.`);
const probe = JSON.parse(readFileSync(probePath, 'utf8'));
const productScene = filterSceneToRuntimeVisuals(structuredClone(scene), { probe });
const resolved = resolveSceneGameMaterials(productScene, { root, exportRoot, rows }).scene;
const materialIr = buildRuntimeMaterialIr(resolved, { root, probePath });
const materialIrPath = resolve(outputDir, 'material-ir.json');
writeFileSync(materialIrPath, `${JSON.stringify(materialIr, null, 2)}\n`);
resolved.runtimeMaterialEvidence = {
  path: materialIrPath.replaceAll('\\', '/'),
  sha256: createHash('sha256').update(readFileSync(materialIrPath)).digest('hex'),
  probe: materialIr.source,
};
const safeName = (value) => value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const vatBindings = resolved.isometricMaterialEvidence.bindings
  .filter((binding) => binding.reconstruction === 'game-vat-adapter');
for (const binding of vatBindings) {
  const profilePath = `.cache/topview/vat-${safeName(binding.material)}-profile.json`;
  execFileSync(process.execPath, [
    'scripts/topview/build-vat-material-profile.mjs', binding.material, profilePath,
  ], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, [
    'scripts/topview/audit-vat-material-adapter.mjs', profilePath,
  ], { cwd: root, stdio: 'inherit' });
}
const registryPath = resolve(root, 'scripts/topview/isometric-material-adapters.json');
const registryText = readFileSync(registryPath, 'utf8');
const registry = JSON.parse(registryText);
const unresolvedAdapters = registry.adapters.filter((adapter) => adapter.status !== 'verified');
const unresolvedMaterials = resolved.isometricMaterialEvidence.unresolved;
const adapterFiles = [
  'build-factory-array-profile.mjs', 'build-vat-material-profile.mjs',
  'apply-mesh-decal-adapter.py', 'apply-foundation-adapter.py', 'apply-hologram-adapter.py',
  'merge-isometric-adapters.py', 'render-isometric-scene.py',
];
const cacheHasher = createHash('sha256')
  .update(sceneText)
  .update(registryText)
  .update(readFileSync(probePath))
  .update(readFileSync(resolve(root, 'scripts/topview/build-runtime-material-ir.mjs')))
  .update(readFileSync(resolve(root, '.cache/game-asset-index/factory-assets-summary.json')));
for (const file of adapterFiles) cacheHasher.update(readFileSync(resolve(root, 'scripts/topview', file)));
const cacheKey = cacheHasher.digest('hex');

const receipt = {
  $schemaVersion: 1,
  scene: scene.id,
  buildingClass: scene.buildingClass,
  cacheKey,
  status: unresolvedAdapters.length || unresolvedMaterials.length ? 'blocked' : 'running',
  unresolvedAdapters: unresolvedAdapters.map(({ id, blocker, sources }) => ({ id, blocker, sources })),
  unresolvedMaterials,
  deletedStaleOutputs: ['candidate.png', 'candidate.blend', 'material-ir.json'],
  sourceScene: sceneArgument.replaceAll('\\', '/'),
};
writeFileSync(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

if (receipt.status === 'blocked') {
  process.stderr.write(`BLOCKED ${basename(scenePath)} · 어댑터 ${unresolvedAdapters.length} · 재질 ${unresolvedMaterials.length}\n`);
  process.exit(1);
}

const blender = process.env.BLENDER_EXE ?? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
const geometryDir = resolve(outputDir, 'geometry');
if (existsSync(geometryDir)) rmSync(geometryDir, { recursive: true, force: true });
mkdirSync(geometryDir, { recursive: true });
const resolvedScene = resolve(outputDir, 'resolved-scene.json');
writeFileSync(resolvedScene, `${JSON.stringify(resolved, null, 2)}\n`);
execFileSync(process.execPath, ['scripts/topview/audit-emission-adapter.mjs', resolvedScene], { cwd: root, stdio: 'inherit' });
const overlayContract = resolve(outputDir, 'overlay-contract.json');
execFileSync(process.execPath, [
  'scripts/topview/build-isometric-overlay-contract.mjs',
  resolvedScene,
  overlayContract,
], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [
  'scripts/topview/run-validated-render.mjs',
  resolvedScene,
  geometryDir,
], { cwd: root, stdio: 'inherit' });
const slug = scene.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const geometryBlend = resolve(geometryDir, `${slug}.blend`);
execFileSync(blender, [
  geometryBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/audit-emission-materials.py', '--', resolvedScene,
], { cwd: root, stdio: 'inherit' });
const normalBlend = resolve(outputDir, 'normal-decal.blend');
const normalDecalBindings = resolved.isometricMaterialEvidence.bindings
  .filter((binding) => binding.reconstruction === 'baked-normal-decal-adapter');
if (normalDecalBindings.length > 1) {
  process.stderr.write(`Normal Decal material이 여러 개라 명시적 다중 receiver adapter가 필요합니다: ${normalDecalBindings.map((binding) => binding.material).join(', ')}\n`);
  process.exit(1);
}
if (normalDecalBindings.length === 1) {
  const materialName = normalDecalBindings[0].material;
  const decalNormalSource = resolve(root, resolved.materials.normal[materialName]);
  execFileSync(blender, [
    geometryBlend, '--background', '--python-exit-code', '3',
    '--python', 'scripts/topview/apply-mesh-decal-adapter.py', '--',
    normalBlend, decalNormalSource, materialName,
  ], { cwd: root, stdio: 'inherit' });
  execFileSync(blender, [
    normalBlend, '--background', '--python-exit-code', '3',
    '--python', 'scripts/topview/audit-mesh-decal-adapter.py',
  ], { cwd: root, stdio: 'inherit' });
} else {
  copyFileSync(geometryBlend, normalBlend);
}

const foundationBlend = resolve(outputDir, 'foundation.blend');
const foundationGlb = resolve(root, '.cache/topview/isometric/foundation-export/FactoryGame/Content/FactoryGame/Buildable/Building/Foundation/FicsitSet/SM_Foundation_FicsitSet_8x1_01.glb');
execFileSync(blender, [
  '--background', '--python-exit-code', '3', '--python', 'scripts/topview/apply-foundation-adapter.py', '--',
  foundationGlb, overlayContract, foundationBlend,
], { cwd: root, stdio: 'inherit' });
execFileSync(blender, [
  foundationBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/audit-foundation-adapter.py', '--', overlayContract,
], { cwd: root, stdio: 'inherit' });

const beautyBlend = resolve(outputDir, 'candidate.blend');
execFileSync(blender, [
  normalBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/merge-isometric-adapters.py', '--', beautyBlend, foundationBlend,
], { cwd: root, stdio: 'inherit' });
const hologramRoot = resolve(root, '.cache/topview/hologram-export');
const hologramBlend = resolve(outputDir, 'hologram.blend');
execFileSync(blender, [
  '--background', '--python-exit-code', '3', '--python', 'scripts/topview/apply-hologram-adapter.py', '--',
  hologramRoot, overlayContract, hologramBlend,
], { cwd: root, stdio: 'inherit' });
execFileSync(blender, [
  hologramBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/audit-hologram-adapter.py', '--', overlayContract,
], { cwd: root, stdio: 'inherit' });
const technicalBlend = resolve(outputDir, 'product.blend');
execFileSync(blender, [
  beautyBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/merge-isometric-adapters.py', '--', technicalBlend, hologramBlend,
], { cwd: root, stdio: 'inherit' });
const directions = [45, 135, 225, 315];
const candidateDirections = [];
for (const azimuth of directions) {
  const path = resolve(outputDir, `candidate-${String(azimuth).padStart(3, '0')}.png`);
  execFileSync(blender, [
    technicalBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/render-isometric-scene.py', '--',
    path, '2048', '--hide-technical', `--azimuth=${azimuth}`, '--elevation=45', '--frame=1.00',
  ], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/topview/audit-isometric-frame.mjs', path, '8'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/topview/audit-beauty-isometric.mjs', path], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/topview/audit-emission-pixels.mjs', path, resolvedScene], { cwd: root, stdio: 'inherit' });
  candidateDirections.push(path);
}
const candidate = resolve(outputDir, 'candidate.png');
copyFileSync(candidateDirections[1], candidate);

const top = resolve(outputDir, 'top.png');
execFileSync(blender, [
  technicalBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/render-isometric-scene.py', '--',
  top, '2048', '--top', '--hide-technical', '--frame=1.08',
], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/topview/audit-isometric-frame.mjs', top, '8'], { cwd: root, stdio: 'inherit' });
const topMachine = resolve(outputDir, 'top-machine.png');
execFileSync(blender, [
  technicalBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/render-isometric-scene.py', '--',
  topMachine, '2048', '--top', '--hide-technical', '--hide-foundation', '--frame=1.08',
], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/topview/audit-isometric-frame.mjs', topMachine, '8'], { cwd: root, stdio: 'inherit' });
const technicalDirections = [];
for (const azimuth of directions) {
  const path = resolve(outputDir, `technical-${String(azimuth).padStart(3, '0')}.png`);
  execFileSync(blender, [
    technicalBlend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/render-isometric-scene.py', '--',
    path, '2048', '--technical', '--orthographic', `--azimuth=${azimuth}`, '--elevation=45', '--frame=1.08',
  ], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/topview/audit-isometric-frame.mjs', path, '8'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/topview/audit-technical-overlay.mjs', path], { cwd: root, stdio: 'inherit' });
  technicalDirections.push(path);
}
const technical = resolve(outputDir, 'technical.png');
copyFileSync(technicalDirections[1], technical);

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
receipt.status = 'validated-change-candidate-not-approved';
receipt.outputs = {
  candidate: { path: candidate, sha256: sha256(candidate) },
  candidateDirections: candidateDirections.map((path, index) => ({ azimuth: directions[index], path, sha256: sha256(path) })),
  top: { path: top, sha256: sha256(top) },
  topMachine: { path: topMachine, sha256: sha256(topMachine) },
  productBlend: { path: technicalBlend, sha256: sha256(technicalBlend) },
  technical: { path: technical, sha256: sha256(technical) },
  technicalDirections: technicalDirections.map((path, index) => ({ azimuth: directions[index], path, sha256: sha256(path) })),
};
receipt.approval = null;
writeFileSync(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`PASS  아이소메트릭 파이프라인 후보 격리 · ${candidate}\n`);
