#!/usr/bin/env node
/**
 * 생성된 설계 자산 범위와 현재 설치본 기반 승인 자산의 격차를 계산한다.
 * 사용: node scripts/inventory-topview-assets.mjs [--json] [--list] [--strict]
 * 종료: 일반 보고 0, 데이터 계약 오류 2, --strict 완료 조건 미달 3.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  comparePlannerAssetTargets,
  requiresRasterTopview,
  requiresOperationalStateAssets,
} from '../src/lib/planner-asset-scope.ts';
import { RUNTIME_TOPVIEW_SOURCE, runtimeTopviewAssets, topviewAssets } from '../src/lib/topview-assets.ts';

const root = resolve(import.meta.dirname, '..');
const scope = JSON.parse(readFileSync(resolve(root, 'src/data/app/planner-asset-scope.json'), 'utf8'));
const buildings = JSON.parse(readFileSync(resolve(root, 'src/data/app/buildings.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'src/data/curated/topview-assets.json'), 'utf8'));
const sceneRoot = resolve(root, 'scripts/topview/scenes');
const flags = new Set(process.argv.slice(2));
const strict = flags.has('--strict');
const asJson = flags.has('--json');
const list = flags.has('--list');
const stateNames = ['active', 'activeWithCrystal', 'standby', 'error'];

if (!Array.isArray(scope.targets) || !Array.isArray(buildings) || !Array.isArray(manifest.assets)) {
  process.stderr.write('ERROR 생성 자산 범위·건물·탑뷰 매니페스트 계약이 잘못됐습니다.\n');
  process.exit(2);
}

const buildingById = new Map(buildings.map((building) => [building.id, building]));
const sceneFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? sceneFiles(path) : entry.name.endsWith('.json') ? [path] : [];
});
const scenes = existsSync(sceneRoot)
  ? sceneFiles(sceneRoot).map((path) => ({ name: path, ...JSON.parse(readFileSync(path, 'utf8')) }))
  : [];
const scenesByBuilding = Map.groupBy(scenes, (scene) => scene.buildingClass);
const assetsByBuilding = Map.groupBy(
  topviewAssets.filter((asset) => asset.buildingClass && asset.role !== 'golden-reference'),
  (asset) => asset.buildingClass,
);

const targets = scope.targets.filter(requiresRasterTopview).sort(comparePlannerAssetTargets).map((target) => {
  const building = buildingById.get(target.buildingClass);
  if (!building) {
    process.stderr.write(`ERROR 생성 자산 범위가 없는 건물을 참조합니다: ${target.buildingClass}\n`);
    process.exit(2);
  }
  const assets = assetsByBuilding.get(target.buildingClass) ?? [];
  const approved = assets.find((asset) => asset.sourceId === RUNTIME_TOPVIEW_SOURCE && asset.reviewStatus === 'approved');
  const candidate = assets.find((asset) => asset.sourceId === RUNTIME_TOPVIEW_SOURCE && asset.reviewStatus === 'candidate');
  const reference = assets.find((asset) => asset.sourceId !== RUNTIME_TOPVIEW_SOURCE);
  const stateful = requiresOperationalStateAssets(target);
  const stateAssetsComplete = !stateful || stateNames.every((state) => {
    const variant = approved?.statusImages?.[state];
    return variant?.path && variant?.sha256;
  });
  const sceneCount = scenesByBuilding.get(target.buildingClass)?.length ?? 0;
  const status = approved ? 'approved' : candidate ? 'candidate' : reference ? 'reference-only' : 'missing';
  return {
    id: target.buildingClass,
    ko: building.ko,
    plannerKind: target.plannerKind,
    representation: target.representation,
    statusMode: target.statusMode,
    unlockTier: target.unlockTier,
    status,
    stateAssetsComplete,
    sceneCount,
    approvedAssetId: approved?.assetId ?? null,
  };
});

const statusKeys = ['approved', 'candidate', 'reference-only', 'missing'];
const counts = Object.fromEntries(statusKeys.map((status) => [
  status,
  targets.filter((target) => target.status === status).length,
]));
const kindCounts = Object.fromEntries([...Map.groupBy(targets, (target) => target.plannerKind)].map(([kind, rows]) => [
  kind,
  rows.length,
]));
const operationalTargets = targets.filter((target) => target.statusMode === 'production-indicator-4-state');
const incompleteOperationalStates = operationalTargets.filter((target) => !target.stateAssetsComplete);
const approvedWithoutScene = targets.filter((target) => target.status === 'approved' && target.sceneCount === 0);
const manifestCandidates = manifest.assets.filter((asset) => asset.reviewStatus === 'candidate').map((asset) => asset.assetId);
const runtimeForeignSources = runtimeTopviewAssets
  .filter((asset) => asset.sourceId !== RUNTIME_TOPVIEW_SOURCE)
  .map((asset) => asset.assetId);
const backlog = targets.filter((target) => target.status !== 'approved');
const complete = backlog.length === 0
  && incompleteOperationalStates.length === 0
  && approvedWithoutScene.length === 0
  && manifestCandidates.length === 0
  && runtimeForeignSources.length === 0;

const report = {
  schemaVersion: 2,
  sourceId: RUNTIME_TOPVIEW_SOURCE,
  scopeBuildCl: scope.buildCl,
  scopeHashes: scope.hashes,
  total: targets.length,
  composedRepresentationTotal: scope.targets.length - targets.length,
  kindCounts,
  counts,
  operationalStateAssets: {
    total: operationalTargets.length,
    complete: operationalTargets.length - incompleteOperationalStates.length,
    incomplete: incompleteOperationalStates.map((target) => target.id),
  },
  approvedWithoutScene: approvedWithoutScene.map((target) => target.id),
  manifestCandidates,
  runtimeForeignSources,
  complete,
  next: backlog.slice(0, 10),
  targets: list || asJson ? targets : undefined,
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`PASS  생성 설계 자산 범위 ${targets.length}건 · nativeClass 정책 지문 ${scope.hashes.included.slice(0, 12)}\n`);
  process.stdout.write(`INFO  현재 설치본 승인 ${counts.approved} · 후보 ${counts.candidate} · 참조 전용 ${counts['reference-only']} · 누락 ${counts.missing}\n`);
  process.stdout.write(`INFO  운전 상태 4종 완결 ${report.operationalStateAssets.complete}/${report.operationalStateAssets.total} · 승인 장면 누락 ${approvedWithoutScene.length}\n`);
  process.stdout.write(`INFO  매니페스트 candidate ${manifestCandidates.length} · 런타임 외부 출처 ${runtimeForeignSources.length}\n`);
  for (const target of report.next) {
    process.stdout.write(`NEXT  T${target.unlockTier ?? '?'} ${String(target.plannerKind).padEnd(18)} ${target.id} · ${target.ko} · ${target.status}\n`);
  }
  if (list) {
    for (const target of targets.slice(10)) {
      process.stdout.write(`ROW   T${target.unlockTier ?? '?'} ${String(target.plannerKind).padEnd(18)} ${target.id} · ${target.ko} · ${target.status}\n`);
    }
  }
}

if (strict && !complete) process.exit(3);
