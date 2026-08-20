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
import dexNames from '../data/curated/dex-names.json';
import assetIndex from '../data/app/assets.json';

export interface Unlocks {
  buildings: { id: string; ko: string }[];
  recipes: {
    id: string;
    ko: string;
    isAlternate: boolean;
    makes: { id: string; ko: string; perMinute: number; kind: string | null } | null;
  }[];
  items: { id: string; ko: string; kind?: string | null }[];
  slots: number;
  other: string[];
}

/**
 * 스키매틱이 게임 화면에서 쓰는 그림. `dir` 은 public/assets 의 하위 폴더다.
 *
 * 게임 배포 데이터가 스키매틱마다 아이콘 텍스처를 하나 갖고 있고(`mSchematicIcon`),
 * build-tech.mjs 가 그것을 실제 파일 자리로 풀어 둔다. 화면은 이름을 다시 추측하지 않는다.
 */
export interface IconRef {
  dir: 'schematics' | 'items' | 'buildings-png';
  id: string;
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

/**
 * 내부 클래스명인가.
 *
 * 로케일 조회가 실패하면 `Desc_BoomBox_C` 같은 식별자가 이름 자리에 그대로 남는다.
 * 실제로 싱크 상점 카드 11장이 그렇게 나갔다. 이름 자리에 식별자를 쓰느니 비운다.
 */
export const isInternalId = (s: string) => /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+_C$/.test(s.trim());

const CURATED_NAMES = (dexNames as { names: Record<string, { ko: string }> }).names;
const NAMELESS = new Set(
  Object.keys((dexNames as { nameless: Record<string, unknown> }).nameless).filter((k) => k[0] !== '$')
);

/**
 * 화면에 올릴 이름. 로케일에 없으면 큐레이션 표를 보고, 거기에도 없으면 빈 문자열.
 * 이름을 지어내지 않는다 — 근거 없는 한글 이름은 게임 화면과 대조가 안 된다.
 */
function label(ko: string | null | undefined, id?: string): string {
  const s = (ko ?? '').trim();
  if (s && !isInternalId(s)) return s;
  return CURATED_NAMES[id ?? s]?.ko ?? CURATED_NAMES[s]?.ko ?? '';
}

/**
 * 도감이 쓰기 전에 이름을 한 번 걸러 둔다.
 *
 * 화면마다 따로 거르면 새 화면을 만들 때마다 또 샌다. 데이터가 들어오는 문 하나에서 막는다.
 * 이름을 못 찾은 항목은 목록에서 빼고, 제목처럼 비울 수 없는 자리만 「이름 없음」으로 둔다.
 */
function scrub(raw: unknown) {
  const t = raw as {
    hub: { id: string; ko: string; cost?: Cost[]; unlocks?: Unlocks }[];
    milestones: { id: string; ko: string; cost?: Cost[]; unlocks?: Unlocks }[];
    mam: { id: string; ko: string; cost?: Cost[]; unlocks?: Unlocks }[];
    shop: { id: string; ko: string; cost?: Cost[]; unlocks?: Unlocks }[];
  };
  const named = <T extends { id: string; ko: string }>(xs: T[]) =>
    xs.map((x) => ({ ...x, ko: label(x.ko, x.id) })).filter((x) => x.ko !== '');

  for (const list of [t.hub, t.milestones, t.mam, t.shop]) {
    for (const e of list) {
      e.ko = label(e.ko, e.id) || (NAMELESS.has(e.id) ? '이름 없음' : e.ko);
      if (isInternalId(e.ko)) e.ko = '이름 없음';
      if (e.cost) {
        e.cost = e.cost
          .map((c) => ({ ...c, ko: label(c.ko, c.item) }))
          .filter((c) => c.ko !== '');
      }
      const u = e.unlocks;
      if (u) {
        u.buildings = named(u.buildings);
        u.items = named(u.items);
        u.recipes = named(u.recipes).map((r) => ({
          ...r,
          makes: r.makes ? { ...r.makes, ko: label(r.makes.ko) } : null,
        }));
        u.other = u.other.filter((o) => !isInternalId(o));
      }
    }
  }
  return raw;
}

export const tech = scrub(techJson) as unknown as {
  $counts: { hub: number; milestones: number; mam: number; shop: number };
  hub: {
    id: string;
    ko: string;
    order: number;
    cost: Cost[];
    iconRef: IconRef | null;
    unlocks: Unlocks;
  }[];
  milestones: {
    id: string;
    ko: string;
    tier: number;
    cost: Cost[];
    iconRef: IconRef | null;
    unlocks: Unlocks;
  }[];
  mamTrees: {
    key: string;
    ko: string;
    en: string;
    opens: string;
    count: number;
    /** 잠겨 있을 때 게임이 보여 주는 다른 이름 */
    lockedKo?: string;
    /** 기간 한정 이벤트 트리인가 */
    event?: boolean;
    /** 연구 트리가 아니라 다른 화면으로 보내는 항목 (하드 드라이브) */
    link?: string;
    note?: string;
  }[];
  mam: MamNode[];
  shop: ShopEntry[];
};

const assets = assetIndex as {
  items: string[];
  buildings: string[];
  schematics: string[];
  badges: string[];
};
export const hasItemIcon = (id: string) => assets.items.includes(id);
export const hasBuildingIcon = (id: string) => assets.buildings.includes(id);
export const hasBadge = (kind: string) => assets.badges.includes(kind);

/** 파일이 실제로 있는 것만 돌려준다. 없는 그림을 걸면 빈칸이 나간다 */
export function iconPath(ref: IconRef | null | undefined): string | null {
  if (!ref) return null;
  const there =
    ref.dir === 'schematics'
      ? assets.schematics.includes(ref.id)
      : ref.dir === 'items'
        ? assets.items.includes(ref.id)
        : assets.buildings.includes(ref.id);
  return there ? `${ref.dir}/${ref.id}.png` : null;
}

/**
 * 보상 한 줄. 게임의 「보상」 칸이 이 모양이다 — 그림 + 이름 + 오른쪽 위 종류 배지.
 *
 * **그림이 없어도 줄은 나온다.** 예전에는 그림 있는 것만 그려서, 허브 업그레이드 1 의
 * 「손 장비 슬롯 +1」처럼 그림 없는 보상이 화면에서 통째로 사라졌다. 게임은 셋 다 보여 준다.
 */
export type RewardKind = 'building' | 'item' | 'equipment' | 'vehicle' | 'scanner' | 'upgrade';
export interface Reward {
  key: string;
  ko: string;
  /** public/assets 아래 상대 경로. 없으면 그림 없이 이름만 */
  icon: string | null;
  kind: RewardKind;
  /** 색만으로 구분하지 않는다 — 배지 옆에 늘 글자를 같이 둔다 */
  kindKo: string;
}

const KIND_KO: Record<RewardKind, string> = {
  building: '건물',
  item: '아이템',
  equipment: '장비',
  vehicle: '차량',
  scanner: '탐색기',
  upgrade: '업그레이드',
};

/**
 * 아이템 분류(게임 데이터의 kind) → 보상 배지.
 *
 * `building-descriptor` 는 아이템처럼 생겼지만 실제로는 건물이다 — 제련기가 그렇다.
 * 레시피 이름이 `Recipe_SmelterBasicMk1_C` 라 건물 매칭에서 새고, 그대로 두면
 * 게임에서 「건물」로 나오는 것이 우리 화면에서만 「아이템」이 된다.
 */
function badgeOfItem(kind: string | null | undefined): RewardKind {
  if (kind === 'building-descriptor') return 'building';
  if (kind === 'equipment') return 'equipment';
  if (kind === 'vehicle') return 'vehicle';
  return 'item';
}

const reward = (key: string, ko: string, icon: string | null, kind: RewardKind): Reward => ({
  key,
  ko,
  icon,
  kind,
  kindKo: KIND_KO[kind],
});

export function rewardsOf(u: Unlocks): Reward[] {
  const out: Reward[] = [];
  for (const b of u.buildings) {
    out.push(reward(b.id, b.ko, iconPath({ dir: 'buildings-png', id: b.id }), 'building'));
  }
  for (const r of u.recipes) {
    /* 레시피는 만드는 물건의 그림으로 보여 준다. 게임도 그렇다 */
    const icon = r.makes ? iconPath({ dir: 'items', id: r.makes.id }) : null;
    const ko = r.isAlternate ? `${r.ko} (대체 제작법)` : r.ko;
    out.push(reward(r.id, ko, icon, badgeOfItem(r.makes?.kind)));
  }
  for (const i of u.items) {
    out.push(reward(i.id, i.ko, iconPath({ dir: 'items', id: i.id }), badgeOfItem(i.kind)));
  }
  if (u.slots > 0) out.push(reward('slots', `인벤토리 +${u.slots}칸`, null, 'upgrade'));
  for (const o of u.other) {
    /* 「탐색 대상 N종」은 자원 탐색기가 늘어나는 것이라 게임도 탐색기 배지를 쓴다 */
    out.push(reward(`other:${o}`, o, null, o.startsWith('탐색 대상') ? 'scanner' : 'upgrade'));
  }
  return out;
}

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
  /** 게임의 스키매틱 전용 아이콘. 해금 목록의 첫 건물 그림을 대신 쓰면 게임과 대조가 안 된다 */
  iconRef: IconRef | null;
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
    list: tech.hub.map((h) => ({
      id: h.id,
      ko: h.ko,
      cost: h.cost,
      iconRef: h.iconRef ?? null,
      unlocks: h.unlocks,
    })),
  };
  const rest = [...new Set(tech.milestones.map((m) => m.tier))]
    .sort((a, b) => a - b)
    .map((n) => ({
      tier: n,
      ko: `티어 ${n}`,
      list: tech.milestones
        .filter((m) => m.tier === n)
        .map((m) => ({
          id: m.id,
          ko: m.ko,
          cost: m.cost,
          iconRef: m.iconRef ?? null,
          unlocks: m.unlocks,
        })),
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
