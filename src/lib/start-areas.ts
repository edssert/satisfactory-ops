/**
 * start-areas.ts — 시작 지점 네 곳의 주변 자원을 좌표에서 계산한다.
 *
 * 지역 판단 문구와 게임 안내문은 큐레이션에 두고, 노드 수치는 여기서 만든다.
 * 그래야 게임 데이터가 바뀌면 숫자와 순위가 같이 바뀐다.
 *
 * 범위를 둘로 나눠 센다:
 *   집 앞   시작 지역 격자 한 칸 (약 1.09 km) — 벨트로 바로 끌어올 거리
 *   걸어서  그 칸과 맞닿은 여덟 칸까지 (약 3.3 km) — 초반에 오가며 확장할 거리
 *
 * 격자는 인게임 지도의 X#Y# 이고 Y0 이 남쪽이다.
 */
import nodesJson from '../data/app/resource-nodes.json';
import areasJson from '../data/curated/start-areas.json';

export interface MapNode {
  id: string;
  res: string;
  ko: string;
  purity: 'impure' | 'normal' | 'pure';
  type: string;
  fx: number;
  fy: number;
  cell: string;
}

const doc = nodesJson as unknown as { nodes: MapNode[] };
export const areas = (areasJson as unknown as {
  $source: string;
  $note: string;
  areas: {
    key: string;
    ko: string;
    en: string;
    cells: string[];
    where: string;
    forWhom: string;
    blurb: string;
    stars: { flat: number; biomass: number; amount: number; variety: number };
    landmark: string;
  }[];
}).areas;
export const AREA_SOURCE = (areasJson as unknown as { $source: string }).$source;
export const AREA_NOTE = (areasJson as unknown as { $note: string }).$note;

/** 순도별 채굴량 배수. 채굴기 Mk.1 기준 30 / 60 / 120 */
const PURITY_MULT = { impure: 0.5, normal: 1, pure: 2 } as const;

/**
 * 초반 생산 판단에 쓰는 자원과 별도 참고 자원을 구분한다.
 * S.A.M. 연구 트리는 MAM 이후 일찍 시작할 수 있지만 허브 티어와 독립적이므로 점수 가중치는 낮게 둔다.
 */
export const TRACKED = [
  { res: 'Desc_OreIron_C', ko: '철 광석', early: true },
  { res: 'Desc_OreCopper_C', ko: '구리 광석', early: true },
  { res: 'Desc_Stone_C', ko: '석회석', early: true },
  { res: 'Desc_Coal_C', ko: '석탄', early: true },
  /*
   * 물 「노드」는 전부 자원정(frackingCore·frackingSatellite)이다 — 티어 8 자원정 추출기로만 쓴다.
   * 초반에 쓰는 물은 노드가 아니라 바다·호수 수면에 물 추출기를 놓는 것이라 여기 안 잡힌다.
   * 그래서 초반 항목에서 뺀다. 넣으면 "물이 0개"가 물이 없다는 뜻으로 읽힌다.
   */
  { res: 'Desc_Water_C', ko: '물 자원정', early: false },
  { res: 'Desc_OreGold_C', ko: '카테리움 광석', early: false },
  { res: 'Desc_RawQuartz_C', ko: '석영 원석', early: false },
  { res: 'Desc_Sulfur_C', ko: '황', early: false },
  { res: 'Desc_LiquidOil_C', ko: '원유', early: false },
  { res: 'Desc_SAM_C', ko: 'S.A.M.', early: false },
];

export interface Count {
  res: string;
  ko: string;
  /** 노드 수 */
  n: number;
  impure: number;
  normal: number;
  pure: number;
  /** 채굴기 Mk.1 을 다 박았을 때의 분당 산출 */
  perMinute: number;
}

const cellOf = (c: string) => {
  const m = /^X(\d+)Y(\d+)$/.exec(c);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};

/** 그 칸과 맞닿은 여덟 칸 */
function ring(cells: string[]): Set<string> {
  const out = new Set<string>();
  for (const c of cells) {
    const p = cellOf(c);
    if (!p) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) out.add(`X${p.x + dx}Y${p.y + dy}`);
    }
  }
  return out;
}

function tally(list: MapNode[]): Count[] {
  return TRACKED.map((t) => {
    const hits = list.filter((n) => n.res === t.res);
    const by = (p: keyof typeof PURITY_MULT) => hits.filter((h) => h.purity === p).length;
    return {
      res: t.res,
      ko: t.ko,
      n: hits.length,
      impure: by('impure'),
      normal: by('normal'),
      pure: by('pure'),
      /* 채굴기 Mk.1 은 보통 순도에서 분당 60. 물은 추출기라 따로 본다 */
      perMinute: hits.reduce((a, h) => a + 60 * PURITY_MULT[h.purity], 0),
    };
  }).filter((c) => c.n > 0);
}

export interface AreaStats {
  near: Count[];
  wide: Count[];
  /** 초반에 쓰는 것만 본 점수 — 표를 정렬하는 데만 쓴다 */
  score: number;
}

/**
 * 점수는 초반에 실제로 쓰는 것에만 준다.
 *
 * 철이 가장 무겁다 — 티어 1~2 의 요구 부품이 거의 전부 철에서 나온다.
 * 구리와 석회석이 그다음이고, 석탄과 물은 티어 3 에서 손을 떼는 지점을 앞당긴다.
 * 집 앞 노드를 걸어가야 하는 노드보다 세 배로 친다.
 */
const WEIGHT: Record<string, number> = {
  Desc_OreIron_C: 3,
  Desc_OreCopper_C: 2,
  Desc_Stone_C: 1.5,
  Desc_Coal_C: 2,
  Desc_SAM_C: 0.5,
};

export function statsFor(cells: string[]): AreaStats {
  const inNear = new Set(cells);
  const inWide = ring(cells);
  const near = doc.nodes.filter((n) => inNear.has(n.cell));
  const wide = doc.nodes.filter((n) => inWide.has(n.cell) && !inNear.has(n.cell));
  const nearC = tally(near);
  const wideC = tally(wide);
  const sum = (list: Count[], k: number) =>
    list.reduce((a, c) => a + (WEIGHT[c.res] ?? 0) * (c.perMinute / 60) * k, 0);
  return { near: nearC, wide: wideC, score: sum(nearC, 3) + sum(wideC, 1) };
}

export function allStats() {
  return areas.map((a) => ({ ...a, ...statsFor(a.cells) })).sort((a, b) => b.score - a.score);
}
