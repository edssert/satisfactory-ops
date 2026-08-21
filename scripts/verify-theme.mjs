#!/usr/bin/env node
/**
 * verify-theme.mjs — 실제 Chromium에서 테마 전환·지속·역할 대비를 검증한다.
 *
 * 사용: npm run test:theme
 * 전제: npm run build로 dist/가 생성되어 있어야 한다.
 * 종료 코드: 0 계약 통과 · 1 테마/대비/런타임 실패
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/index.html이 없습니다. npm run build를 먼저 실행하세요.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const runtimeErrors = [];
page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()));
page.on('pageerror', (error) => runtimeErrors.push(String(error)));

const checks = [
  ['text-primary', 'canvas', 7],
  ['text-secondary', 'canvas', 4.5],
  ['text-tertiary', 'canvas', 4.5],
  ['text-primary', 'layer-1', 7],
  ['text-secondary', 'layer-1', 4.5],
  ['text-tertiary', 'layer-1', 4.5],
  ['brand-strong', 'layer-1', 4.5],
  ['status-ok', 'layer-1', 4.5],
  ['status-danger', 'layer-1', 4.5],
  ['status-warning', 'layer-1', 4.5],
  ['on-action', 'action', 4.5],
  ['border-strong', 'layer-1', 3],
];

async function audit(theme) {
  return page.evaluate(({ theme, checks }) => {
    document.documentElement.dataset.theme = theme;
    const root = getComputedStyle(document.documentElement);
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      return parts.map((channel) => {
        const v = channel / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    };
    const luminance = (value) => {
      const rgb = parse(value);
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const resolved = (name, property) => {
      const probe = document.createElement('i');
      probe.style[property] = `var(--${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe)[property];
      probe.remove();
      return value;
    };
    return checks.map(([foreground, background, minimum]) => {
      const fg = resolved(foreground, 'color');
      const bg = resolved(background, 'backgroundColor');
      const a = luminance(fg);
      const b = luminance(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { foreground, background, minimum, ratio, fg, bg, root: root.getPropertyValue(`--${foreground}`).trim() };
    });
  }, { theme, checks });
}

try {
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  assert(await page.locator('html').getAttribute('data-theme') === 'dark', '최초 진입 기본 테마가 다크가 아닙니다.');
  await page.locator('.theme-toggle').click();
  assert(await page.locator('html').getAttribute('data-theme') === 'light', '테마 버튼이 라이트로 전환하지 못했습니다.');
  assert(await page.evaluate(() => localStorage.getItem('sfops-theme')) === 'light', '라이트 선택이 localStorage에 저장되지 않았습니다.');
  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.locator('html').getAttribute('data-theme') === 'light', '새로고침 뒤 라이트 선택이 복원되지 않았습니다.');

  for (const theme of ['dark', 'light']) {
    const results = await audit(theme);
    const failed = results.filter((result) => !result.root || result.ratio + 0.01 < result.minimum);
    assert(failed.length === 0, `${theme} 대비 실패: ${failed.map((r) => `${r.foreground}/${r.background} ${r.ratio.toFixed(2)}<${r.minimum}`).join(', ')}`);
    console.log(`PASS  ${theme} 핵심 대비 ${results.length}쌍`);
  }

  assert(runtimeErrors.length === 0, `테마 검사 중 콘솔 오류: ${runtimeErrors.join(' | ')}`);
  assert(missed.length === 0, `테마 검사 중 404: ${[...new Set(missed)].join(', ')}`);
  console.log('PASS  테마 전환과 사용자 선택 지속');
  console.log('PASS  테마 런타임 오류와 404 없음');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
