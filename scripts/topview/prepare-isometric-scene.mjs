#!/usr/bin/env node
/** 장면에 현재 게임 재질 binding·state mask·adapter evidence를 적용해 resolved scene을 만든다. */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFactoryAssetRows, resolveSceneGameMaterials } from './material-resolver.mjs';
import { filterSceneToRuntimeVisuals } from './build-runtime-material-ir.mjs';

const root = resolve(import.meta.dirname, '../..');
const input = resolve(root, process.argv[2] ?? '');
const output = resolve(root, process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) process.exit(2);
const scene = JSON.parse(readFileSync(input, 'utf8'));
const renderContract = JSON.parse(readFileSync(resolve(root, 'scripts/unreal-render/render-contract.json'), 'utf8'));
const probePath = resolve(root, `.cache/game-asset-index/runtime-probes/CL-${renderContract.gameBuild}/${scene.buildingClass}.json`);
const probe = JSON.parse(readFileSync(probePath, 'utf8'));
const productScene = filterSceneToRuntimeVisuals(scene, { probe });
const resolved = resolveSceneGameMaterials(productScene, {
  root,
  exportRoot: resolve(root, '.tmp-research/cue4parse-pilot/exports'),
  rows: readFactoryAssetRows(root),
}).scene;
writeFileSync(output, `${JSON.stringify(resolved, null, 2)}\n`);
process.stdout.write(`PASS  resolved scene · ${output}\n`);
