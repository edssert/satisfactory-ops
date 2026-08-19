/**
 * gamedata.ts — 게임 데이터 접근 계층.
 *
 * 이 모듈은 빌드타임(Astro 페이지)에서 쓰인다. 브라우저로 데이터를 통째로 내려보내지 않는다.
 * 아일랜드가 필요한 데이터는 페이지가 서브셋을 만들어 props로 넘긴다 (ADR-0012).
 */

import itemsJson from '../data/app/items.json';
import recipesJson from '../data/app/recipes.json';
import buildingsJson from '../data/app/buildings.json';
import milestonesJson from '../data/app/milestones.json';
import indexJson from '../data/app/index.json';
import metaJson from '../data/app/meta.json';
import type { AppMeta, Building, DataIndex, Item, Milestone, Recipe } from './types.ts';
import { producerIndex, selectCalculatorRecipes } from './recipe-select.ts';

export const items = itemsJson as Item[];
export const recipes = recipesJson as Recipe[];
export const buildings = buildingsJson as Building[];
export const milestones = milestonesJson as Milestone[];
export const index = indexJson as unknown as DataIndex;
export const meta = metaJson as unknown as AppMeta;

const itemById = new Map(items.map((x) => [x.id, x]));
const recipeById = new Map(recipes.map((x) => [x.id, x]));
const buildingById = new Map(buildings.map((x) => [x.id, x]));
const milestoneById = new Map(milestones.map((x) => [x.id, x]));

/** 없는 id는 조용히 넘기지 않는다 — 데이터 드리프트를 빌드에서 잡기 위해 던진다. */
function must<T>(map: Map<string, T>, id: string, kind: string): T {
  const hit = map.get(id);
  if (!hit) throw new Error(`${kind} 없음: ${id} — 게임 데이터가 바뀌었거나 참조가 틀렸습니다.`);
  return hit;
}

export const item = (id: string): Item => must(itemById, id, '아이템');
export const recipe = (id: string): Recipe => must(recipeById, id, '레시피');
export const building = (id: string): Building => must(buildingById, id, '건물');
export const milestone = (id: string): Milestone => must(milestoneById, id, '마일스톤');

export const findItem = (id: string): Item | undefined => itemById.get(id);
export const findRecipe = (id: string): Recipe | undefined => recipeById.get(id);
export const findBuilding = (id: string): Building | undefined => buildingById.get(id);

/** 한글(영문) 병기 — 첫 등장 1회. ADR-0004 / ADR-0017 */
export const nameOf = (id: string): { ko: string; en: string } => {
  const i = itemById.get(id) ?? recipeById.get(id) ?? buildingById.get(id) ?? milestoneById.get(id);
  if (!i) throw new Error(`이름을 찾을 수 없음: ${id}`);
  return { ko: i.ko, en: i.en };
};

/** 이 아이템을 산출하는 레시피들. */
export const producersOf = (itemId: string): Recipe[] =>
  (index.producedBy[itemId] ?? []).map((id) => recipe(id));

/** 이 아이템을 재료로 쓰는 레시피들. */
export const consumersOf = (itemId: string): Recipe[] =>
  (index.consumedBy[itemId] ?? []).map((id) => recipe(id));

/** 기본 레시피 — 대체가 아니고, 기계에서 돌고, 건물 레시피가 아닌 것. */
export function defaultRecipeOf(itemId: string): Recipe | undefined {
  const candidates = producersOf(itemId).filter(
    (r) => !r.isAlternate && !r.isBuildingRecipe && r.producedIn.length > 0
  );
  if (candidates.length === 0) return undefined;
  // 산출물이 하나인 레시피를 우선한다 (부산물 있는 레시피는 기본값으로 부적절)
  const single = candidates.filter((r) => r.products.length === 1);
  return (single[0] ?? candidates[0]) as Recipe;
}

/** 채굴로만 얻는 원자재인가. 솔버의 재귀 종료 조건. */
export const isRawResource = (itemId: string): boolean => {
  const it = itemById.get(itemId);
  if (!it) return true;
  if (it.kind === 'resource') return true;
  return !defaultRecipeOf(itemId);
};

/** 티어별 마일스톤 (게임 메뉴 순서). */
export function milestonesByTier(): { tier: number; list: Milestone[] }[] {
  return Object.keys(index.tiers)
    .map(Number)
    .sort((a, b) => a - b)
    .map((tier) => ({ tier, list: index.tiers[String(tier)]!.map((id) => milestone(id)) }));
}

/** 이 레시피가 처음 열리는 티어. 모르면 null. */
export const unlockTierOf = (recipeId: string): number | null => index.unlockTier[recipeId] ?? null;

/** 벨트/파이프 티어별 처리량 — 화면에서 상한 검사에 쓴다 (ADR-0016). */
export function logistics(): { belts: Building[]; pipes: Building[] } {
  const belts = buildings
    .filter((b) => b.beltItemsPerMinute != null)
    .sort((a, b) => (a.beltItemsPerMinute ?? 0) - (b.beltItemsPerMinute ?? 0));
  const pipes = buildings
    .filter((b) => b.pipeFlowM3PerMinute != null)
    .sort((a, b) => (a.pipeFlowM3PerMinute ?? 0) - (b.pipeFlowM3PerMinute ?? 0));
  return { belts, pipes };
}

/** 계산기가 쓸 레시피 집합 — 규칙과 근거는 recipe-select.ts 참조. */
export const calculatorRecipes = (): Recipe[] =>
  selectCalculatorRecipes(recipes, (id) => itemById.get(id)?.kind === 'resource');

/** 아이템 → 기본 레시피가 맨 앞인 레시피 목록. */
export const producerIndexOf = (list: Recipe[]): Record<string, string[]> => producerIndex(list);
