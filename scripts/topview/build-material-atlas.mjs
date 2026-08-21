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
  for (let y = cell.row * cellPx; y < (cell.row + 1) * cellPx; y += 1) {
    for (let x = cell.column * cellPx; x < (cell.column + 1) * cellPx; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
      reflectionData[offset] = Math.round(Math.max(0, Math.min(1, cell.metallic)) * 255);
      reflectionData[offset + 1] = Math.round(Math.max(0, Math.min(1, cell.roughness)) * 255);
      reflectionData[offset + 2] = Math.round(Math.max(0, Math.min(1, cell.emission)) * 255);
      reflectionData[offset + 3] = 255;
    }
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
mkdirSync(dirname(reflectionOutputPath), { recursive: true });
await sharp(reflectionData, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(reflectionOutputPath);
process.stdout.write(`PASS  ${profile.id} · ${columns}×${rows}셀 · ${outputPath} · ${reflectionOutputPath}\n`);
