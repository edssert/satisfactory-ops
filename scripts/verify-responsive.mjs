#!/usr/bin/env node
/**
 * verify-responsive.mjs — 핵심 도메인을 360~3840px 실제 Chromium에서 전수 검사한다.
 *
 * 짧은 수치 배지의 폭을 눌림으로 오인하지 않고, 사용자가 실제로 잃는 것만 본다:
 * 문서 가로 스크롤, 주 콘텐츠의 뷰포트 이탈, 제목 잘림, 런타임 오류, 404.
 *
 * 사용: npm run test:responsive
 * 전제: npm run build로 dist/가 생성되어 있어야 한다.
 * 종료: 0 통과 · 1 반응형/런타임 계약 실패
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const WIDTHS = [360, 390, 768, 1024, 1440, 1920, 3840];
const ROUTES = [
  ['홈', '/'],
  ['가이드', '/guide/'],
  ['설계', '/planner/'],
  ['직접 만들기', '/builder/'],
  ['지도', '/map/'],
  ['진단', '/checkup/'],
  ['도감', '/dex/'],
  ['도구', '/tools/'],
  ['변경 기록', '/versions/'],
];
const MIME = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  throw new Error('dist/index.html이 없습니다. npm run build를 먼저 실행하세요.');
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let current = '초기화';
const runtimeErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(`${current}: ${message.text()}`);
});
page.on('pageerror', (error) => runtimeErrors.push(`${current}: ${String(error)}`));

try {
  for (const [label, route] of ROUTES) {
    for (const width of WIDTHS) {
      current = `${label} ${width}px`;
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      assert(response?.ok(), `${current} 응답 실패: ${response?.status() ?? '없음'}`);
      await page.waitForTimeout(180);

      const state = await page.evaluate(() => {
        const documentBox = document.scrollingElement;
        const main = document.querySelector('main')?.getBoundingClientRect();
        const heading = document.querySelector('main h1')?.getBoundingClientRect();
        const headingStyle = document.querySelector('main h1')
          ? getComputedStyle(document.querySelector('main h1'))
          : null;
        return {
          viewport: document.documentElement.clientWidth,
          documentWidth: documentBox?.scrollWidth ?? 0,
          main: main ? { left: main.left, right: main.right, width: main.width } : null,
          heading: heading ? { left: heading.left, right: heading.right, width: heading.width, height: heading.height } : null,
          headingClipped: headingStyle ? /hidden|clip/.test(`${headingStyle.overflowX} ${headingStyle.overflowY}`) : false,
        };
      });

      assert(state.documentWidth <= state.viewport + 1,
        `${current} 문서 가로 넘침: ${state.documentWidth}>${state.viewport}`);
      assert(state.main && state.main.left >= -1 && state.main.right <= state.viewport + 1,
        `${current} 주 콘텐츠가 뷰포트를 이탈했습니다: ${JSON.stringify(state.main)}`);
      assert(state.heading && state.heading.width > 32 && state.heading.height > 20,
        `${current} 제목이 보이지 않거나 비정상적으로 눌렸습니다: ${JSON.stringify(state.heading)}`);
      assert(!state.headingClipped, `${current} 제목에 잘림 overflow가 적용됐습니다.`);
    }
    console.log(`PASS  ${label} — ${WIDTHS.join('·')}px`);
  }

  assert(runtimeErrors.length === 0, `반응형 검사 중 콘솔 오류:\n${runtimeErrors.slice(0, 10).join('\n')}`);
  assert(missed.length === 0, `반응형 검사 중 404: ${[...new Set(missed)].join(', ')}`);
  console.log(`PASS  핵심 ${ROUTES.length}개 도메인 × ${WIDTHS.length}개 폭 = ${ROUTES.length * WIDTHS.length}개 렌더`);
  console.log('PASS  문서 넘침·주 콘텐츠 이탈·제목 잘림·런타임 오류·404 없음');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
