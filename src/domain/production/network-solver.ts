export interface NetworkGoal { itemId: string; rate: number }
export interface NetworkPart { itemId: string; rate: number }
export interface NetworkRecipe {
  id: string;
  primaryItemId: string;
  outputPerMinute: number;
  machineId: string;
  ingredients: NetworkPart[];
  products: NetworkPart[];
}

export interface NetworkNode {
  itemId: string;
  recipe: NetworkRecipe;
  runs: number;
  grossRate: number;
  depth: number;
  inputs: NetworkPart[];
  byproducts: NetworkPart[];
}

export type NetworkSolution = {
  ok: true;
  nodes: NetworkNode[];
  raw: NetworkPart[];
  cyclic: boolean;
} | {
  ok: false;
  reason: 'singular' | 'negative' | 'too-large';
  message: string;
};

const EPSILON = 1e-8;

function gaussian(matrix: number[][], values: number[]): number[] | null {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) <= EPSILON) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (Math.abs(factor) <= EPSILON) continue;
      for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row) => Math.abs(row[size]) <= EPSILON ? 0 : row[size]);
}

export function solveProductionNetwork(
  goals: NetworkGoal[],
  recipeFor: (itemId: string) => NetworkRecipe | undefined,
  supplied: ReadonlySet<string> = new Set(),
): NetworkSolution {
  const recipeByItem = new Map<string, NetworkRecipe>();
  const depthByItem = new Map<string, number>();
  const queue = goals.filter((goal) => goal.rate > 0).map((goal) => ({ itemId: goal.itemId, depth: 0 }));
  while (queue.length) {
    const current = queue.shift()!;
    const previousDepth = depthByItem.get(current.itemId);
    if (previousDepth === undefined || current.depth < previousDepth) depthByItem.set(current.itemId, current.depth);
    if (supplied.has(current.itemId) || recipeByItem.has(current.itemId)) continue;
    const recipe = recipeFor(current.itemId);
    if (!recipe) continue;
    recipeByItem.set(current.itemId, recipe);
    if (recipeByItem.size > 5000) return { ok: false, reason: 'too-large', message: '생산망이 5000개 제작 항목을 넘습니다.' };
    for (const ingredient of recipe.ingredients) queue.push({ itemId: ingredient.itemId, depth: current.depth + 1 });
  }

  const itemIds = [...recipeByItem.keys()];
  const indexByItem = new Map(itemIds.map((itemId, index) => [itemId, index]));
  const matrix = Array.from({ length: itemIds.length }, () => Array(itemIds.length).fill(0));
  const values = Array(itemIds.length).fill(0);
  for (const goal of goals) {
    const row = indexByItem.get(goal.itemId);
    if (row !== undefined) values[row] += goal.rate;
  }
  for (const [itemId, recipe] of recipeByItem) {
    const column = indexByItem.get(itemId)!;
    for (const product of recipe.products) {
      const row = indexByItem.get(product.itemId);
      if (row !== undefined) matrix[row][column] += product.rate;
    }
    for (const ingredient of recipe.ingredients) {
      const row = indexByItem.get(ingredient.itemId);
      if (row !== undefined) matrix[row][column] -= ingredient.rate;
    }
  }

  const runs = itemIds.length ? gaussian(matrix, values) : [];
  if (!runs) return { ok: false, reason: 'singular', message: '선택한 순환 제작법의 생산 방정식에 유일한 해가 없습니다.' };
  if (runs.some((value) => value < -EPSILON)) {
    return { ok: false, reason: 'negative', message: '선택한 제작법 조합은 목표를 만들기 위해 음수 가동이 필요합니다.' };
  }

  const raw = new Map<string, number>();
  for (const goal of goals) {
    if (!indexByItem.has(goal.itemId)) raw.set(goal.itemId, (raw.get(goal.itemId) ?? 0) + goal.rate);
  }
  const nodes = itemIds.map((itemId, index) => {
    const recipe = recipeByItem.get(itemId)!;
    const scale = Math.max(0, runs[index]);
    for (const ingredient of recipe.ingredients) {
      if (!indexByItem.has(ingredient.itemId)) {
        raw.set(ingredient.itemId, (raw.get(ingredient.itemId) ?? 0) + ingredient.rate * scale);
      }
    }
    return {
      itemId,
      recipe,
      runs: scale,
      grossRate: recipe.outputPerMinute * scale,
      depth: depthByItem.get(itemId) ?? 0,
      inputs: recipe.ingredients.map((part) => ({ ...part, rate: part.rate * scale })),
      byproducts: recipe.products
        .filter((part) => part.itemId !== itemId)
        .map((part) => ({ ...part, rate: part.rate * scale })),
    };
  }).sort((left, right) => left.depth - right.depth || left.itemId.localeCompare(right.itemId, 'en'));

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cyclic = false;
  const detect = (itemId: string) => {
    if (visiting.has(itemId)) { cyclic = true; return; }
    if (visited.has(itemId)) return;
    visiting.add(itemId);
    for (const ingredient of recipeByItem.get(itemId)?.ingredients ?? []) {
      if (recipeByItem.has(ingredient.itemId)) detect(ingredient.itemId);
    }
    visiting.delete(itemId);
    visited.add(itemId);
  };
  itemIds.forEach(detect);
  return {
    ok: true,
    nodes,
    raw: [...raw].map(([itemId, rate]) => ({ itemId, rate })).filter((part) => part.rate > EPSILON),
    cyclic,
  };
}
