/**
 * 모듈 도면 테스트.
 *
 * 기준값은 커뮤니티에 발행된 모듈 시트다 — "앤디스 팩토리 설계 연구소", 보강된 철판 v1:
 *   MK1 채굴기 ×1 · 제련기 ×2 · 제작기 ×5 · 조립기 ×1 · 분배기 ×2 · 병합기 ×3 · MK1 리프트
 *   4×4 토대 영역 · 모듈 복제/대칭으로 확장
 *
 * 이 대수는 우연이 아니라 비율에서 나온다. 우리 생성기가 같은 값을 내야 한다:
 *   채굴기 Mk.1 1대(노말) = 철 광석 60/분
 *   → 제련기 2대 = 철 주괴 60/분
 *   → 철판 1.5대 + 철봉 1대 + 나사 1.5대 = 제작기 4대가 "정확값"
 *     반 대는 지을 수 없으므로 2 + 1 + 2 = 5대를 짓고 남는 만큼 다운클럭
 *   → 조립기 1대 = 보강된 철판 5/분
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { planModule, rateFromSupply, validateModule, powerAtClock } from '../src/lib/module-plan.ts';
import type { MachineSpec } from '../src/lib/module-plan.ts';
import { planMining, nodeYield, bestExtractor, PURITY_MULTIPLIER } from '../src/lib/mining.ts';
import type { ResourceNode, Extractor } from '../src/lib/mining.ts';
import { makeRecipeBook } from '../src/lib/recipe-select.ts';
import type { Item, Recipe, Building } from '../src/lib/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = <T,>(p: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) as T;

const items = read<Item[]>('src/data/app/items.json');
const recipes = read<Recipe[]>('src/data/app/recipes.json');
const buildings = read<Building[]>('src/data/app/buildings.json');
const nodes = read<{ nodes: ResourceNode[] }>('src/data/app/resource-nodes.json').nodes;

const book = makeRecipeBook(items, recipes, buildings);
const machines = new Map<string, MachineSpec>(
  buildings.map((b) => [
    b.id,
    {
      id: b.id,
      ko: b.ko,
      footprint: b.footprint ?? null,
      powerMW: b.powerMW ?? null,
      powerExponent: b.powerExponent ?? null,
    },
  ])
);
// 원자재 = 채굴로만 얻는 것. 장부가 레시피를 못 찾으면 원자재다.
const isRaw = (id: string) => !book.recipeFor(id);

const minerMk1: Extractor = {
  id: 'Build_MinerMk1_C',
  ko: buildings.find((b) => b.id === 'Build_MinerMk1_C')!.ko,
  perMinuteAtNormalPurity: 60,
  unlockTier: 0,
  powerMW: 5,
};
const beltMk1 = { ko: '컨베이어 벨트 Mk.1', perMinute: 60 };
const beltMk2 = { ko: '컨베이어 벨트 Mk.2', perMinute: 120, tier: 2 };

const RIP = 'Desc_IronPlateReinforced_C';
const IRON_ORE = 'Desc_OreIron_C';

test('채굴기 한 대 산출에서 규모를 역산한다 — 노말 노드 60/분 → 보강된 철판 5/분', () => {
  const rate = rateFromSupply(RIP, IRON_ORE, 60, book, isRaw);
  assert.equal(rate, 5, `노말 철 광석 노드 하나로 보강된 철판 5/분 — 실제 ${rate}`);
  // 순수 노드는 배가 나온다
  assert.equal(rateFromSupply(RIP, IRON_ORE, 120, book, isRaw), 10);
});

test('발행 모듈 시트 재현 — 채굴기 1 · 제련기 2 · 제작기 5 · 조립기 1', () => {
  const rate = rateFromSupply(RIP, IRON_ORE, 60, book, isRaw);
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: rate,
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes: nodes.filter((n) => n.purity === 'normal'), // 노말 노드만 쓴 경우
    extractor: minerMk1,
    isRaw,
  });

  const count = (ko: string) => plan.bom.find((b) => b.ko === ko)?.count ?? 0;
  assert.equal(count('채굴기 Mk.1'), 1, '채굴기 1대');
  assert.equal(count('제련기'), 2, '제련기 2대');
  assert.equal(count('제작기'), 5, '제작기 5대 — 정확값 4대인데 반 대를 못 지어서');
  assert.equal(count('조립기'), 1, '조립기 1대');
  assert.equal(plan.targetPerMinute, 5, '보강된 철판 5/분');
});

test('제작기 5대의 근거가 그룹별 정확값에 남아 있다', () => {
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: 5,
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes,
    extractor: minerMk1,
    isRaw,
  });
  const g = (ko: string) => plan.groups.find((x) => x.itemKo === ko)!;
  assert.equal(g('철판').exact, 1.5);
  assert.equal(g('철판').built, 2);
  assert.equal(g('철판').clockPercent, 75);
  assert.equal(g('나사').exact, 1.5);
  assert.equal(g('나사').built, 2);
  assert.equal(g('철봉').exact, 1);
  assert.equal(g('철봉').built, 1);
  assert.equal(g('철 주괴').built, 2);
  const constructors = plan.groups.filter((x) => x.machineKo === '제작기').reduce((s, x) => s + x.built, 0);
  assert.equal(constructors, 5);
});

test('컨베이어 리프트가 목록에 들어간다 — 높이가 바뀌는 지점이 있으므로', () => {
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: 5,
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes,
    extractor: minerMk1,
    isRaw,
    liftKo: '컨베이어 리프트 Mk.1',
  });
  assert.ok(plan.lifts > 0, '리프트 수가 0이면 안 된다');
  assert.ok(
    plan.bom.some((b) => b.ko.includes('리프트') && b.count > 0),
    '건물 목록에 리프트가 있어야 한다'
  );
});

test('다운클럭이 전력을 실제로 줄인다 — 지수 1.32', () => {
  // 제작기 4 MW를 75%로 돌리면 4 × 0.75^1.321928 = 2.75 MW
  const p = powerAtClock(4, 75, 1.321928);
  assert.ok(Math.abs(p - 2.75) < 0.02, `75% 전력 ${p} MW`);
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: 5,
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes,
    extractor: minerMk1,
    isRaw,
  });
  assert.ok(plan.power.totalMW < plan.power.at100MW, '다운클럭이 전력을 줄여야 한다');
  assert.ok(plan.power.savedMW > 0);
});

test('발행 모듈 시트의 크기를 재현한다 — 토대 4×4 (32×32 m)', () => {
  // 참고 시트("앤디스 팩토리 설계 연구소", 보강된 철판 v1)는 4×4 토대 영역에 들어간다고 적고 있다.
  // 우리 배치기가 같은 크기를 내야 한다. 이 값이 커지면 배치 최적화가 퇴화한 것이다.
  //
  // 이력: 탐욕적 줄 채우기였을 때 4×9(32×72 m), 기계 단위 배치일 때 3×5(24×40 m)였다.
  // 24×40은 면적은 작지만 청사진 설계소 Mk.1(32×32)에 들어가지 않아 실전에서 더 나쁘다.
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: rateFromSupply(RIP, IRON_ORE, 60, book, isRaw),
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes: nodes.filter((n) => n.purity === 'normal'),
    extractor: minerMk1,
    isRaw,
  });
  assert.equal(plan.foundation.wTiles, 4, `폭 ${plan.foundation.wTiles}칸`);
  assert.equal(plan.foundation.hTiles, 4, `길이 ${plan.foundation.hTiles}칸`);
  assert.ok(plan.foundation.fitsBlueprintMk1, '청사진 설계소 Mk.1에 들어가야 한다');
  assert.deepEqual(validateModule(plan), []);
});

test('같은 공정의 기계는 서로 붙인다 — 사이에 통로를 두지 않는다', () => {
  // 같은 매니폴드가 먹이므로 기계 사이로 벨트가 지나갈 일이 없다.
  // 사방 2 m를 비우면 밀도가 무너진다 — 실제로 그렇게 만들었다가 24×40 m가 나왔다.
  const plan = planModule({
    targetItemId: RIP,
    targetPerMinute: rateFromSupply(RIP, IRON_ORE, 60, book, isRaw),
    tier: 2,
    book,
    machines,
    belt: beltMk1,
    futureBelt: beltMk2,
    nodes,
    extractor: minerMk1,
    isRaw,
  });
  const smelterGroup = plan.groups.findIndex((g) => g.machineId === 'Build_SmelterMk1_C');
  // 분배기·병합기도 group 을 갖는다 — 기계만 센다
  const smelters = plan.placements.filter((p) => p.kind === 'machine' && p.group === smelterGroup);
  assert.equal(smelters.length, 2, '제련기 2대');
  const [a, b] = smelters as [typeof smelters[0], typeof smelters[0]];
  const touching =
    Math.abs(a.x + a.wTiles - b.x) < 1e-9 ||
    Math.abs(b.x + b.wTiles - a.x) < 1e-9 ||
    Math.abs(a.y + a.hTiles - b.y) < 1e-9 ||
    Math.abs(b.y + b.hTiles - a.y) < 1e-9;
  assert.ok(touching, `제련기 두 대가 붙어 있어야 한다 — a(${a.x},${a.y}) b(${b.x},${b.y})`);
});

test('배치가 겹치지 않는다', () => {
  for (const rate of [5, 10, 20]) {
    const plan = planModule({
      targetItemId: RIP,
      targetPerMinute: rate,
      tier: 2,
      book,
      machines,
      belt: beltMk1,
      futureBelt: beltMk2,
      nodes,
      extractor: minerMk1,
      isRaw,
    });
    assert.deepEqual(validateModule(plan), [], `${rate}/분 모듈`);
  }
});

test('노드 조인은 이름이 아니라 클래스 id로 한다', () => {
  // 노드 데이터의 옛 한글 이름('철광석')과 게임 이름('철 광석')이 다르다.
  // 이름으로 조인하면 조용히 0건이 되어 "근처에 노드 없음"이 뜬다 — 실제로 그랬다.
  const plan = planMining('Desc_OreIron_C', '철 광석', 60, nodes, minerMk1, 60);
  assert.ok(plan.assignments.length > 0, '철 광석 노드를 찾아야 한다');
  assert.equal(plan.shortfallPerMinute, 0);
  const copper = planMining('Desc_OreCopper_C', '구리 광석', 60, nodes, minerMk1, 60);
  assert.ok(copper.assignments.length > 0, '구리 광석 노드를 찾아야 한다');
});

test('순도 배수가 산출에 반영된다', () => {
  const pure = nodes.find((n) => n.res === IRON_ORE && n.purity === 'pure')!;
  const impure = nodes.find((n) => n.res === IRON_ORE && n.purity === 'impure')!;
  assert.equal(nodeYield(pure, minerMk1), 120);
  assert.equal(nodeYield(impure, minerMk1), 30);
  assert.equal(PURITY_MULTIPLIER.pure, 2);
});

test('순수 노드를 먼저 쓰고, 마지막 채굴기는 다운클럭한다', () => {
  const plan = planMining('Desc_OreIron_C', '철 광석', 150, nodes, minerMk1, 270);
  assert.equal(plan.assignments[0]!.purity, 'pure', '순수 노드부터');
  assert.equal(plan.suppliedPerMinute, 150);
  const last = plan.assignments[plan.assignments.length - 1]!;
  assert.ok(last.clockPercent <= 100);
  assert.ok(plan.notes.some((n) => n.includes('다운클럭')));
});

test('해금 안 된 채굴기를 계획에 쓰지 않는다', () => {
  const all: Extractor[] = buildings
    .filter((b) => b.extraction && b.id.startsWith('Build_Miner'))
    .map((b) => ({
      id: b.id,
      ko: b.ko,
      perMinuteAtNormalPurity: b.extraction!.perMinuteAtNormalPurity!,
      unlockTier: b.unlockTier ?? null,
      powerMW: b.powerMW ?? null,
    }));
  assert.equal(bestExtractor(all, 2, true)!.id, 'Build_MinerMk1_C', '티어 2에서는 Mk.1만');
  assert.equal(bestExtractor(all, 4, true)!.id, 'Build_MinerMk2_C', '티어 4에서 Mk.2 해금');
  assert.equal(bestExtractor(all, 8, true)!.id, 'Build_MinerMk3_C', '티어 8에서 Mk.3');
});
