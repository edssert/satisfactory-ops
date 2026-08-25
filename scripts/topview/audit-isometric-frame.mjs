#!/usr/bin/env node
/** 토대·설비가 이미지 가장자리 안전 여백 안에 들어오는지 검사한다. */

import sharp from 'sharp';

const path = process.argv[2];
const margin = Number(process.argv[3] ?? 8);
const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let clipped = 0;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    if (x >= margin && x < info.width - margin && y >= margin && y < info.height - margin) continue;
    if (data[(y * info.width + x) * 4 + 3] > 24) clipped += 1;
  }
}
if (clipped) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', clipped, margin }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  ISO frame margin=${margin}px\n`);
