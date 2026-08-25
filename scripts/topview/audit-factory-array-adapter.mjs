#!/usr/bin/env node
/** Factory Array 어댑터가 현재 게임 색상과 BC/MREO/Normal 채널을 보존하는지 검사한다. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { readFactoryAssetRows } from './material-resolver.mjs';

const root = resolve(import.meta.dirname, '../..');
const rows = readFactoryAssetRows(root);
const slot = rows.flatMap((row) => row.ColorSlots ?? []).find((entry) => entry.Slot === 0);
const profile = JSON.parse(readFileSync('.cache/topview/factory-array-profile.json', 'utf8'));
const primary = profile.cells.find((cell) => cell.role === 'paint-primary');
const secondary = profile.cells.find((cell) => cell.role === 'paint-secondary');
const errors = [];
if (primary.color !== `#${slot.PrimaryColor.Hex.toLowerCase()}`) errors.push('primary-color');
if (secondary.color !== `#${slot.SecondaryColor.Hex.toLowerCase()}`) errors.push('secondary-color');

const atlas = await sharp('.cache/topview/factory-array-mreo.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (const cell of profile.cells) {
  const sourcePath = `.cache/game-asset-export/factory-base-mreo-slices/TX2D_FactoryBase_MREO-slice-${String(cell.row * 3 + cell.column).padStart(2, '0')}.png`;
  const source = await sharp(sourcePath).ensureAlpha().resize(profile.grid.cellPx, profile.grid.cellPx).raw().toBuffer({ resolveWithObject: true });
  const localX = Math.floor(profile.grid.cellPx * 0.8);
  const localY = Math.floor(profile.grid.cellPx * 0.8);
  const sourceOffset = (localY * source.info.width + localX) * 4;
  const atlasX = cell.column * profile.grid.cellPx + localX;
  const atlasY = cell.row * profile.grid.cellPx + localY;
  const atlasOffset = (atlasY * atlas.info.width + atlasX) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    if (atlas.data[atlasOffset + channel] !== source.data[sourceOffset + channel]) {
      errors.push(`${cell.role}-mreo-${channel}`);
    }
  }
}
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write('PASS  MM_Factory_Array 게임 색상·MREO 채널\n');
