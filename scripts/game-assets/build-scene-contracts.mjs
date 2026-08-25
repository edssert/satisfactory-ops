/**
 * 게임 자산 그래프에서 모든 Build_* Blueprint의 구성품 장면 계약을 생성한다.
 * 사용: node scripts/game-assets/build-scene-contracts.mjs [출력 JSON]
 * 종료: 성공 0, 색인/구성품 검증 실패 2.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const graphPath = resolve(root, '.cache/game-asset-index/factory-assets.ndjson');
const outputPath = resolve(root, process.argv[2] ?? '.cache/game-asset-index/factory-scenes.json');
if (!existsSync(graphPath)) {
  process.stderr.write('게임 자산 색인이 없습니다.\n');
  process.exit(2);
}

const rows = readFileSync(graphPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const byPackage = new Map(rows.map((row) => [row.Package.toLocaleLowerCase('en-US'), row]));

function objectPathToPackagePath(objectPath) {
  return objectPath.replace(/\.\d+$/, '').replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
}

function packageForObjectPath(objectPath) {
  return byPackage.get(objectPathToPackagePath(objectPath).toLocaleLowerCase('en-US'));
}

function transform(component) {
  const location = component.RelativeLocation ?? {};
  const rotation = component.RelativeRotation ?? {};
  const scale = component.RelativeScale ?? {};
  return {
    locationCm: { x: location.X ?? 0, y: location.Y ?? 0, z: location.Z ?? 0 },
    rotationDeg: { pitch: rotation.Pitch ?? 0, yaw: rotation.Yaw ?? 0, roll: rotation.Roll ?? 0 },
    scale: { x: scale.X ?? 1, y: scale.Y ?? 1, z: scale.Z ?? 1 }
  };
}

function indirectBlueprint(component, buildingRow) {
  if (!component.Type.endsWith('_C')) return null;
  const classReference = buildingRow.References.find((reference) =>
    reference.endsWith('.0') && reference.match(/([^/.]+)\.0$/)?.[1] === component.Type.replace(/_C$/, ''));
  if (!classReference) return null;
  const row = packageForObjectPath(classReference);
  if (!row) return { classReference, package: null, meshReferences: [] };
  const meshReferences = row.References.filter((reference) => /\/Mesh\//.test(reference));
  return { classReference, package: row.Package, meshReferences };
}

const buildings = rows
  .filter((row) => /\/Build_[^/]+\.uasset$/i.test(row.Package) && row.Exports.some((entry) => entry.Type === 'BlueprintGeneratedClass'))
  .map((row) => {
    const visualMaterialReferences = row.References.filter((reference) => /\/Material\//.test(reference));
    return {
      buildingClass: row.Exports.find((entry) => entry.Type === 'BlueprintGeneratedClass')?.Name,
      package: row.Package,
      components: row.Components.map((component) => ({
        id: component.Name,
        type: component.Type,
        role: component.StaticMesh || component.SkeletalMesh
          ? 'visual-direct'
          : /Connection|Inventory|PowerInfo/.test(component.Type)
            ? 'data-or-connection'
            : component.Type.endsWith('_C')
              ? 'blueprint-indirect'
              : 'non-mesh-component',
        staticMesh: component.StaticMesh,
        skeletalMesh: component.SkeletalMesh,
        overrideMaterials: component.OverrideMaterials,
        transform: transform(component),
        connection: component.Type === 'FGFactoryConnectionComponent' ? {
          direction: component.Direction ?? 'EFactoryConnectionDirection::FCD_INPUT',
          connectorClearanceCm: component.ConnectorClearance ?? 0,
        } : null,
        indirectBlueprint: indirectBlueprint(component, row)
      })),
      materialReferences: visualMaterialReferences,
      meshReferences: row.References.filter((reference) => /\/Mesh\//.test(reference))
    };
  })
  .sort((left, right) => left.buildingClass.localeCompare(right.buildingClass, 'en'));

const smelter = buildings.find((entry) => entry.buildingClass === 'Build_SmelterMk1_C');
const errors = [];
for (const id of ['FGColoredInstanceMeshProxy_GEN_VARIABLE', 'FGVertexAnimatedMesh_GEN_VARIABLE', 'BP_LadderComponent_GEN_VARIABLE', 'BP_ProductionIndicatorInstanced_GEN_VARIABLE']) {
  if (!smelter?.components.some((component) => component.id === id)) errors.push(`제련기 장면 구성품 누락 ${id}`);
}
const indicator = smelter?.components.find((component) => component.id === 'BP_ProductionIndicatorInstanced_GEN_VARIABLE');
if (!indicator?.indirectBlueprint?.meshReferences.some((reference) => reference.includes('SM_ProductionLight_01'))) {
  errors.push('제련기 생산 표시등 간접 메시 해석 실패');
}
if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify({
  schemaVersion: 1,
  source: '.cache/game-asset-index/factory-assets.ndjson',
  buildings: buildings.length,
  contracts: buildings
}, null, 2));
process.stdout.write(`PASS  건물 장면 계약 ${buildings.length}건 생성\n`);
process.stdout.write(`OUTPUT=${outputPath}\n`);
