#!/usr/bin/env node
/** 검수 통과한 배치 탑뷰를 lossless WebP로 승격하고 매니페스트에 연결한다. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { requiresOperationalStateAssets } from '../../src/lib/planner-asset-scope.ts';
import { RUNTIME_TOPVIEW_SOURCE } from '../../src/lib/topview-assets.ts';

const root = resolve(import.meta.dirname, '../..');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] ?? null;
const refresh = process.argv.includes('--refresh');
const renderRoot = resolve(root, '.cache/topview/batch/renders');
const review = JSON.parse(readFileSync(resolve(root, 'src/data/curated/topview-batch-review.json'), 'utf8'));
const scope = JSON.parse(readFileSync(resolve(root, 'src/data/app/planner-asset-scope.json'), 'utf8'));
const buildings = JSON.parse(readFileSync(resolve(root, 'src/data/app/buildings.json'), 'utf8'));
const manifestPath = resolve(root, 'src/data/curated/topview-assets.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const targetById = new Map(scope.targets.map((target) => [target.buildingClass, target]));
const buildingById = new Map(buildings.map((building) => [building.id, building]));
const stateRows = [
  { key: 'activeWithCrystal', folder: 'activeWithCrystal', suffix: 'crystal' },
  { key: 'standby', folder: 'standby', suffix: 'standby' },
  { key: 'error', folder: 'error', suffix: 'error' },
];
const folderByKind = {
  facility: 'production', extractor: 'extraction', generator: 'power', storage: 'storage',
  'logistics-device': 'logistics', transport: 'transport', rail: 'transport',
};

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const posix = (path) => path.replaceAll('\\', '/');

function receiptIn(directory) {
  if (!existsSync(directory)) throw new Error(`렌더 디렉터리 누락: ${relative(root, directory)}`);
  const name = readdirSync(directory).find((entry) => entry.endsWith('.receipt.json'));
  if (!name) throw new Error(`영수증 누락: ${relative(root, directory)}`);
  const path = resolve(directory, name);
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function promote(receipt, outputPath) {
  const candidatePath = receipt.outputs?.candidate?.path;
  if (!candidatePath || !existsSync(candidatePath) || sha256(candidatePath) !== receipt.outputs.candidate.sha256) {
    throw new Error(`후보 해시 불일치: ${candidatePath}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.next.webp`;
  const backupPath = `${outputPath}.previous.webp`;
  rmSync(temporaryPath, { force: true });
  rmSync(backupPath, { force: true });
  const image = sharp(candidatePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 0) continue;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  }
  await sharp(data, { raw: info }).webp({ lossless: true, effort: 6 }).toFile(temporaryPath);
  if (existsSync(outputPath)) renameSync(outputPath, backupPath);
  try {
    renameSync(temporaryPath, outputPath);
    rmSync(backupPath, { force: true });
  } catch (error) {
    if (existsSync(backupPath) && !existsSync(outputPath)) renameSync(backupPath, outputPath);
    throw error;
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return {
    path: posix(relative(resolve(root, 'public'), outputPath)),
    sha256: sha256(outputPath),
    renderPx: { width: info.width, height: info.height },
    occupancyFrame: receipt.contracts.occupancyFrame,
    sourceCandidateSha256: receipt.outputs.candidate.sha256,
  };
}

const promoted = [];
for (const buildingClass of review.accepted) {
  if (only && buildingClass !== only) continue;
  const existingRuntimeIndex = manifest.assets.findIndex((asset) => asset.buildingClass === buildingClass
    && asset.sourceId === RUNTIME_TOPVIEW_SOURCE
    && asset.reviewStatus === 'approved');
  if (existingRuntimeIndex >= 0 && !refresh) continue;
  if (existingRuntimeIndex >= 0) manifest.assets.splice(existingRuntimeIndex, 1);
  const target = targetById.get(buildingClass);
  const building = buildingById.get(buildingClass);
  const footprint = building?.footprint ?? target?.footprintOverride;
  if (!target || !footprint) throw new Error(`승격 대상 계약 누락: ${buildingClass}`);
  const directory = folderByKind[target.plannerKind] ?? 'other';
  const publicBase = resolve(root, `public/assets/planner/top-view/buildings/${directory}`);
  const activeReceipt = receiptIn(resolve(renderRoot, buildingClass));
  const main = await promote(activeReceipt, resolve(publicBase, `${buildingClass}.webp`));
  const stateImages = {};
  if (requiresOperationalStateAssets(target)) {
    stateImages.active = { path: main.path, sha256: main.sha256 };
    for (const state of stateRows) {
      const receipt = receiptIn(resolve(renderRoot, buildingClass, 'states', state.folder));
      const image = await promote(receipt, resolve(publicBase, `${buildingClass}.${state.suffix}.webp`));
      stateImages[state.key] = { path: image.path, sha256: image.sha256 };
    }
  }
  const conflict = manifest.assets.find((asset) => asset.assetId === buildingClass);
  if (conflict) conflict.assetId = `Reference_${buildingClass}_${conflict.sourceId.replace(/[^A-Za-z0-9]+/g, '_')}`;
  const asset = {
    assetId: buildingClass,
    buildingClass,
    role: 'building',
    path: main.path,
    sourceId: RUNTIME_TOPVIEW_SOURCE,
    derivation: 'game-mesh-render',
    visualProfile: 'anders-reconstructed-blender-2026',
    reviewStatus: 'approved',
    renderPx: main.renderPx,
    sha256: main.sha256,
    hardFootprintM: { width: Math.abs(footprint.widthM), length: Math.abs(footprint.lengthM) },
    occupancyFrame: main.occupancyFrame,
    ...(Object.keys(stateImages).length ? { statusImages: stateImages } : {}),
    approvedCandidateSha256: main.sourceCandidateSha256,
  };
  manifest.assets.push(asset);
  promoted.push({ buildingClass, path: main.path, sha256: main.sha256, states: Object.keys(stateImages).length });
}

const manifestTemp = resolve(root, '.cache/topview/batch/topview-assets.next.json');
const manifestBackup = resolve(root, '.cache/topview/batch/topview-assets.before-promotion.json');
writeFileSync(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(manifestBackup, { force: true });
renameSync(manifestPath, manifestBackup);
try {
  renameSync(manifestTemp, manifestPath);
} catch (error) {
  renameSync(manifestBackup, manifestPath);
  throw error;
}
const summaryPath = resolve(root, '.cache/topview/batch/promotion-summary.json');
writeFileSync(summaryPath, `${JSON.stringify({ promoted: promoted.length, assets: promoted }, null, 2)}\n`);
process.stdout.write(`PASS  앱 탑뷰 ${promoted.length}건 승격\nOUTPUT=${summaryPath}\n`);
