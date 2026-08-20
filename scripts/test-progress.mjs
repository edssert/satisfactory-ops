#!/usr/bin/env node
/** 가이드가 세이브를 읽어 "지금 여기"를 맞게 짚는지 브라우저로 확인한다. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SAVE = process.argv[2];
if (!SAVE || !fs.existsSync(SAVE)) { console.error('[실패] 세이브 경로를 주세요'); process.exit(2); }
const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = path.join(DIST, p);
  if (!path.extname(f)) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return res.writeHead(404).end('없음');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4324, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:4324${BASE}/guide/`, { waitUntil: 'networkidle' });
await page.setInputFiles('[data-prog-file]', SAVE);
await page.waitForSelector('.step.is-now', { timeout: 90_000 });

const now = await page.textContent('.step.is-now h2');
const where = await page.textContent('[data-prog-where]');
const who = await page.textContent('[data-prog-who]');
const done = await page.locator('section.step.is-done').count();
const nowN = await page.locator('section.step.is-now').count();
const tocNow = await page.locator('.toc li.is-now .toc-t').textContent().catch(() => null);
const remain = await page.locator('.step.is-now [data-remain] li:not([hidden])').allTextContents();
const stage = await page.textContent('.step.is-now [data-stage]');
console.log(`  표시: ${stage?.trim()}`);
console.log('  남은 것: ' + remain.map((t) => t.replace(/\s+/g, ' ').trim()).join(' / '));
await page.locator('.step.is-now').screenshot({ path: 'progress.png' });
await browser.close();
server.close();

console.log(`  띠: ${where?.trim()} / ${who?.trim()}`);
console.log(`  지금 구간: ${now} · 끝난 구간 ${done}개 · 목차 표시 ${tocNow}`);
if (errs.length) console.log('  오류: ' + errs.slice(0, 3).join(' | '));

/* 지금 구간은 정확히 하나여야 하고, 목차와 본문이 같은 것을 가리켜야 한다 */
const fail = errs.length || nowN !== 1 || !done || tocNow !== now;
console.log(fail ? '\n[실패]' : '\n[통과]');
process.exit(fail ? 1 : 0);
