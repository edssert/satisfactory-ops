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
    statusImageUrls: {
      active: '/topview/constructor-active.webp',
      activeWithCrystal: '/topview/constructor-crystal.webp',
      standby: '/topview/constructor-standby.webp',
      error: '/topview/constructor-error.webp',
    },
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
let act: (callback: () => unknown) => unknown;
let Planner: unknown;
let imageRect: (spec: DrawingMachine, bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => { x: number; y: number; width: number; height: number };
let visualState: (...args: unknown[]) => string;
let foundationCellOrigin: (point: { x: number; y: number }) => { x: number; y: number };
let transportTurnPath: (turn: { at: { x: number; y: number; z: number }; connectionA: { x: number; y: number }; connectionB: { x: number; y: number } }, radiusM?: number) => string;

before(async () => {
  const src = readFileSync('src/components/ValidatedFactoryPlanner.tsx', 'utf8');
  const out = transformSync(src, { loader: 'tsx', jsx: 'automatic', jsxImportSource: 'preact', format: 'esm', target: 'es2022' });
  const file = 'src/components/.planner-test.mjs';
  writeFileSync(file, out.code.replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, '$1$2.ts$3'), 'utf8');
  win = new Window({ url: 'https://x.test/', width: 1400, height: 800 });
  const globals = globalThis as Record<string, unknown>;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Event', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Blob', 'URL']) {
    const value = (win as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    try { globals[key] = value; } catch { Object.defineProperty(globals, key, { value, configurable: true, writable: true }); }
  }
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globals, 'ResizeObserver', { value: TestResizeObserver, configurable: true, writable: true });
  const preact = await import('preact');
  act = (await import('preact/test-utils')).act as never;
  render = preact.render as never;
  h = preact.h as never;
  const plannerModule = await import(pathToFileURL(process.cwd() + '/' + file).href);
  Planner = plannerModule.default;
  imageRect = plannerModule.imageRect;
  visualState = plannerModule.machineVisualState as typeof visualState;
  foundationCellOrigin = plannerModule.foundationCellOrigin;
  transportTurnPath = plannerModule.transportTurnPath;
  doc = win.document as unknown as Document;
});

function mount() {
  win.localStorage.clear();
  doc.body.innerHTML = '<div id="root"></div>';
  act(() => {
    render(h(Planner, { machines }), doc.getElementById('root'));
  });
}

test('파운데이션은 커서가 들어 있는 셀의 좌상단으로 스냅한다', () => {
  assert.deepEqual(foundationCellOrigin({ x: .1, y: .1 }), { x: 0, y: 0 });
  assert.deepEqual(foundationCellOrigin({ x: 7.9, y: 7.9 }), { x: 0, y: 0 });
  assert.deepEqual(foundationCellOrigin({ x: 8, y: 8 }), { x: 8, y: 8 });
  assert.deepEqual(foundationCellOrigin({ x: -0.1, y: -0.1 }), { x: -8, y: -8 });
});

test('90도 연결부는 8개 진입·이탈 순서에서 실제 연결 벡터를 잇는다', () => {
  const pairs = [
    [[-1, 0], [0, -1]], [[0, -1], [-1, 0]],
    [[0, -1], [1, 0]], [[1, 0], [0, -1]],
    [[1, 0], [0, 1]], [[0, 1], [1, 0]],
    [[0, 1], [-1, 0]], [[-1, 0], [0, 1]],
  ] as const;
  for (const [a, b] of pairs) {
    const path = transportTurnPath({
      at: { x: 10, y: 20, z: 0 },
      connectionA: { x: a[0], y: a[1] },
      connectionB: { x: b[0], y: b[1] },
    }, 2);
    assert.equal(path, `M ${10 + a[0] * 2} ${20 + a[1] * 2} Q 10 20 ${10 + b[0] * 2} ${20 + b[1] * 2}`);
  }
});

test('Blender 기하 점유 프레임은 8×10m 그리드에 등방 배율로 정확히 맞는다', () => {
  const spec = {
    ...machines[1],
    occupancyFrame: { x: 0.136363636364, y: 0.045454545455, width: 0.727272727273, height: 0.909090909091 },
  };
  const bounds = { min: { x: -4, y: -5, z: 0 }, max: { x: 4, y: 5, z: 6 } };
  const art = imageRect(spec, bounds);
  assert.ok(Math.abs(art.width - art.height) < 1e-9, '정사영 PNG를 비등방으로 늘이면 안 된다');
  assert.ok(Math.abs(art.x + spec.occupancyFrame.x * art.width - bounds.min.x) < 1e-9);
  assert.ok(Math.abs(art.y + spec.occupancyFrame.y * art.height - bounds.min.y) < 1e-9);
  assert.ok(Math.abs(art.x + (spec.occupancyFrame.x + spec.occupancyFrame.width) * art.width - bounds.max.x) < 1e-9);
  assert.ok(Math.abs(art.y + (spec.occupancyFrame.y + spec.occupancyFrame.height) * art.height - bounds.max.y) < 1e-9);
});

test('휠 클릭은 대상 위에서도 팬하고 휠 위·아래는 포인터 중심으로 확대·축소한다', () => {
  mount();
  const svg = doc.querySelector('.vp-canvas') as SVGSVGElement;
  const before = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  act(() => {
    svg.dispatchEvent(new win.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 1, clientX: 500, clientY: 300 }) as unknown as Event);
    svg.dispatchEvent(new win.window.MouseEvent('pointermove', { bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: 620, clientY: 360 }) as unknown as Event);
    svg.dispatchEvent(new win.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 1, clientX: 620, clientY: 360 }) as unknown as Event);
  });
  const afterPan = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  assert.notEqual(afterPan[0], before[0]);
  assert.notEqual(afterPan[1], before[1]);

  const wheel = new win.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 });
  act(() => svg.dispatchEvent(wheel as unknown as Event));
  const afterZoomIn = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  assert.ok(afterZoomIn[2] < afterPan[2]);
  assert.equal(wheel.defaultPrevented, true);

  act(() => svg.dispatchEvent(new win.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }) as unknown as Event));
  const afterZoomOut = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  assert.ok(afterZoomOut[2] > afterZoomIn[2]);
});
const all = (selector: string) => [...doc.querySelectorAll(selector)];
const button = (text: string) => all('button').find((entry) => entry.textContent?.includes(text)) as HTMLElement | undefined;
const clickSvg = (entry: Element | null | undefined) => act(() => {
  entry?.dispatchEvent(new win.window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
});
const clickButton = (text: string) => clickSvg(button(text));
const clickCanvas = (x = 640, y = 360) => {
  act(() => {
    doc.querySelector('.vp-stage')?.dispatchEvent(new win.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    }) as unknown as Event);
  });
};

test('파운데이션은 빈 판에서 자체 벡터 타일로 직접 추가·삭제한다', () => {
  mount();
  assert.equal(all('.vp-foundation').length, 0);
  const foundationTool = button('파운데이션');
  clickSvg(foundationTool);
  assert.equal(all('.vp-foundation').length, 0);
  assert.equal(foundationTool?.classList.contains('is-armed'), true);
  clickCanvas();
  assert.equal(all('.vp-foundation').length, 1);
  assert.equal(all('.vp-foundation image').length, 0);
  assert.equal(all('.vp-foundation-panel').length, 1);
  assert.equal(doc.querySelector('.vp-foundation rect')?.getAttribute('width'), '8');
  assert.equal(foundationTool?.classList.contains('is-armed'), true);
  clickCanvas(760, 360);
  assert.equal(all('.vp-foundation').length, 2);
  clickSvg(doc.querySelector('[data-action="delete-selection"]'));
  assert.equal(all('.vp-foundation').length, 1);
});

test('기계를 회전해도 문자 배지 없이 실제 포트부터 하드 경계까지 연결 레인을 강조한다', () => {
  mount();
  clickButton('제련기');
  clickCanvas();
  assert.equal(all('.vp-port-label').length, 0);
  assert.equal(all('.vp-port-lane').length, 2);
  assert.deepEqual(all('.vp-port-lane').map((entry) => entry.getAttribute('d')), ['M 0 0 L 0 -1.8', 'M 0 0 L 0 1.8']);
  assert.deepEqual(all('.vp-port title').map((entry) => entry.textContent?.split(' · ')[0]), ['입력', '출력']);
  assert.equal(all('.vp-machine-size').length, 0);
  assert.equal(all('.vp-machine-label').length, 0);
  clickButton('90° 회전');
  assert.match(doc.querySelector('.vp-placement')?.getAttribute('transform') ?? '', /rotate\(90\)/);
  assert.doesNotMatch(doc.querySelector('.vp-port')?.getAttribute('transform') ?? '', /rotate/);
});

test('실제 포트를 연결하면 외부 이미지 없이 자체 컨베이어 구간이 생긴다', () => {
  mount();
  clickButton('제련기');
  clickCanvas(430, 360);
  clickButton('제작기');
  clickCanvas(800, 360);
  clickSvg(all('.vp-placement')[0]?.querySelector('.vp-port.is-output'));
  clickSvg(all('.vp-placement')[1]?.querySelector('.vp-port.is-input'));
  assert.equal(all('.vp-route[aria-label="컨베이어 벨트"]').length, 1);
  assert.ok(all('.vp-belt-surface').length > 0);
  assert.ok(all('.vp-belt-slat').length > 0);
  assert.equal(all('.vp-route image').length, 0);
});

test('전체 초기화는 설비·토대·물류를 한 번에 비운다', () => {
  mount();
  clickButton('파운데이션');
  clickCanvas();
  clickButton('제련기');
  clickCanvas(400, 360);
  clickButton('전체 초기화');
  assert.equal(all('.vp-foundation').length, 0);
  assert.equal(all('.vp-placement').length, 0);
  assert.equal(all('.vp-route').length, 0);
  assert.match(doc.body.textContent ?? '', /EMPTY_PLAN/);
});

test('경광등은 입출력 누락과 품목 불일치 연결에서 빨강 자산을 유지한다', () => {
  mount();
  clickButton('제련기'); clickCanvas(330, 360);
  clickButton('제작기'); clickCanvas(640, 360);
  clickButton('제련기'); clickCanvas(950, 360);
  const placements = all('.vp-placement');
  assert.equal(placements[1].querySelector('.vp-machine-image')?.getAttribute('href'), '/topview/constructor-error.webp');
  clickSvg(placements[0].querySelector('.vp-port.is-output'));
  clickSvg(placements[1].querySelector('.vp-port.is-input'));
  clickSvg(placements[1].querySelector('.vp-port.is-output'));
  clickSvg(placements[2].querySelector('.vp-port.is-input'));
  assert.equal(all('.vp-route[aria-label="컨베이어 벨트"]').length, 2);
  assert.equal(placements[1].querySelector('.vp-machine-image')?.getAttribute('href'), '/topview/constructor-error.webp');
});

test('60/분 생산기를 30/분 소비기에 연결하면 생산기는 노랑, 소비기는 초록이다', () => {
  const producerSpec = { buildingClass: 'Miner', name: '채굴기', hardBoxes: [], powerDemandMW: 0, ports: [{ id: 'out', direction: 'output', medium: 'solid' }] };
  const consumerSpec = { buildingClass: 'Smelter', name: '제련기', hardBoxes: [], powerDemandMW: 4, ports: [{ id: 'in', direction: 'input', medium: 'solid' }] };
  const producer = { id: 'miner', spec: producerSpec, positionM: { x: 0, y: 0, z: 0 }, rotation: 0, operation: { inputRates: {}, outputRates: { ore: 60 }, clockPercent: 100 } };
  const consumer = { id: 'smelter', spec: consumerSpec, positionM: { x: 0, y: 10, z: 0 }, rotation: 0, operation: { inputRates: { ore: 30 }, outputRates: {}, clockPercent: 100, powerShards: 0 } };
  const route = { id: 'route', from: { placementId: 'miner', portId: 'out' }, to: { placementId: 'smelter', portId: 'in' }, medium: 'solid', itemId: 'ore', flowPerMinute: 60, capacityPerMinute: 60, pathM: [] };
  assert.equal(visualState(producer, producerSpec, [producer, consumer], [route], []), 'standby');
  assert.equal(visualState(consumer, consumerSpec, [producer, consumer], [route], []), 'active');
  consumer.operation.clockPercent = 150;
  consumer.operation.powerShards = 1;
  assert.equal(visualState(consumer, consumerSpec, [producer, consumer], [route], []), 'activeWithCrystal');
});

test('실행 취소·다시 실행은 최근 50단계의 편집 상태를 복원한다', () => {
  mount();
  for (let index = 0; index < 51; index += 1) {
    clickButton('제련기');
    clickCanvas();
  }
  assert.equal(all('.vp-placement').length, 51);
  for (let index = 0; index < 50; index += 1) clickButton('실행 취소');
  assert.equal(all('.vp-placement').length, 1);
  assert.equal((button('실행 취소') as HTMLButtonElement).disabled, true);
  for (let index = 0; index < 50; index += 1) clickButton('다시 실행');
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
  clickButton('파운데이션');
  clickCanvas();
  clickButton('제련기');
  clickCanvas();
  const layerInput = (label: string) => all('.vp-layers label')
    .find((entry) => entry.textContent?.includes(label))?.querySelector('input') as HTMLInputElement;
  clickSvg(layerInput('토대'));
  assert.equal(all('.vp-foundation').length, 0);
  assert.equal(all('.vp-placement').length, 1);
  clickSvg(layerInput('설비'));
  assert.equal(all('.vp-placement').length, 0);
  clickSvg(layerInput('토대'));
  clickSvg(layerInput('설비'));
  assert.equal(all('.vp-foundation').length, 1);
  assert.equal(all('.vp-placement').length, 1);
});

test('도면 맞춤은 배치된 공정을 화면 중심으로 가져온다', () => {
  mount();
  clickButton('파운데이션');
  clickCanvas();
  clickButton('제련기');
  clickCanvas();
  clickButton('도면 맞춤');
  assert.match(doc.querySelector('.vp-notice')?.textContent ?? '', /도면 전체를 화면에 맞췄습니다/);
});

test('기기 레시피·클럭·소머슬룹을 설정하면 계산 유량이 바뀐다', () => {
  mount();
  clickButton('제작기');
  clickCanvas();
  const selects = all('.vp-machine-config select') as HTMLSelectElement[];
  selects[0].value = 'Recipe_Alternate_IronPlate_C';
  act(() => selects[0].dispatchEvent(new win.window.Event('change', { bubbles: true }) as unknown as Event));
  const clock = doc.querySelector('.vp-machine-config input') as HTMLInputElement;
  clock.value = '200';
  act(() => clock.dispatchEvent(new win.window.Event('input', { bubbles: true }) as unknown as Event));
  const sloop = all('.vp-machine-config select').at(-1) as HTMLSelectElement;
  sloop.value = '1';
  act(() => sloop.dispatchEvent(new win.window.Event('change', { bubbles: true }) as unknown as Event));
  assert.match(doc.querySelector('.vp-rate-summary')?.textContent ?? '', /출력 철판 120\/분/);
  assert.match(doc.querySelector('.vp-rate-summary')?.textContent ?? '', /계산 전력/);
});
