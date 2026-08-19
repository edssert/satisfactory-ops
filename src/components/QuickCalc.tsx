/**
 * QuickCalc — 랜딩 히어로의 라이브 계산 위젯 (아일랜드).
 *
 * 브리프 §05: "라이브 위젯 = 히어로 이미지다. 스크린샷도 목업도 아니고 실물이다."
 * 네트워크 요청 0 — 필요한 레시피 서브셋을 페이지가 props로 인라인해 넘긴다 (ADR-0012).
 */

import { useMemo, useState } from 'preact/hooks';
import '../styles/quickcalc.css';
import { ceil, format, toNumber } from '../lib/rational.ts';
import {
  machineAdvice,
  solve,
  type RecipeBook,
  type SolveNode,
  type SolverMachine,
  type SolverRecipe,
} from '../lib/solver.ts';

export interface QuickCalcProps {
  targets: { id: string; ko: string; en: string }[];
  recipes: SolverRecipe[];
  machines: SolverMachine[];
  names: Record<string, { ko: string; en: string }>;
  /** 아이템 → 이 아이템을 만들 때 쓸 레시피 id. 없으면 원자재. */
  recipeOf: Record<string, string>;
  defaultTarget: string;
  defaultRate: number;
}

export default function QuickCalc(props: QuickCalcProps) {
  const [target, setTarget] = useState(props.defaultTarget);
  const [rate, setRate] = useState(String(props.defaultRate));

  const book: RecipeBook = useMemo(() => {
    const recipeById = new Map(props.recipes.map((r) => [r.id, r]));
    const machineById = new Map(props.machines.map((m) => [m.id, m]));
    return {
      recipeFor: (itemId) => {
        const rid = props.recipeOf[itemId];
        return rid ? recipeById.get(rid) : undefined;
      },
      machine: (id) => machineById.get(id),
      nameOf: (id) => props.names[id] ?? { ko: id, en: id },
    };
  }, [props.recipes, props.machines, props.names, props.recipeOf]);

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 100000;
  const result = useMemo(
    () => (valid ? solve(target, parsed, book) : null),
    [target, parsed, valid, book]
  );

  const rows: SolveNode[] = [];
  if (result?.ok) flatten(result.root, rows);

  return (
    <div class="qc">
      <form class="qc-controls" onSubmit={(e) => e.preventDefault()}>
        <div class="qc-field">
          <label for="qc-item">만들 것</label>
          <select
            id="qc-item"
            value={target}
            onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}
          >
            {props.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ko}
              </option>
            ))}
          </select>
        </div>
        <div class="qc-field">
          <label for="qc-rate">목표 (분당)</label>
          <input
            id="qc-rate"
            type="number"
            inputMode="decimal"
            min="0.1"
            max="100000"
            step="1"
            value={rate}
            onInput={(e) => setRate((e.target as HTMLInputElement).value)}
          />
        </div>
        {!valid && <p class="qc-invalid">0보다 큰 수를 넣어주세요.</p>}
      </form>

      <div class="qc-out" aria-live="polite">
        {result && !result.ok && (
          <p class="qc-reject">
            <strong>계산하지 않았습니다.</strong> {result.message}
          </p>
        )}

        {result?.ok && (
          <>
            <ol class="qc-tree">
              {rows.map((n) => {
                const advice = n.machines && n.machineId ? machineAdvice(n.machines) : null;
                const showAdvice =
                  advice && n.machines && toNumber(n.machines) % 1 !== 0 && advice.built > 0;
                return (
                  <li key={n.itemId + ':' + n.depth} style={{ '--d': String(n.depth) }}>
                    <div class="qc-node">
                      <span class="qc-name">{n.ko}</span>
                      <span class="n qc-rate">{format(n.rate, 2)}/분</span>
                      {n.machineKo && n.machines && (
                        <span class="qc-mach">
                          {n.machineKo} <span class="n">{format(n.machines, 2)}</span>대
                        </span>
                      )}
                      {!n.recipeId && <span class="qc-raw">원자재 · 채굴</span>}
                    </div>
                    {showAdvice && (
                      <p class="qc-advice">
                        {n.machineKo} <span class="n">{format(n.machines!, 2)}</span>대 →{' '}
                        <span class="n">{advice!.built}</span>대로 지으면{' '}
                        <span class="n">{advice!.idlePercent}</span>% 유휴.
                        {advice!.built > 1 && (
                          <>
                            {' '}
                            <span class="n">{advice!.built - 1}</span>대 + 오버클럭{' '}
                            <span class="n">{advice!.clock}</span>%면 전력만 더 쓰고 자리는 아낍니다.
                          </>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            <div class="qc-totals">
              <div>
                <span class="k">기계</span>
                <span class="v">
                  {result.machines.map((m, i) => (
                    <span key={m.buildingId}>
                      {i > 0 && ' · '}
                      {m.ko} <span class="n">{ceil(m.count)}</span>대
                    </span>
                  ))}
                </span>
              </div>
              <div>
                <span class="k">전력</span>
                <span class="v">
                  <span class="n">{result.totalPowerMW}</span> MW
                  <span class="muted"> (지은 대수 기준, 오버클럭 미적용)</span>
                </span>
              </div>
              <div>
                <span class="k">원자재</span>
                <span class="v">
                  {result.raw.map((r, i) => (
                    <span key={r.itemId}>
                      {i > 0 && ' · '}
                      {r.ko} <span class="n">{format(r.rate, 2)}</span>/분
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function flatten(node: SolveNode, out: SolveNode[]) {
  out.push(node);
  for (const c of node.children) flatten(c, out);
}
