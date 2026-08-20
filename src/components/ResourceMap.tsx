/**
 * ResourceMap — 자원 지도.
 *
 * 두 가지가 확대할 때 깨지고 있었다.
 *
 *  1) SVG 의 stroke-width 는 사용자 좌표계 단위다. 확대하면 테두리와 글자 외곽선이 같이 커져서
 *     점이 검은 덩어리가 됐다. 표시선은 전부 `vector-effect: non-scaling-stroke` 로 화면 단위에 묶는다.
 *  2) 타일이 원본(5000)보다 낮은 4096 한 벌뿐이라 그 이상 확대하면 원본에 있는 정보를 못 썼다.
 *     배율 계단을 두고(1024 / 2048 / 5120) 지금 배율에 맞는 단계의 보이는 타일만 받는다.
 *
 * 좌표계는 0~1000 정사각형이다. 노드의 fx·fy(0~1)를 1000배 한 값이고,
 * 게임 세계 좌표 북서 (-3246, -3750) ~ 남동 (4253, 3750) 에 대응한다.
 *
 * 상태를 갖는 최소 단위라서 아일랜드다(ADR-0009).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

export interface MapPoint {
  r: string;
  p: 'i' | 'n' | 'p';
  t: string;
  x: number;
  y: number;
  c: string;
}
export interface MapRes {
  r: string;
  ko: string;
  n: number;
}
export interface MapArea {
  key: string;
  ko: string;
  cells: string[];
}

export interface MapBelt {
  ko: string;
  r: number;
}

interface Props {
  belts: MapBelt[];
  points: MapPoint[];
  resources: MapRes[];
  areas: MapArea[];
  layers: { key: string; ko: string }[];
  levels: { level: number; grid: number }[];
  assetBase: string;
  mapBase: string;
}

const SIZE = 1000;
/** 인게임 지도 격자. 한 칸 약 1.09 km */
const CELL_W = 218.857 / 1600;
const CELL_H = 219.167 / 1600;
const CELL_X0 = 31 / 1600;
const CELL_Y0 = 142 / 1600;
/** 세계 실폭. 거리 재기에 쓴다 */
const WORLD_KM = 7.972;
/** 원본이 5000px 이라 그 이상은 없는 정보를 늘리는 것이다 */
const MAX_ZOOM = 14;

/**
 * 벨트 재료는 길이에 비례한다 — 공식 위키: "roughly 0.5 materials per meter, rounded up".
 * 한 구간은 최대 56 m(파운데이션 일곱 칸)이고 그보다 길면 기둥을 세워 이어야 한다.
 */
const BELT_PER_M = 0.5;
const BELT_SEGMENT_M = 56;
/** 전신주 하나가 덮는 반경. 전력을 끌고 가는 거리를 가늠할 때 쓴다 */
const POLE_SPAN_M = 40;

const PURITY: Record<string, { ko: string; mult: number }> = {
  i: { ko: '불순', mult: 0.5 },
  n: { ko: '보통', mult: 1 },
  p: { ko: '순수', mult: 2 },
};
const KIND: Record<string, string> = {
  node: '채굴 노드',
  deposit: '손으로 캐는 광맥',
  frackingCore: '자원정',
  frackingSatellite: '자원정 분출구',
  geyser: '간헐천',
};

export default function ResourceMap({
  belts: BELTS,
  points,
  resources,
  areas,
  layers,
  levels,
  assetBase,
  mapBase,
}: Props) {
  const [layer, setLayer] = useState(layers[0]?.key ?? 'terrain');
  const [on, setOn] = useState<Set<string>>(
    () => new Set(['Desc_OreIron_C', 'Desc_OreCopper_C', 'Desc_Stone_C', 'Desc_Coal_C'])
  );
  const [pur, setPur] = useState<Set<string>>(() => new Set(['i', 'n', 'p']));
  const [kinds, setKinds] = useState<Set<string>>(
    () => new Set(['node', 'frackingCore', 'frackingSatellite', 'geyser'])
  );
  const [showGrid, setShowGrid] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [sel, setSel] = useState<MapPoint | null>(null);
  const [measure, setMeasure] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } | null } | null>(
    null
  );
  const [vb, setVb] = useState({ x: 0, y: 0, w: SIZE, h: SIZE });
  const [sent, setSent] = useState(false);
  const [q, setQ] = useState('');

  /** 판의 화면 비율. viewBox 를 여기에 맞춰야 지도가 안 찌그러지고 폭도 안 남는다 */
  const [aspect, setAspect] = useState(1.6);
  const host = useRef<HTMLDivElement>(null);
  const pan = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);

  /* 세로는 판 비율에서 나온다. 상태로 들고 다니면 두 값이 어긋난다 */
  const vh = vb.w / aspect;
  const zoom = SIZE / vb.w;

  /**
   * 표시 크기는 배율을 따라 커지되 그대로 비례하진 않는다.
   *
   * 화면 크기로 고정하면 확대해도 안 커져서 광석 그림이 안 보이고,
   * 세계 좌표로 두면 멀리서 볼 때 지도를 덮는다. 그 사이를 지수로 눌러 놓고
   * 위아래를 잘라 둔다 — 멀리서 14px, 최대로 확대하면 52px.
   */
  const markPx = Math.max(14, Math.min(52, 11 * Math.pow(zoom, 0.62)));
  const labelPx = Math.max(9, Math.min(17, 7.5 * Math.pow(zoom, 0.5)));
  /** 화면에서 같은 크기로 보이게 하는 세계 단위 길이 */
  const s = useCallback((px: number) => (px * vb.w) / SIZE, [vb.w]);

  const shown = useMemo(
    () => points.filter((p) => on.has(p.r) && pur.has(p.p) && kinds.has(p.t)),
    [points, on, pur, kinds]
  );

  /**
   * 멀리서 볼 때는 점을 묶는다. 626개를 다 찍으면 서로 겹쳐서 어디에 몇 개인지 못 읽는다.
   * 격자 한 칸 정도로 묶고, 묶음 안이 한 종류면 그 그림을, 섞여 있으면 개수만 보여 준다.
   */
  const clusters = useMemo(() => {
    if (zoom >= 3.2) return null;
    const cell = s(26);
    const bag = new Map<string, { x: number; y: number; n: number; res: Set<string>; pts: MapPoint[] }>();
    for (const p of shown) {
      const k = `${Math.round(p.x / cell)}|${Math.round(p.y / cell)}`;
      const b = bag.get(k) ?? { x: 0, y: 0, n: 0, res: new Set<string>(), pts: [] };
      b.x += p.x;
      b.y += p.y;
      b.n++;
      b.res.add(p.r);
      b.pts.push(p);
      bag.set(k, b);
    }
    return [...bag.values()].map((b) => ({ ...b, x: b.x / b.n, y: b.y / b.n }));
  }, [shown, zoom, s]);

  /** 지금 배율에 맞는 타일 단계와, 그중 보이는 것만 */
  const tiles = useMemo(() => {
    const L = [...levels].sort((a, b) => a.grid - b.grid).find((l) => l.grid * 1024 >= zoom * 1400);
    if (!L) {
      const top = [...levels].sort((a, b) => b.grid - a.grid)[0];
      if (!top || zoom < 1.4) return null;
      return { level: top.level, grid: top.grid, list: visible(top.grid) };
    }
    if (zoom < 1.4) return null;
    return { level: L.level, grid: L.grid, list: visible(L.grid) };

    function visible(grid: number) {
      const step = SIZE / grid;
      const out: { i: number; j: number }[] = [];
      for (let j = 0; j < grid; j++) {
        for (let i = 0; i < grid; i++) {
          if (i * step + step < vb.x || i * step > vb.x + vb.w) continue;
          if (j * step + step < vb.y || j * step > vb.y + vb.w / aspect) continue;
          out.push({ i, j });
        }
      }
      return out;
    }
  }, [zoom, vb, levels, aspect]);

  const toggle = (set: Set<string>, k: string, f: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    f(next);
  };

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = host.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return {
        x: vb.x + ((clientX - r.left) / r.width) * vb.w,
        y: vb.y + ((clientY - r.top) / r.height) * (vb.w / aspect),
      };
    },
    [vb, aspect]
  );

  const zoomAt = useCallback(
    (wx: number, wy: number, f: number) => {
      setVb((v) => {
        const w = Math.max(SIZE / MAX_ZOOM, Math.min(SIZE * Math.max(1, aspect), v.w / f));
        const h = w / aspect;
        const kx = (wx - v.x) / v.w;
        const ky = (wy - v.y) / (v.w / aspect);
        return {
          x: Math.max(-60, Math.min(SIZE + 60 - w, wx - kx * w)),
          y: Math.max(-60, Math.min(SIZE + 60 - h, wy - ky * h)),
          w,
          h,
        };
      });
    },
    [aspect]
  );

  const onDown = (e: PointerEvent) => {
    if (measure) return;
    pan.current = { px: e.clientX, py: e.clientY, vx: vb.x, vy: vb.y };
    moved.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (measure && measure.b === null) {
      const w = toWorld(e.clientX, e.clientY);
      setMeasure((m) => (m ? { ...m, hover: w } : m) as never);
    }
    const p = pan.current;
    const r = host.current?.getBoundingClientRect();
    if (!p || !r) return;
    const dx = ((e.clientX - p.px) / r.width) * vb.w;
    const dy = ((e.clientY - p.py) / r.height) * (vb.w / aspect);
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setVb((v) => ({
      ...v,
      x: Math.max(-60, Math.min(SIZE + 60 - v.w, p.vx - dx)),
      y: Math.max(-60, Math.min(SIZE + 60 - v.w / aspect, p.vy - dy)),
    }));
  };
  const onUp = () => {
    pan.current = null;
  };

  const onStageClick = (e: MouseEvent) => {
    if (!measure || moved.current) return;
    const w = toWorld(e.clientX, e.clientY);
    setMeasure((m) => (m && m.b === null ? { a: m.a, b: w } : { a: w, b: null }));
  };

  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const w = toWorld(e.clientX, e.clientY);
      zoomAt(w.x, w.y, e.deltaY < 0 ? 1.25 : 1 / 1.25);
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [toWorld, zoomAt]);

  const reset = () =>
    setVb(
      aspect >= 1
        ? { x: (SIZE - SIZE * aspect) / 2, y: 0, w: SIZE * aspect, h: SIZE }
        : { x: 0, y: (SIZE - SIZE / aspect) / 2, w: SIZE, h: SIZE / aspect }
    );
  /* 판 크기를 처음 잰 뒤 한 번 맞춘다 */
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || aspect === 1.6) return;
    fitted.current = true;
    reset();
  }, [aspect]);

  const cellBox = (cell: string) => {
    const m = /^X(\d+)Y(\d+)$/.exec(cell);
    if (!m) return null;
    const i = Number(m[1]);
    /* Y0 이 남쪽이라 이미지 행은 뒤집힌다 */
    const j = 5 - Number(m[2]);
    return {
      x: (CELL_X0 + i * CELL_W) * SIZE,
      y: (CELL_Y0 + j * CELL_H) * SIZE,
      w: CELL_W * SIZE,
      h: CELL_H * SIZE,
    };
  };

  /** 어떤 자원이 있는 곳으로 데려간다 */
  const flyTo = (x: number, y: number, w = SIZE / 6) =>
    setVb({ x: x - w / 2, y: y - w / aspect / 2, w, h: w / aspect });

  const koOf = (r: string) => resources.find((x) => x.r === r)?.ko ?? r;

  /** 이 처리량을 감당하는 가장 낮은 벨트 등급 */
  const beltFor = (perMin: number) => {
    const hit = BELTS.find((b) => b.r >= perMin);
    return hit ? hit.ko : `${BELTS[BELTS.length - 1]!.ko}로도 모자란다`;
  };

  /**
   * 설계 화면으로 보낸다.
   *
   * 지도에서 "여기 순수 철 노드가 있다"를 확인한 다음, 그걸 다시 손으로 옮겨 적게 하면
   * 두 화면이 따로 노는 것이다. 저장소에 채굴기 하나를 얹어 두고 설계 화면을 연다.
   */
  const sendToPlanner = (p: MapPoint) => {
    try {
      const raw = localStorage.getItem('sfops.planner');
      const save = raw ? JSON.parse(raw) : { version: 2, nodes: [], edges: [], seq: 1 };
      if (save.version !== 2) return;
      const id = (save.seq ?? 1) + 1;
      save.seq = id;
      save.nodes = [
        ...(save.nodes ?? []),
        {
          id,
          kind: 'extract',
          ref: 'Build_MinerMk1_C',
          machine: 'Build_MinerMk1_C',
          x: 8 + ((save.nodes?.length ?? 0) % 4) * 20,
          y: 8,
          floor: 0,
          count: 1,
          clock: 100,
          rot: 0,
          resource: p.r,
          purity: PURITY[p.p]!.mult,
        },
      ];
      localStorage.setItem('sfops.planner', JSON.stringify(save));
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch {
      /* 저장을 막아 둔 브라우저도 있다 */
    }
  };
  const km = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    (Math.hypot(a.x - b.x, a.y - b.y) / SIZE) * WORLD_KM;

  const hover = (measure as unknown as { hover?: { x: number; y: number } })?.hover;
  const mEnd = measure?.b ?? hover ?? null;

  return (
    <div class="rm">
      <div class="rm-bar">
        <span class="rm-zoom">
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vh / 2, 1 / 1.5)}>
            −
          </button>
          <b class="n">×{Math.round(zoom * 10) / 10}</b>
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vh / 2, 1.5)}>
            +
          </button>
          <button type="button" class="rm-btn is-quiet" onClick={reset}>
            전체
          </button>
        </span>

        <span class="rm-layers">
          {layers.map((l) => (
            <button
              key={l.key}
              type="button"
              class={`rm-btn${layer === l.key ? ' is-on' : ''}`}
              onClick={() => setLayer(l.key)}
            >
              {l.ko}
            </button>
          ))}
        </span>

        <label class="rm-chk">
          <input type="checkbox" checked={showGrid} onChange={() => setShowGrid((v) => !v)} />
          격자
        </label>
        <label class="rm-chk">
          <input type="checkbox" checked={showAreas} onChange={() => setShowAreas((v) => !v)} />
          시작 지점
        </label>
        <button
          type="button"
          class={`rm-btn${measure ? ' is-on' : ''}`}
          onClick={() => setMeasure(measure ? null : { a: { x: 0, y: 0 }, b: null })}
          title="두 점을 눌러 거리를 잽니다"
        >
          거리 재기
        </button>

        <span class="rm-spacer" />
        <span class="rm-count">
          보이는 노드 <b class="n">{shown.length}</b>
        </span>
      </div>

      <div class="rm-body">
        <aside class="rm-side">
          <p class="rm-k">자원</p>
          <input
            class="rm-q"
            type="search"
            value={q}
            placeholder="자원 이름"
            onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
          />
          <ul>
            {resources
              .filter((r) => !q.trim() || r.ko.includes(q.trim()))
              .map((r) => (
              <li key={r.r}>
                <label>
                  <input type="checkbox" checked={on.has(r.r)} onChange={() => toggle(on, r.r, setOn)} />
                  <img src={`${assetBase}/items/${r.r}.png`} alt="" width="20" height="20" />
                  <span>{r.ko}</span>
                  <b class="n">{r.n}</b>
                </label>
                <button
                  type="button"
                  class="rm-go"
                  title={`${r.ko} 있는 곳 보기`}
                  onClick={() => {
                    const hit = points.filter((p) => p.r === r.r);
                    if (!hit.length) return;
                    const cx = hit.reduce((a, p) => a + p.x, 0) / hit.length;
                    const cy = hit.reduce((a, p) => a + p.y, 0) / hit.length;
                    setOn(new Set([r.r]));
                    flyTo(cx, cy, SIZE / 2.2);
                  }}
                >
                  ↗
                </button>
              </li>
            ))}
          </ul>
          <div class="rm-quick">
            <button type="button" onClick={() => setOn(new Set(resources.map((r) => r.r)))}>
              전부
            </button>
            <button type="button" onClick={() => setOn(new Set())}>
              해제
            </button>
          </div>

          <p class="rm-k">순도</p>
          <ul class="rm-pur">
            {(['p', 'n', 'i'] as const).map((k) => (
              <li key={k}>
                <label>
                  <input type="checkbox" checked={pur.has(k)} onChange={() => toggle(pur, k, setPur)} />
                  <span>{PURITY[k]!.ko}</span>
                  <b class="n">×{PURITY[k]!.mult}</b>
                </label>
              </li>
            ))}
          </ul>

          <p class="rm-k">종류</p>
          <ul class="rm-pur">
            {Object.entries(KIND).map(([k, ko]) => (
              <li key={k}>
                <label>
                  <input type="checkbox" checked={kinds.has(k)} onChange={() => toggle(kinds, k, setKinds)} />
                  <span>{ko}</span>
                  <b class="n">{points.filter((p) => p.t === k).length}</b>
                </label>
              </li>
            ))}
          </ul>
        </aside>

        <div
          class={`rm-stage${measure ? ' is-measuring' : ''}`}
          ref={host}
          onPointerDown={(e) => onDown(e as unknown as PointerEvent)}
          onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onClick={(e) => onStageClick(e as unknown as MouseEvent)}
        >
          <svg class="rm-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vh}`} role="img" aria-label="자원 지도">
            <image href={`${mapBase}/${layer}/preview.webp`} x="0" y="0" width={SIZE} height={SIZE} />
            {tiles?.list.map((t) => {
              const step = SIZE / tiles.grid;
              return (
                <image
                  key={`${layer}-${tiles.level}-${t.i}-${t.j}`}
                  href={`${mapBase}/${layer}/${tiles.level}-${t.i}-${t.j}.webp`}
                  x={t.i * step}
                  y={t.j * step}
                  width={step}
                  height={step}
                />
              );
            })}

            {showGrid && (
              <g class="rm-grid">
                {Array.from({ length: 7 }, (_, i) =>
                  Array.from({ length: 6 }, (_, jj) => {
                    const b = cellBox(`X${i}Y${jj}`)!;
                    return (
                      <g key={`g${i}-${jj}`}>
                        <rect x={b.x} y={b.y} width={b.w} height={b.h} vector-effect="non-scaling-stroke" />
                        {zoom > 1.2 && (
                          <text x={b.x + s(6)} y={b.y + s(labelPx * 1.5)} font-size={s(labelPx * 1.1)}>
                            X{i}Y{jj}
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </g>
            )}

            {showAreas &&
              areas.map((a) =>
                a.cells.map((c) => {
                  const b = cellBox(c);
                  if (!b) return null;
                  return (
                    <g key={`${a.key}-${c}`} class="rm-area">
                      <rect
                        x={b.x}
                        y={b.y}
                        width={b.w}
                        height={b.h}
                        rx={s(4)}
                        vector-effect="non-scaling-stroke"
                      />
                      <text x={b.x + b.w / 2} y={b.y + b.h / 2} font-size={s(Math.max(14, labelPx * 1.5))}>
                        {a.ko}
                      </text>
                    </g>
                  );
                })
              )}

            {/* 멀리서는 묶어서, 가까이서는 하나씩 */}
            {clusters
              ? clusters.map((c, i) => {
                  const one = c.n === 1 ? c.pts[0]! : null;
                  const r = s(one ? markPx / 2 : Math.min(markPx * 0.9, markPx / 2 + Math.log2(c.n) * 3));
                  return (
                    <g
                      key={`c${i}`}
                      class={one ? `rm-pt is-${one.p}` : 'rm-cl'}
                      onClick={() => (one ? setSel(one) : flyTo(c.x, c.y, Math.max(SIZE / 8, vb.w / 3)))}
                    >
                      <circle cx={c.x} cy={c.y} r={r} vector-effect="non-scaling-stroke" />
                      {one ? (
                        <image
                          href={`${assetBase}/items/${one.r}.png`}
                          x={c.x - r * 0.7}
                          y={c.y - r * 0.7}
                          width={r * 1.4}
                          height={r * 1.4}
                        />
                      ) : (
                        <>
                          {c.res.size === 1 && (
                            <image
                              href={`${assetBase}/items/${[...c.res][0]}.png`}
                              x={c.x - r * 0.52}
                              y={c.y - r * 0.72}
                              width={r * 1.04}
                              height={r * 1.04}
                            />
                          )}
                          <text
                            x={c.x}
                            y={c.res.size === 1 ? c.y + r * 0.66 : c.y + s(labelPx * 0.36)}
                            font-size={s(c.res.size === 1 ? labelPx * 0.9 : labelPx * 1.15)}
                          >
                            {c.n}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })
              : shown.map((p, i) => {
                  const r = s((markPx / 2) * (p.t === 'node' ? 1 : 0.82));
                  const active = sel === p;
                  return (
                    <g
                      key={`${p.r}-${i}`}
                      class={`rm-pt is-${p.p}${active ? ' is-sel' : ''}`}
                      onClick={() => !moved.current && setSel(active ? null : p)}
                    >
                      <circle cx={p.x} cy={p.y} r={r} vector-effect="non-scaling-stroke" />
                      {/* 그림도 같이 커진다. 확대했는데 광석이 안 보이면 지도가 아니다 */}
                      <image
                        href={`${assetBase}/items/${p.r}.png`}
                        x={p.x - r * 0.74}
                        y={p.y - r * 0.74}
                        width={r * 1.48}
                        height={r * 1.48}
                      />
                      {zoom > 2.4 && (
                        <text
                          x={p.x}
                          y={p.y + r + s(labelPx)}
                          font-size={s(labelPx)}
                          class="rm-plabel"
                        >
                          {/* 이름까지 붙이면 서로 겹친다. 어느 정도 들어가야 이름을 준다 */}
                          {zoom > 4.5 ? `${koOf(p.r)} · ${PURITY[p.p]!.ko}` : PURITY[p.p]!.ko}
                        </text>
                      )}
                    </g>
                  );
                })}

            {measure && mEnd && (
              <g class="rm-measure">
                <line
                  x1={measure.a.x}
                  y1={measure.a.y}
                  x2={mEnd.x}
                  y2={mEnd.y}
                  vector-effect="non-scaling-stroke"
                />
                <circle cx={measure.a.x} cy={measure.a.y} r={s(4)} vector-effect="non-scaling-stroke" />
                <circle cx={mEnd.x} cy={mEnd.y} r={s(4)} vector-effect="non-scaling-stroke" />
                <text
                  x={(measure.a.x + mEnd.x) / 2}
                  y={(measure.a.y + mEnd.y) / 2 - s(8)}
                  font-size={s(Math.max(12, labelPx * 1.2))}
                >
                  {km(measure.a, mEnd).toFixed(2)} km
                </text>
                <text
                  x={(measure.a.x + mEnd.x) / 2}
                  y={(measure.a.y + mEnd.y) / 2 + s(12)}
                  font-size={s(Math.max(10, labelPx))}
                >
                  벨트 재료 {Math.ceil(km(measure.a, mEnd) * 1000 * BELT_PER_M)}개 · 구간{' '}
                  {Math.ceil((km(measure.a, mEnd) * 1000) / BELT_SEGMENT_M)}개 · 전신주{' '}
                  {Math.ceil((km(measure.a, mEnd) * 1000) / POLE_SPAN_M)}개
                </text>
              </g>
            )}
          </svg>

          {measure && (
            <p class="rm-hint">
              두 점을 누르면 거리가 나옵니다. 다시 누르면 새로 잽니다.
              <button type="button" onClick={() => setMeasure(null)}>
                끝내기
              </button>
            </p>
          )}

          {sel && (
            <div class="rm-info">
              <img src={`${assetBase}/items/${sel.r}.png`} alt="" width="34" height="34" />
              <div>
                <b>{koOf(sel.r)}</b>
                <span>
                  {PURITY[sel.p]!.ko} · {KIND[sel.t] ?? sel.t} · {sel.c}
                </span>
                <span class="n">
                  {sel.t === 'node'
                    ? `채굴기 Mk.1 ${60 * PURITY[sel.p]!.mult}/분 · Mk.2 ${120 * PURITY[sel.p]!.mult}/분 · Mk.3 ${240 * PURITY[sel.p]!.mult}/분`
                    : sel.t === 'deposit'
                      ? '기계를 못 놓는다. 손으로만 캔다'
                      : sel.t === 'geyser'
                        ? '지열 발전기 전용'
                        : '자원정 추출기(티어 8) 전용'}
                </span>
                {sel.t === 'node' && (
                  <span class="rm-belt">
                    {beltFor(240 * PURITY[sel.p]!.mult)} 이상이라야 Mk.3 산출을 다 받는다
                  </span>
                )}
              </div>
              {sel.t === 'node' && (
                <button
                  type="button"
                  class="rm-send"
                  onClick={() => sendToPlanner(sel)}
                  title="설계 화면에 이 노드의 채굴기를 놓는다"
                >
                  {sent ? '보냈습니다' : '설계로 보내기'}
                </button>
              )}
              <button type="button" onClick={() => setSel(null)} aria-label="닫기">
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
