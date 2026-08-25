#!/usr/bin/env node
/** 실제 게임 runtime probe와 Blender 재질 binding 사이의 제품 공용 Material IR을 만든다. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const shortName = (path) => path?.split('/').at(-1)?.split('.')[0] ?? '';
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function filterSceneToRuntimeVisuals(scene, { probe }) {
  const normalizeObjectPath = (value) => value?.replace(/\.[^/.]+$/, '').toLowerCase() ?? null;
  const componentObjectPath = (path) => {
    const normalized = path?.replaceAll('\\', '/');
    const marker = 'FactoryGame/Content/';
    const index = normalized?.indexOf(marker) ?? -1;
    return index >= 0 ? normalizeObjectPath(`/Game/${normalized.slice(index + marker.length).replace(/\.glb$/i, '')}`) : null;
  };
  const runtimeMeshes = new Set((probe.components ?? [])
    .filter((component) => component.owner === 'machine')
    .flatMap((component) => [component.staticMesh, component.skeletalMesh])
    .filter(Boolean)
    .map(normalizeObjectPath));
  const excluded = (scene.components ?? [])
    .filter((component) => component.path && !runtimeMeshes.has(componentObjectPath(component.path)))
    .map((component) => component.id);
  return {
    ...scene,
    components: scene.components.filter((component) => !excluded.includes(component.id)),
    completeness: (scene.completeness ?? []).filter((part) => !excluded.includes(part.owner)),
    portVisibility: (scene.portVisibility ?? []).map((port) => excluded.includes(port.stubComponent)
      ? Object.fromEntries(Object.entries(port).filter(([key]) => !['stubComponent', 'stubSourceLengthM'].includes(key)))
      : port),
    externalComponentsExcluded: excluded,
    runtimeVisualMeshCount: runtimeMeshes.size,
  };
}

export function buildRuntimeMaterialIr(scene, { root, probePath }) {
  const probe = JSON.parse(readFileSync(probePath, 'utf8'));
  const expectedClass = probe.machineClassPath?.split('.').at(-1);
  if (probe.mode !== 'current-game-runtime-probe' || expectedClass !== scene.buildingClass) {
    throw new Error(`${scene.buildingClass}: runtime probe 계약이 일치하지 않습니다.`);
  }
  const runtimeByName = Map.groupBy(probe.materials ?? [], (material) => shortName(material.path).toLowerCase());
  const bindings = scene.isometricMaterialEvidence?.bindings ?? [];
  const missing = [];
  const materials = bindings.map((binding) => {
    const candidates = runtimeByName.get(binding.material.toLowerCase()) ?? [];
    const runtime = candidates[0];
    if (!runtime) missing.push(binding.material);
    const channels = Object.fromEntries(binding.channels.map((channel) => {
      const path = scene.materials?.[channel]?.[binding.material];
      const absolute = path ? resolve(root, path) : null;
      if (!absolute || !existsSync(absolute)) throw new Error(`${binding.material}.${channel} 추출 텍스처가 없습니다: ${path}`);
      return [channel, { path: relative(root, absolute).replaceAll('\\', '/'), sha256: sha256(absolute) }];
    }));
    return {
      slot: binding.material,
      runtimePath: runtime?.path ?? null,
      baseMaterial: runtime?.baseMaterial ?? null,
      parent: runtime?.parent ?? null,
      scalarParameters: runtime?.scalarParameters ?? [],
      vectorParameters: runtime?.vectorParameters ?? [],
      textureParameters: runtime?.textureParameters ?? [],
      usedTextures: runtime?.usedTextures ?? [],
      reconstruction: binding.reconstruction,
      channels,
    };
  });
  if (missing.length) throw new Error(`${scene.buildingClass}: runtime probe에 없는 Blender 재질 슬롯 ${missing.join(', ')}`);

  const activeTextures = (probe.textures ?? []).filter((texture) => texture.effectiveMaterialUse);
  const lowMips = activeTextures.filter((texture) => Number.isFinite(texture.residentMips)
    && texture.residentMips < texture.maxRuntimeMips);
  if (lowMips.length) throw new Error(`${scene.buildingClass}: runtime 최고 mip 미적재 ${lowMips.map((entry) => entry.path).join(', ')}`);
  return {
    $schemaVersion: 1,
    buildingClass: scene.buildingClass,
    source: {
      mode: probe.mode,
      buildVersion: probe.buildVersion,
      path: relative(root, probePath).replaceAll('\\', '/'),
      sha256: sha256(probePath),
    },
    materials,
    activeTextures,
    foundationInstances: probe.foundationInstances,
    technicalMeshes: probe.technicalMeshes,
    rule: 'runtime effective parameters select the material; extracted current-game files supply pixels; product overrides are forbidden',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = resolve(import.meta.dirname, '../..');
  const scenePath = resolve(root, process.argv[2] ?? '');
  const outputPath = resolve(root, process.argv[3] ?? '');
  if (!process.argv[2] || !process.argv[3]) process.exit(2);
  const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
  const renderContract = JSON.parse(readFileSync(resolve(root, 'scripts/unreal-render/render-contract.json'), 'utf8'));
  const probePath = resolve(root, `.cache/game-asset-index/runtime-probes/CL-${renderContract.gameBuild}/${scene.buildingClass}.json`);
  const ir = buildRuntimeMaterialIr(scene, { root, probePath });
  writeFileSync(outputPath, `${JSON.stringify(ir, null, 2)}\n`);
  process.stdout.write(`PASS  runtime Material IR ${scene.buildingClass} · ${outputPath}\n`);
}
