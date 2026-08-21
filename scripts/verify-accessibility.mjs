#!/usr/bin/env node
/**
 * verify-accessibility.mjs — 화면 템플릿 전부를 axe-core와 실제 키보드로 검사한다.
 *
 * 사용: npm run test:a11y
 * 전제: npm run build로 dist/가 생성되어 있어야 한다.
 * 종료: 0 WCAG 2.2 AA·키보드·포커스·비색상 라벨 계약 통과 · 1 실패
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const AXE = fs.readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8');
const ROUTES = [
  ['홈', '/'],
  ['가이드', '/guide/'],
  ['시작 지역', '/guide/start/'],
  ['설계', '/planner/'],
  ['직접 만들기', '/builder/'],
  ['지도', '/map/'],
  ['진단', '/checkup/'],
  ['도감', '/dex/'],
  ['티어', '/dex/tiers/0/'],
  ['MAM', '/dex/mam/quartz/'],
  ['싱크 상점', '/dex/shop/foundations/'],
  ['제작법', '/dex/recipes/'],
  ['레퍼런스', '/dex/reference/'],
  ['도구', '/tools/'],
  ['변경 기록', '/versions/'],
];
const WIDTHS = [390, 1440];
const MIME = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist가 없습니다. npm run build를 먼저 실행하세요.');
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
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const runtimeErrors = [];
let current = '초기화';
page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(`${current}: ${message.text()}`));
page.on('pageerror', (error) => runtimeErrors.push(`${current}: ${String(error)}`));

try {
  for (const [label, route] of ROUTES) {
    for (const width of WIDTHS) {
      current = `${label} ${width}px`;
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      assert(response?.ok(), `${current} 응답 실패: ${response?.status() ?? '없음'}`);
      await page.waitForTimeout(120);
      await page.addScriptTag({ content: AXE });

      const result = await page.evaluate(async () => window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      }));
      if (result.violations.length) {
        const details = result.violations.map((violation) => {
          const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(', ');
          return `${violation.id}(${violation.impact ?? '영향 미상'}): ${targets}`;
        }).join('\n');
        throw new Error(`${current} axe 위반 ${result.violations.length}건:\n${details}`);
      }

      await page.keyboard.press('Tab');
      const firstFocus = await page.evaluate(() => ({
        skip: document.activeElement?.classList.contains('skip') ?? false,
        outline: getComputedStyle(document.activeElement).outlineStyle,
      }));
      assert(firstFocus.skip, `${current} 첫 Tab이 본문 건너뛰기 링크로 가지 않습니다.`);
      assert(firstFocus.outline !== 'none', `${current} 첫 포커스에 가시적 outline이 없습니다.`);

      for (let index = 0; index < 7; index++) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          const rect = element?.getBoundingClientRect();
          const style = element ? getComputedStyle(element) : null;
          return {
            tag: element?.tagName ?? '',
            outline: style?.outlineStyle ?? 'none',
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            left: rect?.left ?? -1,
            right: rect?.right ?? -1,
          };
        });
        assert(focus.tag && focus.tag !== 'BODY', `${current} Tab ${index + 2}에서 포커스를 잃었습니다.`);
        assert(focus.outline !== 'none', `${current} ${focus.tag} 포커스가 보이지 않습니다.`);
        assert(focus.width > 0 && focus.height > 0, `${current} 숨은 요소가 Tab 순서에 들어왔습니다.`);
        assert(focus.right >= 0 && focus.left <= width, `${current} 포커스가 가로 뷰포트 밖에 있습니다.`);
      }
    }
    console.log(`PASS  ${label} — axe WCAG 2.2 AA · 390/1440px · 키보드 포커스`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/map/`, { waitUntil: 'networkidle' });
  assert(await page.getByText('순수', { exact: true }).count() > 0, '지도 순도 색에 순수 텍스트가 없습니다.');
  assert(await page.getByText('보통', { exact: true }).count() > 0, '지도 순도 색에 보통 텍스트가 없습니다.');
  assert(await page.getByText('불순', { exact: true }).count() > 0, '지도 순도 색에 불순 텍스트가 없습니다.');
  await page.goto(`${origin}/planner/`, { waitUntil: 'networkidle' });
  assert((await page.locator('.vp-status strong').textContent())?.trim(), '설계판 검증 상태가 색상 외 텍스트를 갖지 않습니다.');
  await page.goto(`${origin}/guide/`, { waitUntil: 'networkidle' });
  assert(await page.locator('.confidence').count() === 10, '가이드 신뢰도 텍스트가 모든 단계에 있지 않습니다.');
  console.log('PASS  지도 순도·설계 검증·가이드 신뢰도에 비색상 텍스트 라벨 존재');

  assert(runtimeErrors.length === 0, `접근성 검사 중 콘솔 오류:\n${runtimeErrors.slice(0, 10).join('\n')}`);
  assert(missed.length === 0, `접근성 검사 중 404: ${[...new Set(missed)].join(', ')}`);
  console.log(`PASS  화면 템플릿 ${ROUTES.length}개 × 2개 폭 = ${ROUTES.length * WIDTHS.length}개 접근성 렌더`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
