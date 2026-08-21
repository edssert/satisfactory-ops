#!/usr/bin/env node
/**
 * Blender 5 EEVEE Next RGBA를 Anders EEVEE 2.93 계열 AO Ground/Bloom 알파 결과로 호환한다.
 * 사용: node scripts/topview/finalize-topview.mjs <input.png> <output.png>
 * 종료: 0 성공, 2 인자/점유 코너 검출 오류.
 */

import sharp from 'sharp';

const [input, output] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const stateGlowArg = process.argv.find((value) => value.startsWith('--state-glow='))?.slice('--state-glow='.length);
const stateGlowParts = stateGlowArg?.split(',') ?? null;
const stateGlow = stateGlowParts ? stateGlowParts.slice(0, 3).map(Number) : null;
const stateGlowColor = stateGlowParts?.[3] ?? '#18ff45';
if (stateGlow && (stateGlowParts?.length !== 4 || !stateGlow.every(Number.isFinite) || !/^#[0-9a-f]{6}$/i.test(stateGlowColor))) {
  process.stderr.write(`ERROR 상태광 마스크 오류: ${stateGlowArg}\n`);
  process.exit(2);
}
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
const nearShadow = Buffer.alloc(data.length);
const wideShadow = Buffer.alloc(data.length);
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
  if (!(nearFrame && pureWhite)) {
    nearShadow[offset + 3] = Math.round(alpha * 0.46);
    wideShadow[offset + 3] = Math.round(alpha * 0.2);
  }

  const orangeEmission = red > 245 && green > 175 && blue < 190;
  const hotEmission = alpha > 0 && orangeEmission && !nearFrame;
  if (hotEmission) {
    glow[offset] = 255;
    glow[offset + 1] = Math.max(100, green);
    glow[offset + 2] = Math.min(80, blue);
    glow[offset + 3] = 255;
    glowPixels += 1;
  }
}

const raw = { width: info.width, height: info.height, channels: 4 };
const nearShadowLayer = await sharp(nearShadow, { raw }).blur(9).png().toBuffer();
const wideShadowLayer = await sharp(wideShadow, { raw }).blur(30).png().toBuffer();
const bloomLayer = await sharp(glow, { raw }).blur(10).png().toBuffer();
const stateBloomLayer = stateGlow ? Buffer.from(`<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="state-bloom">
    <stop offset="0" stop-color="${stateGlowColor}" stop-opacity=".85"/>
    <stop offset="1" stop-color="${stateGlowColor}" stop-opacity="0"/>
  </radialGradient></defs>
  <circle cx="${stateGlow[0] * info.width}" cy="${stateGlow[1] * info.height}" r="${stateGlow[2] * Math.min(info.width, info.height)}" fill="url(#state-bloom)"/>
</svg>`) : null;
const graded = await sharp(data, { raw }).modulate({ brightness: 1.34, saturation: 1.04 }).png().toBuffer();
await sharp({ create: { width: info.width, height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: wideShadowLayer, blend: 'over' },
    { input: nearShadowLayer, blend: 'over' },
    { input: bloomLayer, blend: 'over' },
    { input: graded, blend: 'over' },
    ...(stateBloomLayer ? [{ input: stateBloomLayer, blend: 'over' }] : []),
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);
process.stdout.write(`PASS  AO/Bloom 알파 호환 · hot ${glowPixels}px · ${output}\n`);
