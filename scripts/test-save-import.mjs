#!/usr/bin/env node
/**
 * test-save-import.mjs — 진짜 브라우저에서 진짜 세이브를 먹여 본다.
 *
 * 파서는 Node 용으로 나온 것이라 Buffer 를 참조한다. Node 에서 됐다고 브라우저에서 되는 게
 * 아니라서, 빌드한 결과물을 크로미움으로 열고 실제 .sav 를 골라 넣어 확인한다.
 * 사용: node scripts/test-save-import.mjs <세이브경로>
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SAVE = process.argv[2];
if (!SAVE || !fs.existsSync(SAVE)) {
  console.error('[실패] 세이브 파일 경로를 주세요');
  process.exit(2);
}

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
await new Promise((r) => server.listen(4319, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

await page.goto(`http://127.0.0.1:4319${BASE}/map/`, { waitUntil: 'networkidle' });
await page.setInputFiles('.rm-load input[type=file]', SAVE);
/* 큰 세이브는 몇 초 걸린다 */
await page.waitForSelector('.rm-ok, .rm-bad', { timeout: 90_000 });

const ok = await page.textContent('.rm-ok').catch(() => null);
const bad = await page.textContent('.rm-bad').catch(() => null);
const store = await page.evaluate(() => ({
  collected: JSON.parse(localStorage.getItem('sfops.collected') ?? '{"ids":[]}').ids.length,
  owned: JSON.parse(localStorage.getItem('sfops.owned') ?? '{"ids":[]}').ids.length,
}));
/* 걸러 보기가 실제로 도는가 */
const before = await page.locator('.rm-drop').count();
await page.click('.rm-seg3 button:nth-child(2)');   // 안 주움
const left = await page.locator('.rm-drop').count();
await page.click('.rm-seg3 button:nth-child(3)');   // 주움
const gotN = await page.locator('.rm-drop').count();
await page.screenshot({ path: 'save-import.png' });
await browser.close();
server.close();

console.log(bad ? `  결과: 실패 — ${bad}` : `  결과: ${ok}`);
console.log(`  저장: 수집품 ${store.collected}건 · 대체 제작법 ${store.owned}가지`);
console.log(`  표시: 전부 ${before} = 안 주움 ${left} + 주움 ${gotN}`);
if (errs.length) console.log('  콘솔 오류:\n    ' + errs.slice(0, 5).join('\n    '));

/*
 * 대체 제작법은 세이브마다 0가지일 수 있다(하드 드라이브를 안 돌린 세이브).
 * 그래서 0을 실패로 보지 않고, 옮겨야 할 게 있었는지를 결과 문구로 확인한다.
 */
/*
 * 주운 것은 세이브의 collectables 목록에서 온다. 지나간 지역의 액터를 세면 열 배 넘게
 * 부풀려진다 — 그 회귀를 막으려고 상한을 둔다. 36시간 세이브의 실제 값은 14건이었다.
 */
const tooMany = store.collected > 200;
if (tooMany) console.log(`  [경고] 주운 것이 ${store.collected}건 — 지나간 지역까지 세고 있습니다`);
const fail =
  bad || store.collected === 0 || tooMany || before !== left + gotN || errs.length;
console.log(fail ? '\n[실패]' : '\n[통과] 브라우저에서 세이브를 읽었습니다.');
process.exit(fail ? 1 : 0);
