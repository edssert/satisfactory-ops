#!/usr/bin/env node
/** 기술 ISO에서 clearance가 불투명 면으로 덮이지 않고 포트 색상이 남는지 검사한다. */

import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const path = process.argv[2];
if (!path) process.exit(2);
const contractPath = path.replace(/\.[^.]+$/, '.technical-contract.json');
if (!existsSync(contractPath)) throw new Error(`technical contract 누락: ${contractPath}`);
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
const expectedCbuffer = [[30, 0.30000001192092896, 0, 0], [1, 1, 1, 3], [0, 0, 0, 0]];
if (contract.depthTest !== false || contract.blend !== 'ONE+ONE' || contract.alpha !== 'MAXIMUM(base,clearance)') {
  errors.push('clearance-render-contract');
}
if (JSON.stringify(contract.runtimeCbuffer?.registers) !== JSON.stringify(expectedCbuffer)) {
  errors.push('clearance-runtime-cbuffer');
}
if (contract.gradientSampler?.binding !== 's1' ||
    contract.gradientSampler?.filter !== 'D3D12_FILTER_ANISOTROPIC' ||
    contract.gradientSampler?.addressU !== 'D3D12_TEXTURE_ADDRESS_MODE_WRAP' ||
    contract.gradientSampler?.addressV !== 'D3D12_TEXTURE_ADDRESS_MODE_WRAP') {
  errors.push('clearance-gradient-sampler');
}

const edgeRatios = [];
for (const edge of contract.clearanceEdges ?? []) {
  const [x0, y0] = edge.start;
  const [x1, y1] = edge.end;
  const length = Math.hypot(x1 - x0, y1 - y0);
  const samples = Math.max(12, Math.ceil(length / 12));
  let matched = 0;
  for (let sample = 1; sample < samples; sample += 1) {
    const x = Math.round(x0 + (x1 - x0) * sample / samples);
    const y = Math.round(y0 + (y1 - y0) * sample / samples);
    let found = false;
    for (let dy = -3; dy <= 3 && !found; dy += 1) {
      for (let dx = -3; dx <= 3 && !found; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= info.width || py < 0 || py >= info.height) continue;
        const index = (py * info.width + px) * 4;
        const channels = [data[index], data[index + 1], data[index + 2]];
        const spread = Math.max(...channels) - Math.min(...channels);
        if (data[index + 3] > 24 && Math.max(...channels) > 130 && spread < 48) found = true;
      }
    }
    if (found) matched += 1;
  }
  edgeRatios.push(matched / Math.max(1, samples - 1));
}
const continuousEdges = edgeRatios.filter((ratio) => ratio >= 0.15).length;
const averageEdgeRatio = edgeRatios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, edgeRatios.length);
if (edgeRatios.length !== 12 || continuousEdges < 4 || averageEdgeRatio < 0.20) {
  errors.push(`clearance-edge-continuity:${edgeRatios.map((ratio) => ratio.toFixed(2)).join(',')}`);
}
if (whiteRatio > 0.15) errors.push(`opaque-clearance:${whiteRatio.toFixed(4)}`);
if (visible && solidRed / visible > 0.05) errors.push(`solid-red-clearance:${(solidRed / visible).toFixed(4)}`);
if (input < 8) errors.push(`input-marker:${input}`);
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ status: 'fail', errors, visible, white, input, solidRed, edgeRatios }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`PASS  주 하드박스 투영 · 흰 런타임 cb2 · WRAP sampler · 입력 ${input}px\n`);
