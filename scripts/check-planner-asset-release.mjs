#!/usr/bin/env node
/**
 * 설계판 탑뷰의 최종 배포 경계를 검사한다.
 *
 * 선행 조건:
 *   npm run build
 *
 * 사용:
 *   node scripts/check-planner-asset-release.mjs
 *
 * 종료 코드:
 *   0 현재 게임 승인 자산만 public/dist/서비스워커에 존재
 *   2 입력·매니페스트가 없거나 신뢰 가능한 허용/거부 집합을 만들 수 없음
 *   4 public/dist/서비스워커 배포 경계 위반
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'src/data/curated/topview-assets.json');
const publicRoot = resolve(root, 'public');
const distRoot = resolve(root, 'dist');
const publicTopviewRoot = resolve(publicRoot, 'assets/planner/top-view');
const distTopviewRoot = resolve(distRoot, 'assets/planner/top-view');
const serviceWorkerPath = resolve(distRoot, 'sw.js');
const hashPattern = /^[0-9a-f]{64}$/;
const stateNames = ['active', 'activeWithCrystal', 'standby', 'error'];

function failInput(messages) {
  for (const message of messages) process.stderr.write(`ERROR ${message}\n`);
  process.exit(2);
}
process.on('uncaughtException', (error) => {
  failInput([`검사 중 입력을 읽을 수 없음: ${error.message}`]);
});

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function relativeFiles(directory, base) {
  return new Set(walk(directory)
    .filter((path) => statSync(path).isFile())
    .map((path) => normalizePath(relative(base, path))));
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function sample(values, limit = 8) {
  return values.length <= limit
    ? values.join(', ')
    : `${values.slice(0, limit).join(', ')} 외 ${values.length - limit}건`;
}

function resolveReferenceFile(asset, image) {
  const toAbsolute = (path) => {
    const normalized = normalizePath(path);
    return normalized.startsWith('assets/planner/top-view/')
      ? resolve(publicRoot, normalized)
      : resolve(root, normalized);
  };
  const candidates = [
    image?.referencePath,
    asset.referencePath,
    image?.path,
    asset.path,
  ].filter(Boolean).map(toAbsolute);
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

if (!existsSync(manifestPath)) failInput([`매니페스트 누락: ${relative(root, manifestPath)}`]);
if (!existsSync(publicRoot)) failInput(['public 디렉터리 누락']);
if (!existsSync(distRoot) || !existsSync(serviceWorkerPath)) {
  failInput(['dist 또는 dist/sw.js 누락 — npm run build를 먼저 실행하세요']);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  failInput([`매니페스트 JSON 오류: ${error.message}`]);
}
if (!Array.isArray(manifest.assets) || !manifest.$sources || typeof manifest.$sources !== 'object') {
  failInput(['매니페스트 assets/$sources 계약 누락']);
}

const gameInstallSourceIds = Object.entries(manifest.$sources)
  .filter(([sourceId, source]) => sourceId.startsWith('game-install-') && source?.type === 'local-game-extraction')
  .map(([sourceId]) => sourceId);
const currentSourceId = manifest.$runtimeSourceId ?? (
  gameInstallSourceIds.length === 1 ? gameInstallSourceIds[0] : null
);
const inputErrors = [];
if (!currentSourceId || !gameInstallSourceIds.includes(currentSourceId)) {
  inputErrors.push(`현재 game-install 출처를 하나로 결정할 수 없음: ${gameInstallSourceIds.join(', ') || '0건'}`);
}

const allowedPaths = new Set();
const allowedHashes = new Map();
const externalPaths = new Set();
const externalHashes = new Map();

function registerAllowed(owner, image) {
  const path = normalizePath(image?.path ?? '');
  const hash = image?.sha256 ?? '';
  if (!path.startsWith('assets/planner/top-view/') || path.includes('..')) {
    inputErrors.push(`${owner}: 허용 경로 오류 ${path || '(없음)'}`);
    return;
  }
  if (!hashPattern.test(hash)) {
    inputErrors.push(`${owner}: 허용 SHA-256 누락/오류`);
    return;
  }
  const previous = allowedHashes.get(path);
  if (previous && previous !== hash) inputErrors.push(`${owner}: 같은 경로의 SHA-256 충돌 ${path}`);
  allowedPaths.add(path);
  allowedHashes.set(path, hash);
}

function registerExternal(owner, asset, image) {
  const path = normalizePath(image?.path ?? '');
  if (path) externalPaths.add(path);
  let hash = image?.sha256 ?? '';
  if (!hashPattern.test(hash)) {
    const referenceFile = resolveReferenceFile(asset, image);
    if (referenceFile) hash = sha256(referenceFile);
  }
  if (!hashPattern.test(hash)) {
    inputErrors.push(`${owner}: 외부 reference SHA-256을 만들 수 없음`);
    return;
  }
  const owners = externalHashes.get(hash) ?? [];
  owners.push(owner);
  externalHashes.set(hash, owners);
}

for (const asset of manifest.assets) {
  const isRuntime = asset.sourceId === currentSourceId && asset.reviewStatus === 'approved';
  const main = { path: asset.path, sha256: asset.sha256, referencePath: asset.referencePath };
  if (isRuntime) {
    registerAllowed(`${asset.assetId}/main`, main);
    if (asset.statusImages) {
      for (const state of stateNames) registerAllowed(`${asset.assetId}/${state}`, asset.statusImages[state]);
    }
  } else if (asset.sourceId !== currentSourceId) {
    registerExternal(`${asset.assetId}/main`, asset, main);
    for (const state of stateNames) {
      if (asset.statusImages?.[state]) registerExternal(`${asset.assetId}/${state}`, asset, asset.statusImages[state]);
    }
  }
}

if (!allowedPaths.size) inputErrors.push('현재 game-install 승인 main/status 허용 자산이 0건');
if (!externalHashes.size) inputErrors.push('외부 reference SHA-256 거부 집합이 0건');
if (inputErrors.length) failInput(inputErrors);

const violations = [];
const publicFiles = relativeFiles(publicTopviewRoot, publicRoot);
const distFiles = relativeFiles(distTopviewRoot, distRoot);

for (const [label, actual] of [['public', publicFiles], ['dist', distFiles]]) {
  const missing = setDifference(allowedPaths, actual);
  const extra = setDifference(actual, allowedPaths);
  if (missing.length) violations.push(`${label}: 현재 게임 승인 탑뷰 누락 ${missing.length}건 (${sample(missing)})`);
  if (extra.length) violations.push(`${label}: 허용 밖 탑뷰 ${extra.length}건 (${sample(extra)})`);
  for (const path of actual) {
    if (!allowedPaths.has(path)) continue;
    const base = label === 'public' ? publicRoot : distRoot;
    const actualHash = sha256(resolve(base, path));
    const expectedHash = allowedHashes.get(path);
    if (actualHash !== expectedHash) violations.push(`${label}: 승인 탑뷰 SHA-256 불일치 ${path}`);
  }
}

for (const [label, base] of [['public', publicRoot], ['dist', distRoot]]) {
  for (const file of walk(base).filter((path) => statSync(path).isFile())) {
    const hash = sha256(file);
    const owners = externalHashes.get(hash);
    if (owners) {
      violations.push(`${label}: 외부 reference 바이트 노출 ${normalizePath(relative(base, file))} (${owners.join(', ')})`);
    }
  }
}

const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
const swTopviewPaths = new Set([...serviceWorker.matchAll(/assets\/planner\/top-view\/[A-Za-z0-9_.\/-]+/g)]
  .map((match) => normalizePath(match[0])));
const swExtra = setDifference(swTopviewPaths, allowedPaths);
if (swExtra.length) violations.push(`dist/sw.js: 허용 밖 탑뷰 경로 ${swExtra.length}건 (${sample(swExtra)})`);
const swExternal = [...externalPaths].filter((path) => serviceWorker.includes(path)).sort();
if (swExternal.length) violations.push(`dist/sw.js: 외부 reference 경로 ${swExternal.length}건 (${sample(swExternal)})`);

if (violations.length) {
  for (const violation of violations) process.stderr.write(`FAIL  ${violation}\n`);
  process.exit(4);
}

process.stdout.write(`PASS  현재 game-install 승인 탑뷰 exact allowlist ${allowedPaths.size}개 · public/dist 일치\n`);
process.stdout.write(`PASS  외부 reference SHA-256 denylist ${externalHashes.size}개 · public/dist 노출 0\n`);
process.stdout.write(`PASS  dist/sw.js 외부·허용 밖 탑뷰 경로 0\n`);
