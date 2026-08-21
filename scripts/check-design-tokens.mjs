#!/usr/bin/env node
/**
 * check-design-tokens.mjs — 시각 토큰의 단일 정본과 소비 계약을 정적으로 검증한다.
 *
 * 사용: npm run check:tokens
 * 종료 코드: 0 계약 통과 · 1 원시 색상 누출/미정의 토큰/문서 정본 불일치
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
const TOKENS = path.join(SRC, 'styles', 'tokens.css');
const BRIEF = path.resolve('docs', 'DESIGN-BRIEF.md');
const EXTENSIONS = new Set(['.astro', '.css', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return EXTENSIONS.has(path.extname(entry.name)) ? [target] : [];
  });
}

function lineOf(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

const files = walk(SRC);
const contents = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const rawColor = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab)\s*\(/gi;
const leaks = [];
for (const [file, source] of contents) {
  if (file === TOKENS) continue;
  for (const match of source.matchAll(rawColor)) {
    leaks.push(`${path.relative('.', file)}:${lineOf(source, match.index)} ${match[0]}`);
  }
}

const declared = new Set();
const referenced = new Map();
for (const [file, source] of contents) {
  for (const match of source.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) declared.add(match[1]);
  for (const match of source.matchAll(/var\(--([a-zA-Z0-9_-]+)/g)) {
    const name = match[1];
    const sites = referenced.get(name) ?? [];
    sites.push(`${path.relative('.', file)}:${lineOf(source, match.index)}`);
    referenced.set(name, sites);
  }
}
const undefinedTokens = [...referenced]
  .filter(([name]) => !declared.has(name))
  .map(([name, sites]) => `--${name}: ${sites.slice(0, 3).join(', ')}`);

const tokenSource = fs.readFileSync(TOKENS, 'utf8');
const lightBlock = tokenSource.match(/:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const requiredLightOverrides = [
  'canvas', 'layer-1', 'layer-2', 'layer-3', 'layer-accent',
  'text-primary', 'text-secondary', 'text-tertiary', 'text-inverse',
  'border-subtle', 'border-strong', 'brand', 'brand-strong',
  'action', 'action-strong', 'on-action', 'status-ok', 'status-danger', 'status-warning',
];
const missingLight = requiredLightOverrides.filter((name) => !new RegExp(`--${name}\\s*:`).test(lightBlock));

const brief = fs.readFileSync(BRIEF, 'utf8');
const requiredBriefFacts = [
  'src/styles/tokens.css',
  'Wanted Sans',
  'Pretendard',
  'JetBrains Mono',
  '라이트 = 정밀 작업지',
  '다크 = 현장 제어실',
  '색상 리터럴은 `src/styles/tokens.css` 밖에서 0건',
];
const missingBriefFacts = requiredBriefFacts.filter((fact) => !brief.includes(fact));

if (leaks.length || undefinedTokens.length || missingLight.length || missingBriefFacts.length) {
  if (leaks.length) console.error(`FAIL  토큰 밖 원시 색상 ${leaks.length}건\n  ${leaks.join('\n  ')}`);
  if (undefinedTokens.length) console.error(`FAIL  미정의 CSS 토큰 ${undefinedTokens.length}건\n  ${undefinedTokens.join('\n  ')}`);
  if (missingLight.length) console.error(`FAIL  라이트 테마 역할 누락: ${missingLight.map((name) => `--${name}`).join(', ')}`);
  if (missingBriefFacts.length) console.error(`FAIL  DESIGN-BRIEF 계약 누락: ${missingBriefFacts.join(' / ')}`);
  process.exit(1);
}

console.log(`PASS  토큰 밖 원시 색상 0건 (${files.length}개 소스)`);
console.log(`PASS  CSS 토큰 참조 ${referenced.size}종 전부 정의`);
console.log(`PASS  라이트 테마 핵심 역할 ${requiredLightOverrides.length}종 정의`);
console.log('PASS  DESIGN-BRIEF와 배포 토큰 계약 일치');
