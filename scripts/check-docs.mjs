/**
 * 별도 Obsidian 볼트의 Markdown 링크와 최소 속성 계약을 검증한다.
 * 성공: exit 0, 실패: exit 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = path.resolve('satisfactory-ops-vault');
const errors = [];

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function rel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function parseFrontmatter(text, file) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return {};
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    errors.push(`${rel(file)}: frontmatter 종료 구분자가 없습니다.`);
    return {};
  }
  try {
    return parseYaml(match[1]) ?? {};
  } catch (error) {
    errors.push(`${rel(file)}: frontmatter YAML 오류 — ${error.message}`);
    return {};
  }
}

if (!fs.existsSync(root)) {
  console.error(`[실패] 별도 볼트를 찾을 수 없습니다: ${root}`);
  process.exit(2);
}

const files = filesUnder(root);
const markdown = files.filter((file) => file.endsWith('.md'));
const noteTargets = new Set();
const aliasOwners = new Map();

function registerTarget(key, file, type) {
  const normalized = key.toLowerCase();
  if (type === '별칭') {
    const prior = aliasOwners.get(normalized);
    if (prior && prior !== file) {
      errors.push(`${rel(file)}: 별칭 '${key}'가 ${rel(prior)}와 중복됩니다.`);
      return;
    }
    aliasOwners.set(normalized, file);
  }
  noteTargets.add(normalized);
}

for (const file of markdown) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) errors.push(`${rel(file)}: 빈 문서입니다.`);
  const relative = rel(file).replace(/\.md$/i, '');
  const basename = path.basename(file, '.md');
  registerTarget(relative, file, '경로');
  registerTarget(basename, file, '파일명');
  const frontmatter = parseFrontmatter(text, file);
  const relativePath = rel(file);
  const allowedProperties = relativePath.startsWith('docs/research/')
    ? new Set(['confidence'])
    : new Set();
  const excessProperties = Object.keys(frontmatter).filter((key) => !allowedProperties.has(key));
  if (excessProperties.length) {
    errors.push(`${relativePath}: 불필요한 속성 ${excessProperties.join(', ')}`);
  }
  const aliases = Array.isArray(frontmatter.aliases)
    ? frontmatter.aliases
    : frontmatter.aliases ? [frontmatter.aliases] : [];
  for (const alias of aliases) registerTarget(String(alias), file, '별칭');
}

for (const file of files.filter((candidate) => candidate.endsWith('.canvas') || candidate.endsWith('.base'))) {
  registerTarget(rel(file), file, '비 Markdown 경로');
  registerTarget(path.basename(file), file, '비 Markdown 파일명');
}

function resolveWikiTarget(sourceFile, rawTarget) {
  const target = rawTarget.split('|', 1)[0].split('#', 1)[0].trim();
  if (!target) return true;
  const clean = target.replace(/\.md$/i, '').replaceAll('\\', '/');
  if (noteTargets.has(clean.toLowerCase())) return true;
  const sourceRelative = path.dirname(rel(sourceFile));
  const local = path.posix.normalize(path.posix.join(sourceRelative, clean));
  return noteTargets.has(local.toLowerCase());
}

for (const file of markdown) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    if (!resolveWikiTarget(file, match[1])) {
      errors.push(`${rel(file)}: 해결할 수 없는 위키링크 [[${match[1]}]]`);
    }
  }
}

for (const file of files.filter((candidate) => candidate.endsWith('.canvas'))) {
  let canvas;
  try {
    canvas = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${rel(file)}: Canvas JSON 오류 — ${error.message}`);
    continue;
  }
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  const ids = new Set();
  for (const item of [...nodes, ...edges]) {
    if (!item.id || ids.has(item.id)) errors.push(`${rel(file)}: 누락 또는 중복 ID '${item.id ?? ''}'`);
    ids.add(item.id);
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const node of nodes.filter((candidate) => candidate.type === 'file')) {
    const target = path.resolve(root, node.file ?? '');
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) {
      errors.push(`${rel(file)}: 존재하지 않는 파일 노드 '${node.file ?? ''}'`);
    }
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
      errors.push(`${rel(file)}: 엣지 '${edge.id}'의 노드 참조가 유효하지 않습니다.`);
    }
  }
}

for (const file of files.filter((candidate) => candidate.endsWith('.base'))) {
  try {
    const base = parseYaml(fs.readFileSync(file, 'utf8'));
    if (!base || !Array.isArray(base.views) || base.views.length === 0) {
      errors.push(`${rel(file)}: Base에 하나 이상의 view가 필요합니다.`);
    }
  } catch (error) {
    errors.push(`${rel(file)}: Base YAML 오류 — ${error.message}`);
  }
}

if (errors.length) {
  console.error(`[실패] 문서 검증 ${errors.length}건`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(2);
}

console.log(`[통과] 문서 ${markdown.length}개 · Canvas ${files.filter((file) => file.endsWith('.canvas')).length}개 · Base ${files.filter((file) => file.endsWith('.base')).length}개`);
