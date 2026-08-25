#!/usr/bin/env node
/** 현재 설치본의 MM_FactoryBaked_VAT 재질을 idle-frame Blender IR로 생성한다. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFactoryAssetRows } from './material-resolver.mjs';

const root = resolve(import.meta.dirname, '../..');
const materialName = process.argv[2];
const outputArgument = process.argv[3];
if (!materialName || !outputArgument) {
  process.stderr.write('VAT material name과 출력 경로가 필요합니다.\n');
  process.exit(2);
}
const output = resolve(root, outputArgument);
const rows = readFactoryAssetRows(root);
const materials = rows.flatMap((row) => (row.Materials ?? []).map((material) => ({ package: row.Package, ...material })));
const byPackage = new Map(rows.map((row) => [row.Package.toLowerCase(), row]));
const leaf = materials.find((material) => material.Name === materialName);
const packagePath = (objectPath) => objectPath.replace(/\.\d+$/, '').replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
const chain = [];
let current = leaf;
while (current) {
  chain.unshift(current);
  if (!current.Parent) break;
  const row = byPackage.get(packagePath(current.Parent).toLowerCase());
  const parentName = current.Parent.match(/([^/.]+)\.\d+$/)?.[1];
  const parent = row?.Materials?.find((material) => material.Name === parentName);
  current = parent ? { package: row.Package, ...parent } : null;
}
const master = chain.find((material) => material.Name === 'MM_FactoryBaked_VAT');
const slot = rows.flatMap((row) => row.ColorSlots ?? []).find((entry) => entry.Slot === 0);
if (!leaf || !master || !slot) throw new Error(`${materialName} VAT 체인 또는 색상 슬롯이 없습니다.`);
const profile = {
  $schemaVersion: 1,
  adapter: 'MM_FactoryBaked_VAT',
  material: materialName,
  parentChain: chain.map((material) => material.Name),
  primitiveData: master.PrimitiveData,
  paint: {
    mode: leaf.Switches?.bUseLegacyPaintTextures
      ? 'legacy-primary-multiply'
      : leaf.Switches?.bUsePrimitiveCustomData ? 'primitive-custom-data' : 'material-native',
    primary: slot.PrimaryColor,
    secondary: slot.SecondaryColor,
  },
  textures: leaf.Textures,
  idle: { TimeOffset: 0, Speed: 0, displacement: 'base-mesh' },
  switches: leaf.Switches,
  sources: chain.map((material) => material.package),
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(profile, null, 2)}\n`);
process.stdout.write(`PASS  VAT 재질 IR ${materialName} · ${output}\n`);
