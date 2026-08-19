/**
 * ProductionCalc — F5 생산 계산기 (아일랜드).
 *
 * 대체 레시피를 켜고 끄면 원자재·기계·전력이 어떻게 달라지는지가 이 화면의 핵심이다.
 * 리서치(progression#설계에 주는 시사점 3)가 지목한 "델타 자체가 다음에 할 일의 답"을 구현한다.
 */

import { useMemo, useState } from 'preact/hooks';
import '../styles/calc.css';
import { ceil, ceilNum, format, toNumber } from '../lib/rational.ts';
import {
  machineAdvice,
  solve,
  type RecipeBook,
  type SolveNode,
  type SolverMachine,
  type SolverRecipe,
} from '../lib/solver.ts';

export interface BeltView {
  id: string;
  ko: string;
  perMinute: number;
  unlockTier: number | null;
}

export interface Props {
  /** 만들 수 있는 아이템 (레시피가 있는 것만) */
  targets: { id: string; ko: string; en: string }[];
  recipes: SolverRecipe[];
  machines: SolverMachine[];
  names: Record<string, { ko: string; en: string }>;
  /** 아이템 → 그 아이템을 만드는 레시피 id 목록 (표준이 앞) */
  producers: Record<string, string[]>;
  /** 레시피 id → 대체 레시피 여부 */
  isAlternate: Record<string, boolean>;
  belts: BeltView[];
  defaultTarget: string;
}

export default function ProductionCalc(props: Props) {
  const [target, setTarget] = useState(props.defaultTarget);
  const [rate, setRate] = useState('60');
  const [choice, setChoice] = useState<Record<string, string>>({});

  const recipeById = useMemo(() => new Map(props.recipes.map((r) => [r.id, r])), [props.recipes]);
  const machineById = useMemo(() => new Map(props.machines.map((m) => [m.id, m])), [props.machines]);

  const book: RecipeBook = useMemo(
    () => ({
      recipeFor: (itemId) => {
        const list = props.producers[itemId];
        if (!list || list.length === 0) return undefined;
        const picked = choice[itemId] ?? list[0]!;
        return recipeById.get(picked);
      },
      machine: (id) => machineById.get(id),
      nameOf: (id) => props.names[id] ?? { ko: id, en: id },
    }),
    [choice, props.producers, props.names, recipeById, machineById]
  );

  const parsed = Number(rate);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 100000;
  const result = useMemo(() => (valid ? solve(target, parsed, book) : null), [target, parsed, valid, book]);

  const rows: SolveNode[] = [];
  if (result?.ok) flatten(result.root, rows);

  const maxBelt = props.belts.at(-1);

  /** 이 유량을 나르려면 어느 벨트가 필요한가 (ADR-0016 처리량 상한) */
  function beltFor(perMinute: number) {
    const fit = props.belts.find((b) => b.perMinute >= perMinute - 1e-9);
    if (fit) return { ko: fit.ko, tier: fit.unlockTier, lines: 1 };
    const top = maxBelt!;
    return { ko: top.ko, tier: top.unlockTier, lines: ceilNum(perMinute / top.perMinute) };
  }

  const alternatesInTree = useMemo(() => {
    const out: { itemId: string; ko: string; options: { id: string; ko: string; alt: boolean }[] }[] = [];
    for (const n of rows) {
      const list = props.producers[n.itemId];
      if (!list || list.length < 2) continue;
      if (out.some((o) => o.itemId === n.itemId)) continue;
      out.push({
        itemId: n.itemId,
        ko: n.ko,
        options: list.map((id) => ({
          id,
          ko: recipeById.get(id)?.ko ?? id,
          alt: !!props.isAlternate[id],
        })),
      });
    }
    return out;
  }, [rows, props.producers, props.isAlternate, recipeById]);

  return (
    <div class="calc">
      <form class="calc-controls" onSubmit={(e) => e.preventDefault()}>
        <div class="calc-field">
          <label for="calc-item">만들 것</label>
          <select
            id="calc-item"
            value={target}
            onChange={(e) => {
              setTarget((e.target as HTMLSelectElement).value);
              setChoice({});
            }}
          >
            {props.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ko}
              </option>
            ))}
          </select>
        </div>
        <div class="calc-field">
          <label for="calc-rate">목표 (분당)</label>
          <input
            id="calc-rate"
            type="number"
            inputMode="decimal"
            min="0.1"
            max="100000"
            step="1"
            value={rate}
            onInput={(e) => setRate((e.target as HTMLInputElement).value)}
          />
        </div>
        {Object.keys(choice).length > 0 && (
          <button type="button" class="btn" onClick={() => setChoice({})}>
            레시피 선택 초기화
          </button>
        )}
      </form>

      {!valid && <p class="calc-invalid">0보다 큰 수를 넣어주세요.</p>}

      {result && !result.ok && (
        <p class="calc-reject">
          <strong>계산하지 않았습니다.</strong> {result.message}
          {result.cycle && (
            <span class="calc-cycle">
              순환 구간: {result.cycle.map((c) => props.names[c]?.ko ?? c).join(' → ')}
            </span>
          )}
        </p>
      )}

      {result?.ok && (
        <div class="calc-body">
          <section class="calc-tree-wrap">
            <h2 class="calc-h">생산 트리</h2>
            <ol class="calc-tree">
              {rows.map((n) => {
                const advice = n.machines && n.machineId ? machineAdvice(n.machines) : null;
                const fractional = n.machines ? toNumber(n.machines) % 1 !== 0 : false;
                const belt = beltFor(toNumber(n.rate));
                return (
                  <li key={n.itemId + ':' + n.depth} style={{ '--d': String(n.depth) }}>
                    <div class="calc-node">
                      <span class="calc-name">{n.ko}</span>
                      <span class="n calc-rate">{format(n.rate, 2)}/분</span>
                      {n.machineKo && n.machines ? (
                        <span class="calc-mach">
                          {n.machineKo} <span class="n">{format(n.machines, 2)}</span>대
                        </span>
                      ) : (
                        <span class="calc-raw">원자재 · 채굴</span>
                      )}
                      <span class={'calc-belt' + (belt.lines > 1 ? ' is-over' : '')}>
                        {belt.lines > 1 ? (
                          <>
                            {belt.ko} <span class="n">{belt.lines}</span>줄 필요
                          </>
                        ) : (
                          <>
                            {belt.ko}
                            {belt.tier != null && <span class="n"> T{belt.tier}</span>}
                          </>
                        )}
                      </span>
                    </div>
                    {fractional && advice && (
                      <p class="calc-advice">
                        <span class="n">{advice.built}</span>대로 지으면{' '}
                        <span class="n">{advice.idlePercent}</span>% 유휴.
                        {advice.built > 1 && (
                          <>
                            {' '}
                            <span class="n">{advice.built - 1}</span>대 + 오버클럭{' '}
                            <span class="n">{advice.clock}</span>%면 자리와 벨트를 아끼고 전력을 더
                            씁니다.
                          </>
                        )}
                      </p>
                    )}
                    {n.byproducts.length > 0 && (
                      <p class="calc-byproduct">
                        부산물{' '}
                        {n.byproducts.map((b, i) => (
                          <span key={b.itemId}>
                            {i > 0 && ' · '}
                            {b.ko} <span class="n">{format(b.rate, 2)}</span>/분
                          </span>
                        ))}{' '}
                        — 처리하지 않으면 라인이 멈춥니다.
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <aside class="calc-side">
            <section>
              <h2 class="calc-h">합계</h2>
              <div class="kv">
                <div>
                  <span class="k">전력</span>
                  <span class="v">
                    <span class="n">{result.totalPowerMW}</span> MW
                  </span>
                </div>
                {result.machines.map((m) => (
                  <div key={m.buildingId}>
                    <span class="k">{m.ko}</span>
                    <span class="v">
                      <span class="n">{ceil(m.count)}</span>대{' '}
                      <span class="muted">(정확히 {format(m.count, 2)})</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 class="calc-h">원자재</h2>
              <div class="kv">
                {result.raw.map((r) => {
                  const belt = beltFor(toNumber(r.rate));
                  return (
                    <div key={r.itemId}>
                      <span class="k">{r.ko}</span>
                      <span class="v">
                        <span class="n">{format(r.rate, 2)}</span>/분
                        <span class="muted">
                          {' '}
                          · {belt.ko}
                          {belt.lines > 1 ? ` ${belt.lines}줄` : ''}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p class="calc-hint">
                노말 순도 노드에 채굴기 Mk.1은 <span class="n">60</span>개/분입니다. 순수는{' '}
                <span class="n">120</span>, 불순은 <span class="n">30</span>입니다.
              </p>
            </section>

            {alternatesInTree.length > 0 && (
              <section>
                <h2 class="calc-h">레시피 선택</h2>
                <p class="calc-hint">
                  대체 레시피를 켜면 원자재와 기계 수가 달라집니다. 하드 드라이브로 무엇을 먼저
                  풀어야 하는지가 여기서 보입니다.
                </p>
                <div class="calc-alts">
                  {alternatesInTree.map((a) => (
                    <label key={a.itemId}>
                      <span>{a.ko}</span>
                      <select
                        value={choice[a.itemId] ?? a.options[0]!.id}
                        onChange={(e) =>
                          setChoice({ ...choice, [a.itemId]: (e.target as HTMLSelectElement).value })
                        }
                      >
                        {a.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.ko}
                            {o.alt ? ' (대체)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function flatten(node: SolveNode, out: SolveNode[]) {
  out.push(node);
  for (const c of node.children) flatten(c, out);
}
