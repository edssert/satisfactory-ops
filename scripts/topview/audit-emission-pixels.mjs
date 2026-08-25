#!/usr/bin/env node
/** 최종 ISO에서 state 색상과 warm emissive 픽셀이 실제로 보이는지 검사한다. */

import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const imagePath = process.argv[2];
const scene = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const { data } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let statePixels = 0;
let warmPixels = 0;
for (let index = 0; index < data.length; index += 4) {
  const [r, g, b, a] = data.subarray(index, index + 4);
  if (a < 32) continue;
  if (g > 120 && g > r * 1.35 && g > b * 1.15) statePixels += 1;
  if (r > 150 && g > 70 && g < r * 0.9 && b < g * 0.85) warmPixels += 1;
}
const errors = [];
if (Object.keys(scene.materials.stateMask ?? {}).length && statePixels < 5) errors.push(`state:${statePixels}`);
if ((scene.materials.emissiveAccent?.length ?? 0) && warmPixels < 10) errors.push(`warm:${warmPixels}`);
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors, statePixels, warmPixels }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  발광 픽셀 state=${statePixels} warm=${warmPixels}\n`);
