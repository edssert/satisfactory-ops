import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const TEXTURE_CHANNELS = {
  albedo: new Set(['albedo', 'basecolour', 'base color', 'bc', 'tx_albedo', 'pm_diffuse', 'screentexture', 'texture']),
  ao: new Set(['aomasks', 'ao', 'maskao', 'masks']),
  normal: new Set(['normal', 'tx_normal', 'pm_normals']),
  reflection: new Set(['reflectionmap', 'reflection', 'refl', 'relf', 'tx_reflmap', 'mreao', 'ao/roughness/metal', 'roughness', 'roghness']),
};

function packagePathFromObjectPath(objectPath) {
  return objectPath.replace(/\.\d+$/, '').replace(/^\/Game\//, 'FactoryGame/Content/') + '.uasset';
}

function exportedTexturePath(exportRoot, objectPath) {
  return resolve(exportRoot, objectPath
    .replace(/\.[^/]+$/, '')
    .replace(/^\/Game\//, 'FactoryGame/Content/') + '.png');
}

function textureChannel(parameter, objectPath) {
  const normalized = parameter.toLocaleLowerCase('en-US');
  const direct = Object.entries(TEXTURE_CHANNELS).find(([, aliases]) => aliases.has(normalized))?.[0];
  if (direct) return direct;
  const name = objectPath.replace(/\.[^/]+$/, '').split('/').at(-1).toLocaleLowerCase('en-US');
  if (/(?:_bc|_alb|_albedo|_diffuse)$/.test(name)) return 'albedo';
  if (/(?:_aomasks?|_ao)$/.test(name)) return 'ao';
  if (/(?:_n|_normal)$/.test(name)) return 'normal';
  if (/(?:_refl|_reflection|_mreo)$/.test(name)) return 'reflection';
  return null;
}

const exportedMaterialCache = new Map();

function exportedMaterialsByName(exportRoot) {
  if (exportedMaterialCache.has(exportRoot)) return exportedMaterialCache.get(exportRoot);
  const index = new Map();
  for (const entry of readdirRecursive(exportRoot)) {
    if (!entry.endsWith('.json')) continue;
    const name = basename(entry, '.json').toLocaleLowerCase('en-US');
    const row = { path: entry, data: JSON.parse(readFileSync(entry, 'utf8')) };
    if (row.data?.Textures) {
      const values = index.get(name) ?? [];
      values.push(row);
      index.set(name, values);
    }
  }
  exportedMaterialCache.set(exportRoot, index);
  return index;
}

function readdirRecursive(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...readdirRecursive(path));
    else output.push(path);
  }
  return output;
}

function glbMaterialNames(path) {
  if (!existsSync(path)) return [];
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'glTF') return [];
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/, ''));
  return (json.materials ?? []).map((material) => material.name).filter(Boolean);
}

function sharedPrefixScore(left, right) {
  const a = left.toLocaleLowerCase('en-US').split(/[\\/]/);
  const b = right.toLocaleLowerCase('en-US').split(/[\\/]/);
  let score = 0;
  while (score < a.length && score < b.length && a[score] === b[score]) score += 1;
  return score;
}

export function readFactoryAssetRows(root) {
  const path = resolve(root, '.cache/game-asset-index/factory-assets.ndjson');
  return readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

export function resolveSceneGameMaterials(scene, { root, exportRoot, rows }) {
  const packageByPath = new Map(rows.map((row) => [row.Package.toLocaleLowerCase('en-US'), row]));
  const materialsByName = Map.groupBy(
    rows.flatMap((row) => (row.Materials ?? []).map((material) => ({ package: row.Package, ...material }))),
    (material) => material.Name.toLocaleLowerCase('en-US'),
  );
  const componentPaths = scene.components
    .filter((component) => component.renderMode !== 'metadata-only' && component.path)
    .map((component) => resolve(root, component.path));
  const materialNames = [...new Set(componentPaths.flatMap(glbMaterialNames))];
  const exportedMaterials = exportedMaterialsByName(exportRoot);
  const output = {
    albedo: {}, ao: {}, normal: {}, reflection: {}, stateMask: {}, paint: {}, baseColor: {},
    alpha: [], pbr: [], normalOnly: [], emissiveAccent: [], emissiveGeometrySelectors: [],
    opacityGeometrySelectors: scene.materials?.opacityGeometrySelectors ?? [],
    state: scene.materials?.state ?? { color: '#00ff00', strength: 5 },
  };
  const bindings = [];

  for (const materialName of materialNames) {
    const candidates = materialsByName.get(materialName.toLocaleLowerCase('en-US')) ?? [];
    const score = (candidate) => Math.max(0, ...componentPaths.map((path) => sharedPrefixScore(dirname(path), candidate.package)));
    const textureBonus = (candidate) => Object.keys(candidate.Textures ?? {}).length ? 100 : 0;
    const start = [...candidates].sort((left, right) =>
      textureBonus(right) + score(right) - textureBonus(left) - score(left))[0];
    const exported = [...(exportedMaterials.get(materialName.toLocaleLowerCase('en-US')) ?? [])]
      .sort((left, right) => {
        const score = (candidate) => Math.max(0, ...componentPaths.map((path) => sharedPrefixScore(dirname(path), candidate.path)));
        return score(right) - score(left);
      })[0];

    const chain = [];
    const seen = new Set();
    let current = start ?? null;
    while (current && !seen.has(current.package.toLocaleLowerCase('en-US'))) {
      seen.add(current.package.toLocaleLowerCase('en-US'));
      chain.unshift(current);
      if (!current.Parent) break;
      const parentRow = packageByPath.get(packagePathFromObjectPath(current.Parent).toLocaleLowerCase('en-US'));
      const parentName = current.Parent.match(/([^/.]+)\.\d+$/)?.[1];
      const parent = parentRow?.Materials?.find((material) => material.Name === parentName);
      current = parent ? { package: parentRow.Package, ...parent } : null;
    }

    const inheritedTextures = {
      ...Object.assign({}, ...chain.map((material) => material.Textures ?? {})),
      ...(exported?.data?.Textures ?? {}),
    };
    const usesFactoryArray = chain.some((material) => material.Name === 'MM_Factory_Array');
    let mapped = 0;
    for (const [parameter, texture] of Object.entries(inheritedTextures)) {
      const objectPath = typeof texture === 'string' ? texture : texture?.ObjectPath;
      const channel = objectPath ? textureChannel(parameter, objectPath) : null;
      if (!channel || !objectPath || texture?.ObjectName?.startsWith('Texture2DArray')) continue;
      const absolute = exportedTexturePath(exportRoot, objectPath);
      if (!existsSync(absolute)) continue;
      output[channel][materialName] = relative(root, absolute).replaceAll('\\', '/');
      mapped += 1;
    }
    if (usesFactoryArray || /^decal_(?:normal|color)/i.test(materialName)) {
      const atlas = {
        albedo: '.cache/topview/satisfactory-material-atlas.png',
        normal: '.cache/topview/satisfactory-normal-atlas.png',
        reflection: '.cache/topview/satisfactory-reflection-atlas.png',
      };
      for (const [channel, path] of Object.entries(atlas)) {
        if (existsSync(resolve(root, path))) output[channel][materialName] ??= path;
      }
      mapped += 3;
    }
    if (mapped > 0) {
      output.pbr.push(materialName);
      bindings.push({ material: materialName, channels: Object.keys(TEXTURE_CHANNELS).filter((channel) => output[channel][materialName]) });
    }
    if (chain.some((material) => material.Switches?.CanBePainted)
      || exported?.data?.Parameters?.Switches?.CanBePainted) {
      output.paint[materialName] = { primary: '#fa9549', secondary: '#4f5da4' };
    }
    if (/decalcolor|emiss|light/i.test(materialName)) output.emissiveAccent.push(materialName);
  }

  scene.materials = output;
  scene.materialChecks = bindings.length
    ? [{ id: 'cue4parse-game-texture-bindings', status: 'present', bindings }]
    : [{ id: 'cue4parse-game-texture-bindings', status: 'missing', bindings: [] }];
  return { scene, bindings, materialNames };
}
