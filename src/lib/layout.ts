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
  /** 목표 외 부산물 */
  byproducts: { itemKo: string; perMinute: number }[];
}

export interface BeltSpec {
  ko: string;
  perMinute: number;
  tier: number | null;
}

export interface LayoutOptions {
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
  machineKo: string;
  machineEn: string;
  /** 지어야 하는 대수 (올림) */
  machinesBuilt: number;
  machinesExact: number;
  placements: Placement[];
  /** 공급 레인 (매니폴드 벨트가 지나가는 줄) */
  supplyLane: { x: number; y: number; lengthTiles: number };
  outputLane: { x: number; y: number; lengthTiles: number };
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
  warnings: Warning[];
}

export interface LayoutResult {
  modules: ModuleLayout[];
  totalWidthTiles: number;
  totalLengthTiles: number;
  totalPowerMW: number;
  totalMachines: number;
  warnings: Warning[];
  /** 도면 전체가 성립하는가 — error가 하나라도 있으면 false */
  ok: boolean;
}

const ceilEps = (x: number, eps = 1e-6): number => Math.ceil(x - eps);
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

  const placements: Placement[] = [];
  for (let i = 0; i < built; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    placements.push({
      x: col * mw,
      y: originY + row * (ml + 2) + 1, // +1 = 공급 레인 한 줄
      w: mw,
      l: ml,
      label: stage.machineKo,
      clockPercent: 100,
    });
  }

  const widthTiles = Math.min(built, perRow) * mw;
  const lengthTiles = rows * (ml + 2);

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
    machineKo: stage.machineKo,
    machineEn: stage.machineEn,
    machinesBuilt: built,
    machinesExact: stage.machinesExact,
    placements,
    supplyLane: { x: 0, y: originY, lengthTiles: widthTiles },
    outputLane: { x: 0, y: originY + lengthTiles - 1, lengthTiles: widthTiles },
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
    warnings,
  };
}

/** 전체 배치를 만든다. 공정을 세로로 쌓고 각 공정 사이에 레인을 둔다. */
export function planLayout(stages: StageInput[], opts: LayoutOptions): LayoutResult {
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

  const all = [...warnings, ...modules.flatMap((m) => m.warnings)];
  return {
    modules,
    totalWidthTiles,
    totalLengthTiles,
    totalPowerMW: round(totalPowerMW),
    totalMachines,
    warnings,
    ok: !all.some((w) => w.level === 'error'),
  };
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
