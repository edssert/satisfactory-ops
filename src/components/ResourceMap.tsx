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

interface Props {
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

  const host = useRef<HTMLDivElement>(null);
  const pan = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);

  const zoom = SIZE / vb.w;
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
          if (j * step + step < vb.y || j * step > vb.y + vb.h) continue;
          out.push({ i, j });
        }
      }
      return out;
    }
  }, [zoom, vb, levels]);

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
        y: vb.y + ((clientY - r.top) / r.height) * vb.h,
      };
    },
    [vb]
  );

  const zoomAt = useCallback((wx: number, wy: number, f: number) => {
    setVb((v) => {
      const w = Math.max(SIZE / MAX_ZOOM, Math.min(SIZE, v.w / f));
      const kx = (wx - v.x) / v.w;
      const ky = (wy - v.y) / v.h;
      const x = Math.max(-30, Math.min(SIZE + 30 - w, wx - kx * w));
      const y = Math.max(-30, Math.min(SIZE + 30 - w, wy - ky * w));
      return { x, y, w, h: w };
    });
  }, []);

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
    const dy = ((e.clientY - p.py) / r.height) * vb.h;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setVb((v) => ({
      ...v,
      x: Math.max(-30, Math.min(SIZE + 30 - v.w, p.vx - dx)),
      y: Math.max(-30, Math.min(SIZE + 30 - v.h, p.vy - dy)),
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
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const w = toWorld(e.clientX, e.clientY);
      zoomAt(w.x, w.y, e.deltaY < 0 ? 1.25 : 1 / 1.25);
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [toWorld, zoomAt]);

  const reset = () => setVb({ x: 0, y: 0, w: SIZE, h: SIZE });

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
    setVb({ x: Math.max(0, x - w / 2), y: Math.max(0, y - w / 2), w, h: w });

  const koOf = (r: string) => resources.find((x) => x.r === r)?.ko ?? r;
  const km = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    (Math.hypot(a.x - b.x, a.y - b.y) / SIZE) * WORLD_KM;

  const hover = (measure as unknown as { hover?: { x: number; y: number } })?.hover;
  const mEnd = measure?.b ?? hover ?? null;

  return (
    <div class="rm">
      <div class="rm-bar">
        <span class="rm-zoom">
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1 / 1.5)}>
            −
          </button>
          <b class="n">×{Math.round(zoom * 10) / 10}</b>
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1.5)}>
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
          <ul>
            {resources.map((r) => (
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
          <svg class="rm-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="자원 지도">
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
                          <text x={b.x + s(5)} y={b.y + s(13)} font-size={s(10)}>
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
                      <text x={b.x + b.w / 2} y={b.y + b.h / 2} font-size={s(14)}>
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
                  const r = s(one ? 8 : Math.min(15, 8 + Math.log2(c.n) * 2.4));
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
                            y={c.res.size === 1 ? c.y + r * 0.66 : c.y + s(4)}
                            font-size={s(c.res.size === 1 ? 9 : 12)}
                          >
                            {c.n}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })
              : shown.map((p, i) => {
                  const r = s(p.t === 'node' ? 9 : 7);
                  const active = sel === p;
                  return (
                    <g
                      key={`${p.r}-${i}`}
                      class={`rm-pt is-${p.p}${active ? ' is-sel' : ''}`}
                      onClick={() => !moved.current && setSel(active ? null : p)}
                    >
                      <circle cx={p.x} cy={p.y} r={r} vector-effect="non-scaling-stroke" />
                      <image
                        href={`${assetBase}/items/${p.r}.png`}
                        x={p.x - r * 0.7}
                        y={p.y - r * 0.7}
                        width={r * 1.4}
                        height={r * 1.4}
                      />
                      {zoom > 5 && (
                        <text x={p.x} y={p.y + r + s(10)} font-size={s(9)} class="rm-plabel">
                          {PURITY[p.p]!.ko}
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
                  font-size={s(12)}
                >
                  {km(measure.a, mEnd).toFixed(2)} km
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
              </div>
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
