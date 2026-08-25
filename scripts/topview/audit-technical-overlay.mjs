#!/usr/bin/env node
/** 기술 ISO에서 clearance가 불투명 면으로 덮이지 않고 포트 색상이 남는지 검사한다. */

import sharp from 'sharp';

const path = process.argv[2];
if (!path) process.exit(2);
const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let visible = 0;
let white = 0;
let input = 0;
let solidRed = 0;
for (let index = 0; index < data.length; index += 4) {
  const [r, g, b, a] = data.subarray(index, index + 4);
  if (a < 32) continue;
  visible += 1;
  if (r > 242 && g > 242 && b > 242) white += 1;
  if (r > 180 && r > g * 1.35 && g > b * 1.2) input += 1;
  if (r > 245 && g < 35 && b < 35) solidRed += 1;
}
const whiteRatio = visible ? white / visible : 1;
const errors = [];
if (whiteRatio > 0.15) errors.push(`opaque-clearance:${whiteRatio.toFixed(4)}`);
if (visible && solidRed / visible > 0.05) errors.push(`solid-red-clearance:${(solidRed / visible).toFixed(4)}`);
if (input < 8) errors.push(`input-marker:${input}`);
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors, visible, white, input, solidRed }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  기술 오버레이 면비율 ${(whiteRatio * 100).toFixed(2)}% · 입력 ${input}px\n`);
