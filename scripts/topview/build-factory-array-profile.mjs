#!/usr/bin/env node
/** 현재 설치본의 MM_Factory_Array 런타임 값과 색상 슬롯으로 Blender UV sheet 프로파일을 생성한다. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFactoryAssetRows } from './material-resolver.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, process.argv[2] ?? '.cache/topview/factory-array-profile.json');
const rows = readFactoryAssetRows(root);
const material = rows.flatMap((row) => row.Materials ?? []).find((entry) => entry.Name === 'MM_Factory_Array');
const slot = rows.flatMap((row) => row.ColorSlots ?? []).find((entry) => entry.Slot === 0);
if (!material || !slot) throw new Error('MM_Factory_Array 또는 기본 색상 슬롯이 없습니다.');
const vectors = material.RuntimeVectors;
const hex = (value) => `#${value.Hex.toLowerCase()}`;
const cells = [
  { row: 0, column: 0, role: 'paint-primary', color: hex(slot.PrimaryColor) },
  { row: 0, column: 1, role: 'composite', color: hex(vectors.Composite_Color) },
  { row: 0, column: 2, role: 'rubber-plastic-dark', color: hex(vectors.Plastic_Color) },
  { row: 1, column: 0, role: 'paint-secondary', color: hex(slot.SecondaryColor) },
  { row: 1, column: 1, role: 'rough-metal', color: '#ffffff' },
  { row: 1, column: 2, role: 'plastic-height', color: hex(vectors.Height_Color) },
  { row: 2, column: 0, role: 'chrome', color: '#ffffff' },
  { row: 2, column: 1, role: 'dark-steel', color: '#ffffff' },
  {
    row: 2, column: 2, role: 'lights-and-void', color: '#000000',
    subcells: [
      { role: 'glowing-light', x: 0, y: 0, width: 0.5, height: 0.5, color: hex(vectors.GlowingLight) },
      { role: 'input-light', x: 0.5, y: 0, width: 0.25, height: 0.5, color: hex(vectors.Input_Color) },
      { role: 'output-light', x: 0.75, y: 0, width: 0.25, height: 0.5, color: hex(vectors.Output_Color) },
      { role: 'standard-light', x: 0, y: 0.5, width: 0.5, height: 0.5, color: hex(vectors.StandardLight) },
      { role: 'pure-unlit-black', x: 0.5, y: 0.5, width: 0.5, height: 0.5, color: '#000000' },
    ],
  },
].map((cell) => ({ ...cell, metallic: 0, roughness: 0, emission: 0,
  subcells: cell.subcells?.map((entry) => ({ ...entry, metallic: 0, roughness: 0, emission: 0 })) }));
const profile = {
  $schemaVersion: 1,
  id: `factory-array-${material.Name}`,
  grid: { columns: 3, rows: 3, cellPx: 256 },
  textureArrays: {
    albedoPattern: '.cache/game-asset-export/factory-base-bc-slices/TX2D_FactoryBase_BC-slice-{index}.png',
    mreoPattern: '.cache/game-asset-export/factory-base-mreo-slices/TX2D_FactoryBase_MREO-slice-{index}.png',
    normalPattern: '.cache/game-asset-export/factory-base-normal-slices/TX2D_FactoryBase_N-slice-{index}.png',
    normalSlices: 7,
  },
  sources: [
    'BP_BuildableSubsystem.mColorSlots_Data[0]',
    'MM_Factory_Array.RuntimeVectors',
    'TX2D_FactoryBase_BC/MREO/N',
  ],
  cells,
  confidence: 'verified-game-values',
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(profile, null, 2)}\n`);
process.stdout.write(`PASS  Factory Array 프로파일 · ${output}\n`);
