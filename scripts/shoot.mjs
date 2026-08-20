#!/usr/bin/env node
/**
 * shoot.mjs — 빌드한 화면을 실제 브라우저로 열어 사진을 찍는다.
 *
 * 눈으로 못 보고 고치다가 같은 곳을 여러 번 틀렸다. 배포 전에 화면을 직접 본다.
 * 사용: node scripts/shoot.mjs <경로> [출력.png] [--w=1440] [--h=900] [--full] [--wait=ms] [--click=선택자]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
/*
 * Git Bash 가 `/map/` 같은 인자를 윈도 경로로 바꿔 버린다. 앞 슬래시 없이 받아
 * 여기서 붙인다 — `node scripts/shoot.mjs map` 처럼 쓴다.
 */
const raw = argv.find((a) => !a.startsWith('--') && !a.endsWith('.png')) ?? '';
const route = raw === '' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
const out = argv.find((a) => a.endsWith('.png')) ?? 'shot.png';
const num = (k, d) => Number(argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const W = num('w', 1440);
const H = num('h', 900);
const WAIT = num('wait', 900);
const FULL = argv.includes('--full');
const CLICK = argv.find((a) => a.startsWith('--click='))?.slice(8);

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

const missed = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = path.join(DIST, p);
  if (!path.extname(f)) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) {
    missed.push(p);
    res.writeHead(404).end('없음');
    return;
  }
  const ext = path.extname(f);
  const type = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': /^(text|application\/(javascript|json)|image\/svg)/.test(type)
      ? `${type}; charset=utf-8`
      : type,
  });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://localhost:${port}${BASE}${route}`, { waitUntil: 'networkidle' });
/* 굴려서 확대한 상태를 찍는다. --wheel=횟수[,x,y] */
const WHEEL = argv.find((a) => a.startsWith('--wheel='))?.slice(8);
if (WHEEL) {
  const [n, wx, wy] = WHEEL.split(',').map(Number);
  const box = await page.locator('.rm-stage, .pl-stage').first().boundingBox();
  const cx = wx ?? (box ? box.x + box.width / 2 : W / 2);
  const cy = wy ?? (box ? box.y + box.height / 2 : H / 2);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < (n || 1); i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(700);
}
if (CLICK) {
  await page.click(CLICK).catch(() => errs.push(`못 누름: ${CLICK}`));
  await page.waitForTimeout(500);
}
await page.waitForTimeout(WAIT);
await page.screenshot({ path: out, fullPage: FULL });
await browser.close();
server.close();
console.log(out, FULL ? '(전체)' : `${W}x${H}`);
if (errs.length) console.log('콘솔 오류:\n  ' + errs.slice(0, 6).join('\n  '));
if (missed.length) console.log('404:\n  ' + [...new Set(missed)].slice(0, 8).join('\n  '));
