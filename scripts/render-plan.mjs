#!/usr/bin/env node
/**
 * render-plan.mjs — 생성된 도면 SVG를 PNG로 렌더해 **눈으로 확인**한다.
 *
 * 왜 필요한가: 도면을 코드로 만들면서 겹침·잘림을 보지 못한 채 세 번 배포했다.
 * 테스트는 기하(좌표)를 검사할 수 있지만 "글자가 잘리는가"는 못 잡는다.
 * 이 스크립트가 실제 픽셀을 만들어 주고, 그것을 확인한 뒤 배포한다.
 *
 * 사용법:
 *   node scripts/render-plan.mjs [출력경로.png]
 *
 * 동작:
 *   1. 빌드된 dist/design/index.html 에서 SVG를 꺼낸다
 *   2. CSS 커스텀 프로퍼티(var(--x))를 tokens.css 의 라이트 값으로 치환한다
 *      (resvg 는 CSS 변수를 해석하지 않는다)
 *   3. 프로젝트 CSS 중 도면 관련 규칙을 <style> 로 심는다
 *   4. resvg 로 PNG 출력
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = process.argv[2] ?? path.join(ROOT, 'dist', 'plan-preview.png');
const page = process.argv[3] ?? 'build';
const html = fs.readFileSync(path.join(ROOT, `dist/${page}/index.html`), 'utf8');

/** tokens.css 에서 :root 라이트 값을 뽑는다 */
function readTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('/* 다크'));
  const map = new Map();
  for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

/** var(--x) / var(--x, fallback) 를 실제 값으로 치환 (중첩 var 도 처리) */
function resolveVars(text, tokens) {
  let prev = null;
  let cur = text;
  for (let i = 0; i < 6 && cur !== prev; i++) {
    prev = cur;
    cur = cur.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_, name, fallback) => {
      const v = tokens.get(name);
      if (v) return v;
      return fallback ?? '#888';
    });
  }
  // resvg 는 color-mix() 를 모른다 → 첫 색을 그대로 쓴다
  cur = cur.replace(/color-mix\([^)]*?(#[0-9a-fA-F]{3,8})[^)]*\)/g, '$1');
  return cur;
}

function styleBlock(tokens) {
  const files = ['src/styles/layout-plan.css', 'src/styles/module-sheet.css'];
  const css = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // 미디어쿼리는 렌더에 필요 없다
  const flat = css.replace(/@media[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  return `<style>${resolveVars(flat, tokens)}</style>`;
}

const tokens = readTokens();

/**
 * <image href="/base/assets/..."> 를 data URI 로 바꾼다.
 *
 * 렌더러는 외부 파일 참조를 따라가지 않는다. 그대로 두면 아이콘이 통째로 빠진 그림이 나오고,
 * **브라우저와 다른 것을 보게 된다** — 그러면 이 렌더 루프가 검증 도구 구실을 못 한다.
 */
function inlineImages(svgText) {
  return svgText.replace(/href="([^"]+\.(?:webp|png|jpg|svg))"/g, (m, url) => {
    const rel = url.replace(/^[^/]*\/*/, '').replace(/^satisfactory-ops\//, '');
    const candidates = [
      path.join(ROOT, 'public', rel),
      path.join(ROOT, 'dist', rel),
      path.join(ROOT, 'public', url.replace(/^\//, '')),
    ];
    const hit = candidates.find((c) => fs.existsSync(c));
    if (!hit) {
      console.warn('  이미지를 못 찾음:', url);
      return m;
    }
    const ext = path.extname(hit).slice(1);
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    return `href="data:${mime};base64,${fs.readFileSync(hit).toString('base64')}"`;
  });
}

// 도면 SVG 전부 추출 (층 도면이 공정마다 하나씩 나온다)
const only = process.env.ONLY_SVG || '(?:fps|ms|sc|fc)';
const svgs = [...html.matchAll(new RegExp('<svg class="' + only + '-svg"[^]*?</svg>', 'g'))].map((m) => m[0]);
if (svgs.length === 0) {
  console.error(`dist/${page}/index.html 에서 도면 SVG를 찾지 못했습니다. npm run build 먼저 실행하세요.`);
  process.exit(1);
}

const style = styleBlock(tokens);
let y = 0;
const parts = [];
const widths = [];
for (const raw of svgs) {
  const w = Number(raw.match(/width="([\d.]+)"/)?.[1] ?? 800);
  const h = Number(raw.match(/height="([\d.]+)"/)?.[1] ?? 400);
  widths.push(w);
  // 개별 SVG를 <g transform>으로 이어 붙인다 (한 장으로 봐야 관계가 보인다)
  const inner = raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const vb = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 800 400';
  const [vx, vy] = vb.split(/\s+/).map(Number);
  parts.push(`<g transform="translate(${-vx} ${y - vy})">${inner}</g>`);
  y += h + 24;
}

const W = Math.max(...widths);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">
${style}
<rect width="${W}" height="${y}" fill="${tokens.get('--bg')}"/>
${parts.join('\n')}
</svg>`;

const finalSvg = inlineImages(resolveVars(svg, tokens));
if (process.env.DUMP_SVG) fs.writeFileSync(process.env.DUMP_SVG, finalSvg);
const png = new Resvg(finalSvg, {
  font: { loadSystemFonts: true, defaultFontFamily: 'Malgun Gothic' },
  background: tokens.get('--bg'),
}).render().asPng();

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`도면 ${svgs.length}장을 렌더했습니다 → ${path.relative(ROOT, out)} (${Math.round(png.length / 1024)}KB, ${W}×${y})`);
