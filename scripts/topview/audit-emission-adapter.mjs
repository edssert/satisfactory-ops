#!/usr/bin/env node
/** 재질 emission/state mask가 게임 런타임 값으로 연결되고 임의 배수가 없는지 검사한다. */

import { readFileSync } from 'node:fs';

const scene = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const errors = [];
const expectedStateMaterials = (scene.isometricMaterialEvidence?.bindings ?? [])
  .filter((binding) => ['R', 'G', 'B'].every((name) => Number.isInteger(binding.primitiveData?.[name])))
  .map((binding) => binding.material);
for (const material of expectedStateMaterials) {
  if (!scene.materials.stateMask?.[material]) errors.push(`missing-state-mask:${material}`);
}
for (const material of Object.keys(scene.materials.stateMask ?? {})) {
  if (!Number.isFinite(scene.materials.emissionStrength?.[material])) errors.push(`state-strength:${material}`);
}
for (const material of scene.materials.emissiveAccent ?? []) {
  if (!Number.isFinite(scene.materials.emissionStrength?.[material])) errors.push(`accent-strength:${material}`);
}
const renderer = readFileSync('scripts/topview/render-topview.py', 'utf8');
if (/default_value\s*=\s*7\.5/.test(renderer) || /hot_emission\.inputs\["Strength"\]\.default_value\s*=\s*5/.test(renderer)) {
  errors.push('hardcoded-emission-multiplier');
}
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  Emission adapter state=${Object.keys(scene.materials.stateMask ?? {}).length}/${expectedStateMaterials.length} accent=${scene.materials.emissiveAccent?.length ?? 0}\n`);
