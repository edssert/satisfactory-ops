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
  const inferredExportRoots = componentPaths.map((path) => {
    const normalized = path.replaceAll('\\', '/');
    const marker = '/FactoryGame/Content/';
    const index = normalized.indexOf(marker);
    return index >= 0 ? normalized.slice(0, index) : null;
  }).filter(Boolean);
  const exportRoots = [...new Set([resolve(exportRoot), ...inferredExportRoots.map((path) => resolve(path))])]
    .filter(existsSync);
  const materialNames = [...new Set(componentPaths.flatMap(glbMaterialNames))];
  const exportedMaterialIndexes = exportRoots.map(exportedMaterialsByName);
  const defaultColorSlot = rows.flatMap((row) => row.ColorSlots ?? []).find((slot) => slot.Slot === 0);
  const output = {
    albedo: {}, ao: {}, normal: {}, reflection: {}, stateMask: {}, paint: {}, baseColor: {}, emissionStrength: {},
    alpha: [], pbr: [], normalOnly: [], legacyPaint: [], emissiveAccent: [], emissiveGeometrySelectors: [],
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
    const exported = exportedMaterialIndexes
      .flatMap((index) => index.get(materialName.toLocaleLowerCase('en-US')) ?? [])
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
    const usesVat = chain.some((material) => material.Name === 'MM_FactoryBaked_VAT');
    const usesNormalDecal = /^decal_normal/i.test(materialName);
    const primitiveData = Object.assign({}, ...chain.map((material) => material.PrimitiveData ?? {}));
    const runtimeScalars = Object.assign({}, ...chain.map((material) => material.RuntimeScalars ?? {}));
    const usesPrimaryPaint = ['PrimaryPaintMetal_Color_R', 'PrimaryPaintMetal_Color_G', 'PrimaryPaintMetal_Color_B']
      .every((name) => Number.isInteger(primitiveData[name]));
    const usesSecondaryPaint = ['SecondaryPaintedMetal_Color_R', 'SecondaryPaintedMetal_Color_G', 'SecondaryPaintedMetal_Color_B']
      .every((name) => Number.isInteger(primitiveData[name]));
    const usesPaintPrimitiveData = usesPrimaryPaint || usesSecondaryPaint;
    const isStateDriven = ['R', 'G', 'B'].every((name) => Number.isInteger(primitiveData[name]));
    const isEmissiveAccent = /decalcolor|emiss/i.test(materialName);
    let mapped = 0;
    for (const [parameter, texture] of Object.entries(inheritedTextures)) {
      const objectPath = typeof texture === 'string' ? texture : texture?.ObjectPath;
      const channel = objectPath ? textureChannel(parameter, objectPath) : null;
      if (!channel || !objectPath || texture?.ObjectName?.startsWith('Texture2DArray')) continue;
      const absolute = exportRoots.map((rootPath) => exportedTexturePath(rootPath, objectPath)).find(existsSync);
      if (!absolute || !existsSync(absolute)) continue;
      output[channel][materialName] = relative(root, absolute).replaceAll('\\', '/');
      mapped += 1;
    }
    if (usesFactoryArray || /^decal_(?:normal|color)/i.test(materialName)) {
      const atlas = {
        albedo: '.cache/topview/factory-array-albedo.png',
        normal: '.cache/topview/factory-array-normal.png',
        reflection: '.cache/topview/factory-array-mreo.png',
      };
      for (const [channel, path] of Object.entries(atlas)) {
        if (existsSync(resolve(root, path))) output[channel][materialName] ??= path;
      }
      mapped += 3;
    }
    if (isStateDriven && output.reflection[materialName]) {
      output.stateMask[materialName] = output.reflection[materialName];
    }
    if (mapped > 0) {
      output.pbr.push(materialName);
      bindings.push({
        material: materialName,
        channels: Object.keys(TEXTURE_CHANNELS).filter((channel) => output[channel][materialName]),
        parentChain: chain.map((material) => ({
          package: material.package,
          name: material.Name,
          parent: material.Parent ?? null,
        })),
        primitiveData,
        defaultColorSlot: usesPaintPrimitiveData ? defaultColorSlot ?? null : null,
        reconstruction: usesFactoryArray
          ? 'game-factory-array-adapter'
          : usesVat ? 'game-vat-adapter'
          : usesNormalDecal ? 'baked-normal-decal-adapter' : 'native-texture-binding',
        productEligibleIsometric: usesFactoryArray || usesVat || usesNormalDecal || !usesPaintPrimitiveData,
      });
    }
    if (usesNormalDecal) output.normalOnly.push(materialName);
    if (usesVat && chain.at(-1)?.Switches?.bUseLegacyPaintTextures) output.legacyPaint.push(materialName);
    const emissionStrength = isStateDriven
      ? runtimeScalars.Intensity
      : isEmissiveAccent ? runtimeScalars.EmissiveIntensity
      : runtimeScalars.DefaultIntensity ?? runtimeScalars.EmissiveIntensity;
    if (Number.isFinite(emissionStrength)) output.emissionStrength[materialName] = emissionStrength;
    if (isStateDriven && Number.isFinite(runtimeScalars.Intensity)) {
      output.state.strength = runtimeScalars.Intensity;
    }
    if ((usesPaintPrimitiveData || chain.some((material) => material.Switches?.CanBePainted)
      || exported?.data?.Parameters?.Switches?.CanBePainted) && defaultColorSlot) {
      output.paint[materialName] = {
        primary: `#${defaultColorSlot.PrimaryColor.Hex}`,
        secondary: `#${defaultColorSlot.SecondaryColor.Hex}`,
        source: 'BP_BuildableSubsystem.mColorSlots_Data[0]',
      };
    }
    if (isEmissiveAccent) output.emissiveAccent.push(materialName);
  }

  scene.materials = output;
  scene.materialChecks = bindings.length
    ? [{ id: 'cue4parse-game-texture-bindings', status: 'present', bindings }]
    : [{ id: 'cue4parse-game-texture-bindings', status: 'missing', bindings: [] }];
  const bindingByName = new Map(bindings.map((binding) => [binding.material.toLocaleLowerCase('en-US'), binding]));
  const unresolved = materialNames.filter((materialName) => {
    const binding = bindingByName.get(materialName.toLocaleLowerCase('en-US'));
    return !binding || !binding.productEligibleIsometric;
  });
  scene.isometricMaterialEvidence = {
    productEligible: materialNames.length > 0 && unresolved.length === 0,
    unresolved,
    bindings,
    exportRoots: exportRoots.map((path) => relative(root, path).replaceAll('\\', '/')),
  };
  return { scene, bindings, materialNames };
}
