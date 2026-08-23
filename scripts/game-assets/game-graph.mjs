#!/usr/bin/env node
/**
 * 설치본 자산 색인과 생성 앱 데이터, 탑뷰 장면·매니페스트를 하나의 파생 관계 그래프로 만든다.
 *
 * 사용:
 *   node scripts/game-assets/game-graph.mjs build
 *   node scripts/game-assets/game-graph.mjs check
 *   node scripts/game-assets/game-graph.mjs search <문자열>
 *   node scripts/game-assets/game-graph.mjs building <Build_*_C>
 *   node scripts/game-assets/game-graph.mjs trace <노드 ID> [깊이]
 *   node scripts/game-assets/game-graph.mjs path <출발 노드 ID> <도착 노드 ID> [최대 깊이]
 *
 * 종료: 성공 0, 사용법/입력 누락 2, 검증·최신성 실패 3.
 * 정본은 입력 JSON과 설치본 색인이다. .cache/game-graph.db는 손으로 고치지 않는다.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = resolve(ROOT, '.cache');
const INDEX = resolve(CACHE, 'game-asset-index');
const DB_PATH = resolve(CACHE, 'game-graph.db');
const TMP_DB_PATH = resolve(CACHE, 'game-graph.tmp.db');
const ASSET_GRAPH = resolve(INDEX, 'factory-assets.ndjson');
const FACTORY_SCENES = resolve(INDEX, 'factory-scenes.json');
const APP = resolve(ROOT, 'src/data/app');
const TOPVIEW_MANIFEST = resolve(ROOT, 'src/data/curated/topview-assets.json');
const TOPVIEW_SCENES = resolve(ROOT, 'scripts/topview/scenes');
const RUNTIME_FILTER = resolve(ROOT, 'src/lib/topview-assets.ts');
const CURRENT_SOURCE_PREFIX = 'game-install-';
const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
  process.stderr.write('사용: game-graph.mjs <build|check|search|building|trace|path> [인자]\n');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function filesRecursive(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory()
      ? filesRecursive(absolute, extension)
      : entry.name.endsWith(extension) ? [absolute] : [];
  });
}

function sourceFiles() {
  return [
    ASSET_GRAPH,
    FACTORY_SCENES,
    resolve(APP, 'items.json'),
    resolve(APP, 'recipes.json'),
    resolve(APP, 'buildings.json'),
    resolve(APP, 'milestones.json'),
    TOPVIEW_MANIFEST,
    ...filesRecursive(TOPVIEW_SCENES, '.json').sort(),
  ];
}

function evidence(path, fragment = '') {
  return `${relative(ROOT, path).replaceAll('\\', '/')}${fragment}`;
}

function normalizedObjectPath(value) {
  return value.replace(/\.\d+$/, '');
}

function packagePathForObject(value) {
  const normalized = normalizedObjectPath(value);
  if (!normalized.startsWith('/Game/')) return null;
  return normalized.replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function stable(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, entry]) => [key, stable(entry)]),
  );
}

function json(value) {
  return JSON.stringify(stable(value ?? null));
}

function collectGraph() {
  const nodes = new Map();
  const edges = new Map();
  const issues = [];
  const buildingPackages = new Map();
  const sceneByBuilding = new Map();

  function addNode(id, type, label, source, data = {}) {
    const current = nodes.get(id);
    if (current) {
      current.sources.add(source);
      current.data = { ...current.data, ...data };
      if (!current.label && label) current.label = label;
      return current;
    }
    const node = { id, type, label: label || id, sources: new Set([source]), data };
    nodes.set(id, node);
    return node;
  }

  function addEdge(sourceId, relationName, targetId, source, data = {}) {
    const key = `${sourceId}\u0000${relationName}\u0000${targetId}\u0000${source}\u0000${json(data)}`;
    if (!edges.has(key)) edges.set(key, {
      sourceId,
      relation: relationName,
      targetId,
      source,
      data,
    });
  }

  function addFile(path, source, data = {}) {
    const absolute = path.startsWith(ROOT) ? path : resolve(ROOT, path);
    const rel = relative(ROOT, absolute).replaceAll('\\', '/');
    const id = `file:${rel}`;
    addNode(id, 'file', basename(absolute), source, {
      path: rel,
      exists: existsSync(absolute),
      ...data,
    });
    return id;
  }

  function addObject(raw, source) {
    const objectPath = normalizedObjectPath(raw);
    const id = `object:${objectPath}`;
    const targetPackage = packagePathForObject(objectPath);
    const kind = /\/Texture\//.test(objectPath)
      ? 'texture-object'
      : /\/Material\//.test(objectPath)
        ? 'material-object'
        : /\/Mesh\//.test(objectPath)
          ? 'mesh-object'
          : 'object';
    addNode(id, kind, objectPath.split('/').at(-1), source, { objectPath, targetPackage });
    if (targetPackage) {
      const packageId = `package:${targetPackage}`;
      addNode(packageId, 'package', basename(targetPackage, '.uasset'), source, {
        package: targetPackage,
        resolved: false,
      });
      addEdge(id, 'DECLARED_BY', packageId, source);
    }
    return id;
  }

  const assetRows = readFileSync(ASSET_GRAPH, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const knownPackages = new Set(assetRows.map((row) => row.Package));

  for (const row of assetRows) {
    const source = `${evidence(ASSET_GRAPH)}#${row.Package}`;
    const packageId = `package:${row.Package}`;
    addNode(packageId, 'package', basename(row.Package, '.uasset'), source, {
      package: row.Package,
      resolved: true,
    });
    for (const entry of row.Exports ?? []) {
      const exportId = `export:${row.Package}#${entry.Type}:${entry.Name}`;
      addNode(exportId, 'export', entry.Name, source, { exportType: entry.Type });
      addEdge(packageId, 'DECLARES', exportId, source, { exportType: entry.Type });
      if (entry.Type === 'BlueprintGeneratedClass' && entry.Name.startsWith('Build_')) {
        const buildingId = `building:${entry.Name}`;
        buildingPackages.set(entry.Name, row.Package);
        addNode(buildingId, 'building', entry.Name, source, { assetIndexed: true });
        addEdge(buildingId, 'DECLARED_BY', packageId, source);
      }
    }
  }

  for (const row of assetRows) {
    const source = `${evidence(ASSET_GRAPH)}#${row.Package}`;
    const packageId = `package:${row.Package}`;
    const buildingClass = row.Exports?.find((entry) =>
      entry.Type === 'BlueprintGeneratedClass' && entry.Name.startsWith('Build_'))?.Name;
    const buildingId = buildingClass ? `building:${buildingClass}` : null;

    for (const reference of row.References ?? []) {
      const objectId = addObject(reference, source);
      addEdge(packageId, 'REFERENCES', objectId, source, {
        resolvedPackage: knownPackages.has(packagePathForObject(reference)),
      });
    }
    for (const component of row.Components ?? []) {
      const componentId = `component:${row.Package}#${component.Name}`;
      addNode(componentId, 'component', component.Name, source, {
        componentType: component.Type,
        transform: {
          location: component.RelativeLocation,
          rotation: component.RelativeRotation,
          scale: component.RelativeScale,
        },
      });
      addEdge(packageId, 'HAS_COMPONENT', componentId, source, { componentType: component.Type });
      if (buildingId) addEdge(buildingId, 'HAS_COMPONENT', componentId, source);
      if (component.StaticMesh) {
        addEdge(componentId, 'USES_STATIC_MESH', addObject(component.StaticMesh, source), source);
      }
      if (component.SkeletalMesh) {
        addEdge(componentId, 'USES_SKELETAL_MESH', addObject(component.SkeletalMesh, source), source);
      }
      for (const material of strings(component.OverrideMaterials).filter((entry) => entry.startsWith('/Game/'))) {
        addEdge(componentId, 'OVERRIDES_MATERIAL', addObject(material, source), source);
      }
    }
    for (const material of row.Materials ?? []) {
      const materialId = `material:${row.Package}#${material.Name}`;
      addNode(materialId, 'material', material.Name, source, {
        scalars: material.Scalars,
        vectors: material.Vectors,
        switches: material.Switches,
      });
      addEdge(packageId, 'DECLARES', materialId, source, { exportType: 'material' });
      if (material.Parent) {
        addEdge(materialId, 'MATERIAL_PARENT', addObject(material.Parent, source), source);
      }
      for (const [parameter, texture] of Object.entries(material.Textures ?? {})) {
        if (typeof texture !== 'string') continue;
        addEdge(materialId, 'USES_TEXTURE', addObject(texture, source), source, { parameter });
      }
    }
  }

  const items = readJson(resolve(APP, 'items.json'));
  const recipes = readJson(resolve(APP, 'recipes.json'));
  const buildings = readJson(resolve(APP, 'buildings.json'));
  const milestones = readJson(resolve(APP, 'milestones.json'));
  const itemSource = evidence(resolve(APP, 'items.json'));
  const recipeSource = evidence(resolve(APP, 'recipes.json'));
  const buildingSource = evidence(resolve(APP, 'buildings.json'));
  const milestoneSource = evidence(resolve(APP, 'milestones.json'));

  for (const item of items) addNode(`item:${item.id}`, 'item', item.ko || item.id, itemSource, {
    className: item.id,
    en: item.en,
    form: item.form,
    kind: item.kind,
  });
  for (const building of buildings) {
    const buildingId = `building:${building.id}`;
    addNode(buildingId, 'building', building.ko || building.id, buildingSource, {
      className: building.id,
      en: building.en,
      category: building.category,
      unlockTier: building.unlockTier,
    });
    for (const cost of building.buildCost ?? []) {
      addEdge(buildingId, 'BUILD_COST', `item:${cost.item}`, buildingSource, { amount: cost.amount });
    }
  }
  for (const recipe of recipes) {
    const recipeId = `recipe:${recipe.id}`;
    addNode(recipeId, 'recipe', recipe.ko || recipe.id, recipeSource, {
      className: recipe.id,
      en: recipe.en,
      isAlternate: recipe.isAlternate,
      isBuildingRecipe: recipe.isBuildingRecipe,
    });
    for (const ingredient of recipe.ingredients ?? []) {
      addEdge(recipeId, 'CONSUMES', `item:${ingredient.item}`, recipeSource, {
        amount: ingredient.amount,
        perMinute: ingredient.perMinute,
      });
    }
    for (const product of recipe.products ?? []) {
      addEdge(recipeId, 'PRODUCES', `item:${product.item}`, recipeSource, {
        amount: product.amount,
        perMinute: product.perMinute,
      });
    }
    for (const building of recipe.producedIn ?? []) {
      addEdge(recipeId, 'PRODUCED_IN', `building:${building}`, recipeSource);
    }
  }
  for (const milestone of milestones) {
    const milestoneId = `milestone:${milestone.id}`;
    addNode(milestoneId, 'milestone', milestone.ko || milestone.id, milestoneSource, {
      className: milestone.id,
      en: milestone.en,
      tier: milestone.tier,
    });
    for (const entry of milestone.cost ?? []) {
      addEdge(milestoneId, 'COSTS', `item:${entry.item}`, milestoneSource, { amount: entry.amount });
    }
    for (const recipe of milestone.unlocksRecipes ?? []) {
      addEdge(milestoneId, 'UNLOCKS', `recipe:${recipe}`, milestoneSource);
    }
    for (const item of milestone.unlocksItems ?? []) {
      addEdge(milestoneId, 'UNLOCKS', `item:${item}`, milestoneSource);
    }
  }

  const factoryScenes = readJson(FACTORY_SCENES);
  for (const contract of factoryScenes.contracts ?? []) {
    const source = `${evidence(FACTORY_SCENES)}#${contract.buildingClass}`;
    const buildingId = `building:${contract.buildingClass}`;
    addNode(buildingId, 'building', contract.buildingClass, source, { sceneContract: true });
    const packageId = `package:${contract.package}`;
    addNode(packageId, 'package', basename(contract.package, '.uasset'), source, {
      package: contract.package,
      resolved: knownPackages.has(contract.package),
    });
    addEdge(buildingId, 'DECLARED_BY', packageId, source);
    for (const component of contract.components ?? []) {
      const componentId = `component:${contract.package}#${component.id}`;
      addNode(componentId, 'component', component.id, source, {
        componentType: component.type,
        role: component.role,
        transform: component.transform,
      });
      addEdge(buildingId, 'HAS_COMPONENT', componentId, source, { role: component.role });
      if (component.staticMesh) {
        addEdge(componentId, 'USES_STATIC_MESH', addObject(component.staticMesh, source), source);
      }
      if (component.skeletalMesh) {
        addEdge(componentId, 'USES_SKELETAL_MESH', addObject(component.skeletalMesh, source), source);
      }
      if (component.indirectBlueprint?.package) {
        const indirectId = `package:${component.indirectBlueprint.package}`;
        addNode(indirectId, 'package', basename(component.indirectBlueprint.package, '.uasset'), source, {
          package: component.indirectBlueprint.package,
          resolved: knownPackages.has(component.indirectBlueprint.package),
        });
        addEdge(componentId, 'REFERENCES', indirectId, source, { role: 'indirect-blueprint' });
      }
      for (const mesh of component.indirectBlueprint?.meshReferences ?? []) {
        addEdge(componentId, 'USES_STATIC_MESH', addObject(mesh, source), source, {
          role: 'indirect-blueprint',
        });
      }
    }
  }

  for (const scenePath of filesRecursive(TOPVIEW_SCENES, '.json').sort()) {
    const scene = readJson(scenePath);
    const source = evidence(scenePath);
    const sceneId = `scene:${source}`;
    const buildingId = `building:${scene.buildingClass}`;
    sceneByBuilding.set(scene.buildingClass, sceneId);
    addNode(sceneId, 'scene', basename(scenePath), source, {
      buildingClass: scene.buildingClass,
      projection: scene.camera?.projection,
      frontTiltDeg: scene.camera?.frontTiltDeg,
    });
    addEdge(sceneId, 'SCENE_FOR', buildingId, source);
    const packagePath = buildingPackages.get(scene.buildingClass);
    for (const component of scene.components ?? []) {
      if (component.path) {
        const fileId = addFile(resolve(ROOT, component.path), source, { role: 'scene-component' });
        addEdge(sceneId, 'SCENE_USES', fileId, source, { componentId: component.id });
      }
      const directPrefix = `${scene.buildingClass}.`;
      if (typeof component.source === 'string' && component.source.startsWith(directPrefix) && packagePath) {
        const componentName = component.source.slice(directPrefix.length);
        const componentIds = [componentName, `${componentName}_GEN_VARIABLE`]
          .filter((name, index, names) => names.indexOf(name) === index)
          .map((name) => `component:${packagePath}#${name}`);
        const componentId = componentIds.find((id) => nodes.has(id));
        if (componentId) {
          addEdge(sceneId, 'SCENE_USES', componentId, source, { componentId: component.id });
        } else {
          issues.push({
            code: 'missing-scene-component-source',
            message: `${source}: ${component.source}를 자동 장면 계약에서 찾지 못했습니다.`,
          });
        }
      }
    }
    for (const [channel, mappings] of Object.entries(scene.materials ?? {})) {
      if (!mappings || Array.isArray(mappings) || typeof mappings !== 'object') continue;
      for (const [materialName, rawPath] of Object.entries(mappings)) {
        if (typeof rawPath !== 'string') continue;
        const fileId = addFile(resolve(ROOT, rawPath), source, { role: `material-${channel}` });
        addEdge(sceneId, 'SCENE_USES', fileId, source, { channel, materialName });
      }
    }
  }

  const manifest = readJson(TOPVIEW_MANIFEST);
  const manifestSource = evidence(TOPVIEW_MANIFEST);
  const runtimeFileId = addFile(RUNTIME_FILTER, evidence(RUNTIME_FILTER), { role: 'runtime-filter' });
  for (const asset of manifest.assets ?? []) {
    const isRuntimeAsset = asset.sourceId?.startsWith(CURRENT_SOURCE_PREFIX)
      && asset.reviewStatus === 'approved';
    const assetId = `asset:${asset.assetId}`;
    addNode(assetId, 'asset', asset.assetId, manifestSource, {
      buildingClass: asset.buildingClass,
      sourceId: asset.sourceId,
      derivation: asset.derivation,
      reviewStatus: asset.reviewStatus,
      sha256: asset.sha256,
    });
    if (asset.buildingClass) {
      addEdge(assetId, 'ASSET_FOR', `building:${asset.buildingClass}`, manifestSource);
    }
    if (asset.path) {
      const fileId = addFile(
        resolve(ROOT, ...(isRuntimeAsset ? ['public', asset.path] : [asset.path])),
        manifestSource,
        { role: isRuntimeAsset ? 'runtime-asset' : 'reference-asset' },
      );
      addEdge(assetId, isRuntimeAsset ? 'EXPOSED_BY' : 'STORED_AS', fileId, manifestSource, { state: 'active' });
    }
    for (const [state, image] of Object.entries(asset.statusImages ?? {})) {
      const fileId = addFile(resolve(ROOT, 'public', image.path), manifestSource, {
        role: 'runtime-state-asset',
      });
      addEdge(assetId, 'EXPOSED_BY', fileId, manifestSource, { state });
    }
    const sceneId = sceneByBuilding.get(asset.buildingClass);
    if (sceneId && asset.derivation === 'game-mesh-render') {
      addEdge(assetId, 'RENDERED_FROM', sceneId, manifestSource);
    }
    if (isRuntimeAsset) {
      addEdge(assetId, 'EXPOSED_BY', runtimeFileId, manifestSource, { role: 'runtime-filter' });
    }
  }

  for (const edge of edges.values()) {
    if (!nodes.has(edge.sourceId)) {
      issues.push({
        code: 'dangling-source',
        message: `${edge.relation}: 출발 노드 누락 ${edge.sourceId}`,
      });
      addNode(edge.sourceId, 'unresolved', edge.sourceId, edge.source, { unresolved: true });
    }
    if (!nodes.has(edge.targetId)) {
      issues.push({
        code: 'dangling-target',
        message: `${edge.relation}: 도착 노드 누락 ${edge.targetId}`,
      });
      addNode(edge.targetId, 'unresolved', edge.targetId, edge.source, { unresolved: true });
    }
  }
  return { nodes, edges, issues };
}

function createDatabase() {
  for (const required of sourceFiles()) {
    if (!existsSync(required)) {
      process.stderr.write(`ERROR 입력 파일 누락 ${required}\n`);
      process.exit(2);
    }
  }
  const graph = collectGraph();
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(TMP_DB_PATH)) rmSync(TMP_DB_PATH);
  const db = new DatabaseSync(TMP_DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE node (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE edge (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES node(id),
      relation TEXT NOT NULL,
      target_id TEXT NOT NULL REFERENCES node(id),
      evidence TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE issue (code TEXT NOT NULL, message TEXT NOT NULL);
    CREATE INDEX idx_node_type ON node(type);
    CREATE INDEX idx_node_label ON node(label);
    CREATE INDEX idx_edge_source ON edge(source_id, relation);
    CREATE INDEX idx_edge_target ON edge(target_id, relation);
    CREATE INDEX idx_edge_relation ON edge(relation);
  `);
  const insertMeta = db.prepare('INSERT INTO meta (key,value) VALUES (?,?)');
  const insertNode = db.prepare('INSERT INTO node (id,type,label,evidence_json,data_json) VALUES (?,?,?,?,?)');
  const insertEdge = db.prepare('INSERT INTO edge (source_id,relation,target_id,evidence,data_json) VALUES (?,?,?,?,?)');
  const insertIssue = db.prepare('INSERT INTO issue (code,message) VALUES (?,?)');
  db.exec('BEGIN IMMEDIATE');
  insertMeta.run('schemaVersion', '1');
  insertMeta.run('sourceRoot', '.cache/game-asset-index/factory-assets.ndjson');
  for (const path of sourceFiles()) insertMeta.run(`sha256:${evidence(path)}`, sha256(path));
  for (const node of graph.nodes.values()) {
    insertNode.run(node.id, node.type, node.label, json([...node.sources].sort()), json(node.data));
  }
  for (const edge of graph.edges.values()) {
    insertEdge.run(edge.sourceId, edge.relation, edge.targetId, edge.source, json(edge.data));
  }
  for (const issue of graph.issues) insertIssue.run(issue.code, issue.message);
  db.exec('COMMIT');
  db.close();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  renameSync(TMP_DB_PATH, DB_PATH);
  return openDatabase();
}

function openDatabase() {
  if (!existsSync(DB_PATH)) {
    process.stderr.write('ERROR .cache/game-graph.db가 없습니다. build를 먼저 실행하세요.\n');
    process.exit(2);
  }
  return new DatabaseSync(DB_PATH, { readOnly: command !== 'build' });
}

function staleSources(db) {
  const metadata = new Map(
    db.prepare("SELECT key,value FROM meta WHERE key LIKE 'sha256:%'").all()
      .map((entry) => [entry.key.slice('sha256:'.length), entry.value]),
  );
  const stale = [];
  for (const path of sourceFiles()) {
    const key = evidence(path);
    if (metadata.get(key) !== sha256(path)) stale.push(key);
  }
  return stale;
}

function checkDatabase(db) {
  const failures = [];
  const stale = staleSources(db);
  if (stale.length) failures.push(`입력 드리프트 ${stale.join(', ')}`);
  for (const issue of db.prepare('SELECT code,message FROM issue ORDER BY code,message').all()) {
    failures.push(`${issue.code}: ${issue.message}`);
  }
  const currentAssets = readJson(TOPVIEW_MANIFEST).assets.filter((asset) =>
    asset.sourceId?.startsWith(CURRENT_SOURCE_PREFIX));
  for (const asset of currentAssets) {
    const id = `asset:${asset.assetId}`;
    const sceneCount = db.prepare(
      "SELECT COUNT(*) AS count FROM edge WHERE source_id=? AND relation='RENDERED_FROM'",
    ).get(id).count;
    if (sceneCount !== 1) failures.push(`${id}: current-game 장면 연결 ${sceneCount}건`);
    if (asset.reviewStatus === 'approved') {
      const states = Object.keys(asset.statusImages ?? {}).sort();
      if (states.join(',') !== 'active,activeWithCrystal,error,standby') {
        failures.push(`${id}: 승인 상태 자산 4종 누락 (${states.join(',')})`);
      }
      for (const [state, image] of Object.entries(asset.statusImages ?? {})) {
        const absolute = resolve(ROOT, 'public', image.path);
        if (!existsSync(absolute)) failures.push(`${id}: ${state} 파일 누락 ${image.path}`);
        else if (sha256(absolute) !== image.sha256) failures.push(`${id}: ${state} SHA-256 불일치`);
      }
    }
  }
  const runtimeId = `file:${relative(ROOT, RUNTIME_FILTER).replaceAll('\\', '/')}`;
  const leakedReference = db.prepare(`
    SELECT n.id FROM node n
    JOIN edge e ON e.source_id=n.id AND e.relation='EXPOSED_BY'
    WHERE n.type='asset'
      AND json_extract(n.data_json, '$.sourceId') NOT LIKE 'game-install-%'
      AND e.target_id=?
  `).all(runtimeId);
  if (leakedReference.length) failures.push(`참조 전용 자산 런타임 노출 ${leakedReference.length}건`);
  const counts = Object.fromEntries(
    db.prepare('SELECT type,COUNT(*) AS count FROM node GROUP BY type ORDER BY type').all()
      .map((entry) => [entry.type, entry.count]),
  );
  const edgeCount = db.prepare('SELECT COUNT(*) AS count FROM edge').get().count;
  if (failures.length) {
    for (const failure of failures) process.stderr.write(`FAIL  ${failure}\n`);
    process.exitCode = 3;
  } else {
    process.stdout.write(
      `PASS  게임 그래프 노드 ${Object.values(counts).reduce((sum, count) => sum + count, 0)}개 · 간선 ${edgeCount}개 · 입력 드리프트 0\n`,
    );
    process.stdout.write(
      'PASS  설치본→장면→자체 자산→런타임 증거 경로 · 승인 상태 자산 4종 · Anders 런타임 노출 0\n',
    );
  }
  return { counts, edgeCount, failures };
}

function lookupNode(db, raw) {
  const candidates = [raw, `building:${raw}`, `item:${raw}`, `recipe:${raw}`, `asset:${raw}`];
  for (const id of candidates) {
    const node = db.prepare('SELECT * FROM node WHERE id=?').get(id);
    if (node) return node;
  }
  return null;
}

function adjacent(db, id) {
  return db.prepare(`
    SELECT id,source_id,relation,target_id,evidence,data_json
    FROM edge WHERE source_id=? OR target_id=? ORDER BY relation,source_id,target_id,id
  `).all(id, id);
}

function trace(db, raw, maxDepth = 3) {
  const rootNode = lookupNode(db, raw);
  if (!rootNode) {
    process.stderr.write(`결과 없음: ${raw}\n`);
    process.exit(3);
  }
  const queue = [{ id: rootNode.id, depth: 0 }];
  const seenNodes = new Map([[rootNode.id, rootNode]]);
  const seenEdges = new Map();
  while (queue.length && seenEdges.size < 500) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const edge of adjacent(db, current.id)) {
      seenEdges.set(edge.id, edge);
      const nextId = edge.source_id === current.id ? edge.target_id : edge.source_id;
      if (seenNodes.has(nextId)) continue;
      const node = db.prepare('SELECT * FROM node WHERE id=?').get(nextId);
      if (!node) continue;
      seenNodes.set(nextId, node);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }
  process.stdout.write(JSON.stringify({
    root: rootNode.id,
    maxDepth,
    nodes: [...seenNodes.values()].map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      evidence: JSON.parse(node.evidence_json),
      data: JSON.parse(node.data_json),
    })),
    edges: [...seenEdges.values()].map((edge) => ({
      source: edge.source_id,
      relation: edge.relation,
      target: edge.target_id,
      evidence: edge.evidence,
      data: JSON.parse(edge.data_json),
    })),
  }, null, 2) + '\n');
}

function findPath(db, fromRaw, toRaw, maxDepth = 8) {
  const from = lookupNode(db, fromRaw);
  const to = lookupNode(db, toRaw);
  if (!from || !to) {
    process.stderr.write(`결과 없음: ${!from ? fromRaw : toRaw}\n`);
    process.exit(3);
  }
  const queue = [{ id: from.id, path: [] }];
  const seen = new Set([from.id]);
  while (queue.length) {
    const current = queue.shift();
    if (current.path.length >= maxDepth) continue;
    for (const edge of adjacent(db, current.id)) {
      const nextId = edge.source_id === current.id ? edge.target_id : edge.source_id;
      const step = {
        from: current.id,
        relation: edge.relation,
        direction: edge.source_id === current.id ? 'out' : 'in',
        to: nextId,
        evidence: edge.evidence,
      };
      if (nextId === to.id) {
        process.stdout.write(JSON.stringify({ from: from.id, to: to.id, path: [...current.path, step] }, null, 2) + '\n');
        return;
      }
      if (!seen.has(nextId)) {
        seen.add(nextId);
        queue.push({ id: nextId, path: [...current.path, step] });
      }
    }
  }
  process.stderr.write(`경로 없음: ${from.id} → ${to.id} (깊이 ${maxDepth})\n`);
  process.exit(3);
}

if (!['build', 'check', 'search', 'building', 'trace', 'path'].includes(command)) {
  usage();
  process.exit(2);
}
const db = command === 'build' ? createDatabase() : openDatabase();
if (command !== 'build') {
  const stale = staleSources(db);
  if (stale.length) {
    process.stderr.write(`ERROR 그래프가 입력보다 낡았습니다: ${stale.join(', ')}\n`);
    process.exit(3);
  }
}
if (command === 'build' || command === 'check') {
  const result = checkDatabase(db);
  if (command === 'build' && !result.failures.length) {
    process.stdout.write(`OUTPUT=${relative(ROOT, DB_PATH).replaceAll('\\', '/')}\n`);
  }
} else if (command === 'search') {
  if (!args[0]) {
    usage();
    process.exit(2);
  }
  const term = `%${args.join(' ')}%`;
  const rows = db.prepare(`
    SELECT id,type,label,evidence_json FROM node
    WHERE id LIKE ? OR label LIKE ? ORDER BY type,label LIMIT 80
  `).all(term, term).map((row) => ({ ...row, evidence: JSON.parse(row.evidence_json) }));
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
} else if (command === 'building') {
  if (!args[0]) {
    usage();
    process.exit(2);
  }
  trace(db, `building:${args[0]}`, 4);
} else if (command === 'trace') {
  if (!args[0]) {
    usage();
    process.exit(2);
  }
  trace(db, args[0], Number(args[1] ?? 3));
} else if (command === 'path') {
  if (!args[0] || !args[1]) {
    usage();
    process.exit(2);
  }
  findPath(db, args[0], args[1], Number(args[2] ?? 8));
}
db.close();
