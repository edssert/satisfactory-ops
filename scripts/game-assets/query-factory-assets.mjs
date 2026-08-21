/**
 * 전수 게임 자산 NDJSON에서 패키지, Blueprint 구성품, 재질 부모 체인을 질의한다.
 *
 * 사용:
 *   node scripts/game-assets/query-factory-assets.mjs search Smelter
 *   node scripts/game-assets/query-factory-assets.mjs building Build_SmelterMk1
 *   node scripts/game-assets/query-factory-assets.mjs material MI_SmelterMk1_01
 * 종료: 성공 0, 인자/색인 누락 2, 결과 없음 3.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const graphPath = resolve(root, '.cache/game-asset-index/factory-assets.ndjson');
if (!existsSync(graphPath)) {
  process.stderr.write('게임 자산 색인이 없습니다. Cue4ParseCatalog를 먼저 실행하세요.\n');
  process.exit(2);
}

const [command, rawQuery] = process.argv.slice(2);
if (!['search', 'building', 'material'].includes(command) || !rawQuery) {
  process.stderr.write('사용: query-factory-assets.mjs <search|building|material> <질의>\n');
  process.exit(2);
}

const rows = readFileSync(graphPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const query = rawQuery.toLocaleLowerCase('en-US');
const packageByPath = new Map(rows.map((row) => [row.Package.toLocaleLowerCase('en-US'), row]));

function objectPathToPackagePath(objectPath) {
  const withoutExport = objectPath.replace(/\.\d+$/, '');
  return withoutExport.replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
}

function matches(row) {
  return row.Package.toLocaleLowerCase('en-US').includes(query) ||
    row.Exports.some((entry) => entry.Name.toLocaleLowerCase('en-US').includes(query)) ||
    row.References.some((entry) => entry.toLocaleLowerCase('en-US').includes(query));
}

function materialRows() {
  return rows.flatMap((row) => row.Materials.map((material) => ({ package: row.Package, ...material })));
}

let result;
if (command === 'search') {
  result = rows.filter(matches).map((row) => ({
    package: row.Package,
    exports: row.Exports,
    materials: row.Materials.map((entry) => entry.Name),
    components: row.Components.map((entry) => ({ type: entry.Type, name: entry.Name }))
  }));
} else if (command === 'building') {
  const buildings = rows.filter((row) =>
    row.Package.toLocaleLowerCase('en-US').includes(query) &&
    row.Exports.some((entry) => entry.Type === 'BlueprintGeneratedClass'));
  result = buildings.map((row) => ({
    package: row.Package,
    components: row.Components,
    externalReferences: row.References.filter((entry) => !entry.includes(row.Package.replace(/^FactoryGame\/Content/, '/Game').replace(/\.uasset$/, '')))
  }));
} else {
  const allMaterials = materialRows();
  const starts = allMaterials.filter((material) => material.Name.toLocaleLowerCase('en-US').includes(query));
  result = starts.map((start) => {
    const chain = [];
    const seen = new Set();
    let current = start;
    while (current && !seen.has(current.package)) {
      seen.add(current.package);
      chain.push(current);
      if (!current.Parent) break;
      const parentPackage = packageByPath.get(objectPathToPackagePath(current.Parent).toLocaleLowerCase('en-US'));
      current = parentPackage?.Materials.find((entry) => entry.Name === current.Parent.match(/([^/.]+)\.\d+$/)?.[1]);
      if (current) current = { package: parentPackage.Package, ...current };
    }
    return { material: start.Name, chain };
  });
}

if (!result.length) {
  process.stderr.write(`결과 없음: ${rawQuery}\n`);
  process.exit(3);
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
