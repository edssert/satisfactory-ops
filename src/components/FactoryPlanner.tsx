/**
 * FactoryPlanner — 직접 놓고, 잇고, 계산하는 설계판.
 *
 * 자동 계산기(`/builder`)와 역할이 다르다. 거기는 "무엇을 분당 몇 개"를 넣으면 공정을 펼쳐 주고,
 * 여기는 사람이 배치를 짠다. 인게임에서 짓기 전에 먼저 그려 보고, 그린 것을 남에게 보여 주는 용도다.
 *
 * 순서는 게임과 같다. **건물을 먼저 놓고, 놓인 것을 눌러 레시피를 고른다.**
 * 인게임에서도 제작기를 짓고 나서 열어 무엇을 만들지 정한다.
 *
 * 흐름은 왼쪽에서 오른쪽이다. 투입구는 상자 왼쪽, 산출구는 오른쪽.
 * 산출구를 누르고 다음 기계의 같은 품목 투입구를 누르면 이어진다.
 *
 * 계산은 공급이 모자라면 그만큼 가동률이 떨어지는 모델이다. 한 산출구가 여러 곳으로 갈리면
 * 각 목적지가 필요로 하는 양에 비례해 나눈다 — 매니폴드가 정상 상태에서 하는 일과 같다.
 *
 * 상태를 갖는 최소 단위라서 아일랜드다(ADR-0009). 데이터는 페이지가 서브셋을 만들어 넘긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  solve,
  type Catalog,
  type PItem,
  type PlanEdge,
  type PlanNode,
  type PMachine,
  type PRecipe,
} from '../lib/planner-solve';

/* 계산은 lib 에 있다. 화면 안에 두면 검증을 못 한다 */
export type { PMachine, PRecipe, PItem } from '../lib/planner-solve';

interface Props {
  machines: PMachine[];
  recipesList: PRecipe[];
  itemsList: PItem[];
  iconBase: string;
}

/* ------------------------------------------------------------------ 저장 형식 */

/**
 * 사용자 데이터에는 버전을 둔다. 마이그레이션 없이 구조를 바꾸지 않는다.
 * 게임 데이터는 클래스명으로만 참조한다 — 이름이 바뀌어도 계획이 깨지지 않는다.
 */
const SAVE_KEY = 'sfops.planner';
const SAVE_VERSION = 1;

type NodeKind = PlanNode['kind'];
type PNode = PlanNode;
type PEdge = PlanEdge;

interface SaveShape {
  version: number;
  nodes: PNode[];
  edges: PEdge[];
  seq: number;
}

/* ------------------------------------------------------------------ 치수 */

const NODE_W = 232;
const HEAD_H = 46;
const ROW_H = 26;
const SEP_H = 9;
const FOOT_H = 40;
const PAD_Y = 8;

const PURITY = [
  { v: 0.5, k: '불순' },
  { v: 1, k: '보통' },
  { v: 2, k: '순수' },
];

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

/* ------------------------------------------------------------------ 화면 */

export default function FactoryPlanner({ machines, recipesList, itemsList, iconBase }: Props) {
  const itemById = useMemo(() => new Map(itemsList.map((x) => [x.i, x])), [itemsList]);
  const recipeById = useMemo(() => new Map(recipesList.map((x) => [x.i, x])), [recipesList]);
  const machineById = useMemo(() => new Map(machines.map((x) => [x.i, x])), [machines]);
  const recipesOf = useMemo(() => {
    const m = new Map<string, PRecipe[]>();
    for (const r of recipesList) {
      if (!m.has(r.m)) m.set(r.m, []);
      m.get(r.m)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.k.localeCompare(b.k, 'ko'));
    return m;
  }, [recipesList]);

  const [nodes, setNodes] = useState<PNode[]>([]);
  const [edges, setEdges] = useState<PEdge[]>([]);
  const seq = useRef(1);
  const [ready, setReady] = useState(false);

  const [q, setQ] = useState('');
  /** 지금 레시피를 고르는 중인 상자 */
  const [edit, setEdit] = useState<number | null>(null);
  const [eq, setEq] = useState('');
  const [pick, setPick] = useState<{ node: number; item: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const canvas = useRef<HTMLDivElement>(null);

  /* 이전에 짜 둔 것을 되살린다 */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SaveShape;
        if (s.version === SAVE_VERSION) {
          /* 게임 데이터가 바뀌어 사라진 참조는 조용히 버린다 */
          const live = s.nodes.filter(
            (n) => machineById.has(n.machine) && (n.kind !== 'recipe' || recipeById.has(n.ref))
          );
          const ids = new Set(live.map((n) => n.id));
          setNodes(live);
          setEdges(s.edges.filter((e) => ids.has(e.from) && ids.has(e.to)));
          seq.current = s.seq;
        }
      }
    } catch {
      /* 저장이 깨졌으면 빈 판에서 시작한다 */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const s: SaveShape = { version: SAVE_VERSION, nodes, edges, seq: seq.current };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      /* 저장 공간이 없어도 화면은 계속 쓸 수 있어야 한다 */
    }
  }, [nodes, edges, ready]);

  /* ---------------------------------------------------------------- 처리량 */

  const catalog: Catalog = useMemo(
    () => ({
      machine: (id) => machineById.get(id),
      recipe: (id) => recipeById.get(id),
      energyMJ: (id) => itemById.get(id)?.mj ?? 0,
    }),
    [machineById, recipeById, itemById]
  );

  const solved = useMemo(() => solve(nodes, edges, catalog), [nodes, edges, catalog]);

  /* ---------------------------------------------------------------- 배치 계산 */

  const geom = useCallback(
    (n: PNode) => {
      const b = solved.base.get(n.id);
      const nIn = b ? b.ins.size : 0;
      const nOut = b ? b.outs.size : 0;
      const h = HEAD_H + PAD_Y + nIn * ROW_H + SEP_H + nOut * ROW_H + PAD_Y + FOOT_H;
      const inY = (k: number) => n.y + HEAD_H + PAD_Y + k * ROW_H + ROW_H / 2;
      const outY = (k: number) =>
        n.y + HEAD_H + PAD_Y + nIn * ROW_H + SEP_H + k * ROW_H + ROW_H / 2;
      return { h, inY, outY, nIn, nOut };
    },
    [solved]
  );

  const portPos = useCallback(
    (nodeId: number, item: string, side: 'in' | 'out') => {
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return null;
      const b = solved.base.get(nodeId);
      if (!b) return null;
      const g = geom(n);
      const keys = [...(side === 'in' ? b.ins.keys() : b.outs.keys())];
      const k = keys.indexOf(item);
      if (k < 0) return null;
      return side === 'in'
        ? { x: n.x, y: g.inY(k) }
        : { x: n.x + NODE_W, y: g.outY(k) };
    },
    [nodes, solved, geom]
  );

  const extent = useMemo(() => {
    let w = 900;
    let h = 520;
    for (const n of nodes) {
      w = Math.max(w, n.x + NODE_W + 80);
      h = Math.max(h, n.y + geom(n).h + 80);
    }
    return { w, h };
  }, [nodes, geom]);

  /* ---------------------------------------------------------------- 조작 */

  /** 건물의 성격. 채굴기·발전기는 레시피가 아니라 자원·연료를 고른다 */
  const kindOf = (m: PMachine): NodeKind =>
    m.res ? 'extract' : m.f ? 'generator' : 'recipe';

  /**
   * 건물만 놓는다. 무엇을 만들지는 놓인 상자를 눌러 고른다 — 인게임과 같은 순서다.
   * 놓자마자 레시피를 강요하면 "이 건물로 뭘 할 수 있지"를 판 위에서 못 본다.
   */
  const addNode = (m: PMachine) => {
    const id = seq.current++;
    const k = nodes.length;
    const node: PNode = {
      id,
      kind: kindOf(m),
      ref: kindOf(m) === 'recipe' ? '' : m.i,
      machine: m.i,
      x: 40 + (k % 4) * (NODE_W + 60),
      y: 40 + Math.floor(k / 4) * 250,
      count: 1,
      clock: 100,
      ...(kindOf(m) === 'extract' ? { purity: 1 } : {}),
    };
    setNodes((v) => [...v, node]);
    setSel(id);
    /* 놓자마자 고르는 창을 연다. 한 번 더 누르게 만들 이유가 없다 */
    setEdit(id);
    setEq('');
  };

  /** 이 상자가 아직 무엇을 만들지 정하지 않았는가 */
  const unset = (n: PNode) =>
    n.kind === 'recipe' ? !n.ref : n.kind === 'extract' ? !n.resource : !n.fuel;

  /**
   * 무엇을 만들지 바꾸면 품목이 달라진다. 예전 품목으로 이어 둔 벨트는 갈 곳이 없으므로 끊는다.
   * 남겨 두면 화면에는 선이 있는데 아무것도 안 흐르는 상태가 된다.
   */
  const choose = (id: number, p: Partial<PNode>) => {
    setNodes((v) => v.map((n) => (n.id === id ? { ...n, ...p } : n)));
    setEdges((v) => v.filter((e) => e.from !== id && e.to !== id));
    setEdit(null);
    setPick(null);
  };

  const patch = (id: number, p: Partial<PNode>) =>
    setNodes((v) => v.map((n) => (n.id === id ? { ...n, ...p } : n)));

  const removeNode = (id: number) => {
    setNodes((v) => v.filter((n) => n.id !== id));
    setEdges((v) => v.filter((e) => e.from !== id && e.to !== id));
    setSel((s) => (s === id ? null : s));
  };

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

  /* 상자 끌기 */
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const onHeadDown = (e: PointerEvent, n: PNode) => {
    const host = canvas.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    drag.current = { id: n.id, dx: e.clientX - r.left - n.x, dy: e.clientY - r.top - n.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSel(n.id);
  };
  const onHeadMove = (e: PointerEvent) => {
    const d = drag.current;
    const host = canvas.current;
    if (!d || !host) return;
    const r = host.getBoundingClientRect();
    /* 8px 격자에 붙인다. 손으로 놓으면 미묘하게 어긋나 눈에 거슬린다 */
    const snap = (v: number) => Math.max(8, Math.round(v / 8) * 8);
    patch(d.id, { x: snap(e.clientX - r.left - d.dx), y: snap(e.clientY - r.top - d.dy) });
  };
  const onHeadUp = () => {
    drag.current = null;
  };

  const reset = () => {
    if (!nodes.length || confirm('짜 둔 것을 모두 지웁니다. 되돌릴 수 없습니다.')) {
      setNodes([]);
      setEdges([]);
      setPick(null);
    }
  };

  /** 짠 것을 글로 옮긴다 — 남에게 보여 주거나 물어볼 때 쓴다 */
  const copy = async () => {
    const lines: string[] = [];
    for (const n of nodes) {
      const b = solved.base.get(n.id)!;
      const r = solved.ratio.get(n.id) ?? 0;
      lines.push(
        `#${n.id} ${machineById.get(n.machine)?.k ?? n.machine} · ${titleOf(n)} · ` +
          `${n.count}대 · 클럭 ${fmt(n.clock)}%` +
          (r < 0.999 ? ` · 가동률 ${fmt(r * 100)}%` : '')
      );
      for (const [i, v] of b.ins) lines.push(`   넣음 ${nameOf(i)} ${fmt(v * r)}/분`);
      for (const [i, v] of b.outs) lines.push(`   냄  ${nameOf(i)} ${fmt(v * r)}/분`);
    }
    for (const e of edges) {
      lines.push(`선 #${e.from} → #${e.to} : ${nameOf(e.item)} ${fmt(solved.flow.get(e.id) ?? 0)}/분`);
    }
    lines.push('');
    lines.push(`넣어야 할 것: ${listOf(solved.feed) || '없음'}`);
    lines.push(`나오는 것:   ${listOf(solved.yields) || '없음'}`);
    lines.push(`전력 소비 ${fmt(solved.power)} MW · 발전 ${fmt(solved.gen)} MW`);
    lines.push('');
    lines.push(JSON.stringify({ version: SAVE_VERSION, nodes, edges }));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 클립보드를 막아 둔 브라우저도 있다 */
    }
  };

  const nameOf = (id: string) => itemById.get(id)?.k ?? id;
  const listOf = (m: Map<string, number>) =>
    [...m].map(([i, v]) => `${nameOf(i)} ${fmt(v)}/분`).join(', ');

  const titleOf = (n: PNode) =>
    n.kind === 'recipe'
      ? (recipeById.get(n.ref)?.k ?? '무엇을 만들지 고르세요')
      : n.kind === 'extract'
        ? n.resource
          ? `${nameOf(n.resource)} · ${PURITY.find((p) => p.v === n.purity)?.k ?? ''}`
          : '무엇을 캘지 고르세요'
        : n.fuel
          ? nameOf(n.fuel)
          : '무엇을 태울지 고르세요';

  /* ---------------------------------------------------------------- 왼쪽 목록 */

  /** 왼쪽은 건물만 늘어놓는다. 레시피는 놓은 뒤에 고른다 */
  const machineList = useMemo(() => {
    const s = q.trim();
    if (!s) return machines;
    return machines.filter(
      (m) => m.k.includes(s) || (recipesOf.get(m.i) ?? []).some((r) => r.k.includes(s))
    );
  }, [machines, q, recipesOf]);

  /** 지금 고르는 중인 상자에 놓을 수 있는 것들 */
  const choices = useMemo(() => {
    const n = nodes.find((x) => x.id === edit);
    if (!n) return null;
    const m = machineById.get(n.machine);
    if (!m) return null;
    const s = eq.trim();
    if (n.kind === 'extract') {
      const list = (m.res ?? []).filter((r) => !s || nameOf(r).includes(s));
      return { n, m, kind: 'extract' as const, list };
    }
    if (n.kind === 'generator') {
      const list = (m.f ?? []).map((f) => f.f).filter((r) => !s || nameOf(r).includes(s));
      return { n, m, kind: 'generator' as const, list };
    }
    const list = (recipesOf.get(n.machine) ?? []).filter((r) => !s || r.k.includes(s));
    return { n, m, kind: 'recipe' as const, list };
  }, [edit, eq, nodes, machineById, recipesOf, itemById]);

  const icon = (kind: 'items' | 'buildings-png', id: string, size: number) => (
    <img
      src={`${iconBase}/${kind}/${id}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
    />
  );

  return (
    <div class="pl">
      <aside class="pl-pal">
        <p class="pl-palhead">건물을 눌러 판에 놓으세요</p>
        <label class="pl-search">
          <span class="sr-only">건물 찾기</span>
          <input
            type="search"
            value={q}
            placeholder="건물 이름 · 만들 물건 이름"
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <ul class="pl-machines">
          {machineList.map((m) => (
            <li key={m.i}>
              <button type="button" onClick={() => addNode(m)}>
                {icon('buildings-png', m.i, 28)}
                <span class="pl-mname">{m.k}</span>
                <span class="pl-mmeta">
                  {m.res ? '채굴' : m.f ? '발전' : `${m.n}종`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div class="pl-main">
        <div class="pl-bar">
          <span class="pl-stat">
            <b>{nodes.length}</b> 기계 묶음 · <b>{edges.length}</b> 벨트
          </span>
          <span class="pl-stat">
            소비 <b>{fmt(Math.round(solved.power * 10) / 10)}</b> MW
            {solved.gen > 0 && (
              <>
                {' · 발전 '}
                <b>{fmt(Math.round(solved.gen * 10) / 10)}</b> MW
              </>
            )}
          </span>
          <span class="pl-spacer" />
          <button type="button" class="pl-btn" onClick={copy}>
            {copied ? '복사됨' : '글로 복사'}
          </button>
          <button type="button" class="pl-btn is-quiet" onClick={reset}>
            모두 지우기
          </button>
        </div>

        <div class="pl-scroll">
          <div
            class="pl-canvas"
            ref={canvas}
            style={`width:${extent.w}px;height:${extent.h}px`}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                setPick(null);
                setSel(null);
                setEdit(null);
              }
            }}
          >
            <svg class="pl-wires" width={extent.w} height={extent.h}>
              {edges.map((e) => {
                const a = portPos(e.from, e.item, 'out');
                const b = portPos(e.to, e.item, 'in');
                if (!a || !b) return null;
                const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
                const v = solved.flow.get(e.id) ?? 0;
                return (
                  <g key={e.id} class={v > 1e-6 ? 'pl-wire' : 'pl-wire is-dry'}>
                    <path
                      d={`M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`}
                    />
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}>
                      {fmt(Math.round(v * 100) / 100)}/분
                    </text>
                    <circle
                      class="pl-cut"
                      cx={(a.x + b.x) / 2}
                      cy={(a.y + b.y) / 2 + 8}
                      r="8"
                      onClick={() => setEdges((vv) => vv.filter((x) => x.id !== e.id))}
                    />
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const b = solved.base.get(n.id)!;
              const r = solved.ratio.get(n.id) ?? 0;
              const g = geom(n);
              const m = machineById.get(n.machine);
              const starved = r < 0.999;
              return (
                <article
                  key={n.id}
                  class={
                    `pl-node${sel === n.id ? ' is-sel' : ''}` +
                    `${starved && !unset(n) ? ' is-short' : ''}` +
                    `${unset(n) ? ' is-unset' : ''}` +
                    `${edit === n.id ? ' is-editing' : ''}`
                  }
                  style={`left:${n.x}px;top:${n.y}px;width:${NODE_W}px;height:${g.h}px`}
                >
                  <header
                    class="pl-nhead"
                    onPointerDown={(e) => onHeadDown(e as unknown as PointerEvent, n)}
                    onPointerMove={(e) => onHeadMove(e as unknown as PointerEvent)}
                    onPointerUp={onHeadUp}
                  >
                    {icon('buildings-png', n.machine, 26)}
                    {/*
                      * 건물 이름이 위, 무엇을 만드는지가 아래. 눌러서 바꾼다.
                      * 인게임에서 기계를 열어 레시피를 고르는 것과 같은 자리다.
                      */}
                    <button
                      type="button"
                      class={`pl-ntitle${unset(n) ? ' is-unset' : ''}`}
                      onClick={() => {
                        setEdit(edit === n.id ? null : n.id);
                        setEq('');
                        setSel(n.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <small>{m?.k ?? n.machine}</small>
                      <b>{titleOf(n)}</b>
                    </button>
                    <button
                      type="button"
                      class="pl-x"
                      aria-label="지우기"
                      onClick={() => removeNode(n.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      ✕
                    </button>
                  </header>

                  {edit === n.id && choices && (
                    <div class="pl-picker">
                      <input
                        type="search"
                        class="pl-pq"
                        value={eq}
                        placeholder={
                          choices.kind === 'recipe'
                            ? `${m?.k ?? ''} 레시피 ${choices.list.length}종`
                            : choices.kind === 'extract'
                              ? '캘 자원'
                              : '태울 연료'
                        }
                        onInput={(e) => setEq((e.currentTarget as HTMLInputElement).value)}
                      />
                      <ul>
                        {choices.kind === 'recipe' &&
                          (choices.list as PRecipe[]).map((r) => (
                            <li key={r.i}>
                              <button type="button" onClick={() => choose(n.id, { ref: r.i })}>
                                {icon('items', r.o[0]![0], 20)}
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
                                    n.id,
                                    choices.kind === 'extract' ? { resource: id } : { fuel: id }
                                  )
                                }
                              >
                                {icon('items', id, 20)}
                                <span class="pl-rname">{nameOf(id)}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  <div class="pl-io">
                    {unset(n) && (
                      <p class="pl-hint">
                        상자 제목을 눌러
                        {n.kind === 'recipe'
                          ? ' 레시피를'
                          : n.kind === 'extract'
                            ? ' 캘 자원을'
                            : ' 태울 연료를'}
                        {' '}
                        고르세요
                      </p>
                    )}
                    {[...b.ins].map(([item, v], k) => {
                      const linkable = pick && pick.item === item && pick.node !== n.id;
                      return (
                        <div
                          key={item}
                          class={`pl-row is-in${linkable ? ' is-target' : ''}`}
                          style={`top:${g.inY(k) - n.y - ROW_H / 2}px`}
                        >
                          <button
                            type="button"
                            class="pl-port"
                            title={`${nameOf(item)} 투입구`}
                            onClick={() => onPort(n.id, item, 'in')}
                          />
                          {icon('items', item, 18)}
                          <span class="pl-iname">{nameOf(item)}</span>
                          <span class="pl-irate">{fmt(Math.round(v * r * 100) / 100)}/분</span>
                        </div>
                      );
                    })}

                    {b.ins.size > 0 && b.outs.size > 0 && (
                      <div class="pl-sep" style={`top:${HEAD_H + PAD_Y + g.nIn * ROW_H + 4}px`} />
                    )}

                    {[...b.outs].map(([item, v], k) => (
                      <div
                        key={item}
                        class={`pl-row is-out${
                          pick && pick.node === n.id && pick.item === item ? ' is-picked' : ''
                        }`}
                        style={`top:${g.outY(k) - n.y - ROW_H / 2}px`}
                      >
                        <span class="pl-irate">{fmt(Math.round(v * r * 100) / 100)}/분</span>
                        <span class="pl-iname">{nameOf(item)}</span>
                        {icon('items', item, 18)}
                        <button
                          type="button"
                          class="pl-port"
                          title={`${nameOf(item)} 산출구 — 눌러서 잇기`}
                          onClick={() => onPort(n.id, item, 'out')}
                        />
                      </div>
                    ))}

                    {b.gen > 0 && (
                      <div class="pl-gen" style={`top:${g.h - FOOT_H - 22}px`}>
                        발전 {fmt(Math.round(b.gen * r * 10) / 10)} MW
                      </div>
                    )}
                  </div>

                  <footer class="pl-nfoot">
                    <label>
                      <span class="sr-only">대수</span>
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
                      <em>대</em>
                    </label>
                    <label>
                      <span class="sr-only">클럭</span>
                      <input
                        type="number"
                        min="1"
                        max="250"
                        step="1"
                        value={n.clock}
                        onInput={(e) =>
                          patch(n.id, {
                            clock: Math.max(
                              1,
                              Math.min(
                                250,
                                Number((e.currentTarget as HTMLInputElement).value) || 100
                              )
                            ),
                          })
                        }
                      />
                      <em>%</em>
                    </label>
                    {n.kind === 'extract' && (
                      <select
                        aria-label="노드 순도"
                        value={String(n.purity)}
                        onChange={(e) =>
                          patch(n.id, {
                            purity: Number((e.currentTarget as HTMLSelectElement).value),
                          })
                        }
                      >
                        {PURITY.map((p) => (
                          <option key={p.v} value={String(p.v)}>
                            {p.k}
                          </option>
                        ))}
                      </select>
                    )}
                    {starved && <span class="pl-short">가동 {fmt(Math.round(r * 1000) / 10)}%</span>}
                  </footer>
                </article>
              );
            })}

            {!nodes.length && (
              <p class="pl-empty">
                왼쪽에서 건물을 누르면 여기에 놓입니다. 놓인 상자의 제목을 누르면
                무엇을 만들지 고를 수 있습니다.
                <br />
                산출구(오른쪽 점)를 누른 뒤 다음 기계의 투입구(왼쪽 점)를 누르면 이어집니다.
              </p>
            )}
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
