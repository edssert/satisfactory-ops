/**
 * FlowBuilder — 목표 품목과 분당 수량을 넣으면 공정 전체를 펼쳐 주는 화면.
 *
 * 왜 만드는가: 큐레이션 도면은 내가 미리 그려 둔 몇 개뿐이라, 그 밖의 것을 알고 싶으면
 * 매번 사람이 물어봐야 했다. 이 화면은 그 고리를 끊는다 — 게임 데이터에 있는 것이면
 * 무엇이든 직접 펼쳐 볼 수 있다.
 *
 * 계산 작업 전체를 소유하는 사용자 작업 공간 경계다(D-006). 데이터는 검증된 화면 전용
 * 서브셋으로 공급하며 전체 게임 데이터를 브라우저 번들에 포함하지 않는다.
 *
 * **이미 있음**: 중간재를 눌러 두면 그 위로는 계산하지 않는다. 이미 돌아가는 라인에
 * 무엇을 덧붙일지 볼 때 쓴다.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { savePlannerHandoff } from '../state/planner-handoff.ts';
import { hydrate, ownedAlternates } from '../state/progress.ts';
import { solveProductionNetwork } from '../domain/production/network-solver.ts';

/** 페이지가 넘겨주는 최소 데이터. 키가 짧은 것은 HTML 에 인라인되기 때문이다 */
export interface PayloadItem {
  /** 클래스 id */
  i: string;
  /** 한글 이름 */
  k: string;
  /** 영문 이름 */
  e: string;
  /** 유체·기체 */
  f?: 1;
  /** 기본 레시피. 없으면 원자재로 본다 */
  r?: {
    /** 레시피 클래스 id */
    id: string;
    /** 공식 로케일 제작법 이름 */
    k: string;
    /** 분당 산출 */
    o: number;
    /** 재료 [아이템 id, 분당] */
    g: [string, number][];
    /** 모든 산출 [아이템 id, 분당] */
    p: [string, number][];
    /** 만드는 기계 */
    m: string;
    /** 대체 제작법 */
    a?: 1;
  };
  a?: PayloadItem['r'][];
}
export interface PayloadMachine {
  i: string;
  k: string;
  p: number | null;
}
export interface PayloadTransport { i: string; k: string; m: 'solid' | 'fluid'; r: number }
interface Props {
  items: PayloadItem[];
  machines: PayloadMachine[];
  transports: PayloadTransport[];
  /** 처음 열었을 때 보여줄 목표 */
  initial?: string;
  initialRate?: number;
  iconBase: string;
  plannerUrl: string;
}

interface Step {
  itemId: string;
  recipeId: string;
  recipeKo: string;
  recipeOptions: { id: string; ko: string; alternate: boolean; owned: boolean }[];
  ko: string;
  en: string;
  rate: number;
  depth: number;
  machineId: string;
  machineKo: string;
  /** 소수 그대로. 그대로 지으라는 값이 아니다 */
  exact: number;
  built: number;
  clock: number;
  powerMW: number | null;
  inputs: { itemId: string; ko: string; rate: number }[];
  byproducts: { itemId: string; ko: string; rate: number }[];
  transport: { ko: string; capacity: number; lines: number; medium: 'solid' | 'fluid' };
}

interface Goal {
  id: number;
  itemId: string;
  rate: number;
}

const fmt = (n: number) => {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
};

export default function FlowBuilder({ items, machines, transports, initial, initialRate = 5, iconBase, plannerUrl }: Props) {
  useEffect(() => hydrate(), []);
  const owned = ownedAlternates.value;
  const byId = useMemo(() => new Map(items.map((x) => [x.i, x])), [items]);
  const machineById = useMemo(() => new Map(machines.map((m) => [m.i, m])), [machines]);
  const transportFor = (itemId: string, perMinute: number) => {
    const medium = byId.get(itemId)?.f ? 'fluid' as const : 'solid' as const;
    const candidates = transports.filter((transport) => transport.m === medium);
    const fit = candidates.find((transport) => transport.r >= perMinute - 1e-9) ?? candidates.at(-1)!;
    return {
      ko: fit.k,
      capacity: fit.r,
      lines: Math.max(1, Math.ceil(perMinute / fit.r - 1e-9)),
      medium,
    };
  };

  /** 만들 수 있는 것만 목표가 된다. 원자재는 목표로 두는 의미가 없다 */
  const targets = useMemo(
    () => items.filter((x) => x.r).sort((a, b) => a.k.localeCompare(b.k, 'ko')),
    [items]
  );

  const [goals, setGoals] = useState<Goal[]>([{
    id: 1,
    itemId: initial ?? targets[0]?.i ?? '',
    rate: initialRate,
  }]);
  const [supplied, setSupplied] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<Record<string, string>>({});

  const result = useMemo(() => {
    const payloadRecipeFor = (itemId: string) => {
      const it = byId.get(itemId);
      if (!it?.r) return undefined;
      const recipeOptions = [it.r, ...(it.a ?? [])].filter((recipe): recipe is NonNullable<PayloadItem['r']> => !!recipe);
      return recipeOptions.find((candidate) => candidate.id === choice[itemId] && (candidate.a !== 1 || owned.has(candidate.id))) ?? it.r;
    };
    const network = solveProductionNetwork(
      goals.map((goal) => ({ itemId: goal.itemId, rate: goal.rate })),
      (itemId) => {
        const recipe = payloadRecipeFor(itemId);
        if (!recipe) return undefined;
        return {
          id: recipe.id,
          primaryItemId: itemId,
          outputPerMinute: recipe.o,
          machineId: recipe.m,
          ingredients: recipe.g.map(([ingredientId, perMinute]) => ({ itemId: ingredientId, rate: perMinute })),
          products: recipe.p.map(([productId, perMinute]) => ({ itemId: productId, rate: perMinute })),
        };
      },
      supplied,
    );
    if (!network.ok) {
      return { list: [] as Step[], rawList: [], machineTotals: [], totalPower: 0, overflow: false, error: network.message, cyclic: false };
    }
    const list: Step[] = network.nodes.filter((node) => node.runs > 1e-9).map((node) => {
      const item = byId.get(node.itemId)!;
      const recipe = payloadRecipeFor(node.itemId)!;
      const recipeOptions = [item.r!, ...(item.a ?? [])].filter((candidate): candidate is NonNullable<PayloadItem['r']> => !!candidate);
      const exact = node.runs;
      const built = Math.ceil(exact - 1e-9);
      const machine = machineById.get(recipe.m);
      return {
        itemId: node.itemId,
        recipeId: recipe.id,
        recipeKo: recipe.k,
        recipeOptions: recipeOptions.map((candidate) => ({
          id: candidate.id,
          ko: candidate.k,
          alternate: candidate.a === 1,
          owned: candidate.a !== 1 || owned.has(candidate.id),
        })),
        ko: item.k,
        en: item.e,
        rate: node.grossRate,
        depth: node.depth,
        machineId: recipe.m,
        machineKo: machine?.k ?? recipe.m,
        exact,
        built,
        clock: Math.round((exact / built) * 1000) / 10,
        powerMW: machine?.p ?? null,
        inputs: node.inputs.map((part) => ({
          itemId: part.itemId,
          ko: byId.get(part.itemId)?.k ?? part.itemId,
          rate: part.rate,
        })),
        byproducts: node.byproducts.map((part) => ({
          itemId: part.itemId,
          ko: byId.get(part.itemId)?.k ?? part.itemId,
          rate: part.rate,
        })),
        transport: transportFor(node.itemId, node.grossRate),
      };
    });
    const rawList = network.raw
      .map((part) => ({ id: part.itemId, ko: byId.get(part.itemId)?.k ?? part.itemId, rate: part.rate, transport: transportFor(part.itemId, part.rate) }))
      .sort((a, b) => b.rate - a.rate);

    const machineTotals = new Map<string, { ko: string; built: number; powerMW: number }>();
    for (const s of list) {
      const cur = machineTotals.get(s.machineId) ?? { ko: s.machineKo, built: 0, powerMW: 0 };
      cur.built += s.built;
      /* 전력은 클럭에 지수로 붙는다. 언더클럭한 대수는 그만큼 덜 쓴다 */
      cur.powerMW += (s.powerMW ?? 0) * s.built * Math.pow(s.clock / 100, 1.321929);
      machineTotals.set(s.machineId, cur);
    }
    const totalPower = [...machineTotals.values()].reduce((n, m) => n + m.powerMW, 0);

    return { list, rawList, machineTotals: [...machineTotals.values()], totalPower, overflow: false, error: null, cyclic: network.cyclic };
  }, [goals, supplied, choice, owned, byId, machineById, transports]);

  const toggle = (id: string) => {
    setSupplied((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goalSummary = goals.map((goal) => `${byId.get(goal.itemId)?.k ?? goal.itemId} ${fmt(goal.rate)}/분`);

  const updateGoal = (id: number, patch: Partial<Omit<Goal, 'id'>>) => {
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, ...patch } : goal));
  };

  const sendToPlanner = () => {
    const entries = result.list
      .filter((step) => step.built > 0)
      .map((step) => ({
        id: `handoff:${step.machineId}:${step.recipeId}:${step.itemId}`,
        buildingClass: step.machineId,
        recipeId: step.recipeId,
        clockPercent: step.clock,
        remaining: step.built,
        targetItemId: step.itemId,
        targetFlowPerMinute: step.rate,
      }));
    if (!entries.length) return;
    savePlannerHandoff({ schemaVersion: 1, createdAt: new Date().toISOString(), entries });
    window.location.assign(plannerUrl);
  };

  return (
    <div class="fb">
      <div class="fb-controls">
        {goals.map((goal, index) => (
          <div class="fb-goal-row" key={goal.id}>
            <div class="fb-field">
              <label for={`fb-target-${goal.id}`}>목표 {index + 1}</label>
              <select
                id={`fb-target-${goal.id}`}
                value={goal.itemId}
                onChange={(e) => updateGoal(goal.id, { itemId: (e.target as HTMLSelectElement).value })}
              >
                {targets.map((t) => (
                  <option value={t.i}>{t.k}</option>
                ))}
              </select>
            </div>
            <div class="fb-field is-num">
              <label for={`fb-rate-${goal.id}`}>분당</label>
              <input
                id={`fb-rate-${goal.id}`}
                type="number"
                min="0.1"
                step="0.5"
                value={goal.rate}
                onInput={(e) => updateGoal(goal.id, { rate: Number((e.target as HTMLInputElement).value) || 0 })}
              />
            </div>
            {goals.length > 1 && (
              <button class="btn fb-remove-goal" type="button" onClick={() => setGoals((current) => current.filter((candidate) => candidate.id !== goal.id))}>
                목표 삭제
              </button>
            )}
          </div>
        ))}
        <button
          class="btn fb-add-goal"
          type="button"
          onClick={() => setGoals((current) => [...current, { id: Math.max(0, ...current.map((goal) => goal.id)) + 1, itemId: targets[0]?.i ?? '', rate: 1 }])}
        >
          목표 추가
        </button>
        {supplied.size > 0 && (
          <button class="btn fb-reset" type="button" onClick={() => setSupplied(new Set())}>
            끊어둔 {supplied.size}개 되돌리기
          </button>
        )}
      </div>

      {result.overflow && (
        <p class="fb-warn">
          공정이 24단계를 넘습니다. 순환 레시피가 섞였을 수 있어 계산을 멈췄습니다.
        </p>
      )}
      {result.error && <p class="fb-warn">{result.error}</p>}
      {result.cyclic && <p class="fb-cycle">순환 제작법의 순생산 방정식을 풀어 부산물 재투입량을 포함했습니다.</p>}

      <div class="fb-summary" aria-live="polite">
        <div class="fb-stat">
          <span class="fb-k">기계</span>
          <span class="fb-v n">{result.machineTotals.reduce((n, m) => n + m.built, 0)}대</span>
        </div>
        <div class="fb-stat">
          <span class="fb-k">전력</span>
          <span class="fb-v n">{fmt(Math.round(result.totalPower * 10) / 10)} MW</span>
        </div>
        <div class="fb-stat">
          <span class="fb-k">공정 단계</span>
          <span class="fb-v n">{result.list.length}</span>
        </div>
        <button class="btn fb-handoff" type="button" disabled={!result.list.length} onClick={sendToPlanner}>
          설계 대기열로 보내기
        </button>
      </div>

      <div class="fb-cols">
        <section class="fb-chain">
          <h3 class="fb-h">
            {goalSummary.join(' + ')}을 만들려면
          </h3>
          <ol class="fb-steps">
            {result.list.map((s) => (
              <li class="fb-step" key={s.itemId}>
                <div class="fb-step-head">
                  <img
                    class="fb-icon"
                    src={`${iconBase}/items/${s.itemId}.png`}
                    alt=""
                    width="28"
                    height="28"
                    loading="lazy"
                  />
                  <div class="fb-step-name">
                    <strong>{s.ko}</strong>
                    <span class="n fb-rate">{fmt(s.rate)}/분</span>
                  </div>
                  <div class="fb-machine">
                    <span class="n">{s.built}</span>대 {s.machineKo}
                    {s.clock < 100 && <span class="fb-clock n"> {fmt(s.clock)}%</span>}
                  </div>
                  <span class="fb-transport">{s.transport.ko} · {s.transport.lines}줄 · {fmt(s.rate)}/{fmt(s.transport.capacity * s.transport.lines)}{s.transport.medium === 'fluid' ? ' m³' : ''}/분</span>
                  {s.recipeOptions.length > 1 && (
                    <label class="fb-recipe-choice">
                      <span class="sr-only">{s.ko} 제작법</span>
                      <select value={s.recipeId} onChange={(event) => setChoice((current) => ({ ...current, [s.itemId]: (event.target as HTMLSelectElement).value }))}>
                        {s.recipeOptions.map((option) => (
                          <option value={option.id} disabled={!option.owned}>
                            {option.ko}{option.alternate ? option.owned ? ' (대체)' : ' (대체 · 미보유)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    class={`fb-cut${supplied.has(s.itemId) ? ' is-on' : ''}`}
                    type="button"
                    onClick={() => toggle(s.itemId)}
                    title="이 품목은 이미 공급된다고 보고 위쪽 공정을 계산하지 않습니다"
                  >
                    이미 있음
                  </button>
                </div>
                <ul class="fb-inputs">
                  {s.inputs.map((g) => (
                    <li key={g.itemId}>
                      <button
                        class={`fb-chip${supplied.has(g.itemId) ? ' is-on' : ''}`}
                        type="button"
                        onClick={() => toggle(g.itemId)}
                      >
                        {g.ko} <span class="n">{fmt(g.rate)}/분</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {s.byproducts.length > 0 && (
                  <p class="fb-byproducts">
                    부산물 {s.byproducts.map((product, index) => (
                      <span key={product.itemId}>{index > 0 ? ' · ' : ''}{product.ko} <span class="n">{fmt(product.rate)}/분</span></span>
                    ))} — 배출 경로가 막히면 공정이 멈춥니다.
                  </p>
                )}
              </li>
            ))}
          </ol>
          {result.list.length === 0 && (
            <p class="fb-empty">
              선택한 목표는 원자재이거나 만드는 공정이 없습니다.
            </p>
          )}
        </section>

        <aside class="fb-side">
          <section>
            <h3 class="fb-h">캐야 하는 것</h3>
            <ul class="fb-raw">
              {result.rawList.map((r) => (
                <li key={r.id}>
                  <img
                    class="fb-icon"
                    src={`${iconBase}/items/${r.id}.png`}
                    alt=""
                    width="22"
                    height="22"
                    loading="lazy"
                  />
                  <span class="fb-raw-ko">{r.ko}</span>
                  <span class="n">{fmt(r.rate)}/분</span>
                  <span class="fb-tag">{r.transport.ko} {r.transport.lines}줄</span>
                  {supplied.has(r.id) && <span class="fb-tag">끊음</span>}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 class="fb-h">기계</h3>
            <ul class="fb-raw">
              {result.machineTotals.map((m) => (
                <li key={m.ko}>
                  <span class="fb-raw-ko">{m.ko}</span>
                  <span class="n">{m.built}대</span>
                  <span class="fb-tag n">{fmt(Math.round(m.powerMW * 10) / 10)} MW</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
