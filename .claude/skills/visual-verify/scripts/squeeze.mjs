#!/usr/bin/env node
/**
 * squeeze.mjs — 화면이 **눌리거나 넘치는 자리**를 브라우저에서 실제로 재서 알려 준다.
 *
 * 왜 있나: 그리드 칸 하나에 `white-space: nowrap` 을 줬더니 그 칸의 최소 너비가 벌어져
 * 옆 칸이 한 글자 폭으로 눌린 적이 있다. 값은 전부 HTML 에 있었고 콘솔 오류도 없었다.
 * 스크린샷을 보기 전까지 아무도 몰랐다. 이 검사는 그 자리를 좌표로 짚어 준다.
 *
 * 무엇을 잡나:
 *   1) 페이지 가로 스크롤   — body 가 뷰포트보다 넓다 (모바일 폭에서 가장 흔하다)
 *   2) 눌린 칸             — 옆 칸이 자리를 다 먹어 한 낱말이 한 글자 폭으로 접힌 칸
 *   3) 넘친 상자           — 안의 내용이 상자보다 넓은데 스크롤이 없다 (= 잘려 보인다)
 *   4) 잘린 글자           — 상자가 내용보다 낮은데 overflow 가 hidden 이다
 *
 * 사용:
 *   npm run build
 *   node .claude/skills/visual-verify/scripts/squeeze.mjs guide            # 1440·768·390 전부
 *   node .claude/skills/visual-verify/scripts/squeeze.mjs guide --w=390
 *   node .claude/skills/visual-verify/scripts/squeeze.mjs "" --min=64      # 첫 화면, 임계치 바꿔서
 *
 * 종료 코드: 0 = 깨끗함 · 1 = 잡힌 것이 있음 · 2 = dist 없음
 *
 * 이 검사가 0 을 내도 **눈으로 본 것을 대신하지는 않는다.** shoot.mjs 로 사진을 찍고 읽어라.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const raw = argv.find((a) => !a.startsWith('--')) ?? '';
const route = raw === '' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
const num = (k, d) => Number(argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const MIN_W = num('min', 48);
const onlyW = argv.find((a) => a.startsWith('--w='));
const WIDTHS = onlyW ? [num('w', 1440)] : [1440, 768, 390];

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
let bad = 0;

for (const W of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: W, height: 900 } });
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(String(e)));
  const url = `http://localhost:${port}${BASE}${route}`;
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  if (!res || res.status() >= 400) {
    console.log(`\n[${W}px] 화면을 못 열었습니다 (${res?.status()}) — ${url}`);
    bad++;
    await page.close();
    continue;
  }
  await page.waitForTimeout(600);

  const found = await page.evaluate((MIN_W) => {
    const out = { page: null, squeezed: [], overflow: [], clipped: [] };
    const selOf = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const txt = (el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 34);

    const doc = document.scrollingElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      out.page = { scrollWidth: doc.scrollWidth, viewport: window.innerWidth };
    }

    const overflowing = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const t = txt(el);

      /*
       * 2) 눌린 칸.
       *    "좁다"만으로는 못 잡는다 — 「00」 같은 번호 칸은 원래 좁다. 실제 사고의 모양은
       *    **옆 칸이 자리를 다 먹어서 한 낱말이 한 글자 폭으로 접힌 것**이었다. 그래서 셋을 모두 본다:
       *      ① 낱말이 4글자 이상이고  ② 폭이 임계치 미만이며  ③ 같은 줄의 제일 넓은 형제가 3배 이상 넓다
       */
      const parent = el.parentElement;
      const pd = parent && getComputedStyle(parent).display;
      const inTrack = pd === 'grid' || pd === 'flex' || pd === 'inline-grid' || pd === 'inline-flex';
      if (inTrack && t.length >= 4 && r.width > 0 && r.width < MIN_W) {
        let widest = 0;
        for (const sib of parent.children) {
          if (sib !== el) widest = Math.max(widest, sib.getBoundingClientRect().width);
        }
        if (widest >= r.width * 3) {
          out.squeezed.push({ sel: selOf(el), w: Math.round(r.width), sib: Math.round(widest), text: t });
        }
      }

      /*
       * 3) 넘친 상자 — 내용이 상자보다 넓은데 스크롤 장치가 없다.
       *    글자가 없는 상자는 뺀다. 배경 격자·흐르는 띠 같은 장식은 일부러 넘치게 만들고
       *    잘라 쓰는 것이 정상이라, 넣으면 목록이 장식으로 가득 차 진짜를 덮는다.
       */
      const scrolls = /auto|scroll/.test(cs.overflowX);
      if (t.length > 0 && !scrolls && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        overflowing.push({ el, sel: selOf(el), inner: el.scrollWidth, box: el.clientWidth, text: t });
      }

      // 4) 잘린 글자 — 세로로 넘치는데 hidden 이다
      if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && t.length > 1) {
        out.clipped.push({ sel: selOf(el), inner: el.scrollHeight, box: el.clientHeight, text: t });
      }
    }

    /*
     * 넘침은 부모로 전파된다. 조상까지 다 적으면 목록이 껍데기로 가득 찬다.
     * **넘치는 자손이 없는 것**만 남긴다 — 그게 원인이다.
     */
    out.overflow = overflowing
      .filter((o) => !overflowing.some((x) => x.el !== o.el && o.el.contains(x.el)))
      .map(({ el, ...rest }) => rest);

    const dedupe = (a) => [...new Map(a.map((x) => [x.sel + x.text, x])).values()].slice(0, 10);
    out.squeezed = dedupe(out.squeezed);
    out.overflow = dedupe(out.overflow);
    out.clipped = dedupe(out.clipped);
    return out;
  }, MIN_W);

  const hits = [];
  if (found.page) hits.push(`가로 스크롤: 문서 ${found.page.scrollWidth}px > 뷰포트 ${found.page.viewport}px`);
  for (const s of found.squeezed) hits.push(`눌린 칸  ${s.w}px (옆 칸 ${s.sib}px)  ${s.sel}  「${s.text}」`);
  for (const o of found.overflow) hits.push(`넘침    ${o.inner}>${o.box}  ${o.sel}  「${o.text}」`);
  for (const c of found.clipped) hits.push(`잘림    ${c.inner}>${c.box}  ${c.sel}  「${c.text}」`);

  console.log(`\n[${W}px] ${route}`);
  if (hits.length) {
    bad += hits.length;
    for (const h of hits) console.log('  ✗ ' + h);
  } else {
    console.log('  ✓ 눌린 칸·넘침·잘림 없음');
  }
  if (errs.length) {
    bad += errs.length;
    console.log('  ✗ 콘솔 오류: ' + errs.slice(0, 4).join(' / '));
  }
  await page.close();
}

await browser.close();
server.close();
if (bad) {
  console.log(`\n총 ${bad}건. 사진을 찍어 눈으로 확인하세요:`);
  console.log(`  node scripts/shoot.mjs ${raw} shot.png --w=390 --full`);
  process.exit(1);
}
console.log('\n깨끗합니다. 그래도 사진은 찍어서 보세요 — 이 검사는 "보기 흉함"은 못 잡습니다.');
