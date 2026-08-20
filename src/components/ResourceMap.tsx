/**
 * ResourceMap — 자원 지도.
 *
 * 지형만 사진이고 그 위에 올라가는 것은 전부 SVG 다 — 노드, 격자, 시작 지점, 글자.
 * 그래서 아무리 확대해도 표시가 선명하다. 게임 지형의 벡터 원본은 공개된 것이 없어서
 * 바탕만 사진으로 두고, 대신 **타일로 잘라** 확대한 자리만 큰 그림을 받는다.
 *
 *   미리보기 1024 한 장   첫 화면. 즉시 뜬다
 *   타일     4×4          확대하면 보이는 칸만 받는다
 *
 * 좌표계는 0~1000 정사각형이다. 노드의 fx·fy(0~1)를 1000배 한 값이고,
 * 게임 세계 좌표는 북서 (-3246, -3750) ~ 남동 (4253, 3750) 에 대응한다.
 *
 * 상태를 갖는 최소 단위라서 아일랜드다(ADR-0009). 데이터는 페이지가 서브셋을 넘긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

/** 페이지가 넘겨주는 노드. 키가 짧은 것은 HTML 에 인라인되기 때문이다 */
export interface MapPoint {
  /** 자원 클래스 */
  r: string;
  /** 순도 i·n·p */
  p: 'i' | 'n' | 'p';
  /** 종류 — node · deposit · frackingCore · frackingSatellite · geyser */
  t: string;
  x: number;
  y: number;
  /** 격자 칸 */
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
  grid: number;
  assetBase: string;
  mapBase: string;
}

const SIZE = 1000;
/** 인게임 지도 격자. 한 칸 약 1.09 km */
const CELL_W = 218.857 / 1600;
const CELL_H = 219.167 / 1600;
const CELL_X0 = 31 / 1600;
const CELL_Y0 = 142 / 1600;

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
  grid,
  assetBase,
  mapBase,
}: Props) {
  const [layer, setLayer] = useState(layers[0]?.key ?? 'terrain');
  const [on, setOn] = useState<Set<string>>(
    () => new Set(['Desc_OreIron_C', 'Desc_OreCopper_C', 'Desc_Stone_C', 'Desc_Coal_C'])
  );
  const [pur, setPur] = useState<Set<string>>(() => new Set(['i', 'n', 'p']));
  const [showGrid, setShowGrid] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [sel, setSel] = useState<MapPoint | null>(null);
  /** viewBox. 세계 좌표 0~1000 */
  const [vb, setVb] = useState({ x: 0, y: 0, w: SIZE, h: SIZE });

  const host = useRef<HTMLDivElement>(null);
  const pan = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);

  const zoom = SIZE / vb.w;
  /** 화면에서 같은 크기로 보이게 하는 배율 */
  const s = (px: number) => (px * vb.w) / SIZE;

  const shown = useMemo(
    () => points.filter((p) => on.has(p.r) && pur.has(p.p)),
    [points, on, pur]
  );

  /** 지금 보이는 자리의 타일만. 확대 전에는 미리보기 한 장으로 버틴다 */
  const tiles = useMemo(() => {
    if (zoom < 1.6) return [];
    const step = SIZE / grid;
    const out: { i: number; j: number }[] = [];
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const x0 = i * step;
        const y0 = j * step;
        if (x0 + step < vb.x || x0 > vb.x + vb.w) continue;
        if (y0 + step < vb.y || y0 > vb.y + vb.h) continue;
        out.push({ i, j });
      }
    }
    return out;
  }, [zoom, vb, grid]);

  const toggle = (set: Set<string>, k: string, f: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    f(next);
  };

  const toWorld = (clientX: number, clientY: number) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: vb.x + ((clientX - r.left) / r.width) * vb.w,
      y: vb.y + ((clientY - r.top) / r.height) * vb.h,
    };
  };

  const zoomAt = useCallback(
    (wx: number, wy: number, f: number) => {
      setVb((v) => {
        const w = Math.max(SIZE / 14, Math.min(SIZE, v.w / f));
        const h = w;
        /* 가리킨 지점이 제자리에 있게 */
        const kx = (wx - v.x) / v.w;
        const ky = (wy - v.y) / v.h;
        let x = wx - kx * w;
        let y = wy - ky * h;
        x = Math.max(-40, Math.min(SIZE + 40 - w, x));
        y = Math.max(-40, Math.min(SIZE + 40 - h, y));
        return { x, y, w, h };
      });
    },
    []
  );

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    zoomAt(w.x, w.y, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  };

  const onDown = (e: PointerEvent) => {
    pan.current = { px: e.clientX, py: e.clientY, vx: vb.x, vy: vb.y };
    moved.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = pan.current;
    const r = host.current?.getBoundingClientRect();
    if (!p || !r) return;
    const dx = ((e.clientX - p.px) / r.width) * vb.w;
    const dy = ((e.clientY - p.py) / r.height) * vb.h;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setVb((v) => ({
      ...v,
      x: Math.max(-40, Math.min(SIZE + 40 - v.w, p.vx - dx)),
      y: Math.max(-40, Math.min(SIZE + 40 - v.h, p.vy - dy)),
    }));
  };
  const onUp = () => {
    pan.current = null;
  };

  const reset = () => setVb({ x: 0, y: 0, w: SIZE, h: SIZE });

  /** 격자 칸 → 화면 사각형 */
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

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const h = (e: Event) => onWheel(e as WheelEvent);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [vb]);

  const step = SIZE / grid;
  const koOf = (r: string) => resources.find((x) => x.r === r)?.ko ?? r;

  return (
    <div class="rm">
      <div class="rm-bar">
        <span class="rm-zoom">
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1 / 1.4)}>
            −
          </button>
          <b class="n">×{Math.round(zoom * 10) / 10}</b>
          <button type="button" class="rm-sq" onClick={() => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, 1.4)}>
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
                  <input
                    type="checkbox"
                    checked={on.has(r.r)}
                    onChange={() => toggle(on, r.r, setOn)}
                  />
                  <img src={`${assetBase}/items/${r.r}.png`} alt="" width="20" height="20" />
                  <span>{r.ko}</span>
                  <b class="n">{r.n}</b>
                </label>
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
        </aside>

        <div
          class="rm-stage"
          ref={host}
          onPointerDown={(e) => onDown(e as unknown as PointerEvent)}
          onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <svg
            class="rm-svg"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            role="img"
            aria-label="자원 지도"
          >
            {/* 바탕은 미리보기 한 장. 그 위에 확대한 자리의 타일만 얹는다 */}
            <image
              href={`${mapBase}/${layer}/preview.webp`}
              x="0"
              y="0"
              width={SIZE}
              height={SIZE}
            />
            {tiles.map((t) => (
              <image
                key={`${layer}-${t.i}-${t.j}`}
                href={`${mapBase}/${layer}/${t.i}-${t.j}.webp`}
                x={t.i * step}
                y={t.j * step}
                width={step}
                height={step}
              />
            ))}

            {showGrid && (
              <g class="rm-grid">
                {Array.from({ length: 7 }, (_, i) =>
                  Array.from({ length: 6 }, (_, jj) => {
                    const b = cellBox(`X${i}Y${jj}`)!;
                    return (
                      <g key={`g${i}-${jj}`}>
                        <rect x={b.x} y={b.y} width={b.w} height={b.h} />
                        {zoom > 1.2 && (
                          <text x={b.x + s(4)} y={b.y + s(12)} font-size={s(9)}>
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
                      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={s(3)} />
                      <text x={b.x + b.w / 2} y={b.y + b.h / 2} font-size={s(13)}>
                        {a.ko}
                      </text>
                    </g>
                  );
                })
              )}

            {shown.map((p, i) => {
              const r = s(p.t === 'node' ? 7 : 5);
              const active = sel === p;
              return (
                <g
                  key={`${p.r}-${i}`}
                  class={`rm-pt is-${p.p}${active ? ' is-sel' : ''}`}
                  onClick={() => !moved.current && setSel(active ? null : p)}
                >
                  <circle cx={p.x} cy={p.y} r={r} />
                  <image
                    href={`${assetBase}/items/${p.r}.png`}
                    x={p.x - r * 0.72}
                    y={p.y - r * 0.72}
                    width={r * 1.44}
                    height={r * 1.44}
                  />
                  {zoom > 3 && (
                    <text x={p.x} y={p.y + r + s(9)} font-size={s(8)} class="rm-plabel">
                      {PURITY[p.p]!.ko}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

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
                    ? `채굴기 Mk.1 ${60 * PURITY[sel.p]!.mult}/분 · Mk.3 ${240 * PURITY[sel.p]!.mult}/분`
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
