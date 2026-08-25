#!/usr/bin/env node
/** 메인 ISO 파이프라인과 어댑터에 제품별 클래스·재질명이 들어가지 않았는지 검사한다. */

import { readFileSync } from 'node:fs';

const files = [
  'scripts/topview/build-isometric-scene.mjs',
  'scripts/topview/build-factory-array-profile.mjs',
  'scripts/topview/build-vat-material-profile.mjs',
  'scripts/topview/apply-mesh-decal-adapter.py',
  'scripts/topview/apply-foundation-adapter.py',
  'scripts/topview/apply-hologram-adapter.py',
  'scripts/topview/merge-isometric-adapters.py',
  'scripts/topview/render-isometric-scene.py',
  'scripts/topview/render-topview.py',
];
const errors = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/biomass|generatorbiomass/i.test(text)) errors.push(file);
}
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', productSpecific: errors }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  ISO 메인 파이프라인 제품별 예외 0 · ${files.length}개 파일\n`);
