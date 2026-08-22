#!/usr/bin/env node
/**
 * 제품 탑뷰를 렌더하고 카메라·점유 코너 계약을 독립 검증한 뒤 검수 영수증을 만든다.
 * 중간 후보를 승인하거나 public 자산으로 복사하지 않는다.
 *
 * 사용:
 *   node scripts/topview/run-validated-render.mjs <scene.json> <output-dir> [--baseline=<approved.png>]
 *
 * 종료:
 *   0 구조·렌더 계약 통과, 2 인자/입력 오류, 3 Blender·후처리·계약 검사 실패
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const [sceneArg, outputArg] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const baselineArg = process.argv.find((value) => value.startsWith('--baseline='))?.slice('--baseline='.length);
const stateColor = process.argv.find((value) => value.startsWith('--state-color='))?.slice('--state-color='.length);
const reuseRaw = process.argv.includes('--reuse-raw');
if (stateColor && !/^#[0-9a-f]{6}$/i.test(stateColor)) {
  process.stderr.write(`상태광 색상 오류: ${stateColor}\n`);
  process.exit(2);
}
if (!sceneArg || !outputArg) {
  process.stderr.write('사용: node scripts/topview/run-validated-render.mjs <scene.json> <output-dir> [--baseline=<approved.png>]\n');
  process.exit(2);
}

const scenePath = resolve(root, sceneArg);
const outputDir = resolve(root, outputArg);
if (!existsSync(scenePath)) {
  process.stderr.write(`장면 레시피가 없습니다: ${scenePath}\n`);
  process.exit(2);
}
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
if (scene.camera?.projection !== 'orthographic-top' || scene.camera?.frontTiltDeg !== 0 ||
    scene.footprint?.cornerEnvelope !== 'game-hard-clearance') {
  process.stderr.write('제품 탑뷰 장면은 orthographic-top/0°/game-hard-clearance 계약이어야 합니다.\n');
  process.exit(2);
}

const blender = process.env.BLENDER_EXE ?? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
if (!existsSync(blender)) {
  process.stderr.write(`Blender를 찾지 못했습니다: ${blender}\n`);
  process.exit(2);
}
mkdirSync(outputDir, { recursive: true });
const blenderRuntimeRoot = resolve(root, '.cache/blender-runtime');
const blenderUserResources = resolve(blenderRuntimeRoot, 'user-resources');
const blenderXdgCache = resolve(blenderRuntimeRoot, 'xdg-cache');
for (const path of [blenderUserResources, blenderXdgCache]) mkdirSync(path, { recursive: true });
const slug = scene.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const raw = resolve(outputDir, `${slug}.raw.png`);
const blend = resolve(outputDir, `${slug}.blend`);
const final = resolve(outputDir, `${slug}.candidate.png`);
const comparison = resolve(outputDir, `${slug}.comparison.png`);
const receipt = resolve(outputDir, `${slug}.receipt.json`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BLENDER_USER_RESOURCES: blenderUserResources, XDG_CACHE_HOME: blenderXdgCache },
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) process.exit(3);
  return result;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const renderArgs = [
  '--background', '--python-exit-code', '3', '--python', 'scripts/topview/render-topview.py', '--',
  '--scene', scenePath, '--output', raw, '--blend', blend,
  '--harness-token', 'validated-render-v1',
];
if (stateColor) renderArgs.push('--state-color-override', stateColor);
if (reuseRaw) {
  if (!existsSync(raw) || !existsSync(blend)) {
    process.stderr.write(`재사용할 raw/blend가 없습니다: ${raw} / ${blend}\n`);
    process.exit(2);
  }
} else {
  run(blender, renderArgs);
}
const contractResult = run(blender, [
  blend, '--background', '--python-exit-code', '3', '--python', 'scripts/topview/check-render-contract.py', '--', '--scene', scenePath,
]);
const frameMatch = contractResult.stdout.match(/OCCUPANCY_FRAME_NORMALIZED=([0-9.,-]+)/);
if (!frameMatch) {
  process.stderr.write('독립 계약 검사에서 정규화 점유 프레임을 받지 못했습니다.\n');
  process.exit(3);
}
const occupancyFrameValues = frameMatch[1].split(',').map(Number);
const occupancyFrame = {
  x: occupancyFrameValues[0],
  y: occupancyFrameValues[1],
  width: occupancyFrameValues[2],
  height: occupancyFrameValues[3],
};
const finalizeArgs = ['scripts/topview/finalize-topview.mjs', raw, final];
if (scene.stateIndicator?.pointM && Number.isFinite(scene.stateIndicator.maskRadiusNormalized)) {
  const [centerX, centerY] = scene.footprint.centerM ?? [0, 0];
  const [pointX, pointY] = scene.stateIndicator.pointM;
  const normalizedX = occupancyFrame.x + ((pointX - (centerX - scene.footprint.widthM / 2)) / scene.footprint.widthM) * occupancyFrame.width;
  const normalizedY = occupancyFrame.y + (((centerY + scene.footprint.lengthM / 2) - pointY) / scene.footprint.lengthM) * occupancyFrame.height;
  finalizeArgs.push(`--state-glow=${normalizedX},${normalizedY},${scene.stateIndicator.maskRadiusNormalized},${stateColor ?? scene.materials?.state?.color ?? '#18ff45'}`);
}
run(process.execPath, finalizeArgs);

let baseline = null;
if (baselineArg) {
  const baselinePath = resolve(root, baselineArg);
  if (!existsSync(baselinePath)) {
    process.stderr.write(`승인 기준본이 없습니다: ${baselinePath}\n`);
    process.exit(2);
  }
  run(process.execPath, ['scripts/topview/compare-golden.mjs', baselinePath, final, comparison, '--mode=frame']);
  baseline = { path: baselinePath, sha256: sha256(baselinePath), comparison };
}

const record = {
  schemaVersion: 1,
  status: baseline && baseline.sha256 === sha256(final)
    ? 'validated-baseline-match-not-approved'
    : 'validated-change-candidate-not-approved',
  generatedAt: new Date().toISOString(),
  scene: { id: scene.id, path: scenePath, sha256: sha256(scenePath) },
  contracts: {
    projection: 'orthographic-top',
    cameraForwardWorld: [0, 0, -1],
    frontTiltDeg: 0,
    cornerEnvelope: 'game-hard-clearance',
    footprintM: scene.footprint,
    occupancyFrame,
    stateColor: stateColor ?? scene.materials?.state?.color ?? null,
    stateIndicator: scene.stateIndicator ?? null,
  },
  outputs: {
    raw: { path: raw, sha256: sha256(raw) },
    blend: { path: blend, sha256: sha256(blend) },
    candidate: { path: final, sha256: sha256(final) },
  },
  baseline,
  baselineMatch: baseline ? baseline.sha256 === sha256(final) : null,
  approval: null,
  rule: '검증 영수증만으로 시각 승인을 대체하거나 public 자산으로 승격하지 않는다.',
};
writeFileSync(receipt, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`PASS  검증 후보 격리: ${basename(final)}\nRECEIPT=${receipt}\n`);
