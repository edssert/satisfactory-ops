#!/usr/bin/env node
/**
 * nojs.mjs — 자바스크립트를 **끄고** 화면을 열어, 값이 그대로 보이는지 본다.
 *
 * 왜 있나: 랜딩의 집계 숫자를 CSS 카운터 + `animation-timeline: view()` 로 올렸다.
 * 스크롤 구동 애니메이션의 진행도가 안 잡히면 카운터가 초기값에서 멈춘다 — 화면에 **0** 이
 * 그대로 남았다. HTML 에는 맞는 값이 있었는데도.
 *
 * 이 저장소의 규칙은 하나다: **값은 HTML 에, 움직임만 JS 로.**
 * 이 스크립트는 그 규칙이 지켜졌는지 기계로 확인한다.
 *
 * 무엇을 잡나:
 *   1) CSS 가 만들어 내는 숫자   — ::before/::after 의 content 가 counter() 를 쓴다
 *   2) 값과 다른 글자           — data-* 에 값이 있는데 화면 글자가 다르거나 0 이다
 *   3) JS 없이 사라지는 내용     — JS 끈 화면의 글자량이 켠 화면보다 크게 적다
 *   4) 카운터 + 스크롤 애니메이션 — 배포된 CSS 한 파일 안에 둘이 같이 있다
 *
 * 사용:
 *   npm run build
 *   node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs           # 첫 화면
 *   node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs guide
 *   node .agents/skills/satisfactory-browser-evidence/scripts/nojs.mjs guide --attr=tick
 *
 * 종료 코드: 0 = 통과 · 1 = 잡힌 것이 있음 · 2 = dist 없음
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const raw = argv.find((a) => !a.startsWith('--')) ?? '';
const route = raw === '' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}/`;
/** 값을 담아 두는 속성 이름. 이 저장소는 data-tick 을 쓴다 */
const ATTR = argv.find((a) => a.startsWith('--attr='))?.split('=')[1] ?? 'tick';
/** JS 없이 남아야 하는 글자 비율 */
const KEEP = Number(argv.find((a) => a.startsWith('--keep='))?.split('=')[1] ?? 0.9);

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
const url = `http://localhost:${port}${BASE}${route}`;

const fails = [];
const notes = [];

const browser = await chromium.launch();

/** 한 번 열어 화면을 재 온다 */
async function probe(js) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const res = await page.goto(url, { waitUntil: js ? 'networkidle' : 'load' });
  if (!res || res.status() >= 400) {
    await ctx.close();
    return null;
  }
  await page.waitForTimeout(js ? 900 : 400);
  const data = await page.evaluate((ATTR) => {
    const selOf = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const counters = [];
    const holders = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      /*
       * counter() 자체는 죄가 없다 — `li::before { content: counter(a) }` 는 그냥 번호다.
       * 위험한 것은 **애니메이션이 값을 올리는 카운터**다. 진행도가 안 잡히면 초기값에서 언다.
       * 그래서 그 자리에 애니메이션이 걸려 있을 때만 잡는다.
       */
      const animated = (node) => {
        for (let a = node; a && a !== document.body.parentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.animationName && s.animationName !== 'none') return true;
          if (s.animationTimeline && !['auto', 'none', ''].includes(s.animationTimeline)) return true;
        }
        return false;
      };
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (!ps.content || !ps.content.includes('counter(')) continue;
        const own = (ps.animationName && ps.animationName !== 'none') ||
          (ps.animationTimeline && !['auto', 'none', ''].includes(ps.animationTimeline));
        if (own || animated(el)) counters.push({ sel: selOf(el), pseudo, content: ps.content });
      }
      const v = el.getAttribute(`data-${ATTR}`);
      if (v != null) {
        holders.push({ sel: selOf(el), want: v.trim(), got: (el.textContent ?? '').trim() });
      }
    }
    return { counters, holders, text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim() };
  }, ATTR);
  await ctx.close();
  return data;
}

const off = await probe(false);
const on = await probe(true);
if (!off || !on) {
  console.error(`[실패] 화면을 못 열었습니다 — ${route}`);
  await browser.close();
  server.close();
  process.exit(2);
}
await browser.close();
server.close();

/* 1) CSS 가 만들어 내는 숫자 */
if (off.counters.length) {
  for (const c of off.counters.slice(0, 8)) {
    fails.push(`CSS 카운터로 만든 숫자: ${c.sel}${c.pseudo}  content: ${c.content}`);
  }
  fails.push('  → 숫자는 HTML 안의 글자여야 합니다. 카운터는 진행도가 안 잡히면 초기값에서 멈춥니다');
}

/* 2) 값과 다른 글자 */
if (off.holders.length === 0 && on.holders.length === 0) {
  notes.push(`data-${ATTR} 를 쓰는 자리가 없습니다 (이 화면은 검사 대상이 아닐 수 있습니다)`);
} else {
  for (const h of off.holders) {
    if (h.got !== h.want) fails.push(`JS 없이 값이 다릅니다: ${h.sel}  data-${ATTR}="${h.want}" 인데 화면은 "${h.got}"`);
    else if (h.want === '0') fails.push(`값 자체가 0 입니다: ${h.sel} — 빌드가 수를 못 세고 있습니다`);
  }
  if (off.holders.length === on.holders.length && !fails.length) {
    notes.push(`data-${ATTR} ${off.holders.length}개가 JS 없이도 값과 같습니다`);
  }
}

/* 3) JS 없이 사라지는 내용 */
const ratio = on.text.length ? off.text.length / on.text.length : 1;
if (ratio < KEEP) {
  fails.push(
    `JS 를 끄면 글자가 ${Math.round((1 - ratio) * 100)}% 사라집니다 ` +
      `(${off.text.length} / ${on.text.length}자). 내용을 JS 가 만들고 있습니다`
  );
} else {
  notes.push(`JS 없이도 글자의 ${Math.round(ratio * 100)}% 가 남습니다`);
}

/* 4) 배포된 CSS 안에 카운터와 스크롤 애니메이션이 같이 있는가 */
const cssDir = path.join(DIST, '_astro');
if (fs.existsSync(cssDir)) {
  for (const f of fs.readdirSync(cssDir).filter((n) => n.endsWith('.css'))) {
    const s = fs.readFileSync(path.join(cssDir, f), 'utf8');
    if (/counter-(reset|increment)|counter\(/.test(s) && /animation-timeline/.test(s)) {
      fails.push(`${path.join('dist/_astro', f)} 안에 CSS 카운터와 animation-timeline 이 같이 있습니다`);
    }
  }
}

console.log(`\nJS 끈 화면 검사 — ${route}\n`);
for (const n of notes) console.log('  ✓ ' + n);
for (const f of fails) console.log('  ✗ ' + f);
if (fails.length) {
  console.log('\n값은 HTML 에, 움직임만 JS 로. 고친 뒤 사진도 찍어 확인하세요:');
  console.log(`  node scripts/shoot.mjs ${raw} shot.png --full`);
  process.exit(1);
}
console.log('\n통과. JS 없이도 값이 보입니다.');
