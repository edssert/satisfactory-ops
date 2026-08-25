#!/usr/bin/env node
/** 도감 카드 클릭 시 2048px ISO가 실제로 표시되는지 검증하고 증거 PNG를 남긴다. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const dist = resolve('dist');
const base = '/satisfactory-ops';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  let path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (path.startsWith(base)) path = path.slice(base.length);
  let file = join(dist, path);
  if (!extname(file)) file = join(file, 'index.html');
  if (!existsSync(file)) return response.writeHead(404).end();
  response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((resolveListen) => server.listen(0, resolveListen));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`http://localhost:${server.address().port}${base}/dex/assets/`, { waitUntil: 'networkidle' });
mkdirSync(resolve('output/playwright'), { recursive: true });
for (const buildingClass of ['Build_GeneratorBiomass_Automated_C', 'Build_ConstructorMk1_C']) {
  const card = page.locator(`[data-building-class="${buildingClass}"]`);
  await card.locator('[data-isometric-toggle]').click();
  await page.waitForTimeout(250);
  const image = card.locator('.asset-isometric');
  await image.waitFor({ state: 'visible' });
  const evidence = await image.evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    width: element.naturalWidth,
    height: element.naturalHeight,
  }));
  if (evidence.opacity !== '1' || evidence.width !== 2048 || evidence.height !== 2048) {
    throw new Error(`${buildingClass}: ISO 표시 계약 실패 ${JSON.stringify(evidence)}`);
  }
  await card.screenshot({ path: resolve(`output/playwright/${buildingClass}-isometric.png`) });
}
await browser.close();
server.close();
if (errors.length) throw new Error(`브라우저 오류: ${errors.join(' | ')}`);
process.stdout.write('PASS  도감 클릭 ISO 2기기 · 실제 2048px · 콘솔 오류 0\n');
