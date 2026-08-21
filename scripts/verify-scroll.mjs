#!/usr/bin/env node
/**
 * verify-scroll.mjs — 배포 산출물에서 전역 스크롤 향상의 접근성 계약을 검증한다.
 *
 * 사용: npm run test:scroll
 * 전제: npm run build로 dist/가 생성되어 있어야 한다.
 * 종료 코드: 0 모든 계약 통과 · 1 Chromium 또는 스크롤 계약 실패
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = path.resolve('dist');
const BASE = '/satisfactory-ops';
const MIME = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'guide', 'index.html'))) {
  throw new Error('dist/guide/index.html이 없습니다. npm run build를 먼저 실행하세요.');
}

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
  const type = MIME[path.extname(file)] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': type });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}${BASE}`;
const browser = await chromium.launch();

async function openPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => message.type() === 'error' && runtimeErrors.push(message.text()));
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  return { context, page, runtimeErrors };
}

async function landingMotionState(page) {
  return page.evaluate(() => {
    const selectors = [
      '[data-split-title]', '.hero-lede', '.hero-actions', '.hero-proof', '.hero-index',
      '[data-reveal]', '.workflow-step', '.machine-rail', '.close-media',
    ];
    const hidden = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.99 || rect.width === 0 || rect.height === 0;
      })
      .map((node) => `${selector}:${node.className}`));
    const transformed = ['.hero-image', '.close-media', '.machine-rail', '.workflow-step']
      .flatMap((selector) => [...document.querySelectorAll(selector)]
        .filter((node) => getComputedStyle(node).transform !== 'none')
        .map((node) => `${selector}:${getComputedStyle(node).transform}`));
    return { hidden, transformed, pinSpacers: document.querySelectorAll('.pin-spacer').length };
  });
}

function assertReducedLanding(state, label) {
  assert(state.hidden.length === 0, `${label}에서 핵심 콘텐츠가 숨었습니다: ${state.hidden.join(', ')}`);
  assert(state.transformed.length === 0, `${label}에서 이동·확대가 남았습니다: ${state.transformed.join(', ')}`);
  assert(state.pinSpacers === 0, `${label}에 ScrollTrigger 핀 ${state.pinSpacers}개가 남았습니다.`);
}

try {
  const regular = await openPage();
  await regular.page.goto(`${origin}/guide/`, { waitUntil: 'networkidle' });
  assert(await regular.page.locator('html').evaluate((node) => node.classList.contains('lenis')), '일반 모드에서 Lenis가 초기화되지 않았습니다.');

  await regular.page.keyboard.press('Home');
  await regular.page.keyboard.press('PageDown');
  await regular.page.waitForTimeout(120);
  assert((await regular.page.evaluate(() => window.scrollY)) > 100, 'PageDown 키로 문서를 스크롤할 수 없습니다.');

  const anchors = regular.page.locator('.toc a');
  assert((await anchors.count()) >= 4, '해시 링크 회귀 검사에 필요한 단계 목차가 없습니다.');
  const anchor = anchors.nth(3);
  const href = await anchor.getAttribute('href');
  await anchor.click();
  await regular.page.waitForTimeout(1250);
  assert(await regular.page.evaluate((hash) => location.hash === hash, href), '목차 클릭 뒤 URL 해시가 보존되지 않았습니다.');
  const anchorTop = await regular.page.locator(href).evaluate((node) => node.getBoundingClientRect().top);
  assert(anchorTop >= 80 && anchorTop <= 125, `해시 대상이 고정 헤더 아래에 정렬되지 않았습니다(top=${anchorTop}).`);

  await regular.page.emulateMedia({ reducedMotion: 'reduce' });
  await regular.page.waitForTimeout(80);
  const reducedAnchor = anchors.nth(1);
  const reducedHref = await reducedAnchor.getAttribute('href');
  await reducedAnchor.click();
  await regular.page.waitForTimeout(40);
  const reducedTop = await regular.page.locator(reducedHref).evaluate((node) => node.getBoundingClientRect().top);
  assert(reducedTop >= 80 && reducedTop <= 125, `실행 중 reduce 전환 뒤 해시 이동이 즉시 끝나지 않았습니다(top=${reducedTop}).`);

  await regular.page.emulateMedia({ reducedMotion: 'no-preference' });
  await regular.page.evaluate(() => window.scrollTo({ top: 1350, behavior: 'instant' }));
  await regular.page.waitForTimeout(100);
  const beforeNavigate = await regular.page.evaluate(() => window.scrollY);
  await regular.page.goto(`${origin}/dex/`, { waitUntil: 'networkidle' });
  await regular.page.goBack({ waitUntil: 'networkidle' });
  await regular.page.waitForTimeout(250);
  const afterBack = await regular.page.evaluate(() => window.scrollY);
  assert(Math.abs(afterBack - beforeNavigate) < 180, `뒤로가기 스크롤 복원이 어긋났습니다(${beforeNavigate} → ${afterBack}).`);

  await regular.page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  const landingState = await landingMotionState(regular.page);
  assert(landingState.pinSpacers === 0, `분류별 자산 탐색에 불필요한 ScrollTrigger 핀 ${landingState.pinSpacers}개가 남았습니다.`);
  assert((await regular.page.locator('.machine-window').count()) === 3, '생산·물류·발전 자산 탐색 영역 세 개가 유지되지 않았습니다.');
  assert(await regular.page.locator('.machine-window').evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).overflowX === 'auto')),
    '분류별 자산 탐색 영역이 네이티브 가로 스크롤을 사용하지 않습니다.');
  await regular.page.emulateMedia({ reducedMotion: 'reduce' });
  await regular.page.waitForTimeout(250);
  assertReducedLanding(await landingMotionState(regular.page), '실행 중 reduce 전환');
  assert(regular.runtimeErrors.length === 0, `일반 모드 콘솔 오류: ${regular.runtimeErrors.join(' | ')}`);
  await regular.context.close();

  const reduced = await openPage({ reducedMotion: 'reduce' });
  await reduced.page.goto(`${origin}/guide/`, { waitUntil: 'networkidle' });
  assert(await reduced.page.locator('html').evaluate((node) => node.classList.contains('lenis')), 'reduce 최초 진입에서 Lenis 동기화 계층이 초기화되지 않았습니다.');
  const finalHref = await reduced.page.locator('.toc a').last().getAttribute('href');
  await reduced.page.goto(`${origin}/guide/${finalHref}`, { waitUntil: 'networkidle' });
  await reduced.page.waitForTimeout(100);
  const directTop = await reduced.page.locator(finalHref).evaluate((node) => node.getBoundingClientRect().top);
  assert(directTop >= 80 && directTop <= 125, `직접 해시 진입이 고정 헤더 아래에 정렬되지 않았습니다(top=${directTop}).`);

  await reduced.page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  assertReducedLanding(await landingMotionState(reduced.page), 'reduce 최초 진입');
  assert(reduced.runtimeErrors.length === 0, `reduce 모드 콘솔 오류: ${reduced.runtimeErrors.join(' | ')}`);
  await reduced.context.close();

  assert(missed.length === 0, `실행 중 404가 발생했습니다: ${[...new Set(missed)].join(', ')}`);
  console.log('PASS  키보드 PageDown');
  console.log('PASS  해시 링크와 고정 헤더 오프셋');
  console.log('PASS  실행 중 prefers-reduced-motion 전환');
  console.log('PASS  뒤로가기 스크롤 복원');
  console.log('PASS  reduce 최초 진입과 직접 해시 진입');
  console.log('PASS  reduce 랜딩 최종 상태와 ScrollTrigger 무핀 폴백');
  console.log('PASS  실행 중 reduce 전환의 GSAP 정리');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
