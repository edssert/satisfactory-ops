/**
 * module-plan.ts — **모듈 도면**. 채굴기 한 대에서 완제품까지, 한 장에 들어가는 공장 하나.
 *
 * 형식의 근거: 커뮤니티에서 널리 쓰이는 "모듈 시트" 방식이다 (앤디스 팩토리 설계 연구소 등).
 * 한 장에 다음이 다 들어간다 —
 *   · 정사각에 가까운 배치 (토대 N×M 영역)
 *   · **채굴기부터** 그린 전체 공정 (허공에서 재료가 들어오지 않는다)
 *   · 건물 목록 (그대로 사면 되는 자재표)
 *   · 특징 (모듈 복제·대칭 확장 가능 여부)
 *
 * 계산기와 다른 점: 목표를 입력받아 숫자를 뱉는 게 아니라, **지금 티어에서 지을 수 있는
 * 한 덩어리의 공장**을 만든다. 그래서 해금 티어와 벨트 등급이 입력에 들어간다.
 *
 * 검증 기준값 (tests/module-plan.test.ts):
 *   보강된 철판 5/분 모듈 = 채굴기 1 · 제련기 2 · 제작기 5 · 조립기 1
 *   제작기 5대의 근거: 철판 1.5 + 나사 1.5 + 철봉 1 = 4대가 정확값이지만 반 대는 못 짓는다.
 *   2 + 2 + 1 로 짓고 남는 만큼 다운클럭한다.
 */

import type { RecipeBook, SolveNode } from './solver.ts';
import { solve } from './solver.ts';
import { toNumber } from './rational.ts';
import { planMining, type MiningPlan, type ResourceNode, type Extractor } from './mining.ts';
import { packFlow, routeBelt, type Point } from './pack.ts';
import { splittersFor, mergersFor } from './layout.ts';

/** 토대 한 장 = 8 m (게임 기본 토대) */
export const TILE_M = 8;

export interface Footprint {
  widthM: number;
  lengthM: number;
  heightM: number;
}

export interface MachineSpec {
  id: string;
  ko: string;
  footprint: Footprint | null;
  powerMW: number | null;
  /** 전력 = 기본 × 클럭^지수. 게임 데이터의 mPowerConsumptionExponent */
  powerExponent: number | null;
}

export interface MachineGroup {
  /** 이 그룹이 만드는 것 */
  itemKo: string;
  itemId: string;
  machineId: string;
  machineKo: string;
  /** 비율상 정확한 대수 (1.5 같은 값이 나온다) */
  exact: number;
  /** 실제로 짓는 대수 — 반 대는 못 짓는다 */
  built: number;
  /** 지은 대수를 이 클럭으로 돌리면 정확값과 같아진다 */
  clockPercent: number;
  /** 이 그룹 전체가 분당 내는 산출 */
  outPerMinute: number;
  /**
   * 기계 **한 대**가 분당 내야 하는 산출.
   *
   * 1.0부터 기계 UI에서 클럭 %가 아니라 목표 산출을 개/분으로 바로 넣을 수 있다.
   * 그쪽이 반올림 없이 정확하다 — 75%를 손으로 맞추는 것보다 '15/분'을 적는 게 쉽다.
   */
  outPerMachinePerMinute: number;
  /** 이 그룹 전체가 분당 먹는 재료 */
  inputs: { itemKo: string; perMinute: number; fromGroup: number | null }[];
  /** 다운클럭을 반영한 전력 */
  powerMW: number;
  /** 100%로 그냥 돌렸을 때의 전력 — 다운클럭 이득을 보여주기 위해 */
  powerAt100MW: number;
  footprint: Footprint | null;
  /** 원자재에서 몇 단계 떨어졌나 (0 = 원자재 직후) */
  rank: number;
}

export interface Placement {
  kind: 'machine' | 'extractor' | 'splitter' | 'merger';
  label: string;
  /** 8m 타일 좌표 */
  x: number;
  y: number;
  wTiles: number;
  hTiles: number;
  /** 기계일 때 소속 그룹 */
  group?: number;
  /** 어떤 건물인가 — 도면에서 아이콘·실루엣을 고르는 키 */
  machineId?: string;
  /** 이 기계가 만드는 아이템 (아이콘 배지에 쓴다) */
  itemId?: string;
  /** 한 대가 분당 내는 수량 — 아이콘 옆 배지 */
  perMachinePerMinute?: number;
  clockPercent?: number;
  /** 90도 돌려 놓았는가 */
  rotated?: boolean;
  /**
   * 이 기계의 접속부 (타일 좌표).
   * **계획이 계산하고 도면은 그리기만 한다** — 도면이 따로 계산하면 벨트가 닿는 자리와
   * 삼각형이 그려진 자리가 어긋난다. 위치는 추정값이다 (게임 데이터에 포트 좌표가 없다).
   */
  ports?: { x: number; y: number; role: 'in' | 'out' }[];
}

/**
 * 통로 하나를 지나는 흐름.
 *
 * 행 사이의 통로는 **앞 행의 산출이자 다음 행의 공급**이다. 처음에는 행마다 '입력 벨트'와
 * '출력 벨트'를 따로 만들었는데, 그러면 같은 통로에 두 개의 선과 두 개의 라벨이 겹쳐 그려진다.
 * 통로를 단위로 잡으면 겹칠 것이 없다.
 */
export interface BeltRun {
  itemKo: string;
  /** 아이콘 참조용 */
  itemId?: string;
  perMinute: number;
  /** 실제 경로 (타일 좌표, 직각으로 꺾인다). 기계를 관통하지 않는다. */
  path: { x: number; y: number }[];
  /** 이 유량을 나르는 데 필요한 벨트 줄 수 */
  lines: number;
  /** 현재 벨트 한 줄로 부족한가 */
  overCurrentBelt: boolean;
  /** 어디서 어디로 — null 은 모듈 밖(채굴기 / 완제품 반출) */
  fromGroup: number | null;
  toGroup: number | null;
  /** 분배기·병합기와 기계를 잇는 짧은 분기. 도면에 라벨을 붙이지 않는다 */
  branch?: boolean;
  /**
   * 사람이 읽는 양 끝 이름. 연결 목록에 그대로 쓴다.
   * fromGroup/toGroup 만으로는 분기의 끝이 분배기인지 채굴기인지 구분되지 않아
   * "채굴기 → 제작기"라고 잘못 적혔다.
   */
  fromLabel: string;
  toLabel: string;
}

export interface BuildStep {
  no: number;
  /** 무엇을 */
  what: string;
  /** 몇 개 */
  count: number;
  /**
   * 어디에 — 토대 **왼쪽 위 모서리**를 원점으로 한 위치.
   * 칸은 토대 한 장(8 m) 단위, 미터는 그 안에서의 오프셋이다.
   */
  where: string;
  /** 어느 방향으로 놓는가 */
  facing?: string;
  /** 설정할 것 (클럭 등) */
  setting?: string;
  /** 왜 이 순서인가 */
  why?: string;
}

export interface ModulePlan {
  targetKo: string;
  targetId: string;
  targetPerMinute: number;
  tier: number;
  belt: { ko: string; perMinute: number };
  /** 곧 해금될 상위 벨트 — 배치를 이 처리량에 맞춰 잡는다 */
  futureBelt: { ko: string; perMinute: number; tier: number } | null;
  mining: MiningPlan[];
  groups: MachineGroup[];
  placements: Placement[];
  belts: BeltRun[];
  /** 토대 영역 */
  foundation: {
    wTiles: number;
    hTiles: number;
    count: number;
    sideM: number;
    fitsBlueprintMk1: boolean;
  };
  /** 건물 목록 — 이대로 사면 된다 */
  bom: { ko: string; count: number; note?: string }[];
  /** 특징 */
  features: string[];
  power: { totalMW: number; at100MW: number; savedMW: number };
  splitters: number;
  mergers: number;
  lifts: number;
  /** 바닥에서 손이 닿지 않는 기계 수 — 캣워크로 접근해야 한다 */
  unreachableMachines: number;
  /**
   * **손으로 지을 때의 순서표.**
   * 청사진 설계소는 티어 4에 열린다. 그 전에는 이 표를 보고 하나씩 세워야 한다.
   * 그림 없이도 지을 수 있을 만큼 좌표와 방향이 명확해야 한다.
   */
  buildSteps: BuildStep[];
  notes: string[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const ceilEps = (x: number, eps = 1e-6): number => Math.ceil(x - eps);
const tiles = (m: number): number => Math.max(1, ceilEps(m / TILE_M));

/** 클럭을 반영한 전력. 게임: 소비 = 기본 × 클럭^지수 (지수는 데이터에서, 통상 1.321928) */
export function powerAtClock(baseMW: number, clockPercent: number, exponent: number): number {
  return baseMW * Math.pow(clockPercent / 100, exponent);
}

/**
 * **규모를 공급에서 거꾸로 정한다.**
 *
 * 왜 이게 중요한가: 목표 생산량을 사람이 입력하게 두면 티어 1에서 "보강된 철판 60/분" 같은
 * 값이 기본값으로 앉는다. 그건 조립기 12대에 철 광석 720/분 — 채굴기 12대가 필요한 규모다.
 * 초반에 지을 수 없는 계획이고, 그런 숫자는 안내서가 아니라 산수다.
 *
 * 실제 제약은 항상 **노드 하나에 올린 채굴기 하나의 산출**이다. 그래서 그 산출을 넣고
 * 거기서 나오는 완제품 생산율을 계산한다. 참고 도면의 모듈들이 정확히 이 방식이다 —
 * 노말 철 광석 노드 1개(60/분)에서 보강된 철판 5/분이 나온다.
 *
 * 체인은 선형이므로 1/분에 대한 원자재 소요를 구해 비례로 환산한다.
 */
export function rateFromSupply(
  targetItemId: string,
  rawItemId: string,
  supplyPerMinute: number,
  book: RecipeBook,
  isRaw: (itemId: string) => boolean
): number {
  const probe = solve(targetItemId, 1, book);
  if (!probe.ok) throw new Error(`규모 산정 실패: ${probe.message}`);
  let per = 0;
  const walk = (n: SolveNode) => {
    if (!n.recipeId && isRaw(n.itemId) && n.itemId === rawItemId) per += toNumber(n.rate);
    n.children.forEach(walk);
  };
  walk(probe.root);
  if (per <= 0) throw new Error(`${targetItemId}는 ${rawItemId}를 쓰지 않습니다`);
  return supplyPerMinute / per;
}

export interface ModuleInput {
  targetItemId: string;
  targetPerMinute: number;
  tier: number;
  book: RecipeBook;
  machines: Map<string, MachineSpec>;
  belt: { ko: string; perMinute: number };
  futureBelt: { ko: string; perMinute: number; tier: number } | null;
  nodes: ResourceNode[];
  extractor: Extractor;
  /** 원자재 판정 — 노드에서 캐는 것 */
  isRaw: (itemId: string) => boolean;
  /** 지금 티어에서 쓸 수 있는 컨베이어 리프트 이름 */
  liftKo?: string;
}

/**
 * 모듈 하나를 만든다.
 *
 * 흐름: 솔버로 체인을 펼치고 → 공정별로 묶어 지을 대수와 클럭을 정하고 →
 * 원자재는 채굴기 배정으로 바꾸고 → 왼쪽(채굴)에서 오른쪽(완제품)으로 열을 놓는다.
 */
export function planModule(input: ModuleInput): ModulePlan {
  const notes: string[] = [];
  const solved = solve(input.targetItemId, input.targetPerMinute, input.book);
  if (!solved.ok) {
    throw new Error(`모듈 계획 실패: ${solved.message}`);
  }

  // 1) 공정별 집계 — 같은 부품을 두 곳에서 쓰면 한 그룹으로 합친다
  interface Acc {
    itemId: string;
    itemKo: string;
    machineId: string;
    machineKo: string;
    exact: number;
    out: number;
    rank: number;
    inputs: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  const rawDemand = new Map<string, { itemId: string; itemKo: string; perMinute: number }>();

  const walk = (n: SolveNode) => {
    if (n.recipeId && n.machineId) {
      const hit = acc.get(n.itemId);
      const machines = n.machines ? toNumber(n.machines) : 0;
      const rate = toNumber(n.rate);
      if (hit) {
        hit.exact += machines;
        hit.out += rate;
        hit.rank = Math.max(hit.rank, n.depth);
      } else {
        acc.set(n.itemId, {
          itemId: n.itemId,
          itemKo: n.ko,
          machineId: n.machineId,
          machineKo: n.machineKo ?? n.machineId,
          exact: machines,
          out: rate,
          rank: n.depth,
          inputs: new Map(),
        });
      }
      const cur = acc.get(n.itemId)!;
      for (const c of n.children) {
        cur.inputs.set(c.ko, (cur.inputs.get(c.ko) ?? 0) + toNumber(c.rate));
      }
    } else if (input.isRaw(n.itemId)) {
      const prev = rawDemand.get(n.itemId);
      const add = toNumber(n.rate);
      if (prev) prev.perMinute += add;
      else rawDemand.set(n.itemId, { itemId: n.itemId, itemKo: n.ko, perMinute: add });
    }
    n.children.forEach(walk);
  };
  walk(solved.root);

  // 2) 원자재 → 채굴 계획. 도면은 채굴기에서 시작한다.
  //    단, 채굴기는 노드 위에 있고 부지에서 수십~수백 m 떨어져 있을 수 있다.
  //    그래서 토대 안에 그리지 않고 **바깥 스트립**으로 빼서 운반 거리를 함께 적는다.
  const mining: MiningPlan[] = [...rawDemand.values()].map((d) =>
    planMining(d.itemId, d.itemKo, d.perMinute, input.nodes, input.extractor, input.belt.perMinute)
  );
  for (const m of mining) notes.push(...m.notes);
  const minerAssignments = mining.flatMap((m) => m.assignments);

  // 3) 지을 대수와 클럭
  //    정확값이 1.5면 2대를 짓고 75%로 돌린다. 1대 100% + 0.5대는 만들 수 없다.
  const orderedAcc = [...acc.values()].sort((a, b) => b.rank - a.rank || a.itemKo.localeCompare(b.itemKo, 'ko'));
  const groupIndexByItem = new Map<string, number>();
  orderedAcc.forEach((a, i) => groupIndexByItem.set(a.itemKo, i));

  const groups: MachineGroup[] = orderedAcc.map((a, i) => {
    const spec = input.machines.get(a.machineId);
    const built = ceilEps(a.exact);
    const clock = built > 0 ? (a.exact / built) * 100 : 100;
    const base = spec?.powerMW ?? 0;
    const exp = spec?.powerExponent ?? 1.321928;
    return {
      itemKo: a.itemKo,
      itemId: a.itemId,
      machineId: a.machineId,
      machineKo: a.machineKo,
      exact: r2(a.exact),
      built,
      clockPercent: r2(clock),
      outPerMinute: r2(a.out),
      outPerMachinePerMinute: built > 0 ? Math.round((a.out / built) * 1000) / 1000 : 0,
      inputs: [...a.inputs.entries()].map(([itemKo, perMinute]) => ({
        itemKo,
        perMinute: r2(perMinute),
        fromGroup: groupIndexByItem.get(itemKo) ?? null,
      })),
      powerMW: r2(powerAtClock(base, clock, exp) * built),
      powerAt100MW: r2(base * built),
      footprint: spec?.footprint ?? null,
      rank: a.rank,
      _i: i,
    } as MachineGroup;
  });

  // 4) 배치 — **최적화한다.**
  //
  //    폭 상한은 32 m = 토대 4칸이다. 청사진 설계소 Mk.1의 내부 치수가 정확히 32 m라서,
  //    지금(티어 4 이전) 그 폭에 맞춰 지어 두면 티어 4에 그대로 청사진으로 떠서 복제할 수 있다.
  //
  //    앞서는 "32 m까지 채우고 공정이 바뀌면 줄을 끊는다"는 탐욕적 규칙이었다. 목적 함수가
  //    없었고, 그 결과 보강된 철판 모듈이 32×72 m로 나왔다 — 발행된 같은 모듈은 32×32 m다.
  //    지금은 pack.ts의 패커가 면적과 벨트 길이를 목적 함수로 두고 수백 가지 배치를 비교한다.
  const placements: Placement[] = [];
  const belts: BeltRun[] = [];
  const TARGET_WIDTH_M = 32;

  // 공정 단위로 블록을 만들어 배치한다. 같은 공정의 기계는 서로 붙이고, 통로는 공정 사이에만.
  /*
   * 공정 순서대로 위에서 아래로 쌓는다. 면적 최소화가 아니라 **흐름**이 기준이다.
   * 면적만 보고 배치했더니 같은 공정이 흩어지고 벨트가 바깥을 도는, 공장이 아니라 창고 같은
   * 그림이 나왔다.
   */
  const packed = packFlow(
    groups.map((g, gi) => {
      const fp = g.footprint ?? { widthM: 8, lengthM: 10, heightM: 8 };
      return { group: gi, count: g.built, widthM: fp.widthM, lengthM: fp.lengthM, rank: g.rank };
    }),
    TARGET_WIDTH_M
  );

  // 블록 안의 기계 좌표를 블록 위치에 더해 실제 배치로 펼친다
  const machineBoxes: { gi: number; xM: number; yM: number; widthM: number; lengthM: number; rotated: boolean }[] = [];
  for (const placedBlock of packed.items) {
    const gi = Number(placedBlock.id);
    const block = packed.blocks.find((b) => b.group === gi)!;
    for (const cell of block.cells) {
      machineBoxes.push({
        gi,
        xM: placedBlock.xM + cell.xM,
        yM: placedBlock.yM + cell.yM,
        widthM: cell.widthM,
        lengthM: cell.lengthM,
        rotated: cell.widthM !== (groups[gi]!.footprint?.widthM ?? cell.widthM),
      });
    }
  }

  for (const mb of machineBoxes) {
    const g = groups[mb.gi]!;
    placements.push({
      kind: 'machine',
      label: `${g.machineKo}
${g.itemKo}`,
      machineId: g.machineId,
      itemId: g.itemId,
      perMachinePerMinute: g.outPerMachinePerMinute,
      x: mb.xM / TILE_M,
      y: mb.yM / TILE_M,
      wTiles: mb.widthM / TILE_M,
      hTiles: mb.lengthM / TILE_M,
      group: mb.gi,
      clockPercent: g.clockPercent,
      rotated: mb.rotated,
    });
  }

  const widthM = packed.widthM;
  const heightM = packed.heightM;
  const wTiles = ceilEps(widthM / TILE_M);
  const hTiles = ceilEps(heightM / TILE_M);

  // ── 벨트 라우팅: 기계를 피해 직각으로 잇는다
  const GW = wTiles * TILE_M;
  const GH = hTiles * TILE_M;
  const occupied = new Uint8Array(GW * GH);
  for (const it of machineBoxes) {
    for (let y = Math.floor(it.yM); y < Math.ceil(it.yM + it.lengthM); y++) {
      for (let x = Math.floor(it.xM); x < Math.ceil(it.xM + it.widthM); x++) {
        if (x >= 0 && y >= 0 && x < GW && y < GH) occupied[y * GW + x] = 1;
      }
    }
  }
  const blocked = (x: number, y: number) => occupied[y * GW + x] === 1;

  /** 공정의 출력 면 — 그 공정 기계들 중 가장 아래 기계의 아래쪽 바로 밖 */
  const exitOf = (gi: number): Point => {
    const mine = machineBoxes.filter((i2) => i2.gi === gi);
    const low = mine.reduce((a, b) => (b.yM + b.lengthM > a.yM + a.lengthM ? b : a));
    return { x: Math.round(low.xM + low.widthM / 2), y: Math.min(GH - 1, Math.round(low.yM + low.lengthM)) };
  };
  /** 공정의 입력 면 — 그 공정 기계들 중 가장 위 기계의 위쪽 바로 밖 */
  const entryOf = (gi: number): Point => {
    const mine = machineBoxes.filter((i2) => i2.gi === gi);
    const high = mine.reduce((a, b) => (b.yM < a.yM ? b : a));
    return { x: Math.round(high.xM + high.widthM / 2), y: Math.max(0, Math.round(high.yM) - 1) };
  };

  /*
   * 분배기·병합기 배치.
   *
   * 치수는 4×4 m인데 통로는 2 m다. 그래도 놓을 수 있다 — 게임 데이터를 보면 이 부속들은
   * **하드 클리어런스가 없고 소프트만 있다**(hardBoxes 0). 즉 기계와 겹쳐 지을 수 있고
   * 경고만 뜬다. 촘촘한 설계가 가능한 이유 중 하나다.
   * 그래서 겹침 검증에서도 부속은 제외한다.
   */
  /*
   * 기계 접속부 좌표.
   *
   * 입력은 뒷면, 출력은 앞면이다 (위키 근거 — 제조기만 반대). 기계를 90도 돌려 놓으면
   * 뒷면은 왼쪽 면이 된다. 이 좌표를 계획에서 한 번만 계산해 도면과 벨트 배선이 같은 값을 쓴다.
   */
  const portOf = (mb: (typeof machineBoxes)[number], role: 'in' | 'out'): Point => {
    const cx = Math.round(mb.xM + mb.widthM / 2);
    const cy = Math.round(mb.yM + mb.lengthM / 2);
    const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
    if (mb.rotated) {
      return role === 'in'
        ? { x: clamp(Math.round(mb.xM) - 1, GW), y: clamp(cy, GH) }
        : { x: clamp(Math.round(mb.xM + mb.widthM), GW), y: clamp(cy, GH) };
    }
    return role === 'in'
      ? { x: clamp(cx, GW), y: clamp(Math.round(mb.yM) - 1, GH) }
      : { x: clamp(cx, GW), y: clamp(Math.round(mb.yM + mb.lengthM), GH) };
  };

  // 배치된 기계에 포트 좌표를 붙인다
  for (const p of placements) {
    if (p.kind !== 'machine') continue;
    const mb = machineBoxes.find(
      (m) => Math.abs(m.xM / TILE_M - p.x) < 1e-9 && Math.abs(m.yM / TILE_M - p.y) < 1e-9
    );
    if (!mb) continue;
    const i = portOf(mb, 'in');
    const o = portOf(mb, 'out');
    p.ports = [
      { x: i.x / TILE_M, y: i.y / TILE_M, role: 'in' },
      { x: o.x / TILE_M, y: o.y / TILE_M, role: 'out' },
    ];
  }

  /*
   * 분배기·병합기 배치와 **분기 벨트**.
   *
   * 앞서는 분배기를 공정의 맨 앞, 병합기를 맨 뒤에 하나씩 놓고 끝냈다. 그래서 도면에서
   * 기계 세 대가 아무 데도 연결되지 않은 채 떠 있었다 — 도면이라고 할 수 없는 그림이었다.
   *
   * 실제 매니폴드는 이렇게 생겼다: 분배기 한 대의 출력이 3개이므로 기계 3대까지 직접 먹인다.
   * 그래서 필요한 분배기 수는 ceil((n-1)/2) 이고(발행 도면의 부품 수와 일치),
   * **각 분배기에서 자기가 맡은 기계의 입력구까지 벨트가 하나씩 나간다.** 그 분기를 그린다.
   *
   * 부속의 치수는 4×4 m인데 통로는 2 m다. 그래도 놓을 수 있다 — 게임 데이터상 이 부속들은
   * 하드 클리어런스가 없고 소프트만 있어서(hardBoxes 0) 기계와 겹쳐 지을 수 있다.
   */
  /*
   * 분배기·병합기 배치 — **기계마다 바로 위(아래)에 하나씩.**
   *
   * 앞서는 공정마다 분배기 한두 개를 통로에 흩어 놓고 거기서 각 기계로 벨트를 뻗었다.
   * 기계를 빈틈없이 붙여 놓았으므로 그 벨트가 다른 기계 위를 가로질렀다 — 지을 수 없는 그림이다.
   *
   * 실제 매니폴드는 이렇게 생겼다: 간선이 기계 줄을 따라 **통로**를 지나가고, 기계마다 그 앞에
   * 분배기가 하나 붙어 짧게 떨어뜨린다. 마지막 기계는 간선 끝을 그대로 받는다.
   * 그래서 필요한 분배기는 줄당 (기계 수 − 1)개이고, 병합기도 같다.
   * 사용자가 "이 도면대로면 분배기가 최소 2개는 있어야 하는 것 아니냐"고 한 지적이 이것이다.
   */
  const ATT_M = 4;
  interface Attach {
    kind: 'splitter' | 'merger';
    pt: Point;
    group: number;
    serves: (typeof machineBoxes)[number][];
  }
  const attaches: Attach[] = [];

  groups.forEach((g, gi) => {
    const mine = machineBoxes.filter((m) => m.gi === gi);
    if (mine.length <= 1) return;
    // 같은 줄(y가 같은 것)끼리 묶는다 — 줄마다 간선이 하나씩 지나간다
    const byRow = new Map<number, typeof mine>();
    for (const m of mine) {
      const key = Math.round(m.yM);
      byRow.set(key, [...(byRow.get(key) ?? []), m]);
    }
    for (const [, row] of byRow) {
      const sorted = [...row].sort((a2, b2) => a2.xM - b2.xM);
      // 마지막 기계는 간선 끝을 그대로 받는다 — 부속이 필요 없다
      sorted.slice(0, -1).forEach((m) => {
        const ip = portOf(m, 'in');
        const op = portOf(m, 'out');
        attaches.push({
          kind: 'splitter',
          pt: { x: ip.x, y: Math.max(ATT_M / 2, ip.y) },
          group: gi,
          serves: [m],
        });
        attaches.push({
          kind: 'merger',
          pt: { x: op.x, y: Math.min(GH - 1 - ATT_M / 2, op.y) },
          group: gi,
          serves: [m],
        });
      });
    }
  });

  for (const a of attaches) {
    placements.push({
      kind: a.kind,
      label: a.kind === 'splitter' ? '분배기' : '병합기',
      x: (a.pt.x - ATT_M / 2) / TILE_M,
      y: (a.pt.y - ATT_M / 2) / TILE_M,
      wTiles: ATT_M / TILE_M,
      hTiles: ATT_M / TILE_M,
      group: a.group,
    });
  }

  const routeFailures: string[] = [];
  /** 점이 2개 미만인 경로는 벨트가 아니다 — 그리면 빈 path 가 되어 SVG 가 깨진다 */
  const usablePath = (pts: Point[]) => pts.length >= 2;

  const pushBelt = (
    itemKo: string,
    perMinute: number,
    from: Point,
    to: Point,
    fromGroup: number | null,
    toGroup: number | null,
    /** 분기 벨트는 도면에 라벨을 붙이지 않는다 — 기계마다 붙이면 도면이 글자로 덮인다 */
    branch = false,
    labels?: { from: string; to: string }
  ) => {
    const path = routeBelt(from, to, blocked, { w: GW, h: GH });
    if (!usablePath(path)) {
      // 출발점과 도착점이 같은 칸이면 벨트가 없다. 그리지 않는다.
      return;
    }
    if (path.length <= 2 && (Math.abs(from.x - to.x) > 1 && Math.abs(from.y - to.y) > 1)) {
      routeFailures.push(itemKo);
    }
    belts.push({
      itemKo,
      perMinute: r2(perMinute),
      path: path.map((pt) => ({ x: pt.x / TILE_M, y: pt.y / TILE_M })),
      lines: ceilEps(perMinute / input.belt.perMinute),
      overCurrentBelt: perMinute > input.belt.perMinute,
      fromGroup,
      toGroup,
      branch,
      fromLabel:
        labels?.from ??
        (fromGroup == null ? '채굴기 / 외부' : `${groups[fromGroup]!.machineKo} · ${groups[fromGroup]!.itemKo}`),
      toLabel:
        labels?.to ??
        (toGroup == null ? '반출 / 다음 모듈' : `${groups[toGroup]!.machineKo} · ${groups[toGroup]!.itemKo}`),
    });
  };

  /*
   * 분기 벨트 — 분배기에서 각 기계 입력구로, 각 기계 출력구에서 병합기로.
   * 이게 없으면 기계가 도면에서 아무 데도 연결되지 않은 채 떠 있게 된다.
   */
  for (const a of attaches) {
    const g = groups[a.group]!;
    for (const m of a.serves) {
      const perMachine = g.outPerMinute / Math.max(1, g.built);
      if (a.kind === 'splitter') {
        const inFlow = g.inputs.reduce((s2, i2) => s2 + i2.perMinute, 0) / Math.max(1, g.built);
        pushBelt(g.inputs[0]?.itemKo ?? '재료', inFlow, a.pt, portOf(m, 'in'), null, a.group, true, {
          from: '분배기',
          to: `${g.machineKo} · ${g.itemKo}`,
        });
      } else {
        pushBelt(g.itemKo, perMachine, portOf(m, 'out'), a.pt, a.group, null, true, {
          from: `${g.machineKo} · ${g.itemKo}`,
          to: '병합기',
        });
      }
    }
  }

  // 원자재: 토대 왼쪽 위에서 들어와 첫 공정으로
  for (const m of mining) {
    const consumer = groups.findIndex((g) => g.inputs.some((i2) => i2.itemKo === m.itemKo));
    if (consumer < 0) continue;
    // 간선은 분배기까지 간다. 기계가 한 대뿐이면 그 기계로 바로 들어간다.
    const g = groups[consumer]!;
    pushBelt(m.itemKo, m.suppliedPerMinute, { x: 0, y: 0 }, entryOf(consumer), null, consumer, false, {
      from: `${m.assignments[0]?.extractorKo ?? '채굴기'} (${m.assignments.map((a) => a.cell).join(', ')})`,
      to: g.built > 1 ? '분배기' : `${g.machineKo} · ${g.itemKo}`,
    });
  }
  // 공정 사이
  groups.forEach((g, gi) => {
    for (const inp of g.inputs) {
      if (inp.fromGroup == null) continue;
      const src = groups[inp.fromGroup]!;
      pushBelt(inp.itemKo, inp.perMinute, exitOf(inp.fromGroup), entryOf(gi), inp.fromGroup, gi, false, {
        from: src.built > 1 ? '병합기' : `${src.machineKo} · ${src.itemKo}`,
        to: g.built > 1 ? '분배기' : `${g.machineKo} · ${g.itemKo}`,
      });
    }
  });
  // 완제품 반출 — 마지막 공정에서 토대 밖으로
  const lastGroup = groups.length - 1;
  if (lastGroup >= 0) {
    const e = exitOf(lastGroup);
    const last = groups[lastGroup]!;
    pushBelt(last.itemKo, last.outPerMinute, e, { x: GW - 1, y: GH - 1 }, lastGroup, null, false, {
      from: last.built > 1 ? '병합기' : `${last.machineKo} · ${last.itemKo}`,
      to: '반출 / 다음 모듈',
    });
  }
  if (routeFailures.length) {
    notes.push(
      `${[...new Set(routeFailures)].join('·')} 벨트 경로를 기계를 피해 찾지 못했습니다 — ` +
        '도면에는 직선으로 표시했습니다. 실제로는 리프트로 위/아래를 지나가야 합니다.'
    );
  }

  /*
   * 접근 가능성 검사 — **손댈 수 없는 기계가 있는가.**
   *
   * 기계를 붙여 놓는 것은 게임이 허용하지만, 클럭을 설정하거나 상태를 보려면 사람이 직접
   * 걸어가야 한다. 사방이 막힌 기계는 도면상으로는 예뻐도 실제로는 만질 수 없다.
   *
   * 바닥에서 닿지 않는 기계는 **공중 캣워크**로 접근한다 — 캣워크는 허공에 설치할 수 있고
   * 사다리로 오른다(둘 다 티어 1, 철봉 2 + 철판 1). 바닥 틈을 벌려 접근을 확보하는 것보다
   * 훨씬 싸고 밀도를 해치지 않는다.
   */
  const reachable = new Uint8Array(GW * GH);
  {
    const queue: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= GW || y >= GH) return;
      const i = y * GW + x;
      if (reachable[i] || occupied[i]) return;
      reachable[i] = 1;
      queue.push(i);
    };
    // 모듈 테두리에서 시작한다 — 사람은 밖에서 들어온다
    for (let x = 0; x < GW; x++) {
      push(x, 0);
      push(x, GH - 1);
    }
    for (let y = 0; y < GH; y++) {
      push(0, y);
      push(GW - 1, y);
    }
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % GW;
      const y = (i - x) / GW;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
  }
  const unreachable = machineBoxes.filter((mb) => {
    // 기계 둘레에 걸어서 닿는 칸이 하나라도 있으면 접근 가능
    const x0 = Math.floor(mb.xM);
    const y0 = Math.floor(mb.yM);
    const x1 = Math.ceil(mb.xM + mb.widthM);
    const y1 = Math.ceil(mb.yM + mb.lengthM);
    for (let x = x0 - 1; x <= x1; x++) {
      for (const y of [y0 - 1, y1]) {
        if (x >= 0 && y >= 0 && x < GW && y < GH && reachable[y * GW + x]) return false;
      }
    }
    for (let y = y0 - 1; y <= y1; y++) {
      for (const x of [x0 - 1, x1]) {
        if (x >= 0 && y >= 0 && x < GW && y < GH && reachable[y * GW + x]) return false;
      }
    }
    return true;
  });

  const splittersCount = groups.filter((g) => g.built > 1).reduce((a, g) => a + splittersFor(g.built), 0);
  const mergersCount = groups.filter((g) => g.built > 1).reduce((a, g) => a + mergersFor(g.built), 0);

  /*
   * 리프트는 **높이가 바뀌는 지점**에만 쓴다.
   * 처음에는 기계마다 한 개씩 셌더니 14대짜리 모듈에 리프트 15개가 나왔다 — 과다 계산이다.
   * 실제로 필요한 곳은 채굴기 출력구(지면에서 높이가 있다)와, 벨트가 기계를 넘어가는 지점이다.
   */
  const lifts = minerAssignments.length + routeFailures.length;

  // 5) 건물 목록
  const bomMap = new Map<string, { count: number; note?: string }>();
  const bump = (ko: string, n: number, note?: string) => {
    const cur = bomMap.get(ko) ?? { count: 0, note };
    cur.count += n;
    if (note) cur.note = note;
    bomMap.set(ko, cur);
  };
  for (const m of mining) {
    for (const a of m.assignments) {
      bump(a.extractorKo, 1, a.clockPercent < 100 ? `${a.clockPercent}% 다운클럭 포함` : undefined);
    }
  }
  for (const g of groups) {
    bump(g.machineKo, g.built, g.clockPercent < 100 ? `${g.clockPercent}%로 다운클럭` : undefined);
  }
  const splitters = splittersCount;
  const mergers = mergersCount;
  if (splitters) bump('분배기', splitters);
  if (mergers) bump('병합기', mergers);
  bump(input.belt.ko, 0, '기계 사이 연결 전부');
  // 컨베이어 리프트 — 높이가 바뀌는 지점마다 필요하다. 지금까지 이걸 아예 빼먹고 있었다.
  //   · 채굴기 출력구는 지면에서 높이가 있어 제련기 입력구 높이와 맞지 않는다
  //   · 매니폴드를 기계 위로 지나가게 하면 각 기계로 내리는 데 리프트가 하나씩 든다
  if (lifts > 0) {
    bump(input.liftKo ?? '컨베이어 리프트 Mk.1', lifts, '높이가 바뀌는 지점 — 채굴기 출력구와 기계 입력구 높이가 다릅니다');
  }
  /*
   * 캣워크와 사다리.
   *
   * 왜 필요한가: 기계를 붙여 놓으면 바닥에서 닿지 않는 기계가 생긴다. 클럭을 설정하거나
   * 상태를 보려면 직접 걸어가야 하므로, 닿지 않는 기계에는 접근 수단이 있어야 한다.
   * 캣워크는 허공에 설치할 수 있어서 바닥을 비우지 않고 해결된다 (4×4 m 조각, 티어 1).
   */
  if (unreachable.length > 0) {
    // 캣워크 조각은 4×4 m다. 닿지 않는 기계 위를 지나가는 데 기계당 대략 그 기계 길이만큼 든다.
    const pieces = unreachable.reduce((a, mb) => a + ceilEps(mb.lengthM / 4), 0);
    bump('직선 캣워크', pieces, `바닥에서 닿지 않는 기계 ${unreachable.length}대 위로 지나갑니다`);
    bump('사다리', 1, '캣워크로 올라가는 수단');
  }

  // 6) 전력
  const totalMW = r2(groups.reduce((s, g) => s + g.powerMW, 0));
  const at100 = r2(groups.reduce((s, g) => s + g.powerAt100MW, 0));

  // 7) 특징 — 이 모듈을 어떻게 늘릴 수 있는가
  const features: string[] = [];
  features.push(
    `토대 ${wTiles}×${hTiles}칸(${wTiles * TILE_M}×${hTiles * TILE_M} m). ` +
      '공정 순서대로 위에서 아래로 놓았습니다 — 재료가 한 방향으로 흐릅니다. ' +
      `흐름 길이 ${packed.beltLengthM} m.`
  );
  if (wTiles <= 4 && hTiles <= 4) {
    features.push(
      '청사진 설계소 Mk.1(내부 32 m = 토대 4×4)에 그대로 들어갑니다 — 티어 4에서 이 모듈을 ' +
        '청사진으로 떠서 도장 찍듯 복제할 수 있습니다. 지금 이 폭을 지키는 이유가 그것입니다.'
    );
  } else {
    features.push(
      `폭은 32 m(토대 4칸)로 맞췄지만 길이가 ${hTiles * TILE_M} m라 청사진 설계소 Mk.1(32×32 m)에는 ` +
        '한 번에 안 들어갑니다. 공정 단위로 잘라 두 개의 청사진으로 뜨면 됩니다. ' +
        '발행된 4×4 모듈들은 기계를 손으로 촘촘히 끼워 넣고 토대 밖으로 일부 걸치게 두어 맞춘 것입니다.'
    );
  }
  features.push(
    '좌우 대칭으로 붙여 복제할 수 있습니다 — 채굴량이 늘면 같은 모듈을 하나 더 짓는 쪽이 ' +
      '기존 라인을 뜯어 늘리는 것보다 항상 쉽습니다.'
  );
  if (groups.some((g) => g.clockPercent < 100)) {
    const saved = r2(at100 - totalMW);
    features.push(
      `다운클럭으로 전력 ${saved} MW를 아낍니다 (${at100} → ${totalMW} MW). ` +
        '전력은 클럭의 약 1.32제곱이라 100%로 두면 그만큼 더 먹습니다.'
    );
  }
  if (unreachable.length > 0) {
    features.push(
      `기계 ${unreachable.length}대는 바닥에서 손이 닿지 않습니다 — 기계를 붙여 밀도를 얻은 대가입니다. ` +
        '캣워크를 공중에 깔고 사다리로 올라가면 됩니다. 바닥을 벌려 통로를 만드는 것보다 ' +
        '싸고(철봉 2 + 철판 1 / 조각) 배치도 안 망칩니다.'
    );
  } else {
    features.push('모든 기계에 바닥에서 걸어서 닿습니다 — 캣워크가 필요 없습니다.');
  }
  if (input.futureBelt) {
    const maxFlow = Math.max(...belts.map((b) => b.perMinute), 0);
    if (maxFlow > input.belt.perMinute) {
      features.push(
        `지금 벨트(${input.belt.ko} ${input.belt.perMinute}/분)로는 최대 유량 ${maxFlow}/분을 한 줄로 못 나릅니다. ` +
          `티어 ${input.futureBelt.tier}에서 ${input.futureBelt.ko}(${input.futureBelt.perMinute}/분)가 열리므로, ` +
          '배치는 지금 그대로 두고 벨트만 갈아끼우면 됩니다 — 그래서 기계 간격을 상위 벨트 기준으로 잡았습니다.'
      );
    } else {
      features.push(
        `${input.futureBelt.ko}(티어 ${input.futureBelt.tier})로 갈아끼우면 이 배치 그대로 처리량을 ` +
          `${r2(input.futureBelt.perMinute / input.belt.perMinute)}배까지 올릴 수 있습니다.`
      );
    }
  }

  /*
   * 손으로 짓는 순서.
   *
   * 청사진 설계소는 티어 4에 열린다. 그 전(그리고 그 뒤에도 처음 한 번은)에는 사람이 하나씩
   * 세운다. 그래서 그림과 별개로 **좌표와 방향이 적힌 순서표**가 있어야 한다.
   * 그림 품질이 아무리 나빠도 이 표만 정확하면 지어진다.
   *
   * 원점은 토대 **왼쪽 위 모서리**다. 게임에서 토대를 깔 때 한 모서리를 기준으로 삼는 것이
   * 가장 헷갈리지 않는다.
   */
  const buildSteps: BuildStep[] = [];
  let stepNo = 0;
  const step = (b: Omit<BuildStep, 'no'>) => buildSteps.push({ no: ++stepNo, ...b });

  const pos = (xM: number, yM: number): string => {
    const cx = Math.floor(xM / TILE_M);
    const cy = Math.floor(yM / TILE_M);
    const ox = Math.round(xM - cx * TILE_M);
    const oy = Math.round(yM - cy * TILE_M);
    const cell = `오른쪽 ${cx}칸 · 아래 ${cy}칸`;
    return ox || oy ? `${cell} (칸 안에서 +${ox}m, +${oy}m)` : cell;
  };

  step({
    what: '토대',
    count: wTiles * hTiles,
    where: `${wTiles}×${hTiles}칸 (${wTiles * TILE_M}×${hTiles * TILE_M} m)`,
    why:
      '먼저 바닥을 만든다. 지형 위에 바로 지으면 기계 높이가 제각각이 되어 벨트가 안 맞는다. ' +
      (wTiles <= 4 && hTiles <= 4
        ? '4×4를 지키면 티어 4에서 이 모듈을 그대로 청사진으로 뜰 수 있다.'
        : '폭 4칸(32 m)을 지켰으므로 길이만 잘라 청사진 두 장으로 뜰 수 있다.'),
  });

  for (const m of mining) {
    for (const a of m.assignments) {
      step({
        what: `${a.extractorKo} — ${m.itemKo}`,
        count: 1,
        where: `${a.cell} 노드 위 (${a.purityKo})`,
        setting:
          a.clockPercent < 100
            ? `클럭 ${a.clockPercent}% 또는 목표 산출 ${a.ratePerMinute}/분`
            : '100%',
        why: '채굴기가 모듈 밖 노드 위에 선다. 여기서 나온 벨트가 토대로 들어온다.',
      });
    }
  }

  // 기계 — 공정 순서대로
  const byGroup = new Map<number, typeof machineBoxes>();
  for (const mb of machineBoxes) {
    const list = byGroup.get(mb.gi) ?? [];
    list.push(mb);
    byGroup.set(mb.gi, list);
  }
  groups.forEach((g, gi) => {
    const list = (byGroup.get(gi) ?? []).sort((a, b) => a.yM - b.yM || a.xM - b.xM);
    list.forEach((mb, k) => {
      step({
        what: `${g.machineKo} — ${g.itemKo}${list.length > 1 ? ` (${k + 1}/${list.length})` : ''}`,
        count: 1,
        where: pos(mb.xM, mb.yM),
        facing: mb.rotated ? '90도 돌려서 — 입력이 왼쪽을 향하게' : '입력이 위를 향하게',
        setting:
          g.clockPercent < 100
            ? `목표 산출 ${g.outPerMachinePerMinute}/분 (클럭 ${g.clockPercent}%)`
            : '100%',
        why:
          k === 0
            ? `${g.itemKo}를 만드는 공정. ${g.built}대를 붙여 세운다 — 같은 매니폴드가 먹이므로 사이를 띄우지 않는다.`
            : undefined,
      });
    });
  });

  const splitterPlacements = placements.filter((p) => p.kind === 'splitter');
  const mergerPlacements = placements.filter((p) => p.kind === 'merger');
  for (const a of splitterPlacements) {
    step({
      what: '분배기',
      count: 1,
      where: pos(a.x * TILE_M, a.y * TILE_M),
      why: '분배기 하나가 출력 3개로 기계 3대까지 먹인다. 기계와 겹쳐 놓아도 지어진다.',
    });
  }
  for (const a of mergerPlacements) {
    step({ what: '병합기', count: 1, where: pos(a.x * TILE_M, a.y * TILE_M) });
  }

  step({
    what: `${input.belt.ko} — 연결`,
    count: belts.length,
    where: '아래 연결 목록대로',
    why:
      '기계를 다 세운 뒤 벨트를 잇는다. 먼저 이으면 기계 자리를 잡을 때 걸린다. ' +
      '매니폴드는 처음에 뒤쪽 기계가 굶는다 — 고장이 아니라 버퍼가 차는 중이다.',
  });

  if (unreachable.length > 0) {
    step({
      what: '직선 캣워크 + 사다리',
      count: unreachable.length + 1,
      where: '손이 닿지 않는 기계 위',
      why: '기계를 붙여 세웠으므로 바닥에서 못 닿는 기계가 있다. 캣워크는 공중에 설치된다.',
    });
  }

  return {
    targetKo: solved.root.ko,
    targetId: input.targetItemId,
    targetPerMinute: r2(input.targetPerMinute),
    tier: input.tier,
    belt: input.belt,
    futureBelt: input.futureBelt,
    mining,
    groups,
    placements,
    belts,
    foundation: {
      wTiles,
      hTiles,
      count: wTiles * hTiles,
      sideM: TILE_M,
      /** 청사진 설계소 Mk.1(내부 32 m = 4×4)에 들어가는가 — 티어 4에 그대로 청사진으로 뜰 수 있다 */
      fitsBlueprintMk1: wTiles <= 4 && hTiles <= 4,
    },
    bom: [...bomMap.entries()]
      .filter(([, v]) => v.count > 0 || v.note)
      .map(([ko, v]) => ({ ko, count: v.count, note: v.note })),
    features,
    power: { totalMW, at100MW: at100, savedMW: r2(at100 - totalMW) },
    splitters,
    mergers,
    lifts,
    unreachableMachines: unreachable.length,
    buildSteps,
    notes,
  };
}

/** 배치가 성립하는지 — 겹치는 것이 있으면 도면이 아니다 */
export function validateModule(plan: ModulePlan): string[] {
  const errs: string[] = [];
  /*
   * 겹침 검사는 **기계만** 본다. 분배기·병합기는 게임 데이터상 하드 클리어런스가 없어서
   * (hardBoxes 0) 기계와 겹쳐 지을 수 있다. 그걸 오류로 잡으면 실제로 지을 수 있는 배치를
   * 거부하게 된다.
   */
  const boxes = plan.placements.filter((p) => p.kind === 'machine' || p.kind === 'extractor');
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap =
        a.x < b.x + b.wTiles && b.x < a.x + a.wTiles && a.y < b.y + b.hTiles && b.y < a.y + a.hTiles;
      if (overlap) errs.push(`겹침: ${a.label.split('\n')[0]}(${a.x},${a.y}) ↔ ${b.label.split('\n')[0]}(${b.x},${b.y})`);
    }
  }
  for (const p of boxes) {
    if (p.x < 0 || p.y < 0) errs.push(`토대 밖: ${p.label.split('\n')[0]}`);
    if (p.x + p.wTiles > plan.foundation.wTiles + 1) {
      errs.push(`폭 초과: ${p.label.split('\n')[0]} → x=${p.x + p.wTiles} > ${plan.foundation.wTiles}`);
    }
  }
  for (const g of plan.groups) {
    if (g.built < g.exact - 1e-9) errs.push(`${g.itemKo}: 지은 대수(${g.built})가 필요량(${g.exact})보다 적다`);
    if (g.clockPercent > 100.0001) errs.push(`${g.itemKo}: 클럭 ${g.clockPercent}% — 파워 슈미기 없이 100%를 넘을 수 없다`);
  }
  return errs;
}
