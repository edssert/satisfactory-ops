/**
 * layout.ts — 생산 계획을 8m 격자 위의 배치로 바꾼다. (FRD F13, P1 단계)
 *
 * 순수 모듈이다. JSON을 import하지 않고 DOM을 모른다. 빌드타임·브라우저·테스트에서 같이 돈다.
 *
 * 이 단계(P1)의 범위: **단층**. 층 분리·양정·리프트는 P3에서 다룬다.
 * 지금은 "8m에 안 들어가는 높이"를 경고로만 남긴다.
 *
 * 설계 규칙의 근거:
 *  - 격자 8m, 건물 치수는 게임 충돌 박스 — docs/research/layout.md, layout-design-tools.md §4
 *  - 분배 방식 판정 — docs/research/layout-expert-techniques.md §1 (FRD F13-J)
 *  - 블루프린트 디자이너 내부 치수 Mk.1 32m / Mk.2 40m / Mk.3 48m — 위키
 */

export const TILE_M = 8;

/** 블루프린트 디자이너 등급별 내부 치수 (m). 티어는 해금 시점. */
export const DESIGNERS = [
  { mk: 1, innerM: 32, tier: 4 },
  { mk: 2, innerM: 40, tier: 6 },
  { mk: 3, innerM: 48, tier: 9 },
] as const;

export type DesignerMk = 1 | 2 | 3;

export interface Footprint {
  widthM: number;
  lengthM: number;
  heightM: number;
}

/** 배치할 공정 하나 — 솔버 결과 한 노드에 대응한다. */
export interface StageInput {
  key: string;
  /** 같은 레시피는 한 라인으로 합친다. 병합 기준 키. */
  recipeId?: string;
  /** 만드는 것 */
  itemKo: string;
  itemEn: string;
  recipeKo: string;
  /** 이 공정이 내야 하는 분당 산출 */
  ratePerMinute: number;
  /** 정확한 기계 대수 (소수). 올림 전 값 */
  machinesExact: number;
  machineId: string;
  machineKo: string;
  machineEn: string;
  footprint: Footprint | null;
  powerMW: number | null;
  /** 이 공정에 들어오는 재료들의 분당 수량 */
  inputs: { itemKo: string; perMinute: number; isFluid: boolean }[];
  /** 기계 한 대의 건설비 */
  buildCost?: { itemKo: string; amount: number }[];
  /** 목표 외 부산물 */
  byproducts: { itemKo: string; perMinute: number }[];
}

export interface BeltSpec {
  ko: string;
  perMinute: number;
  tier: number | null;
}

/** 토대(파운데이션) 규격. 배치는 무조건 이 위에 선다. */
export interface FoundationSpec {
  id: string;
  ko: string;
  /** 8×8 한 장의 건설비 */
  costPerTile: { itemKo: string; amount: number }[];
}

export interface LayoutOptions {
  /** 토대. 넘기면 도면 면적만큼의 장수와 자재를 계산한다 */
  foundation?: FoundationSpec;
  /** 쓸 수 있는 최고 벨트 */
  belt: BeltSpec;
  /** 더 높은 벨트가 있으면 제안에 쓴다 */
  betterBelts?: BeltSpec[];
  /** 블루프린트 디자이너 등급. null이면 미해금(티어 4 미만) */
  designerMk: DesignerMk | null;
  /** 층고 (m). P1은 단층이라 검사에만 쓴다 */
  floorHeightM?: number;
}

export type DistributionKind = 'manifold' | 'injected-manifold' | 'balancer' | 'direct';

export interface Placement {
  /** 격자 좌표 (타일 단위, 좌상단 기준) */
  x: number;
  y: number;
  w: number;
  l: number;
  label: string;
  /** 이 기계가 도는 클럭 (%) — P1은 항상 100 */
  clockPercent: number;
}

export interface Warning {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
}

export interface ModuleLayout {
  key: string;
  title: string;
  /** 이 공정이 만드는 것 — 연결선을 잇는 기준 */
  producesKo: string;
  /** 기계 클래스명 — 화면이 치수·전력을 조회할 때 이름 대신 이걸 쓴다 */
  machineId: string;
  machineKo: string;
  machineEn: string;
  /** 지어야 하는 대수 (올림) */
  machinesBuilt: number;
  machinesExact: number;
  placements: Placement[];
  /**
   * 기계 줄마다 공급 레인이 하나씩 있다.
   * 레인을 맨 위 하나만 두면 아랫줄로 가는 분기선이 다른 기계를 가로지른다 — 지을 수 없는 도면이 된다.
   */
  supplyLanes: { y: number; xFrom: number; xTo: number }[];
  outputLane: { y: number; xFrom: number; xTo: number };
  /** 도면 왼쪽 간선(버스)이 지나갈 열 */
  trunkX: number;
  distribution: DistributionKind;
  /** 왜 이 분배 방식인가 (F13-7) */
  distributionReason: string;
  /** 이 모듈이 차지하는 타일 */
  widthTiles: number;
  lengthTiles: number;
  /** 선택한 디자이너 경계 안에 들어가는가 */
  fitsDesigner: boolean | null;
  /** 안 들어가면 몇 조각으로 나눠야 하는가 */
  stamps: number;
  powerMW: number;
  inputRatePerMinute: number;
  /** 품목별 공급 유량 — 도면 라벨에 쓴다. 합계가 아니라 이게 실제 벨트 단위다 */
  inputBreakdown: { itemKo: string; perMinute: number; isFluid: boolean }[];
  outputRatePerMinute: number;
  /** 이 공정을 먹이는 데 필요한 스플리터 */
  splitters: number;
  /** 산출을 합치는 데 필요한 머저 */
  mergers: number;
  warnings: Warning[];
}

/**
 * 공정 사이를 잇는 벨트. 이게 없으면 도면은 "쌓여 있는 조각들"이지 공장이 아니다.
 *
 * 경로: 생산 공정의 산출 레인 → 왼쪽 간선 채널 → 소비 공정의 공급 레인.
 * 채널은 서로 겹치지 않는 것끼리 재사용한다(구간 색칠).
 */
export interface Connection {
  fromKey: string;
  toKey: string;
  itemKo: string;
  perMinute: number;
  /** 이 유량을 나르는 데 필요한 벨트 줄 수 */
  lines: number;
  /** 왼쪽 간선 채널 번호 (0이 격자에 가장 가까움) */
  channel: number;
  fromY: number;
  toY: number;
}

/** 외부에서 들어오는 원자재 — 채굴기에서 오는 벨트 */
export interface ExternalInput {
  toKey: string;
  itemKo: string;
  perMinute: number;
  lines: number;
  isFluid: boolean;
  y: number;
  channel: number;
}

export interface LayoutResult {
  modules: ModuleLayout[];
  /** 공정 간 벨트 */
  connections: Connection[];
  /** 외부 공급 (원자재) */
  externals: ExternalInput[];
  /** 간선 채널 총 개수 — 도면 왼쪽에 확보할 폭 */
  channels: number;
  totalWidthTiles: number;
  totalLengthTiles: number;
  totalPowerMW: number;
  totalMachines: number;
  totalSplitters: number;
  totalMergers: number;
  /** 전주 — 연결 4개 중 1개를 체인에 쓴다는 가정 */
  powerPoles: number;
  /** 토대 — 도면 전체 면적을 덮는 데 필요한 장수와 자재 */
  foundation: { ko: string; tiles: number; cost: { itemKo: string; amount: number }[] } | null;
  /** 기계 + 토대 건설 자재 합계 (F13-28) */
  buildCost: { itemKo: string; amount: number }[];
  warnings: Warning[];
  /** 도면 전체가 성립하는가 — error가 하나라도 있으면 false */
  ok: boolean;
}

const ceilEps = (x: number, eps = 1e-6): number => Math.ceil(x - eps);

/**
 * 부속 수량 규칙 — 실제 발행 설계 시트와 대조해 확인했다.
 *
 *  - 스플리터: 입력 1 / 출력 3 → 기계 k대를 한 벨트로 먹이려면 `ceil((k-1)/2)`개
 *  - 머저: 입력 3 / 출력 1 → 산출 m줄을 합치려면 `ceil((m-1)/2)`개
 *  - 전주 Mk.1: 연결 4개, 1개를 다음 전주로 넘김 → 기계 n대에 `ceil(n/3)`개
 *
 * 검증: "IRON PLATES" 시트(제련기 4 + 제작기 4)가 스플리터 2 / 머저 2 / 전주 4를 요구한다.
 * 제련기 4대를 벨트 2줄로 먹이면 2×ceil(1/2)=2, 제작기 4대 산출 합치면 ceil(3/2)=2,
 * 전주는 기계 8대 + 채굴기 2대 = ceil(10/3)=4. 전부 일치한다.
 */
export const splittersFor = (machines: number): number =>
  machines <= 1 ? 0 : Math.ceil((machines - 1) / 2);
export const mergersFor = (outputs: number): number =>
  outputs <= 1 ? 0 : Math.ceil((outputs - 1) / 2);
export const polesFor = (machines: number): number => (machines <= 0 ? 0 : Math.ceil(machines / 3));
const tiles = (meters: number): number => Math.max(1, ceilEps(meters / TILE_M));

/**
 * 분배 방식을 고른다.
 *
 * **품목마다 벨트가 따로다.** 재료 유량을 전부 더해서 판정하면 안 된다 —
 * 철판 360/분과 나사 720/분은 각자 자기 벨트를 타고 온다. 가장 많이 흐르는 품목이 판정을 지배한다.
 *
 * "매니폴드가 기본"이지만 무조건은 아니다: 한 품목이라도 벨트 1줄을 넘으면
 * 단일 매니폴드는 **성립하지 않는다**(끝단 기계가 영구히 굶는다).
 */
export function chooseDistribution(
  machineCount: number,
  inputs: { itemKo: string; perMinute: number; isFluid: boolean }[],
  belt: BeltSpec
): { kind: DistributionKind; reason: string; lines: number; binding: string | null } {
  if (machineCount <= 1) {
    return {
      kind: 'direct',
      reason: '기계가 한 대뿐이라 분배가 필요 없다. 벨트를 바로 연결한다.',
      lines: 1,
      binding: null,
    };
  }

  const solids = inputs.filter((i) => !i.isFluid && i.perMinute > 0);
  if (solids.length === 0) {
    return {
      kind: 'direct',
      reason: '고체 입력이 없다. 유체 배관만 연결하면 된다.',
      lines: 1,
      binding: null,
    };
  }

  const worst = solids.reduce((a, b) => (b.perMinute > a.perMinute ? b : a));
  const lines = ceilEps(worst.perMinute / belt.perMinute);
  const detail = solids.map((i) => `${i.itemKo} ${round(i.perMinute)}/분`).join(' · ');
  const others = solids
    .filter((i) => i !== worst)
    .map((i) => `${i.itemKo} ${round(i.perMinute)}/분`)
    .join(' · ');

  if (lines <= 1) {
    return {
      kind: 'manifold',
      reason:
        `품목별 소요(${detail})가 모두 ${belt.ko} 한 줄(${belt.perMinute}/분) 안에 들어간다. ` +
        '매니폴드가 자재·공간·확장성에서 앞선다.',
      lines: 1,
      binding: worst.itemKo,
    };
  }
  return {
    kind: 'injected-manifold',
    reason:
      `${worst.itemKo} ${round(worst.perMinute)}/분이 ${belt.ko} 한 줄(${belt.perMinute}/분)을 넘는다. ` +
      `단일 매니폴드로는 끝단 기계가 굶는다. 이 품목만 ${lines}줄로 나눠 중간에 병합하는 인젝티드 매니폴드가 필요하다.` +
      (others.length ? ` (나머지: ${others})` : ''),
    lines,
    binding: worst.itemKo,
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * 같은 레시피를 쓰는 공정을 하나로 합친다.
 *
 * 솔버는 트리를 낸다. 철 주괴는 철판 가지와 철봉 가지에 각각 매달려 두 번 나온다.
 * 그대로 배치하면 제련기 6대짜리 라인과 18대짜리 라인이 따로 서는 도면이 된다 —
 * 실제 공장이라면 24대 한 라인이다. 도면은 트리가 아니라 **공장**을 그려야 한다.
 */
export function mergeStages(stages: StageInput[]): StageInput[] {
  const byRecipe = new Map<string, StageInput>();
  const order: string[] = [];

  for (const s of stages) {
    const key = s.recipeId ?? s.key;
    const hit = byRecipe.get(key);
    if (!hit) {
      byRecipe.set(key, {
        ...s,
        inputs: s.inputs.map((i) => ({ ...i })),
        byproducts: s.byproducts.map((b) => ({ ...b })),
      });
      order.push(key);
      continue;
    }
    hit.ratePerMinute += s.ratePerMinute;
    hit.machinesExact += s.machinesExact;
    for (const i of s.inputs) {
      const found = hit.inputs.find((x) => x.itemKo === i.itemKo);
      if (found) found.perMinute += i.perMinute;
      else hit.inputs.push({ ...i });
    }
    for (const b of s.byproducts) {
      const found = hit.byproducts.find((x) => x.itemKo === b.itemKo);
      if (found) found.perMinute += b.perMinute;
      else hit.byproducts.push({ ...b });
    }
  }

  return order.map((k) => byRecipe.get(k)!);
}

/** 공정 하나를 격자에 앉힌다. 기계를 한 줄로 늘어놓고 한쪽에 공급 레인, 반대쪽에 산출 레인을 둔다. */
function layoutStage(stage: StageInput, opts: LayoutOptions, originY: number): ModuleLayout {
  const warnings: Warning[] = [];
  const built = ceilEps(stage.machinesExact);
  const fp = stage.footprint;

  if (!fp) {
    warnings.push({
      level: 'error',
      code: 'no-footprint',
      message: `${stage.machineKo}의 치수가 데이터에 없어 배치할 수 없습니다.`,
    });
  }

  const mw = fp ? tiles(fp.widthM) : 1;
  const ml = fp ? tiles(fp.lengthM) : 1;

  const inputRate = stage.inputs.reduce((n, i) => n + i.perMinute, 0);
  const dist = chooseDistribution(built, stage.inputs, opts.belt);
  const worstSolid = Math.max(
    0,
    ...stage.inputs.filter((i) => !i.isFluid).map((i) => i.perMinute)
  );

  const designer = opts.designerMk ? DESIGNERS.find((d) => d.mk === opts.designerMk)! : null;
  const innerTiles = designer ? Math.floor(designer.innerM / TILE_M) : null;

  // 한 줄에 몇 대까지 놓을 것인가.
  // 디자이너가 있으면 그 폭에 맞추고, 없으면 **Mk.1 폭(32m)에 맞춘다** —
  // 티어 4에 그대로 블루프린트로 묶을 수 있게 하려는 것이다 (F13-19).
  const rowTiles = innerTiles ?? Math.floor(DESIGNERS[0].innerM / TILE_M);
  const perRow = Math.max(1, Math.floor(rowTiles / mw));
  const rows = Math.max(1, Math.ceil(built / perRow));

  // 줄 구성: [공급 레인 1타일] + [기계 ml타일] 을 줄 수만큼 쌓고, 맨 아래에 산출 레인 1타일.
  const rowPitch = 1 + ml;
  const placements: Placement[] = [];
  const supplyLanes: { y: number; xFrom: number; xTo: number }[] = [];
  const widthTiles = Math.min(built, perRow) * mw;

  for (let r = 0; r < rows; r++) {
    supplyLanes.push({ y: originY + r * rowPitch, xFrom: 0, xTo: widthTiles });
  }
  for (let i = 0; i < built; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    placements.push({
      x: col * mw,
      y: originY + row * rowPitch + 1,
      w: mw,
      l: ml,
      label: stage.machineKo,
      clockPercent: 100,
    });
  }

  const lengthTiles = rows * rowPitch + 1;
  const outputLane = { y: originY + rows * rowPitch, xFrom: 0, xTo: widthTiles };

  // 디자이너 경계 검사 (F13-16)
  let fitsDesigner: boolean | null = null;
  let stamps = 1;
  if (designer && fp) {
    if (fp.widthM > designer.innerM || fp.lengthM > designer.innerM) {
      fitsDesigner = false;
      stamps = 0;
      warnings.push({
        level: 'error',
        code: 'machine-too-big',
        message:
          `${stage.machineKo}는 ${fp.widthM}×${fp.lengthM}m로 Mk.${designer.mk} 디자이너 내부 ` +
          `${designer.innerM}m를 넘습니다. 이 등급 블루프린트에는 넣을 수 없습니다.`,
      });
    } else {
      const perStamp = Math.max(1, Math.floor(innerTiles! / mw)) * Math.max(1, Math.floor(innerTiles! / (ml + 1)));
      stamps = Math.max(1, ceilEps(built / perStamp));
      fitsDesigner = stamps === 1;
      if (!fitsDesigner) {
        warnings.push({
          level: 'info',
          code: 'needs-stamps',
          message:
            `기계 ${built}대는 Mk.${designer.mk}(${designer.innerM}m) 한 장에 안 들어갑니다. ` +
            `한 장에 ${perStamp}대씩, 총 ${stamps}장을 찍으면 됩니다.`,
        });
      }
    }
  }

  // 벨트 상한 (F13-5, F13-52)
  if (dist.lines > 1) {
    const better = (opts.betterBelts ?? []).find((b) => b.perMinute >= worstSolid);
    warnings.push({
      level: 'warn',
      code: 'belt-over-capacity',
      message: better
        ? `${dist.binding} ${round(worstSolid)}/분은 ${opts.belt.ko} 한 줄로 못 나릅니다. ${better.ko}(${better.perMinute}/분) 한 줄이면 됩니다` +
          (better.tier != null ? ` — 티어 ${better.tier}에 해금됩니다.` : '.')
        : `${dist.binding} ${round(worstSolid)}/분은 최고 등급 벨트로도 한 줄에 안 들어갑니다. ${dist.lines}줄로 나눠야 합니다.`,
    });
  }

  // 부산물 (F13-56)
  if (stage.byproducts.length > 0) {
    warnings.push({
      level: 'warn',
      code: 'byproduct',
      message:
        `${stage.byproducts.map((b) => `${b.itemKo} ${round(b.perMinute)}/분`).join(' · ')}이 함께 나옵니다. ` +
        '양쪽 산출을 모두 빼지 않으면 라인 전체가 멈춥니다.',
    });
  }

  // 유체 (P3 예고)
  if (stage.inputs.some((i) => i.isFluid)) {
    warnings.push({
      level: 'info',
      code: 'fluid',
      message: '유체 입력이 있습니다. 파이프 양정 때문에 이 공정은 1층에 두는 것이 안전합니다.',
    });
  }

  // 층고 (P3 예고)
  const floorH = opts.floorHeightM ?? TILE_M;
  if (fp && fp.heightM > floorH) {
    warnings.push({
      level: 'info',
      code: 'tall-machine',
      message: `${stage.machineKo}는 높이 ${fp.heightM}m로 층고 ${floorH}m를 넘습니다. 층을 ${ceilEps(fp.heightM / floorH)}개분 차지합니다.`,
    });
  }

  return {
    key: stage.key,
    title: `${stage.itemKo} ${round(stage.ratePerMinute)}/분`,
    producesKo: stage.itemKo,
    machineId: stage.machineId,
    machineKo: stage.machineKo,
    machineEn: stage.machineEn,
    machinesBuilt: built,
    machinesExact: stage.machinesExact,
    placements,
    supplyLanes,
    outputLane,
    trunkX: -1,
    distribution: dist.kind,
    distributionReason: dist.reason,
    widthTiles,
    lengthTiles,
    fitsDesigner,
    stamps,
    powerMW: (stage.powerMW ?? 0) * built,
    inputRatePerMinute: round(inputRate),
    inputBreakdown: stage.inputs.map((i) => ({ ...i, perMinute: round(i.perMinute) })),
    outputRatePerMinute: round(stage.ratePerMinute),
    splitters: splittersFor(built),
    mergers: mergersFor(built),
    warnings,
  };
}

/** 전체 배치를 만든다. 공정을 세로로 쌓고 각 공정 사이에 레인을 둔다. */
export function planLayout(rawStages: StageInput[], opts: LayoutOptions): LayoutResult {
  const stages = mergeStages(rawStages);
  const modules: ModuleLayout[] = [];
  let y = 0;
  for (const stage of stages) {
    const m = layoutStage(stage, opts, y);
    modules.push(m);
    y += m.lengthTiles + 1; // 모듈 사이 통로 1타일
  }

  const warnings: Warning[] = [];

  // 블루프린트 미해금 안내 (F13-19)
  if (!opts.designerMk) {
    warnings.push({
      level: 'info',
      code: 'no-designer',
      message:
        '블루프린트 디자이너는 티어 4에 열립니다. 지금은 손으로 짓게 되지만, ' +
        '이 도면은 32m(4타일) 배수로 정렬해 두었으므로 티어 4에서 그대로 블루프린트로 묶을 수 있습니다.',
    });
  }

  const totalWidthTiles = Math.max(0, ...modules.map((m) => m.widthTiles));
  const totalLengthTiles = modules.reduce((n, m) => n + m.lengthTiles + 1, 0);
  const totalPowerMW = modules.reduce((n, m) => n + m.powerMW, 0);
  const totalMachines = modules.reduce((n, m) => n + m.machinesBuilt, 0);

  // ── 공정 간 연결 ─────────────────────────────────────────────
  // 어떤 공정의 산출을 어떤 공정이 먹는가. 위(원자재)에서 아래(완제품)로 흐른다.
  const produced = new Map<string, number>(); // itemKo -> module index
  modules.forEach((m, i) => produced.set(m.producesKo, i));

  const rawConnections: Omit<Connection, 'channel'>[] = [];
  const rawExternals: Omit<ExternalInput, 'channel'>[] = [];

  modules.forEach((m, i) => {
    const stage = stages[i]!;
    const supplyY = m.supplyLanes[0]?.y ?? 0;
    for (const input of stage.inputs) {
      const fromIdx = produced.get(input.itemKo);
      if (fromIdx !== undefined && fromIdx !== i) {
        rawConnections.push({
          fromKey: modules[fromIdx]!.key,
          toKey: m.key,
          itemKo: input.itemKo,
          perMinute: round(input.perMinute),
          lines: input.isFluid ? 1 : ceilEps(input.perMinute / opts.belt.perMinute),
          fromY: modules[fromIdx]!.outputLane.y,
          toY: supplyY,
        });
      } else {
        rawExternals.push({
          toKey: m.key,
          itemKo: input.itemKo,
          perMinute: round(input.perMinute),
          lines: input.isFluid ? 1 : ceilEps(input.perMinute / opts.belt.perMinute),
          isFluid: input.isFluid,
          y: supplyY,
        });
      }
    }
  });

  // 채널 배정 — 세로 구간이 겹치지 않는 연결은 같은 열을 쓴다
  const channelBottom: number[] = [];
  const assign = (top: number, bottom: number): number => {
    const lo = Math.min(top, bottom);
    const hi = Math.max(top, bottom);
    for (let c = 0; c < channelBottom.length; c++) {
      if (channelBottom[c]! < lo) {
        channelBottom[c] = hi;
        return c;
      }
    }
    channelBottom.push(hi);
    return channelBottom.length - 1;
  };

  const connections: Connection[] = [...rawConnections]
    .sort((a, b) => Math.min(a.fromY, a.toY) - Math.min(b.fromY, b.toY))
    .map((c) => ({ ...c, channel: assign(c.fromY, c.toY) }));

  // 외부 공급은 격자 바로 옆 채널에서 들어온다 (세로로 흐르지 않으므로 채널을 점유하지 않는다)
  const externals: ExternalInput[] = rawExternals.map((e) => ({ ...e, channel: 0 }));
  const channels = Math.max(1, channelBottom.length);

  // 토대 — 배치는 무조건 파운데이션 위에 선다. 도면 면적을 덮는 장수를 센다.
  const cost = new Map<string, number>();
  const add = (itemKo: string, amount: number) => cost.set(itemKo, (cost.get(itemKo) ?? 0) + amount);

  for (let i = 0; i < stages.length; i++) {
    for (const c of stages[i]!.buildCost ?? []) add(c.itemKo, c.amount * modules[i]!.machinesBuilt);
  }

  let foundation: LayoutResult['foundation'] = null;
  if (opts.foundation) {
    const tilesNeeded = totalWidthTiles * totalLengthTiles;
    const fCost = opts.foundation.costPerTile.map((c) => ({
      itemKo: c.itemKo,
      amount: c.amount * tilesNeeded,
    }));
    for (const c of fCost) add(c.itemKo, c.amount);
    foundation = { ko: opts.foundation.ko, tiles: tilesNeeded, cost: fCost };
  }

  const all = [...warnings, ...modules.flatMap((m) => m.warnings)];
  return {
    modules,
    connections,
    externals,
    channels,
    totalWidthTiles,
    totalLengthTiles,
    totalPowerMW: round(totalPowerMW),
    totalMachines,
    totalSplitters: modules.reduce((n, m) => n + m.splitters, 0),
    totalMergers: modules.reduce((n, m) => n + m.mergers, 0),
    powerPoles: polesFor(totalMachines),
    foundation,
    buildCost: [...cost.entries()]
      .map(([itemKo, amount]) => ({ itemKo, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount),
    warnings,
    ok: !all.some((w) => w.level === 'error'),
  };
}

/**
 * 도면 기하 검증. 겹치면 그건 도면이 아니라 그림이다.
 *
 * 검사 항목:
 *  1. 기계끼리 겹치지 않는가
 *  2. 기계가 벨트 레인 위에 올라앉지 않았는가
 *  3. 레인끼리 같은 줄을 쓰지 않는가
 *  4. 모듈끼리 세로로 겹치지 않는가
 */
export function validateGeometry(result: LayoutResult): string[] {
  const problems = [...findOverlaps(result)].map((o) => `기계 겹침 ${o}`);

  const laneRows = new Set<number>();
  for (const m of result.modules) {
    const lanes = [...m.supplyLanes, m.outputLane];
    for (const lane of lanes) {
      if (laneRows.has(lane.y)) problems.push(`레인 중복: y=${lane.y} (${m.key})`);
      laneRows.add(lane.y);
    }
    for (const p of m.placements) {
      for (let dy = 0; dy < p.l; dy++) {
        const row = p.y + dy;
        if (lanes.some((l) => l.y === row)) {
          problems.push(`기계가 레인 위에 있음: ${m.key} y=${row}`);
        }
      }
    }
  }

  // 모듈 간 세로 겹침
  const spans = result.modules.map((m) => {
    const ys = [...m.placements.map((p) => p.y), ...m.supplyLanes.map((l) => l.y), m.outputLane.y];
    return { key: m.key, top: Math.min(...ys), bottom: Math.max(...m.placements.map((p) => p.y + p.l - 1), m.outputLane.y) };
  });
  for (let i = 1; i < spans.length; i++) {
    if (spans[i]!.top <= spans[i - 1]!.bottom) {
      problems.push(`모듈 세로 겹침: ${spans[i - 1]!.key} ↔ ${spans[i]!.key}`);
    }
  }

  return problems;
}

/** 배치가 겹치는지 검사한다. 생성기의 자기 검증용 — 겹치면 도면이 거짓말이다. */
export function findOverlaps(result: LayoutResult): string[] {
  const cells = new Map<string, string>();
  const hits: string[] = [];
  for (const m of result.modules) {
    for (const p of m.placements) {
      for (let dx = 0; dx < p.w; dx++) {
        for (let dy = 0; dy < p.l; dy++) {
          const key = `${p.x + dx},${p.y + dy}`;
          const prev = cells.get(key);
          if (prev) hits.push(`${key}: ${prev} ↔ ${m.key}`);
          else cells.set(key, m.key);
        }
      }
    }
  }
  return hits;
}
