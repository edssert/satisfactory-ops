/**
 * FactoryPlanner — 실제 축척으로 공장을 짜는 도면판.
 *
 * 앞선 판본은 축척이 없는 상자 그림이었다. 그래서 "여기에 들어가나"를 답하지 못했다.
 * 이제 **좌표 단위가 미터**다. 건물은 게임 데이터의 충돌 박스 크기(footprint) 그대로 그려지고,
 * 바닥 격자는 토대 한 칸(8 m)이다. 눈으로 본 비율이 게임에서 그대로 맞는다.
 *
 * 다루는 것:
 *   - 건물을 놓고 90도 단위로 돌린다. 투입구는 뒷면, 산출구는 앞면 한가운데다
 *   - 층을 나눈다. 층이 다른 두 건물을 이으면 컨베이어 리프트가 되고 높이가 계산된다
 *   - 분배기·병합기도 놓는다. 만들지 않고 지나가기만 한다
 *   - 자동 배치로 공정 순서대로 줄을 세운다. 그다음에 손으로 옮긴다
 *
 * 계산은 lib/planner-solve.ts 에 있다. 화면 안에 두면 검증을 못 한다.
 * 상태를 갖는 최소 단위라서 아일랜드다(ADR-0009).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_BELT,
  solve,
  type Catalog,
  type PBelt,
  type PItem,
  type PlanEdge,
  type PlanNode,
  type PMachine,
  type PRecipe,
} from '../lib/planner-solve';
import { loadOwned, saveOwned, watchOwned } from '../lib/owned-recipes';

export type { PMachine, PRecipe, PItem, PBelt } from '../lib/planner-solve';

interface Props {
  machines: PMachine[];
  recipesList: PRecipe[];
  itemsList: PItem[];
  belts: PBelt[];
  iconBase: string;
}

/* ------------------------------------------------------------------ 저장 */

/**
 * 사용자 데이터에는 버전을 둔다. 마이그레이션 없이 구조를 바꾸지 않는다.
 * v1 은 축척이 없어 좌표가 픽셀이었다. v2 는 미터다 — 옛 좌표를 8로 나눠 옮긴다.
 */
const SAVE_KEY = 'sfops.planner';
const SAVE_VERSION = 2;
const FAV_KEY = 'sfops.favmachines';

interface SaveShape {
  version: number;
  nodes: PlanNode[];
  edges: PlanEdge[];
  seq: number;
  floorHeight?: number;
}

/* ------------------------------------------------------------------ 치수 */

/** 토대 한 칸. 게임의 격자 단위다 */
const TILE = 8;
/** 건물을 붙이는 격자 (m) */
const SNAP = 1;
/** 배선이 건물에서 빠져나오는 길이 (m) */
const STUB = 3;
/** 배선이 꺾이는 곳의 반지름 (m) */
const FILLET = 1.6;
/** 되돌아가는 배선이 도는 통로를 건물에서 얼마나 띄울 것인가 (m) */
const LANE = 6;

const PURITY = [
  { v: 0.5, k: '불순' },
  { v: 1, k: '보통' },
  { v: 2, k: '순수' },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const round1 = (n: number) => Math.round(n * 10) / 10;

type Pt = { x: number; y: number };
type Dir = 'l' | 'r' | 'u' | 'd';
const DIRV: Record<Dir, Pt> = {
  l: { x: -1, y: 0 },
  r: { x: 1, y: 0 },
  u: { x: 0, y: -1 },
  d: { x: 0, y: 1 },
};
const isH = (d: Dir) => d === 'l' || d === 'r';
const flipDir = (d: Dir): Dir => (d === 'l' ? 'r' : d === 'r' ? 'l' : d === 'u' ? 'd' : 'u');

/** 직각으로 꺾인 길을 필렛으로 돌린다. 직각 그대로 두면 도면이 아니라 순서도로 보인다 */
function roundPath(pts: Pt[], r: number): string {
  const p0 = pts[0];
  if (!p0) return '';
  let d = `M${round1(p0.x)},${round1(p0.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const rr = Math.min(r, la / 2, lb / 2);
    if (!(rr > 0.05) || !la || !lb) {
      d += ` L${round1(p.x)},${round1(p.y)}`;
      continue;
    }
    d += ` L${round1(p.x + ((a.x - p.x) / la) * rr)},${round1(p.y + ((a.y - p.y) / la) * rr)}`;
    d += ` Q${round1(p.x)},${round1(p.y)} ${round1(p.x + ((b.x - p.x) / lb) * rr)},${round1(p.y + ((b.y - p.y) / lb) * rr)}`;
  }
  const e = pts[pts.length - 1]!;
  d += ` L${round1(e.x)},${round1(e.y)}`;
  return d;
}

/* ------------------------------------------------------------------ 화면 */

export default function FactoryPlanner({ machines, recipesList, itemsList, belts, iconBase }: Props) {
  const itemById = useMemo(() => new Map(itemsList.map((x) => [x.i, x])), [itemsList]);
  const recipeById = useMemo(() => new Map(recipesList.map((x) => [x.i, x])), [recipesList]);
  const machineById = useMemo(() => new Map(machines.map((x) => [x.i, x])), [machines]);
  const beltById = useMemo(() => new Map(belts.map((x) => [x.i, x])), [belts]);
  const recipesOf = useMemo(() => {
    const m = new Map<string, PRecipe[]>();
    for (const r of recipesList) {
      if (!m.has(r.m)) m.set(r.m, []);
      m.get(r.m)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.k.localeCompare(b.k, 'ko'));
    return m;
  }, [recipesList]);

  const [nodes, setNodes] = useState<PlanNode[]>([]);
  const [edges, setEdges] = useState<PlanEdge[]>([]);
  const seq = useRef(1);
  const [ready, setReady] = useState(false);

  const [q, setQ] = useState('');
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<number | null>(null);
  const [eq, setEq] = useState('');
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [altOpen, setAltOpen] = useState(false);
  const [altQ, setAltQ] = useState('');
  const [pick, setPick] = useState<{ node: number; item: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  /** 지금 보고 있는 층. 다른 층은 흐리게 남는다 — 위아래를 보면서 짜야 한다 */
  const [floor, setFloor] = useState(0);
  const [floorHeight, setFloorHeight] = useState(8);
  /** 1 m 당 픽셀과 밀어 놓은 위치 */
  const [view, setView] = useState({ x: -10, y: -10, z: 7 });
  const [box, setBox] = useState({ w: 1200, h: 720 });

  const host = useRef<HTMLDivElement>(null);

  /* ---------------------------------------------------------------- 저장 */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SaveShape;
        let ns: PlanNode[] = [];
        let es: PlanEdge[] = [];
        if (s.version === SAVE_VERSION) {
          ns = s.nodes;
          es = s.edges;
        } else if (s.version === 1) {
          /* v1 은 좌표가 픽셀이고 층이 없었다. 8 px 를 1 m 로 본다 */
          ns = s.nodes.map((n) => ({
            ...n,
            x: Math.round(n.x / 8),
            y: Math.round(n.y / 8),
            floor: 0,
            rot: 0,
          }));
          es = s.edges;
        }
        const live = ns.filter(
          (n) =>
            machineById.has(n.machine) && (n.kind !== 'recipe' || !n.ref || recipeById.has(n.ref))
        );
        const ids = new Set(live.map((n) => n.id));
        setNodes(live);
        setEdges(es.filter((e) => ids.has(e.from) && ids.has(e.to)));
        seq.current = Math.max(s.seq ?? 1, ...live.map((n) => n.id + 1), 1);
        if (s.floorHeight) setFloorHeight(s.floorHeight);
      }
    } catch {
      /* 저장이 깨졌으면 빈 판에서 시작한다 */
    }
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      if (Array.isArray(f)) setFav(new Set(f));
    } catch {
      /* 즐겨찾기가 깨져도 판은 열려야 한다 */
    }
    setReady(true);
    setOwned(loadOwned());
    return watchOwned(setOwned);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ version: SAVE_VERSION, nodes, edges, seq: seq.current, floorHeight })
      );
    } catch {
      /* 저장 공간이 없어도 화면은 계속 쓸 수 있어야 한다 */
    }
  }, [nodes, edges, floorHeight, ready]);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleFav = (id: string) => {
    setFav((v) => {
      const next = new Set(v);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* 저장 못 해도 이번 판에서는 쓸 수 있다 */
      }
      return next;
    });
  };

  const toggleOwned = (id: string) => {
    setOwned((v) => {
      const next = new Set(v);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveOwned(next);
      return next;
    });
  };
  const setAllOwned = (on: boolean, ids: string[]) => {
    setOwned((v) => {
      const next = new Set(v);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      saveOwned(next);
      return next;
    });
  };

  /* ---------------------------------------------------------------- 계산 */

  const catalog: Catalog = useMemo(
    () => ({
      machine: (id) => machineById.get(id),
      recipe: (id) => recipeById.get(id),
      energyMJ: (id) => itemById.get(id)?.mj ?? 0,
      beltRate: (id) => (id ? (beltById.get(id)?.r ?? 0) : 0),
    }),
    [machineById, recipeById, itemById, beltById]
  );
  const solved = useMemo(() => solve(nodes, edges, catalog), [nodes, edges, catalog]);

  /* ---------------------------------------------------------------- 기하 */

  /** 돌린 뒤의 바닥 크기(m). 90·270도면 가로세로가 바뀐다 */
  const sizeOf = useCallback(
    (n: PlanNode) => {
      const m = machineById.get(n.machine);
      const w = m?.fw ?? 8;
      const l = m?.fl ?? 8;
      const swap = (((n.rot ?? 0) / 90) | 0) % 2 === 1;
      return { w: swap ? l : w, h: swap ? w : l };
    },
    [machineById]
  );

  /**
   * 투입구는 뒷면, 산출구는 앞면 한가운데다. 게임의 기계도 그렇다.
   * 돌리면 면도 같이 돈다. 한 면에 여럿이면 그 면을 고르게 나눠 쓴다.
   */
  const portsOf = useCallback(
    (n: PlanNode) => {
      const b = solved.base.get(n.id);
      const { w, h } = sizeOf(n);
      const rot = ((n.rot ?? 0) % 360) as 0 | 90 | 180 | 270;
      const ins = b ? [...b.ins.keys()] : [];
      const outs = b ? [...b.outs.keys()] : [];

      const on = (face: Dir, k: number, total: number): Pt => {
        const t = total <= 1 ? 0.5 : (k + 1) / (total + 1);
        if (face === 'l') return { x: n.x, y: n.y + h * t };
        if (face === 'r') return { x: n.x + w, y: n.y + h * t };
        if (face === 'u') return { x: n.x + w * t, y: n.y };
        return { x: n.x + w * t, y: n.y + h };
      };
      const inFace: Dir = rot === 0 ? 'l' : rot === 90 ? 'u' : rot === 180 ? 'r' : 'd';
      const outFace: Dir = rot === 0 ? 'r' : rot === 90 ? 'd' : rot === 180 ? 'l' : 'u';

      const map = new Map<string, { p: Pt; dir: Dir; side: 'in' | 'out' }>();
      ins.forEach((item, k) =>
        /* 투입구로는 배선이 들어온다. 방향은 면의 바깥이 아니라 안쪽이다 */
        map.set(`in|${item}`, { p: on(inFace, k, ins.length), dir: flipDir(inFace), side: 'in' })
      );
      outs.forEach((item, k) =>
        map.set(`out|${item}`, { p: on(outFace, k, outs.length), dir: outFace, side: 'out' })
      );
      return { map, inFace, outFace, w, h };
    },
    [solved, sizeOf]
  );

  const portAt = useCallback(
    (nodeId: number, item: string, side: 'in' | 'out') => {
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return null;
      const hit = portsOf(n).map.get(`${side}|${item}`);
      if (!hit) return null;
      return { p: hit.p, dir: hit.dir, node: n };
    },
    [nodes, portsOf]
  );

  /** 두 포트를 직각으로 잇는 길 */
  const routeOf = useCallback(
    (e: PlanEdge): { d: string; mid: Pt; lift: number } | null => {
      const a = portAt(e.from, e.item, 'out');
      const b = portAt(e.to, e.item, 'in');
      if (!a || !b) return null;
      const av = DIRV[a.dir];
      const bv = DIRV[b.dir];
      const p1 = { x: a.p.x + av.x * STUB, y: a.p.y + av.y * STUB };
      const p2 = { x: b.p.x - bv.x * STUB, y: b.p.y - bv.y * STUB };

      const pts: Pt[] = [a.p, p1];
      if (isH(a.dir) && isH(b.dir)) {
        const forward = b.dir === 'r' ? p2.x > p1.x : p2.x < p1.x;
        if (forward) {
          const mx = (p1.x + p2.x) / 2;
          pts.push({ x: mx, y: p1.y }, { x: mx, y: p2.y });
        } else {
          /* 뒤로 돌아가는 배선. 두 건물 아래로 통로를 내서 돈다 */
          const sa = sizeOf(a.node);
          const sb = sizeOf(b.node);
          const lane = Math.max(a.node.y + sa.h, b.node.y + sb.h) + LANE;
          pts.push({ x: p1.x, y: lane }, { x: p2.x, y: lane });
        }
      } else if (isH(a.dir) && !isH(b.dir)) {
        pts.push({ x: p2.x, y: p1.y });
      } else if (!isH(a.dir) && isH(b.dir)) {
        pts.push({ x: p1.x, y: p2.y });
      } else {
        const my = (p1.y + p2.y) / 2;
        pts.push({ x: p1.x, y: my }, { x: p2.x, y: my });
      }
      pts.push(p2, b.p);

      const mid = pts[Math.floor(pts.length / 2)]!;
      return { d: roundPath(pts, FILLET), mid, lift: (b.node.floor - a.node.floor) * floorHeight };
    },
    [portAt, sizeOf, floorHeight]
  );

  /* ---------------------------------------------------------------- 조작 */

  const kindOf = (m: PMachine): PlanNode['kind'] =>
    m.lg ? 'logistic' : m.res ? 'extract' : m.f ? 'generator' : 'recipe';

  const centerWorld = () => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: view.x + r.width / 2 / view.z, y: view.y + r.height / 2 / view.z };
  };

  const addNode = (m: PMachine) => {
    const id = seq.current++;
    const c = centerWorld();
    const k = nodes.length;
    const node: PlanNode = {
      id,
      kind: kindOf(m),
      ref: kindOf(m) === 'recipe' ? '' : m.i,
      machine: m.i,
      x: Math.round(c.x + ((k % 3) - 1) * 16),
      y: Math.round(c.y + ((Math.floor(k / 3) % 3) - 1) * 16),
      floor,
      count: 1,
      clock: 100,
      rot: 0,
      ...(kindOf(m) === 'extract' ? { purity: 1 } : {}),
    };
    setNodes((v) => [...v, node]);
    setSel(id);
    setEdit(id);
    setEq('');
  };

  const patch = (id: number, p: Partial<PlanNode>) =>
    setNodes((v) => v.map((n) => (n.id === id ? { ...n, ...p } : n)));

  const removeNode = (id: number) => {
    setNodes((v) => v.filter((n) => n.id !== id));
    setEdges((v) => v.filter((e) => e.from !== id && e.to !== id));
    setSel((s) => (s === id ? null : s));
    setEdit((s) => (s === id ? null : s));
  };

  /** 무엇을 만들지 바꾸면 품목이 달라진다. 갈 곳 없는 벨트는 끊는다 */
  const choose = (id: number, p: Partial<PlanNode>) => {
    setNodes((v) => v.map((n) => (n.id === id ? { ...n, ...p } : n)));
    setEdges((v) => v.filter((e) => e.from !== id && e.to !== id));
    setEdit(null);
    setPick(null);
  };

  const unset = (n: PlanNode) =>
    n.kind === 'recipe'
      ? !n.ref
      : n.kind === 'extract'
        ? !n.resource
        : n.kind === 'logistic'
          ? !n.item
          : !n.fuel;

  const onPort = (nodeId: number, item: string, side: 'in' | 'out') => {
    if (side === 'out') {
      setPick(pick && pick.node === nodeId && pick.item === item ? null : { node: nodeId, item });
      return;
    }
    if (!pick || pick.item !== item || pick.node === nodeId) return;
    const dup = edges.some((e) => e.from === pick.node && e.to === nodeId && e.item === item);
    if (!dup) setEdges((v) => [...v, { id: seq.current++, from: pick.node, to: nodeId, item }]);
    setPick(null);
  };

  /**
   * 자동 배치 — 공정 순서대로 줄을 세운다.
   *
   * 위에서 아무것도 안 받는 건물이 첫 열이고, 받는 건물은 그 뒤 열이다.
   * 열 폭은 그 열에서 가장 넓은 건물에 맞춘다. 세로는 겹치지 않게 쌓는다.
   * 손으로 옮기기 전의 **출발점**이지 정답이 아니다 — 옮기고 나서 다시 누르면 도로 정렬된다.
   */
  const autoLayout = () => {
    const inc = new Map<number, number[]>();
    for (const e of edges) {
      if (!inc.has(e.to)) inc.set(e.to, []);
      inc.get(e.to)!.push(e.from);
    }
    const depth = new Map<number, number>();
    const visit = (id: number, seen: Set<number>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const ups = inc.get(id) ?? [];
      const d = ups.length ? Math.max(...ups.map((u) => visit(u, seen) + 1)) : 0;
      depth.set(id, d);
      return d;
    };
    for (const n of nodes) visit(n.id, new Set());

    const byFloor = new Map<number, PlanNode[]>();
    for (const n of nodes) {
      if (!byFloor.has(n.floor)) byFloor.set(n.floor, []);
      byFloor.get(n.floor)!.push(n);
    }

    const moved = new Map<number, { x: number; y: number }>();
    for (const [, list] of byFloor) {
      const cols = new Map<number, PlanNode[]>();
      for (const n of list) {
        const d = depth.get(n.id) ?? 0;
        if (!cols.has(d)) cols.set(d, []);
        cols.get(d)!.push(n);
      }
      let x = 0;
      for (const d of [...cols.keys()].sort((a, b) => a - b)) {
        const col = cols.get(d)!;
        const wide = Math.max(...col.map((n) => sizeOf(n).w));
        let y = 0;
        for (const n of col) {
          const s = sizeOf(n);
          moved.set(n.id, { x: Math.round(x + (wide - s.w) / 2), y: Math.round(y) });
          y += s.h + 12;
        }
        x += wide + 26;
      }
    }
    setNodes((v) => v.map((n) => ({ ...n, ...(moved.get(n.id) ?? {}) })));
    setTimeout(fitAll, 0);
  };

  /* 끌기 — 건물은 1 m 격자에 붙는다 */
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const toWorld = (clientX: number, clientY: number) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: view.x + (clientX - r.left) / view.z, y: view.y + (clientY - r.top) / view.z };
  };

  const onNodeDown = (e: PointerEvent, n: PlanNode) => {
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { id: n.id, dx: w.x - n.x, dy: w.y - n.y };
    try {
      (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    } catch {
      /* 마우스가 아닌 입력에서 실패할 수 있다. 못 잡아도 끌기는 된다 */
    }
    setSel(n.id);
    if (n.floor !== floor) setFloor(n.floor);
  };
  const onNodeMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = toWorld(e.clientX, e.clientY);
    const snap = (v: number) => Math.round(v / SNAP) * SNAP;
    patch(d.id, { x: snap(w.x - d.dx), y: snap(w.y - d.dy) });
  };
  const onNodeUp = () => {
    drag.current = null;
  };

  const onBgDown = (e: PointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPick(null);
    setSel(null);
    setEdit(null);
  };
  const onBgMove = (e: PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx - (e.clientX - p.x) / v.z, y: p.vy - (e.clientY - p.y) / v.z }));
  };
  const onBgUp = () => {
    pan.current = null;
  };

  const zoomAt = (px: number, py: number, f: number) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    const mx = px / view.z + view.x;
    const my = py / view.z + view.y;
    const z = Math.max(2.5, Math.min(26, view.z * f));
    setView({ z, x: mx - px / z, y: my - py / z });
  };
  const onWheel = (e: WheelEvent) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const fitAll = () => {
    const r = host.current?.getBoundingClientRect();
    if (!r || !nodes.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      const s = sizeOf(n);
      x0 = Math.min(x0, n.x - 8);
      y0 = Math.min(y0, n.y - 8);
      x1 = Math.max(x1, n.x + s.w + 8);
      y1 = Math.max(y1, n.y + s.h + 12);
    }
    const z = Math.max(2.5, Math.min(26, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    setView({ z, x: x0 - (r.width / z - (x1 - x0)) / 2, y: y0 - (r.height / z - (y1 - y0)) / 2 });
  };

  const reset = () => {
    if (!nodes.length || confirm('짜 둔 것을 모두 지웁니다. 되돌릴 수 없습니다.')) {
      setNodes([]);
      setEdges([]);
      setPick(null);
      setEdit(null);
    }
  };

  /* ---------------------------------------------------------------- 이름 */

  const nameOf = (id: string) => itemById.get(id)?.k ?? id;
  const listOf = (m: Map<string, number>) =>
    [...m].map(([i, v]) => `${nameOf(i)} ${fmt(v)}/분`).join(', ');

  const titleOf = (n: PlanNode) =>
    n.kind === 'recipe'
      ? (recipeById.get(n.ref)?.k ?? '레시피를 고르세요')
      : n.kind === 'extract'
        ? n.resource
          ? `${nameOf(n.resource)} · ${PURITY.find((p) => p.v === n.purity)?.k ?? ''}`
          : '캘 자원을 고르세요'
        : n.kind === 'logistic'
          ? n.item
            ? nameOf(n.item)
            : '지나갈 물건을 고르세요'
          : n.fuel
            ? nameOf(n.fuel)
            : '태울 연료를 고르세요';

  const copy = async () => {
    const lines: string[] = [];
    lines.push(`층 높이 ${floorHeight} m · 토대 격자 ${TILE} m · 좌표 단위 m`);
    for (const n of nodes) {
      const b = solved.base.get(n.id)!;
      const r = solved.ratio.get(n.id) ?? 0;
      const s = sizeOf(n);
      lines.push(
        `#${n.id} ${machineById.get(n.machine)?.k ?? n.machine} · ${titleOf(n)} · ` +
          `${n.count}대 · 클럭 ${fmt(n.clock)}% · ${n.floor}층 (${n.x}, ${n.y}) ` +
          `${s.w}×${s.h} m · ${n.rot ?? 0}도` +
          (r < 0.999 && n.kind !== 'logistic' ? ` · 가동률 ${fmt(r * 100)}%` : '')
      );
      if (n.kind !== 'logistic') {
        for (const [i, v] of b.ins) lines.push(`   넣음 ${nameOf(i)} ${fmt(v * r)}/분`);
        for (const [i, v] of b.outs) lines.push(`   냄  ${nameOf(i)} ${fmt(v * r)}/분`);
      }
    }
    for (const e of edges) {
      const a = nodes.find((n) => n.id === e.from);
      const b2 = nodes.find((n) => n.id === e.to);
      const up = a && b2 ? (b2.floor - a.floor) * floorHeight : 0;
      lines.push(
        `선 #${e.from} → #${e.to} : ${nameOf(e.item)} ${fmt(solved.flow.get(e.id) ?? 0)}/분` +
          (up ? ` · 리프트 ${Math.abs(up)} m ${up > 0 ? '올림' : '내림'}` : '')
      );
    }
    lines.push('');
    lines.push(`넣어야 할 것: ${listOf(solved.feed) || '없음'}`);
    lines.push(`나오는 것:   ${listOf(solved.yields) || '없음'}`);
    lines.push(`전력 소비 ${fmt(round1(solved.power))} MW · 발전 ${fmt(round1(solved.gen))} MW`);
    lines.push('');
    lines.push(JSON.stringify({ version: SAVE_VERSION, nodes, edges, floorHeight }));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 클립보드를 막아 둔 브라우저도 있다 */
    }
  };

  /* ---------------------------------------------------------------- 목록 */

  const palette = useMemo(() => {
    const s = q.trim();
    const hit = (m: PMachine) =>
      !s || m.k.includes(s) || (recipesOf.get(m.i) ?? []).some((r) => r.k.includes(s));
    const shown = machines.filter(hit);
    const groups = [
      { key: 'prod', ko: '생산', list: shown.filter((m) => !m.lg && !m.res && !m.f) },
      { key: 'mine', ko: '채굴', list: shown.filter((m) => !!m.res) },
      { key: 'power', ko: '발전', list: shown.filter((m) => !!m.f) },
      { key: 'log', ko: '물류', list: shown.filter((m) => !!m.lg) },
    ];
    const favs = shown.filter((m) => fav.has(m.i));
    return [
      ...(favs.length ? [{ key: 'fav', ko: '즐겨찾기', list: favs }] : []),
      ...groups.filter((g) => g.list.length > 0),
    ];
  }, [machines, q, fav, recipesOf]);

  const choices = useMemo(() => {
    const n = nodes.find((x) => x.id === edit);
    if (!n) return null;
    const m = machineById.get(n.machine);
    if (!m) return null;
    const s = eq.trim();
    if (n.kind === 'extract') {
      return {
        n,
        m,
        kind: 'extract' as const,
        list: (m.res ?? []).filter((r) => !s || nameOf(r).includes(s)),
      };
    }
    if (n.kind === 'generator') {
      return {
        n,
        m,
        kind: 'generator' as const,
        list: (m.f ?? []).map((f) => f.f).filter((r) => !s || nameOf(r).includes(s)),
      };
    }
    if (n.kind === 'logistic') {
      /* 지나갈 물건은 판 위에 실제로 있는 것부터 보여 준다. 750가지를 다 늘어놓을 이유가 없다 */
      const seen = new Set<string>();
      for (const other of nodes) {
        if (other.id === n.id) continue;
        const b = solved.base.get(other.id);
        if (!b) continue;
        for (const k of b.outs.keys()) seen.add(k);
        for (const k of b.ins.keys()) seen.add(k);
      }
      const pool = seen.size ? [...seen] : itemsList.map((i) => i.i);
      return { n, m, kind: 'logistic' as const, list: pool.filter((r) => !s || nameOf(r).includes(s)) };
    }
    const list = (recipesOf.get(n.machine) ?? [])
      /* 안 딴 대체 제작법은 뺀다. 지금 고른 것이면 남긴다 — 계획이 조용히 사라지면 안 된다 */
      .filter((r) => !r.a || owned.has(r.i) || r.i === n.ref)
      .filter((r) => !s || r.k.includes(s));
    return { n, m, kind: 'recipe' as const, list };
  }, [edit, eq, nodes, machineById, recipesOf, itemById, owned, solved, itemsList]);

  /** 대체 제작법을 기기별로 묶는다. 110가지를 한 줄로 늘어놓으면 못 찾는다 */
  const altGroups = useMemo(() => {
    const s = altQ.trim();
    const by = new Map<string, PRecipe[]>();
    for (const r of recipesList) {
      if (!r.a) continue;
      if (s && !r.k.includes(s) && !(machineById.get(r.m)?.k ?? '').includes(s)) continue;
      if (!by.has(r.m)) by.set(r.m, []);
      by.get(r.m)!.push(r);
    }
    return [...by.entries()]
      .map(([m, list]) => ({
        m,
        ko: machineById.get(m)?.k ?? m,
        list: list.sort((a, b) => a.k.localeCompare(b.k, 'ko')),
      }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [recipesList, altQ, machineById]);
  const altTotal = useMemo(() => recipesList.filter((r) => r.a).length, [recipesList]);

  const floors = useMemo(() => {
    const set = new Set(nodes.map((n) => n.floor));
    set.add(floor);
    return [...set].sort((a, b) => b - a);
  }, [nodes, floor]);

  /* ---------------------------------------------------------------- 그리기 */

  const bIcon = (id: string) => `${iconBase}/buildings-png/${id}.png`;
  const iIcon = (id: string) => `${iconBase}/items/${id}.png`;
  const img = (src: string, size: number) => (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
    />
  );

  const vb = `${round1(view.x)} ${round1(view.y)} ${round1(box.w / view.z)} ${round1(box.h / view.z)}`;
  /** 글자와 포트는 배율과 상관없이 화면에서 같은 크기로 보이게 한다 */
  const fs = (px: number) => round1(px / view.z);

  const editScreen = useMemo(() => {
    const n = nodes.find((x) => x.id === edit);
    if (!n) return null;
    const s = sizeOf(n);
    return { left: (n.x + s.w - view.x) * view.z + 12, top: (n.y - view.y) * view.z };
  }, [edit, nodes, view, sizeOf]);

  /* 지금 층을 맨 위에 그린다 */
  const drawn = [...nodes].sort((a, b) => (a.floor === floor ? 1 : 0) - (b.floor === floor ? 1 : 0));

  return (
    <div class="pl">
      <aside class="pl-pal">
        <label class="pl-search">
          <span class="sr-only">건물 찾기</span>
          <input
            type="search"
            value={q}
            placeholder="건물 이름 · 만들 물건 이름"
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <div class="pl-groups">
          {palette.map((g) => (
            <section key={g.key}>
              <h3>{g.ko}</h3>
              <ul>
                {g.list.map((m) => (
                  <li key={g.key + m.i}>
                    <button type="button" class="pl-mbtn" onClick={() => addNode(m)}>
                      {img(bIcon(m.i), 26)}
                      <span class="pl-mname">{m.k}</span>
                      <span class="pl-mmeta">{m.fw && m.fl ? `${m.fw}×${m.fl}` : ''}</span>
                    </button>
                    <button
                      type="button"
                      class={`pl-star${fav.has(m.i) ? ' is-on' : ''}`}
                      aria-pressed={fav.has(m.i)}
                      title="즐겨찾기"
                      onClick={() => toggleFav(m.i)}
                    >
                      ★
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>

      <div class="pl-main">
        <div class="pl-bar">
          <span class="pl-floor">
            <button type="button" class="pl-sq" title="아래 층" onClick={() => setFloor((f) => f - 1)}>
              −
            </button>
            <b class="n">{floor}</b>층
            <button type="button" class="pl-sq" title="위 층" onClick={() => setFloor((f) => f + 1)}>
              +
            </button>
            <label class="pl-fh">
              층 높이
              <input
                type="number"
                min="2"
                max="40"
                value={floorHeight}
                onInput={(e) =>
                  setFloorHeight(
                    Math.max(2, Math.min(40, Number((e.currentTarget as HTMLInputElement).value) || 8))
                  )
                }
              />
              m
            </label>
          </span>

          <span class="pl-stat">
            <b>{nodes.length}</b> 대 · <b>{edges.length}</b> 벨트
          </span>
          <span class="pl-stat">
            소비 <b>{fmt(round1(solved.power))}</b> MW
            {solved.gen > 0 && (
              <>
                {' · 발전 '}
                <b>{fmt(round1(solved.gen))}</b> MW
              </>
            )}
          </span>

          <span class="pl-spacer" />

          <button type="button" class="pl-btn" onClick={autoLayout}>
            자동 배치
          </button>
          <span class="pl-zoom">
            <button type="button" class="pl-sq" title="축소" onClick={() => zoomAt(box.w / 2, box.h / 2, 1 / 1.25)}>
              −
            </button>
            <button type="button" class="pl-sq" title="확대" onClick={() => zoomAt(box.w / 2, box.h / 2, 1.25)}>
              +
            </button>
            <button type="button" class="pl-btn is-quiet" onClick={fitAll}>
              전체 보기
            </button>
          </span>
          <button
            type="button"
            class={`pl-btn${owned.size ? '' : ' is-quiet'}`}
            aria-expanded={altOpen}
            onClick={() => setAltOpen((v) => !v)}
          >
            딴 대체 제작법 <b>{owned.size}</b>/{altTotal}
          </button>
          <button type="button" class="pl-btn" onClick={copy}>
            {copied ? '복사됨' : '글로 복사'}
          </button>
          <button type="button" class="pl-btn is-quiet" onClick={reset}>
            모두 지우기
          </button>
        </div>

        {altOpen && (
          <div class="pl-alts">
            <div class="pl-altbar">
              <input
                type="search"
                class="pl-pq"
                value={altQ}
                placeholder="제작법이나 기계 이름"
                onInput={(e) => setAltQ((e.currentTarget as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="pl-btn is-quiet"
                onClick={() => setAllOwned(true, altGroups.flatMap((g) => g.list.map((r) => r.i)))}
              >
                보이는 것 모두 체크
              </button>
              <button
                type="button"
                class="pl-btn is-quiet"
                onClick={() => setAllOwned(false, altGroups.flatMap((g) => g.list.map((r) => r.i)))}
              >
                모두 해제
              </button>
              <button type="button" class="pl-btn" onClick={() => setAltOpen(false)}>
                닫기
              </button>
            </div>
            <p class="pl-altnote">
              하드 드라이브는 대체 제작법 수보다 적어서 사람마다 가진 것이 다릅니다. 여기서 체크한
              것만 레시피 목록에 나옵니다.
            </p>
            <div class="pl-altgrid">
              {altGroups.map((g) => (
                <section key={g.m}>
                  <h4>
                    {img(bIcon(g.m), 18)}
                    {g.ko}
                    <span class="n">
                      {g.list.filter((r) => owned.has(r.i)).length}/{g.list.length}
                    </span>
                  </h4>
                  <ul>
                    {g.list.map((r) => (
                      <li key={r.i}>
                        <label>
                          <input
                            type="checkbox"
                            checked={owned.has(r.i)}
                            onChange={() => toggleOwned(r.i)}
                          />
                          {img(iIcon(r.o[0]![0]), 18)}
                          <span class="pl-rname">{r.k}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <div class="pl-stage" ref={host} onWheel={onWheel as never}>
          <svg
            class="pl-svg"
            viewBox={vb}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onBgDown(e as unknown as PointerEvent);
            }}
            onPointerMove={(e) => {
              onBgMove(e as unknown as PointerEvent);
              onNodeMove(e as unknown as PointerEvent);
            }}
            onPointerUp={() => {
              onBgUp();
              onNodeUp();
            }}
            onPointerLeave={() => {
              onBgUp();
              onNodeUp();
            }}
          >
            <defs>
              {/* 토대 격자. 한 칸이 8 m 라 눈으로 칸 수를 셀 수 있다 */}
              <pattern id="pl-grid" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
                <path d={`M${TILE},0 L0,0 0,${TILE}`} fill="none" class="pl-gridline" stroke-width={fs(1)} />
              </pattern>
              <pattern id="pl-grid8" width={TILE * 8} height={TILE * 8} patternUnits="userSpaceOnUse">
                <rect width={TILE * 8} height={TILE * 8} fill="url(#pl-grid)" />
                <path
                  d={`M${TILE * 8},0 L0,0 0,${TILE * 8}`}
                  fill="none"
                  class="pl-gridline is-major"
                  stroke-width={fs(1.6)}
                />
              </pattern>
            </defs>

            <rect
              x={view.x}
              y={view.y}
              width={box.w / view.z}
              height={box.h / view.z}
              fill="url(#pl-grid8)"
            />

            {edges.map((e) => {
              const rt = routeOf(e);
              if (!rt) return null;
              const v = solved.flow.get(e.id) ?? 0;
              return (
                <g key={e.id} class={v > 1e-6 ? 'pl-belt' : 'pl-belt is-dry'}>
                  <path d={rt.d} class="pl-belt-shell" stroke-width={fs(9)} />
                  <path d={rt.d} class="pl-belt-core" stroke-width={fs(3.5)} />
                  {rt.lift !== 0 && (
                    <g class="pl-lift">
                      <circle cx={rt.mid.x} cy={rt.mid.y} r={fs(11)} />
                      <text x={rt.mid.x} y={rt.mid.y + fs(4)} font-size={fs(11)}>
                        {rt.lift > 0 ? '▲' : '▼'}
                      </text>
                      <text x={rt.mid.x} y={rt.mid.y + fs(25)} font-size={fs(10)} class="pl-liftlabel">
                        리프트 {Math.abs(rt.lift)} m
                      </text>
                    </g>
                  )}
                  <text x={rt.mid.x} y={rt.mid.y - fs(10)} font-size={fs(11)} class="pl-beltrate">
                    {fmt(Math.round(v * 100) / 100)}/분
                  </text>
                  <circle
                    class="pl-cut"
                    cx={rt.mid.x}
                    cy={rt.mid.y}
                    r={fs(10)}
                    onClick={() => setEdges((vv) => vv.filter((x) => x.id !== e.id))}
                  />
                </g>
              );
            })}

            {drawn.map((n) => {
              const s = sizeOf(n);
              const b = solved.base.get(n.id)!;
              const r = solved.ratio.get(n.id) ?? 0;
              const m = machineById.get(n.machine);
              const g = portsOf(n);
              const here = n.floor === floor;
              const short = r < 0.999 && !unset(n) && n.kind !== 'logistic';
              const icon = Math.min(s.w, s.h) * 0.76;
              return (
                <g
                  key={n.id}
                  class={
                    `pl-b${here ? '' : ' is-off'}` +
                    `${sel === n.id ? ' is-sel' : ''}` +
                    `${unset(n) ? ' is-unset' : ''}` +
                    `${short ? ' is-short' : ''}`
                  }
                  onPointerDown={(e) => {
                    if (here) onNodeDown(e as unknown as PointerEvent, n);
                  }}
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={s.w}
                    height={s.h}
                    rx={0.6}
                    class="pl-bbody"
                    stroke-width={fs(1.5)}
                  />
                  <image
                    href={bIcon(n.machine)}
                    x={n.x + (s.w - icon) / 2}
                    y={n.y + (s.h - icon) / 2}
                    width={icon}
                    height={icon}
                    preserveAspectRatio="xMidYMid meet"
                    class="pl-bicon"
                  />

                  <text x={n.x} y={n.y - fs(6)} font-size={fs(11)} class="pl-bname">
                    {m?.k ?? n.machine}
                    {n.count > 1 ? ` ×${n.count}` : ''}
                  </text>
                  <text x={n.x} y={n.y + s.h + fs(13)} font-size={fs(11)} class="pl-btitle">
                    {titleOf(n)}
                  </text>
                  {n.clock !== 100 && (
                    <text x={n.x} y={n.y + s.h + fs(25)} font-size={fs(10)} class="pl-bsub">
                      클럭 {fmt(n.clock)}%
                    </text>
                  )}
                  {short && (
                    <text
                      x={n.x + s.w}
                      y={n.y - fs(6)}
                      font-size={fs(10)}
                      class="pl-bshort"
                      text-anchor="end"
                    >
                      가동 {fmt(Math.round(r * 1000) / 10)}%
                    </text>
                  )}

                  {here &&
                    [...g.map.entries()].map(([key, port]) => {
                      const [side, item] = key.split('|') as ['in' | 'out', string];
                      const rate = (side === 'in' ? b.ins.get(item) : b.outs.get(item)) ?? 0;
                      const target = side === 'in' && pick && pick.item === item && pick.node !== n.id;
                      const picked = side === 'out' && pick && pick.node === n.id && pick.item === item;
                      const label = side === 'in' ? 'r' : 'l';
                      return (
                        <g
                          key={key}
                          class={`pl-port is-${side}${target ? ' is-target' : ''}${picked ? ' is-picked' : ''}`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onPort(n.id, item, side)}
                        >
                          <circle cx={port.p.x} cy={port.p.y} r={fs(6.5)} />
                          <image
                            href={iIcon(item)}
                            x={port.p.x - fs(5.5)}
                            y={port.p.y - fs(5.5)}
                            width={fs(11)}
                            height={fs(11)}
                          />
                          {n.kind !== 'logistic' && (
                            <text
                              x={port.p.x + (label === 'r' ? -fs(12) : fs(12))}
                              y={port.p.y + fs(4)}
                              font-size={fs(10)}
                              text-anchor={label === 'r' ? 'end' : 'start'}
                              class="pl-portrate"
                            >
                              {nameOf(item)} {fmt(Math.round(rate * r * 100) / 100)}/분
                            </text>
                          )}
                        </g>
                      );
                    })}
                </g>
              );
            })}
          </svg>

          {sel != null &&
            (() => {
              const n = nodes.find((x) => x.id === sel);
              if (!n) return null;
              return (
                <div
                  class="pl-tools"
                  style={`left:${(n.x - view.x) * view.z}px;top:${(n.y - view.y) * view.z - 34}px`}
                >
                  <button type="button" onClick={() => setEdit(edit === n.id ? null : n.id)}>
                    고르기
                  </button>
                  <button
                    type="button"
                    title="90도 돌리기"
                    onClick={() => patch(n.id, { rot: (((n.rot ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 })}
                  >
                    ⟳
                  </button>
                  <label title="대수">
                    ×
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={n.count}
                      onInput={(e) =>
                        patch(n.id, {
                          count: Math.max(
                            1,
                            Math.min(999, Number((e.currentTarget as HTMLInputElement).value) || 1)
                          ),
                        })
                      }
                    />
                  </label>
                  <label title="클럭">
                    <input
                      type="number"
                      min="1"
                      max="250"
                      value={n.clock}
                      onInput={(e) =>
                        patch(n.id, {
                          clock: Math.max(
                            1,
                            Math.min(250, Number((e.currentTarget as HTMLInputElement).value) || 100)
                          ),
                        })
                      }
                    />
                    %
                  </label>
                  {n.kind === 'extract' && (
                    <select
                      aria-label="노드 순도"
                      value={String(n.purity)}
                      onChange={(e) =>
                        patch(n.id, { purity: Number((e.currentTarget as HTMLSelectElement).value) })
                      }
                    >
                      {PURITY.map((p) => (
                        <option key={p.v} value={String(p.v)}>
                          {p.k}
                        </option>
                      ))}
                    </select>
                  )}
                  {n.kind === 'logistic' && (
                    <select
                      aria-label="벨트 등급"
                      value={n.belt ?? ''}
                      onChange={(e) =>
                        patch(n.id, { belt: (e.currentTarget as HTMLSelectElement).value || undefined })
                      }
                    >
                      <option value="">상한 {DEFAULT_BELT}</option>
                      {belts
                        .filter((bb) => !bb.lift)
                        .map((bb) => (
                          <option key={bb.i} value={bb.i}>
                            {bb.k.replace('컨베이어 벨트 ', '')} · {bb.r}
                          </option>
                        ))}
                    </select>
                  )}
                  <label title="층">
                    층
                    <input
                      type="number"
                      value={n.floor}
                      onInput={(e) =>
                        patch(n.id, { floor: Number((e.currentTarget as HTMLInputElement).value) || 0 })
                      }
                    />
                  </label>
                  <button type="button" class="is-danger" title="지우기" onClick={() => removeNode(n.id)}>
                    ✕
                  </button>
                </div>
              );
            })()}

          {edit != null && choices && editScreen && (
            <div class="pl-picker" style={`left:${editScreen.left}px;top:${editScreen.top}px`}>
              <input
                type="search"
                class="pl-pq"
                value={eq}
                placeholder={
                  choices.kind === 'recipe'
                    ? `${choices.m.k} 레시피 ${choices.list.length}종`
                    : choices.kind === 'extract'
                      ? '캘 자원'
                      : choices.kind === 'logistic'
                        ? '지나갈 물건'
                        : '태울 연료'
                }
                onInput={(e) => setEq((e.currentTarget as HTMLInputElement).value)}
              />
              <ul>
                {choices.kind === 'recipe' &&
                  (choices.list as PRecipe[]).map((r) => (
                    <li key={r.i}>
                      <button type="button" onClick={() => choose(choices.n.id, { ref: r.i })}>
                        {img(iIcon(r.o[0]![0]), 20)}
                        <span class="pl-rname">{r.k}</span>
                        {r.a && <span class="pl-alt">대체</span>}
                      </button>
                    </li>
                  ))}
                {choices.kind !== 'recipe' &&
                  (choices.list as string[]).map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() =>
                          choose(
                            choices.n.id,
                            choices.kind === 'extract'
                              ? { resource: id }
                              : choices.kind === 'logistic'
                                ? { item: id }
                                : { fuel: id }
                          )
                        }
                      >
                        {img(iIcon(id), 20)}
                        <span class="pl-rname">{nameOf(id)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {!nodes.length && (
            <p class="pl-empty">
              왼쪽에서 건물을 누르면 판에 놓입니다. 크기는 게임의 실제 치수이고 바닥 격자는 토대 한 칸
              {` ${TILE} m`} 입니다.
              <br />
              놓은 건물을 눌러 레시피를 고르고, 산출구에서 다음 건물의 투입구로 이으세요.
            </p>
          )}

          <div class="pl-floors">
            {floors.map((f) => (
              <button key={f} type="button" class={f === floor ? 'is-on' : ''} onClick={() => setFloor(f)}>
                {f}층<span class="n">{nodes.filter((n) => n.floor === f).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="pl-sum">
          <div>
            <h3>넣어야 할 것</h3>
            <p>{listOf(solved.feed) || '없음'}</p>
          </div>
          <div>
            <h3>나오는 것</h3>
            <p>{listOf(solved.yields) || '없음'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
