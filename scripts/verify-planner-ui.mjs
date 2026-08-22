#!/usr/bin/env node
/** 설계판 좌표·코너·런타임 자산 정책을 실제 Chromium에서 검증한다. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const assert = (condition, message) => { if (!condition) throw new Error(message); };

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
  await page.goto(`${origin}/planner/`, { waitUntil: 'networkidle' });
  assert(await page.locator('.vp-machine').count() === 4, '자체 제작 승인 설비 3개와 파운데이션만 카탈로그에 있어야 합니다.');

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
  await page.screenshot({ path: 'output/playwright/planner-contract-qhd.png' });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  const titles = await page.locator('.machine-card h3').allTextContents();
  assert(new Set(titles).size === titles.length, `랜딩 설비가 중복됐습니다: ${titles.join(', ')}`);
  assert(!(await page.locator('body').innerText()).includes('Anders'), '외부 대조 자산 문구가 런타임 랜딩에 남았습니다.');
  const emptyWidth = await page.locator('.machine-rail.is-empty').first().evaluate((element) => element.getBoundingClientRect().width);
  assert(emptyWidth >= 240, `빈 설비 레일이 ${emptyWidth}px로 붕괴했습니다.`);
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
  console.log('PASS  90도 연결부 벡터 렌더 · 외부 운송 이미지 0개');
  console.log('PASS  QHD 랜딩 중복·빈 레일·외부 자산 노출 없음');
  console.log('PASS  768px 레일 다음 버튼 동작');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
