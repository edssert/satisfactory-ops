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
import { useMemo, useState } from 'preact/hooks';

/** 페이지가 넘겨주는 최소 데이터. 키가 짧은 것은 HTML 에 인라인되기 때문이다 */
export interface PayloadItem {
  /** 클래스 id */
  i: string;
  /** 한글 이름 */
  k: string;
  /** 영문 이름 */
  e: string;
  /** 기본 레시피. 없으면 원자재로 본다 */
  r?: {
    /** 분당 산출 */
    o: number;
    /** 재료 [아이템 id, 분당] */
    g: [string, number][];
    /** 만드는 기계 */
    m: string;
  };
}
export interface PayloadMachine {
  i: string;
  k: string;
  p: number | null;
}
interface Props {
  items: PayloadItem[];
  machines: PayloadMachine[];
  /** 처음 열었을 때 보여줄 목표 */
  initial?: string;
  initialRate?: number;
  iconBase: string;
}

interface Step {
  itemId: string;
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
}

const fmt = (n: number) => {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
};

export default function FlowBuilder({ items, machines, initial, initialRate = 5, iconBase }: Props) {
  const byId = useMemo(() => new Map(items.map((x) => [x.i, x])), [items]);
  const machineById = useMemo(() => new Map(machines.map((m) => [m.i, m])), [machines]);

  /** 만들 수 있는 것만 목표가 된다. 원자재는 목표로 두는 의미가 없다 */
  const targets = useMemo(
    () => items.filter((x) => x.r).sort((a, b) => a.k.localeCompare(b.k, 'ko')),
    [items]
  );

  const [target, setTarget] = useState(initial ?? targets[0]?.i ?? '');
  const [rate, setRate] = useState(initialRate);
  const [supplied, setSupplied] = useState<Set<string>>(new Set());

  const result = useMemo(() => {
    const steps = new Map<string, Step>();
    const raw = new Map<string, number>();
    let overflow = false;

    /** 같은 품목이 여러 갈래에서 필요하면 합산하고, 깊이는 더 깊은 쪽을 남긴다 */
    const walk = (itemId: string, need: number, depth: number) => {
      if (depth > 24) {
        overflow = true;
        return;
      }
      const it = byId.get(itemId);
      if (!it || !it.r || supplied.has(itemId)) {
        raw.set(itemId, (raw.get(itemId) ?? 0) + need);
        return;
      }
      const prev = steps.get(itemId);
      const rateSum = (prev?.rate ?? 0) + need;
      const exact = rateSum / it.r.o;
      const built = Math.ceil(exact - 1e-9);
      const m = machineById.get(it.r.m);
      steps.set(itemId, {
        itemId,
        ko: it.k,
        en: it.e,
        rate: rateSum,
        depth: Math.max(prev?.depth ?? 0, depth),
        machineId: it.r.m,
        machineKo: m?.k ?? it.r.m,
        exact,
        built,
        clock: Math.round((exact / built) * 1000) / 10,
        powerMW: m?.p ?? null,
        inputs: it.r.g.map(([gid, per]) => ({
          itemId: gid,
          ko: byId.get(gid)?.k ?? gid,
          rate: (per * rateSum) / it.r!.o,
        })),
      });
      /* 합산이 바뀌었으므로 아래를 다시 펼친다 */
      for (const [gid, per] of it.r.g) walk(gid, (per * need) / it.r.o, depth + 1);
    };

    if (target && rate > 0) walk(target, rate, 0);

    const list = [...steps.values()].sort((a, b) => a.depth - b.depth || a.ko.localeCompare(b.ko, 'ko'));
    const rawList = [...raw.entries()]
      .map(([id, r]) => ({ id, ko: byId.get(id)?.k ?? id, rate: r }))
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

    return { list, rawList, machineTotals: [...machineTotals.values()], totalPower, overflow };
  }, [target, rate, supplied, byId, machineById]);

  const toggle = (id: string) => {
    setSupplied((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const targetKo = byId.get(target)?.k ?? '';

  return (
    <div class="fb">
      <div class="fb-controls">
        <div class="fb-field">
          <label for="fb-target">무엇을</label>
          <select
            id="fb-target"
            value={target}
            onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}
          >
            {targets.map((t) => (
              <option value={t.i}>{t.k}</option>
            ))}
          </select>
        </div>
        <div class="fb-field is-num">
          <label for="fb-rate">분당 몇 개</label>
          <input
            id="fb-rate"
            type="number"
            min="0.1"
            step="0.5"
            value={rate}
            onInput={(e) => setRate(Number((e.target as HTMLInputElement).value) || 0)}
          />
        </div>
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
      </div>

      <div class="fb-cols">
        <section class="fb-chain">
          <h3 class="fb-h">
            {targetKo} <span class="n">{fmt(rate)}</span>개/분을 만들려면
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
              </li>
            ))}
          </ol>
          {result.list.length === 0 && (
            <p class="fb-empty">
              {targetKo}는 원자재입니다. 만드는 공정이 없습니다.
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
