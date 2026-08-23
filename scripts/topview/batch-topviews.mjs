#!/usr/bin/env node
/**
 * 생성된 플래너 탑뷰 범위와 설치본 장면 계약을 결합해 정적 설비를 일괄 추출·장면화·렌더한다.
 *
 * 사용:
 *   node scripts/topview/batch-topviews.mjs plan
 *   node scripts/topview/batch-topviews.mjs export
 *   node scripts/topview/batch-topviews.mjs scenes
 *   node scripts/topview/batch-topviews.mjs render [--limit=N] [--concurrency=N]
 *
 * 종료: 성공 0, 입력·추출·렌더 실패 2.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { comparePlannerAssetTargets, requiresOperationalStateAssets, requiresRasterTopview } from '../../src/lib/planner-asset-scope.ts';
import { RUNTIME_TOPVIEW_SOURCE } from '../../src/lib/topview-assets.ts';
import { readFactoryAssetRows, resolveSceneGameMaterials } from './material-resolver.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const mode = process.argv[2] ?? 'plan';
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? Infinity);
const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1] ?? null;
const force = process.argv.includes('--force');
const concurrency = Number(process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1]
  ?? Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
const paks = process.env.SATISFACTORY_PAKS
  ?? 'C:/Program Files (x86)/Steam/steamapps/common/Satisfactory/FactoryGame/Content/Paks';
const batchRoot = resolve(root, '.cache/topview/batch');
const exportRoot = resolve(batchRoot, 'exports');
const sceneRoot = resolve(batchRoot, 'scenes');
const renderRoot = resolve(batchRoot, 'renders');
const worklistPath = resolve(batchRoot, 'worklist.json');

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const scope = readJson('src/data/app/planner-asset-scope.json');
const buildings = readJson('src/data/app/buildings.json');
const manifest = readJson('src/data/curated/topview-assets.json');
const factoryScenes = readJson('.cache/game-asset-index/factory-scenes.json');
const factoryAssetRows = readFactoryAssetRows(root);
const buildingById = new Map(buildings.map((building) => [building.id, building]));
const contractById = new Map(factoryScenes.contracts.map((contract) => [contract.buildingClass, contract]));
const approved = new Set(manifest.assets
  .filter((asset) => asset.sourceId === RUNTIME_TOPVIEW_SOURCE
    && asset.reviewStatus === 'approved'
    && asset.buildingClass)
  .map((asset) => asset.buildingClass));

function objectPathToExportPath(objectPath) {
  const packagePath = objectPath.replace(/\.[^/]+$/, '');
  const relativePath = packagePath
    .replace(/^\/Game\//, 'FactoryGame/Content/')
    .replace(/^\/Engine\//, 'Engine/Content/');
  return resolve(exportRoot, `${relativePath}.glb`);
}

function normalizeExportObjectPath(objectPath) {
  const packagePath = objectPath.replace(/\.\d+$/, '');
  const objectName = packagePath.split('/').at(-1);
  return `${packagePath}.${objectName}`;
}

function isRenderableMeshReference(objectPath) {
  const name = objectPath.replace(/\.\d+$/, '').split('/').at(-1);
  return !name.startsWith('BP_') && !name.includes('PhysicsAsset');
}

function classify(target) {
  const contract = contractById.get(target.buildingClass) ?? null;
  const visual = contract?.components.filter((component) => component.role === 'visual-direct') ?? [];
  const staticComponents = visual.filter((component) => component.staticMesh);
  const skeletalComponents = visual.filter((component) => component.skeletalMesh);
  const mode = !contract
    ? 'missing-contract'
    : visual.length === 0
      ? contract.meshReferences.length ? 'mesh-reference-only' : 'missing-visual'
      : skeletalComponents.length ? 'mixed-animation' : 'static-ready';
  return {
    ...target,
    mode,
    contractPackage: contract?.package ?? null,
    staticComponents: staticComponents.map((component) => ({
      id: component.id,
      objectPath: component.staticMesh,
      transform: component.transform,
      exportPath: objectPathToExportPath(component.staticMesh).replaceAll('\\', '/'),
    })),
    skeletalComponents: skeletalComponents.filter((component) => isRenderableMeshReference(component.skeletalMesh)).map((component) => ({
      id: component.id,
      objectPath: component.skeletalMesh,
      transform: component.transform,
      exportPath: objectPathToExportPath(component.skeletalMesh).replaceAll('\\', '/'),
    })),
    indicator: contract?.components.find((component) =>
      component.id.includes('ProductionIndicator')
      && component.indirectBlueprint?.meshReferences?.some((mesh) => mesh.includes('SM_ProductionLight_01'))) ?? null,
    fallbackMeshReferences: (contract?.meshReferences ?? []).filter(isRenderableMeshReference).map((objectPath, index) => ({
      id: `fallback-mesh-${index + 1}`,
      objectPath,
      exportPath: objectPathToExportPath(objectPath).replaceAll('\\', '/'),
    })),
  };
}

const targets = scope.targets
  .filter(requiresRasterTopview)
  .filter((target) => !approved.has(target.buildingClass))
  .sort(comparePlannerAssetTargets)
  .map(classify);
const counts = Object.fromEntries([...Map.groupBy(targets, (target) => target.mode)]
  .map(([key, rows]) => [key, rows.length]));
const worklist = {
  schemaVersion: 1,
  buildCl: scope.buildCl,
  generatedFrom: {
    plannerScope: 'src/data/app/planner-asset-scope.json',
    factoryScenes: '.cache/game-asset-index/factory-scenes.json',
    manifest: 'src/data/curated/topview-assets.json',
  },
  counts: { total: targets.length, ...counts },
  targets,
};

function writeWorklist() {
  mkdirSync(batchRoot, { recursive: true });
  writeFileSync(worklistPath, `${JSON.stringify(worklist, null, 2)}\n`);
  process.stdout.write(`PASS  남은 탑뷰 ${targets.length}건 · 정적 일괄 ${counts['static-ready'] ?? 0} · `
    + `혼합 ${counts['mixed-animation'] ?? 0} · 동적/예외 ${(counts['mesh-reference-only'] ?? 0) + (counts['missing-visual'] ?? 0)}\n`);
  process.stdout.write(`OUTPUT=${worklistPath}\n`);
}

function sceneTransform(transform) {
  const location = transform?.locationCm ?? {};
  const rotation = transform?.rotationDeg ?? {};
  return [
    (location.x ?? 0) / 100,
    -(location.y ?? 0) / 100,
    (location.z ?? 0) / 100,
    -(rotation.yaw ?? 0),
  ];
}

function sceneRotationEuler(transform) {
  const rotation = transform?.rotationDeg ?? {};
  return [rotation.roll ?? 0, -(rotation.pitch ?? 0), -(rotation.yaw ?? 0)];
}

function footprintCenter(footprint) {
  if (!Array.isArray(footprint.boxes) || !footprint.boxes.length) return [0, 0];
  const x = footprint.boxes.flatMap((box) => [box.xM, box.xM + box.widthM]);
  const y = footprint.boxes.flatMap((box) => [box.yM, box.yM + box.lengthM]);
  return [(Math.min(...x) + Math.max(...x)) / 2, (Math.min(...y) + Math.max(...y)) / 2];
}

function genericScene(target) {
  const building = buildingById.get(target.buildingClass);
  const footprint = building?.footprint ?? target.footprintOverride;
  if (!footprint) throw new Error(`${target.buildingClass}: 게임 하드 점유 박스 누락`);
  const visualComponents = [
    ...target.staticComponents,
    ...target.skeletalComponents,
    ...(target.staticComponents.length || target.skeletalComponents.length ? [] : target.fallbackMeshReferences),
  ].filter((component) => target.buildingClass !== 'Build_SpaceElevator_C'
    || (!component.id.startsWith('FogPlane_')
      && component.id !== 'UpperLine_GEN_VARIABLE'
      && component.id !== 'SpaceElevator_Elevator_LOD0_static_GEN_VARIABLE'));
  const components = visualComponents.map((component) => ({
    id: component.id,
    renderMode: 'body',
    path: component.exportPath,
    transform: component.transform ? sceneTransform(component.transform) : [0, 0, 0, 0],
    rotationEulerDeg: component.transform ? sceneRotationEuler(component.transform) : [0, 0, 0],
    scale: [
      component.transform?.scale?.x ?? 1,
      component.transform?.scale?.y ?? 1,
      component.transform?.scale?.z ?? 1,
    ],
    source: component.transform
      ? `${target.buildingClass}.${component.id}`
      : `mesh-reference:${component.objectPath}`,
    confidence: 'verified',
  }));
  let stateIndicator = null;
  if (target.indicator) {
    const mesh = target.indicator.indirectBlueprint.meshReferences
      .find((reference) => reference.includes('SM_ProductionLight_01'));
    const indicatorPath = objectPathToExportPath(mesh).replaceAll('\\', '/');
    components.push({
      id: target.indicator.id,
      renderMode: 'production-indicator',
      path: indicatorPath,
      transform: sceneTransform(target.indicator.transform),
      source: `${target.buildingClass}.${target.indicator.id}`,
      confidence: 'verified',
    });
    const [x, y] = sceneTransform(target.indicator.transform);
    stateIndicator = { pointM: [x, y], maskRadiusNormalized: 0.058 };
  }
  const materials = {
    albedo: {}, ao: {}, normal: {}, reflection: {}, stateMask: {}, paint: {}, baseColor: {},
    alpha: [], pbr: [], normalOnly: [], emissiveAccent: [], emissiveGeometrySelectors: [],
    state: { color: '#00ff00', strength: 5 },
  };
  if (target.buildingClass === 'Build_SpaceElevator_C') {
    materials.staticBaseMaterial = 'SpaceElevator_Inst';
    materials.pbr = [
      'Material', 'MI_SpaceElevator_MidPart_01', 'Monitor_SpaceElevator',
      'SpaceElevator_Inst', 'SpaceElevatorMid_Inst', 'Decal_Normal',
    ];
    materials.baseColor = {
      Material: '#687787',
      MI_SpaceElevator_MidPart_01: '#687787',
      Monitor_SpaceElevator: '#1c2732',
      SpaceElevator_Inst: '#687787',
      SpaceElevatorMid_Inst: '#687787',
      Decal_Normal: '#687787',
    };
  }
  const scene = {
    $schemaVersion: 1,
    id: `${target.buildingClass.replace(/^Build_|_C$/g, '').toLowerCase()}-batch-cl-${scope.buildCl}`,
    buildingClass: target.buildingClass,
    status: 'generated-current-game-candidate',
    geometryAuthority: RUNTIME_TOPVIEW_SOURCE,
    sourceBlueprint: target.contractPackage,
    footprint: {
      widthM: Math.abs(footprint.widthM),
      lengthM: Math.abs(footprint.lengthM),
      heightM: Math.abs(footprint.heightM),
      groundZM: 0,
      centerM: footprintCenter(footprint),
      cornerEnvelope: 'game-hard-clearance',
      confidence: 'verified',
    },
    components,
    materials,
    camera: {
      projection: 'orthographic-top',
      frontTiltDeg: 0,
      displayYawDeg: 0,
      source: 'runtime planner assets require metric top-down projection',
      confidence: 'verified',
    },
    validationContract: 'batch-static',
    portVisibilityRequired: false,
    portVisibility: [],
    ...(stateIndicator ? { stateIndicator } : {}),
    canonicalOrientation: {
      authority: `${target.buildingClass} Blueprint component transforms`,
      screenEdge: 'source-orientation',
      rule: '현재 게임 Blueprint 좌표계를 유지하고 포트 회전은 별도 배치 계약에서 검증한다.',
    },
    lighting: {
      groundAo: false,
      shadowMode: 'alpha-near-and-wide-postprocess',
      aoLayers: 2,
      bloom: true,
      sun: true,
      keyEnergy: 1.7,
      fillEnergy: 1,
      worldStrength: 0.42,
      exposure: 1.1,
      method: '조립 검수용 중립 PBR',
      confidence: 'verified',
    },
    assemblyFeatures: visualComponents.map((component) => ({
      id: component.id, owner: component.id, status: 'present',
    })),
    materialChecks: [{ id: 'cue4parse-game-texture-bindings', status: 'missing', bindings: [] }],
    cameraLightingChecks: [
      { id: 'runtime-orthographic-top', status: 'present' },
    ],
    pipelineAudit: {
      repeatedDefectThreshold: 2,
      systemicDefectThreshold: 1,
      rawVatCandidateAllowed: false,
      coordinateBasis: 'scene=(unrealX,-unrealY,unrealZ,-unrealYaw)',
      requiredStages: ['package-graph', 'blueprint-components', 'view-feature-matrix', 'runtime-top-after-assembly'],
    },
  };
  return resolveSceneGameMaterials(scene, { root, exportRoot, rows: factoryAssetRows }).scene;
}

function repairPublishedSceneMaterials() {
  const publishedRoot = resolve(root, 'scripts/topview/scenes/generated');
  const files = readdirSync(publishedRoot).filter((name) => name.endsWith('.json'));
  const failures = [];
  let bindings = 0;
  for (const file of files) {
    const path = resolve(publishedRoot, file);
    const scene = JSON.parse(readFileSync(path, 'utf8'));
    const result = resolveSceneGameMaterials(scene, { root, exportRoot, rows: factoryAssetRows });
    if (!result.bindings.length) failures.push(scene.buildingClass);
    bindings += result.bindings.length;
    writeFileSync(path, `${JSON.stringify(result.scene, null, 2)}\n`);
  }
  if (failures.length) throw new Error(`게임 텍스처 연결 실패 ${failures.length}건: ${failures.slice(0, 8).join(', ')}`);
  process.stdout.write(`PASS  공개 장면 ${files.length}건 · 게임 재질 ${bindings}개 텍스처 연결\n`);
}

function writeScenes() {
  mkdirSync(sceneRoot, { recursive: true });
  const ready = targets.filter((target) => ['static-ready', 'mixed-animation', 'mesh-reference-only'].includes(target.mode));
  const failures = [];
  let written = 0;
  for (const target of ready) {
    const path = resolve(sceneRoot, `${target.buildingClass}.json`);
    try {
      writeFileSync(path, `${JSON.stringify(genericScene(target), null, 2)}\n`);
      written += 1;
    } catch (error) {
      failures.push({ buildingClass: target.buildingClass, error: error.message });
    }
  }
  writeFileSync(resolve(batchRoot, 'scene-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  process.stdout.write(`PASS  자동 장면 레시피 ${written}건 생성 · 예외 ${failures.length}건\nOUTPUT=${sceneRoot}\n`);
}

function exportAssets() {
  if (!existsSync(paks)) throw new Error(`Paks 디렉터리 누락: ${paks}`);
  mkdirSync(exportRoot, { recursive: true });
  const objectPaths = new Set();
  for (const target of targets.filter((row) => ['static-ready', 'mixed-animation', 'mesh-reference-only'].includes(row.mode))) {
    for (const component of target.staticComponents) objectPaths.add(normalizeExportObjectPath(component.objectPath));
    for (const component of target.skeletalComponents) objectPaths.add(normalizeExportObjectPath(component.objectPath));
    for (const component of target.fallbackMeshReferences) objectPaths.add(normalizeExportObjectPath(component.objectPath));
    if (target.indicator) {
      const mesh = target.indicator.indirectBlueprint.meshReferences
        .find((reference) => reference.includes('SM_ProductionLight_01'));
      if (mesh) objectPaths.add(normalizeExportObjectPath(mesh));
    }
    if (target.buildingClass === 'Build_TradingPost_C') {
      objectPaths.add('/Game/FactoryGame/Buildable/Factory/TradingPost/Mesh/SM_Hub_Stg_06.SM_Hub_Stg_06');
    }
  }
  const result = spawnSync('dotnet', [
    'run', '--project', 'scripts/game-assets/Cue4ParseCatalog', '--',
    'export', paks, exportRoot, ...objectPaths,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  const missing = [...objectPaths].filter((objectPath) => !existsSync(objectPathToExportPath(objectPath)));
  if (missing.length) throw new Error(`추출 GLB 누락 ${missing.length}건: ${missing.slice(0, 5).join(', ')}`);
  if (result.status !== 0) process.stderr.write(`WARN  부수 의존성 추출 일부 실패 exit=${result.status}; 필수 GLB는 모두 존재\n`);
  process.stdout.write(`PASS  정적 탑뷰 메시 ${objectPaths.size}건 일괄 추출\nOUTPUT=${exportRoot}\n`);
}

function repairHubScene() {
  const path = resolve(root, 'scripts/topview/scenes/generated/Build_TradingPost_C.json');
  const scene = JSON.parse(readFileSync(path, 'utf8'));
  const skeletal = scene.components.find((component) => component.id === 'MainMesh_skl_GEN_VARIABLE');
  if (!skeletal) throw new Error('HUB 기본 골격 메시 누락');
  scene.components = [
    skeletal,
    {
      id: 'completed-hub-stage-6',
      renderMode: 'body',
      path: '.cache/topview/batch/exports/FactoryGame/Content/FactoryGame/Buildable/Factory/TradingPost/Mesh/SM_Hub_Stg_06.glb',
      transform: [0, 0, 0, 0],
      rotationEulerDeg: [0, 0, 0],
      scale: [1, 1, 1],
      source: 'runtime-upgrade-array:Build_TradingPost_C.mStages[6]',
      confidence: 'verified',
    },
  ];
  scene.assemblyFeatures = [
    { id: 'animated-hub-frame', owner: skeletal.id, status: 'present' },
    { id: 'completed-stage-6-shell', owner: 'completed-hub-stage-6', status: 'present' },
  ];
  const result = resolveSceneGameMaterials(scene, { root, exportRoot, rows: factoryAssetRows });
  writeFileSync(path, `${JSON.stringify(result.scene, null, 2)}\n`);
  process.stdout.write(`PASS  HUB 완성 6단계 본체 2개 · 이벤트/건설효과 구성품 0개\nOUTPUT=${path}\n`);
}

async function renderScenes() {
  const ready = targets
    .filter((target) => ['static-ready', 'mixed-animation', 'mesh-reference-only'].includes(target.mode))
    .filter((target) => existsSync(resolve(sceneRoot, `${target.buildingClass}.json`)))
    .filter((target) => !only || target.buildingClass === only)
    .slice(0, limit);
  const queue = [...ready];
  const failures = [];
  const runOne = (target) => new Promise((done) => {
    const scene = resolve(sceneRoot, `${target.buildingClass}.json`);
    const output = resolve(renderRoot, target.buildingClass);
    mkdirSync(output, { recursive: true });
    if (!force && readdirSync(output).some((name) => name.endsWith('.receipt.json'))) {
      process.stdout.write(`PASS  ${target.buildingClass} 재사용\n`);
      done();
      return;
    }
    const child = spawn(process.execPath, [
      'scripts/topview/run-validated-render.mjs', scene, output,
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.on('close', (code) => {
      if (code === 0) process.stdout.write(`PASS  ${target.buildingClass}\n`);
      else {
        failures.push({ buildingClass: target.buildingClass, code, tail });
        process.stderr.write(`FAIL  ${target.buildingClass} exit=${code}\n`);
      }
      done();
    });
  });
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  });
  await Promise.all(workers);
  writeFileSync(resolve(batchRoot, 'render-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  if (failures.length) throw new Error(`배치 렌더 실패 ${failures.length}/${ready.length}`);
  process.stdout.write(`PASS  검증 후보 ${ready.length}건 렌더\nOUTPUT=${renderRoot}\n`);
}

async function rerenderPublishedScenes() {
  const publishedRoot = resolve(root, 'scripts/topview/scenes/generated');
  const targetById = new Map(scope.targets.map((target) => [target.buildingClass, target]));
  const states = [
    { key: 'activeWithCrystal', color: '#6c8ae1' },
    { key: 'standby', color: '#ffff00' },
    { key: 'error', color: '#ff0000' },
  ];
  const jobs = readdirSync(publishedRoot).filter((name) => name.endsWith('.json')).flatMap((name) => {
    const buildingClass = name.replace(/\.json$/, '');
    const target = targetById.get(buildingClass);
    const base = { buildingClass, scene: resolve(publishedRoot, name), output: resolve(renderRoot, buildingClass) };
    return [base, ...(target && requiresOperationalStateAssets(target)
      ? states.map((state) => ({ ...base, state, output: resolve(renderRoot, buildingClass, 'states', state.key) }))
      : [])];
  });
  const queue = [...jobs];
  const failures = [];
  let completed = 0;
  const runOne = (job) => new Promise((done) => {
    mkdirSync(job.output, { recursive: true });
    const args = ['scripts/topview/run-validated-render.mjs', job.scene, job.output];
    if (job.state) args.push(`--state-color=${job.state.color}`);
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.on('close', (code) => {
      if (code === 0) {
        completed += 1;
        process.stdout.write(`PASS  ${job.buildingClass}${job.state ? ` ${job.state.key}` : ''}\n`);
      } else {
        failures.push({ buildingClass: job.buildingClass, state: job.state?.key ?? 'active', code, tail });
        process.stderr.write(`FAIL  ${job.buildingClass}${job.state ? ` ${job.state.key}` : ''} exit=${code}\n`);
      }
      done();
    });
  });
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  });
  await Promise.all(workers);
  writeFileSync(resolve(batchRoot, 'material-rerender-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  if (failures.length) throw new Error(`재질 수정 렌더 실패 ${failures.length}/${jobs.length}`);
  process.stdout.write(`PASS  재질 수정 탑뷰 ${completed}건 렌더\nOUTPUT=${renderRoot}\n`);
}

async function renderStateVariants() {
  const states = [
    { key: 'activeWithCrystal', color: '#6c8ae1' },
    { key: 'standby', color: '#ffff00' },
    { key: 'error', color: '#ff0000' },
  ];
  const jobs = targets
    .filter((target) => target.statusMode === 'production-indicator-4-state')
    .filter((target) => existsSync(resolve(sceneRoot, `${target.buildingClass}.json`)))
    .flatMap((target) => states.map((state) => ({ target, state })));
  const queue = [...jobs];
  const failures = [];
  let completed = 0;
  const runOne = ({ target, state }) => new Promise((done) => {
    const scene = resolve(sceneRoot, `${target.buildingClass}.json`);
    const output = resolve(renderRoot, target.buildingClass, 'states', state.key);
    mkdirSync(output, { recursive: true });
    if (readdirSync(output).some((name) => name.endsWith('.receipt.json'))) {
      completed += 1;
      done();
      return;
    }
    const child = spawn(process.execPath, [
      'scripts/topview/run-validated-render.mjs', scene, output, `--state-color=${state.color}`,
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-4000); });
    child.on('close', (code) => {
      if (code === 0) {
        completed += 1;
        process.stdout.write(`PASS  ${target.buildingClass} ${state.key}\n`);
      } else {
        failures.push({ buildingClass: target.buildingClass, state: state.key, code, tail });
        process.stderr.write(`FAIL  ${target.buildingClass} ${state.key} exit=${code}\n`);
      }
      done();
    });
  });
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  });
  await Promise.all(workers);
  writeFileSync(resolve(batchRoot, 'state-render-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  if (failures.length) throw new Error(`상태 변형 렌더 실패 ${failures.length}/${jobs.length}`);
  process.stdout.write(`PASS  상태 변형 후보 ${completed}건 렌더\nOUTPUT=${renderRoot}\n`);
}

async function writeReviewSheet() {
  const rows = targets.flatMap((target) => {
    const directory = resolve(renderRoot, target.buildingClass);
    if (!existsSync(directory)) return [];
    const candidate = readdirSync(directory).find((name) => name.endsWith('.candidate.png'));
    return candidate ? [{ target, path: resolve(directory, candidate) }] : [];
  });
  if (!rows.length) throw new Error('검수 시트에 넣을 후보가 없습니다.');
  const columns = 5;
  const cellWidth = 260;
  const cellHeight = 286;
  const composites = [];
  for (const [index, row] of rows.entries()) {
    const left = (index % columns) * cellWidth + 10;
    const top = Math.floor(index / columns) * cellHeight + 8;
    composites.push({
      input: await sharp(row.path).resize(240, 240, { fit: 'contain' }).png().toBuffer(),
      left,
      top,
    });
    const label = row.target.buildingClass.replace(/[<>&]/g, '');
    composites.push({
      input: Buffer.from(`<svg width="240" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="30" fill="#0b0f13"/><text x="120" y="19" text-anchor="middle" fill="#e7edf4" font-size="12" font-family="Arial">${label}</text></svg>`),
      left,
      top: top + 244,
    });
  }
  const output = resolve(batchRoot, 'review-sheet.png');
  await sharp({
    create: {
      width: columns * cellWidth,
      height: Math.ceil(rows.length / columns) * cellHeight,
      channels: 4,
      background: '#080b0f',
    },
  }).composite(composites).png().toFile(output);
  process.stdout.write(`PASS  탑뷰 후보 검수 시트 ${rows.length}건\nOUTPUT=${output}\n`);
}

function publishAcceptedScenes() {
  const review = readJson('src/data/curated/topview-batch-review.json');
  const publishedRoot = resolve(root, 'scripts/topview/scenes/generated');
  mkdirSync(publishedRoot, { recursive: true });
  const failures = [];
  let published = 0;
  for (const buildingClass of review.accepted) {
    const source = resolve(sceneRoot, `${buildingClass}.json`);
    if (!existsSync(source)) {
      failures.push({ buildingClass, reason: '자동 장면 누락' });
      continue;
    }
    const scene = JSON.parse(readFileSync(source, 'utf8'));
    scene.footprint.widthM = Math.abs(scene.footprint.widthM);
    scene.footprint.lengthM = Math.abs(scene.footprint.lengthM);
    scene.footprint.heightM = Math.abs(scene.footprint.heightM);
    if (buildingClass === 'Build_SpaceElevator_C') {
      scene.materials.staticBaseMaterial = 'SpaceElevator_Inst';
    }
    scene.validationContract = 'batch-static';
    scene.portVisibilityRequired = false;
    scene.portVisibility ??= [];
    if (!scene.materialChecks?.some((check) => check.id === 'cue4parse-game-texture-bindings' && check.status === 'present')) {
      failures.push({ buildingClass, reason: '게임 텍스처 연결 누락' });
      continue;
    }
    scene.cameraLightingChecks = [{ id: 'runtime-orthographic-top', status: 'present' }];
    scene.pipelineAudit = {
      ...scene.pipelineAudit,
      repeatedDefectThreshold: 2,
      systemicDefectThreshold: 1,
      rawVatCandidateAllowed: false,
      requiredStages: ['package-graph', 'blueprint-components', 'view-feature-matrix', 'runtime-top-after-assembly'],
    };
    for (const component of scene.components) {
      if (component.id.startsWith('fallback-mesh-')) {
        component.source = `mesh-reference:${component.path}`;
      }
      if (component.path && resolve(component.path) === component.path) {
        component.path = relative(root, component.path).replaceAll('\\', '/');
      }
    }
    writeFileSync(resolve(publishedRoot, `${buildingClass}.json`), `${JSON.stringify(scene, null, 2)}\n`);
    published += 1;
  }
  writeFileSync(resolve(batchRoot, 'publish-scene-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  process.stdout.write(`PASS  승인 장면 ${published}건 게시 · 누락 ${failures.length}건\nOUTPUT=${publishedRoot}\n`);
}

try {
  writeWorklist();
  if (mode === 'plan') process.exit(0);
  if (mode === 'export') exportAssets();
  else if (mode === 'scenes') writeScenes();
  else if (mode === 'repair-materials') repairPublishedSceneMaterials();
  else if (mode === 'repair-hub') repairHubScene();
  else if (mode === 'render') await renderScenes();
  else if (mode === 'rerender-published') await rerenderPublishedScenes();
  else if (mode === 'render-states') await renderStateVariants();
  else if (mode === 'sheet') await writeReviewSheet();
  else if (mode === 'publish-scenes') publishAcceptedScenes();
  else if (mode === 'prepare') {
    exportAssets();
    writeScenes();
  } else throw new Error(`알 수 없는 모드: ${mode}`);
} catch (error) {
  process.stderr.write(`ERROR ${error.message}\n`);
  process.exit(2);
}
