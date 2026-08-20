/**
 * planner-solve.ts — 설계판의 계산. 그리기(FactoryPlanner.tsx)와 분리한다.
 *
 * 화면에서 떼어 낸 이유는 하나다. 사람이 이 숫자를 보고 실제로 공장을 짓는다.
 * 화면 안에 있으면 검증을 못 하므로 여기 두고 `tests/planner.test.ts` 로 잠근다.
 *
 * 모델:
 *   - 한 묶음(노드)은 같은 레시피를 도는 기계 N 대다. 대수와 클럭이 처리량을 정한다.
 *   - 공급이 모자라면 그만큼 **가동률**이 떨어진다. 게임에서도 재료가 안 오면 기계가 쉰다.
 *   - 한 산출구가 여러 곳으로 갈리면 각 목적지가 필요로 하는 양에 비례해 나눈다.
 *     매니폴드가 정상 상태에서 하는 일이 이것이다.
 *   - 안 이은 투입구는 밖에서 대 준다고 본다. 요약에 "넣어야 할 것"으로 뜬다.
 *   - 분배기·병합기는 **그냥 지나가는 것**이다. 받은 만큼 내보내되 벨트 등급이 상한이다.
 */

/* ------------------------------------------------------------------ 게임 데이터 */

export interface PMachine {
  i: string;
  k: string;
  t: number | null;
  /** 소비 MW. 가변 건물은 상한 */
  p: number | null;
  v?: 1;
  /** 채굴량 @보통 순도 */
  e?: number;
  /** 캘 수 있는 자원 */
  res?: string[];
  /** 발전 MW */
  gen?: number;
  /** 보조물 비율. 보조물/분 = 발전MW × 비율 × 60 / 1000 */
  sr?: number | null;
  f?: { f: string; s: string | null; b: string | null; ba: number | null }[];
  /** 분배기·병합기인가. 나르는 물건이 정해져 있지 않고 지나가기만 한다 */
  lg?: 'split' | 'merge';
  /** 바닥 크기(m). 게임의 충돌 박스에서 나온 실제 치수다 */
  fw?: number;
  fl?: number;
  /** 이 기계로 돌릴 수 있는 레시피 수 */
  n: number;
}

export interface PRecipe {
  i: string;
  k: string;
  m: string;
  a?: 1;
  /** 재료 [아이템, 분당] */
  g: [string, number][];
  /** 산출 [아이템, 분당] */
  o: [string, number][];
}

export interface PItem {
  i: string;
  k: string;
  fl?: 1;
  /** 연료 열량. 발전기가 분당 몇 개를 태우는지가 여기서 나온다 */
  mj?: number;
}

/** 벨트·리프트 등급 */
export interface PBelt {
  i: string;
  k: string;
  /** 분당 처리량 */
  r: number;
  t: number | null;
  /** 리프트인가 */
  lift?: 1;
}

/* ------------------------------------------------------------------ 계획 */

export type NodeKind = 'recipe' | 'extract' | 'generator' | 'logistic';

export interface PlanNode {
  id: number;
  kind: NodeKind;
  /** 레시피 id (recipe) 또는 기계 id (그 밖) */
  ref: string;
  machine: string;
  x: number;
  y: number;
  /** 몇 층에 있는가. 층이 다르면 벨트가 아니라 리프트로 잇는다 */
  floor: number;
  count: number;
  /** 퍼센트 */
  clock: number;
  /** 돌린 각도. 0·90·180·270 만 쓴다 — 게임도 그렇다 */
  rot?: 0 | 90 | 180 | 270;
  resource?: string;
  purity?: number;
  fuel?: string;
  /** 분배기·병합기가 나르는 물건 */
  item?: string;
  /** 분배기·병합기의 벨트 등급 (처리량 상한) */
  belt?: string;
}

export interface PlanEdge {
  id: number;
  from: number;
  to: number;
  item: string;
  /** 이 구간에 깐 벨트·리프트 등급. 없으면 상한을 안 본다 */
  belt?: string;
}

export interface Catalog {
  machine(id: string): PMachine | undefined;
  recipe(id: string): PRecipe | undefined;
  /** 연료 열량(MJ). 없으면 0 */
  energyMJ(id: string): number;
  /** 벨트·리프트 등급의 분당 처리량. 모르면 0 */
  beltRate(id: string | undefined): number;
}

export interface Rates {
  ins: Map<string, number>;
  outs: Map<string, number>;
  /** 소비 MW (100% 가동 기준) */
  power: number;
  /** 발전 MW (100% 가동 기준) */
  gen: number;
}

/**
 * 생산 건물의 전력은 클럭의 이 제곱에 비례한다.
 *
 * 게임 배포 데이터의 `powerExponent` 는 1.6 으로 남아 있지만 이건 낡은 값이다 —
 * Patch 0.7.0.0 에서 1.6 → 1.321928 로 바뀌었고 데이터 필드만 안 고쳐졌다.
 * 그대로 쓰면 오버클럭 전력이 실제보다 크게 나온다. (docs/research/power-scale.md)
 *
 * 발전기는 다르다. 발전기 오버클럭은 선형이다.
 */
export const POWER_EXP = 1.321928;

/** 분배기·병합기에 벨트 등급을 안 정했을 때 쓰는 상한. Mk.6 처리량이다 */
export const DEFAULT_BELT = 1200;

/** 한 묶음이 100% 가동일 때 분당 무엇을 얼마나 먹고 내는가 */
export function nodeRates(n: PlanNode, cat: Catalog): Rates {
  const ins = new Map<string, number>();
  const outs = new Map<string, number>();
  const m = cat.machine(n.machine);
  const scale = n.count * (n.clock / 100);
  let power = 0;
  let gen = 0;

  if (n.kind === 'recipe') {
    const r = cat.recipe(n.ref);
    if (r) {
      for (const [id, v] of r.g) ins.set(id, (ins.get(id) ?? 0) + v * scale);
      for (const [id, v] of r.o) outs.set(id, (outs.get(id) ?? 0) + v * scale);
    }
    power = (m?.p ?? 0) * n.count * Math.pow(n.clock / 100, POWER_EXP);
  } else if (n.kind === 'extract') {
    if (n.resource) outs.set(n.resource, (m?.e ?? 0) * (n.purity ?? 1) * scale);
    power = (m?.p ?? 0) * n.count * Math.pow(n.clock / 100, POWER_EXP);
  } else if (n.kind === 'logistic') {
    /*
     * 분배기·병합기는 만들지 않는다. 받은 만큼 내보낸다.
     * 상한을 벨트 처리량으로 두면 가동률이 곧 "지나간 양 / 벨트 상한"이 되고,
     * 내보내는 양이 정확히 받은 양이 된다. 벨트가 모자라면 거기서 잘린다 — 게임과 같다.
     */
    if (n.item) {
      const cap = (cat.beltRate(n.belt) || DEFAULT_BELT) * n.count;
      ins.set(n.item, cap);
      outs.set(n.item, cap);
    }
  } else {
    const spec = m?.f?.find((f) => f.f === n.fuel);
    const mj = n.fuel ? cat.energyMJ(n.fuel) : 0;
    const genMW = m?.gen ?? 0;
    if (spec && mj > 0) {
      const perMin = (genMW / mj) * 60;
      ins.set(spec.f, perMin * scale);
      /* 석탄 발전기의 물, 원자로의 물. 게임 공식 그대로 MW × 비율 × 60 / 1000 */
      if (spec.s && m?.sr) ins.set(spec.s, ((genMW * m.sr * 60) / 1000) * scale);
      /* 원자로의 핵폐기물. 연료 하나당 나오는 양이다 */
      if (spec.b && spec.ba) outs.set(spec.b, perMin * spec.ba * scale);
    }
    gen = genMW * scale;
  }
  return { ins, outs, power, gen };
}

export interface Solution {
  base: Map<number, Rates>;
  /** 묶음별 가동률 (0~1) */
  ratio: Map<number, number>;
  /** 벨트별 실제 유량 (분당) */
  flow: Map<number, number>;
  /** 밖에서 넣어야 하는 것 */
  feed: Map<string, number>;
  /** 밖으로 나오는 것 */
  yields: Map<string, number>;
  power: number;
  gen: number;
}

export function solve(nodes: PlanNode[], edges: PlanEdge[], cat: Catalog): Solution {
  const base = new Map(nodes.map((n) => [n.id, nodeRates(n, cat)]));
  const ratio = new Map(nodes.map((n) => [n.id, 1]));
  const flow = new Map<number, number>();

  const outEdges = new Map<string, PlanEdge[]>();
  const inEdges = new Map<string, PlanEdge[]>();
  for (const e of edges) {
    const ok = `${e.from}|${e.item}`;
    const ik = `${e.to}|${e.item}`;
    if (!outEdges.has(ok)) outEdges.set(ok, []);
    if (!inEdges.has(ik)) inEdges.set(ik, []);
    outEdges.get(ok)!.push(e);
    inEdges.get(ik)!.push(e);
  }

  /* 지나가기만 하는 묶음(분배기·병합기)은 처음엔 아무것도 안 흘린다 */
  const passthrough = new Set(nodes.filter((n) => n.kind === 'logistic').map((n) => n.id));
  for (const id of passthrough) ratio.set(id, 0);

  /* 되먹임(부산물 재투입)이 있는 배치도 있으므로 수렴할 때까지 돌린다 */
  for (let pass = 0; pass < 80; pass++) {
    flow.clear();
    for (const n of nodes) {
      for (const [item, cap] of base.get(n.id)!.outs) {
        const es = outEdges.get(`${n.id}|${item}`);
        if (!es) continue;
        const avail = cap * (ratio.get(n.id) ?? 0);
        const needs = es.map((e) => base.get(e.to)?.ins.get(item) ?? 0);
        const total = needs.reduce((a, b) => a + b, 0);
        es.forEach((e, i) => {
          const want = total > 0 ? Math.min(needs[i]!, (avail * needs[i]!) / total) : 0;
          /* 그 구간에 깐 벨트가 못 넘기는 양은 못 흐른다 */
          const cap2 = cat.beltRate(e.belt);
          flow.set(e.id, cap2 > 0 ? Math.min(want, cap2) : want);
        });
      }
    }
    let moved = false;
    for (const n of nodes) {
      let r = 1;
      for (const [item, need] of base.get(n.id)!.ins) {
        const inc = inEdges.get(`${n.id}|${item}`);
        if (!inc || need <= 0) {
          /* 지나가는 묶음은 위에서 아무것도 안 오면 아무것도 못 내보낸다 */
          if (passthrough.has(n.id)) r = 0;
          continue;
        }
        const got = inc.reduce((a, e) => a + (flow.get(e.id) ?? 0), 0);
        r = Math.min(r, got / need);
      }
      if (Math.abs(r - (ratio.get(n.id) ?? 1)) > 1e-9) moved = true;
      ratio.set(n.id, r);
    }
    if (!moved) break;
  }

  const feed = new Map<string, number>();
  const yields = new Map<string, number>();
  let power = 0;
  let gen = 0;
  for (const n of nodes) {
    const b = base.get(n.id)!;
    const r = ratio.get(n.id) ?? 0;
    power += b.power * r;
    gen += b.gen * r;
    for (const [item, need] of b.ins) {
      /* 지나가는 묶음은 "모자란다"는 개념이 없다. 오는 만큼만 지나간다 */
      if (passthrough.has(n.id)) continue;
      const inc = inEdges.get(`${n.id}|${item}`) ?? [];
      const got = inc.reduce((a, e) => a + (flow.get(e.id) ?? 0), 0);
      const short = need * r - got;
      if (short > 1e-6) feed.set(item, (feed.get(item) ?? 0) + short);
    }
    for (const [item, cap] of b.outs) {
      const sent = (outEdges.get(`${n.id}|${item}`) ?? []).reduce(
        (a, e) => a + (flow.get(e.id) ?? 0),
        0
      );
      const left = cap * r - sent;
      if (left > 1e-6) yields.set(item, (yields.get(item) ?? 0) + left);
    }
  }

  return { base, ratio, flow, feed, yields, power, gen };
}
