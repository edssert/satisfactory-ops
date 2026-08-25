#!/usr/bin/env node
/** 도감용 current-game ISO 4방향 자산의 파일·SHA·해상도 계약을 검증한다. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'src/data/curated/isometric-assets.json'), 'utf8'));
const failures = [];
const seen = new Set();
for (const asset of manifest.assets ?? []) {
  if (!asset.buildingClass || seen.has(asset.buildingClass)) failures.push(`buildingClass 중복/누락: ${asset.buildingClass}`);
  seen.add(asset.buildingClass);
  if (asset.sourceId !== 'game-install-cl-502094-runtime-probe-blender') failures.push(`${asset.buildingClass}: sourceId 오류`);
  const views = asset.views ?? [];
  if (views.map((view) => view.azimuth).sort((a, b) => a - b).join(',') !== '45,135,225,315') {
    failures.push(`${asset.buildingClass}: 4방향 누락`);
  }
  for (const view of views) {
    if (!view.path.startsWith('assets/dex/isometric/')) failures.push(`${asset.buildingClass}: 경로 범위 오류 ${view.path}`);
    const path = resolve(root, 'public', view.path);
    if (!existsSync(path)) { failures.push(`${asset.buildingClass}: 파일 누락 ${view.path}`); continue; }
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (hash !== view.sha256) failures.push(`${asset.buildingClass}: SHA 불일치 ${view.azimuth}`);
    const metadata = await sharp(path).metadata();
    if (metadata.width !== 2048 || metadata.height !== 2048 || !metadata.hasAlpha) {
      failures.push(`${asset.buildingClass}: ${view.azimuth}° 2048 RGBA 계약 실패`);
    }
  }
  const primary = views.find((view) => view.azimuth === 135);
  if (!primary || asset.path !== primary.path || asset.sha256 !== primary.sha256 || asset.renderPx !== 2048) {
    failures.push(`${asset.buildingClass}: 대표 135° 계약 실패`);
  }
}
if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`FAIL  ${failure}\n`));
  process.exit(1);
}
process.stdout.write(`PASS  도감 ISO ${seen.size}기기 × 4방향 · 2048px · SHA 일치\n`);
