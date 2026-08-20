/** 검증형 설계판의 핵심 조작을 happy-dom에서 실제로 누른다. */
import { strict as assert } from 'node:assert';
import test, { before } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Window } from 'happy-dom';
import { pathToFileURL } from 'node:url';
import type { DrawingMachine } from '../src/components/ValidatedFactoryPlanner.tsx';

const verified = { confidence: 'verified' as const, sampleCount: 12, maxDeviationM: .001 };
const machines: DrawingMachine[] = [
  {
    buildingClass: 'Build_SmelterMk1_C', name: '제련기',
    hardBoxes: [{ min: { x: -2.5, y: -5, z: 0 }, max: { x: 2.5, y: 5, z: 8.5 } }],
    ports: [
      { id: 'Input0', medium: 'solid', direction: 'input', positionM: { x: 0, y: -3, z: 1 }, normal: { x: 0, y: -1, z: 0 }, ...verified },
      { id: 'Output2', medium: 'solid', direction: 'output', positionM: { x: 0, y: 2, z: 1 }, normal: { x: 0, y: 1, z: 0 }, ...verified },
    ],
    powerDemandMW: 4,
    imageUrl: '/topview/smelter.webp', imageKind: 'topview',
    occupancyFrame: { x: 0, y: .0455, width: 1, height: .9091 },
    recipes: [{ id: 'Recipe_IngotIron_C', name: '철 주괴', isAlternate: false, ingredients: [{ item: 'Desc_OreIron_C', name: '철광석', perMinute: 30 }], products: [{ item: 'Desc_IronIngot_C', name: '철 주괴', perMinute: 30 }] }],
    somersloopSlots: 0, basePowerMW: 4, powerExponent: 1.321929, productionBoostPowerExponent: 2,
  },
  {
    buildingClass: 'Build_ConstructorMk1_C', name: '제작기',
    hardBoxes: [{ min: { x: -4, y: -5, z: 0 }, max: { x: 4, y: 5, z: 6 } }],
    ports: [
      { id: 'Input0', medium: 'solid', direction: 'input', positionM: { x: 0, y: -3, z: 1 }, normal: { x: 0, y: -1, z: 0 }, ...verified },
      { id: 'Output0', medium: 'solid', direction: 'output', positionM: { x: 0, y: 3, z: 1 }, normal: { x: 0, y: 1, z: 0 }, ...verified },
    ],
    powerDemandMW: 4,
    imageUrl: '/topview/constructor.webp', imageKind: 'topview',
    recipes: [
      { id: 'Recipe_IronPlate_C', name: '철판', isAlternate: false, ingredients: [{ item: 'Desc_IronIngot_C', name: '철 주괴', perMinute: 30 }], products: [{ item: 'Desc_IronPlate_C', name: '철판', perMinute: 20 }] },
      { id: 'Recipe_Alternate_IronPlate_C', name: '강철 주조 철판', isAlternate: true, ingredients: [{ item: 'Desc_SteelIngot_C', name: '강철 주괴', perMinute: 15 }], products: [{ item: 'Desc_IronPlate_C', name: '철판', perMinute: 30 }] },
    ],
    somersloopSlots: 1, basePowerMW: 4, powerExponent: 1.321929, productionBoostPowerExponent: 2,
  },
];

let win: InstanceType<typeof Window>;
let doc: Document;
let render: (v: unknown, p: unknown) => void;
let h: (t: unknown, p: unknown) => unknown;
let Planner: unknown;

before(async () => {
  const src = readFileSync('src/components/ValidatedFactoryPlanner.tsx', 'utf8');
  const out = transformSync(src, { loader: 'tsx', jsx: 'automatic', jsxImportSource: 'preact', format: 'esm', target: 'es2022' });
  const file = 'src/components/.planner-test.mjs';
  writeFileSync(file, out.code.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, '$1$2.ts$3'), 'utf8');
  win = new Window({ url: 'https://x.test/', width: 1400, height: 800 });
  const globals = globalThis as Record<string, unknown>;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event', 'MouseEvent', 'PointerEvent', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'Blob', 'URL']) {
    const value = (win as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    try { globals[key] = value; } catch { Object.defineProperty(globals, key, { value, configurable: true, writable: true }); }
  }
  const preact = await import('preact');
  (preact.options as unknown as { debounceRendering?: (cb: () => void) => void }).debounceRendering = (cb) => cb();
  render = preact.render as never;
  h = preact.h as never;
  Planner = (await import(pathToFileURL(process.cwd() + '/' + file).href)).default;
  doc = win.document as unknown as Document;
});

function mount() {
  win.localStorage.clear();
  doc.body.innerHTML = '<div id="root"></div>';
  render(h(Planner, {
    machines,
    beltImageUrl: '/assets/conveyor.webp',
    liftImageUrl: '/assets/lift.png',
    foundationImageUrl: '/assets/foundation.png',
    proof: { fileCount: 9, publicFileCount: 8, observationCount: 9933, toleranceM: .05 },
  }), doc.getElementById('root'));
}
const all = (selector: string) => [...doc.querySelectorAll(selector)];
const button = (text: string) => all('button').find((entry) => entry.textContent?.includes(text)) as HTMLElement | undefined;
const clickSvg = (entry: Element | null | undefined) => entry?.dispatchEvent(new win.window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
const clickCanvas = (x = 640, y = 360) => {
  void x; void y;
  (doc.querySelector('.vp-stage') as HTMLElement | null)?.click();
};

test('파운데이션은 빈 판에서 실제 이미지 타일로 직접 추가·삭제한다', () => {
  mount();
  assert.equal(all('.vp-foundation').length, 0);
  button('파운데이션 8 m × 8 m')?.click();
  assert.equal(all('.vp-foundation').length, 0);
  assert.ok(doc.querySelector('.vp-machine.is-armed'));
  clickCanvas();
  assert.equal(all('.vp-foundation').length, 1);
  assert.equal(doc.querySelector('.vp-foundation image')?.getAttribute('href'), '/assets/foundation.png');
  assert.equal(doc.querySelector('.vp-foundation rect')?.getAttribute('width'), '8');
  button('선택 삭제')?.click();
  assert.equal(all('.vp-foundation').length, 0);
});

test('기계를 회전해도 이름과 IN·OUT 라벨은 정방향을 유지한다', () => {
  mount();
  button('제련기')?.click();
  clickCanvas();
  assert.deepEqual(all('.vp-port-label').map((entry) => entry.textContent), ['IN', 'OUT']);
  assert.equal(all('.vp-machine-size').length, 0);
  assert.equal(all('.vp-machine-label').length, 0);
  button('90° 회전')?.click();
  assert.match(doc.querySelector('.vp-placement')?.getAttribute('transform') ?? '', /rotate\(90\)/);
  assert.match(doc.querySelector('.vp-port')?.getAttribute('transform') ?? '', /rotate\(-90\)/);
});

test('실제 포트를 연결하면 선이 아니라 컨베이어 이미지 구간이 생긴다', () => {
  mount();
  button('제련기')?.click();
  clickCanvas(430, 360);
  button('제작기')?.click();
  clickCanvas(800, 360);
  clickSvg(all('.vp-placement')[0]?.querySelector('.vp-port.is-output'));
  clickSvg(all('.vp-placement')[1]?.querySelector('.vp-port.is-input'));
  assert.equal(all('.vp-route[aria-label="컨베이어 벨트"]').length, 1);
  assert.ok(all('.vp-belt-tile').length > 0);
  assert.equal(doc.querySelector('.vp-belt-tile')?.getAttribute('href'), '/assets/conveyor.webp');
});

test('전체 초기화는 설비·토대·물류를 한 번에 비운다', () => {
  mount();
  button('파운데이션 8 m × 8 m')?.click();
  clickCanvas();
  button('제련기')?.click();
  clickCanvas(400, 360);
  button('전체 초기화')?.click();
  assert.equal(all('.vp-foundation').length, 0);
  assert.equal(all('.vp-placement').length, 0);
  assert.equal(all('.vp-route').length, 0);
  assert.match(doc.body.textContent ?? '', /EMPTY_PLAN/);
});

test('실행 취소·다시 실행은 최근 50단계의 편집 상태를 복원한다', () => {
  mount();
  for (let index = 0; index < 51; index += 1) {
    button('제련기')?.click();
    clickCanvas();
  }
  assert.equal(all('.vp-placement').length, 51);
  for (let index = 0; index < 50; index += 1) button('실행 취소')?.click();
  assert.equal(all('.vp-placement').length, 1);
  assert.equal((button('실행 취소') as HTMLButtonElement).disabled, true);
  for (let index = 0; index < 50; index += 1) button('다시 실행')?.click();
  assert.equal(all('.vp-placement').length, 51);
  assert.equal((button('다시 실행') as HTMLButtonElement).disabled, true);
});

test('카탈로그 항목은 클릭 배치와 HTML 드래그앤드롭을 함께 제공한다', () => {
  mount();
  assert.equal(all('.vp-machine[draggable="true"]').length, machines.length + 1);
  assert.match(doc.querySelector('.vp-ruler span')?.textContent ?? '', /카탈로그 드롭/);
});

test('도면 레이어는 토대와 설비를 독립적으로 숨기고 다시 표시한다', () => {
  mount();
  button('파운데이션 8 m × 8 m')?.click();
  clickCanvas();
  button('제련기')?.click();
  clickCanvas();
  const layerInput = (label: string) => all('.vp-layers label')
    .find((entry) => entry.textContent?.includes(label))?.querySelector('input') as HTMLInputElement;
  layerInput('토대').click();
  assert.equal(all('.vp-foundation').length, 0);
  assert.equal(all('.vp-placement').length, 1);
  layerInput('설비').click();
  assert.equal(all('.vp-placement').length, 0);
  layerInput('토대').click();
  layerInput('설비').click();
  assert.equal(all('.vp-foundation').length, 1);
  assert.equal(all('.vp-placement').length, 1);
});

test('도면 맞춤은 배치된 공정을 화면 중심으로 가져온다', () => {
  mount();
  button('파운데이션 8 m × 8 m')?.click();
  clickCanvas();
  button('제련기')?.click();
  clickCanvas();
  button('도면 맞춤')?.click();
  assert.match(doc.querySelector('.vp-notice')?.textContent ?? '', /도면 전체를 화면에 맞췄습니다/);
});

test('기기 레시피·클럭·소머슬룹을 설정하면 계산 유량이 바뀐다', () => {
  mount();
  button('제작기')?.click();
  clickCanvas();
  const selects = all('.vp-machine-config select') as HTMLSelectElement[];
  selects[0].value = 'Recipe_Alternate_IronPlate_C';
  selects[0].dispatchEvent(new win.window.Event('change', { bubbles: true }) as unknown as Event);
  const clock = doc.querySelector('.vp-machine-config input') as HTMLInputElement;
  clock.value = '200';
  clock.dispatchEvent(new win.window.Event('input', { bubbles: true }) as unknown as Event);
  const sloop = all('.vp-machine-config select').at(-1) as HTMLSelectElement;
  sloop.value = '1';
  sloop.dispatchEvent(new win.window.Event('change', { bubbles: true }) as unknown as Event);
  assert.match(doc.querySelector('.vp-rate-summary')?.textContent ?? '', /출력 철판 120\/분/);
  assert.match(doc.querySelector('.vp-rate-summary')?.textContent ?? '', /계산 전력/);
});
