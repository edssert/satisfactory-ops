/**
 * floorplan.ts — 층 단위 설계 도면. (FRD F13)
 *
 * ## 왜 층 단위인가
 *
 * 기계 24대를 한 줄로 늘이면 32×680m 띠가 되어 지을 수 없다. 실제 발행 도면은
 * **층당 소수의 기계를 넣고 층을 쌓는다**(oldshavingfoam, Stackable Concrete Factory Mk.1:
 * 층당 제작기 4대 · 층당 석회석 180/분 → 콘크리트 60/분 · 층당 16 MW · 최대 4층).
 * 최대 층수는 수직 물류(리프트)의 처리량, 즉 **벨트 등급**이 정한다.
 *
 * ## 한 층의 구조 (참고 도면과 같은 대칭 셀)
 *
 *     [입력 알약]→ ║공급║  기계  ║스파인║  기계  ║공급║
 *                  ║ ↓  ║ [분배기]║  ↓   ║[분배기]║ ↓ ║
 *                  ║    ║ [기계] ║[머저]║ [기계] ║   ║
 *                  ║    ║ [기계] ║[머저]║ [기계] ║   ║
 *                              [산출] → [출력 알약]
 *
 *  - 좌우 대칭 2열, 가운데 스파인이 산출을 모아 아래로 뺀다
 *  - 공급 레인은 양 끝 수직 열, 각 기계 앞에 분배기
 *  - 층이 2개 이상이면 리프트 마커를 표시한다
 *
 * 순수 모듈. DOM도 JSON도 모른다.
 */

import { TILE_M, mergersFor, splittersFor, type Footprint } from './layout.ts';

export interface FloorMachine {
  /** 전체 통산 번호 (1부터) */
  index: number;
  x: number;
  y: number;
  w: number;
  l: number;
  clockPercent: number;
}

export interface FloorAttachment {
  kind: 'splitter' | 'merger';
  x: number;
  y: number;
}

export interface BeltRun {
  /** 세로 레인인가 */
  vertical: boolean;
  x: number;
  y: number;
  /** 길이(타일) */
  length: number;
  /** 흐르는 방향 — 아래/오른쪽이 양수 */
  forward: boolean;
  itemKo: string;
  perMinute: number;
  lines: number;
  role: 'supply' | 'spine' | 'output';
}

export interface FloorPlanStage {
  key: string;
  /** 만드는 것 */
  itemKo: string;
  machineKo: string;
  machineEn: string;
  /** 층당 기계 수 */
  perFloor: number;
  /** 필요한 층 수 */
  floors: number;
  /** 마지막 층에 남는 기계 수 (perFloor보다 적을 수 있다) */
  lastFloorMachines: number;
  machinesTotal: number;
  /** 기계 한 대의 값 */
  machinePowerMW: number;
  clockPercent: number;
  /** 층당 입력 (품목별) */
  inputsPerFloor: { itemKo: string; perMinute: number; isFluid: boolean }[];
  /** 층당 산출 */
  outputPerFloor: number;
  /** 기계 한 대의 입력 (블록 안에 적는다) */
  inputPerMachine: { itemKo: string; perMinute: number }[];
  /** 기계 한 대의 산출 */
  outputPerMachine: number;
  /** 층당 전력 */
  powerPerFloorMW: number;
  splittersPerFloor: number;
  mergersPerFloor: number;
  /** 도면 요소 (한 층 기준) */
  machines: FloorMachine[];
  attachments: FloorAttachment[];
  belts: BeltRun[];
  widthTiles: number;
  heightTiles: number;
}

export interface FloorPlan {
  stages: FloorPlanStage[];
  /** 전체에서 가장 많은 층 수 */
  maxFloors: number;
  widthTiles: number;
  heightTiles: number;
  /** 리프트가 필요한가 */
  needsLift: boolean;
  /** 벨트 한 줄 용량 */
  beltPerMinute: number;
  beltKo: string;
}

export interface StageForFloorPlan {
  key: string;
  itemKo: string;
  machineKo: string;
  machineEn: string;
  machinesTotal: number;
  clockPercent?: number;
  footprint: Footprint | null;
  machinePowerMW: number;
  /** 기계 한 대가 먹는 양 */
  inputPerMachine: { itemKo: string; perMinute: number; isFluid: boolean }[];
  /** 기계 한 대가 내는 양 */
  outputPerMachine: number;
}

const ceilEps = (x: number, eps = 1e-6): number => Math.ceil(x - eps);
const round = (n: number): number => Math.round(n * 100) / 100;
const tiles = (m: number): number => Math.max(1, ceilEps(m / TILE_M));

/**
 * 한 층에 몇 대를 넣을 것인가.
 *
 * 참고 도면은 대칭 2열이다. 열당 행 수는 (a) 블루프린트 경계와
 * (b) 공급 벨트 한 줄이 감당할 수 있는 기계 수의 **더 작은 쪽**으로 잡는다.
 * 벨트가 못 나르는 대수를 한 층에 넣으면 끝단 기계가 굶는다.
 */
export function machinesPerFloor(
  stage: StageForFloorPlan,
  beltPerMinute: number,
  maxRowsPerColumn = 4,
  supplyLanes = 2
): number {
  const worstInput = Math.max(
    0,
    ...stage.inputPerMachine.filter((i) => !i.isFluid).map((i) => i.perMinute)
  );
  // 공급 레인이 좌우 2줄이면 용량도 2줄분이다.
  // 참고 도면도 "Iron Ore Input A / B" 두 줄로 넣는다 — 한 줄로 계산하면 층수가 두 배로 뻥튄다.
  const perLane = worstInput > 0 ? Math.max(1, Math.floor(beltPerMinute / worstInput)) : Infinity;
  const beltLimit = perLane === Infinity ? Infinity : perLane * supplyLanes;
  const geometryLimit = maxRowsPerColumn * 2; // 좌우 2열
  return Math.max(1, Math.min(beltLimit, geometryLimit, stage.machinesTotal));
}

/** 공정 하나를 층 단위 도면으로 만든다. */
function planStage(stage: StageForFloorPlan, beltPerMinute: number, beltKo: string): FloorPlanStage {
  const fp = stage.footprint;
  const mw = fp ? tiles(fp.widthM) : 1;
  const ml = fp ? tiles(fp.lengthM) : 1;

  const perFloor = machinesPerFloor(stage, beltPerMinute);
  const floors = Math.max(1, ceilEps(stage.machinesTotal / perFloor));
  const lastFloorMachines = stage.machinesTotal - (floors - 1) * perFloor;

  const perColumn = Math.max(1, Math.ceil(perFloor / 2));
  const useTwoColumns = perFloor > 1;

  // 열 배치: [공급 1] [기계 mw] [스파인 1] [기계 mw] [공급 1]
  const supplyLeftX = 0;
  const colAX = 1;
  const spineX = 1 + mw;
  const colBX = spineX + 1;
  const supplyRightX = colBX + mw;
  const widthTiles = useTwoColumns ? supplyRightX + 1 : colAX + mw + 1;

  const machines: FloorMachine[] = [];
  const attachments: FloorAttachment[] = [];
  const belts: BeltRun[] = [];

  const rowPitch = ml;
  const topPad = 1; // 상단 벨트 진입 여유
  for (let i = 0; i < perFloor; i++) {
    const col = useTwoColumns && i % 2 === 1 ? colBX : colAX;
    const row = Math.floor(i / (useTwoColumns ? 2 : 1));
    machines.push({
      index: i + 1,
      x: col,
      y: topPad + row * rowPitch,
      w: mw,
      l: ml,
      clockPercent: stage.clockPercent ?? 100,
    });
    // 분배기는 기계와 같은 행, 그 기계가 쓰는 공급 레인 위에
    attachments.push({
      kind: 'splitter',
      x: col === colAX ? supplyLeftX : supplyRightX,
      y: topPad + row * rowPitch,
    });
  }

  // 머저는 **줄마다 하나** — 좌우 두 기계의 산출을 스파인에서 합친다.
  // 기계마다 하나씩 넣으면 같은 스파인 칸에 둘이 겹친다.
  for (let row = 0; row < perColumn; row++) {
    attachments.push({ kind: 'merger', x: spineX, y: topPad + row * rowPitch });
  }

  const heightTiles = topPad + perColumn * rowPitch + 1;

  const worstInput = stage.inputPerMachine.filter((i) => !i.isFluid).reduce((a, b) => (b.perMinute > a.perMinute ? b : a), {
    itemKo: '',
    perMinute: 0,
    isFluid: false,
  });
  const inputsPerFloor = stage.inputPerMachine.map((i) => ({
    itemKo: i.itemKo,
    perMinute: round(i.perMinute * perFloor),
    isFluid: i.isFluid,
  }));
  const outputPerFloor = round(stage.outputPerMachine * perFloor);

  // 공급 레인 (좌우)
  const supplyRate = round(worstInput.perMinute * Math.ceil(perFloor / (useTwoColumns ? 2 : 1)));
  belts.push({
    vertical: true,
    x: supplyLeftX,
    y: 0,
    length: heightTiles,
    forward: true,
    itemKo: worstInput.itemKo || (inputsPerFloor[0]?.itemKo ?? ''),
    perMinute: supplyRate,
    lines: Math.max(1, ceilEps(supplyRate / beltPerMinute)),
    role: 'supply',
  });
  if (useTwoColumns) {
    belts.push({
      vertical: true,
      x: supplyRightX,
      y: 0,
      length: heightTiles,
      forward: true,
      itemKo: worstInput.itemKo || (inputsPerFloor[0]?.itemKo ?? ''),
      perMinute: supplyRate,
      lines: Math.max(1, ceilEps(supplyRate / beltPerMinute)),
      role: 'supply',
    });
  }
  // 스파인 (산출 수집)
  belts.push({
    vertical: true,
    x: spineX,
    y: topPad,
    length: heightTiles - topPad,
    forward: true,
    itemKo: stage.itemKo,
    perMinute: outputPerFloor,
    lines: Math.max(1, ceilEps(outputPerFloor / beltPerMinute)),
    role: 'spine',
  });

  return {
    key: stage.key,
    itemKo: stage.itemKo,
    machineKo: stage.machineKo,
    machineEn: stage.machineEn,
    perFloor,
    floors,
    lastFloorMachines,
    machinesTotal: stage.machinesTotal,
    machinePowerMW: stage.machinePowerMW,
    clockPercent: stage.clockPercent ?? 100,
    inputsPerFloor,
    outputPerFloor,
    inputPerMachine: stage.inputPerMachine.map((i) => ({ itemKo: i.itemKo, perMinute: round(i.perMinute) })),
    outputPerMachine: round(stage.outputPerMachine),
    powerPerFloorMW: round(stage.machinePowerMW * perFloor),
    splittersPerFloor: splittersFor(perFloor),
    mergersPerFloor: mergersFor(perFloor),
    machines,
    attachments,
    belts,
    widthTiles,
    heightTiles,
  };
}

export function buildFloorPlan(
  stages: StageForFloorPlan[],
  belt: { ko: string; perMinute: number }
): FloorPlan {
  const planned = stages.map((s) => planStage(s, belt.perMinute, belt.ko));
  return {
    stages: planned,
    maxFloors: Math.max(1, ...planned.map((s) => s.floors)),
    widthTiles: Math.max(1, ...planned.map((s) => s.widthTiles)),
    heightTiles: Math.max(1, ...planned.map((s) => s.heightTiles)),
    needsLift: planned.some((s) => s.floors > 1),
    beltPerMinute: belt.perMinute,
    beltKo: belt.ko,
  };
}

/** 도면 기하 검증 — 기계·부속·벨트가 겹치지 않는지. */
export function validateFloorPlan(plan: FloorPlan): string[] {
  const problems: string[] = [];
  for (const s of plan.stages) {
    const cells = new Map<string, string>();
    const put = (x: number, y: number, what: string) => {
      const k = `${x},${y}`;
      const prev = cells.get(k);
      if (prev) problems.push(`${s.key} ${k}: ${prev} ↔ ${what}`);
      else cells.set(k, what);
    };
    for (const m of s.machines) {
      for (let dx = 0; dx < m.w; dx++) {
        for (let dy = 0; dy < m.l; dy++) put(m.x + dx, m.y + dy, `기계${m.index}`);
      }
    }
    for (const a of s.attachments) put(a.x, a.y, a.kind);

    // 층당 기계 수가 벨트 용량을 넘지 않아야 한다
    const worst = Math.max(0, ...s.inputPerMachine.map((i) => i.perMinute));
    const lanes = s.machines.length > 1 ? 2 : 1;
    if (worst > 0 && worst * s.perFloor > plan.beltPerMinute * lanes + 1e-6) {
      problems.push(
        `${s.key}: 층당 ${s.perFloor}대가 ${worst * s.perFloor}/분을 먹는데 ${plan.beltKo} ${lanes}줄은 ${plan.beltPerMinute * lanes}/분`
      );
    }
    if (s.perFloor * s.floors < s.machinesTotal) {
      problems.push(`${s.key}: 층 배분이 기계 수를 못 담는다 (${s.perFloor}×${s.floors} < ${s.machinesTotal})`);
    }
  }
  return problems;
}
