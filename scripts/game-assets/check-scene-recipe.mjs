/**
 * 수기 렌더 장면 레시피가 전수 게임 자산에서 생성한 Blueprint 계약과 일치하는지 검증한다.
 * 사용: node scripts/game-assets/check-scene-recipe.mjs
 * 종료: 성공 0, 자동 계약/레시피 누락 또는 변환 불일치 2.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const sceneDirectory = resolve(root, 'scripts/topview/scenes');
const listScenePaths = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = resolve(directory, entry.name);
  return entry.isDirectory()
    ? listScenePaths(absolute)
    : entry.name.endsWith('.json') ? [relative(root, absolute).replaceAll('\\', '/')] : [];
});
const scenePaths = listScenePaths(sceneDirectory);
const sceneContracts = JSON.parse(
  readFileSync(resolve(root, '.cache/game-asset-index/factory-scenes.json'), 'utf8')
);
const componentAliases = new Map([
  [
    'Build_SmelterMk1_C.FGColoredInstanceMeshProxy',
    'FGColoredInstanceMeshProxy_GEN_VARIABLE'
  ]
]);
const errors = [];
const tolerance = 1e-5;
const angleToleranceDeg = 2e-3;

function assetBasename(reference) {
  return basename(reference ?? '')
    .replace(/\.glb$/i, '')
    .replace(/\.\d+$/, '');
}

function blueprintTransform(component, configured) {
  const basisCorrectionDeg = configured.assetBasisCorrectionDeg
    ?? configured.vatPose?.basisCorrectionDeg
    ?? 0;
  return [
    component.transform.locationCm.x / 100,
    -component.transform.locationCm.y / 100,
    component.transform.locationCm.z / 100,
    -component.transform.rotationDeg.yaw + basisCorrectionDeg
  ];
}

function angularDistanceDeg(left, right) {
  return Math.abs((((left - right) + 180) % 360 + 360) % 360 - 180);
}

function transformMatches(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value, index) => index === 3
      ? angularDistanceDeg(value, actual[index]) <= angleToleranceDeg
      : Math.abs(value - actual[index]) <= tolerance);
}

function rotationEulerMatches(actual, component) {
  if (actual === undefined) return true;
  const expected = [
    component.transform.rotationDeg.roll,
    -component.transform.rotationDeg.pitch,
    -component.transform.rotationDeg.yaw,
  ];
  return Array.isArray(actual)
    && actual.length === 3
    && expected.every((value, index) => angularDistanceDeg(value, actual[index]) <= angleToleranceDeg);
}

for (const scenePath of scenePaths) {
  const recipe = JSON.parse(readFileSync(resolve(root, scenePath), 'utf8'));
  if (scenePath.includes('/generated/')) {
    const gameTextureCheck = recipe.materialChecks?.find((check) => check.id === 'cue4parse-game-texture-bindings');
    const albedoCount = Object.keys(recipe.materials?.albedo ?? {}).length;
    const pbrCount = recipe.materials?.pbr?.length ?? 0;
    if (gameTextureCheck?.status !== 'present' || albedoCount === 0 || pbrCount === 0) {
      errors.push(`${recipe.id}: 게임 재질 텍스처 연결 누락`);
    }
  }
  if (recipe.buildingClass === 'Build_TradingPost_C') {
    const bodyComponents = recipe.components.filter((component) => component.renderMode === 'body');
    const excluded = bodyComponents.filter((component) =>
      /\/Events\/|\/World\/Environment\/Foliage\//i.test(component.path)
      || /BuildEffectOnly/i.test(component.id));
    if (excluded.length) errors.push(`${recipe.id}: 기본 HUB에 이벤트·장식·건설효과 구성품 ${excluded.length}개 포함`);
    if (bodyComponents.length !== 2
      || !bodyComponents.some((component) => /SK_Tradingpost\.glb$/i.test(component.path))
      || !bodyComponents.some((component) => /SM_Hub_Stg_06\.glb$/i.test(component.path))) {
      errors.push(`${recipe.id}: 완성 HUB는 SK_Tradingpost + SM_Hub_Stg_06 두 본체만 사용해야 함`);
    }
  }
  const contract = sceneContracts.contracts.find(
    (entry) => entry.buildingClass === recipe.buildingClass
  );
  if (!contract) {
    errors.push(`${recipe.id}: 자동 장면 계약 누락 ${recipe.buildingClass}`);
    continue;
  }

  const configuredComponents = recipe.components.filter(
    (component) => component.source?.startsWith(`${recipe.buildingClass}.`)
  );
  for (const configured of configuredComponents) {
    const componentId = componentAliases.get(configured.source)
      ?? configured.source.slice(recipe.buildingClass.length + 1);
    const component = contract.components.find((entry) => entry.id === componentId);
    if (!component) {
      errors.push(`${recipe.id}/${configured.id}: 자동 계약 구성품 누락 ${componentId}`);
      continue;
    }

    const expectedTransform = blueprintTransform(component, configured);
    if (!transformMatches(configured.transform, expectedTransform)) {
      errors.push(`${recipe.id}/${configured.id}: 게임 CDO→Blender 변환 불일치`);
    }
    if (!rotationEulerMatches(configured.rotationEulerDeg, component)) {
      errors.push(`${recipe.id}/${configured.id}: 게임 CDO→Blender pitch/roll 변환 불일치`);
    }

    const directMesh = component.staticMesh ?? component.skeletalMesh;
    if (directMesh && assetBasename(configured.path) !== assetBasename(directMesh)) {
      errors.push(`${recipe.id}/${configured.id}: Blueprint 메시 basename 불일치`);
    }

    if (configured.renderMode === 'production-indicator') {
      const indirectMeshes = component.indirectBlueprint?.meshReferences ?? [];
      const expectedIndicator = 'SM_ProductionLight_01';
      if (
        assetBasename(configured.path) !== expectedIndicator
        || !indirectMeshes.some((reference) => assetBasename(reference) === expectedIndicator)
      ) {
        errors.push(`${recipe.id}/${configured.id}: 생산 표시등 간접 Blueprint 메시 불일치`);
      }
    }
  }
}

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}
process.stdout.write(
  `PASS  탑뷰 장면 ${scenePaths.length}개의 현재 Blueprint 메시·transform·생산 표시등 계약 일치\n`
);
