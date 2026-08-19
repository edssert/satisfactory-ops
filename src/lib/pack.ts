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

/** 벨트가 지나갈 접근 공간. 기계 입·출력 면 양쪽으로 2 m씩. */
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
    const w = Math.round((r ? it.lengthM + ACCESS_M * 2 : it.widthM));
    const h = Math.round((r ? it.widthM : it.lengthM + ACCESS_M * 2));
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
      yM: bestY + ACCESS_M,
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
