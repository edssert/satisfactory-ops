#!/usr/bin/env node
/** 진단 화면이 실제 세이브로 결과를 그리는지 브라우저로 확인한다. */
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
await new Promise((r) => server.listen(4340, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:4340${BASE}/checkup/`, { waitUntil: 'networkidle' });
await page.setInputFiles('[data-file]', SAVE);
await page.waitForSelector('.find', { timeout: 90_000 });

const n = await page.locator('.find').count();
const stop = await page.locator('.find.is-stop').count();
const titles = await page.locator('.find-t').allTextContents();
const mach = await page.textContent('[data-s-mach]');
const up = await page.textContent('[data-s-up]');
/*
 * 화면에 내부 식별자나 마크다운이 새지 않는가.
 * 원본 HTML 을 보면 안 된다 — 카탈로그 JSON 이 인라인으로 들어 있어 클래스명이 잔뜩 잡힌다.
 * 사람이 실제로 읽는 글자만 본다.
 */
const text = await page.evaluate(() => document.body.innerText);
const leak = [...text.matchAll(/(Desc_[A-Za-z0-9_]+_C|Build_[A-Za-z0-9_]+_C|Recipe_[A-Za-z0-9_]+_C|\*\*)/g)].map((m) => m[1]);
await page.screenshot({ path: 'checkup.png', fullPage: true });
await browser.close();
server.close();

console.log(`  설비 ${mach}대 · 평균 가동률 ${up}%`);
console.log(`  진단 ${n}건 (멈춤 ${stop}건)`);
titles.slice(0, 6).forEach((t) => console.log('    · ' + t));
if (errs.length) console.log('  오류: ' + errs.slice(0, 3).join(' | '));
if (leak.length) console.log('  누수: ' + [...new Set(leak)].slice(0, 5).join(', '));

const fail = errs.length || n === 0 || leak.length || !Number(mach);
console.log(fail ? '\n[실패]' : '\n[통과]');
process.exit(fail ? 1 : 0);
