#!/usr/bin/env node
/**
 * build-app-data.mjs — 원본 정규화 데이터(1단)를 앱이 실제로 쓰는 페이로드(2단)로 변환한다.
 *
 * 입력:  src/data/*.json          (build-data.mjs 산출, en-US)
 *        src/data/ko/*.json       (build-data.mjs --locale=ko 산출, 한국어 표시명)
 *        src/data/curated/*.json  (수기 콘텐츠. 게임 객체는 클래스명으로만 참조)
 * 출력:  src/data/app/*.json      (화면별 최소 필드 + 빌드타임 역인덱스)
 *
 * 결정 근거: docs/adr/0012-data-storage.md, docs/adr/0017-korean-display-names.md
 *
 * 사용법:
 *   node scripts/build-app-data.mjs            # 생성
 *   node scripts/build-app-data.mjs --check    # 최신 여부만 검사 (파일 안 씀, 빌드 게이트)
 *   node scripts/build-app-data.mjs --strict   # 게임 원본 드리프트도 실패로 취급
 *
 * 종료 코드: 0 성공 / 1 입력 없음 / 2 검증 실패 / 3 산출물이 낡음(--check)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/data');
const KO = path.join(SRC, 'ko');
const CURATED = path.join(SRC, 'curated');
const OUT = path.join(SRC, 'app');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const STRICT = argv.includes('--strict');

const log = (...a) => console.log(...a);
const die = (code, msg) => { console.error('\n[실패] ' + msg); process.exit(code); };

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

// ---------------------------------------------------------------- 입력 적재

const need = (p, hint) => {
  const v = readJson(p);
  if (!v) die(1, '입력 파일이 없습니다: ' + path.relative(ROOT, p) + '\n  → ' + hint);
  return v;
};

const en = {
  meta: need(path.join(SRC, 'meta.json'), 'npm run data:game'),
  items: need(path.join(SRC, 'items.json'), 'npm run data:game'),
  recipes: need(path.join(SRC, 'recipes.json'), 'npm run data:game'),
  buildings: need(path.join(SRC, 'buildings.json'), 'npm run data:game'),
  milestones: need(path.join(SRC, 'milestones.json'), 'npm run data:game'),
  schematics: need(path.join(SRC, 'schematics.json'), 'npm run data:game'),
};

const ko = {
  meta: need(path.join(KO, 'meta.json'), 'npm run data:game:ko'),
  items: need(path.join(KO, 'items.json'), 'npm run data:game:ko'),
  recipes: need(path.join(KO, 'recipes.json'), 'npm run data:game:ko'),
  buildings: need(path.join(KO, 'buildings.json'), 'npm run data:game:ko'),
  milestones: need(path.join(KO, 'milestones.json'), 'npm run data:game:ko'),
  schematics: need(path.join(KO, 'schematics.json'), 'npm run data:game:ko'),
};

const byClass = (arr) => new Map(arr.map((x) => [x.className, x]));
const koItems = byClass(ko.items);
const koRecipes = byClass(ko.recipes);
const koBuildings = byClass(ko.buildings);
const koMilestones = byClass(ko.milestones);
const koSchematics = byClass(ko.schematics);

// 한국어 표시명이 없으면 영문으로 폴백하되, 폴백 건수를 센다 (조용한 누락 방지).
let koFallbacks = 0;
const nameKo = (map, x) => {
  const hit = map.get(x.className);
  const v = hit && typeof hit.name === 'string' ? hit.name.trim() : '';
  if (!v) { koFallbacks++; return x.name; }
  return v;
};

// ---------------------------------------------------------------- 변환

const round = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null);

const items = en.items.map((x) => ({
  id: x.className,
  ko: nameKo(koItems, x),
  en: x.name,
  kind: x.kind,
  form: x.form,
  isFluid: !!x.isFluid,
  stackSize: x.stackSize ?? null,
  energyMJ: round(x.energyMJ) || 0,
  sinkPoints: x.sinkPoints ?? 0,
}));

const recipes = en.recipes.map((x) => ({
  id: x.className,
  ko: nameKo(koRecipes, x),
  en: x.name,
  isAlternate: !!x.isAlternate,
  durationSec: round(x.durationSec),
  ingredients: x.ingredients.map((g) => ({ item: g.item, amount: round(g.amount), perMinute: round(g.perMinute) })),
  products: x.products.map((g) => ({ item: g.item, amount: round(g.amount), perMinute: round(g.perMinute) })),
  producedIn: x.producedIn,
  inHandcraft: !!x.inHandcraft,
  isBuildingRecipe: !!x.isBuildingRecipe,
}));

const buildings = en.buildings.map((x) => ({
  id: x.className,
  ko: nameKo(koBuildings, x),
  en: x.name,
  category: x.category,
  buildCost: (x.buildCost ?? []).map((c) => ({ item: c.item, amount: c.amount })),
  powerMW: x.power?.consumptionMW ?? null,
  powerGenMW: x.power?.productionMW ?? null,
  /*
   * 전력이 **가변**인 건물이 있다. 입자 가속기·양자 인코더·변환기는 mPowerConsumption 이 0이고
   * 실제 소비는 레시피마다 달라서 추정 최소/최대에만 들어 있다 (가속기 250~1500 MW).
   * 이걸 버렸더니 후반 전력 추정이 실제의 1/3로 나왔다 — 페이즈 5에서 9.3 GW vs 27.7 GW.
   * 지열 발전기는 노드 순도에 따라 출력이 변해 추정치조차 없다.
   */
  powerMinMW: x.power?.estimatedMinMW ?? null,
  powerMaxMW: x.power?.estimatedMaxMW ?? null,
  /** 전력이 고정값이 아닌가 — 화면에서 범위로 표기해야 한다 */
  powerIsVariable: x.power?.consumptionMW == null && x.power?.estimatedMaxMW != null,
  powerExponent: round(x.power?.consumptionExponent),
  manufacturingSpeed: x.manufacturingSpeed ?? null,
  somersloopSlots: x.somersloopSlots ?? null,
  powerShardSlots: x.powerShardSlots ?? null,
  beltItemsPerMinute: x.beltItemsPerMinute ?? null,
  pipeFlowM3PerMinute: x.pipeFlowM3PerMinute ?? null,
  extraction: x.extraction
    ? { perMinuteAtNormalPurity: round(x.extraction.perMinuteAtNormalPurity), allowedForms: x.extraction.allowedForms }
    : null,
  supplementalToPowerRatio: round(x.supplementalToPowerRatio),
  storageSlots: x.storageSlots ?? null,
  // 배치 도면용 (FRD F13). 게임 충돌 박스 합집합, m 단위
  footprint: x.footprint
    ? {
        // 배치용 = 하드 클리어런스(CT_Default) 합집합. 소프트(굴뚝·안테나)는 건설을 막지 않는다.
        widthM: x.footprint.widthM,
        lengthM: x.footprint.lengthM,
        heightM: x.footprint.heightM,
        // 층고 판단용 = 굴뚝까지 포함한 실제 높이. 기계 위로 벨트를 지나가게 할 때 걸린다.
        visualHeightM: x.footprint.visualHeightM,
        hardBoxes: x.footprint.hardBoxes,
        softBoxes: x.footprint.softBoxes,
        // 복합 클리어런스 건물은 박스 사이가 비어 있다 — 촘촘한 배치에 쓴다
        boxes: x.footprint.boxes,
      }
    : null,
  productionBoostPowerExponent: x.productionBoostPowerExponent ?? null,
}));

const milestones = en.milestones.map((x) => ({
  id: x.className,
  ko: nameKo(koMilestones, x),
  en: x.name,
  tier: x.techTier,
  order: x.menuPriority,
  cost: (x.cost ?? []).map((c) => ({ item: c.item, amount: c.amount })),
  timeToCompleteSec: x.timeToCompleteSec ?? 0,
  unlocksRecipes: x.unlocks?.recipes ?? [],
  unlocksItems: x.unlocks?.items ?? [],
  inventorySlots: x.unlocks?.inventorySlots ?? 0,
}));

// HUB 업그레이드(티어 0 튜토리얼 스키매틱). 마일스톤과 별개 트랙이라 따로 낸다.
const hub = en.schematics
  .filter((x) => x.type === 'tutorial')
  .sort((a, b) => (a.menuPriority ?? 0) - (b.menuPriority ?? 0))
  .map((x) => {
    const k = koSchematics.get(x.className);
    return {
      id: x.className,
      ko: k?.name?.trim() || x.name,
      en: x.name,
      cost: (x.cost ?? []).map((c) => ({ item: c.item, amount: c.amount })),
      unlocksRecipes: x.unlocks?.recipes ?? [],
      inventorySlots: x.unlocks?.inventorySlots ?? 0,
    };
  });

// ---------------------------------------------------------------- 역인덱스

const push = (obj, key, val) => { (obj[key] ??= []).push(val); };

const producedBy = {};   // 아이템 → 이걸 만드는 레시피[]
const consumedBy = {};   // 아이템 → 이걸 재료로 쓰는 레시피[]
const byBuilding = {};   // 건물 → 그 건물에서 도는 레시피[]
for (const r of recipes) {
  for (const p of r.products) push(producedBy, p.item, r.id);
  for (const g of r.ingredients) push(consumedBy, g.item, r.id);
  for (const b of r.producedIn) push(byBuilding, b, r.id);
}

const tiers = {};        // 티어 → 마일스톤[] (게임 메뉴 순서)
for (const m of [...milestones].sort((a, b) => a.tier - b.tier || a.order - b.order)) {
  push(tiers, String(m.tier), m.id);
}

// 레시피 → 이 레시피가 처음 열리는 티어. 마일스톤 외 스키매틱(대체 레시피·MAM 등)도 포함한다.
const unlockTier = {};
for (const s of [...en.schematics].sort((a, b) => a.techTier - b.techTier)) {
  for (const rid of s.unlocks?.recipes ?? []) {
    if (unlockTier[rid] === undefined || s.techTier < unlockTier[rid]) unlockTier[rid] = s.techTier;
  }
}

// 건물 → 처음 해금되는 티어. 건물 레시피(Recipe_Build_*)의 산출물이 건물 디스크립터다.
const descToBuilding = new Map(en.buildings.map((b) => [b.descriptorClass, b.className]));
const buildingUnlockTier = {};
for (const r of en.recipes) {
  if (!r.isBuildingRecipe) continue;
  const t = unlockTier[r.className];
  if (t === undefined) continue;
  for (const p of r.products) {
    const bid = descToBuilding.get(p.item);
    if (!bid) continue;
    if (buildingUnlockTier[bid] === undefined || t < buildingUnlockTier[bid]) buildingUnlockTier[bid] = t;
  }
}
for (const b of buildings) b.unlockTier = buildingUnlockTier[b.id] ?? null;

const index = { producedBy, consumedBy, byBuilding, tiers, unlockTier };

// ---------------------------------------------------------------- 큐레이션 콘텐츠

const curatedFiles = fs.existsSync(CURATED)
  ? fs.readdirSync(CURATED).filter((f) => f.endsWith('.json')).sort()
  : [];
const curated = {};
for (const f of curatedFiles) curated[f.replace(/\.json$/, '')] = readJson(path.join(CURATED, f));

/** 큐레이션 JSON 안에서 게임 클래스명처럼 생긴 문자열을 전부 찾아 존재를 검증한다. */
function collectClassRefs(node, out = []) {
  if (typeof node === 'string') {
    if (/^(Desc_|Build_|Recipe_|Schematic_|BP_)[A-Za-z0-9_]+_C$/.test(node)) out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectClassRefs(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectClassRefs(v, out);
  }
  return out;
}

// ---------------------------------------------------------------- 게임 원본 드리프트 감지

function currentGameFileSha() {
  const f = en.meta?.source?.file;
  if (!f || !fs.existsSync(f)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

const recordedSha = en.meta?.source?.sha256 ?? null;
const liveSha = currentGameFileSha();
const drift = !!(liveSha && recordedSha && liveSha !== recordedSha);

// ---------------------------------------------------------------- 검증

const itemIds = new Set(items.map((x) => x.id));
// ---------------------------------------------------------------- 자원 노드
//
// 노드 좌표 데이터(src/data/resource-nodes.json)는 외부 출처(rockfactory, MIT)이고
// 한글 이름이 게임 이름과 다르다 — '철광석' vs 게임 '철 광석', '캐터리움' vs '카테리움 광석' 등.
// 한글 이름으로 조인하면 조용히 0건이 되어 화면에 "근처에 노드 없음"이 뜬다. 실제로 그랬다.
// 그래서 여기서 **클래스 id(res)로 게임 이름을 다시 붙여** app 산출물을 만든다.
// 아래 검증이 조인 실패를 빌드에서 잡는다.
const rawNodes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/resource-nodes.json'), 'utf8'));
const itemById = new Map(items.map((i) => [i.id, i]));
// 지열은 아이템이 아니라 발전 자원이라 items.json에 없다. 이름만 별도로 준다.
const NON_ITEM_RESOURCE_KO = { Desc_GeothermalEnergy_C: '지열' };
const nodeJoinFailures = [];
const resourceNodes = rawNodes.nodes.map((n) => {
  const item = itemById.get(n.res);
  const ko = item?.ko ?? NON_ITEM_RESOURCE_KO[n.res] ?? null;
  if (!ko) nodeJoinFailures.push(n.res);
  return {
    id: n.id,
    res: n.res,
    ko: ko ?? n.res,
    en: item?.en ?? n.res,
    purity: n.purity,
    type: n.type,
    fx: n.fx,
    fy: n.fy,
    cell: n.cell,
    /** items.json에 없는 자원(지열)은 생산 계획에 쓰지 않는다 */
    isItem: !!item,
  };
});
const nodesByRes = {};
for (const n of resourceNodes) {
  (nodesByRes[n.res] ??= { ko: n.ko, total: 0, impure: 0, normal: 0, pure: 0, minable: 0 });
  const g = nodesByRes[n.res];
  g.total++;
  g[n.purity]++;
  // deposit(광석 무더기)은 채굴기를 올릴 수 없다 — 자동화 계획에서 제외한다
  if (n.type !== 'deposit') g.minable++;
}

const buildingIds = new Set(buildings.map((x) => x.id));
const recipeIds = new Set(recipes.map((x) => x.id));
const knownIds = new Set([...itemIds, ...buildingIds, ...recipeIds, ...en.schematics.map((s) => s.className)]);

const missingRefs = [];
for (const [file, data] of Object.entries(curated)) {
  for (const ref of new Set(collectClassRefs(data))) {
    if (!knownIds.has(ref)) missingRefs.push(file + '.json → ' + ref);
  }
}

const localeMismatch = ['items', 'recipes', 'buildings', 'milestones'].filter((k) => {
  const a = new Set(en[k].map((x) => x.className));
  const b = new Set(ko[k].map((x) => x.className));
  return a.size !== b.size || [...a].some((c) => !b.has(c));
});

const ironPlate = recipes.find((r) => r.id === 'Recipe_IronPlate_C');
const constructor = buildings.find((b) => b.id === 'Build_ConstructorMk1_C');
const beltMk1 = buildings.find((b) => b.id === 'Build_ConveyorBeltMk1_C');
const totalNamed = items.length + recipes.length + buildings.length + milestones.length;

const checks = [
  ['아이템/레시피/건물/마일스톤이 비어있지 않음',
    items.length > 0 && recipes.length > 0 && buildings.length > 0 && milestones.length > 0],
  ['en/ko 클래스 집합 일치', localeMismatch.length === 0,
    () => '불일치 데이터셋: ' + localeMismatch.join(', ')],
  ['한국어 표시명 폴백 5% 미만', koFallbacks < totalNamed * 0.05,
    () => '폴백 ' + koFallbacks + '건 / 전체 ' + totalNamed + '건'],
  ['레시피의 재료·산출 아이템이 모두 존재',
    recipes.every((r) => [...r.ingredients, ...r.products].every((g) => itemIds.has(g.item)))],
  ['레시피의 producedIn 건물이 모두 존재',
    recipes.every((r) => r.producedIn.every((b) => buildingIds.has(b)))],
  ['마일스톤 비용 아이템이 모두 존재',
    milestones.every((m) => m.cost.every((c) => itemIds.has(c.item)))],
  ['마일스톤 언락 레시피가 모두 존재',
    milestones.every((m) => m.unlocksRecipes.every((r) => recipeIds.has(r)))],
  ['큐레이션 콘텐츠의 클래스 참조가 모두 유효', missingRefs.length === 0,
    () => '없는 참조: ' + missingRefs.slice(0, 8).join(' / ')],
  ['역인덱스 키가 실제 아이템 id', Object.keys(producedBy).every((k) => itemIds.has(k))],
  ['회귀 표본 — Iron Plate 20/min', !!ironPlate && ironPlate.products[0]?.perMinute === 20],
  ['회귀 표본 — Constructor 4 MW', !!constructor && constructor.powerMW === 4],
  ['회귀 표본 — 벨트 Mk.1 60/min', !!beltMk1 && beltMk1.beltItemsPerMinute === 60],
  ['티어 인덱스에 8개 이상 티어 존재', Object.keys(tiers).length >= 8],
  ['생산 건물에 치수가 있음 (도면 생성 전제)', (() => {
    const machines = buildings.filter((b) => b.category === 'manufacturer');
    return machines.length > 0 && machines.every((b) => b.footprint && b.footprint.widthM > 0);
  })()],
  ['HUB 업그레이드 5개 이상 + 비용 있음',
    hub.length >= 5 && hub.every((h) => h.cost.length > 0)],
  ['회귀 표본 — 벨트 Mk.2 해금 티어 2 (progression#F)',
    buildings.find((b) => b.id === 'Build_ConveyorBeltMk2_C')?.unlockTier === 2],
  ['회귀 표본 — 채굴기 Mk.2 해금 티어 4 (progression#F)',
    buildings.find((b) => b.id === 'Build_MinerMk2_C')?.unlockTier === 4],
  ['건물 해금 티어가 절반 이상 채워짐',
    buildings.filter((b) => b.unlockTier !== null).length > buildings.length * 0.5],
];

// 자원 노드 조인 검증 — 이름 불일치로 조용히 0건이 되는 사고를 빌드에서 막는다
checks.push(
  ['자원 노드 좌표가 로드됨', resourceNodes.length > 500,
    () => '노드 ' + resourceNodes.length + '개'],
  ['모든 노드가 게임 자원에 연결됨', nodeJoinFailures.length === 0,
    () => '연결 실패: ' + [...new Set(nodeJoinFailures)].join(', ')],
  ['철 광석 노드 이름이 게임 이름과 일치', nodesByRes['Desc_OreIron_C']?.ko === itemById.get('Desc_OreIron_C')?.ko,
    () => '노드 ' + nodesByRes['Desc_OreIron_C']?.ko + ' vs 게임 ' + itemById.get('Desc_OreIron_C')?.ko],
  ['채굴 가능한 철 광석 노드 70개 이상', (nodesByRes['Desc_OreIron_C']?.minable ?? 0) >= 70,
    () => String(nodesByRes['Desc_OreIron_C']?.minable)],
  ['구리·석회석 노드도 연결됨',
    (nodesByRes['Desc_OreCopper_C']?.minable ?? 0) >= 30 && (nodesByRes['Desc_Stone_C']?.minable ?? 0) >= 60,
    () => '구리 ' + nodesByRes['Desc_OreCopper_C']?.minable + ' 석회석 ' + nodesByRes['Desc_Stone_C']?.minable],
  // 채굴기 산출은 도면의 시작점이다. 게임 데이터에서 온 값이 맞는지 못 박는다.
  ['채굴기 Mk.1 60/분 · Mk.2 120/분 · Mk.3 240/분',
    buildings.find((b) => b.id === 'Build_MinerMk1_C')?.extraction?.perMinuteAtNormalPurity === 60 &&
    buildings.find((b) => b.id === 'Build_MinerMk2_C')?.extraction?.perMinuteAtNormalPurity === 120 &&
    buildings.find((b) => b.id === 'Build_MinerMk3_C')?.extraction?.perMinuteAtNormalPurity === 240],
  // 클리어런스 파서 회귀 — Z 오프셋을 무시해 제련기 높이를 4.5로 계산한 버그가 있었다.
  // 공식 위키가 8.5 m로 적고 있어 교차 검증된다.
  ['제련기 높이 8.5 m (박스 Z 오프셋 반영 · 위키와 일치)',
    buildings.find((b) => b.id === 'Build_SmelterMk1_C')?.footprint?.heightM === 8.5,
    () => String(buildings.find((b) => b.id === 'Build_SmelterMk1_C')?.footprint?.heightM)],
  ['제작기 하드 높이 6 m · 굴뚝 포함 8.5 m (소프트 박스는 배치에서 제외)',
    buildings.find((b) => b.id === 'Build_ConstructorMk1_C')?.footprint?.heightM === 6 &&
    buildings.find((b) => b.id === 'Build_ConstructorMk1_C')?.footprint?.visualHeightM === 8.5],
  ['복합 클리어런스 건물의 개별 박스가 보존됨 (정제소)',
    (buildings.find((b) => b.id === 'Build_OilRefinery_C')?.footprint?.boxes?.length ?? 0) >= 2],
  // 가변 전력 건물이 추정 범위를 잃지 않는지. 실제로 잃어서 후반 전력이 1/3로 나온 적이 있다.
  ['입자 가속기 전력 범위 250~1500 MW (가변 전력 보존)',
    buildings.find((b) => b.id === 'Build_HadronCollider_C')?.powerMinMW === 250 &&
    buildings.find((b) => b.id === 'Build_HadronCollider_C')?.powerMaxMW === 1500],
  ['양자 인코더 최대 2000 MW · 변환기 100~400 MW',
    buildings.find((b) => b.id === 'Build_QuantumEncoder_C')?.powerMaxMW === 2000 &&
    buildings.find((b) => b.id === 'Build_Converter_C')?.powerMinMW === 100],
  ['가변 전력 건물이 그렇게 표시된다',
    buildings.filter((b) => b.powerIsVariable).length >= 3,
    () => '가변 표시된 건물 ' + buildings.filter((b) => b.powerIsVariable).length + '개'],
  ['물 추출기 120 m³/분',
    buildings.find((b) => b.id === 'Build_WaterPump_C')?.extraction?.perMinuteAtNormalPurity === 120]
);

log('검증:');
let failed = 0;
for (const [name, ok, detail] of checks) {
  log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) { failed++; if (detail) log('        ' + detail()); }
}

if (drift) {
  const msg = '게임 원본이 바뀌었습니다 (기록 ' + recordedSha.slice(0, 12) + '… ≠ 현재 ' + liveSha.slice(0, 12) + '…)\n' +
    '        → npm run data 로 1단부터 다시 생성하세요.';
  if (STRICT) { log('  FAIL  게임 원본 드리프트 없음'); log('        ' + msg); failed++; }
  else log('  WARN  ' + msg);
} else if (liveSha) {
  log('  PASS  게임 원본 드리프트 없음');
} else {
  log('  SKIP  게임 원본 드리프트 (이 머신에 게임 원본 없음 — 커밋된 데이터를 신뢰)');
}

if (failed) die(2, '검증 ' + failed + '건 실패 — 파일을 쓰지 않고 종료합니다.');

// ---------------------------------------------------------------- 출력

const meta = {
  $comment: 'scripts/build-app-data.mjs 산출물입니다. 직접 수정하지 마세요. (docs/adr/0012)',
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-app-data.mjs',
  game: {
    steamBuildId: en.meta?.source?.steamBuildId ?? null,
    sourceSha256: recordedSha,
    localeSourceSha256: ko.meta?.source?.sha256 ?? null,
    generatedAt: en.meta?.generatedAt ?? null,
  },
  counts: {
    items: items.length,
    recipes: recipes.length,
    alternateRecipes: recipes.filter((r) => r.isAlternate).length,
    buildings: buildings.length,
    milestones: milestones.length,
    hubUpgrades: hub.length,
    curatedFiles: curatedFiles.length,
    resourceNodes: resourceNodes.length,
  },
  conventions: en.meta?.conventions ?? {},
};

const outputs = {
  'meta.json': meta,
  'items.json': items,
  'recipes.json': recipes,
  'buildings.json': buildings,
  'milestones.json': milestones,
  'hub.json': hub,
  'index.json': index,
  'resource-nodes.json': { $source: rawNodes.$source, $transform: rawNodes.$transform, $counts: nodesByRes, nodes: resourceNodes },
};

// meta는 생성 시각이 매번 바뀌므로 최신성 비교에서 제외한다.
const stableKey = (name, value) =>
  name === 'meta.json' ? JSON.stringify({ ...value, generatedAt: null }) : JSON.stringify(value);

if (CHECK) {
  const stale = [];
  for (const [name, value] of Object.entries(outputs)) {
    const cur = readJson(path.join(OUT, name));
    if (!cur) { stale.push(name + ' (없음)'); continue; }
    if (stableKey(name, cur) !== stableKey(name, value)) stale.push(name);
  }
  if (stale.length) die(3, '앱 데이터가 낡았습니다: ' + stale.join(', ') + '\n  → npm run data 를 실행하세요.');
  log('\n--check: 앱 데이터가 최신입니다. 파일을 쓰지 않았습니다.');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
log('');
for (const [name, value] of Object.entries(outputs)) {
  const text = JSON.stringify(value);
  fs.writeFileSync(path.join(OUT, name), text);
  log('  wrote src/data/app/' + name + ' (' + Math.round(text.length / 1024) + 'KB)');
}

log('\n집계: items=' + items.length + ' recipes=' + recipes.length + ' (alt=' + meta.counts.alternateRecipes + ') ' +
  'buildings=' + buildings.length + ' milestones=' + milestones.length + ' 큐레이션=' + curatedFiles.length + '개');
if (koFallbacks) log('한국어 표시명 폴백: ' + koFallbacks + '건 (영문으로 대체)');
log('완료.');
