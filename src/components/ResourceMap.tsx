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

/** 수집품 — 슬러그·소머슬룹·머서 구체·하드 드라이브 */
export interface MapDrop {
  k: string;
  x: number;
  y: number;
  /** 하드 드라이브의 잠금 비용 */
  c?: { ko: string; amount: number; item: string }[];
}
export interface MapDropKind {
  key: string;
  ko: string;
  item: string | null;
  n: number;
  fill: string;
}

interface Props {
  drops: MapDrop[];
  dropKinds: MapDropKind[];
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

/*
 * 순도를 색으로 구분한다 — 커뮤니티 지도들이 그렇게 하고 눈에 가장 빨리 읽힌다.
 * 다만 색만으로 두지 않는다(색각 이상 대응). 동그라미 옆에 한 글자 배지가 항상 붙고,
 * 누르면 아래에 이름과 순도가 글로 뜬다. 빨강·초록 짝을 피해 불순은 회색을 쓴다.
 */
const PURITY: Record<string, { ko: string; short: string; mult: number; fill: string }> = {
  i: { ko: '불순', short: '불', mult: 0.5, fill: '#8d99a6' },
  n: { ko: '보통', short: '보', mult: 1, fill: '#f0a52b' },
  p: { ko: '순수', short: '순', mult: 2, fill: '#3fbf6f' },
};
const KIND: Record<string, string> = {
  node: '채굴 노드',
  deposit: '손으로 캐는 광맥',
  frackingCore: '자원정',
  frackingSatellite: '자원정 분출구',
  geyser: '간헐천',
};

export default function ResourceMap({
  drops,
  dropKinds,
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
  /* 수집품은 처음엔 꺼 둔다. 1764개를 한꺼번에 켜면 자원이 안 보인다 */
  const [dropsOn, setDropsOn] = useState<Set<string>>(() => new Set());
  const [dropInfo, setDropInfo] = useState<MapDrop | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [sel, setSel] = useState<MapPoint | null>(null);
  /**
   * 거리 재기.
   *
   * 벨트는 직선으로 못 깐다 — 언덕을 돌고 강을 피해 꺾인다. 그래서 두 점이 아니라
   * 꺾이는 점들을 찍는다. 구간마다 길이가 뜨고 합계가 따로 나온다.
   *   pts   찍은 점들 (세계 좌표)
   *   at    아직 안 찍고 마우스가 있는 자리 — 다음 구간을 미리 보여 준다
   *   done  다 찍었는가
   */
  const [measure, setMeasure] = useState<{
    pts: { x: number; y: number }[];
    at: { x: number; y: number } | null;
    done: boolean;
  } | null>(null);
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

  /*
   * 묶지 않는다. 앞서 멀리서 볼 때 점을 묶어 「+4」처럼 보여 줬는데,
   * 그러면 최소 배율에서 무엇이 어디에 있는지가 사라진다. 전부 하나씩 찍는다.
   */
  const shownDrops = useMemo(
    () => drops.filter((d) => dropsOn.has(d.k)),
    [drops, dropsOn]
  );

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
    if (measure && !measure.done) return;
    pan.current = { px: e.clientX, py: e.clientY, vx: vb.x, vy: vb.y };
    moved.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (measure && !measure.done) {
      const w = toWorld(e.clientX, e.clientY);
      setMeasure((m) => (m ? { ...m, at: w } : m));
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
    setMeasure((m) => {
      if (!m) return m;
      /* 다 찍은 뒤 다시 누르면 새로 잰다 */
      if (m.done) return { pts: [w], at: w, done: false };
      return { pts: [...m.pts, w], at: w, done: false };
    });
  };
  /*
   * 두 번 누르면 거기서 끝낸다.
   * 두 번 누르기는 누르기 두 번이라 같은 자리에 점이 두 개 찍힌다 — 겹친 것을 지운다.
   */
  const onStageDouble = () => {
    setMeasure((m) => {
      if (!m || m.pts.length < 2) return m;
      const pts = m.pts.filter(
        (q, i) => i === 0 || Math.hypot(q.x - m.pts[i - 1]!.x, q.y - m.pts[i - 1]!.y) > 0.5
      );
      return { pts, at: null, done: true };
    });
  };
  const undoPoint = () =>
    setMeasure((m) => (m && m.pts.length ? { ...m, pts: m.pts.slice(0, -1), done: false } : m));

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

  /* Esc 로 끝내고 Backspace 로 마지막 점을 무른다 */
  useEffect(() => {
    if (!measure) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMeasure(null);
      if (e.key === 'Backspace') {
        e.preventDefault();
        undoPoint();
      }
      if (e.key === 'Enter') setMeasure((m) => (m ? { ...m, at: null, done: true } : m));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measure]);

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
  /** 겹쳐 보기는 지형 위에 생물군계를 얹는 것이라 바탕은 지형이다 */
  const baseLayer = (k: string) => (k === 'blend' ? 'terrain' : k);

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

  /* 그릴 선 — 찍은 점들 + (아직 안 끝났으면) 마우스가 있는 자리 */
  const line = measure ? [...measure.pts, ...(!measure.done && measure.at ? [measure.at] : [])] : [];
  const totalKm = line.slice(1).reduce((a, q, i) => a + km(line[i]!, q), 0);
  /* 마지막 점이 화면 오른쪽에 있으면 글자를 왼쪽으로 뻗는다. 안 그러면 판 밖으로 나간다 */
  const endAnchor: 'start' | 'end' =
    line.length && line[line.length - 1]!.x > vb.x + vb.w * 0.62 ? 'end' : 'start';

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
          onClick={() => setMeasure(measure ? null : { pts: [], at: null, done: false })}
          title="꺾이는 점들을 눌러 거리를 잽니다"
        >
          거리 재기
        </button>

        <span class="rm-legend" aria-label="순도 색 안내">
          {(['p', 'n', 'i'] as const).map((k) => (
            <span key={k}>
              <i style={`background:${PURITY[k]!.fill}`} aria-hidden="true"></i>
              {PURITY[k]!.ko}
            </span>
          ))}
        </span>

        <span class="rm-spacer" />
        <span class="rm-count">
          보이는 노드 <b class="n">{shown.length}</b>
          {shownDrops.length > 0 && (
            <>
              {' · 수집품 '}
              <b class="n">{shownDrops.length}</b>
            </>
          )}
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

          <p class="rm-k">수집품</p>
          <ul>
            {dropKinds.map((k) => (
              <li key={k.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={dropsOn.has(k.key)}
                    onChange={() => toggle(dropsOn, k.key, setDropsOn)}
                  />
                  <i class="rm-swatch" style={`background:${k.fill}`} aria-hidden="true"></i>
                  {k.item && <img src={`${assetBase}/items/${k.item}.png`} alt="" width="20" height="20" />}
                  <span>{k.ko}</span>
                  <b class="n">{k.n}</b>
                </label>
              </li>
            ))}
          </ul>

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
          onDblClick={onStageDouble}
        >
          <svg class="rm-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vh}`} role="img" aria-label="자원 지도">
            <image href={`${mapBase}/${baseLayer(layer)}/preview.webp`} x="0" y="0" width={SIZE} height={SIZE} />
            {tiles?.list.map((t) => {
              const step = SIZE / tiles.grid;
              return (
                <image
                  key={`${layer}-${tiles.level}-${t.i}-${t.j}`}
                  href={`${mapBase}/${baseLayer(layer)}/${tiles.level}-${t.i}-${t.j}.webp`}
                  x={t.i * step}
                  y={t.j * step}
                  width={step}
                  height={step}
                />
              );
            })}

            {/* 겹쳐 보기 — 지형 위에 생물군계를 반투명으로 얹으면 지대 구분이 살아난다 */}
            {layer === 'blend' && (
              <g class="rm-blend">
                <image href={`${mapBase}/biome/preview.webp`} x="0" y="0" width={SIZE} height={SIZE} />
                {tiles?.list.map((t) => {
                  const step = SIZE / tiles.grid;
                  return (
                    <image
                      key={`b-${tiles.level}-${t.i}-${t.j}`}
                      href={`${mapBase}/biome/${tiles.level}-${t.i}-${t.j}.webp`}
                      x={t.i * step}
                      y={t.j * step}
                      width={step}
                      height={step}
                    />
                  );
                })}
              </g>
            )}

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

            {/* 자원 노드 — 최소 배율에서도 하나씩 보인다 */}
            {shown.map((p, i) => {
              const r = s((markPx / 2) * (p.t === 'node' ? 1 : 0.82));
              const active = sel === p;
              /* 동그라미를 점 위로 띄우고 가는 줄로 실제 자리를 가리킨다. 지형을 안 가린다 */
              const cy = p.y - r * 1.55;
              return (
                <g
                  key={`${p.r}-${i}`}
                  class={`rm-pt is-${p.p}${active ? ' is-sel' : ''}`}
                  onClick={() => !moved.current && setSel(active ? null : p)}
                >
                  <line x1={p.x} y1={p.y} x2={p.x} y2={cy} vector-effect="non-scaling-stroke" />
                  <circle cx={p.x} cy={p.y} r={s(1.6)} class="rm-foot" vector-effect="non-scaling-stroke" />
                  <circle
                    cx={p.x}
                    cy={cy}
                    r={r}
                    fill={PURITY[p.p]!.fill}
                    vector-effect="non-scaling-stroke"
                  />
                  <image
                    href={`${assetBase}/items/${p.r}.png`}
                    x={p.x - r * 0.72}
                    y={cy - r * 0.72}
                    width={r * 1.44}
                    height={r * 1.44}
                  />
                  <title>
                    {koOf(p.r)} · {PURITY[p.p]!.ko} · {KIND[p.t] ?? p.t}
                  </title>
                </g>
              );
            })}

            {/* 수집품 — 슬러그·소머슬룹·머서 구체·하드 드라이브 */}
            {shownDrops.map((d, i) => {
              const kind = dropKinds.find((k) => k.key === d.k);
              const r = s(markPx / 2) * 0.86;
              const cy = d.y - r * 1.5;
              return (
                <g
                  key={`d${i}`}
                  class={`rm-drop${d.k === 'drive' ? ' is-drive' : ''}`}
                  onPointerEnter={() => setDropInfo(d)}
                  onPointerLeave={() => setDropInfo((h) => (h === d ? null : h))}
                  onClick={() => !moved.current && setDropInfo(d)}
                >
                  <line x1={d.x} y1={d.y} x2={d.x} y2={cy} vector-effect="non-scaling-stroke" />
                  <circle cx={d.x} cy={d.y} r={s(1.4)} class="rm-foot" vector-effect="non-scaling-stroke" />
                  <circle
                    cx={d.x}
                    cy={cy}
                    r={r}
                    fill={kind?.fill ?? '#7d8ea0'}
                    vector-effect="non-scaling-stroke"
                  />
                  {kind?.item && (
                    <image
                      href={`${assetBase}/items/${kind.item}.png`}
                      x={d.x - r * 0.7}
                      y={cy - r * 0.7}
                      width={r * 1.4}
                      height={r * 1.4}
                    />
                  )}
                  <title>
                    {kind?.ko ?? d.k}
                    {d.c ? ` — 잠금 ${d.c.map((c) => `${c.ko} ${c.amount}`).join(', ')}` : ''}
                  </title>
                </g>
              );
            })}

            {measure && line.length >= 2 && (
              <g class="rm-measure">
                <path
                  d={line.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ')}
                  fill="none"
                  vector-effect="non-scaling-stroke"
                />
                {line.map((q, i) => (
                  <circle key={`mp${i}`} cx={q.x} cy={q.y} r={s(4)} vector-effect="non-scaling-stroke" />
                ))}
                {/* 구간마다 길이. 짧은 구간에까지 붙이면 글자가 겹친다 */}
                {line.slice(1).map((q, i) => {
                  const a = line[i]!;
                  const d = km(a, q);
                  if (d * 1000 < 60) return null;
                  return (
                    <text
                      key={`ms${i}`}
                      x={(a.x + q.x) / 2}
                      y={(a.y + q.y) / 2 - s(7)}
                      font-size={s(Math.max(11, labelPx))}
                      class="rm-seg"
                    >
                      {Math.round(d * 1000)} m
                    </text>
                  );
                })}
                {/* 합계는 마지막 점 옆에 */}
                <text
                  x={line[line.length - 1]!.x + s(endAnchor === 'end' ? -8 : 8)}
                  y={line[line.length - 1]!.y + s(Math.max(16, labelPx * 1.5))}
                  font-size={s(Math.max(13, labelPx * 1.2))}
                  text-anchor={endAnchor}
                >
                  합 {totalKm.toFixed(2)} km
                </text>
                <text
                  x={line[line.length - 1]!.x + s(endAnchor === 'end' ? -8 : 8)}
                  y={line[line.length - 1]!.y + s(Math.max(30, labelPx * 2.8))}
                  font-size={s(Math.max(10, labelPx * 0.95))}
                  text-anchor={endAnchor}
                >
                  벨트 재료 {Math.ceil(totalKm * 1000 * BELT_PER_M)}개 · 구간{' '}
                  {Math.ceil((totalKm * 1000) / BELT_SEGMENT_M)}개 · 전신주{' '}
                  {Math.ceil((totalKm * 1000) / POLE_SPAN_M)}개
                </text>
              </g>
            )}

          </svg>

          {measure && (
            <p class="rm-hint">
              {measure.done
                ? `${measure.pts.length}점 · ${totalKm.toFixed(2)} km — 다시 누르면 새로 잽니다`
                : '꺾이는 자리를 차례로 누르세요. 두 번 누르면 끝납니다'}
              <button type="button" onClick={undoPoint} disabled={!measure.pts.length}>
                한 점 무르기
              </button>
              <button type="button" onClick={() => setMeasure(null)}>
                끝내기
              </button>
            </p>
          )}

          {dropInfo && (
            <div class="rm-hover">
              {(() => {
                const kind = dropKinds.find((k) => k.key === dropInfo.k);
                return (
                  <>
                    {kind?.item && (
                      <img src={`${assetBase}/items/${kind.item}.png`} alt="" width="30" height="30" />
                    )}
                    <div>
                      <b>{kind?.ko ?? dropInfo.k}</b>
                      {dropInfo.c ? (
                        <span class="rm-cost">
                          화물칸을 여는 데:{' '}
                          {dropInfo.c.map((c) => (
                            <em key={c.item}>
                              <img src={`${assetBase}/items/${c.item}.png`} alt="" width="18" height="18" />
                              {c.ko} {c.amount}
                            </em>
                          ))}
                        </span>
                      ) : dropInfo.k === 'drive' ? (
                        <span>
                          여는 데 드는 물건이 데이터에 없습니다 — 그냥 열리거나 전력을 이어야 하는
                          화물칸입니다
                        </span>
                      ) : (
                        <span>주우면 그만입니다. 다시 생기지 않습니다</span>
                      )}
                    </div>
                    <button type="button" onClick={() => setDropInfo(null)} aria-label="닫기">
                      ✕
                    </button>
                  </>
                );
              })()}
            </div>
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
