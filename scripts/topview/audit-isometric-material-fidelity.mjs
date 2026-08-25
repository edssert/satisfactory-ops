#!/usr/bin/env node
/**
 * 장면의 게임 재질 부모 체인과 Blender 재구성 충실도를 검사한다.
 * 사용: node scripts/topview/audit-isometric-material-fidelity.mjs <scene.json> [--require-product]
 * 종료: 0 증거 생성/후보 허용, 1 제품용 충실도 미달, 2 입력 오류.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFactoryAssetRows, resolveSceneGameMaterials } from './material-resolver.mjs';

const root = resolve(import.meta.dirname, '../..');
const sceneArgument = process.argv[2];
if (!sceneArgument) {
  process.stderr.write('장면 JSON 경로가 필요합니다.\n');
  process.exit(2);
}

const scenePath = resolve(root, sceneArgument);
const exportRoot = resolve(root, '.tmp-research/cue4parse-pilot/exports');
if (!existsSync(scenePath) || !existsSync(exportRoot)) {
  process.stderr.write(`입력이 없습니다: ${scenePath} 또는 ${exportRoot}\n`);
  process.exit(2);
}

const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const adapterRegistry = JSON.parse(readFileSync(resolve(root, 'scripts/topview/isometric-material-adapters.json'), 'utf8'));
const rows = readFactoryAssetRows(root);
const result = resolveSceneGameMaterials(scene, { root, exportRoot, rows });
const evidence = result.scene.isometricMaterialEvidence;
const unresolvedAdapters = adapterRegistry.adapters.filter((adapter) => adapter.status !== 'verified');
const productEligible = evidence.productEligible && unresolvedAdapters.length === 0;
process.stdout.write(`${JSON.stringify({
  scene: scene.id,
  productEligible,
  unresolved: evidence.unresolved,
  unresolvedAdapters,
  bindings: evidence.bindings.map((binding) => ({
    material: binding.material,
    reconstruction: binding.reconstruction,
    parentChain: binding.parentChain.map((entry) => entry.name),
    channels: binding.channels,
    primitiveData: binding.primitiveData,
    defaultColorSlot: binding.defaultColorSlot,
  })),
}, null, 2)}\n`);

if (process.argv.includes('--require-product') && !productEligible) process.exit(1);
