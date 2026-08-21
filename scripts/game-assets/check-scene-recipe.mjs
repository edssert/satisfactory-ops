/**
 * 수기 렌더 장면 레시피가 전수 게임 자산에서 생성한 Blueprint 계약과 일치하는지 검증한다.
 * 사용: node scripts/game-assets/check-scene-recipe.mjs
 * 종료: 성공 0, 자동 계약/레시피 누락 또는 변환 불일치 2.
 */

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const scenes = JSON.parse(readFileSync(resolve(root, '.cache/game-asset-index/factory-scenes.json'), 'utf8'));
const recipe = JSON.parse(readFileSync(resolve(root, 'scripts/topview/scenes/smelter-current.json'), 'utf8'));
const contract = scenes.contracts.find((entry) => entry.buildingClass === recipe.buildingClass);
const errors = [];
if (!contract) errors.push(`자동 장면 계약 누락 ${recipe.buildingClass}`);

const expectations = [
  { recipeId: 'static-frame', componentId: 'FGColoredInstanceMeshProxy_GEN_VARIABLE', mesh: 'SmelterMk1_static.glb', transform: [5.478708e-8, 0.3, 0, 179.99995] },
  { recipeId: 'current-vat-idle-body', componentId: 'FGVertexAnimatedMesh_GEN_VARIABLE', mesh: 'SM_VAT_Smelter_01.glb', transform: [0, -0.000004880058, 0.05, 180.00004438202] },
  { recipeId: 'ladder-interaction', componentId: 'BP_LadderComponent_GEN_VARIABLE', mesh: null, transform: [-1.8999951, 3.2000027, 2.65, 0.00062069343] }
];

for (const expectation of expectations) {
  const component = contract?.components.find((entry) => entry.id === expectation.componentId);
  const configured = recipe.components.find((entry) => entry.id === expectation.recipeId);
  if (!component) errors.push(`자동 계약 구성품 누락 ${expectation.componentId}`);
  if (!configured) errors.push(`렌더 레시피 구성품 누락 ${expectation.recipeId}`);
  if (expectation.mesh && basename(configured?.path ?? '') !== expectation.mesh) errors.push(`${expectation.recipeId}: 메시 불일치`);
  if (configured && expectation.transform.some((value, index) => Math.abs(value - configured.transform[index]) > 1e-5)) {
    errors.push(`${expectation.recipeId}: 게임 CDO→Blender 변환 불일치`);
  }
}

const indicatorContract = contract?.components.find((entry) => entry.id === 'BP_ProductionIndicatorInstanced_GEN_VARIABLE');
const indicatorRecipe = recipe.components.find((entry) => entry.id === 'production-indicator');
if (!indicatorContract?.indirectBlueprint?.meshReferences.some((entry) => entry.includes('SM_ProductionLight_01')) ||
    basename(indicatorRecipe?.path ?? '') !== 'SM_ProductionLight_01.glb') {
  errors.push('생산 표시등 간접 Blueprint 메시 불일치');
}
if (!recipe.canonicalOrientation?.authority?.includes('smelter-current-top') || recipe.camera?.displayYawDeg !== 0) {
  errors.push('인게임 대조군 기반 canonical orientation 불일치');
}
const expectedIndicatorTransform = [-1.00342896, 4.1428882, 2.849815, 0];
if (indicatorRecipe && expectedIndicatorTransform.some((value, index) => Math.abs(value - indicatorRecipe.transform[index]) > 1e-5)) {
  errors.push('생산 표시등 CDO→Blender 축 변환 불일치');
}

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`ERROR ${error}\n`));
  process.exit(2);
}
process.stdout.write('PASS  제련기 렌더 레시피가 자동 Blueprint 계약의 정적/VAT/사다리/표시등과 일치\n');
