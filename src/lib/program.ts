/**
 * program.ts — **건설 프로그램**. 티어 진행에서 "다음에 무슨 공장을 어디에 어떻게 지을지"를 만든다.
 *
 * 이 앱의 축이다. 계산기가 아니다:
 *   계산기는 "무엇을 얼마나 만들까"를 묻는다.
 *   프로그램은 "지금 내 상태에서 다음에 무엇을 지어야 하는가"에 답한다.
 *
 * 입력은 목표가 아니라 **진행 상태**다 — 완료한 마일스톤, 시작 지점, 가진 벨트, 블루프린트 유무.
 * 출력은 순서가 있는 단계 목록이고, 각 단계는 다음을 갖는다:
 *
 *   무엇을  — 어떤 부품 공장을 분당 몇 개 규모로
 *   왜 지금 — 어느 마일스톤이 이걸 요구하는지
 *   어디에  — 어느 자원 노드 군집 근처인지 (좌표 데이터에서)
 *   어떻게  — 층 도면 (층당 대수 · 층수 · 분배기 · 전력)
 *   얼마나  — 건설 자재와 완료 조건
 *
 * 순수 모듈. DOM도 JSON도 모른다.
 */

import type { RecipeBook, SolveNode } from './solver.ts';
import { solve } from './solver.ts';
import { toNumber } from './rational.ts';

export interface MilestoneNeed {
  id: string;
  ko: string;
  tier: number;
  cost: { itemId: string; itemKo: string; amount: number }[];
}

export interface ProgramInput {
  /** 티어 순서대로 정렬된 마일스톤 */
  milestones: MilestoneNeed[];
  /** 완료 표시한 마일스톤 id */
  done: Set<string>;
  /** 현재 티어 (F1의 판정 결과) */
  currentTier: number;
  /** 몇 티어까지 계획할 것인가 */
  planUntilTier: number;
  /** 이 시간 안에 티어 요구량을 채우는 규모로 잡는다 (분) */
  targetMinutes: number;
  /** 원자재 판정 */
  isRaw: (itemId: string) => boolean;
  book: RecipeBook;
  /** 원자재별로 쓸 수 있는 노드 정보 */
  nodesFor: (itemKo: string) => { count: number; nearestMeters: number | null; cells: string[] };
  /** 원자재 채굴 설비 한 대의 분당 산출 (노말 순도) */
  minerPerMinute: number;
}

export interface ProgramStage {
  order: number;
  /** 이 단계에서 세우는 공장이 만드는 것 */
  itemId: string;
  itemKo: string;
  /** 필요한 분당 생산량 */
  ratePerMinute: number;
  /** 어느 마일스톤들이 이걸 요구하는가 */
  requiredBy: { ko: string; tier: number; amount: number }[];
  /** 이 공정이 속한 티어 (요구하는 마일스톤 중 최소 티어) */
  tier: number;
  /** 기계 */
  machineId: string;
  machineKo: string;
  machinesExact: number;
  /** 이 공장이 직접 먹는 재료 */
  inputs: { itemKo: string; perMinute: number; isFluid: boolean; fromStage: number | null }[];
  /** 이 공장이 필요로 하는 원자재와 채굴 계획 */
  mining: {
    itemKo: string;
    perMinute: number;
    minersNeeded: number;
    nodeCount: number;
    nearestMeters: number | null;
    cells: string[];
  }[];
  /** 선행 단계 (이 단계 전에 서 있어야 하는 공장) */
  dependsOn: number[];
  /** 완료 조건 */
  doneWhen: string;
}

export interface Program {
  currentTier: number;
  stages: ProgramStage[];
  /** 티어별 요구 부품 총량 */
  tierNeeds: { tier: number; items: { itemKo: string; amount: number }[]; milestones: string[] }[];
  notes: string[];
}

const round = (n: number): number => Math.round(n * 100) / 100;
const ceilEps = (x: number, eps = 1e-6): number => Math.ceil(x - eps);

/**
 * 아직 안 끝낸 마일스톤들이 요구하는 부품을 티어별로 모은다.
 * 이것이 "무엇을 지어야 하는가"의 원천이다 — 사용자가 목표를 입력하지 않는다.
 */
export function collectTierNeeds(input: ProgramInput): Program['tierNeeds'] {
  const byTier = new Map<number, { items: Map<string, number>; milestones: string[] }>();
  for (const m of input.milestones) {
    if (input.done.has(m.id)) continue;
    if (m.tier > input.planUntilTier) continue;
    const bucket = byTier.get(m.tier) ?? { items: new Map<string, number>(), milestones: [] as string[] };
    bucket.milestones.push(m.ko);
    for (const c of m.cost) {
      bucket.items.set(c.itemKo, (bucket.items.get(c.itemKo) ?? 0) + c.amount);
    }
    byTier.set(m.tier, bucket);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, b]) => ({
      tier,
      milestones: b.milestones,
      items: [...b.items.entries()]
        .map(([itemKo, amount]) => ({ itemKo, amount }))
        .sort((a, b2) => b2.amount - a.amount),
    }));
}

/**
 * 건설 프로그램을 만든다.
 *
 * 방법: 아직 안 끝낸 마일스톤의 요구 부품을 티어 순으로 훑고, 각 부품의 생산 체인을
 * 솔버로 펼쳐 **원자재에 가까운 공정부터** 단계로 세운다. 이미 세운 공장은 다시 세우지 않는다.
 */
export function buildProgram(input: ProgramInput): Program {
  const tierNeeds = collectTierNeeds(input);
  const notes: string[] = [];

  // 부품별 필요 생산율 — 티어 요구량을 목표 시간 안에 채우는 규모
  interface Want {
    itemId: string;
    itemKo: string;
    ratePerMinute: number;
    tier: number;
    requiredBy: { ko: string; tier: number; amount: number }[];
  }
  const wants = new Map<string, Want>();

  for (const m of input.milestones) {
    if (input.done.has(m.id)) continue;
    if (m.tier > input.planUntilTier) continue;
    for (const c of m.cost) {
      const rate = c.amount / input.targetMinutes;
      const hit = wants.get(c.itemId);
      if (hit) {
        // 같은 부품을 여러 마일스톤이 요구하면 가장 큰 규모를 따른다
        hit.ratePerMinute = Math.max(hit.ratePerMinute, rate);
        hit.tier = Math.min(hit.tier, m.tier);
        hit.requiredBy.push({ ko: m.ko, tier: m.tier, amount: c.amount });
      } else {
        wants.set(c.itemId, {
          itemId: c.itemId,
          itemKo: c.itemKo,
          ratePerMinute: rate,
          tier: m.tier,
          requiredBy: [{ ko: m.ko, tier: m.tier, amount: c.amount }],
        });
      }
    }
  }

  // 각 요구 부품의 체인을 펼쳐 필요한 공정과 규모를 합산한다
  interface StageAcc {
    itemId: string;
    itemKo: string;
    ratePerMinute: number;
    machinesExact: number;
    machineId: string;
    machineKo: string;
    depth: number;
    tier: number;
    requiredBy: Map<string, { ko: string; tier: number; amount: number }>;
    inputs: Map<string, { itemKo: string; perMinute: number; isFluid: boolean }>;
  }
  const acc = new Map<string, StageAcc>();

  for (const want of wants.values()) {
    const result = solve(want.itemId, want.ratePerMinute, input.book);
    if (!result.ok) {
      notes.push(`${want.itemKo}: ${result.message}`);
      continue;
    }
    const walk = (n: SolveNode) => {
      if (n.recipeId && n.machineId) {
        const key = n.itemId;
        const rate = toNumber(n.rate);
        const machines = n.machines ? toNumber(n.machines) : 0;
        const hit = acc.get(key);
        if (hit) {
          hit.ratePerMinute += rate;
          hit.machinesExact += machines;
          hit.depth = Math.max(hit.depth, n.depth);
          hit.tier = Math.min(hit.tier, want.tier);
        } else {
          acc.set(key, {
            itemId: n.itemId,
            itemKo: n.ko,
            ratePerMinute: rate,
            machinesExact: machines,
            machineId: n.machineId,
            machineKo: n.machineKo ?? n.machineId,
            depth: n.depth,
            tier: want.tier,
            requiredBy: new Map(),
            inputs: new Map(),
          });
        }
        const cur = acc.get(key)!;
        for (const r of want.requiredBy) cur.requiredBy.set(r.ko, r);
        for (const child of n.children) {
          const prev = cur.inputs.get(child.ko);
          const add = toNumber(child.rate);
          if (prev) prev.perMinute += add;
          else cur.inputs.set(child.ko, { itemKo: child.ko, perMinute: add, isFluid: false });
        }
      }
      n.children.forEach(walk);
    };
    walk(result.root);
  }

  // 순서: 티어 먼저, 그 안에서 원자재에 가까운 것(depth 큰 것) 먼저
  const ordered = [...acc.values()].sort(
    (a, b) => a.tier - b.tier || b.depth - a.depth || a.itemKo.localeCompare(b.itemKo, 'ko')
  );

  const indexByItem = new Map<string, number>();
  ordered.forEach((s, i) => indexByItem.set(s.itemKo, i + 1));

  const stages: ProgramStage[] = ordered.map((s, i) => {
    const inputs = [...s.inputs.values()].map((inp) => ({
      itemKo: inp.itemKo,
      perMinute: round(inp.perMinute),
      isFluid: inp.isFluid,
      fromStage: indexByItem.get(inp.itemKo) ?? null,
    }));

    // 원자재는 채굴 계획으로 바꾼다
    const mining = inputs
      .filter((inp) => inp.fromStage === null)
      .map((inp) => {
        const nodes = input.nodesFor(inp.itemKo);
        return {
          itemKo: inp.itemKo,
          perMinute: inp.perMinute,
          minersNeeded: ceilEps(inp.perMinute / input.minerPerMinute),
          nodeCount: nodes.count,
          nearestMeters: nodes.nearestMeters,
          cells: nodes.cells,
        };
      });

    return {
      order: i + 1,
      itemId: s.itemId,
      itemKo: s.itemKo,
      ratePerMinute: round(s.ratePerMinute),
      requiredBy: [...s.requiredBy.values()].sort((a, b) => a.tier - b.tier),
      tier: s.tier,
      machineId: s.machineId,
      machineKo: s.machineKo,
      machinesExact: round(s.machinesExact),
      inputs,
      mining,
      dependsOn: inputs.map((inp) => inp.fromStage).filter((n): n is number => n !== null),
      doneWhen: `${s.itemKo} ${round(s.ratePerMinute)}/분이 안정적으로 흐르면 다음 단계로`,
    };
  });

  if (stages.length === 0) {
    notes.push('계획할 마일스톤이 없습니다. 마일스톤 화면에서 진행 상황을 체크하면 다음 단계가 나옵니다.');
  }

  return { currentTier: input.currentTier, stages, tierNeeds, notes };
}
