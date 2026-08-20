/**
 * 설계 도면판을 실제로 눌러 본다.
 *
 * 계산은 planner.test.ts 가 잠근다. 여기서 잡는 것은 **조작이 안 먹는 사고**다 —
 * 건물이 안 놓이거나, 이었는데 벨트가 안 그려지거나, 포트가 엉뚱한 자리에 붙는 것.
 * 빌드도 통과하고 배포도 되지만 브라우저에서만 안 되는 종류라 눈으로는 안 잡힌다.
 *
 * happy-dom 에 진짜로 붙여서 클릭한다. .tsx 는 node 가 못 읽으므로 esbuild 로 옮긴다.
 */
import { strict as assert } from 'node:assert';
import test, { before } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Window } from 'happy-dom';
import { pathToFileURL } from 'node:url';
import type { PBelt, PItem, PMachine, PRecipe } from '../src/lib/planner-solve.ts';

/* ------------------------------------------------------------------ 데이터 */

const machines: PMachine[] = [
  {
    i: 'Build_MinerMk1_C',
    k: '채굴기 Mk.1',
    t: 0,
    p: 5,
    e: 60,
    res: ['Desc_OreIron_C', 'Desc_Coal_C'],
    fw: 6,
    fl: 14,
    n: 0,
  },
  { i: 'Build_SmelterMk1_C', k: '제련기', t: 0, p: 4, fw: 5, fl: 10, n: 2 },
  { i: 'Build_ConstructorMk1_C', k: '제작기', t: 0, p: 4, fw: 8, fl: 10, n: 1 },
  {
    i: 'Build_ConveyorAttachmentSplitter_C',
    k: '컨베이어 분배기',
    t: 1,
    p: null,
    lg: 'split',
    fw: 4,
    fl: 4,
    n: 0,
  },
];
const recipesList: PRecipe[] = [
  {
    i: 'Recipe_IngotIron_C',
    k: '철 주괴',
    m: 'Build_SmelterMk1_C',
    g: [['Desc_OreIron_C', 30]],
    o: [['Desc_IronIngot_C', 30]],
  },
  {
    i: 'Recipe_Alternate_IngotIron_C',
    k: '순수 철 주괴',
    m: 'Build_SmelterMk1_C',
    a: 1,
    g: [['Desc_OreIron_C', 35]],
    o: [['Desc_IronIngot_C', 65]],
  },
  {
    i: 'Recipe_IronPlate_C',
    k: '철판',
    m: 'Build_ConstructorMk1_C',
    g: [['Desc_IronIngot_C', 30]],
    o: [['Desc_IronPlate_C', 20]],
  },
];
const itemsList: PItem[] = [
  { i: 'Desc_OreIron_C', k: '철 광석' },
  { i: 'Desc_Coal_C', k: '석탄', mj: 300 },
  { i: 'Desc_IronIngot_C', k: '철 주괴' },
  { i: 'Desc_IronPlate_C', k: '철판' },
];
const belts: PBelt[] = [
  { i: 'Build_ConveyorBeltMk1_C', k: '컨베이어 벨트 Mk.1', r: 60, t: 0 },
  { i: 'Build_ConveyorBeltMk2_C', k: '컨베이어 벨트 Mk.2', r: 120, t: 2 },
];

/* ------------------------------------------------------------------ 붙이기 */

let win: InstanceType<typeof Window>;
let doc: Document;
let render: (v: unknown, p: unknown) => void;
let h: (t: unknown, p: unknown) => unknown;
let Planner: unknown;

before(async () => {
  const src = readFileSync('src/components/FactoryPlanner.tsx', 'utf8');
  const out = transformSync(src, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    format: 'esm',
    target: 'es2022',
  });
  const file = 'src/components/.planner-test.mjs';
  /* node ESM 은 확장자를 붙여야 찾는다. 번들러가 하던 일을 여기서 대신한다 */
  writeFileSync(file, out.code.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, '$1$2.ts$3'), 'utf8');

  win = new Window({ url: 'https://x.test/', width: 1400, height: 800 });
  const g = globalThis as Record<string, unknown>;
  for (const k of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'SVGElement',
    'Element',
    'Node',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'PointerEvent',
    'localStorage',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
    'ResizeObserver',
  ]) {
    const v = (win as unknown as Record<string, unknown>)[k];
    if (v === undefined) continue;
    /* navigator 처럼 node 가 getter 로만 열어 둔 것이 있다. 그건 다시 정의해서 덮는다 */
    try {
      g[k] = v;
    } catch {
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    }
  }

  const preact = await import('preact');
  /*
   * preact 는 상태 변경을 모아서 나중에 그린다. 테스트에서는 누르자마자 결과를 봐야 하므로
   * 그리기를 바로 하게 바꾼다. 화면 동작이 아니라 검사 편의를 위한 설정이다.
   */
  (preact.options as unknown as { debounceRendering?: (cb: () => void) => void }).debounceRendering =
    (cb) => cb();
  render = preact.render as never;
  h = preact.h as never;
  Planner = (await import(pathToFileURL(process.cwd() + '/' + file).href)).default;
  doc = win.document as unknown as Document;
});

function mount() {
  doc.body.innerHTML = '<div id="root"></div>';
  render(
    h(Planner, { machines, recipesList, itemsList, belts, iconBase: '/satisfactory-ops/assets' }),
    doc.getElementById('root')
  );
}

const $ = (sel: string) => doc.querySelector(sel);
const $$ = (sel: string) => [...doc.querySelectorAll(sel)];

/** SVG 요소는 .click() 이 없다. 이벤트를 직접 쏜다 */
const click = (el: Element | null | undefined, what = '') => {
  assert.ok(el, `누를 것이 없습니다 ${what}`);
  el!.dispatchEvent(
    new win.window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event
  );
};
const place = (ko: string) => {
  const b = $$('.pl-mbtn').find((x) => x.textContent?.includes(ko));
  assert.ok(b, `${ko} 가 서랍에 없습니다`);
  (b as HTMLElement).click();
};
const choose = (ko: string) => {
  const b = $$('.pl-picker ul button').find((x) => x.textContent?.includes(ko));
  assert.ok(b, `${ko} 를 고르기 창에서 못 찾았습니다`);
  (b as HTMLElement).click();
};
const num = (el: Element | null, attr: string) => Number(el!.getAttribute(attr));

/* ------------------------------------------------------------------ 검사 */

test('건물을 누르면 판에 놓이고 고르기 창이 열린다', () => {
  win.localStorage.clear();
  mount();
  assert.equal($$('.pl-b').length, 0);
  place('제련기');
  assert.equal($$('.pl-b').length, 1);
  assert.ok($('.pl-picker'), '놓자마자 고르기 창이 떠야 한다');
  assert.ok($('.pl-b.is-unset'), '아직 안 고른 건물은 표시가 나야 한다');
});

test('건물 크기가 게임의 실제 치수와 같다 — 축척이 맞아야 도면이다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  const rect = $('.pl-b .pl-bbody');
  assert.equal(num(rect, 'width'), 5, '제련기 가로는 5 m 다');
  assert.equal(num(rect, 'height'), 10, '제련기 세로는 10 m 다');
});

test('레시피를 고르면 투입구는 뒷면, 산출구는 앞면 한가운데에 붙는다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  const rect = $('.pl-b .pl-bbody')!;
  const x = num(rect, 'x');
  const y = num(rect, 'y');
  const w = num(rect, 'width');
  const hh = num(rect, 'height');

  const inC = $('.pl-port.is-in circle')!;
  const outC = $('.pl-port.is-out circle')!;
  assert.equal(num(inC, 'cx'), x, '투입구는 왼쪽 면에 붙는다');
  assert.equal(num(inC, 'cy'), y + hh / 2, '투입구는 그 면의 한가운데다');
  assert.equal(num(outC, 'cx'), x + w, '산출구는 오른쪽 면에 붙는다');
  assert.equal(num(outC, 'cy'), y + hh / 2, '산출구는 그 면의 한가운데다');
});

test('90도 돌리면 크기와 포트 면이 같이 돈다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  const turn = $$('.pl-tools button').find((b) => b.getAttribute('title') === '90도 돌리기');
  (turn as HTMLElement).click();

  const rect = $('.pl-b .pl-bbody')!;
  assert.equal(num(rect, 'width'), 10, '돌리면 가로세로가 바뀐다');
  assert.equal(num(rect, 'height'), 5);
  const inC = $('.pl-port.is-in circle')!;
  assert.equal(num(inC, 'cy'), num(rect, 'y'), '90도면 투입구가 윗면으로 간다');
});

test('안 딴 대체 제작법은 목록에 없고, 체크하면 나온다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  let names = $$('.pl-picker ul button').map((b) => b.textContent ?? '');
  assert.ok(names.some((n) => n.includes('철 주괴')));
  assert.ok(!names.some((n) => n.includes('순수 철 주괴')), '체크 안 한 것이 보이면 안 된다');

  win.localStorage.setItem(
    'sfops.owned',
    JSON.stringify({ version: 1, ids: ['Recipe_Alternate_IngotIron_C'] })
  );
  mount();
  place('제련기');
  names = $$('.pl-picker ul button').map((b) => b.textContent ?? '');
  assert.ok(names.some((n) => n.includes('순수 철 주괴')));
  win.localStorage.clear();
});

test('산출구 → 투입구를 누르면 벨트가 그려지고 유량이 흐른다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  place('제작기');
  choose('철판');

  const bs = $$('.pl-b');
  assert.equal(bs.length, 2);

  click(bs[0]!.querySelector('.pl-port.is-out'), '제련기 산출구');
  assert.ok($('.pl-port.is-picked'), '고른 산출구가 표시돼야 한다');
  assert.ok($('.pl-port.is-target'), '이을 수 있는 투입구가 드러나야 한다');

  click($$('.pl-b')[1]!.querySelector('.pl-port.is-in'), '제작기 투입구');

  const wires = $$('.pl-belt');
  assert.equal(wires.length, 1, '벨트가 한 줄 그려져야 한다');
  const d = wires[0]!.querySelector('.pl-belt-core')!.getAttribute('d') ?? '';
  assert.ok(d.length > 4, '선이 비어 있다');
  assert.ok(!/NaN|undefined/.test(d), `선 좌표에 NaN 이 있다: ${d}`);
  assert.match(wires[0]!.textContent ?? '', /30\/분/, '벨트에 유량이 적혀야 한다');
  assert.ok(!wires[0]!.classList.contains('is-dry'), '흐르는 벨트가 마른 것으로 표시되면 안 된다');
});

test('벨트의 시작과 끝이 실제 포트 자리와 정확히 맞는다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  place('제작기');
  choose('철판');
  const bs = $$('.pl-b');
  click(bs[0]!.querySelector('.pl-port.is-out'));
  click($$('.pl-b')[1]!.querySelector('.pl-port.is-in'));

  const d = $('.pl-belt-core')!.getAttribute('d')!;
  const start = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d)!;
  const end = /L(-?[\d.]+),(-?[\d.]+)$/.exec(d)!;

  const outC = $$('.pl-b')[0]!.querySelector('.pl-port.is-out circle')!;
  const inC = $$('.pl-b')[1]!.querySelector('.pl-port.is-in circle')!;
  assert.equal(Number(start[1]), num(outC, 'cx'), '벨트가 산출구에서 시작해야 한다');
  assert.equal(Number(start[2]), num(outC, 'cy'));
  assert.equal(Number(end[1]), num(inC, 'cx'), '벨트가 투입구에서 끝나야 한다');
  assert.equal(Number(end[2]), num(inC, 'cy'));
});

test('채굴기는 캘 자원을 고를 수 있다 — 선택지가 0개면 안 된다', () => {
  win.localStorage.clear();
  mount();
  place('채굴기 Mk.1');
  const names = $$('.pl-picker ul button').map((b) => b.textContent ?? '');
  assert.ok(names.length >= 2, `캘 자원이 ${names.length}개다`);
  assert.ok(names.some((n) => n.includes('철 광석')));
});

test('분배기를 놓고 지나갈 물건을 고르면 받은 만큼 내보낸다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  place('컨베이어 분배기');
  choose('철 주괴');

  const bs = $$('.pl-b');
  assert.equal(bs.length, 2);
  click(bs[0]!.querySelector('.pl-port.is-out'));
  click($$('.pl-b')[1]!.querySelector('.pl-port.is-in'));

  assert.equal($$('.pl-belt').length, 1);
  assert.match($('.pl-belt')!.textContent ?? '', /30\/분/, '분배기로 30/분이 흘러야 한다');
  /* 지나가기만 하므로 "나오는 것"에 철 주괴가 그대로 남는다 */
  assert.match($$('.pl-sum p')[1]!.textContent ?? '', /철 주괴 30\/분/);
});

test('층이 다르면 리프트로 표시되고 높이가 나온다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  place('제작기');
  choose('철판');

  /* 제작기를 1층으로 올린다 */
  const floorInput = $$('.pl-tools label')
    .find((l) => l.getAttribute('title') === '층')!
    .querySelector('input') as HTMLInputElement;
  floorInput.value = '1';
  floorInput.dispatchEvent(
    new win.window.Event('input', { bubbles: true }) as unknown as Event
  );

  const bs = $$('.pl-b');
  click(bs.find((b) => !b.classList.contains('is-off'))!.querySelector('.pl-port.is-out'));
  /* 1층으로 올라간 건물의 투입구를 누르려면 그 층으로 가야 한다 */
  const up = $$('.pl-floors button').find((b) => b.textContent?.startsWith('1층'));
  (up as HTMLElement).click();
  const target = $$('.pl-b').find((b) => !b.classList.contains('is-off'))!;
  click(target.querySelector('.pl-port.is-in'));

  assert.equal($$('.pl-belt').length, 1);
  assert.match($('.pl-belt')!.textContent ?? '', /리프트 8 m/, '층 사이는 리프트다');
});

test('자동 배치를 누르면 공정 순서대로 줄이 선다', () => {
  win.localStorage.clear();
  mount();
  place('제련기');
  choose('철 주괴');
  place('제작기');
  choose('철판');
  const bs = $$('.pl-b');
  click(bs[0]!.querySelector('.pl-port.is-out'));
  click($$('.pl-b')[1]!.querySelector('.pl-port.is-in'));

  const auto = $$('.pl-btn').find((b) => b.textContent?.includes('자동 배치'));
  (auto as HTMLElement).click();

  const rects = $$('.pl-b .pl-bbody');
  const x0 = num(rects[0]!, 'x');
  const x1 = num(rects[1]!, 'x');
  assert.ok(x1 > x0, '받는 쪽이 오른쪽 열에 서야 한다');
  assert.equal(num(rects[0]!, 'y'), 0, '첫 열은 맨 위부터 쌓는다');
});
