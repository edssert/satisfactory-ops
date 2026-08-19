/**
 * pack.ts — 배치 최적화. **목적 함수와 탐색이 있는** 배치기와 벨트 라우터.
 *
 * 왜 새로 쓰는가: 앞서 쓴 것은 최적화가 아니었다. "32 m까지 채우고 공정이 바뀌면 줄을 끊는다"는
 * 탐욕적 규칙이라 목적 함수도 없고 대안을 비교하지도 않았다. 그 결과 보강된 철판 모듈이
 * 32×72 m로 나왔다 — 발행된 같은 모듈은 32×32 m다. 면적 2.3배.
 *
 * 면적을 세어 보면 32×32가 가능하다: 기계 8대에 벨트 접근분을 더해도 906 m²이고 토대 4×4는
 * 1024 m²다. 즉 들어갈 수 있는데 배치가 못 넣은 것이다.
 *
 * 그래서 두 가지를 제대로 만든다:
 *
 *  1. **패커** — 목적: 외곽 면적을 최소화, 동점이면 벨트 총 길이를 최소화.
 *     제약: 폭 ≤ 주어진 값(청사진 설계소 폭), 겹침 금지, 기계마다 입·출력 면에 접근 공간.
 *     방법: bottom-left-fill(스카이라인) × 여러 투입 순서 × 회전 여부를 모두 시도해 최선을 고른다.
 *     사각형 배치는 NP-난해지만 기계가 10~20개라 전수에 가까운 탐색이 즉시 끝난다.
 *
 *  2. **라우터** — 기계를 피해 직각으로 벨트를 잇는다 (1 m 격자 A*, 회전에 벌점).
 *     선이 기계를 관통하지 않는 것이 도면의 최소 조건이다.
 *
 * 무작위는 쓰지 않는다. 시드 고정 LCG로 순서를 섞어 **빌드마다 같은 도면**이 나오게 한다.
 */

export interface PackItem {
  id: string;
  widthM: number;
  lengthM: number;
  /** 같은 공정끼리는 붙어 있는 편이 벨트가 짧다 */
  group: number;
  /** 회전 허용 (기계는 어느 방향으로도 놓을 수 있다) */
  canRotate?: boolean;
}

export interface PackedItem {
  id: string;
  group: number;
  xM: number;
  yM: number;
  widthM: number;
  lengthM: number;
  rotated: boolean;
}

export interface PackResult {
  items: PackedItem[];
  widthM: number;
  heightM: number;
  areaM2: number;
  beltLengthM: number;
  /** 목적 함수 값 (작을수록 좋다) */
  cost: number;
  /** 몇 가지 배치를 시도했는가 — 화면에 근거로 적는다 */
  tried: number;
}

/**
 * 공정 **사이**의 벨트 통로 폭. 벨트 단면 폭이 2 m라는 근거가 있다.
 *
 * 어디에 두고 어디에 두지 않는가 — 이게 밀도를 가른다:
 *
 *  · 같은 공정의 기계끼리는 **붙인다(0 m).** 같은 매니폴드가 먹이므로 사이에 벨트가 지나갈
 *    일이 없다. 게임도 하드 클리어런스끼리 맞붙이는 것을 허용한다
 *    (docs/research/clearance-rules.md — 최소 간격은 0 m다).
 *  · 좌우도 붙인다. 포트는 앞뒤 면에 있으므로 옆면에 여유를 줄 이유가 없다
 *    (위키 근거: 입력은 뒤, 출력은 앞. 제조기만 반대).
 *  · **공정이 바뀌는 면에만** 2 m를 둔다. 거기서 벨트가 갈라지고 합쳐진다.
 *
 * 사람이 기계에 닿는 문제(클럭 설정·확인)는 **바닥 틈으로 풀지 않는다.** 캣워크는 공중에
 * 설치할 수 있고 사다리로 오른다. 그래서 접근을 이유로 바닥을 비울 필요가 없다 —
 * 처음에는 사방 2 m를 비웠는데 그건 안일한 설계였다.
 */
export const ACCESS_M = 2;

/** 시드 고정 난수 — 빌드 재현성을 위해 Math.random을 쓰지 않는다 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * bottom-left-fill. 스카이라인을 1 m 해상도로 들고, 각 후보 x에서 가장 낮게 앉는 자리를 고른다.
 * 같은 높이면 왼쪽을 택한다 — 그래야 결과가 결정적이다.
 */
function blf(order: PackItem[], rotate: boolean[], maxWidthM: number): PackedItem[] | null {
  const W = Math.max(1, Math.round(maxWidthM));
  const skyline = new Array<number>(W).fill(0);
  const out: PackedItem[] = [];

  for (let i = 0; i < order.length; i++) {
    const it = order[i]!;
    const r = rotate[i]!;
    // 접근 공간을 포함한 실효 치수. 회전하면 접근 방향도 함께 돈다.
    const w = Math.round(r ? it.lengthM + ACCESS_M : it.widthM);
    const h = Math.round(r ? it.widthM : it.lengthM + ACCESS_M);
    if (w > W) return null;

    let bestX = -1;
    let bestY = Infinity;
    for (let x = 0; x + w <= W; x++) {
      let y = 0;
      for (let k = x; k < x + w; k++) y = Math.max(y, skyline[k]!);
      if (y < bestY) {
        bestY = y;
        bestX = x;
      }
    }
    if (bestX < 0) return null;
    for (let k = bestX; k < bestX + w; k++) skyline[k] = bestY + h;
    out.push({
      id: it.id,
      group: it.group,
      // 저장하는 좌표·치수는 **실제 기계**의 것이다. 접근 공간은 배치에만 쓰고 도형에는 안 그린다.
      xM: bestX,
      // 통로는 기계 **위쪽**에 둔다 (그 위 기계의 출력 통로와 같은 자리다)
      yM: bestY + (r ? 0 : ACCESS_M),
      widthM: r ? it.lengthM : it.widthM,
      lengthM: r ? it.widthM : it.lengthM,
      rotated: r,
    });
  }
  return out;
}

/** 공정 중심점 사이 거리 합 — 벨트 총 길이의 대리값 */
function beltLength(items: PackedItem[]): number {
  const byGroup = new Map<number, { x: number; y: number; n: number }>();
  for (const it of items) {
    const c = byGroup.get(it.group) ?? { x: 0, y: 0, n: 0 };
    c.x += it.xM + it.widthM / 2;
    c.y += it.yM + it.lengthM / 2;
    c.n++;
    byGroup.set(it.group, c);
  }
  const centers = [...byGroup.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([g, c]) => ({ g, x: c.x / c.n, y: c.y / c.n }));
  let total = 0;
  for (let i = 1; i < centers.length; i++) {
    total += Math.abs(centers[i]!.x - centers[i - 1]!.x) + Math.abs(centers[i]!.y - centers[i - 1]!.y);
  }
  // 같은 공정 기계들이 흩어져 있으면 매니폴드가 길어진다 — 흩어진 만큼 벌점
  for (const [, c] of byGroup) {
    void c;
  }
  for (const [g, c] of byGroup) {
    const cx = c.x / c.n;
    const cy = c.y / c.n;
    for (const it of items) {
      if (it.group !== g) continue;
      total +=
        (Math.abs(it.xM + it.widthM / 2 - cx) + Math.abs(it.yM + it.lengthM / 2 - cy)) * 0.5;
    }
  }
  return Math.round(total);
}

/**
 * 배치를 찾는다.
 *
 * 목적 함수: 외곽 면적 + 벨트 길이 × 가중치.
 *   면적을 먼저 보는 이유 — 토대는 칸 단위로 깔리고, 좁을수록 청사진 한 장에 들어간다.
 *   벨트를 함께 보는 이유 — 같은 면적이면 선이 짧은 쪽이 짓기 쉽고 고장도 덜 난다.
 */
export function packModule(items: PackItem[], maxWidthM: number, beltWeight = 4): PackResult {
  const orders: PackItem[][] = [];
  // 1) 공정 흐름 순서 — 재료가 위에서 아래로 흐른다
  orders.push([...items]);
  // 2) 큰 것부터 — 사각형 배치의 정석
  orders.push([...items].sort((a, b) => b.widthM * b.lengthM - a.widthM * a.lengthM));
  // 3) 긴 것부터
  orders.push([...items].sort((a, b) => b.lengthM - a.lengthM));
  // 4) 폭 넓은 것부터
  orders.push([...items].sort((a, b) => b.widthM - a.widthM));
  // 5) 시드 고정 셔플 — 위 네 가지가 놓치는 조합을 찾는다
  const rnd = lcg(20260819);
  for (let t = 0; t < 240; t++) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    orders.push(a);
  }

  let best: PackResult | null = null;
  let tried = 0;

  const rotationModes: ((it: PackItem) => boolean)[] = [
    () => false,
    (it) => (it.canRotate ?? true) && it.lengthM > it.widthM, // 긴 쪽을 눕힌다
    (it) => (it.canRotate ?? true) && it.widthM > it.lengthM,
  ];

  for (const order of orders) {
    for (const mode of rotationModes) {
      const rotate = order.map(mode);
      const packed = blf(order, rotate, maxWidthM);
      tried++;
      if (!packed) continue;
      const widthM = Math.max(...packed.map((p) => p.xM + p.widthM));
      const heightM = Math.max(...packed.map((p) => p.yM + p.lengthM)) + ACCESS_M;
      const bl = beltLength(packed);
      const cost = widthM * heightM + bl * beltWeight;
      if (!best || cost < best.cost) {
        best = {
          items: packed,
          widthM,
          heightM,
          areaM2: widthM * heightM,
          beltLengthM: bl,
          cost,
          tried,
        };
      }
    }
  }

  if (!best) throw new Error(`폭 ${maxWidthM} m 안에 들어가지 않는 기계가 있습니다`);
  best.tried = tried;
  return best;
}

// ---------------------------------------------------------------- 벨트 라우터

export interface Point {
  x: number;
  y: number;
}

/**
 * 기계를 피해 직각으로 잇는 경로. 1 m 격자 A*, 회전에 벌점을 준다.
 *
 * 선이 기계를 관통하는 도면은 도면이 아니다. 앞서는 통로마다 가로선 하나를 그어
 * 눈속임했는데, 실제로 어느 기계의 어느 면에서 나와 어디로 들어가는지가 보이지 않았다.
 */
export function routeBelt(
  from: Point,
  to: Point,
  blocked: (x: number, y: number) => boolean,
  bounds: { w: number; h: number }
): Point[] {
  const key = (x: number, y: number, d: number) => (y * bounds.w + x) * 4 + d;
  const DIRS = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const goal = { x: Math.round(to.x), y: Math.round(to.y) };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < bounds.w && y < bounds.h;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y)) return [from, to];

  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const open: { x: number; y: number; d: number; g: number; f: number }[] = [];
  const gScore = new Map<number, number>();
  const parent = new Map<number, { x: number; y: number; d: number }>();
  for (let d = 0; d < 4; d++) {
    open.push({ x: start.x, y: start.y, d, g: 0, f: h(start.x, start.y) });
    gScore.set(key(start.x, start.y, d), 0);
  }

  let found: { x: number; y: number; d: number } | null = null;
  let guard = 0;
  while (open.length && guard++ < 200000) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) {
      found = cur;
      break;
    }
    if ((gScore.get(key(cur.x, cur.y, cur.d)) ?? Infinity) < cur.g) continue;
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + DIRS[d]!.dx;
      const ny = cur.y + DIRS[d]!.dy;
      if (!inside(nx, ny)) continue;
      // 목적지 칸은 기계 면이라 막혀 있어도 들어갈 수 있게 둔다
      if (blocked(nx, ny) && !(nx === goal.x && ny === goal.y)) continue;
      const turn = d === cur.d ? 0 : 3; // 회전 벌점 — 꺾인 선이 적은 쪽이 읽기 쉽다
      const ng = cur.g + 1 + turn;
      const k = key(nx, ny, d);
      if (ng < (gScore.get(k) ?? Infinity)) {
        gScore.set(k, ng);
        parent.set(k, { x: cur.x, y: cur.y, d: cur.d });
        open.push({ x: nx, y: ny, d, g: ng, f: ng + h(nx, ny) });
      }
    }
  }

  if (!found) return [from, to]; // 길이 없으면 직선으로 두고, 호출부가 경고를 낸다

  const path: Point[] = [];
  let node: { x: number; y: number; d: number } | undefined = found;
  while (node) {
    path.push({ x: node.x, y: node.y });
    node = parent.get(key(node.x, node.y, node.d));
  }
  path.reverse();

  // 같은 방향으로 이어지는 점은 지운다 — 꺾이는 점만 남긴다
  const simplified: Point[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const a = path[i - 1];
    const b = path[i + 1];
    if (!a || !b) {
      simplified.push(p);
      continue;
    }
    const straight = (a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y);
    if (!straight) simplified.push(p);
  }
  return simplified;
}


// ---------------------------------------------------------------- 3D (다층)

export interface Floor3D {
  /** 0이 1층 */
  level: number;
  items: PackedItem[];
  widthM: number;
  heightM: number;
  /** 이 층에 놓인 기계 중 가장 높은 것 */
  tallestMachineM: number;
  /** 이 층 바닥에서 위 층 바닥까지 */
  spacingM: number;
}

export interface Lift3D {
  xM: number;
  yM: number;
  fromLevel: number;
  toLevel: number;
  /** 무엇을 올리는가 */
  itemKo: string;
  spanM: number;
  /** 리프트 최소 4 m 제약을 만족하는가 */
  ok: boolean;
}

export interface Pack3DResult {
  floors: Floor3D[];
  lifts: Lift3D[];
  /** 모든 층을 덮는 외곽 (토대는 층마다 같은 크기로 깐다) */
  widthM: number;
  depthM: number;
  totalHeightM: number;
  areaM2: number;
  cost: number;
  tried: number;
  /** 왜 이 층수를 골랐는지 — 화면에 근거로 적는다 */
  reason: string;
}

export interface Pack3DInput {
  /** 공정 순서대로 (원자재에 가까운 것부터) */
  groups: { index: number; count: number; widthM: number; lengthM: number; heightM: number; itemKo: string }[];
  maxWidthM: number;
  maxFloors: number;
  /** 토대 두께 — 층 간격 = 기계 높이 + 이 값 */
  foundationM: number;
  /** 리프트 하나의 비용을 면적으로 환산한 벌점. 층을 무한정 쌓지 않게 한다. */
  liftPenaltyM2: number;
  /** 리프트 최소 수직 거리 (조사: 4 m) */
  liftMinSpanM: number;
}

/**
 * 다층 배치.
 *
 * 왜 층을 쌓는가: 한 층에 다 늘어놓으면 부지가 넓어지고 벨트가 길어진다. 발행된 모듈들이
 * 밀도를 내는 방식이 위아래 공간이다.
 *
 * 왜 무한정 쌓지 않는가: 층을 넘길 때마다 리프트가 필요하고, 리프트는 지을 것이 하나 늘고
 * 고장 지점이 하나 늘고 막혔을 때 찾기가 어렵다. 그래서 목적 함수에 리프트 벌점을 둔다.
 *
 * 층 나누는 방식: 공정 순서를 유지한 채 자른다. 공정이 층을 넘나들면 리프트가 폭발한다 —
 * 한 공정의 기계들은 같은 층에 두고, **공정 경계에서만** 층을 넘긴다.
 */
export function packModule3D(input: Pack3DInput): Pack3DResult {
  const { groups, maxWidthM, maxFloors, foundationM, liftPenaltyM2, liftMinSpanM } = input;

  const expand = (gs: Pack3DInput['groups']): PackItem[] =>
    gs.flatMap((g) =>
      Array.from({ length: g.count }, (_, k) => ({
        id: `${g.index}:${k}`,
        widthM: g.widthM,
        lengthM: g.lengthM,
        group: g.index,
        canRotate: true,
      }))
    );

  let best: Pack3DResult | null = null;
  let tried = 0;

  for (let f = 1; f <= Math.max(1, maxFloors); f++) {
    // 공정 순서를 유지하며 면적이 고르게 나뉘도록 자른다
    const areas = groups.map((g) => g.count * g.widthM * g.lengthM);
    const totalArea = areas.reduce((a, b) => a + b, 0);
    const target = totalArea / f;
    const buckets: Pack3DInput['groups'][] = [];
    let cur: Pack3DInput['groups'] = [];
    let acc = 0;
    groups.forEach((g, i) => {
      cur.push(g);
      acc += areas[i]!;
      if (acc >= target - 1e-9 && buckets.length < f - 1) {
        buckets.push(cur);
        cur = [];
        acc = 0;
      }
    });
    if (cur.length) buckets.push(cur);
    if (buckets.length !== f) continue; // 공정 수보다 층이 많으면 그 층수는 불가능

    let ok = true;
    const floors: Floor3D[] = [];
    for (let li = 0; li < buckets.length; li++) {
      const gs = buckets[li]!;
      let packed;
      try {
        packed = packModule(expand(gs), maxWidthM);
      } catch {
        ok = false;
        break;
      }
      tried += packed.tried;
      const tallest = Math.max(...gs.map((g) => g.heightM));
      floors.push({
        level: li,
        items: packed.items,
        widthM: packed.widthM,
        heightM: packed.heightM,
        tallestMachineM: tallest,
        // 층 간격 = 그 층 기계 최대 높이 + 토대 두께. 임의의 숫자가 아니다.
        spacingM: Math.ceil(tallest) + foundationM,
      });
    }
    if (!ok) continue;

    // 층 경계마다 리프트 하나 — 공정 경계에서만 넘어가므로 층수 - 1개다
    const lifts: Lift3D[] = [];
    for (let li = 0; li + 1 < floors.length; li++) {
      const from = floors[li]!;
      const lastGroup = buckets[li]![buckets[li]!.length - 1]!;
      const span = from.spacingM;
      lifts.push({
        xM: Math.max(0, from.widthM - 2),
        yM: Math.max(0, from.heightM - 2),
        fromLevel: li,
        toLevel: li + 1,
        itemKo: lastGroup.itemKo,
        spanM: span,
        ok: span >= liftMinSpanM,
      });
    }

    const widthM = Math.max(...floors.map((fl) => fl.widthM));
    const depthM = Math.max(...floors.map((fl) => fl.heightM));
    const areaM2 = widthM * depthM;
    const totalHeightM = floors.reduce((a, fl) => a + fl.spacingM, 0);
    const cost = areaM2 + lifts.length * liftPenaltyM2;

    if (!best || cost < best.cost) {
      best = {
        floors,
        lifts,
        widthM,
        depthM,
        totalHeightM,
        areaM2,
        cost,
        tried,
        reason:
          f === 1
            ? '한 층으로 끝납니다 — 층을 쌓아도 리프트 비용이 면적 이득보다 큽니다.'
            : `${f}층으로 나눴습니다 — 바닥 면적 ${areaM2} m²에 리프트 ${lifts.length}개. ` +
              '한 층으로 펼치면 면적이 더 커지고 벨트가 길어집니다.',
      };
    }
  }

  if (!best) throw new Error('배치할 수 있는 층 구성을 찾지 못했습니다');
  best.tried = tried;
  return best;
}


// ---------------------------------------------------------------- 공정 블록 배치

export interface GroupBlockInput {
  group: number;
  count: number;
  widthM: number;
  lengthM: number;
}

export interface GroupBlock {
  group: number;
  /** 블록 안에서 기계를 몇 열 × 몇 행으로 붙였는가 */
  cols: number;
  rows: number;
  widthM: number;
  lengthM: number;
  /** 블록 원점 기준 각 기계의 위치 */
  cells: { xM: number; yM: number; widthM: number; lengthM: number }[];
}

/**
 * 한 공정의 기계들을 **서로 붙여** 하나의 블록으로 만든다.
 *
 * 같은 공정의 기계는 같은 매니폴드가 먹이므로 사이에 통로가 필요 없다. 열 수는 폭 상한 안에서
 * 블록이 가장 정사각에 가까워지는 값을 고른다 — 정사각에 가까울수록 상위 배치가 촘촘해진다.
 */
export function blockFor(g: GroupBlockInput, maxWidthM: number, rotated = false): GroupBlock {
  const mw = rotated ? g.lengthM : g.widthM;
  const ml = rotated ? g.widthM : g.lengthM;
  const maxCols = Math.max(1, Math.floor(maxWidthM / mw));
  let best: GroupBlock | null = null;
  for (let cols = 1; cols <= Math.min(maxCols, g.count); cols++) {
    const rows = Math.ceil(g.count / cols);
    const widthM = cols * mw;
    const lengthM = rows * ml;
    // 정사각에 가까운 정도 + 낭비 면적
    const waste = cols * rows - g.count;
    const score = Math.abs(widthM - lengthM) + waste * mw * ml * 0.5;
    if (!best || score < (best as GroupBlock & { _s: number })._s) {
      const cells: GroupBlock['cells'] = [];
      for (let i = 0; i < g.count; i++) {
        cells.push({
          xM: (i % cols) * mw,
          yM: Math.floor(i / cols) * ml,
          widthM: mw,
          lengthM: ml,
        });
      }
      best = Object.assign({ group: g.group, cols, rows, widthM, lengthM, cells }, { _s: score });
    }
  }
  return best!;
}

/**
 * 공정 블록들을 배치한다. 블록 사이(흐름 면)에만 통로를 둔다.
 *
 * 이전 방식은 기계 하나하나를 개별 사각형으로 넣고 전부에 통로를 붙였다. 그래서
 * 보강된 철판 모듈이 24×40 m가 됐다. 같은 공정을 붙이면 블록이 커지고, 큰 블록끼리
 * 맞물리면서 외곽이 줄어든다.
 */
export function packGroups(
  groups: GroupBlockInput[],
  maxWidthM: number,
  beltWeight = 4,
  /**
   * 청사진 설계소 규격(정사각 한 변). 이 안에 들어가면 티어 4에서 그대로 청사진으로 떠서
   * 복제할 수 있다. **목적 함수에 명시적으로 넣는다** — 우연히 맞기를 기대하지 않는다.
   * 24×40 m 배치는 면적이 32×32 보다 작아도 청사진에 안 들어가므로 실전에서 더 나쁘다.
   */
  blueprintSideM = 32
): PackResult & { blocks: GroupBlock[] } {
  let best: (PackResult & { blocks: GroupBlock[] }) | null = null;
  let tried = 0;

  const rotationModes: boolean[][] = [];
  // 회전 조합 — 공정 수가 적으므로 전수 탐색이 가능하다 (2^n, n<=8 이면 256가지)
  const n = groups.length;
  if (n <= 8) {
    for (let mask = 0; mask < 1 << n; mask++) {
      rotationModes.push(groups.map((_, i) => ((mask >> i) & 1) === 1));
    }
  } else {
    rotationModes.push(groups.map(() => false), groups.map(() => true));
  }

  for (const rots of rotationModes) {
    const blocks = groups.map((g, i) => blockFor(g, maxWidthM, rots[i]!));
    if (blocks.some((b) => b.widthM > maxWidthM)) continue;
    // 블록을 PackItem으로 바꿔 기존 BLF 배치기에 넣는다 (통로는 흐름 면에만)
    const items: PackItem[] = blocks.map((b) => ({
      id: String(b.group),
      widthM: b.widthM,
      lengthM: b.lengthM,
      group: b.group,
      canRotate: false, // 회전은 이미 위에서 정했다
    }));
    let packed;
    try {
      packed = packModule(items, maxWidthM, beltWeight);
    } catch {
      continue;
    }
    tried += packed.tried;
    const fitsBlueprint = packed.widthM <= blueprintSideM && packed.heightM <= blueprintSideM;
    // 청사진에 못 들어가면 벌점. 값은 토대 몇 장분에 해당하도록 잡았다.
    const cost = packed.cost + (fitsBlueprint ? 0 : blueprintSideM * 8);
    if (!best || cost < best.cost) {
      best = { ...packed, cost, blocks, tried };
    }
  }

  if (!best) throw new Error(`폭 ${maxWidthM} m 안에 들어가지 않는 공정이 있습니다`);
  best.tried = tried;
  return best;
}
