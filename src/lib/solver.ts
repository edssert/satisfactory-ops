/**
 * solver.ts — 생산 체인 해결기.
 *
 * v1 범위: 비순환(DAG) 체인을 유리수로 정확히 푼다. 순환 레시피는 감지 후 **거부**한다.
 * 틀린 숫자보다 거절이 낫다 — 결정 근거: docs/adr/0013-production-solver.md
 *
 * DOM을 모른다. 빌드타임(Astro 페이지)과 브라우저(아일랜드)에서 같은 코드를 쓴다.
 */

import { add, ceil, div, format, fromNumber, mul, toNumber, type Rational } from './rational.ts';

export interface SolverRecipe {
  id: string;
  ko: string;
  en: string;
  durationSec: number;
  ingredients: { item: string; amount: number; perMinute: number }[];
  products: { item: string; amount: number; perMinute: number }[];
  producedIn: string[];
}

export interface SolverMachine {
  id: string;
  ko: string;
  en: string;
  powerMW: number | null;
}

/** 솔버가 세계를 보는 창. 전체 데이터든 40개짜리 서브셋이든 이 인터페이스만 만족하면 된다. */
export interface RecipeBook {
  /** 이 아이템을 만들 때 쓸 레시피. undefined면 원자재로 취급한다. */
  recipeFor(itemId: string): SolverRecipe | undefined;
  machine(buildingId: string): SolverMachine | undefined;
  nameOf(itemId: string): { ko: string; en: string };
}

export interface SolveNode {
  itemId: string;
  ko: string;
  en: string;
  /** 이 노드가 공급해야 하는 분당 수량 */
  rate: Rational;
  recipeId: string | null;
  recipeKo: string | null;
  machineId: string | null;
  machineKo: string | null;
  /** 소수 대수. 그대로 지으면 안 되는 값이라는 것이 이 앱의 메시지다. */
  machines: Rational | null;
  powerMW: number | null;
  depth: number;
  children: SolveNode[];
  /** 부산물 (이 레시피가 목표 외에 함께 뱉는 것) */
  byproducts: { itemId: string; ko: string; rate: Rational }[];
}

export interface SolveOk {
  ok: true;
  root: SolveNode;
  /** 원자재 소요 — 아이템 id → 분당 수량 */
  raw: { itemId: string; ko: string; en: string; rate: Rational }[];
  /** 기계 총계 — 건물 id → 소수 대수 */
  machines: { buildingId: string; ko: string; en: string; count: Rational; powerMW: number | null }[];
  totalPowerMW: number;
}

export interface SolveFail {
  ok: false;
  reason: 'cycle' | 'unknown-item' | 'no-recipe';
  /** 순환에 참여한 아이템 id들 (reason === 'cycle') */
  cycle?: string[];
  message: string;
}

export type SolveResult = SolveOk | SolveFail;

const MAX_NODES = 5000;

export function solve(targetItemId: string, ratePerMinute: number, book: RecipeBook): SolveResult {
  const target = book.nameOf(targetItemId);
  if (!target) {
    return { ok: false, reason: 'unknown-item', message: `모르는 아이템입니다: ${targetItemId}` };
  }

  const rawTotals = new Map<string, Rational>();
  const machineTotals = new Map<string, Rational>();
  const path: string[] = [];
  let nodeCount = 0;
  let failure: SolveFail | null = null;

  function visit(itemId: string, rate: Rational, depth: number): SolveNode {
    nodeCount++;
    const name = book.nameOf(itemId);
    const node: SolveNode = {
      itemId,
      ko: name.ko,
      en: name.en,
      rate,
      recipeId: null,
      recipeKo: null,
      machineId: null,
      machineKo: null,
      machines: null,
      powerMW: null,
      depth,
      children: [],
      byproducts: [],
    };

    if (failure || nodeCount > MAX_NODES) return node;

    const r = book.recipeFor(itemId);
    if (!r) {
      // 원자재 — 재귀 종료
      rawTotals.set(itemId, add(rawTotals.get(itemId) ?? fromNumber(0), rate));
      return node;
    }

    if (path.includes(itemId)) {
      const start = path.indexOf(itemId);
      failure = {
        ok: false,
        reason: 'cycle',
        cycle: [...path.slice(start), itemId],
        message:
          '이 체인은 순환 레시피를 포함해 정확한 해를 계산할 수 없습니다. ' +
          '해당 대체 레시피를 끄면 계산됩니다.',
      };
      return node;
    }

    const product = r.products.find((p) => p.item === itemId);
    if (!product || product.perMinute <= 0) {
      failure = {
        ok: false,
        reason: 'no-recipe',
        message: `${name.ko} 을(를) 산출하지 않는 레시피가 선택되었습니다: ${r.id}`,
      };
      return node;
    }

    // 필요한 레시피 실행 배수 = 목표 분당수량 / 레시피 1대당 분당 산출
    const runs = div(rate, fromNumber(product.perMinute));

    node.recipeId = r.id;
    node.recipeKo = r.ko;
    node.machines = runs;

    const machineId = r.producedIn[0] ?? null;
    if (machineId) {
      const m = book.machine(machineId);
      node.machineId = machineId;
      node.machineKo = m?.ko ?? machineId;
      node.powerMW = m?.powerMW ?? null;
      machineTotals.set(machineId, add(machineTotals.get(machineId) ?? fromNumber(0), runs));
    }

    for (const p of r.products) {
      if (p.item === itemId) continue;
      node.byproducts.push({
        itemId: p.item,
        ko: book.nameOf(p.item).ko,
        rate: mul(runs, fromNumber(p.perMinute)),
      });
    }

    path.push(itemId);
    for (const ing of r.ingredients) {
      const childRate = mul(runs, fromNumber(ing.perMinute));
      node.children.push(visit(ing.item, childRate, depth + 1));
      if (failure) break;
    }
    path.pop();

    return node;
  }

  const root = visit(targetItemId, fromNumber(ratePerMinute), 0);
  if (failure) return failure;
  if (nodeCount > MAX_NODES) {
    return { ok: false, reason: 'cycle', message: '체인이 너무 큽니다 (노드 5000개 초과).' };
  }

  const machines = [...machineTotals.entries()].map(([buildingId, count]) => {
    const m = book.machine(buildingId);
    return {
      buildingId,
      ko: m?.ko ?? buildingId,
      en: m?.en ?? buildingId,
      count,
      powerMW: m?.powerMW ?? null,
    };
  });

  // 전력은 "지어야 하는 대수"(올림) 기준으로 잡는다. 언더클럭은 별도 조언에서 다룬다.
  const totalPowerMW = machines.reduce(
    (sum, m) => sum + (m.powerMW ? m.powerMW * ceil(m.count) : 0),
    0
  );

  const raw = [...rawTotals.entries()]
    .map(([itemId, rate]) => ({ itemId, ...book.nameOf(itemId), rate }))
    .sort((a, b) => toNumber(b.rate) - toNumber(a.rate));

  return { ok: true, root, raw, machines, totalPowerMW };
}

/**
 * 소수 대수에 대한 조언 — 이 앱의 차별점.
 * "3.75대"를 보여주고 끝내지 않고, 4대로 지었을 때의 유휴율과 대안을 계산한다.
 */
export function machineAdvice(count: Rational): { built: number; idlePercent: number; clock: number } {
  const built = ceil(count);
  const exact = toNumber(count);
  const idlePercent = built === 0 ? 0 : Math.round((1 - exact / built) * 1000) / 10;
  // 한 대 적게 짓고 오버클럭할 때 필요한 클럭(%)
  const fewer = Math.max(1, built - 1);
  const clock = Math.round((exact / fewer) * 1000) / 10;
  return { built, idlePercent, clock };
}

export const fmt = format;
