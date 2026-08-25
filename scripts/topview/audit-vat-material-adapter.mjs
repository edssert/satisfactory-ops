#!/usr/bin/env node
/** VAT adapter가 게임 CPD·paint·idle 계약을 보존하는지 검사한다. */

import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(process.argv[2] ?? '.cache/topview/vat-material-profile.json', 'utf8'));
const required = {
  PrimaryPaintMetal_Color_R: 0, PrimaryPaintMetal_Color_G: 1, PrimaryPaintMetal_Color_B: 2,
  SecondaryPaintedMetal_Color_R: 3, SecondaryPaintedMetal_Color_G: 4, SecondaryPaintedMetal_Color_B: 5,
  HasPower: 6, PR_Metallic: 9, PR_Roughness: 10, TimeOffset: 21, Speed: 22,
};
const errors = [];
for (const [name, index] of Object.entries(required)) if (profile.primitiveData[name] !== index) errors.push(`${name}:${profile.primitiveData[name]}`);
const expectedPaintMode = profile.switches.bUseLegacyPaintTextures
  ? 'legacy-primary-multiply'
  : profile.switches.bUsePrimitiveCustomData ? 'primitive-custom-data' : 'material-native';
if (profile.paint.mode !== expectedPaintMode) errors.push(`paint-mode:${profile.paint.mode}/${expectedPaintMode}`);
if (profile.idle.TimeOffset !== 0 || profile.idle.Speed !== 0 || profile.idle.displacement !== 'base-mesh') errors.push('idle');
if (!profile.switches.bIsVertexAnimatedFactoryMesh) errors.push('switches');
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write('PASS  MM_FactoryBaked_VAT CPD·paint·idle 계약\n');
