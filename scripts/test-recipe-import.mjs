#!/usr/bin/env node
/** 대체 제작법 화면에서 세이브 가져오기가 실제로 도는지 브라우저로 확인한다. */
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
await new Promise((r) => server.listen(4320, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:4320${BASE}/dex/recipes/`, { waitUntil: 'networkidle' });
await page.setInputFiles('[data-own-file]', SAVE);
await page.waitForFunction(() => !document.querySelector('[data-own-msg]')?.hidden, { timeout: 90_000 });
const msg = await page.textContent('[data-own-msg]');
const n = await page.textContent('[data-own-count]');
const owned = await page.evaluate(() => JSON.parse(localStorage.getItem('sfops.owned') ?? '{"ids":[]}').ids.length);
const checked = await page.locator('[data-own]:checked').count();
await page.screenshot({ path: 'recipe-import.png' });
await browser.close(); server.close();

console.log(`  결과: ${msg}`);
console.log(`  저장 ${owned}가지 · 머리글 표시 ${n} · 체크된 카드 ${checked}개`);
if (errs.length) console.log('  오류: ' + errs.slice(0, 3).join(' | '));
const fail = errs.length || Number(n) !== owned || checked !== owned;
console.log(fail ? '\n[실패] 화면과 저장이 어긋납니다' : '\n[통과]');
process.exit(fail ? 1 : 0);
