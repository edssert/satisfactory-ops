#!/usr/bin/env node
/**
 * verify-guide-ui.mjs — 진행 가이드의 실제 Chromium 구조·반응형·앵커·키보드 계약을 검증한다.
 *
 * 사용: npm run test:guide-ui
 * 전제: npm run build로 dist/가 생성되어 있어야 한다.
 * 종료: 0 통과 · 1 렌더/접근성/반응형 계약 실패
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
if (!fs.existsSync(path.join(DIST, 'guide', 'index.html'))) throw new Error('dist/guide/index.html이 없습니다. npm run build를 먼저 실행하세요.');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const missed = [];
const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length);
  let file = path.join(DIST, pathname);
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    missed.push(pathname);
    response.writeHead(404).end('없음');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}${BASE}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const runtimeErrors = [];
page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()));
page.on('pageerror', (error) => runtimeErrors.push(String(error)));

try {
  await page.goto(`${origin}/guide/`, { waitUntil: 'networkidle' });
  assert(await page.locator('h1').count() === 1, '가이드 h1은 하나여야 합니다.');
  assert(await page.locator('.step[data-step]').count() === 10, '티어 0~9 단계 10개가 렌더되어야 합니다.');
  assert(await page.locator('.completion').count() === 10, '모든 단계에 완료 상태가 있어야 합니다.');
  assert(await page.locator('.sequence').count() === 10, '모든 단계에 시공·검증 순서가 있어야 합니다.');
  assert(await page.locator('table').count() > 0, '운전 기준은 네이티브 표로 렌더되어야 합니다.');

  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement?.classList.contains('skip')), '첫 Tab 초점이 본문 건너뛰기 링크에 가지 않습니다.');
  await page.keyboard.press('Enter');
  assert((await page.url()).endsWith('#main'), '본문 건너뛰기 링크가 #main으로 이동하지 않습니다.');

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/guide/`, { waitUntil: 'networkidle' });
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      completion: document.querySelector('.completion')?.getBoundingClientRect().width ?? 0,
    }));
    assert(geometry.document <= geometry.viewport + 1, `${width}px에서 문서 가로 넘침: ${geometry.document}>${geometry.viewport}`);
    assert(geometry.completion > Math.min(300, width - 50), `${width}px에서 완료 상태 상자가 비정상적으로 눌렸습니다.`);
    console.log(`PASS  ${width}px 가이드 재배치와 가로 넘침 없음`);
  }

  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${origin}/guide/#t8-nuclear`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const anchor = await page.evaluate(() => {
    const header = document.querySelector('.site-head')?.getBoundingClientRect();
    const heading = document.querySelector('#t8-nuclear h2')?.getBoundingClientRect();
    return { headerBottom: header?.bottom ?? 0, headingTop: heading?.top ?? -1 };
  });
  assert(anchor.headingTop >= anchor.headerBottom - 1, `직접 링크 제목이 고정 헤더에 가려집니다: ${anchor.headingTop}<${anchor.headerBottom}`);
  console.log('PASS  직접 링크 제목이 고정 헤더 아래에 보임');

  await page.goto(`${origin}/guide/start/`, { waitUntil: 'networkidle' });
  assert(await page.locator('.area').count() === 4, '시작 지역 4곳이 모두 렌더되어야 합니다.');
  assert(await page.locator('table.cmp').count() === 1, '시작 지역 비교표가 없습니다.');
  assert(runtimeErrors.length === 0, `가이드 검사 중 콘솔 오류: ${runtimeErrors.join(' | ')}`);
  assert(missed.length === 0, `가이드 검사 중 404: ${[...new Set(missed)].join(', ')}`);
  console.log('PASS  키보드 건너뛰기·네이티브 표·시작 지역 4곳');
  console.log('PASS  가이드 런타임 오류와 404 없음');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

