#!/usr/bin/env node
/**
 * Blender 5 EEVEE Next RGBA를 Anders EEVEE 2.93 계열 AO Ground/Bloom 알파 결과로 호환한다.
 * 사용: node scripts/topview/finalize-topview.mjs <input.png> <output.png>
 * 종료: 0 성공, 2 인자/점유 코너 검출 오류.
 */

import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  process.stderr.write('사용: node scripts/topview/finalize-topview.mjs <input.png> <output.png>\n');
  process.exit(2);
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const whitePoints = [];
for (let index = 0; index < info.width * info.height; index += 1) {
  const offset = index * 4;
  if (data[offset] > 245 && data[offset + 1] > 245 && data[offset + 2] > 245 && data[offset + 3] > 220) {
    whitePoints.push([index % info.width, Math.floor(index / info.width)]);
  }
}
if (!whitePoints.length) {
  process.stderr.write('ERROR 흰 점유 코너를 찾지 못했습니다.\n');
  process.exit(2);
}
const xs = whitePoints.map(([x]) => x);
const ys = whitePoints.map(([, y]) => y);
const frame = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
const edgeX = Math.max(6, Math.round((frame.maxX - frame.minX) * 0.035));
const edgeY = Math.max(6, Math.round((frame.maxY - frame.minY) * 0.025));
const shadow = Buffer.alloc(data.length);
const glow = Buffer.alloc(data.length);
let glowPixels = 0;

for (let index = 0; index < info.width * info.height; index += 1) {
  const offset = index * 4;
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const nearFrame = Math.abs(x - frame.minX) < edgeX || Math.abs(x - frame.maxX) < edgeX ||
    Math.abs(y - frame.minY) < edgeY || Math.abs(y - frame.maxY) < edgeY;
  const pureWhite = red > 238 && green > 238 && blue > 238;
  if (!(nearFrame && pureWhite)) shadow[offset + 3] = Math.round(alpha * 0.58);

  const hotEmission = alpha > 0 && red > 245 && green > 175 && blue < 190 && !nearFrame;
  if (hotEmission) {
    glow[offset] = 255;
    glow[offset + 1] = Math.max(100, green);
    glow[offset + 2] = Math.min(80, blue);
    glow[offset + 3] = 235;
    glowPixels += 1;
  }
}

const raw = { width: info.width, height: info.height, channels: 4 };
const shadowLayer = await sharp(shadow, { raw }).blur(26).png().toBuffer();
const wideGlow = await sharp(glow, { raw }).blur(24).png().toBuffer();
const nearGlow = await sharp(glow, { raw }).blur(8).png().toBuffer();
const graded = await sharp(data, { raw }).modulate({ brightness: 1.34, saturation: 1.04 }).png().toBuffer();
await sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: shadowLayer, blend: 'over' },
    { input: wideGlow, blend: 'over' },
    { input: nearGlow, blend: 'over' },
    { input: graded, blend: 'over' },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);
process.stdout.write(`PASS  AO/Bloom 알파 호환 · hot ${glowPixels}px · ${output}\n`);
