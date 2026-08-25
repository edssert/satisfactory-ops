#!/usr/bin/env node
/**
 * 설치본 장면 계약에서 인게임식 하드 클리어런스와 입출력 포트 오버레이를 생성한다.
 * 사용: node scripts/topview/build-isometric-overlay-contract.mjs <scene.json> <output.json>
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFactoryAssetRows } from './material-resolver.mjs';

const root = resolve(import.meta.dirname, '../..');
const scenePath = resolve(root, process.argv[2] ?? '');
const outputPath = resolve(root, process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) {
  process.stderr.write('장면 JSON과 출력 JSON 경로가 필요합니다.\n');
  process.exit(2);
}

const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const renderContract = JSON.parse(readFileSync(resolve(root, 'scripts/unreal-render/render-contract.json'), 'utf8'));
const probePath = resolve(root, `.cache/game-asset-index/runtime-probes/CL-${renderContract.gameBuild}/${scene.buildingClass}.json`);
if (!existsSync(probePath)) throw new Error(`${scene.buildingClass} runtime probe가 없습니다: ${probePath}`);
const probe = JSON.parse(readFileSync(probePath, 'utf8'));
const nativeContracts = JSON.parse(readFileSync(resolve(root, '.cache/game-asset-index/factory-native-contracts.json'), 'utf8'));
const factoryScenes = JSON.parse(readFileSync(resolve(root, '.cache/game-asset-index/factory-scenes.json'), 'utf8'));
const buildingContract = factoryScenes.contracts.find((entry) => entry.buildingClass === scene.buildingClass);
if (!buildingContract) {
  process.stderr.write(`${scene.buildingClass}의 설치본 장면 계약이 없습니다.\n`);
  process.exit(1);
}
const rows = readFactoryAssetRows(root);
const settingsRow = rows.find((row) => row.FactorySettings && Object.keys(row.FactorySettings).length);
const settings = settingsRow?.FactorySettings;
const packageFromObject = (objectPath) => objectPath.replace(/\.\d+$/, '').replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
const objectPath = (field) => settings?.[field]?.ObjectPath;
const meshContract = (field) => {
  const sourceObject = objectPath(field);
  const packagePath = sourceObject ? packageFromObject(sourceObject) : null;
  const row = rows.find((entry) => entry.Package.toLowerCase() === packagePath?.toLowerCase());
  const name = sourceObject?.replace(/\.\d+$/, '').split('/').at(-1);
  const mesh = row?.Meshes?.find((entry) => entry.Name === name);
  if (!sourceObject || !mesh?.Bounds?.Origin || !mesh?.Bounds?.BoxExtent) throw new Error(`FactorySettings ${field} 또는 저자 bounds가 없습니다.`);
  const origin = mesh.Bounds.Origin;
  const extent = mesh.Bounds.BoxExtent;
  return {
    field,
    objectPath: sourceObject,
    package: packagePath,
    name,
    authoredBounds: {
      originCm: [origin.X, origin.Y, origin.Z],
      extentCm: [extent.X, extent.Y, extent.Z],
      blenderOriginM: [origin.X / 100, -origin.Y / 100, origin.Z / 100],
      blenderExtentM: [extent.X / 100, extent.Y / 100, extent.Z / 100],
    },
  };
};
const materialContract = (field) => {
  const sourceObject = objectPath(field);
  const packagePath = sourceObject ? packageFromObject(sourceObject) : null;
  const row = rows.find((entry) => entry.Package.toLowerCase() === packagePath?.toLowerCase());
  const name = sourceObject?.replace(/\.\d+$/, '').split('/').at(-1);
  const material = row?.Materials?.find((entry) => entry.Name === name);
  if (!sourceObject || !material) throw new Error(`FactorySettings ${field} 재질이 없습니다.`);
  const parentPath = material.Parent ? packageFromObject(material.Parent) : null;
  const parentRow = rows.find((entry) => entry.Package.toLowerCase() === parentPath?.toLowerCase());
  const parentName = material.Parent?.replace(/\.\d+$/, '').split('/').at(-1);
  const parent = parentRow?.Materials?.find((entry) => entry.Name === parentName);
  return {
    field,
    objectPath: sourceObject,
    package: packagePath,
    name,
    parent: material.Parent ? {
      objectPath: material.Parent,
      package: parentPath,
      name: parentName,
      properties: parent?.Properties ?? {},
    } : null,
    color: material.Vectors?.Param,
    opacity: material.Scalars?.opacity,
    properties: material.Properties ?? {},
  };
};
const frameMesh = meshContract('mDefaultConveyorConnectionFrameMesh');
const arrowMesh = meshContract('mDefaultConveyorConnectionArrowMesh');
const inputMaterial = materialContract('mDefaultInputConnectionMaterial');
const outputMaterial = materialContract('mDefaultOutputConnectionMaterial');
const runtimeMaterialContract = (direction, fallback = null) => {
  const technical = probe.technicalMeshes.find((entry) => {
    const material = entry.materials?.[0] ?? '';
    return direction === 'power' ? /_Power\./.test(material)
      : direction === 'input' ? /_Input\./.test(material)
        : /_Output\./.test(material);
  });
  const runtime = probe.materials.find((entry) => entry.path === technical?.materials?.[0]);
  const vector = runtime?.vectorParameters?.find((entry) => entry.name === 'Param')?.value;
  const opacity = runtime?.scalarParameters?.find((entry) => entry.name.toLowerCase() === 'opacity')?.value;
  if (!runtime || !vector || !Number.isFinite(opacity)) {
    if (fallback) return fallback;
    throw new Error(`${direction} runtime hologram 재질 계약이 없습니다.`);
  }
  return {
    field: `runtime-${direction}`,
    objectPath: runtime.path,
    name: runtime.path.split('/').at(-1).split('.')[0],
    parent: fallback?.parent ?? { objectPath: runtime.parent, properties: { bDisableDepthTest: true } },
    color: { R: vector[0], G: vector[1], B: vector[2], A: vector[3] },
    opacity,
    source: `${probePath.replaceAll('\\', '/')}#materials`,
  };
};
const runtimeInputMaterial = runtimeMaterialContract('input', inputMaterial);
const runtimeOutputMaterial = runtimeMaterialContract('output', outputMaterial);
const runtimePowerMaterial = runtimeMaterialContract('power');
const nativePlacement = nativeContracts.setupFactoryConnectionMesh;
const transformToBlender = (entry) => ({
  relativeLocationBlenderM: [entry.relativeTranslationCm[0] / 100, -entry.relativeTranslationCm[1] / 100, entry.relativeTranslationCm[2] / 100],
  relativeRotationEulerDeg: [entry.relativeRotationDeg[2], -entry.relativeRotationDeg[0], -entry.relativeRotationDeg[1]],
});
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qConjugate = ([x, y, z, w]) => [-x, -y, -z, w];
const qRotate = (q, vector) => qMul(qMul(q, [...vector, 0]), qConjugate(q)).slice(0, 3);
const multiply = (left, right) => ({
  translationCm: left.translationCm.map((value, index) => value + qRotate(
    left.rotationQuat,
    right.translationCm.map((entry, axis) => entry * left.scale[axis]),
  )[index]),
  rotationQuat: qMul(left.rotationQuat, right.rotationQuat),
  scale: left.scale.map((value, index) => value * right.scale[index]),
});
const relativeTo = (parent, world) => {
  const inverse = qConjugate(parent.rotationQuat);
  const delta = world.translationCm.map((value, index) => value - parent.translationCm[index]);
  return {
    translationCm: qRotate(inverse, delta).map((value, index) => value / parent.scale[index]),
    rotationQuat: qMul(inverse, world.rotationQuat),
    scale: world.scale.map((value, index) => value / parent.scale[index]),
  };
};
const runtimeTransformToBlender = (transform) => ({
  translationM: [transform.translationCm[0] / 100, -transform.translationCm[1] / 100, transform.translationCm[2] / 100],
  rotationQuat: [-transform.rotationQuat[0], transform.rotationQuat[1], -transform.rotationQuat[2], transform.rotationQuat[3]],
  scale: transform.scale,
});
const colorSlots = rows.flatMap((row) => row.ColorSlots ?? []);
const factoryColorSlot = colorSlots.find((slot) => slot.Slot === 0);
const foundationColorSlot = colorSlots.find((slot) => slot.Slot === 16);
if (!inputMaterial.color?.Hex || !outputMaterial.color?.Hex || !factoryColorSlot || !foundationColorSlot) {
  process.stderr.write('FactorySettings 입출력 재질 또는 색상 슬롯을 찾지 못했습니다.\n');
  process.exit(1);
}

const runtimeClearance = probe.machineClearance?.[0]?.actorLocalBox;
if (!runtimeClearance) throw new Error(`${scene.buildingClass} runtime hard clearance가 없습니다.`);
const gamePortTransform = (port) => {
  const componentId = port.id.endsWith('_GEN_VARIABLE') ? port.id : `${port.id}_GEN_VARIABLE`;
  const component = buildingContract.components.find((entry) => entry.id === componentId);
  if (!component?.transform) throw new Error(`${scene.buildingClass}.${componentId} 설치본 transform이 없습니다.`);
  const location = component.transform.locationCm;
  const rotation = component.transform.rotationDeg;
  return {
    positionM: [location.x / 100, -location.y / 100, location.z / 100],
    rotationEulerDeg: [rotation.roll, -rotation.pitch, -rotation.yaw],
    sourceTransform: `${buildingContract.package}#${componentId}.transform`,
    connectorClearanceM: (component.connection?.connectorClearanceCm ?? 0) / 100,
  };
};
const automaticPorts = buildingContract.components
  .filter((component) => component.type === 'FGFactoryConnectionComponent')
  .map((component) => ({
    id: component.id.replace(/_GEN_VARIABLE$/, ''),
    direction: component.connection?.direction?.endsWith('FCD_OUTPUT') ? 'output' : 'input',
  }));
const portSpecs = scene.portVisibility?.length ? scene.portVisibility : automaticPorts;
const contract = {
  $schemaVersion: 2,
  buildingClass: scene.buildingClass,
  sourceScene: process.argv[2].replaceAll('\\', '/'),
  runtimeProbe: {
    path: probePath.replaceAll('\\', '/'),
    sha256: createHash('sha256').update(readFileSync(probePath)).digest('hex'),
    mode: probe.mode,
    buildVersion: probe.buildVersion,
  },
  clearance: {
    minimum: [runtimeClearance.minCm[0] / 100, -runtimeClearance.maxCm[1] / 100, runtimeClearance.minCm[2] / 100],
    maximum: [runtimeClearance.maxCm[0] / 100, -runtimeClearance.minCm[1] / 100, runtimeClearance.maxCm[2] / 100],
    source: `${probePath.replaceAll('\\', '/')}#machineClearance[0].actorLocalBox`,
  },
  colors: {
    input: { hex: `#${inputMaterial.color.Hex}`, linear: [
      inputMaterial.color.R,
      inputMaterial.color.G,
      inputMaterial.color.B,
    ] },
    output: { hex: `#${outputMaterial.color.Hex}`, linear: [
      outputMaterial.color.R,
      outputMaterial.color.G,
      outputMaterial.color.B,
    ] },
    clearance: { hex: '#ffffff', linear: [1, 1, 1] },
    source: 'BP_FactorySettings input/output connection materials',
  },
  visualization: {
    sourceSettings: `${settingsRow.Package}#Default__BP_FactorySettings_C`,
    frameMesh,
    arrowMesh,
    materials: { input: runtimeInputMaterial, output: runtimeOutputMaterial, power: runtimePowerMaterial },
    placement: {
      status: 'verified-pdb-native',
      source: '.cache/game-asset-index/factory-native-contracts.json#setupFactoryConnectionMesh',
      symbol: nativePlacement.symbol,
      rva: nativePlacement.rva,
      frame: transformToBlender(nativePlacement.frame),
      inputArrow: transformToBlender(nativePlacement.inputArrow),
      outputArrow: transformToBlender(nativePlacement.outputArrow),
    },
    coordinateContract: {
      unreal: 'left-handed-z-up',
      cue4parse: '(X,Y,Z)->(X,Z,Y),cm*0.01',
      blenderImporter: '(X,Y,Z)->(X,-Z,Y),quaternion',
      finalPosition: '(X,-Y,Z)m',
    },
    occlusionPolicy: 'natural-scene-depth',
  },
  foundationColorSlot: {
    slot: foundationColorSlot.Slot,
    primary: foundationColorSlot.PrimaryColor,
    secondary: foundationColorSlot.SecondaryColor,
    source: 'BP_BuildableSubsystem.mColorSlots_Data[16]',
  },
  factoryColorSlot: {
    slot: factoryColorSlot.Slot,
    primary: factoryColorSlot.PrimaryColor,
    secondary: factoryColorSlot.SecondaryColor,
    source: 'BP_BuildableSubsystem.mColorSlots_Data[0]',
  },
  technicalMeshes: probe.technicalMeshes.map((entry, index) => {
    const relative = relativeTo(probe.machineTransform, entry.worldTransform);
    const meshName = entry.staticMesh.split('/').at(-1).split('.')[0];
    const materialPath = entry.materials?.[0] ?? '';
    return {
      id: `runtime-${index}`,
      role: meshName === 'ClearanceBox' ? 'clearance'
        : meshName === 'Arrows' ? 'arrow'
          : meshName === 'Input' ? 'connection-frame'
            : meshName === 'PowerLineHologramMesh' ? 'power' : 'technical',
      direction: /_Input\./.test(materialPath) ? 'input'
        : /_Output\./.test(materialPath) ? 'output'
          : /_Power\./.test(materialPath) ? 'power' : 'clearance',
      staticMesh: entry.staticMesh,
      materials: entry.materials,
      transform: runtimeTransformToBlender(relative),
      source: `${probePath.replaceAll('\\', '/')}#technicalMeshes[${index}]`,
    };
  }),
  foundationInstances: probe.foundationInstances.map((instance, index) => ({
    staticMesh: instance.staticMesh,
    materials: instance.materials,
    transform: runtimeTransformToBlender(relativeTo(
      probe.machineTransform,
      multiply(probe.foundationTransform, instance.relativeTransform),
    )),
    customData: instance.defaultPerInstanceCustomData,
    source: `${probePath.replaceAll('\\', '/')}#foundationInstances[${index}]`,
  })),
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
process.stdout.write(`PASS  ${scene.buildingClass} 클리어런스·포트 오버레이 · ${outputPath}\n`);
