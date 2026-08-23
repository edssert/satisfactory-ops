#!/usr/bin/env node
/**
 * 저장소 전용 스킬의 구조, 참조, 낡은 운영 가정을 검사한다.
 * 사용: node scripts/check-project-skills.mjs
 * 종료: 0 통과, 2 구조·참조·명백한 레거시 규칙 오류.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skillsRoot = resolve(root, '.agents/skills');
const compatibilityRoot = resolve(root, '.claude/skills');
const errors = [];
const rows = [];
const forbiddenLegacy = [
  ['폐기 ADR 참조', /\bADR-\d+\b/g],
  ['특정 구형 모델 지정', /\b(?:sonnet|haiku)\b/gi],
  ['Claude 검색 환경변수', /CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION/g],
  ['레거시 설정 의존', /\.claude\/settings\.json/g],
  ['문서 파일 남발 템플릿', /docs\/research\/<[^>]+>/g],
];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const skillFile of walk(skillsRoot).filter((path) => basename(path) === 'SKILL.md')) {
  const text = readFileSync(skillFile, 'utf8');
  const folderName = basename(dirname(skillFile));
  const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) errors.push(`${folderName}: frontmatter 누락`);
  if (!name || !description) errors.push(`${folderName}: name/description 누락`);
  if (name && name !== folderName) errors.push(`${folderName}: frontmatter name=${name}`);

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^[a-z]+:/i.test(link) || link.startsWith('#')) continue;
    const target = resolve(dirname(skillFile), decodeURIComponent(link.split('#')[0]));
    if (!existsSync(target)) errors.push(`${folderName}: 깨진 참조 ${link}`);
  }
  for (const [label, pattern] of forbiddenLegacy) {
    if (pattern.test(text)) errors.push(`${folderName}: ${label}`);
    pattern.lastIndex = 0;
  }
  rows.push({
    name: folderName,
    lines: text.split(/\r?\n/).length,
    scripts: walk(join(dirname(skillFile), 'scripts')).length,
    references: walk(join(dirname(skillFile), 'references')).length,
    file: relative(root, skillFile),
  });
}

if (!rows.length) errors.push('저장소 전용 스킬이 없음');
const expectedCanonical = [
  'satisfactory-asset-reconstruction',
  'satisfactory-browser-evidence',
  'satisfactory-data-evidence',
  'satisfactory-knowledge-graph',
];
const actualCanonical = rows.map((row) => row.name).sort();
if (JSON.stringify(actualCanonical) !== JSON.stringify(expectedCanonical)) {
  errors.push(`정본 스킬 집합 불일치: ${actualCanonical.join(', ')}`);
}

const compatibilityTargets = new Map([
  ['external-data-claim', 'satisfactory-data-evidence'],
  ['graph-engineering', 'satisfactory-knowledge-graph'],
  ['no-js-fallback', 'satisfactory-browser-evidence'],
  ['research-fanout', 'capability-harvest'],
  ['topview-asset-pipeline', 'satisfactory-asset-reconstruction'],
  ['visual-verify', 'satisfactory-browser-evidence'],
]);
const compatibilityFiles = walk(compatibilityRoot).filter((path) => basename(path) === 'SKILL.md');
for (const skillFile of compatibilityFiles) {
  const folderName = basename(dirname(skillFile));
  const text = readFileSync(skillFile, 'utf8');
  const expected = compatibilityTargets.get(folderName);
  if (!expected || !text.includes(expected)) errors.push(`${folderName}: 정본 호환 포인터 누락`);
  const extraFiles = walk(dirname(skillFile)).filter((file) => file !== skillFile);
  if (extraFiles.length) errors.push(`${folderName}: 호환 폴더에 중복 리소스 ${extraFiles.map((file) => relative(root, file)).join(', ')}`);
}
if (compatibilityFiles.length !== compatibilityTargets.size) {
  errors.push(`Claude 호환 포인터 수 불일치: ${compatibilityFiles.length}`);
}
if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.exit(2);
}
for (const row of rows) process.stdout.write(`  ${row.name.padEnd(24)} ${String(row.lines).padStart(3)}줄 · script ${row.scripts} · ref ${row.references}\n`);
process.stdout.write(`PASS  정본 스킬 ${rows.length}개 · Claude 호환 포인터 ${compatibilityFiles.length}개 · frontmatter/참조/레거시 가정 검사\n`);
