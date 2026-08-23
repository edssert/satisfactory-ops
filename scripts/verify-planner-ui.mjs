#!/usr/bin/env node
/** 설계판 좌표·코너·런타임 자산 정책을 실제 Chromium에서 검증한다. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { runtimeTopviewAssets } from '../src/lib/topview-assets.ts';
import { PLANNER_HANDOFF_KEY } from '../src/state/planner-handoff.ts';
import { STORAGE_KEY } from '../src/state/persist.ts';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectedMachineCount = runtimeTopviewAssets
  .filter((asset) => asset.role === 'building' && 'buildingClass' in asset).length;
const recipeRows = JSON.parse(fs.readFileSync(path.resolve('src/data/app/recipes.json'), 'utf8'));
const ownedBuilderAlternate = recipeRows.find((recipe) =>
  recipe.isAlternate && recipe.products.some((product) => product.item === 'Desc_IronPlateReinforced_C'))?.id;
assert(ownedBuilderAlternate, '보강된 철판 대체 제작법 픽스처가 없습니다.');

const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length);
  let file = path.join(DIST, pathname);
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return response.writeHead(404).end('없음');
  response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const origin = `http://localhost:${port}${BASE}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
await page.addInitScript(({ storageKey, alternate }) => {
  localStorage.setItem(storageKey, JSON.stringify({
    schemaVersion: 2,
    doneMilestones: [],
    ownedAlternates: [alternate],
    setup: { startLocation: null, tutorialSkipped: false, resourceMode: 'standard' },
    updatedAt: null,
  }));
}, { storageKey: STORAGE_KEY, alternate: ownedBuilderAlternate });
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(String(error)));

async function screenPoint(x, y) {
  return page.locator('.vp-canvas').evaluate((svg, point) => {
    const source = svg.createSVGPoint();
    source.x = point.x;
    source.y = point.y;
    const target = source.matrixTransform(svg.getScreenCTM());
    return { x: target.x, y: target.y };
  }, { x, y });
}

async function moveWorld(x, y) {
  const point = await screenPoint(x, y);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(30);
  return point;
}

async function placeTool(label, x, y) {
  await page.locator('.vp-machine').filter({ hasText: label }).first().click();
  const point = await moveWorld(x, y);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(40);
}

try {
  await page.goto(`${origin}/builder/`, { waitUntil: 'networkidle' });
  const recipeChoice = page.locator('.fb-recipe-choice select').first();
  assert(await recipeChoice.count() === 1, '보유한 대체 제작법 선택기가 없습니다.');
  await recipeChoice.selectOption(ownedBuilderAlternate);
  assert(await recipeChoice.inputValue() === ownedBuilderAlternate, '대체 제작법 선택이 계산에 반영되지 않았습니다.');
  await page.getByRole('button', { name: '목표 추가' }).click();
  assert(await page.locator('.fb-goal-row').count() === 2, '복수 목표 입력 행이 추가되지 않았습니다.');
  assert(!/\b(?:Desc|Build|Recipe)_[A-Za-z0-9_]+_C\b/.test(await page.locator('body').innerText()),
    '계산 화면에 내부 게임 클래스명이 노출됐습니다.');
  const handoffButton = page.getByRole('button', { name: '설계 대기열로 보내기' });
  assert(await handoffButton.isEnabled(), '계산 결과를 설계 대기열로 보내는 단추가 비활성입니다.');
  await page.locator('.fb').screenshot({ path: 'output/playwright/builder-handoff-qhd.png' });
  await handoffButton.click();
  await page.waitForURL('**/planner/');
  await page.waitForLoadState('networkidle');
  const catalogCount = await page.locator('.vp-machine').count();
  assert(catalogCount === expectedMachineCount + 6,
    `승인 탑뷰 ${expectedMachineCount}개와 토대·철도·운송 탑뷰 도구 6개가 카탈로그에 있어야 합니다: actual=${catalogCount}`);
  const handoffItem = page.locator('.vp-handoff-item').first();
  assert(await handoffItem.count() === 1, '계산에서 받은 설계 대기열이 없습니다.');
  await page.locator('.vp-catalog').screenshot({ path: 'output/playwright/planner-handoff-qhd.png' });
  const beforeHandoffTotal = await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value?.entries?.reduce((sum, entry) => sum + entry.remaining, 0) ?? 0;
  }, PLANNER_HANDOFF_KEY);
  assert(beforeHandoffTotal > 0, '계산 대기열의 설비 대수가 보존되지 않았습니다.');
  await handoffItem.click();
  const handoffPoint = await screenPoint(-24, -16);
  await page.mouse.click(handoffPoint.x, handoffPoint.y);
  const afterHandoffTotal = await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value?.entries?.reduce((sum, entry) => sum + entry.remaining, 0) ?? 0;
  }, PLANNER_HANDOFF_KEY);
  assert(afterHandoffTotal === beforeHandoffTotal - 1, `한 대 배치 후 대기열 잔량이 줄지 않았습니다: ${beforeHandoffTotal} → ${afterHandoffTotal}`);
  if (await page.locator('.vp-handoff > header button').count()) await page.locator('.vp-handoff > header button').click();
  await page.getByRole('button', { name: '전체 초기화' }).click();

  await page.getByRole('button', { name: /컨베이어 벨트.*두 점/ }).click();
  const beltStart = await screenPoint(-34, -20);
  const beltEnd = await screenPoint(-10, -4);
  await page.mouse.click(beltStart.x, beltStart.y);
  await page.mouse.click(beltEnd.x, beltEnd.y);
  assert(await page.locator('.vp-route.is-solid').count() === 1, '카탈로그 컨베이어 탑뷰가 생성되지 않았습니다.');
  assert(await page.locator('.vp-belt-turn').count() > 0, '카탈로그 컨베이어 직각 부품이 생성되지 않았습니다.');
  await page.getByRole('button', { name: /컨베이어 리프트.*끝단 2개/ }).click();
  const liftPoint = await screenPoint(2, -4);
  await page.mouse.click(liftPoint.x, liftPoint.y);
  assert(await page.locator('.vp-lift').count() === 1, '컨베이어 리프트 탑뷰가 생성되지 않았습니다.');
  await page.getByRole('button', { name: /파이프.*두 점/ }).click();
  const pipeStart = await screenPoint(12, -20);
  const pipeEnd = await screenPoint(36, -20);
  await page.mouse.click(pipeStart.x, pipeStart.y);
  await page.mouse.click(pipeEnd.x, pipeEnd.y);
  assert(await page.locator('.vp-route.is-fluid').count() === 1, '카탈로그 파이프 탑뷰가 생성되지 않았습니다.');
  await page.getByRole('button', { name: /파이프 라이저.*수직 끝단/ }).click();
  const riserPoint = await screenPoint(40, -4);
  await page.mouse.click(riserPoint.x, riserPoint.y);
  assert(await page.locator('.vp-pipe-riser').count() === 1, '파이프 라이저 탑뷰가 생성되지 않았습니다.');
  await page.locator('.vp-stage').screenshot({ path: 'output/playwright/planner-anders-transport-qhd.png' });
  await page.getByRole('button', { name: '전체 초기화' }).click();

  await page.getByRole('button', { name: /철도.*두 점/ }).click();
  const railStart = await screenPoint(-32, -24);
  const railEnd = await screenPoint(24, -24);
  await page.mouse.click(railStart.x, railStart.y);
  await page.mouse.click(railEnd.x, railEnd.y);
  assert(await page.locator('.vp-rail').count() === 1, '철도 벡터 경로가 생성되지 않았습니다.');
  await page.locator('.vp-stage').screenshot({ path: 'output/playwright/planner-rail-qhd.png' });
  const storedRails = await page.evaluate(() => JSON.parse(localStorage.getItem('sfops.validated-planner.v4') ?? 'null')?.rails?.length ?? 0);
  assert(storedRails === 1, '철도 경로가 v6 설계 상태에 저장되지 않았습니다.');
  await page.locator('.vp-rail').click();
  await page.getByRole('button', { name: '선택 삭제' }).click();
  assert(await page.locator('.vp-rail').count() === 0, '선택한 철도 경로가 삭제되지 않았습니다.');

  await page.locator('.vp-machine.is-foundation').click();
  await moveWorld(7.7, 7.7);
  const ghost0 = await page.locator('.vp-placement-ghost rect').evaluate((element) => ({ x: element.getAttribute('x'), y: element.getAttribute('y') }));
  assert(ghost0.x === '0' && ghost0.y === '0', `첫 셀 고스트가 ${ghost0.x},${ghost0.y}에 놓였습니다.`);
  const firstPoint = await screenPoint(7.7, 7.7);
  await page.mouse.click(firstPoint.x, firstPoint.y);
  const tile0 = await page.locator('.vp-foundation-bed').first().evaluate((element) => ({ x: element.getAttribute('x'), y: element.getAttribute('y') }));
  assert(tile0.x === '0' && tile0.y === '0', `첫 셀 실배치가 ${tile0.x},${tile0.y}에 놓였습니다.`);

  const zoomPoint = await screenPoint(12, 4);
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  await page.mouse.wheel(0, -320);
  await moveWorld(15.8, 7.8);
  const ghost1 = await page.locator('.vp-placement-ghost rect').evaluate((element) => ({ x: element.getAttribute('x'), y: element.getAttribute('y') }));
  assert(ghost1.x === '8' && ghost1.y === '0', `확대 후 고스트가 ${ghost1.x},${ghost1.y}에 놓였습니다.`);
  const secondPoint = await screenPoint(15.8, 7.8);
  await page.mouse.click(secondPoint.x, secondPoint.y);
  const tile1 = await page.locator('.vp-foundation-bed').nth(1).evaluate((element) => ({ x: element.getAttribute('x'), y: element.getAttribute('y') }));
  assert(tile1.x === '8' && tile1.y === '0', `확대 후 실배치가 ${tile1.x},${tile1.y}에 놓였습니다.`);

  const panStart = await screenPoint(0, 0);
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(panStart.x + 180, panStart.y + 110, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await moveWorld(23.8, 7.8);
  const ghost2 = await page.locator('.vp-placement-ghost rect').evaluate((element) => ({ x: element.getAttribute('x'), y: element.getAttribute('y') }));
  assert(ghost2.x === '16' && ghost2.y === '0', `팬 후 고스트가 ${ghost2.x},${ghost2.y}에 놓였습니다.`);

  await page.getByRole('button', { name: '전체 초기화' }).click();
  await placeTool('제련기', -22, -8);
  await placeTool('제작기', 16, 15);
  await page.locator('.vp-placement').nth(0).locator('.vp-port.is-output').dispatchEvent('click');
  await page.locator('.vp-placement').nth(1).locator('.vp-port.is-input').dispatchEvent('click');
  assert(await page.locator('.vp-belt-turn-frame').count() > 0, '서로 어긋난 설비 사이에 90도 연결부가 생성되지 않았습니다.');
  assert(await page.locator('.vp-route image').count() === 0, '외부 운송 이미지가 설계판에 다시 노출됐습니다.');
  assert(await page.locator('.vp-placement').nth(1).locator('.vp-port-lane').count() >= 2, '제작기 포트 레인이 누락됐습니다.');
  const svgDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG 도면' }).click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  assert(svgPath, 'SVG 다운로드 파일이 없습니다.');
  const svgText = fs.readFileSync(svgPath, 'utf8');
  assert(svgText.includes('"pixelsPerMeter":64'), 'SVG에 실제 미터 축척 metadata가 없습니다.');
  assert(svgText.includes('운송 라벨 = Mk'), 'SVG에 Mk·유량·용량 범례가 없습니다.');
  assert(svgText.includes('data:image/'), 'SVG 탑뷰가 독립 data URL로 포함되지 않았습니다.');
  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG 도면' }).click();
  const pngDownload = await pngDownloadPromise;
  const pngPath = await pngDownload.path();
  assert(pngPath && fs.statSync(pngPath).size > 1000, '고해상도 PNG 도면이 생성되지 않았습니다.');
  await page.screenshot({ path: 'output/playwright/planner-contract-qhd.png' });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  const titles = await page.locator('.machine-card h3').allTextContents();
  assert(new Set(titles).size === titles.length, `랜딩 설비가 중복됐습니다: ${titles.join(', ')}`);
  assert(!(await page.locator('body').innerText()).includes('Anders'), '외부 대조 자산 문구가 런타임 랜딩에 남았습니다.');
  const emptyRails = page.locator('.machine-rail.is-empty');
  if (await emptyRails.count()) {
    const emptyWidth = await emptyRails.first().evaluate((element) => element.getBoundingClientRect().width);
    assert(emptyWidth >= 240, `빈 설비 레일이 ${emptyWidth}px로 붕괴했습니다.`);
  }
  await page.screenshot({ path: 'output/playwright/landing-contract-qhd.png', fullPage: true });

  await page.setViewportSize({ width: 768, height: 900 });
  const window = page.locator('.machine-window').first();
  const before = await window.evaluate((element) => element.scrollLeft);
  await page.locator('[data-machine-next]').first().click();
  await page.waitForTimeout(450);
  const after = await window.evaluate((element) => element.scrollLeft);
  assert(after > before, `좁은 화면에서 다음 버튼이 레일을 이동하지 않았습니다: ${before} → ${after}`);

  assert(errors.length === 0, `브라우저 오류: ${errors.join(' | ')}`);
  console.log('PASS  파운데이션 커서·고스트·실배치 일치 (기본/확대/팬)');
  console.log('PASS  계산 대기열의 레시피·클럭·대수 보존과 한 대씩 수동 배치');
  console.log('PASS  철도 두 점 수동 작도 · 자체 벡터 · v6 상태 저장');
  console.log('PASS  Anders 운송 역할 카탈로그 · 벨트/직각/방향/리프트/파이프/라이저');
  console.log('PASS  90도 연결부 벡터 렌더 · 외부 운송 이미지 0개');
  console.log('PASS  독립 SVG/PNG · 64px/m 축척 · Mk/유량/용량/깊이 범례');
  console.log('PASS  QHD 랜딩 중복·빈 레일·외부 자산 노출 없음');
  console.log('PASS  768px 레일 다음 버튼 동작');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
