/**
 * diagnose.ts — 읽어 온 공장 모델에서 "지금 뭐가 문제인가"를 뽑아낸다.
 *
 * 왜 이걸 만드나:
 *   save-factory.ts 가 세이브에서 내 공장을 읽어 왔다. 하지만 숫자를 늘어놓는 것과
 *   "지금 손대야 할 자리"를 말해 주는 것은 다르다. 이 파일이 그 사이를 잇는 규칙 엔진이다.
 *
 * 규칙을 만들 때 지킨 선:
 *   - 실제 데이터로 참·거짓이 갈리는 것만 규칙으로 만든다. "아마 이럴 것"은 넣지 않는다
 *   - 게임 아이템·건물 이름을 이 파일에 타이핑하지 않는다. 전부 카탈로그에서 가져온다
 *   - 화면이 그대로 뿌리므로 마크다운 문법을 쓰지 않는다 (별표가 그대로 보인다)
 *
 * 못 만든 규칙과 그 이유는 파일 아래쪽 "구현하지 못한 규칙"에 적어 두었다.
 */

import type { CheckupCatalog, FactoryMachine, FactoryModel } from './save-factory.ts';

export type Severity = 'stop' | 'warn' | 'info';

export interface Finding {
  /** 규칙 id (kebab-case, 영어) */
  id: string;
  severity: Severity;
  /** 한 줄 결론. 수치를 포함한다 */
  title: string;
  /** 왜 그런가. 이 항목에만 해당하는 말만 담는다 (계열 공통 배경은 basis 로 뺀다) */
  detail: string;
  /** 무엇을 하면 되나. 이 항목에서 실제로 할 일만 담는다 */
  fix: string;
  /** 이 규칙 계열 전체에 공통으로 붙는 설명. 화면이 계열마다 한 번만 보여 준다 */
  basis?: string;
  /** 계열 식별자. 같은 group 이면 같은 basis 다 — 화면이 이 값으로 항목을 묶는다 */
  group?: string;
  /** 해당하는 설비·물건 목록. 화면이 표로 그린다 */
  rows?: { ko: string; note: string }[];
}

/**
 * 계열 공통 설명.
 *
 * 왜 나눠 두나:
 *   병목 항목이 다섯 개 나오면 "측정 창이 무엇인가"를 다섯 번 읽게 된다. 열 개를 읽는
 *   사람에게 그것은 잡음이다. 배경은 계열마다 한 번만 보이면 되고, 항목에는 그 항목에만
 *   해당하는 수치와 처방만 남아야 한다.
 *
 * 규칙: 같은 group 을 쓰는 항목은 반드시 같은 basis 를 쓴다. 화면이 그 전제로 묶는다.
 */
const BASIS = {
  bottleneck:
    '게임은 설비마다 직전 측정 창(약 5분) 동안 실제로 생산한 시간을 세이브에 적어 둔다. ' +
    '가동률이 100%보다 낮다는 것은 그만큼 멈춰 서 있었다는 뜻이고, 멈추는 이유는 둘뿐이다 — ' +
    '재료가 안 오거나(굶음), 만든 것이 빠져나가지 못하거나(막힘). 둘은 대처가 정반대라 어느 쪽인지부터 갈라야 한다. ' +
    '설비 앞뒤 벨트를 보면 갈린다. 입력 벨트가 비어 있으면 굶는 것이고, 출력 벨트가 물건으로 꽉 차 있으면 막힌 것이다. ' +
    '같이 나온 굶음·막힘 항목이 어느 설비가 어느 쪽인지 이미 갈라 두었다.',
  blocked:
    '출력이 어느 설비로도 이어지지 않은 설비다. 내부 출력칸이 차면 설비는 그대로 멈추므로, ' +
    '여기서 가동률이 낮은 이유는 재료 부족이 아니라 배출구가 없기 때문이다 — 상류를 아무리 늘려도 숫자는 그대로다. ' +
    '부산물이 나오는 설비는 부산물 출력구만 막혀도 설비 전체가 선다.',
  starved:
    '출력은 이어져 있는데 벨트를 거슬러 올라간 상류 설비가 자기보다 더 낮은 가동률로 돌고 있는 설비다. ' +
    '멈추는 원인이 이 설비가 아니라 상류에 있다는 뜻이다. 라인의 처리량은 가장 느린 칸이 정하므로, ' +
    '이 설비를 더 짓거나 클럭을 올려도 산출은 늘지 않고 전력만 더 든다.',
  dangling:
    '벨트를 끝까지 따라가 봤지만 어떤 설비에도 닿지 않는 출력구다. 벨트를 아직 안 깐 자리, ' +
    '중간에 끊긴 벨트, 창고에서 끝나는 줄이 모두 여기 든다. 지금 가동률이 멀쩡해도 앞의 창고가 차는 순간 ' +
    '설비가 그대로 멈추므로, 지금 문제가 아니라 곧 문제가 될 자리다.',
  power:
    '세이브의 순간 소비는 저장된 그 순간에 재료를 기다리며 서 있던 설비를 거의 0으로 잡는다. ' +
    '그래서 지어 둔 설비가 전부 동시에 돌 때의 정격 소비를 따로 계산해 함께 본다. ' +
    '막힌 라인을 고치는 순간 놀던 설비가 함께 깨어나므로, 문제를 고치는 바로 그때 전력망이 내려앉는다. ' +
    '한 번 내려간 전력망은 자동으로 복구되지 않는다. 설비 클럭을 내리면 소비는 클럭보다 빠르게 줄고 산출은 클럭만큼만 준다.',
  noRecipe:
    '레시피가 비어 있는 설비는 아무것도 만들지 않는다. 세이브의 생산 목록에도 나타나지 않아서, ' +
    '지은 개수와 레시피가 걸린 개수를 맞춰 봐야만 드러난다. 짓다 만 자리이거나 라인을 옮기고 되돌려 놓지 않은 자리다. ' +
    '해체하면 건설비를 전액 돌려받으므로 놀려 두는 것보다 낫다.',
  piling:
    '재고가 늘기만 한다는 것은 만드는 쪽은 있는데 쓰는 쪽이 없다는 뜻이다. 창고가 차면 만드는 설비가 그대로 멈추므로, ' +
    '지금은 문제로 안 보여도 라인 하나가 곧 서는 자리다. 창고를 더 붙이는 것은 문제를 며칠 미루는 것일 뿐이다.',
  overclock:
    '오버클럭은 산출을 클럭만큼 늘리지만 소비는 그보다 가파르게 늘린다(지수는 건물마다 다르다). ' +
    '대신 자리와 건설비를 아끼고 전력 슬러그를 쓴다 — 공간이 급한 자리에서는 남는 거래지만, ' +
    '발전이 빠듯하면 가장 먼저 되돌릴 곳이다.',
  allClear:
    '가동률, 벨트 연결, 전력 여유, 레시피가 빈 설비, 쌓이기만 하는 재고를 모두 확인한 결과다. ' +
    '가동률은 게임이 직전 약 5분을 잰 값이므로, 방금 라인을 바꿨다면 몇 분 뒤에 다시 보는 편이 정확하다.',
} as const;

/* ------------------------------------------------------------------ 임계값 */

/**
 * 가동률 기준.
 *   게임은 설비마다 직전 측정 창(약 5분)의 생산 시간을 세이브에 적어 둔다.
 *   완전히 균형 잡힌 라인도 벨트 간격 때문에 100%에 딱 붙지는 않는다.
 *   그래서 90%를 "사실상 정상"의 경계로, 절반 아래(50%)를 "라인이 실제로 끊긴 것"으로 본다.
 */
const UPTIME_WARN = 0.9;
const UPTIME_STOP = 0.5;

/**
 * 전력 여유 기준.
 *   여유가 0이 되면 전력망이 내려가고, 복구는 자동이 아니다(직접 스위치를 올려야 한다).
 *   설비 한 대를 더 짓거나 오버클럭 한 번이면 10%는 바로 사라지므로 10% 미만은 stop,
 *   라인 하나를 더 붙일 여지가 남는 25%를 warn 경계로 둔다.
 */
const POWER_STOP = 0.1;
const POWER_WARN = 0.25;

/**
 * "쌓이기만 한다"고 볼 재고량.
 *   제작기 한 대가 대체로 분당 수십 개를 낸다. 500개면 설비 한 대가 30분 가까이 만든 양이고,
 *   지나가다 주운 것이나 초기 물량으로 보기는 어렵다. 즉 "지금도 늘고 있는 중"으로 읽는다.
 *   더 낮추면 정상적인 완충 재고까지 잡히고, 더 올리면 이미 창고가 다 찬 뒤에야 잡힌다.
 */
const STOCK_PILE = 500;

/** 표가 길어지면 읽히지 않는다. 나머지는 한 줄로 접는다 */
const MAX_ROWS = 12;
/** 병목은 낮은 것부터 몇 개만 본다. 전부 보여 주면 우선순위가 사라진다 */
const MAX_GROUPS = 5;

const EPS = 1e-9;

/* ------------------------------------------------------------------ 표기 */

const trim = (s: string) => s.replace(/\.0$/, '');
const pct = (x: number) => `${trim((x * 100).toFixed(1))}%`;
const mw = (x: number) => `${trim(x.toFixed(1))} MW`;
const machines = (n: number) => `${n}대`;
const qty = (n: number) => `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/**
 * 조사 고르기. 물건 이름은 데이터에서 오므로 받침이 있는지 미리 알 수 없다.
 * 받침을 직접 보고 을/를, 이/가를 고른다 (한글이 아니면 받침 없는 것으로 본다).
 */
const hasFinal = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const eul = (w: string) => `${w}${hasFinal(w) ? '을' : '를'}`;
const iga = (w: string) => `${w}${hasFinal(w) ? '이' : '가'}`;

/** 규칙 id 는 kebab-case 로 고정한다. 게임 클래스명을 뒤에 붙일 때도 형식을 지킨다 */
const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ 문맥 */

interface Ctx {
  model: FactoryModel;
  catalog: CheckupCatalog;
  /** 카탈로그 분류. 모르는 건물은 'other' */
  cat: (m: FactoryMachine) => string;
  /** 발전기를 뺀 생산 설비 (발전기는 가동률의 의미가 다르다 — 아래 주석) */
  makers: FactoryMachine[];
  byKey: Map<string, FactoryMachine>;
  /** 설비 → 벨트로 이어진 하류 (설비가 아닌 것도 들어 있다) */
  down: Map<string, string[]>;
  /** 설비 → 상류 */
  up: Map<string, string[]>;
  machineKeys: Set<string>;
  /** 창고 (그래프의 도착지이지만 설비는 아니다) */
  storage: Set<string>;
  /** 간선 위를 흐르는 물건. 굶는 설비에게 "무엇이 모자란가"를 말해 준다 */
  edgeItem: Map<string, string | null>;
}

/** 영향 크기. 대략 "설비 몇 대분을 잃고 있나"로 환산한다. 정렬에만 쓴다 */
interface Scored {
  f: Finding;
  w: number;
}

const SEV_RANK: Record<Severity, number> = { stop: 0, warn: 1, info: 2 };

function context(model: FactoryModel, catalog: CheckupCatalog): Ctx {
  const cat = (m: FactoryMachine) => catalog.buildings[m.id]?.cat ?? 'other';
  const down = new Map<string, string[]>();
  const up = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, k: string, v: string) => {
    const list = map.get(k);
    if (list) list.push(v);
    else map.set(k, [v]);
  };
  for (const e of model.edges) {
    push(down, e.from, e.to);
    push(up, e.to, e.from);
  }
  return {
    model,
    catalog,
    cat,
    /*
     * 발전기는 뺀다. 발전기의 가동률은 연료가 아니라 전력 수요를 따라간다 —
     * 수요가 적으면 덜 태우므로 낮은 가동률이 곧 문제라고 단정할 수 없다.
     * 확인하지 못한 것을 경고로 만들지 않는다.
     */
    makers: model.machines.filter((m) => cat(m) !== 'generator'),
    byKey: new Map(model.machines.map((m) => [m.key, m])),
    down,
    up,
    machineKeys: new Set(model.machines.map((m) => m.key)),
    storage: new Set(model.storageKeys),
    edgeItem: new Map(model.edges.map((e) => [`${e.from}>${e.to}`, e.item])),
  };
}

/** 표를 자른다. 자른 사실을 숨기지 않는다 */
function capRows(rows: { ko: string; note: string }[]): { ko: string; note: string }[] {
  if (rows.length <= MAX_ROWS) return rows;
  const rest = rows.length - MAX_ROWS;
  return [...rows.slice(0, MAX_ROWS), { ko: `그 외 ${machines(rest)}`, note: '표에서 생략했습니다' }];
}

/** 설비 한 대를 표 한 줄로 */
function machineRow(m: FactoryMachine): { ko: string; note: string } {
  const bits: string[] = [];
  if (m.uptime != null) bits.push(`가동률 ${pct(m.uptime)}`);
  if (Math.abs(m.clock - 1) > 0.001) bits.push(`클럭 ${pct(m.clock)}`);
  if (m.node) bits.push(m.node.resourceKo);
  const label = m.recipeKo ? `${m.ko} — ${m.recipeKo}` : m.ko;
  return { ko: label, note: bits.join(' · ') || '측정값 없음' };
}

/* ------------------------------------------------------------- 1. 병목 */

/**
 * 가동률이 낮은 설비. 같은 레시피끼리 묶어 평균을 낸다.
 * 한 대만 보고 놀라는 대신 "이 공정 전체가 얼마나 놀고 있나"를 본다.
 */
function bottlenecks(ctx: Ctx): Scored[] {
  const groups = new Map<string, { label: string; list: FactoryMachine[] }>();
  for (const m of ctx.makers) {
    if (m.uptime == null) continue;
    const key = m.recipe ?? (m.node ? `${m.id}|${m.node.resourceKo}` : m.id);
    const label = m.recipeKo ?? (m.node ? `${m.ko}(${m.node.resourceKo})` : m.ko);
    const g = groups.get(key) ?? { label, list: [] };
    g.list.push(m);
    groups.set(key, g);
  }

  const out: Scored[] = [];
  for (const [key, g] of groups) {
    const n = g.list.length;
    const avg = g.list.reduce((s, m) => s + (m.uptime ?? 0), 0) / n;
    if (avg >= UPTIME_WARN - EPS) continue;
    const lost = (1 - avg) * n;
    const severity: Severity = avg < UPTIME_STOP ? 'stop' : 'warn';
    /* 지금 들어오는 양이면 몇 대로 충분한가 — 나머지는 놀고 있는 셈이다 */
    const keep = Math.max(1, Math.ceil(n * avg - EPS));
    /* 올림 때문에 keep 이 n 과 같아지는 일이 흔하다. 그때는 "몇 대면 된다"는 말이 공허하다 */
    const spare = n - keep;
    /* 100%로 돌리려면 공급이 몇 배여야 하나. 처리량은 가동률에 비례한다 */
    const times = avg > 0 ? trim((1 / avg).toFixed(1)) : null;
    const title =
      n === 1
        ? `${g.label} 설비 한 대가 ${pct(avg)}만 돌고 있습니다`
        : `${g.label} 설비 ${machines(n)}가 평균 ${pct(avg)}만 돌고 있습니다`;
    out.push({
      w: lost,
      f: {
        id: `bottleneck-${kebab(key)}`,
        severity,
        title,
        group: 'bottleneck',
        basis: BASIS.bottleneck,
        detail:
          (n === 1
            ? `이 한 대는 ${pct(1 - avg)}의 시간 동안 멈춰 서 있었다.`
            : `${machines(n)}를 지어 두고 ${trim(lost.toFixed(1))}대분을 버리고 있다.`) +
          (spare > 0 ? ` 지금 들어오는 양이면 ${machines(keep)}로 같은 산출이 나온다.` : ''),
        fix:
          (times
            ? `굶는 쪽이면 상류 공급을 ${times}배로 늘려야 100%가 된다. `
            : `굶는 쪽이면 상류에서 아무것도 오지 않고 있으니 공급 라인부터 잇는다. `) +
          (spare > 0
            ? `막힌 쪽이면 하류 소비를 그만큼 늘리거나, 남는 ${machines(spare)}의 클럭을 내려 전력을 아껴라.`
            : `막힌 쪽이면 하류 소비를 늘리거나, ${n === 1 ? '이 설비' : '이 설비들'}의 클럭을 ` +
              `${pct(avg)} 근처로 내려 전력을 아껴라.`),
        rows: capRows(
          [...g.list].sort((a, b) => (a.uptime ?? 0) - (b.uptime ?? 0)).map(machineRow)
        ),
      },
    });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, MAX_GROUPS);
}

/* --------------------------------------------------- 2a. 막힌 설비 */

/** 산출을 내보낼 곳이 없는 설비 (하류 간선이 하나도 없다) */
const noOutlet = (ctx: Ctx, m: FactoryMachine) =>
  (m.outItem != null || ctx.cat(m) === 'extractor') && !(ctx.down.get(m.key)?.length ?? 0);

/** 하류가 아예 없는데 가동률까지 낮다 = 만든 것이 갈 데가 없어서 스스로 멈춘 것 */
function blockedList(ctx: Ctx): FactoryMachine[] {
  return ctx.makers.filter(
    (m) => m.uptime != null && m.uptime < UPTIME_WARN - EPS && noOutlet(ctx, m)
  );
}

function blocked(ctx: Ctx): Scored[] {
  const list = blockedList(ctx);
  if (!list.length) return [];
  const avg = list.reduce((s, m) => s + (m.uptime ?? 0), 0) / list.length;
  const lost = list.reduce((s, m) => s + (1 - (m.uptime ?? 0)), 0);
  return [
    {
      w: lost,
      f: {
        id: 'output-blocked',
        severity: avg < UPTIME_STOP ? 'stop' : 'warn',
        title: `${machines(list.length)}가 만든 것을 내보내지 못해 평균 ${pct(avg)}로 떨어졌습니다`,
        group: 'blocked',
        basis: BASIS.blocked,
        detail: `${machines(list.length)}가 평균 ${pct(avg)}로 떨어져 ${trim(lost.toFixed(1))}대분을 버리고 있다.`,
        fix:
          `출력 벨트를 소비처까지 잇는다. ` +
          `당장 쓸 곳이 없으면 창고를 붙여서라도 ${machines(list.length)}가 계속 돌게 한다.`,
        rows: capRows([...list].sort((a, b) => (a.uptime ?? 0) - (b.uptime ?? 0)).map(machineRow)),
      },
    },
  ];
}

/* --------------------------------------------------- 2b. 굶는 설비 */

/** 상류가 있는데 그 상류의 가동률이 나보다 낮다 = 재료가 덜 온다 */
function starved(ctx: Ctx): Scored[] {
  const rows: { ko: string; note: string }[] = [];
  const hit: FactoryMachine[] = [];
  /* 원인이 된 상류 설비. 여럿이 한 상류를 가리키는 일이 흔해서 따로 센다 */
  const causes = new Set<string>();
  for (const m of ctx.makers) {
    if (m.uptime == null || m.uptime >= UPTIME_WARN - EPS) continue;
    const ups = (ctx.up.get(m.key) ?? [])
      .map((k) => ctx.byKey.get(k))
      .filter((u): u is FactoryMachine => !!u && u.uptime != null);
    const cause = ups
      .filter((u) => u.uptime! < UPTIME_WARN - EPS && u.uptime! <= (m.uptime ?? 0) + EPS)
      .sort((a, b) => a.uptime! - b.uptime!)[0];
    if (!cause) continue;
    hit.push(m);
    causes.add(cause.key);
    const item = ctx.edgeItem.get(`${cause.key}>${m.key}`);
    const short = item ? `${iga(ctx.catalog.items[item] ?? item)} 모자람 · ` : '';
    rows.push({
      ko: m.recipeKo ? `${m.ko} — ${m.recipeKo}` : m.ko,
      note: `가동률 ${pct(m.uptime)} · ${short}상류 ${cause.ko} ${pct(cause.uptime!)}`,
    });
  }
  if (!hit.length) return [];
  const lost = hit.reduce((s, m) => s + (1 - (m.uptime ?? 0)), 0);
  const avg = hit.reduce((s, m) => s + (m.uptime ?? 0), 0) / hit.length;
  return [
    {
      w: lost,
      f: {
        id: 'input-starved',
        severity: avg < UPTIME_STOP ? 'stop' : 'warn',
        title: `${machines(hit.length)}가 재료를 못 받아 평균 ${pct(avg)}로 돌고 있습니다`,
        group: 'starved',
        basis: BASIS.starved,
        detail:
          `${machines(hit.length)}가 평균 ${pct(avg)}로 돌아 ${trim(lost.toFixed(1))}대분을 버리고 있고, ` +
          `원인이 되는 상류 설비는 ${machines(causes.size)}다.`,
        fix:
          `표의 상류 설비부터 고친다 — 그 상류가 또 굶고 있으면 채굴기까지 거슬러 올라간다. ` +
          `늘릴 수 없다면 이 설비들의 클럭을 ${pct(avg)} 근처로 내려 전력을 아껴라.`,
        rows: capRows(rows),
      },
    },
  ];
}

/* ------------------------------------- 3. 출력이 아무 데도 안 이어진 설비 */

function dangling(ctx: Ctx, blockedKeys: Set<string>): Scored[] {
  const list = ctx.makers.filter((m) => !blockedKeys.has(m.key) && noOutlet(ctx, m));
  const dangles = ctx.model.danglingOutputs;
  if (!list.length && !dangles) return [];
  const title = list.length
    ? `출력이 어디에도 이어지지 않은 설비가 ${machines(list.length)} 있습니다`
    : `아무 데도 이어지지 않은 출력구가 ${dangles}개 있습니다`;
  return [
    {
      w: list.length + dangles * 0.5,
      f: {
        id: 'dangling-output',
        severity: list.length ? 'warn' : 'info',
        title,
        group: 'dangling',
        basis: BASIS.dangling,
        detail: list.length
          ? `산출이 어디로도 가지 않는 설비가 ${machines(list.length)}, 이어지지 않은 출력구가 ${dangles}개다.`
          : `이어지지 않은 출력구가 ${dangles}개다.`,
        fix:
          `쓸 물건이면 소비처까지 벨트를 잇고, 아니면 창고를 붙여 둔다. ` +
          `일부러 비워 둔 자리라면 그 설비가 창고 차는 순간 멈춘다는 것만 알고 두면 된다.`,
        rows: list.length ? capRows(list.map(machineRow)) : undefined,
      },
    },
  ];
}

/* ------------------------------------------------------------ 4. 전력 여유 */

interface Rated {
  total: number;
  rows: { ko: string; note: string; mw: number }[];
}

/**
 * 정격 소비. 카탈로그의 기본 소비 p 에 클럭 보정 clock^e 를 건다.
 *
 * 왜 순간 소비(power.useMW)로 충분하지 않은가:
 *   세이브의 useMW 는 저장된 그 순간의 소비라 재료를 기다리며 서 있던 설비가 거의 0으로 잡힌다.
 *   그 값만 보면 여유가 넉넉해 보이다가, 막힌 라인을 고치는 순간 전력망이 내려간다.
 *   그래서 "전부 동시에 돌면 얼마인가"를 따로 계산해 둘을 같이 보여 준다.
 *
 * 레시피를 걸지 않은 설비는 모델의 machines 에 들어오지 않는다. 그래서 지어 둔 개수(counts)를
 * 기준으로 세고, 모델에 잡힌 설비만 실제 클럭을 반영한다. 나머지는 클럭 100%로 본다.
 */
function ratedUse(model: FactoryModel, catalog: CheckupCatalog): Rated {
  const clocked = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const m of model.machines) {
    const b = catalog.buildings[m.id];
    if (!b || b.p == null || b.cat === 'generator') continue;
    clocked.set(m.id, (clocked.get(m.id) ?? 0) + Math.pow(m.clock, b.e ?? 1));
    seen.set(m.id, (seen.get(m.id) ?? 0) + 1);
  }
  const ids = new Set([...Object.keys(model.counts), ...seen.keys()]);
  const rows: { ko: string; note: string; mw: number }[] = [];
  let total = 0;
  for (const id of ids) {
    const b = catalog.buildings[id];
    if (!b || b.p == null || b.cat === 'generator') continue;
    const n = Math.max(model.counts[id] ?? 0, seen.get(id) ?? 0);
    if (!n) continue;
    const factor = (clocked.get(id) ?? 0) + Math.max(0, n - (seen.get(id) ?? 0));
    const sum = b.p * factor;
    total += sum;
    rows.push({ ko: b.ko, note: `${machines(n)} · ${mw(sum)}`, mw: sum });
  }
  rows.sort((a, b) => b.mw - a.mw);
  return { total, rows };
}

function power(ctx: Ctx): Scored[] {
  const { genMW, useMW } = ctx.model.power;
  /* 발전량을 못 읽었으면 여유를 계산할 수 없다. 지어내지 않고 넘어간다 */
  if (genMW <= 0) return [];
  const rated = ratedUse(ctx.model, ctx.catalog);
  if (rated.total <= 0) return [];
  const margin = (genMW - rated.total) / genMW;
  if (margin >= POWER_WARN - EPS) return [];

  /* 부족분을 메우려면 지금 쓰는 발전기로 몇 대인가 — 가장 많이 지어 둔 발전기를 기준으로 센다 */
  let gen: { ko: string; g: number; n: number } | null = null;
  for (const [id, n] of Object.entries(ctx.model.counts)) {
    const b = ctx.catalog.buildings[id];
    if (!b || b.cat !== 'generator' || !b.g) continue;
    if (!gen || n > gen.n) gen = { ko: b.ko, g: b.g, n };
  }
  const need = rated.total / (1 - POWER_WARN) - genMW; // 25% 여유까지 올리는 데 필요한 발전량
  const more = gen && need > 0 ? Math.ceil(need / gen.g) : 0;

  return [
    {
      w: (Math.max(1, ctx.model.machines.length) * (POWER_WARN - margin)) / POWER_WARN,
      f: {
        id: 'power-margin',
        severity: margin < POWER_STOP ? 'stop' : 'warn',
        title:
          margin >= 0
            ? `발전 ${mw(genMW)}에 정격 소비 ${mw(rated.total)} — 여유가 ${pct(margin)}뿐입니다`
            : `정격 소비 ${mw(rated.total)}가 발전 ${mw(genMW)}보다 ${mw(rated.total - genMW)} 많습니다`,
        group: 'power',
        basis: BASIS.power,
        detail:
          `순간 소비는 ${mw(useMW)}로 잡혔지만 전부 동시에 돌면 ${mw(rated.total)}로, ` +
          `지금 발전량의 ${pct(rated.total / genMW)}다.`,
        fix: gen
          ? `여유 25%를 만들려면 ${mw(Math.max(0, need))}가 더 필요하다 — 지금 가장 많이 쓰는 발전기로 ${machines(more)} 분량이다. ` +
            `당장 못 짓겠으면 표 위쪽의 큰 소비 설비부터 클럭을 내려라.`
          : `여유 25%를 만들려면 ${mw(Math.max(0, need))}가 더 필요하다. ` +
            `발전기를 늘리거나 표 위쪽의 큰 소비 설비부터 클럭을 내려라.`,
        rows: capRows(rated.rows.slice(0, 8).map(({ ko, note }) => ({ ko, note }))),
      },
    },
  ];
}

/* ------------------------------------------- 5. 레시피가 없는 생산 설비 */

/**
 * 지어 놓고 레시피를 안 고른 설비.
 * 레시피가 없는 설비는 모델의 machines 에 아예 들어오지 않는다. 그래서 직접 셀 수 없고,
 * 지어 둔 개수(counts)와 레시피가 걸린 개수의 차이로만 드러난다.
 */
function noRecipe(ctx: Ctx): Scored[] {
  const withRecipe = new Map<string, number>();
  for (const m of ctx.model.machines) {
    if (!m.recipe) continue;
    withRecipe.set(m.id, (withRecipe.get(m.id) ?? 0) + 1);
  }
  const rows: { ko: string; note: string }[] = [];
  let idle = 0;
  let built = 0;
  for (const [id, n] of Object.entries(ctx.model.counts)) {
    const b = ctx.catalog.buildings[id];
    if (!b || b.cat !== 'manufacturer') continue;
    const gap = n - (withRecipe.get(id) ?? 0);
    if (gap <= 0) continue;
    idle += gap;
    built += n;
    rows.push({ ko: b.ko, note: `${machines(gap)} · 지은 것 ${machines(n)} 중` });
  }
  if (!idle) return [];
  return [
    {
      w: idle,
      f: {
        id: 'no-recipe',
        severity: 'warn',
        title: `레시피를 고르지 않은 생산 설비가 ${machines(idle)} 있습니다`,
        group: 'no-recipe',
        basis: BASIS.noRecipe,
        detail: `지어 둔 ${machines(built)} 가운데 ${machines(idle)}에 레시피가 걸려 있지 않다.`,
        fix: `라인에 넣을 것이면 레시피를 걸고, 아니면 해체해 ${machines(idle)} 분량의 자재를 돌려받아라.`,
        rows: capRows(rows),
      },
    },
  ];
}

/* -------------------------------------------- 6. 쌓이기만 하는 물건 */

/**
 * 재고가 많은데 그것을 만드는 설비의 산출이 다른 설비로 이어지지 않는 경우.
 *
 * 무엇이 무엇을 재료로 쓰는지는 진단 카탈로그에 없다(index.json 의 consumedBy 는 화면에 싣지 않는다).
 * 그래서 소비를 직접 보지 않고, 이렇게 판정한다:
 *   1) 이 공장에 그 물건을 만드는 설비가 있고
 *   2) 그 설비들 중 산출이 다른 설비로 이어진 것이 하나도 없으며 (창고나 끊긴 벨트에서 끝난다)
 *   3) 재고가 STOCK_PILE 이상이다
 * 셋이 모두 참이면 "만들고는 있는데 쓰는 곳이 없다"가 데이터만으로 참이 된다.
 */
function piling(ctx: Ctx): Scored[] {
  const madeBy = new Map<string, FactoryMachine[]>();
  for (const m of ctx.model.machines) {
    if (!m.outItem) continue;
    const list = madeBy.get(m.outItem) ?? [];
    list.push(m);
    madeBy.set(m.outItem, list);
  }

  const out: Scored[] = [];
  for (const [item, n] of Object.entries(ctx.model.stock)) {
    if (n < STOCK_PILE) continue;
    const makers = madeBy.get(item);
    if (!makers?.length) continue;
    const feeds = makers.some((m) =>
      (ctx.down.get(m.key) ?? []).some((k) => ctx.machineKeys.has(k))
    );
    if (feeds) continue;
    const ko = ctx.catalog.items[item] ?? item;
    out.push({
      w: makers.length,
      f: {
        id: `piling-${kebab(item)}`,
        severity: 'warn',
        title: `${ko} ${qty(n)}개가 쌓이기만 하고 있습니다`,
        group: 'piling',
        basis: BASIS.piling,
        detail:
          `${eul(ko)} 만드는 ${machines(makers.length)}의 산출이 어느 설비로도 가지 않고, ` +
          `재고가 ${qty(n)}개까지 늘었다.`,
        fix:
          `쓸 곳이 있으면 그쪽으로 벨트를 잇는다. ` +
          `없으면 이 ${machines(makers.length)}의 클럭을 내리거나 지금 필요한 것으로 레시피를 돌려라.`,
        rows: capRows(
          makers.map((m) => {
            const row = machineRow(m);
            const outs = ctx.down.get(m.key) ?? [];
            const where = outs.some((k) => ctx.storage.has(k))
              ? '창고에서 끝남'
              : '이어진 곳 없음';
            return { ko: row.ko, note: `${row.note} · ${where}` };
          })
        ),
      },
    });
  }
  return out.sort((a, b) => b.w - a.w);
}

/* ------------------------------------------------- 추가. 오버클럭 전력 */

/**
 * 오버클럭한 설비의 추가 전력.
 * 산출은 클럭에 비례해 늘지만 소비는 clock^e 로 는다(e 는 건물마다 카탈로그에 있다).
 * 그래서 "클럭만큼만 늘었다면 들었을 소비"와 실제 소비의 차이가 오버클럭의 진짜 값이다.
 */
function overclock(ctx: Ctx): Scored[] {
  const rows: { ko: string; note: string }[] = [];
  let extra = 0;
  let n = 0;
  for (const m of ctx.model.machines) {
    const b = ctx.catalog.buildings[m.id];
    if (!b || b.p == null || m.clock <= 1 + 0.001) continue;
    const e = b.e ?? 1;
    const d = b.p * (Math.pow(m.clock, e) - m.clock);
    if (d <= 0) continue;
    extra += d;
    n += 1;
    rows.push({ ko: m.recipeKo ? `${m.ko} — ${m.recipeKo}` : m.ko, note: `클럭 ${pct(m.clock)} · 추가 ${mw(d)}` });
  }
  if (n === 0 || extra < 1) return [];
  return [
    {
      w: extra,
      f: {
        id: 'overclock-power',
        severity: 'info',
        title: `오버클럭한 ${machines(n)} 때문에 전력이 ${mw(extra)} 더 듭니다`,
        group: 'overclock',
        basis: BASIS.overclock,
        detail: `오버클럭한 ${machines(n)}가 같은 산출을 대수로 냈을 때보다 ${mw(extra)}를 더 먹고 있다.`,
        fix:
          `전력이 빠듯하면 클럭을 100%로 되돌리고 대수를 늘려라 — 같은 산출에 ${mw(extra)}를 아낀다. ` +
          `자리가 없어 일부러 올린 것이면 발전 여유만 이만큼 더 잡아 두면 된다.`,
        rows: capRows(rows.sort((a, b) => a.ko.localeCompare(b.ko))),
      },
    },
  ];
}

/* --------------------------------------------------------- 8. 아무 문제 없음 */

function allClear(ctx: Ctx): Finding {
  const measured = ctx.makers.filter((m) => m.uptime != null);
  const rated = ratedUse(ctx.model, ctx.catalog);
  const gen = ctx.model.power.genMW;
  const head = gen > 0 ? Math.max(0, gen - rated.total) : 0;
  const title = measured.length
    ? `지금 막힌 곳은 없습니다 — 설비 ${machines(measured.length)}가 모두 ${pct(UPTIME_WARN)} 이상으로 돌고 있습니다`
    : `지금 막힌 곳은 없습니다`;
  return {
    id: 'all-clear',
    severity: 'info',
    title,
    group: 'all-clear',
    basis: BASIS.allClear,
    detail: measured.length
      ? `설비 ${machines(measured.length)}가 모두 ${pct(UPTIME_WARN)} 이상으로 돌고 있고, 걸리는 규칙이 하나도 없다.`
      : `걸리는 규칙이 하나도 없다 — 다만 아직 가동률이 기록된 설비가 없어 병목은 보지 못했다.`,
    fix:
      gen > 0
        ? `지금 발전 여유 ${mw(head)} 안에서 새 라인을 올리면 전력망을 내리지 않는다. ` +
          `여유를 넘길 것 같으면 라인보다 발전기를 먼저 짓는다.`
        : `다음 라인을 올리기 전에 발전 여유부터 확인하고, 모자라면 발전기를 먼저 짓는다.`,
  };
}

/* ------------------------------------------------------------------ 본체 */

export function diagnose(model: FactoryModel, catalog: CheckupCatalog): Finding[] {
  const ctx = context(model, catalog);

  const blockedKeys = new Set(blockedList(ctx).map((m) => m.key));

  const scored: Scored[] = [
    ...bottlenecks(ctx),
    ...blocked(ctx),
    ...starved(ctx),
    ...dangling(ctx, blockedKeys),
    ...power(ctx),
    ...noRecipe(ctx),
    ...piling(ctx),
    ...overclock(ctx),
  ];

  if (!scored.length) return [allClear(ctx)];

  /* 심각한 것부터, 같은 심각도 안에서는 영향이 큰 것부터 */
  scored.sort((a, b) => SEV_RANK[a.f.severity] - SEV_RANK[b.f.severity] || b.w - a.w);
  return scored.map((s) => s.f);
}

/*
 * 구현하지 못한 규칙
 *
 * 채굴기 산출이 벨트 상한을 넘는 구간:
 *   채굴기의 분당 산출은 (등급별 기본 속도) × (순도 배수) × (클럭)으로 나온다. 벨트 상한은
 *   catalog.belts 에 있고 순도는 machine.node.purity 에 있지만, 등급별 기본 속도가 어디에도 없다.
 *   - 모델의 ratePerMinute 는 레시피에서 계산한 값이라(recipe.per × clock) 레시피가 없는 채굴기는 항상 null 이다
 *   - 진단 카탈로그의 buildings 에는 ko / cat / p / g / e 만 있고 채굴 속도가 없다
 *   기본 속도를 기억으로 적어 넣으면 이 저장소의 첫 번째 규칙(수치는 출처 없이 쓰지 않는다)을 어긴다.
 *   그래서 규칙을 만들지 않았다. 되살리려면 카탈로그 생성기가 buildings 의
 *   extraction.perMinuteAtNormalPurity 를 함께 내보내면 된다 — 그 값은 이미 게임 배포 데이터에서
 *   나오고 있고, buildings.json 에 들어 있다. 그때 순도 배수도 게임 데이터로 검증해서 쓴다.
 *
 * 전력망이 실제로 내려갔는지:
 *   회로 수(power.circuits)는 알지만 회로별 발전·소비와 스위치 상태는 모델에 없다.
 *   회로가 여럿이면 전체 합이 남아도 어느 한 회로만 모자랄 수 있는데, 그것은 지금 데이터로 갈리지 않는다.
 *   전력 규칙이 공장 전체 합으로만 판단한다는 뜻이고, 그 한계는 규칙 본문에 적지 않았다(화면이 길어진다).
 */
