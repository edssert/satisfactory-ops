#!/usr/bin/env node
/**
 * shot-el.mjs — 화면의 **한 조각만** 찍는다.
 *
 * `scripts/shoot.mjs` 는 화면 전체를 찍는다. 표 한 칸이나 흐름도 하나를 고쳤을 때는
 * 전체 사진이 너무 작아 글자가 안 읽힌다. 그럴 때 이걸 쓴다.
 *
 * (원래 `.tmp-research/shot-el.mjs` 에 있던 것이다. 그 폴더는 gitignore 대상이라
 *  다음 세션에 사라진다. 그래서 스킬 안으로 옮겨 왔다.)
 *
 * 사용:
 *   npm run build
 *   node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs guide '.fc-svg' shot.png
 *   node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs map '.rm-legend' shot.png --w=390
 *   node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs "" '.hero' shot.png --nth=0
 *
 *   경로는 **앞 슬래시 없이** 준다 (Git Bash 가 /guide/ 를 윈도 경로로 바꿔 버린다).
 *   빈 문자열이면 첫 화면.
 *
 * 찍고 나면 **그 PNG 를 Read 로 열어 눈으로 봐라.** 안 보면 이 스크립트는 의미가 없다.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith('--'));
const [raw = '', sel, out = 'shot.png'] = pos;
const num = (k, d) => Number(argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const W = num('w', 1280);
const H = num('h', 1100);
const NTH = num('nth', 0);
const WAIT = num('wait', 700);

if (!sel) {
  console.error("사용: node .agents/skills/satisfactory-browser-evidence/scripts/shot-el.mjs <경로> '<선택자>' [출력.png] [--w=] [--nth=]");
  process.exit(1);
}

const route = raw === '' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
if (!fs.existsSync(DIST)) {
  console.error('[실패] dist 가 없습니다. `npm run build` 를 먼저 실행하세요.');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  let f = path.join(DIST, p);
  if (!path.extname(f)) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return res.writeHead(404).end('없음');
  const type = MIME[path.extname(f)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': /^(text|application\/(javascript|json)|image\/svg)/.test(type) ? `${type}; charset=utf-8` : type,
  });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
/* 2배로 찍는다 — 글자가 읽혀야 검수가 된다 */
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push(String(e)));

const res = await page.goto(`http://localhost:${port}${BASE}${route}`, { waitUntil: 'networkidle' });
if (!res || res.status() >= 400) {
  console.error(`[실패] 화면을 못 열었습니다 (${res?.status()}) — ${route}`);
  await browser.close();
  server.close();
  process.exit(2);
}
await page.waitForTimeout(WAIT);

const all = page.locator(sel);
const n = await all.count();
if (n === 0) {
  console.error(`[실패] 선택자에 맞는 것이 없습니다: ${sel}`);
  await browser.close();
  server.close();
  process.exit(1);
}
const el = all.nth(Math.min(NTH, n - 1));
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
await el.screenshot({ path: out });

const box = await el.boundingBox();
await browser.close();
server.close();
console.log(`${out}  ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}  (맞는 것 ${n}개 중 ${NTH}번째)`);
if (errs.length) console.log('콘솔 오류:\n  ' + errs.slice(0, 5).join('\n  '));
console.log('→ 이제 이 PNG 를 Read 로 열어서 보세요. 안 보면 고친 게 아닙니다.');
