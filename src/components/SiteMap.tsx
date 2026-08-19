/**
 * SiteMap — F2 입지 선정 (아일랜드).
 *
 * 맵 이미지 위에 추천 부지 핀과 자원 노드를 얹고, 선택한 부지 기준으로
 * 티어 1에 필요한 노드를 실제 좌표에서 골라준다. 거리·순도·채굴량은 전부 계산값이다.
 *
 * 좌표 캘리브레이션: ADR-0006. 월드 좌표 변환은 resource-nodes.json의 $transform을 따른다.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../styles/sitemap.css';
import { ceilNum } from '../lib/rational.ts';

// ADR-0006 캘리브레이션 (1600×1600 원본 기준)
const GX0 = 31,
  GW = 218.857,
  GY0 = 142,
  GH = 219.167,
  IMG = 1600;

export interface SiteView {
  n: number;
  cell: { X: number; Y: number };
  name: string;
  en: string;
  good: string;
  bad: string;
  who: string;
  recommended?: boolean;
}

export interface NodeView {
  ko: string;
  purity: 'impure' | 'normal' | 'pure';
  type: string;
  fx: number;
  fy: number;
  cell: string;
}

export interface DemandView {
  ko: string;
  /** 티어 1 자동화에 필요한 분당 수량 (데이터에서 계산된 값) */
  need: number;
  why: string;
}

export interface Props {
  mapSrc: string;
  sites: SiteView[];
  nodes: NodeView[];
  demand: DemandView[];
  /** 채굴기 Mk.1의 순도별 산출량 (데이터 유래) */
  minerMk1: { impure: number; normal: number; pure: number };
  sourceNote: string;
}

const cellPos = (X: number, Y: number) => ({
  x: (GX0 + (X + 0.5) * GW) / IMG,
  y: (GY0 + (5 - Y + 0.5) * GH) / IMG,
});

// resource-nodes.json $transform: 픽셀 비율 → 월드 좌표(cm)
const world = (fx: number, fy: number) => ({ x: fx * 750100 - 324698, y: fy * 750000 - 375000 });
const metersBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) / 100;

const PURITY_LABEL: Record<string, string> = { impure: '불순', normal: '보통', pure: '순수' };

export default function SiteMap({ mapSrc, sites, nodes, demand, minerMk1, sourceNote }: Props) {
  const [selected, setSelected] = useState(sites.find((s) => s.recommended)?.n ?? sites[0]!.n);
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(['철광석', '구리광석', '석회석', '석탄'])
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const site = sites.find((s) => s.n === selected)!;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) c[n.ko] = (c[n.ko] ?? 0) + 1;
    return c;
  }, [nodes]);

  /** 선택한 부지 기준, 각 자원의 필요량을 채우는 최소 노드 조합 */
  const plan = useMemo(() => {
    const p = cellPos(site.cell.X, site.cell.Y);
    const origin = world(p.x, p.y);
    return demand.map((d) => {
      const near = nodes
        .filter((n) => n.ko === d.ko && n.type === 'node')
        .map((n) => ({ ...n, distance: metersBetween(world(n.fx, n.fy), origin) }))
        .sort((a, b) => a.distance - b.distance);

      const picked: (NodeView & { distance: number; output: number })[] = [];
      let sum = 0;
      for (const n of near) {
        if (sum >= d.need) break;
        const output = minerMk1[n.purity] ?? minerMk1.normal;
        picked.push({ ...n, output });
        sum += output;
      }
      return { ...d, picked, supplied: sum, enough: sum >= d.need };
    });
  }, [site, nodes, demand, minerMk1]);

  const farthest = Math.max(0, ...plan.flatMap((p) => p.picked.map((n) => n.distance)));

  const clampPan = (z: number, x: number, y: number) => {
    const box = boxRef.current;
    if (!box) return { x, y };
    const w = box.clientWidth,
      h = box.clientHeight;
    return {
      x: Math.min(0, Math.max(w - w * z, x)),
      y: Math.min(0, Math.max(h - h * z, y)),
    };
  };

  const zoomTo = (next: number) => {
    const z = Math.max(1, Math.min(5, next));
    setZoom(z);
    setPan((p) => clampPan(z, p.x, p.y));
  };

  const focusSite = (n: number) => {
    const s = sites.find((x) => x.n === n);
    const box = boxRef.current;
    if (!s || !box) return;
    const p = cellPos(s.cell.X, s.cell.Y);
    const z = 2.6;
    const w = box.clientWidth,
      h = box.clientHeight;
    setZoom(z);
    setPan(clampPan(z, w / 2 - p.x * w * z, h / 2 - p.y * h * z));
  };

  useEffect(() => {
    const onResize = () => setPan((p) => clampPan(zoom, p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [zoom]);

  const toggleRes = (ko: string) => {
    const next = new Set(visible);
    next.has(ko) ? next.delete(ko) : next.add(ko);
    setVisible(next);
  };

  return (
    <div class="sm">
      <div class="sm-tools">
        <div class="sm-zoom">
          <button type="button" class="btn" onClick={() => zoomTo(zoom * 1.5)}>
            확대 +
          </button>
          <button type="button" class="btn" onClick={() => zoomTo(zoom / 1.5)}>
            축소 −
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            맞춤
          </button>
        </div>
        <div class="sm-filters">
          {Object.keys(counts)
            .filter((k) => counts[k]! > 0)
            .map((k) => (
              <button
                key={k}
                type="button"
                class="sm-filter"
                aria-pressed={visible.has(k)}
                onClick={() => toggleRes(k)}
              >
                <i data-res={k} aria-hidden="true" />
                {k} <span class="n">{counts[k]}</span>
              </button>
            ))}
        </div>
      </div>

      <div
        class="sm-box"
        ref={boxRef}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setPan(clampPan(zoom, d.px + (e.clientX - d.x), d.py + (e.clientY - d.y)));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div
          class="sm-stage"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img
            src={mapSrc}
            alt="Satisfactory 월드 바이옴 맵. 그리드 좌표 X0Y0~X6Y5와 시작 지점이 표시되어 있다."
            width="1600"
            height="1600"
            decoding="async"
          />
          {nodes
            .filter((n) => visible.has(n.ko))
            .map((n, i) => (
              <span
                key={i}
                class={`sm-node is-${n.purity}`}
                data-res={n.ko}
                style={{ left: `${n.fx * 100}%`, top: `${n.fy * 100}%` }}
                title={`${n.ko} · ${PURITY_LABEL[n.purity] ?? n.purity} · ${n.cell}`}
              />
            ))}
          {sites.map((s) => {
            const p = cellPos(s.cell.X, s.cell.Y);
            return (
              <button
                key={s.n}
                type="button"
                class={`sm-pin${s.recommended ? ' is-rec' : ''}`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                aria-pressed={selected === s.n}
                title={s.name}
                onClick={() => {
                  setSelected(s.n);
                  focusSite(s.n);
                }}
              >
                {s.n}
              </button>
            );
          })}
        </div>
      </div>

      <div class="sm-grid">
        <section class="sm-card panel">
          <h3>
            <span class="n">{site.n}</span>. {site.name}
            {site.recommended && <span class="sm-rec">추천</span>}
          </h3>
          <p class="caption">
            {site.en} · 그리드 <span class="n">X{site.cell.X}Y{site.cell.Y}</span>
          </p>
          <div class="kv">
            <div>
              <span class="k">강점</span>
              <span class="v">{site.good}</span>
            </div>
            <div>
              <span class="k">약점</span>
              <span class="v">{site.bad}</span>
            </div>
            <div>
              <span class="k">언제</span>
              <span class="v">{site.who}</span>
            </div>
          </div>
          <p class="sm-source">{sourceNote}</p>
        </section>

        <section class="sm-plan">
          <h3>이 부지에서 티어 1을 자동화하려면</h3>
          <p class="caption">
            아래 노드·거리·순도는 좌표 데이터에서 계산한 값입니다. 채굴기 Mk.1 기준(순수{' '}
            <span class="n">{minerMk1.pure}</span> / 보통 <span class="n">{minerMk1.normal}</span> /
            불순 <span class="n">{minerMk1.impure}</span> 개/분).
          </p>
          <div class="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>자원</th>
                  <th class="n">필요</th>
                  <th>쓸 노드</th>
                  <th class="n">공급</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.ko} class={p.enough ? '' : 'is-short'}>
                    <td>{p.ko}</td>
                    <td class="n">{p.need}/분</td>
                    <td>
                      {p.picked.length === 0 ? (
                        <span class="muted">근처에 노드 없음</span>
                      ) : (
                        p.picked.map((n, i) => (
                          <span class="chip" key={i}>
                            {PURITY_LABEL[n.purity]} {n.cell}{' '}
                            <span class="n">{Math.round(n.distance)}m</span>
                          </span>
                        ))
                      )}
                    </td>
                    <td class="n">{p.supplied}/분</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul class="sm-why">
            {plan.map((p) => (
              <li key={p.ko}>
                <strong>{p.ko}</strong> {p.why}
                {!p.enough && (
                  <span class="sm-short">
                    {' '}
                    — 이 부지 근처 노드로는 <span class="n">{p.supplied}</span>/분까지만 됩니다.
                  </span>
                )}
              </li>
            ))}
          </ul>
          {farthest > 0 && (
            <p class="note">
              <span class="note-title">벨트 길이</span>
              가장 먼 노드가 <span class="n">{Math.round(farthest)}</span> m 떨어져 있습니다. 초반에
              이 거리를 벨트로 잇는 것은 가능하지만, <span class="n">500</span> m를 넘는 구간은 나중에
              열차로 대체하게 됩니다. 임시 기지 단계에서는 거리를 줄이는 쪽이 항상 이깁니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
