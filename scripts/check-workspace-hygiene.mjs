#!/usr/bin/env node
/**
 * 저장소 루트에 렌더러·브라우저·테스트 임시 산출물이 새지 않았는지 검사한다.
 * 사용: node scripts/check-workspace-hygiene.mjs
 * 종료: 성공 0, 정리해야 할 경로가 있으면 2.
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const suspiciousRootFiles = ['.gitignore.check', 'debug.log', 'nul'];
const ignoredTrees = new Set(['.git', '.cache', '.astro', '.tmp-research', 'dist', 'node_modules', 'output']);

for (const name of suspiciousRootFiles) {
  if (existsSync(resolve(root, name))) failures.push(`루트 임시 파일: ${name}`);
}

const plannerBundle = 'src/components/.planner-test.mjs';
if (existsSync(resolve(root, plannerBundle))) {
  failures.push(`테스트 임시 번들 미정리: ${plannerBundle}`);
}

function checkDirectoryNames(directory, relativeParts = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (relativeParts.length === 0 && ignoredTrees.has(entry.name)) continue;

    const nextParts = [...relativeParts, entry.name];
    if (/[^\x00-\x7f]/.test(entry.name)) {
      failures.push(`비ASCII 폴더: ${nextParts.join('/')}`);
    }
    checkDirectoryNames(resolve(directory, entry.name), nextParts);
  }
}

checkDirectoryNames(root);

const outputRoot = resolve(root, 'output');
if (existsSync(outputRoot)) {
  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    if (entry.isFile()) failures.push(`output 목적 폴더 밖 파일: output/${entry.name}`);
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL  ${failure}\n`);
  process.exit(2);
}

process.stdout.write('PASS  루트 임시 파일·저장소 비ASCII 폴더·테스트 번들 누출 0\n');
process.stdout.write('PASS  output 산출물은 목적별 하위 폴더에만 존재\n');
