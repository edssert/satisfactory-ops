#!/usr/bin/env node
/**
 * 골든 탑뷰와 후보를 같은 768px 패널에 놓고 절대 차이·기초 시각 지표를 만든다.
 * 사용: node scripts/topview/compare-golden.mjs <golden> <candidate> <output.png>
 * 종료: 0 비교 산출, 2 인자/입력 오류. 이 도구는 자동 승인하지 않는다.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const [goldenArg, candidateArg, outputArg] = process.argv.slice(2);
if (!goldenArg || !candidateArg || !outputArg) {
  process.stderr.write('사용: node scripts/topview/compare-golden.mjs <golden> <candidate> <output.png>\n');
  process.exit(2);
}

const panel = 768;
const header = 72;
const mode = process.argv.find((argument) => argument.startsWith('--mode='))?.split('=')[1] ?? 'style';
if (!['style', 'frame'].includes(mode)) throw new Error(`지원하지 않는 비교 모드: ${mode}`);
const goldenPath = resolve(goldenArg);
const candidatePath = resolve(candidateArg);
const outputPath = resolve(outputArg);

async function normalized(path) {
  const source = sharp(path).ensureAlpha();
  const { data, info } = await source.clone().raw().toBuffer({ resolveWithObject: true });
  const xs = [];
  const ys = [];
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * 4;
    if (data[offset] > 245 && data[offset + 1] > 245 && data[offset + 2] > 245 && data[offset + 3] > 220) {
      xs.push(index % info.width);
      ys.push(Math.floor(index / info.width));
    }
  }
  if (!xs.length) throw new Error(`${path}: 흰 점유 코너를 찾지 못했습니다.`);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let bounds = { minX, maxX, minY, maxY };
  if (mode === 'style') {
    const artBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, count: 0 };
    const edgeX = Math.max(5, Math.round((maxX - minX) * 0.04));
    const edgeY = Math.max(5, Math.round((maxY - minY) * 0.03));
    for (let index = 0; index < info.width * info.height; index += 1) {
      const offset = index * 4;
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      const alpha = data[offset + 3];
      if (alpha < 180) continue;
      const pureWhite = data[offset] > 238 && data[offset + 1] > 238 && data[offset + 2] > 238;
      const nearFrame = Math.abs(x - minX) < edgeX || Math.abs(x - maxX) < edgeX ||
        Math.abs(y - minY) < edgeY || Math.abs(y - maxY) < edgeY;
      if (pureWhite && nearFrame) continue;
      artBounds.minX = Math.min(artBounds.minX, x);
      artBounds.maxX = Math.max(artBounds.maxX, x);
      artBounds.minY = Math.min(artBounds.minY, y);
      artBounds.maxY = Math.max(artBounds.maxY, y);
      artBounds.count += 1;
    }
    if (artBounds.count) bounds = artBounds;
  }
  const sourceWidth = bounds.maxX - bounds.minX + 1;
  const sourceHeight = bounds.maxY - bounds.minY + 1;
  const padX = Math.round(sourceWidth * 0.06);
  const padY = Math.round(sourceHeight * 0.04);
  const left = Math.max(0, bounds.minX - padX);
  const top = Math.max(0, bounds.minY - padY);
  const width = Math.min(info.width - left, sourceWidth + padX * 2);
  const height = Math.min(info.height - top, sourceHeight + padY * 2);
  const image = await source
    .extract({ left, top, width, height })
    .resize(Math.round(panel * 0.86), Math.round(panel * 0.9), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: panel, height: panel, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: image, left: Math.floor(panel * 0.07), top: Math.floor(panel * 0.05) }])
    .png()
    .toBuffer();
}

async function metrics(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alphaPixels = 0;
  let softAlpha = 0;
  let luminance = 0;
  let dark = 0;
  let saturatedHighlight = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (!alpha) continue;
    alphaPixels += 1;
    if (alpha < 250) softAlpha += 1;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminance += value;
    if (value < 32) dark += 1;
    if (Math.max(red, green, blue) >= 220 && Math.max(red, green, blue) - Math.min(red, green, blue) >= 70) {
      saturatedHighlight += 1;
    }
  }
  const total = info.width * info.height;
  return {
    alphaCoverage: alphaPixels / total,
    softAlphaRatio: softAlpha / Math.max(alphaPixels, 1),
    meanLuminance: luminance / Math.max(alphaPixels, 1),
    darkRatio: dark / Math.max(alphaPixels, 1),
    saturatedHighlightRatio: saturatedHighlight / Math.max(alphaPixels, 1),
  };
}

const golden = await normalized(goldenPath);
const candidate = await normalized(candidatePath);
const goldenSource = await sharp(goldenPath).ensureAlpha().png().toBuffer();
const candidateSource = await sharp(candidatePath).ensureAlpha().png().toBuffer();
const goldenRaw = await sharp(golden).raw().toBuffer();
const candidateRaw = await sharp(candidate).raw().toBuffer();
const difference = Buffer.alloc(goldenRaw.length);
for (let index = 0; index < difference.length; index += 4) {
  difference[index] = Math.abs(goldenRaw[index] - candidateRaw[index]);
  difference[index + 1] = Math.abs(goldenRaw[index + 1] - candidateRaw[index + 1]);
  difference[index + 2] = Math.abs(goldenRaw[index + 2] - candidateRaw[index + 2]);
  difference[index + 3] = 255;
}
const differencePng = await sharp(difference, { raw: { width: panel, height: panel, channels: 4 } }).png().toBuffer();
const background = { r: 18, g: 21, b: 24, alpha: 1 };
const label = Buffer.from(`<svg width="${panel * 3}" height="${header}">
  <rect width="100%" height="100%" fill="#121518"/>
  <g fill="#e7eaed" font-family="Arial, sans-serif" font-size="28" font-weight="700">
    <text x="28" y="46">GOLDEN</text>
    <text x="${panel + 28}" y="46">CANDIDATE</text>
    <text x="${panel * 2 + 28}" y="46">ABSOLUTE DIFFERENCE</text>
  </g>
</svg>`);
await sharp({ create: { width: panel * 3, height: panel + header, channels: 4, background } })
  .composite([
    { input: label, left: 0, top: 0 },
    { input: golden, left: 0, top: header },
    { input: candidate, left: panel, top: header },
    { input: differencePng, left: panel * 2, top: header },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

const report = {
  mode,
  golden: { path: goldenPath, source: await metrics(goldenSource), normalized: await metrics(golden) },
  candidate: { path: candidatePath, source: await metrics(candidateSource), normalized: await metrics(candidate) },
  note: '수치와 차이 이미지는 검수 보조다. 형상 시대가 다른 후보를 자동 승인하지 않는다.',
};
writeFileSync(outputPath.replace(/\.png$/i, '.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`PASS  골든 비교 시트 ${outputPath}\n`);
