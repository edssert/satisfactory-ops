/**
 * mining.ts — 채굴 계획. **도면은 채굴기에서 시작한다.**
 *
 * 공장 도면이 "철광석 120/분"을 허공에서 받는 것으로 그려지면 안 된다.
 * 실제로 플레이어가 세우는 첫 건물은 노드 위의 채굴기이고, 그 대수와 위치가
 * 공장의 규모와 자리를 결정한다. 이 모듈이 그 계산을 한다.
 *
 * 수치 출처:
 *   - 채굴기 분당 산출: 게임 배포 데이터(Docs.json) mExtractCycleTime/mItemsPerCycle
 *     → 채굴기 Mk.1 60/분, Mk.2 120/분, Mk.3 240/분 (노말 순도) — confidence: verified
 *   - 순도 배수(불순 0.5 / 노말 1 / 순수 2): Docs.json에 없다. 노드 인스턴스 속성이라
 *     공식 위키 Resource node 문서를 근거로 쓴다 — confidence: consensus
 *     docs/research/mining.md 참조
 */

export type Purity = 'impure' | 'normal' | 'pure';

/**
 * 순도 배수. **게임 배포 데이터에 없는 값이다** — 위키/커뮤니티 합의.
 * 근거: satisfactory.wiki.gg "Resource node" — 불순 0.5배, 노말 1배, 순수 2배.
 */
export const PURITY_MULTIPLIER: Record<Purity, number> = {
  impure: 0.5,
  normal: 1,
  pure: 2,
};

export const PURITY_KO: Record<Purity, string> = {
  impure: '불순',
  normal: '노말',
  pure: '순수',
};

export interface ResourceNode {
  id: string;
  res: string;
  ko: string;
  purity: Purity;
  /** 'node' | 'deposit' | 'well' 등. deposit(작은 광석 무더기)은 채굴기를 못 올린다 */
  type: string;
  fx: number;
  fy: number;
  cell: string;
}

export interface Extractor {
  id: string;
  ko: string;
  /** 노말 순도 기준 분당 산출 (게임 데이터) */
  perMinuteAtNormalPurity: number;
  unlockTier: number | null;
  powerMW: number | null;
}

/** 노드 하나에 채굴기를 올렸을 때의 분당 산출 */
export function nodeYield(node: ResourceNode, extractor: Extractor): number {
  return extractor.perMinuteAtNormalPurity * PURITY_MULTIPLIER[node.purity];
}

/**
 * 지금 티어에서 쓸 수 있는 가장 좋은 채취기를 고른다.
 * 해금 안 된 채굴기를 전제로 계획을 세우면 그 계획은 못 짓는 계획이다.
 */
export function bestExtractor(extractors: Extractor[], tier: number, solid: boolean): Extractor | null {
  const usable = extractors
    .filter((e) => (e.unlockTier ?? 0) <= tier)
    .filter((e) => (solid ? e.id.startsWith('Build_Miner') : !e.id.startsWith('Build_Miner')));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (b.perMinuteAtNormalPurity > a.perMinuteAtNormalPurity ? b : a));
}

export interface MinerAssignment {
  nodeId: string;
  cell: string;
  purity: Purity;
  purityKo: string;
  extractorId: string;
  extractorKo: string;
  /** 이 채굴기가 실제로 낼 분당 산출 */
  ratePerMinute: number;
  /** 100%로 돌리면 남는가 — 남으면 다운클럭 권고치를 준다 */
  clockPercent: number;
  fx: number;
  fy: number;
}

export interface MiningPlan {
  /** 아이콘 참조용 클래스 id */
  itemId: string;
  itemKo: string;
  demandPerMinute: number;
  assignments: MinerAssignment[];
  suppliedPerMinute: number;
  /** 수요를 못 채웠으면 남은 양 */
  shortfallPerMinute: number;
  /** 벨트 한 줄이 못 나르는 양이면 몇 줄로 나눠야 하는지 */
  beltLines: number;
  notes: string[];
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * 수요를 채우도록 노드에 채굴기를 배정한다.
 *
 * 배정 순서는 **순수 → 노말 → 불순**이다. 이유: 채굴기 대수와 그에 딸린 벨트·전력이
 * 순도와 무관하게 같으므로, 같은 산출을 적은 설비로 얻는 쪽이 항상 낫다.
 * 마지막 채굴기는 남는 만큼 다운클럭한다 — 초과 생산은 벨트 상한을 넘기고 재고만 쌓는다.
 */
export function planMining(
  itemId: string,
  itemKo: string,
  demandPerMinute: number,
  nodes: ResourceNode[],
  extractor: Extractor,
  beltPerMinute: number
): MiningPlan {
  const notes: string[] = [];
  // **클래스 id로 조인한다.** 한글 이름으로 조인하면 조용히 0건이 된다 —
  // 노드 데이터의 '철광석'과 게임의 '철 광석'은 다른 문자열이다. 실제로 화면에
  // "근처에 노드 없음"이 떴다. 파이프라인이 이름을 정규화하지만, 여기서도 id를 쓴다.
  const pool = nodes
    .filter((n) => n.res === itemId)
    // deposit(광석 무더기)은 손으로만 캔다 — 채굴기를 올릴 수 없으므로 계획에서 뺀다
    .filter((n) => n.type !== 'deposit')
    .sort((a, b) => PURITY_MULTIPLIER[b.purity] - PURITY_MULTIPLIER[a.purity]);

  if (pool.length === 0) {
    return {
      itemId,
      itemKo,
      demandPerMinute,
      assignments: [],
      suppliedPerMinute: 0,
      shortfallPerMinute: demandPerMinute,
      beltLines: 0,
      notes: [`${itemKo} 노드 데이터가 없습니다 — 채굴기를 올릴 수 있는 노드를 찾지 못했습니다.`],
    };
  }

  const assignments: MinerAssignment[] = [];
  let remaining = demandPerMinute;
  for (const n of pool) {
    if (remaining <= 1e-9) break;
    /*
     * **채굴기 한 대의 산출은 벨트 한 줄을 넘을 수 없다.**
     *
     * 채굴기의 출력구는 하나다. 거기서 나가는 벨트가 못 나르는 양은 존재하지 않는 양이다.
     * 순수 노드(120/분)에 채굴기를 올려도 컨베이어 Mk.1(60/분)만 있으면 실제로 얻는 것은 60/분이다.
     *
     * 이걸 빼먹고 120/분으로 계획을 세웠고, 그 위에 제작기 3대를 얹었다. 못 짓는 계획이었다.
     * 노드가 아까우면 벨트를 올리거나(티어 2에서 Mk.2) 다른 노드를 더 개발해야 한다.
     */
    const full = Math.min(nodeYield(n, extractor), beltPerMinute);
    const take = Math.min(full, remaining);
    const clock = (take / full) * 100;
    assignments.push({
      nodeId: n.id,
      cell: n.cell,
      purity: n.purity,
      purityKo: PURITY_KO[n.purity],
      extractorId: extractor.id,
      extractorKo: extractor.ko,
      ratePerMinute: round(take),
      clockPercent: round(clock),
      fx: n.fx,
      fy: n.fy,
    });
    remaining -= take;
  }

  const supplied = assignments.reduce((s, a) => s + a.ratePerMinute, 0);
  const shortfall = Math.max(0, round(demandPerMinute - supplied));
  if (shortfall > 0) {
    notes.push(
      `${itemKo} 노드가 부족합니다 — ${round(supplied)}/분까지만 가능하고 ${shortfall}/분이 모자랍니다. ` +
        `채굴기 등급을 올리거나(오버클럭·Mk 상향) 다른 군집을 추가로 개발해야 합니다.`
    );
  }
  // 노드가 벨트보다 굵으면 그 사실을 알린다 — 노드를 못 살리고 있다는 뜻이다
  for (const n of pool.slice(0, assignments.length)) {
    const raw = nodeYield(n, extractor);
    if (raw > beltPerMinute + 1e-9) {
      notes.push(
        `${n.cell} ${PURITY_KO[n.purity]} 노드는 ${raw}/분을 낼 수 있지만 지금 벨트가 ${beltPerMinute}/분이라 ` +
          `${beltPerMinute}/분까지만 씁니다. 채굴기를 ${Math.round((beltPerMinute / raw) * 100)}%로 낮추고, ` +
          '상위 벨트가 열리면 100%로 올리면 됩니다 — 그때 배치를 뜯지 않아도 되게 잡았습니다.'
      );
      break;
    }
  }

  const last = assignments[assignments.length - 1];
  if (last && last.clockPercent < 100) {
    notes.push(
      `마지막 채굴기는 ${last.clockPercent}%로 다운클럭합니다 — 100%로 두면 초과분이 벨트에 쌓이고 ` +
        `전력만 더 먹습니다(전력은 클럭의 1.3제곱).`
    );
  }
  const beltLines = beltPerMinute > 0 ? Math.ceil(supplied / beltPerMinute - 1e-9) : 0;
  if (beltLines > 1) {
    notes.push(
      `${round(supplied)}/분은 벨트 한 줄(${beltPerMinute}/분) 상한을 넘습니다 — ${beltLines}줄로 나눠 넣습니다.`
    );
  }

  return {
    itemId,
    itemKo,
    demandPerMinute: round(demandPerMinute),
    assignments,
    suppliedPerMinute: round(supplied),
    shortfallPerMinute: shortfall,
    beltLines,
    notes,
  };
}

/** 월드 크기 — resource-nodes.json 의 $transform bounds 에서 온다 */
export const WORLD_SPAN_M = 7501;

/** 지도 좌표(0~1 비율) 사이의 실제 거리(m) */
export function distanceM(a: { fx: number; fy: number }, b: { fx: number; fy: number }): number {
  const dx = (a.fx - b.fx) * WORLD_SPAN_M;
  const dy = (a.fy - b.fy) * WORLD_SPAN_M;
  return Math.round(Math.hypot(dx, dy));
}
