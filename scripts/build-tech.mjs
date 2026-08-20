/**
 * build-tech.mjs — 게임의 **테크 전체**를 한 파일로 정리한다.
 *
 * 왜: 마일스톤·MAM·어썸 싱크 상점·하드 드라이브가 각각 다른 곳에 흩어져 있어서,
 * "이건 언제 열리나"를 물을 때마다 다시 뒤져야 했다. 실제로 그러다 여러 번 틀렸다
 * (석탄 발전을 초반에 두고, 고체 바이오 연료를 허브 단계에 넣고, 오버클럭을 티어 4 라고 했다).
 * 진행도와 상관없이 전부 볼 수 있게 해 두면 그런 실수가 안 난다.
 *
 * MAM 선행 관계: 배포 데이터의 `mSchematicDependencies` 가 **전부 비어 있다**(120/120).
 * 대신 클래스명이 `Research_<트리>_<행>[_<열>]_C` 규칙을 지키므로 거기서 트리와 깊이를 뽑는다.
 * 추정이라는 것을 데이터에 표시한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const schematics = read('src/data/schematics.json');
const list = Array.isArray(schematics) ? schematics : Object.values(schematics)[0];
const items = read('src/data/app/items.json');
const buildings = read('src/data/app/buildings.json');
const recipes = read('src/data/app/recipes.json');
/** 한글 이름은 로케일 산출물에 있다. 영문 이름을 그대로 화면에 올리지 않는다 */
const koList = (() => {
  const d = read('src/data/ko/schematics.json');
  return Array.isArray(d) ? d : Object.values(d).find(Array.isArray) ?? [];
})();
const koName = new Map(koList.map((s2) => [s2.className, s2.name]));
const nameOf = (s2) => koName.get(s2.className) || s2.name || s2.className;

/**
 * 스키매틱 아이콘 텍스처 → 앱이 실제로 걸 수 있는 그림 파일.
 *
 * 게임은 스키매틱마다 아이콘 텍스처 이름을 하나 갖는다(`mSchematicIcon`). 두 부류다:
 *   - `TXUI_SIcon_*` / `SchematicIcon_*` — 허브·마일스톤 전용 스키매틱 아이콘.
 *     공식 위키가 `Schematic_Icon_*.png` 로 갖고 있어 따로 받아 둔다(fetch-schematic-icons.mjs).
 *   - `IconDesc_*` 등 — 그냥 아이템·건물 아이콘이다. 이미 받아 둔 것을 그대로 가리키면 된다.
 * 그래서 텍스처 이름을 {dir, id} 로 풀어 tech.json 에 박아 둔다. 화면은 이름을 다시 추측하지 않는다.
 */
const rawItems = read('src/data/items.json');
/*
 * 같은 그림인데 해상도 꼬리표가 다르다 — 스키매틱은 `IconDesc_Mycelia_64`,
 * 아이템의 mSmallIcon 은 `IconDesc_Mycelia_256` 이다. 꼬리표(숫자 조각)와 대소문자를
 * 지우고 맞춘다. 그냥 문자열로 비교했더니 MAM 120건 중 105건이 빗나갔다.
 */
const texKey = (t) =>
  String(t ?? '')
    .split('.')
    .pop()
    .toLowerCase()
    .replace(/_\d+(?=$|_)/g, '')
    .replace(/_+/g, '_');
const textureToItem = new Map();
for (const it of rawItems) {
  const tex = texKey(it.icon);
  if (tex && !textureToItem.has(tex)) textureToItem.set(tex, it);
}
const buildingIds = new Set(buildings.map((b) => b.id));
const appItemIds = new Set(items.map((i) => i.id));

function iconRefOf(texture) {
  if (!texture) return null;
  if (/^(TXUI_SIcon_|SchematicIcon_)/.test(texture)) return { dir: 'schematics', id: texture };
  const it = textureToItem.get(texKey(texture));
  if (!it) return null;
  if (it.kind === 'building-descriptor') {
    const bid = it.className.replace(/^Desc_/, 'Build_');
    return buildingIds.has(bid) ? { dir: 'buildings-png', id: bid } : null;
  }
  return appItemIds.has(it.className) ? { dir: 'items', id: it.className } : null;
}

const itemById = new Map(items.map((i) => [i.id, i]));
const recipeById = new Map(recipes.map((r) => [r.id, r]));
/** 레시피 → 그 레시피가 만드는 건물 */
const buildingByRecipe = new Map();
for (const b of buildings) buildingByRecipe.set(`Recipe_${b.id.replace(/^Build_/, '')}`, b);

const ko = (id) => itemById.get(id)?.ko ?? id;
const cost = (c) => (c ?? []).map((x) => ({ item: x.item, ko: ko(x.item), amount: x.amount }));

/** 이 연구가 무엇을 열어 주는가 — 사람이 읽을 이름으로 */
function unlocksOf(s) {
  const out = { buildings: [], recipes: [], items: [], slots: 0, other: [] };
  const u = s.unlocks ?? {};
  for (const rid of u.recipes ?? []) {
    const b = buildingByRecipe.get(rid);
    if (b) {
      out.buildings.push({ id: b.id, ko: b.ko });
      continue;
    }
    const r = recipeById.get(rid);
    if (r) {
      const p = r.products[0];
      out.recipes.push({
        id: rid,
        ko: (r.ko || r.en || rid).replace(/^(대체|Alternate):\s*/i, ''),
        isAlternate: /^Alternate:/i.test(r.en ?? ''),
        /*
         * 만드는 물건의 **id** 까지 남긴다. 보상 칸이 게임처럼 그림으로 나오려면
         * 이름이 아니라 클래스명이 있어야 한다 — 이게 없어서 「휴대용 채굴기」 같은
         * 손 제작 보상이 화면에서 통째로 빠져 있었다.
         */
        makes: p
          ? { id: p.item, ko: ko(p.item), perMinute: p.perMinute, kind: itemById.get(p.item)?.kind ?? null }
          : null,
      });
    }
  }
  for (const iid of u.items ?? []) out.items.push({ id: iid, ko: ko(iid), kind: itemById.get(iid)?.kind ?? null });
  out.slots = u.inventorySlots ?? 0;
  if ((u.armSlots ?? 0) > 0) out.other.push(`장비 슬롯 +${u.armSlots}`);
  if ((u.scannables ?? []).length) out.other.push(`탐색 대상 ${u.scannables.length}종`);
  return out;
}

// ────────────────────────────────────────────────── 마일스톤
const milestones = list
  .filter((s) => s.type === 'milestone')
  .map((s) => ({
    id: s.className,
    ko: nameOf(s),
    tier: s.techTier,
    cost: cost(s.cost),
    seconds: s.timeToCompleteSec ?? 0,
    icon: s.icon ?? null,
    iconRef: iconRefOf(s.icon),
    unlocks: unlocksOf(s),
  }))
  .sort((a, b) => a.tier - b.tier || a.ko.localeCompare(b.ko, 'ko'));

// ────────────────────────────────────────────────── 허브 업그레이드
const hub = list
  .filter((s) => s.type === 'tutorial')
  .map((s) => ({
    id: s.className,
    ko: nameOf(s),
    order: Number((s.className.match(/(\d+)/) ?? [, 0])[1]),
    cost: cost(s.cost),
    icon: s.icon ?? null,
    iconRef: iconRefOf(s.icon),
    unlocks: unlocksOf(s),
  }))
  .sort((a, b) => a.order - b.order);

// ────────────────────────────────────────────────── MAM
/**
 * 트리 이름을 한국어로. 게임 안에서 MAM 이 실제로 쓰는 분류다.
 * 트리를 열려면 그 트리의 표본을 주워 스캔해야 한다 — 그 표본도 적는다.
 */
/*
 * 게임 화면의 실제 트리 목록. 내부 클래스명 접두사로 나누면 안 된다 —
 * 「외계 거대생물」 한 트리가 ACarapace·AO·AOrgans·AOrganisms 네 접두사로 흩어져 있어서,
 * 그대로 쓰면 게임에 없는 트리 네 개가 생긴다.
 */
const TREE_DEF = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/curated/mam-trees.json'), 'utf8')
).trees;
/** 접두사 → 트리 키 */
const TREE_OF = new Map();
for (const t of TREE_DEF) for (const pre of t.prefixes) TREE_OF.set(pre, t.key);

const mam = [];
for (const s of list.filter((x) => x.type === 'mam')) {
  /*
   * 클래스명 규칙이 한 가지가 아니다:
   *   Research_Quartz_1_2_C  ·  Research_Sulfur_RocketFuel_C  ·  Research_XMas_4-2_C
   * 트리는 첫 알파벳 조각이고, 나머지에서 숫자가 나오면 깊이로 쓴다.
   */
  const m = (s.className ?? '').match(/^Research_([A-Za-z]+)_(.+)_C$/);
  const prefix = m?.[1] ?? '기타';
  const tree = TREE_OF.get(prefix) ?? '기타';
  const rest = m?.[2] ?? '';
  const nums = rest.match(/\d+/g) ?? [];
  mam.push({
    id: s.className,
    ko: nameOf(s),
    /* 영문 이름이 있어야 위키의 선행 관계표와 맞출 수 있다 */
    en: s.name,
    tree,
    treeKo: TREE_DEF.find((t) => t.key === tree)?.ko ?? tree,
    /** 클래스명 접두사. 같은 트리 안에서 갈래를 구분하는 데 쓴다 */
    branch: prefix,
    /** 클래스명에서 뽑은 번호. 깊이는 parents 로 다시 계산하므로 참고용이다 */
    row: nums.length ? Number(nums[0]) : 99,
    col: nums.length > 1 ? Number(nums[1]) : 1,
    cost: cost(s.cost),
    seconds: s.timeToCompleteSec ?? 0,
    icon: s.icon ?? null,
    iconRef: iconRefOf(s.icon),
    unlocks: unlocksOf(s),
    discontinued: /^Discontinued|중단/i.test(`${s.name ?? ''}${nameOf(s)}`),
  });
}
/*
 * 선행 관계를 되살린다.
 *
 * 게임 배포 데이터의 mSchematicDependencies 는 MAM 122건이 전부 비어 있다 —
 * 선행 관계가 블루프린트 자산 안에만 있고 Docs.json 으로 안 나온다.
 * 그런데 클래스명이 경로다: Research_Caterium_4_1_2_C 는 Research_Caterium_4_1_C 의 자식이다.
 * 거기서 뽑고, 이름에 숫자 경로가 없는 것(외계 기술 전체 등)만 큐레이션 보정표로 채운다.
 */
const MAM_LINKS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/data/curated/mam-links.json'), 'utf8')
);
{
  const ids = new Set(mam.map((m) => m.id));
  const parentFromName = (id) => {
    const m = id.match(/^Research_([A-Za-z]+)_(.+)_C$/);
    if (!m) return [];
    const [, tree, rest] = m;
    const segs = rest.split('_');
    if (!segs.every((x) => /^\d+$/.test(x))) return [];
    /* 마지막 조각을 하나씩 떼어 실제로 있는 조상을 찾는다 */
    for (let cut = segs.length - 1; cut >= 1; cut--) {
      const cand = `Research_${tree}_${segs.slice(0, cut).join('_')}_C`;
      if (ids.has(cand)) return [cand];
    }
    /* 본줄기는 앞 번호가 부모다 */
    for (let k = Number(segs[0]) - 1; k >= 0; k--) {
      const cand = `Research_${tree}_${k}_C`;
      if (ids.has(cand)) return [cand];
    }
    return [];
  };
  let curated = 0;
  for (const n of mam) {
    const fix = MAM_LINKS.links[n.id];
    if (fix) {
      n.parents = fix.filter((x) => ids.has(x));
      curated++;
    } else {
      n.parents = parentFromName(n.id);
    }
  }
  const orphan = mam.filter((n) => n.parents.length === 0).length;
  console.log(
    `MAM 선행 관계: 클래스명 ${mam.length - curated}건 · 보정표 ${curated}건 · 뿌리 ${orphan}건`
  );
}

mam.sort((a, b) => a.treeKo.localeCompare(b.treeKo, 'ko') || a.row - b.row || a.col - b.col);

const mamTrees = TREE_DEF.map((t) => ({
  key: t.key,
  ko: t.ko,
  en: t.en,
  opens: t.opens,
  ...(t.lockedKo ? { lockedKo: t.lockedKo } : {}),
  ...(t.event ? { event: true } : {}),
  ...(t.link ? { link: t.link } : {}),
  ...(t.note ? { note: t.note } : {}),
  count: mam.filter((x) => x.tree === t.key).length,
}));

/* 어느 트리에도 못 들어간 연구가 있으면 조용히 사라지므로 빌드를 세운다 */
{
  const orphan = mam.filter((m) => m.tree === '기타');
  if (orphan.length) {
    console.error(
      '[실패] 트리를 못 찾은 MAM 연구: ' + orphan.map((m) => m.id).join(', ') +
        '\n  → src/data/curated/mam-trees.json 의 prefixes 에 추가하세요.'
    );
    process.exit(3);
  }
}

// ────────────────────────────────────────────────── 어썸 싱크 상점
const shop = list
  .filter((s) => s.type === 'awesome-shop')
  .map((s) => ({
    id: s.className,
    ko: nameOf(s),
    /* 영문 이름이 있어야 위키의 상점 분류표와 맞출 수 있다 */
    en: s.name,
    coupons: (s.cost ?? []).find((c) => /Coupon/i.test(c.item))?.amount ?? 0,
    icon: s.icon ?? null,
    iconRef: iconRefOf(s.icon),
    unlocks: unlocksOf(s),
  }))
  .sort((a, b) => a.coupons - b.coupons || a.ko.localeCompare(b.ko, 'ko'));

// ────────────────────────────────────────────────── 산출
const out = {
  $comment:
    '게임 테크 전체. scripts/build-tech.mjs 산출물이며 직접 수정하지 않는다. ' +
    'MAM 선행 관계는 배포 데이터에 없어(120/120 비어 있음) 클래스명에서 트리와 깊이를 뽑았다.',
  $counts: {
    hub: hub.length,
    milestones: milestones.length,
    mam: mam.length,
    shop: shop.length,
  },
  hub,
  milestones,
  mamTrees,
  mam,
  shop,
};
fs.writeFileSync(path.join(ROOT, 'src/data/app/tech.json'), JSON.stringify(out) + '\n');
console.log(
  `테크 사전: 허브 ${hub.length} · 마일스톤 ${milestones.length} · MAM ${mam.length}(트리 ${mamTrees.length}) · 상점 ${shop.length}`
);
console.log('MAM 트리:', mamTrees.map((t) => `${t.ko}(${t.count})`).join(' · '));
