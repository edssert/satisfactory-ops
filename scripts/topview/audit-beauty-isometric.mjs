#!/usr/bin/env node
/** 미관 ISO의 중간톤과 발광 픽셀이 소실되지 않았는지 검사한다. */

import sharp from 'sharp';

const path = process.argv[2];
if (!path) process.exit(2);
const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const luminance = [];
let hot = 0;
for (let index = 0; index < data.length; index += 4) {
  const [r, g, b, a] = data.subarray(index, index + 4);
  if (a < 32) continue;
  luminance.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  if (Math.max(r, g, b) > 220) hot += 1;
}
luminance.sort((left, right) => left - right);
const p50 = luminance[Math.floor(luminance.length * 0.5)] ?? 0;
const p90 = luminance[Math.floor(luminance.length * 0.9)] ?? 0;
const errors = [];
if (p50 < 32) errors.push(`p50:${p50.toFixed(2)}`);
if (p90 < 78) errors.push(`p90:${p90.toFixed(2)}`);
if (hot < 500) errors.push(`hot:${hot}`);
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors, p50, p90, hot }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  미관 ISO p50=${p50.toFixed(1)} p90=${p90.toFixed(1)} hot=${hot}\n`);
