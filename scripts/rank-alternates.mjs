/**
 * rank-alternates.mjs — 대체 제작법을 **1.2 게임 데이터로 직접 계산해** 등급을 매긴다.
 *
 * 왜 직접 계산하는가:
 *   웹에서 찾은 순위 두 건은 모두 1.2 기준이 아니다(1.0 · 2025-08 미명시). 그리고 서로 크게
 *   엇갈린다 — 104건 중 두 등급 이상 벌어진 것이 46건이다. 남의 순위를 옮겨 적는 것만으로는
 *   "지금 버전에서 무엇이 좋은가"에 답할 수 없다.
 *
 * 무엇을 재는가:
 *   우주 엘리베이터 페이즈 1~5 를 **전부 납품하는 데 드는 총량**을 기준으로 잡는다.
 *   그것이 이 게임의 끝이고, 초반만 보고 고른 대체 제작법이 후반에 발목을 잡는 일이 흔하기 때문이다.
 *   기본 제작법만으로 한 번 풀고(기준선), 대체 제작법을 하나씩 끼워 다시 푼 뒤 차이를 본다.
 *
 * 무엇으로 가중하는가:
 *   ① 원자재 — **실제 맵의 노드 수**로 가중한다. 순도별 개수가 데이터에 있으므로
 *      "이 자원이 이 맵에 얼마나 있는가"를 추정할 수 있다. 우라늄 6개와 철 70여 개를
 *      같은 1톤으로 셈하면 안 된다.
 *   ② 기계 수 — 지어야 할 기계가 줄면 그만큼 시간과 자재가 준다.
 *   ③ 전력 — 발전 설비도 결국 자원이다.
 *
 * 한계(숨기지 않는다):
 *   - 페이즈 요구량은 게임 배포 데이터에 없다. 공식 위키에서 옮겼다.
 *   - 대체 제작법을 하나씩만 끼워 본다. 여러 개를 함께 썼을 때의 상호작용은 재지 않는다.
 *   - 부산물을 다른 공정에 되먹이는 최적화는 하지 않는다. 순환 레시피는 계산에서 제외하고 표시한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'src/data/app');
const read = (n) => JSON.parse(fs.readFileSync(path.join(APP, n), 'utf8'));

const items = read('items.json');
const recipes = read('recipes.json');
const buildings = read('buildings.json');
const nodes = read('resource-nodes.json');

const itemById = new Map(items.map((i) => [i.id, i]));
const buildingById = new Map(buildings.map((b) => [b.id, b]));
const recipeById = new Map(recipes.map((r) => [r.id, r]));
const isAlt = (r) => /^Alternate:/i.test(r.en || '');
const ko = (id) => itemById.get(id)?.ko ?? id;

// ────────────────────────────────────────────────── 끝점: 우주 엘리베이터 페이즈 1~5
/**
 * 출처: 공식 위키 Space Elevator (1× 배수). 게임 배포 데이터에는 없다.
 * https://satisfactory.wiki.gg/wiki/Space_Elevator
 */
const ENDGAME = [
  ['Desc_SpaceElevatorPart_1_C', 50 + 1000], // 지능형 도금판
  ['Desc_SpaceElevatorPart_2_C', 1000 + 2500], // 다목적 골조
  ['Desc_SpaceElevatorPart_3_C', 100], // 자동 배선
  ['Desc_SpaceElevatorPart_4_C', 500], // 모듈식 엔진
  ['Desc_SpaceElevatorPart_5_C', 100], // 적응형 제어 장치
  ['Desc_SpaceElevatorPart_6_C', 500], // 조립 감독 시스템
  ['Desc_SpaceElevatorPart_7_C', 500], // 자기장 발생기
  ['Desc_SpaceElevatorPart_8_C', 250], // 열추진 로켓
  ['Desc_SpaceElevatorPart_9_C', 100 + 1000], // 핵 파스타
  ['Desc_SpaceElevatorPart_10_C', 1000], // 생화학 조각기
  ['Desc_SpaceElevatorPart_11_C', 256], // AI 확장 서버
  ['Desc_SpaceElevatorPart_12_C', 200], // 탄도 워프 드라이브
].filter(([id]) => itemById.has(id));

// ────────────────────────────────────────────────── 자원 희소도
/**
 * 맵에 실제로 있는 양으로 가중한다. 순도 배율(불순 0.5 / 보통 1 / 순수 2)은 위키 검증치다.
 * 채굴기 등급은 상수라 상대 비교에서 상쇄되므로 곱하지 않는다.
 */
const PURITY = { impure: 0.5, normal: 1, pure: 2 };
const capacity = new Map();
for (const [id, c] of Object.entries(nodes.$counts ?? {})) {
  const cap =
    (c.impure ?? 0) * PURITY.impure + (c.normal ?? 0) * PURITY.normal + (c.pure ?? 0) * PURITY.pure;
  if (cap > 0) capacity.set(id, cap);
}
/** 가장 흔한 자원을 1 로 두고, 귀한 자원일수록 큰 값을 갖는다 */
const maxCap = Math.max(...capacity.values());
const scarcity = (id) => {
  const cap = capacity.get(id);
  if (!cap) return 1; // 노드가 없는 자원(물 등 무한에 가까운 것 포함) — 중립
  return maxCap / cap;
};

// ────────────────────────────────────────────────── 레시피 선택
const defaultFor = new Map();
for (const r of recipes) {
  if (r.isBuildingRecipe || r.producedIn.length === 0 || isAlt(r)) continue;
  if (/^Recipe_Unpackage/i.test(r.id)) continue;
  /*
   * **주산물만** 본다. 부산물을 생산 경로로 잡으면 없는 순환이 생긴다 —
   * 합성 동력 조각이 암흑 물질 잔여물을 부산물로 내는데 그것을 "잔여물을 만드는 법"으로
   * 집으면, 잔여물 → 수정 → 잔여물 고리가 생겨 계산이 통째로 멈춘다.
   */
  const primary = r.products[0];
  if (!primary || itemById.get(primary.item)?.kind === 'resource') continue;
  if (!defaultFor.has(primary.item)) defaultFor.set(primary.item, r);
}

/** 기계 한 대의 '크기' — 입출력 가짓수로 어림한다. 제조기 한 대는 제작기 여러 대만큼 비싸다 */
const machineWeight = (r) => r.ingredients.length + r.products.length;

/**
 * 바구니를 만드는 데 드는 총량을 푼다.
 * @param {Map<string,object>} recipeFor 아이템 → 쓸 레시피
 */
function solve(recipeFor) {
  const raw = new Map();
  let machines = 0;
  let machineScaled = 0;
  let power = 0;
  const visiting = new Set();
  let cyclic = false;
  let cyclePath = null;

  const walk = (itemId, amount) => {
    if (cyclic) return;
    const it = itemById.get(itemId);
    if (!it || it.kind === 'resource' || !recipeFor.has(itemId)) {
      raw.set(itemId, (raw.get(itemId) ?? 0) + amount);
      return;
    }
    if (visiting.has(itemId)) {
      cyclic = true;
      if (!cyclePath) cyclePath = [...visiting, itemId].map(ko);
      return;
    }
    visiting.add(itemId);
    const r = recipeFor.get(itemId);
    const out = r.products.find((p) => p.item === itemId);
    const runs = amount / out.amount;
    /* 기계 수는 '동시에 몇 대'가 아니라 '총 가동량'의 비례값이다. 상대 비교에만 쓴다 */
    machines += runs * r.durationSec;
    machineScaled += runs * r.durationSec * machineWeight(r);
    const b = buildingById.get(r.producedIn[0]);
    power += runs * r.durationSec * (b?.powerMW ?? b?.powerMaxMW ?? 0);
    for (const g of r.ingredients) walk(g.item, g.amount * runs);
    visiting.delete(itemId);
  };

  for (const [id, qty] of ENDGAME) walk(id, qty);
  if (cyclic) return { cyclePath };

  let resourceScore = 0;
  for (const [id, amt] of raw) {
    if (itemById.get(id)?.kind !== 'resource') continue;
    resourceScore += amt * scarcity(id);
  }
  return { raw, machines, machineScaled, power, resourceScore };
}

const baseline = solve(defaultFor);
if (baseline?.cyclePath) {
  const p = baseline.cyclePath;
  const at = p.lastIndexOf(p[p.length - 1]);
  console.error('[실패] 기본 제작법에 순환이 있습니다:');
  console.error('   ' + p.slice(Math.max(0, at - 6)).join(' → '));
  process.exit(2);
}
if (!baseline) {
  console.error('[실패] 기본 제작법만으로도 순환이 생깁니다. 계산을 신뢰할 수 없습니다.');
  process.exit(2);
}

console.log('기준선 (기본 제작법만, 페이즈 1~5 전량):');
const topRaw = [...baseline.raw]
  .filter(([id]) => itemById.get(id)?.kind === 'resource')
  .sort((a, b) => b[1] - a[1]);
for (const [id, amt] of topRaw.slice(0, 8)) {
  console.log(`   ${ko(id).padEnd(12)} ${Math.round(amt).toLocaleString()}개  (희소도 ×${scarcity(id).toFixed(2)})`);
}

// ────────────────────────────────────────────────── 인게임 편의성
/**
 * 효율만으로는 순위가 안 나온다. 커뮤니티 순위 두 곳이 크게 갈리는 이유가 여기 있다 —
 * 한쪽(LP 모형)은 전체 생산망의 효율만 보고, 다른 쪽(스팀 가이드)은 "짓기 번거로운가"를
 * 크게 본다. 번거로움은 취향이 아니라 셀 수 있는 것이다.
 *
 * 손이 더 가는 것들:
 *   ① 재료 가짓수 — 기계 하나에 벨트를 몇 줄 넣어야 하는가. 입력은 최대 4줄이다.
 *   ② 유체 — 파이프는 벨트보다 손이 많이 간다(양정·펌프·접합부·공기 갇힘).
 *   ③ 부산물 — 처리하지 않으면 라인이 멈춘다. 싱크로 빼든 되먹이든 배관이 는다.
 *   ④ 새 자원 도입 — 노드를 새로 잡고 거기까지 벨트를 끌어야 한다.
 *   ⑤ 기계 등급 — 제조기는 조립기보다, 조립기는 제작기보다 크고 전력을 먹는다.
 *
 * 기본 제작법 대비 **얼마나 더 번거로워지는가**를 재고, 줄어들면 양수가 되게 부호를 맞춘다.
 */
const FLUID = new Set(
  items.filter((i) => i.form === 'liquid' || i.form === 'gas').map((i) => i.id)
);
const MACHINE_RANK = {
  Build_ConstructorMk1_C: 1,
  Build_SmelterMk1_C: 1,
  Build_AssemblerMk1_C: 2,
  Build_FoundryMk1_C: 2,
  Build_OilRefinery_C: 3,
  Build_Packager_C: 2,
  Build_ManufacturerMk1_C: 4,
  Build_Blender_C: 4,
  Build_HadronCollider_C: 5,
  Build_Converter_C: 4,
  Build_QuantumEncoder_C: 5,
};

function hassle(r) {
  const inputs = r.ingredients.length;
  const fluids = r.ingredients.filter((g) => FLUID.has(g.item)).length;
  const byproducts = Math.max(0, r.products.length - 1);
  const rank = MACHINE_RANK[r.producedIn[0]] ?? 2;
  /* 가중치는 판단이다. 유체 한 줄이 고체 두 줄만큼, 부산물 하나가 유체 한 줄만큼 번거롭다고 본다 */
  return inputs + fluids * 2 + byproducts * 2 + rank;
}

/** 그 레시피가 기본 제작법에 없던 자원을 새로 끌어오는가 */
function newResources(alt, std) {
  const reach = (r, depth = 0, seen = new Set()) => {
    if (depth > 12) return seen;
    for (const g of r.ingredients) {
      const it = itemById.get(g.item);
      if (!it) continue;
      if (it.kind === 'resource') seen.add(g.item);
      else {
        const nr = defaultFor.get(g.item);
        if (nr && !seen.has(g.item)) reach(nr, depth + 1, seen);
      }
    }
    return seen;
  };
  const a = reach(alt);
  const b = reach(std);
  return [...a].filter((k) => !b.has(k)).length;
}

// ────────────────────────────────────────────────── 대체 제작법을 하나씩 끼워 본다
const alts = recipes.filter(isAlt);
const results = [];
const skipped = [];

for (const a of alts) {
  const target = a.products[0]?.item;
  if (!target || !defaultFor.has(target)) {
    skipped.push({ id: a.id, why: '기본 제작법이 없어 비교 대상이 없음' });
    continue;
  }
  const swapped = new Map(defaultFor);
  swapped.set(target, a);
  const r = solve(swapped);
  if (!r || r.cyclePath) {
    skipped.push({ id: a.id, why: '순환 공정이 생겨 계산에서 제외' });
    continue;
  }
  /* 줄어들면 양수가 되도록 부호를 맞춘다 */
  const d = (k) => ((baseline[k] - r[k]) / baseline[k]) * 100;
  const std = defaultFor.get(target);
  const hassleDelta = hassle(a) - hassle(std);
  const added = newResources(a, std);
  results.push({
    id: a.id,
    ko: (a.ko || a.en).replace(/^(대체|Alternate):\s*/i, ''),
    en: (a.en || '').replace(/^Alternate:\s*/i, ''),
    resourcePct: Math.round(d('resourceScore') * 100) / 100,
    machinePct: Math.round(d('machineScaled') * 100) / 100,
    powerPct: Math.round(d('power') * 100) / 100,
    /* 번거로움 상세 — 왜 편의 점수가 그렇게 나왔는지 화면에서 설명하기 위해 남긴다 */
    hassleDelta: hassleDelta + added * 1.5,
    hassleWhy: {
      inputs: a.ingredients.length - std.ingredients.length,
      fluids:
        a.ingredients.filter((g) => FLUID.has(g.item)).length -
        std.ingredients.filter((g) => FLUID.has(g.item)).length,
      byproducts: Math.max(0, a.products.length - 1) - Math.max(0, std.products.length - 1),
      machineStep: (MACHINE_RANK[a.producedIn[0]] ?? 2) - (MACHINE_RANK[std.producedIn[0]] ?? 2),
      newResources: added,
    },
  });
}

/**
 * 점수 = 자원 절감 × 3 + 기계 절감 × 2 + 전력 절감 × 1
 *
 * 자원을 가장 무겁게 두는 이유: 맵의 노드는 유한하고 늘릴 수 없다. 기계와 전력은
 * 자원만 있으면 늘릴 수 있다. 이 가중치는 판단이며, 바꾸면 순위도 바뀐다 — 그래서 적어 둔다.
 */
const W = { resource: 3, machine: 2, power: 1, hassle: 2.5 };
for (const r of results) {
  /* 효율 축 — 남의 LP 모형이 보는 것과 같은 축이다 */
  r.efficiency =
    Math.round((r.resourcePct * W.resource + r.machinePct * W.machine + r.powerPct * W.power) * 100) / 100;
  /* 편의 축 — 스팀 가이드가 사람 눈으로 보던 것을 수치로 옮긴 것이다 */
  r.convenience = Math.round(-r.hassleDelta * W.hassle * 100) / 100;
  r.score = Math.round((r.efficiency + r.convenience) * 100) / 100;
}
results.sort((a, b) => b.score - a.score);

/** 등급 경계 — 점수 분포의 분위수로 나눈다. 임의의 절대값을 쓰지 않는다 */
const scores = results.map((r) => r.score);
const q = (p) => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))];
const cuts = { S: q(0.05), A: q(0.2), B: q(0.45), C: q(0.7), D: q(0.9) };
for (const r of results) {
  r.grade =
    r.score >= cuts.S ? 'S' : r.score >= cuts.A ? 'A' : r.score >= cuts.B ? 'B'
    : r.score >= cuts.C ? 'C' : r.score >= cuts.D ? 'D' : 'F';
}

console.log(`\n계산 완료: ${results.length}건 · 제외 ${skipped.length}건`);
console.log('등급 경계:', JSON.stringify(cuts));
console.log('\n상위 12건:');
for (const r of results.slice(0, 12)) {
  console.log(
    `   ${r.grade}  ${String(r.score).padStart(7)}  ${r.ko.padEnd(20)} ` +
      `자원 ${r.resourcePct >= 0 ? '+' : ''}${r.resourcePct}% · 기계 ${r.machinePct >= 0 ? '+' : ''}${r.machinePct}%`
  );
}
if (skipped.length) {
  console.log('\n제외:');
  for (const s of skipped) console.log(`   ${recipeById.get(s.id)?.ko ?? s.id} — ${s.why}`);
}

fs.writeFileSync(
  path.join(ROOT, '.tmp-research/own-ranking.json'),
  JSON.stringify({ baseline: { resourceScore: baseline.resourceScore }, cuts, weights: W, results, skipped }, null, 1)
);
console.log('\n→ .tmp-research/own-ranking.json');
