/**
 * tech.ts — 테크 사전(허브·마일스톤 / MAM / 싱크 상점)이 함께 쓰는 것들.
 *
 * 화면을 셋으로 나눴다. 한 페이지에 쭉 늘어놓으면 게임에서 탭으로 골라 보는 것을
 * 스크롤로 바꿔 놓은 꼴이라, 무엇을 보고 있는지가 사라진다.
 *
 * 데이터는 build-tech.mjs 산출물(`src/data/app/tech.json`)이 정본이다.
 * 게임 배포 데이터에 없는 것(상점 탭 구성)만 큐레이션에서 가져온다.
 */
import techJson from '../data/app/tech.json';
import shopLayoutJson from '../data/curated/shop-layout.json';
import assetIndex from '../data/app/assets.json';

export interface Unlocks {
  buildings: { id: string; ko: string }[];
  recipes: { id: string; ko: string; isAlternate: boolean; makes: { ko: string; perMinute: number } | null }[];
  items: { id: string; ko: string }[];
  slots: number;
  other: string[];
}
export interface Cost {
  item: string;
  ko: string;
  amount: number;
}
export interface MamNode {
  id: string;
  ko: string;
  en: string;
  /** 선행 노드. 클래스명 경로에서 뽑고 위키로 보정했다 */
  parents: string[];
  tree: string;
  treeKo: string;
  row: number;
  col: number;
  cost: Cost[];
  seconds: number;
  unlocks: Unlocks;
  discontinued: boolean;
}
export interface ShopEntry {
  id: string;
  ko: string;
  en: string;
  coupons: number;
  unlocks: Unlocks;
}

export const tech = techJson as unknown as {
  $counts: { hub: number; milestones: number; mam: number; shop: number };
  hub: { id: string; ko: string; order: number; cost: Cost[]; unlocks: Unlocks }[];
  milestones: { id: string; ko: string; tier: number; cost: Cost[]; unlocks: Unlocks }[];
  mamTrees: { key: string; ko: string; opens: string; count: number }[];
  mam: MamNode[];
  shop: ShopEntry[];
};

const assets = assetIndex as { items: string[]; buildings: string[] };
export const hasItemIcon = (id: string) => assets.items.includes(id);
export const hasBuildingIcon = (id: string) => assets.buildings.includes(id);

/** 해금 내용을 한 줄짜리 조각들로 */
export function summarize(u: Unlocks): string[] {
  const out: string[] = [];
  for (const b of u.buildings) out.push(b.ko);
  for (const r of u.recipes) out.push(r.isAlternate ? `${r.ko} (대체)` : r.ko);
  for (const i of u.items) out.push(i.ko);
  if (u.slots > 0) out.push(`인벤토리 +${u.slots}칸`);
  out.push(...u.other);
  return out;
}

/** 대표 그림 — 해금하는 건물이나 아이템의 아이콘 */
export function iconOf(u: Unlocks): { src: string; kind: 'building' | 'item' } | null {
  const b = u.buildings.find((x) => hasBuildingIcon(x.id));
  if (b) return { src: b.id, kind: 'building' };
  const i = u.items.find((x) => hasItemIcon(x.id));
  if (i) return { src: i.id, kind: 'item' };
  return null;
}

/**
 * 티어 0 = 허브 업그레이드.
 *
 * 게임 화면이 그렇게 부른다 — 티어 탭의 맨 왼쪽이 「티어 0」이고 그 안에 허브 업그레이드가 들어 있다.
 * 앱에서만 「허브」라고 따로 부르면 게임과 대조가 안 된다.
 */
export interface TierEntry {
  id: string;
  ko: string;
  cost: Cost[];
  unlocks: Unlocks;
}
export interface Tier {
  tier: number;
  ko: string;
  list: TierEntry[];
}

export function tiers(): Tier[] {
  const t0: Tier = {
    tier: 0,
    ko: '티어 0',
    list: tech.hub.map((h) => ({ id: h.id, ko: h.ko, cost: h.cost, unlocks: h.unlocks })),
  };
  const rest = [...new Set(tech.milestones.map((m) => m.tier))]
    .sort((a, b) => a - b)
    .map((n) => ({
      tier: n,
      ko: `티어 ${n}`,
      list: tech.milestones
        .filter((m) => m.tier === n)
        .map((m) => ({ id: m.id, ko: m.ko, cost: m.cost, unlocks: m.unlocks })),
    }));
  return [t0, ...rest];
}

/* ------------------------------------------------------------------ MAM */

/** 트리 하나의 배치. 선행 관계에서 깊이를 세워 게임처럼 위에서 아래로 뻗는다 */
export interface MamLayout {
  width: number;
  height: number;
  nodes: (MamNode & { x: number; y: number })[];
  /** 부모에서 자식으로 내려가는 갈래선 */
  links: string[];
}

const TILE_W = 156;
const TILE_H = 128;
const GAP_X = 22;
const ROW_GAP = 56;
const PAD = 26;

export function mamLayout(treeKey: string): MamLayout {
  const all = tech.mam.filter((m) => m.tree === treeKey);
  const byId = new Map(all.map((n) => [n.id, n]));

  /* 깊이 = 부모까지의 최장 거리. 순환은 없지만 방어해 둔다 */
  const depth = new Map<string, number>();
  const walk = (id: string, seen: Set<string>): number => {
    const has = depth.get(id);
    if (has != null) return has;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = (byId.get(id)?.parents ?? []).filter((p) => byId.has(p));
    const d = ps.length ? Math.max(...ps.map((p) => walk(p, seen) + 1)) : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of all) walk(n.id, new Set());

  const maxD = Math.max(0, ...[...depth.values()]);
  const rows: MamNode[][] = [];
  for (let d = 0; d <= maxD; d++) rows.push(all.filter((n) => depth.get(n.id) === d));

  /* 같은 줄 안에서는 부모 자리를 따라 늘어놓는다. 선이 덜 꼬인다 */
  const centerOf = new Map<string, number>();
  const width = Math.max(
    PAD * 2 + TILE_W,
    ...rows.map((r) => PAD * 2 + r.length * TILE_W + (r.length - 1) * GAP_X)
  );
  const nodes: (MamNode & { x: number; y: number })[] = [];

  rows.forEach((row, ri) => {
    if (ri > 0) {
      row.sort((a, b) => {
        const ax = Math.min(...(a.parents ?? []).map((p) => centerOf.get(p) ?? width / 2), width);
        const bx = Math.min(...(b.parents ?? []).map((p) => centerOf.get(p) ?? width / 2), width);
        return ax - bx || a.ko.localeCompare(b.ko, 'ko');
      });
    }
    const total = row.length * TILE_W + (row.length - 1) * GAP_X;
    const y = PAD + ri * (TILE_H + ROW_GAP);
    row.forEach((n, k) => {
      const x = (width - total) / 2 + k * (TILE_W + GAP_X);
      centerOf.set(n.id, x + TILE_W / 2);
      nodes.push({ ...n, x, y });
    });
  });

  const yOf = (id: string) => PAD + (depth.get(id) ?? 0) * (TILE_H + ROW_GAP);
  const links: string[] = [];
  for (const n of nodes) {
    for (const p of n.parents ?? []) {
      if (!byId.has(p)) continue;
      const px = centerOf.get(p)!;
      const py = yOf(p) + TILE_H;
      const cx = centerOf.get(n.id)!;
      const cy = n.y;
      const mid = py + (cy - py) / 2;
      links.push(
        Math.abs(px - cx) < 1
          ? `M${px},${py} L${cx},${cy}`
          : `M${px},${py} L${px},${mid} L${cx},${mid} L${cx},${cy}`
      );
    }
  }

  const height = rows.length ? PAD + rows.length * TILE_H + (rows.length - 1) * ROW_GAP + PAD : 0;
  return { width, height, nodes, links };
}

export const MAM_TILE = { w: TILE_W, h: TILE_H };

/* ------------------------------------------------------------------ 싱크 상점 */

export interface ShopTab {
  en: string;
  ko: string;
  slug: string;
  groups: { en: string; ko: string; list: ShopEntry[] }[];
  count: number;
}

const shopLayout = shopLayoutJson as unknown as {
  $source: string;
  tabs: { en: string; ko: string; groups: { en: string; ko: string; items: string[] }[] }[];
};

export const SHOP_SOURCE = shopLayout.$source;

/** 위키의 영문 이름과 게임 데이터의 영문 이름을 느슨하게 맞춘다 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[™®]/g, '')
    .replace(/[^a-z0-9]+/g, '');

export function shopTabs(): { tabs: ShopTab[]; unmatched: ShopEntry[] } {
  const byName = new Map<string, ShopEntry>();
  for (const s of tech.shop) byName.set(norm(s.en), s);
  const used = new Set<string>();

  const tabs = shopLayout.tabs.map((t) => {
    const groups = t.groups.map((g) => {
      const list: ShopEntry[] = [];
      for (const name of g.items) {
        const hit = byName.get(norm(name));
        if (hit && !used.has(hit.id)) {
          used.add(hit.id);
          list.push(hit);
        }
      }
      return { en: g.en, ko: g.ko, list };
    });
    return {
      en: t.en,
      ko: t.ko,
      slug: norm(t.en),
      groups: groups.filter((g) => g.list.length > 0),
      count: groups.reduce((a, g) => a + g.list.length, 0),
    };
  });

  const unmatched = tech.shop.filter((s) => !used.has(s.id));
  return { tabs: tabs.filter((t) => t.count > 0), unmatched };
}
