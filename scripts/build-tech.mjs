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
        makes: p ? { ko: ko(p.item), perMinute: p.perMinute } : null,
      });
    }
  }
  for (const iid of u.items ?? []) out.items.push({ id: iid, ko: ko(iid) });
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
    unlocks: unlocksOf(s),
  }))
  .sort((a, b) => a.order - b.order);

// ────────────────────────────────────────────────── MAM
/**
 * 트리 이름을 한국어로. 게임 안에서 MAM 이 실제로 쓰는 분류다.
 * 트리를 열려면 그 트리의 표본을 주워 스캔해야 한다 — 그 표본도 적는다.
 */
const TREE_KO = {
  Quartz: { ko: '석영', opens: '석영 원석을 주워 스캔' },
  Caterium: { ko: '카테리움', opens: '카테리움 광석을 주워 스캔' },
  Sulfur: { ko: '황', opens: '황을 주워 스캔' },
  PowerSlugs: { ko: '파워 슬러그', opens: '파워 슬러그를 주워 스캔' },
  Mycelia: { ko: '균사', opens: '균사를 주워 스캔' },
  ACarapace: { ko: '외계 등껍질', opens: '호그를 처치하고 등껍질 획득' },
  AOrgans: { ko: '외계 기관', opens: '스피터를 처치하고 기관 획득' },
  AO: { ko: '외계 생물', opens: '외계 생물 표본 획득' },
  AOrganisms: { ko: '외계 유기체', opens: '외계 유기체 표본 획득' },
  Nutrients: { ko: '영양분', opens: '식용 식물을 주워 스캔' },
  Alien: { ko: '외계 기술', opens: '소머슬룹 또는 머서 구체 획득' },
  XMas: { ko: 'FICSMAS', opens: '기간 한정 이벤트' },
};

const mam = [];
for (const s of list.filter((x) => x.type === 'mam')) {
  /*
   * 클래스명 규칙이 한 가지가 아니다:
   *   Research_Quartz_1_2_C  ·  Research_Sulfur_RocketFuel_C  ·  Research_XMas_4-2_C
   * 트리는 첫 알파벳 조각이고, 나머지에서 숫자가 나오면 깊이로 쓴다.
   */
  const m = (s.className ?? '').match(/^Research_([A-Za-z]+)_(.+)_C$/);
  const tree = m?.[1] ?? '기타';
  const rest = m?.[2] ?? '';
  const nums = rest.match(/\d+/g) ?? [];
  mam.push({
    id: s.className,
    ko: nameOf(s),
    tree,
    treeKo: TREE_KO[tree]?.ko ?? tree,
    /** 클래스명에서 뽑은 깊이. 배포 데이터에 선행 관계가 없어 이것으로 순서를 세운다 */
    row: nums.length ? Number(nums[0]) : 99,
    col: nums.length > 1 ? Number(nums[1]) : 1,
    cost: cost(s.cost),
    seconds: s.timeToCompleteSec ?? 0,
    unlocks: unlocksOf(s),
    discontinued: /^Discontinued|중단/i.test(`${s.name ?? ''}${nameOf(s)}`),
  });
}
mam.sort((a, b) => a.treeKo.localeCompare(b.treeKo, 'ko') || a.row - b.row || a.col - b.col);

const mamTrees = [...new Set(mam.map((x) => x.tree))].map((t) => ({
  key: t,
  ko: TREE_KO[t]?.ko ?? t,
  opens: TREE_KO[t]?.opens ?? '표본 획득 조건 미확인',
  count: mam.filter((x) => x.tree === t).length,
}));

// ────────────────────────────────────────────────── 어썸 싱크 상점
const shop = list
  .filter((s) => s.type === 'awesome-shop')
  .map((s) => ({
    id: s.className,
    ko: nameOf(s),
    coupons: (s.cost ?? []).find((c) => /Coupon/i.test(c.item))?.amount ?? 0,
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
