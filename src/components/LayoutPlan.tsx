/**
 * LayoutPlan — F13 도면 생성 화면 (아일랜드).
 *
 * 생산 목표 → 솔버 → 배치 엔진 → 탑다운 SVG 도면.
 * 계산과 배치는 전부 순수 모듈(lib/solver, lib/layout)이 하고, 여기서는 그리기만 한다.
 */

import { useMemo, useState } from 'preact/hooks';
import '../styles/layout-plan.css';
import { ceilNum, toNumber } from '../lib/rational.ts';
import { solve, type RecipeBook, type SolveNode, type SolverRecipe } from '../lib/solver.ts';
import {
  DESIGNERS,
  TILE_M,
  planLayout,
  type BeltSpec,
  type DesignerMk,
  type Footprint,
  type StageInput,
} from '../lib/layout.ts';

export interface MachineView {
  id: string;
  ko: string;
  en: string;
  powerMW: number | null;
  footprint: Footprint | null;
}

export interface Props {
  targets: { id: string; ko: string; en: string }[];
  recipes: SolverRecipe[];
  machines: MachineView[];
  names: Record<string, { ko: string; en: string }>;
  producers: Record<string, string[]>;
  fluids: Record<string, boolean>;
  belts: BeltSpec[];
  defaultTarget: string;
}

const PX_PER_TILE = 34;

export default function LayoutPlan(props: Props) {
  const [target, setTarget] = useState(props.defaultTarget);
  const [rate, setRate] = useState('60');
  const [beltIdx, setBeltIdx] = useState(0);
  const [designerMk, setDesignerMk] = useState<DesignerMk | 0>(0);

  const recipeById = useMemo(() => new Map(props.recipes.map((r) => [r.id, r])), [props.recipes]);
  const machineById = useMemo(() => new Map(props.machines.map((m) => [m.id, m])), [props.machines]);

  const book: RecipeBook = useMemo(
    () => ({
      recipeFor: (id) => {
        const list = props.producers[id];
        return list?.[0] ? recipeById.get(list[0]) : undefined;
      },
      machine: (id) => {
        const m = machineById.get(id);
        return m ? { id, ko: m.ko, en: m.en, powerMW: m.powerMW } : undefined;
      },
      nameOf: (id) => props.names[id] ?? { ko: id, en: id },
    }),
    [props.producers, props.names, recipeById, machineById]
  );

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 100000;
  const solved = useMemo(() => (valid ? solve(target, parsed, book) : null), [target, parsed, valid, book]);

  const belt = props.belts[beltIdx] ?? props.belts[0]!;
  const betterBelts = props.belts.slice(beltIdx + 1);

  const plan = useMemo(() => {
    if (!solved?.ok) return null;
    const stages: StageInput[] = [];
    const walk = (n: SolveNode) => {
      if (n.recipeId && n.machineId) {
        const m = machineById.get(n.machineId);
        stages.push({
          key: n.itemId + ':' + n.depth,
          itemKo: n.ko,
          itemEn: n.en,
          recipeKo: n.recipeKo ?? '',
          ratePerMinute: toNumber(n.rate),
          machinesExact: n.machines ? toNumber(n.machines) : 0,
          machineId: n.machineId,
          machineKo: n.machineKo ?? n.machineId,
          machineEn: m?.en ?? '',
          footprint: m?.footprint ?? null,
          powerMW: m?.powerMW ?? null,
          inputs: (recipeById.get(n.recipeId)?.ingredients ?? []).map((g) => ({
            itemKo: props.names[g.item]?.ko ?? g.item,
            perMinute: (n.machines ? toNumber(n.machines) : 0) * g.perMinute,
            isFluid: !!props.fluids[g.item],
          })),
          byproducts: n.byproducts.map((b) => ({ itemKo: b.ko, perMinute: toNumber(b.rate) })),
        });
      }
      n.children.forEach(walk);
    };
    walk(solved.root);
    return planLayout(stages, {
      belt,
      betterBelts,
      designerMk: designerMk === 0 ? null : designerMk,
      floorHeightM: TILE_M,
    });
  }, [solved, belt, betterBelts, designerMk, machineById, recipeById, props.names, props.fluids]);

  return (
    <div class="lp">
      <form class="lp-controls" onSubmit={(e) => e.preventDefault()}>
        <div class="lp-field">
          <label for="lp-item">만들 것</label>
          <select id="lp-item" value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}>
            {props.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ko}
              </option>
            ))}
          </select>
        </div>
        <div class="lp-field">
          <label for="lp-rate">목표 (분당)</label>
          <input
            id="lp-rate"
            type="number"
            min="0.1"
            max="100000"
            value={rate}
            onInput={(e) => setRate((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="lp-field">
          <label for="lp-belt">가진 벨트</label>
          <select id="lp-belt" value={String(beltIdx)} onChange={(e) => setBeltIdx(Number((e.target as HTMLSelectElement).value))}>
            {props.belts.map((b, i) => (
              <option key={b.ko} value={String(i)}>
                {b.ko} ({b.perMinute}/분)
              </option>
            ))}
          </select>
        </div>
        <div class="lp-field">
          <label for="lp-designer">블루프린트</label>
          <select
            id="lp-designer"
            value={String(designerMk)}
            onChange={(e) => setDesignerMk(Number((e.target as HTMLSelectElement).value) as DesignerMk | 0)}
          >
            <option value="0">아직 없음 (티어 4 미만)</option>
            {DESIGNERS.map((d) => (
              <option key={d.mk} value={String(d.mk)}>
                Mk.{d.mk} — {d.innerM}m (티어 {d.tier})
              </option>
            ))}
          </select>
        </div>
      </form>

      {solved && !solved.ok && (
        <p class="lp-reject">
          <strong>도면을 만들지 않았습니다.</strong> {solved.message}
        </p>
      )}

      {plan && (
        <>
          <div class="lp-summary kv">
            <div>
              <span class="k">전체 규모</span>
              <span class="v">
                <span class="n">{plan.totalWidthTiles * TILE_M}</span> ×{' '}
                <span class="n">{plan.totalLengthTiles * TILE_M}</span> m (
                <span class="n">{plan.totalWidthTiles}</span>×<span class="n">{plan.totalLengthTiles}</span> 타일)
              </span>
            </div>
            <div>
              <span class="k">기계</span>
              <span class="v">
                <span class="n">{plan.totalMachines}</span>대 · 전력 <span class="n">{plan.totalPowerMW}</span> MW
              </span>
            </div>
            <div>
              <span class="k">공정</span>
              <span class="v">
                <span class="n">{plan.modules.length}</span>단계
              </span>
            </div>
          </div>

          {plan.warnings.map((w) => (
            <p key={w.code} class={`lp-note is-${w.level}`}>
              {w.message}
            </p>
          ))}

          {plan.modules.map((m) => (
            <section class="lp-module" key={m.key}>
              <header class="lp-module-head">
                <h3>{m.title}</h3>
                <span class="lp-machine">
                  {m.machineKo} <span class="n">{m.machinesBuilt}</span>대
                  {m.machinesExact % 1 !== 0 && (
                    <span class="muted"> (정확히 {Math.round(m.machinesExact * 100) / 100})</span>
                  )}
                </span>
                <span class="lp-size n">
                  {m.widthTiles * TILE_M}×{m.lengthTiles * TILE_M} m
                </span>
              </header>

              <p class="lp-dist">
                <span class="note-title">{distLabel(m.distribution)}</span>
                {m.distributionReason}
              </p>

              <div class="scroll-x">
                <ModuleDrawing module={m} />
              </div>

              {m.warnings.map((w, i) => (
                <p key={i} class={`lp-note is-${w.level}`}>
                  {w.message}
                </p>
              ))}

              {m.stamps > 1 && (
                <p class="lp-note is-info">
                  블루프린트 <span class="n">{m.stamps}</span>장을 찍어 이어 붙입니다.
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

const distLabel = (k: string) =>
  k === 'manifold' ? '매니폴드' : k === 'injected-manifold' ? '인젝티드 매니폴드' : k === 'balancer' ? '로드 밸런서' : '직결';

/** 모듈 하나의 탑다운 도면. 8m 격자 위에 기계와 벨트 레인을 그린다. */
function ModuleDrawing({ module: m }: { module: import('../lib/layout.ts').ModuleLayout }) {
  const minY = Math.min(...m.placements.map((p) => p.y), m.supplyLane.y);
  const w = Math.max(m.widthTiles, 1);
  const h = m.lengthTiles;
  const W = w * PX_PER_TILE;
  const H = h * PX_PER_TILE;
  const pad = 26;

  return (
    <svg
      class="lp-svg"
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
      width={W + pad * 2}
      height={H + pad * 2}
      role="img"
      aria-label={`${m.title} 배치도. ${m.machineKo} ${m.machinesBuilt}대를 ${w * TILE_M}m × ${h * TILE_M}m 안에 배치하고, 위쪽에 공급 벨트, 아래쪽에 산출 벨트를 둡니다.`}
    >
      {/* 8m 격자 */}
      <g class="lp-grid">
        {Array.from({ length: w + 1 }, (_, i) => (
          <line key={`v${i}`} x1={i * PX_PER_TILE} y1={0} x2={i * PX_PER_TILE} y2={H} />
        ))}
        {Array.from({ length: h + 1 }, (_, j) => (
          <line key={`h${j}`} x1={0} y1={j * PX_PER_TILE} x2={W} y2={j * PX_PER_TILE} />
        ))}
      </g>

      {/* 공급 레인 */}
      <g class="lp-lane is-supply">
        <line
          x1={0}
          y1={(m.supplyLane.y - minY) * PX_PER_TILE + PX_PER_TILE / 2}
          x2={W}
          y2={(m.supplyLane.y - minY) * PX_PER_TILE + PX_PER_TILE / 2}
        />
        <text x={2} y={(m.supplyLane.y - minY) * PX_PER_TILE - 4}>
          공급 {m.inputBreakdown.length
            ? m.inputBreakdown.map((i) => `${i.itemKo} ${i.perMinute}/분`).join(' · ')
            : '없음'}
        </text>
      </g>

      {/* 기계 */}
      {m.placements.map((p, i) => (
        <g key={i} class="lp-machine-box">
          <rect
            x={p.x * PX_PER_TILE + 2}
            y={(p.y - minY) * PX_PER_TILE + 2}
            width={p.w * PX_PER_TILE - 4}
            height={p.l * PX_PER_TILE - 4}
            rx="2"
          />
          <text
            x={p.x * PX_PER_TILE + p.w * PX_PER_TILE / 2}
            y={(p.y - minY) * PX_PER_TILE + p.l * PX_PER_TILE / 2 + 4}
            text-anchor="middle"
          >
            {i + 1}
          </text>
          {/* 공급 분기 */}
          <line
            class="lp-branch"
            x1={p.x * PX_PER_TILE + p.w * PX_PER_TILE / 2}
            y1={(m.supplyLane.y - minY) * PX_PER_TILE + PX_PER_TILE / 2}
            x2={p.x * PX_PER_TILE + p.w * PX_PER_TILE / 2}
            y2={(p.y - minY) * PX_PER_TILE + 2}
          />
        </g>
      ))}

      {/* 산출 레인 */}
      <g class="lp-lane is-output">
        <line
          x1={0}
          y1={(m.outputLane.y - minY) * PX_PER_TILE + PX_PER_TILE / 2}
          x2={W}
          y2={(m.outputLane.y - minY) * PX_PER_TILE + PX_PER_TILE / 2}
        />
        <text x={2} y={(m.outputLane.y - minY) * PX_PER_TILE + PX_PER_TILE + 12}>
          산출 {m.outputRatePerMinute}/분
        </text>
      </g>

      {/* 치수 */}
      <text class="lp-dim" x={W / 2} y={-8} text-anchor="middle">
        {w * TILE_M} m
      </text>
      <text class="lp-dim" x={-8} y={H / 2} text-anchor="middle" transform={`rotate(-90 ${-8} ${H / 2})`}>
        {h * TILE_M} m
      </text>
    </svg>
  );
}

export const _ceil = ceilNum;
