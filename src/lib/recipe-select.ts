/**
 * recipe-select.ts — "이 아이템은 어떤 레시피로 만드는가"의 기본값 규칙.
 *
 * JSON을 import하지 않는 순수 모듈이다. 그래야 Node 테스트에서 그대로 돌릴 수 있다.
 *
 * 이 파일의 규칙은 전부 실제로 난 버그에서 나왔다:
 *  - 원광 변환기 레시피를 생산 경로로 봐서 "철 광석 → 석회석 → 황 → 석탄 → 철 광석" 순환
 *  - 개봉(Unpackage) 레시피를 기본값으로 골라 "로켓 연료 → 포장된 로켓 연료" 순환
 *  - 부산물로 나오는 레시피를 기본값으로 골라 압축 석탄을 로켓 연료 라인에서 뽑으려 함
 */

import type { Recipe, Item, Building } from './types.ts';
import type { RecipeBook } from './solver.ts';

/** 개봉은 생산이 아니라 되돌리기다. 기본 경로로 쓰면 포장/개봉 순환이 생긴다. */
export const isUnpackaging = (r: Pick<Recipe, 'id'>): boolean => /^Recipe_Unpackage/i.test(r.id);

/**
 * 계산기가 쓸 레시피만 남긴다.
 *
 * 원광을 산출하는 레시피(광석 변환기)는 제외한다 — 원광은 캐는 것이지 만드는 것이 아니다.
 * 변환은 후반 최적화 수단이라 별도 기능으로 다룬다.
 */
export function selectCalculatorRecipes(
  all: Recipe[],
  isRawResource: (itemId: string) => boolean
): Recipe[] {
  return all.filter(
    (r) =>
      !r.isBuildingRecipe &&
      r.producedIn.length > 0 &&
      !r.products.some((p) => isRawResource(p.item))
  );
}

/**
 * 아이템 → 그 아이템을 만드는 레시피 id 목록. **맨 앞이 기본 선택이다.**
 *
 * 우선순위 (작을수록 먼저):
 *  1. 개봉 레시피가 아닐 것
 *  2. 이 아이템이 부산물이 아니라 주 산출물일 것
 *  3. 대체 레시피가 아닐 것
 *  4. 산출물이 하나일 것
 *  5. 원래 순서
 */
export function producerIndex(list: Recipe[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of list) for (const p of r.products) (out[p.item] ??= []).push(r.id);

  const byId = new Map(list.map((r, i) => [r.id, { r, i }]));
  const rankFor = (itemId: string, recipeId: string): number[] => {
    const { r, i } = byId.get(recipeId)!;
    return [
      isUnpackaging(r) ? 1 : 0,
      r.products[0]?.item === itemId ? 0 : 1,
      r.isAlternate ? 1 : 0,
      r.products.length > 1 ? 1 : 0,
      i,
    ];
  };

  for (const key of Object.keys(out)) {
    out[key]!.sort((a, b) => {
      const ra = rankFor(key, a);
      const rb = rankFor(key, b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
      return 0;
    });
  }
  return out;
}

/**
 * 솔버가 쓸 레시피 장부를 만든다.
 *
 * 화면과 테스트가 **같은 규칙**을 쓰게 하려고 여기 둔다. 페이지 쪽에서 따로 조립하면
 * 테스트가 통과해도 화면은 다른 레시피를 골라 버린다 — 그런 어긋남이 실제로 있었다.
 */
export function makeRecipeBook(items: Item[], recipes: Recipe[], buildings: Building[]): RecipeBook {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const buildingById = new Map(buildings.map((b) => [b.id, b]));
  const producersOf = new Map<string, Recipe[]>();
  for (const r of recipes) {
    if (r.isBuildingRecipe || r.producedIn.length === 0) continue;
    for (const p of r.products) {
      const list = producersOf.get(p.item) ?? [];
      list.push(r);
      producersOf.set(p.item, list);
    }
  }
  const isRaw = (itemId: string): boolean => {
    const it = itemById.get(itemId);
    if (!it) return true;
    if (it.kind === 'resource') return true;
    return !pick(itemId);
  };
  const selected = selectCalculatorRecipes(recipes, (id) => itemById.get(id)?.kind === 'resource');
  const index = producerIndex(selected);
  const byId = new Map(selected.map((r) => [r.id, r]));
  function pick(itemId: string): Recipe | undefined {
    const first = index[itemId]?.[0];
    return first ? byId.get(first) : undefined;
  }
  return {
    recipeFor: (id) => pick(id),
    machine: (id) => {
      const b = buildingById.get(id);
      return b ? { id, ko: b.ko, en: b.en, powerMW: b.powerMW ?? null } : undefined;
    },
    nameOf: (id) => {
      const it = itemById.get(id);
      return it ? { ko: it.ko, en: it.en } : { ko: id, en: id };
    },
    isRawResource: isRaw,
  } as RecipeBook & { isRawResource: (id: string) => boolean };
}
