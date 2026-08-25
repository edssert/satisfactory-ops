#!/usr/bin/env node
/**
 * Satisfactory 3×3 공용 재질 셀 프로파일을 PNG 아틀라스로 만든다.
 * 사용: node scripts/topview/build-material-atlas.mjs [profile.json] [output.png]
 * 종료: 0 성공, 2 스키마·색·좌표 오류.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const profilePath = resolve(process.argv[2] ?? 'scripts/topview/satisfactory-material-profile.json');
const outputPath = resolve(process.argv[3] ?? '.cache/topview/satisfactory-material-atlas.png');
const reflectionOutputPath = resolve(process.argv[4] ?? '.cache/topview/satisfactory-reflection-atlas.png');
const normalOutputPath = resolve(process.argv[5] ?? '.cache/topview/satisfactory-normal-atlas.png');
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const { columns, rows, cellPx } = profile.grid ?? {};
if (![columns, rows, cellPx].every(Number.isInteger) || columns <= 0 || rows <= 0 || cellPx <= 0) {
  process.stderr.write('ERROR grid 스키마\n');
  process.exit(2);
}
if (!Array.isArray(profile.cells) || profile.cells.length !== columns * rows) {
  process.stderr.write('ERROR cells 개수\n');
  process.exit(2);
}

const parseHex = (value) => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`잘못된 색 ${value}`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};
const width = columns * cellPx;
const height = rows * cellPx;
const data = Buffer.alloc(width * height * 4);
const reflectionData = Buffer.alloc(width * height * 4);
const normalData = Buffer.alloc(width * height * 4);
const loadSlices = async (pattern, count) => pattern ? Promise.all(Array.from({ length: count }, async (_, index) => {
  const path = resolve(pattern.replace('{index}', String(index).padStart(2, '0')));
  const { data: slice, info } = await sharp(path).resize(cellPx, cellPx).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== cellPx || info.height !== cellPx || info.channels !== 4) throw new Error(`슬라이스 형식 오류 ${path}`);
  return slice;
})) : [];
const albedoSlices = await loadSlices(profile.textureArrays?.albedoPattern, columns * rows);
const mreoSlices = await loadSlices(profile.textureArrays?.mreoPattern, columns * rows);
const normalSlices = await loadSlices(profile.textureArrays?.normalPattern, profile.textureArrays?.normalSlices ?? 0);
const fill = (buffer, left, top, rectWidth, rectHeight, values) => {
  for (let y = top; y < top + rectHeight; y += 1) {
    for (let x = left; x < left + rectWidth; x += 1) {
      const offset = (y * width + x) * 4;
      buffer[offset] = values[0];
      buffer[offset + 1] = values[1];
      buffer[offset + 2] = values[2];
      buffer[offset + 3] = 255;
    }
  }
};
const occupied = new Set();
for (const cell of profile.cells) {
  const key = `${cell.row}:${cell.column}`;
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column) || cell.row < 0 || cell.column < 0 ||
      cell.row >= rows || cell.column >= columns || occupied.has(key)) {
    process.stderr.write(`ERROR cell 좌표 ${key}\n`);
    process.exit(2);
  }
  occupied.add(key);
  const color = parseHex(cell.color);
  const left = cell.column * cellPx;
  // CUE4Parse glTF 변환에서 V축이 이미 뒤집혀 있으므로 프로파일 행을 PNG 순서로 둔다.
  const top = cell.row * cellPx;
  fill(data, left, top, cellPx, cellPx, color);
  fill(reflectionData, left, top, cellPx, cellPx, [cell.metallic, cell.roughness, cell.emission].map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)));
  fill(normalData, left, top, cellPx, cellPx, [128, 128, 255]);
  for (const subcell of cell.subcells ?? []) {
    const subLeft = left + Math.round(subcell.x * cellPx);
    const subTop = top + Math.round(subcell.y * cellPx);
    const subWidth = Math.round(subcell.width * cellPx);
    const subHeight = Math.round(subcell.height * cellPx);
    if ([subcell.x, subcell.y, subcell.width, subcell.height].some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
        subcell.x + subcell.width > 1 || subcell.y + subcell.height > 1 || subWidth <= 0 || subHeight <= 0) {
      process.stderr.write(`ERROR subcell ${cell.role}/${subcell.role}\n`);
      process.exit(2);
    }
    fill(data, subLeft, subTop, subWidth, subHeight, parseHex(subcell.color));
    fill(reflectionData, subLeft, subTop, subWidth, subHeight,
      [subcell.metallic, subcell.roughness, subcell.emission].map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)));
  }
  const sliceIndex = cell.row * columns + cell.column;
  const albedoSlice = albedoSlices[sliceIndex];
  const mreoSlice = mreoSlices[sliceIndex];
  const normalSlice = normalSlices[sliceIndex];
  for (let localY = 0; localY < cellPx; localY += 1) {
    for (let localX = 0; localX < cellPx; localX += 1) {
      const atlasOffset = (((top + localY) * width) + left + localX) * 4;
      const sliceOffset = (localY * cellPx + localX) * 4;
      if (albedoSlice) {
        for (let channel = 0; channel < 3; channel += 1) {
          data[atlasOffset + channel] = Math.round(data[atlasOffset + channel] * albedoSlice[sliceOffset + channel] / 255);
        }
      }
      if (mreoSlice) {
        reflectionData[atlasOffset] = mreoSlice[sliceOffset];
        reflectionData[atlasOffset + 1] = mreoSlice[sliceOffset + 1];
        reflectionData[atlasOffset + 2] = mreoSlice[sliceOffset + 2];
      }
      if (normalSlice) {
        normalData[atlasOffset] = normalSlice[sliceOffset];
        normalData[atlasOffset + 1] = normalSlice[sliceOffset + 1];
        normalData[atlasOffset + 2] = normalSlice[sliceOffset + 2];
        normalData[atlasOffset + 3] = 255;
      }
    }
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
mkdirSync(dirname(reflectionOutputPath), { recursive: true });
await sharp(reflectionData, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(reflectionOutputPath);
mkdirSync(dirname(normalOutputPath), { recursive: true });
await sharp(normalData, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(normalOutputPath);
process.stdout.write(`PASS  ${profile.id} · ${columns}×${rows}셀 · ${outputPath} · ${reflectionOutputPath} · ${normalOutputPath}\n`);
