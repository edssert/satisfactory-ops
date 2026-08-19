/**
 * LayoutPlan — F13 도면 생성 화면 (아일랜드).
 *
 * 공장 전체를 **한 장의 도면**으로 그린다. 공정별로 쪼개면 그건 부품 목록이지 도면이 아니다.
 * 계산과 배치는 순수 모듈(lib/solver, lib/layout)이 하고 여기서는 그리기만 한다.
 *
 * 겹침을 막는 규칙 (실제로 겹쳐서 다시 만든 부분):
 *  1. 글자는 격자 **바깥**에만 둔다 — 왼쪽 거터(공정명), 오른쪽 여백(유량). 격자 안은 기계 번호뿐
 *  2. 공급 레인은 기계 줄마다 하나씩 — 분기선이 다른 기계를 가로지르지 않는다
 *  3. 간선(버스)은 격자 왼쪽 별도 열에 둔다
 */

import { useMemo, useState } from 'preact/hooks';
import '../styles/layout-plan.css';
import FactoryDrawing from './FactoryDrawing.tsx';
import { toNumber } from '../lib/rational.ts';
import { solve, type RecipeBook, type SolveNode, type SolverRecipe } from '../lib/solver.ts';
import {
  DESIGNERS,
  TILE_M,
  planLayout,
  type BeltSpec,
  type DesignerMk,
  type Footprint,
  type LayoutResult,
  type StageInput,
} from '../lib/layout.ts';

export interface MachineView {
  id: string;
  ko: string;
  en: string;
  powerMW: number | null;
  footprint: Footprint | null;
  buildCost: { itemKo: string; amount: number }[];
}

export interface Props {
  targets: { id: string; ko: string; en: string }[];
  recipes: SolverRecipe[];
  machines: MachineView[];
  names: Record<string, { ko: string; en: string }>;
  producers: Record<string, string[]>;
  fluids: Record<string, boolean>;
  belts: BeltSpec[];
  foundation: { id: string; ko: string; costPerTile: { itemKo: string; amount: number }[] };
  defaultTarget: string;
}

const distLabel = (k: string) =>
  k === 'manifold'
    ? '매니폴드'
    : k === 'injected-manifold'
      ? '인젝티드 매니폴드'
      : k === 'balancer'
        ? '로드 밸런서'
        : '직결';

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

  const plan = useMemo(() => {
    if (!solved?.ok) return null;
    const collected: (StageInput & { depth: number })[] = [];
    const walk = (n: SolveNode) => {
      if (n.recipeId && n.machineId) {
        const m = machineById.get(n.machineId);
        const machines = n.machines ? toNumber(n.machines) : 0;
        collected.push({
          depth: n.depth,
          key: n.itemId + ':' + n.depth,
          recipeId: n.recipeId,
          itemKo: n.ko,
          itemEn: n.en,
          recipeKo: n.recipeKo ?? '',
          ratePerMinute: toNumber(n.rate),
          machinesExact: machines,
          machineId: n.machineId,
          machineKo: n.machineKo ?? n.machineId,
          machineEn: m?.en ?? '',
          footprint: m?.footprint ?? null,
          powerMW: m?.powerMW ?? null,
          buildCost: m?.buildCost ?? [],
          inputs: (recipeById.get(n.recipeId)?.ingredients ?? []).map((g) => ({
            itemKo: props.names[g.item]?.ko ?? g.item,
            perMinute: machines * g.perMinute,
            isFluid: !!props.fluids[g.item],
          })),
          byproducts: n.byproducts.map((b) => ({ itemKo: b.ko, perMinute: toNumber(b.rate) })),
        });
      }
      n.children.forEach(walk);
    };
    walk(solved.root);

    // 원자재가 위, 완제품이 아래로 오도록 흐름 순서로 정렬한다.
    collected.sort((a, b) => b.depth - a.depth);

    return planLayout(collected, {
      belt,
      betterBelts: props.belts.slice(beltIdx + 1),
      designerMk: designerMk === 0 ? null : designerMk,
      floorHeightM: TILE_M,
      foundation: props.foundation,
    });
  }, [solved, belt, beltIdx, designerMk, machineById, recipeById, props]);

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
          <select
            id="lp-belt"
            value={String(beltIdx)}
            onChange={(e) => setBeltIdx(Number((e.target as HTMLSelectElement).value))}
          >
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
              <span class="k">부지</span>
              <span class="v">
                <span class="n">{plan.totalWidthTiles * TILE_M}</span> ×{' '}
                <span class="n">{plan.totalLengthTiles * TILE_M}</span> m · 토대{' '}
                <span class="n">{plan.foundation?.tiles ?? 0}</span>장
              </span>
            </div>
            <div>
              <span class="k">기계</span>
              <span class="v">
                <span class="n">{plan.totalMachines}</span>대 · <span class="n">{plan.modules.length}</span>개 공정 ·
                전력 <span class="n">{plan.totalPowerMW}</span> MW
              </span>
            </div>
            <div>
              <span class="k">건설 자재</span>
              <span class="v">
                {plan.buildCost.slice(0, 6).map((c, i) => (
                  <span key={c.itemKo}>
                    {i > 0 && ' · '}
                    {c.itemKo} <span class="n">{c.amount}</span>
                  </span>
                ))}
              </span>
            </div>
          </div>

          {plan.warnings.map((w) => (
            <p key={w.code} class={`lp-note is-${w.level}`}>
              {w.message}
            </p>
          ))}

          <div class="scroll-x lp-canvas">
            <FactoryDrawing plan={plan} />
          </div>

          <section class="lp-steps">
            <h3 class="lp-h">공정별 상세</h3>
            {plan.modules.map((m, i) => (
              <article class="lp-step" key={m.key}>
                <header>
                  <span class="lp-step-no n">{i + 1}</span>
                  <h4>{m.title}</h4>
                  <span class="lp-step-machine">
                    {m.machineKo} <span class="n">{m.machinesBuilt}</span>대
                    {m.machinesExact % 1 !== 0 && (
                      <span class="muted"> (정확히 {Math.round(m.machinesExact * 100) / 100})</span>
                    )}
                  </span>
                  <span class="lp-step-size n">
                    {m.widthTiles * TILE_M}×{m.lengthTiles * TILE_M} m
                  </span>
                </header>
                <p class="lp-dist">
                  <span class="note-title">{distLabel(m.distribution)}</span>
                  {m.distributionReason}
                </p>
                {m.warnings.map((w, k) => (
                  <p key={k} class={`lp-note is-${w.level}`}>
                    {w.message}
                  </p>
                ))}
                {m.stamps > 1 && (
                  <p class="lp-note is-info">
                    블루프린트 <span class="n">{m.stamps}</span>장을 찍어 이어 붙입니다.
                  </p>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
