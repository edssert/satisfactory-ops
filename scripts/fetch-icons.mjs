#!/usr/bin/env node
/**
 * fetch-icons.mjs — 아이템 아이콘을 공식 위키에서 받아 `public/assets/items/` 에 넣는다.
 *
 * 왜 필요한가:
 *   도면에 "이 기계가 무엇을 분당 몇 개 만드는가"를 글자로 적으면 도면이 글자로 덮인다.
 *   커뮤니티의 좋은 도면들은 **아이템 아이콘 + 수량 배지**로 그것을 보여준다.
 *   게임 데이터에는 아이콘 경로만 있고(Texture2D /Game/.../IconDesc_IronPlates_256) 이미지 자체는
 *   .pak 안에 있어 여기서 꺼낼 수 없다. 공식 위키가 같은 아이콘을 PNG로 갖고 있다.
 *
 * 자산 취급 (CLAUDE.md §4):
 *   이 이미지들은 Coffee Stain Studios 자산이고 공식 위키에서 가져온다. 출처를 함께 기록한다.
 *   상업적 사용을 하지 않으며 게임사를 사칭하지 않는다.
 *
 * 사용법:
 *   node scripts/fetch-icons.mjs           초반 티어에 쓰는 아이템만
 *   node scripts/fetch-icons.mjs --all     전부 (750개, 오래 걸린다)
 *   node scripts/fetch-icons.mjs --tier=4  해당 티어까지
 *
 * 이미 있는 파일은 다시 받지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/items');
const OUT_B = path.join(ROOT, 'public/assets/buildings-png');
const APP = path.join(ROOT, 'src/data/app');
const WIKI = 'https://satisfactory.wiki.gg/api.php';
const UA = 'satisfactory-ops/1.0 (open-source playbook; contact via github.com/edssert/satisfactory-ops)';

const argv = process.argv.slice(2);
/*
 * 기본은 **전부 받기**다. 앞서 초반 티어만 골라 받았더니 나무·바이오매스처럼
 * 가이드가 나중에 쓰게 된 아이콘이 빈칸으로 나갔다. 자산은 한 번에 다 모아 둔다.
 * `--subset` 을 주면 예전처럼 마일스톤 기준으로만 받는다.
 */
const ALL = !argv.includes('--subset');
const tierArg = argv.find((a) => a.startsWith('--tier='));
const MAX_TIER = tierArg ? Number(tierArg.split('=')[1]) : 4;

const read = (name) => JSON.parse(fs.readFileSync(path.join(APP, name), 'utf8'));
const items = read('items.json');
const buildings = read('buildings.json');
const recipes = read('recipes.json');
const milestones = read('milestones.json');

/** 어떤 아이템을 받을 것인가 — 초반 티어의 마일스톤 비용과 그 재료 전부 */
function wanted() {
  /*
   * items.json 750개 중 547개는 `building-descriptor` — 벽·경사로·통로 같은 건축 부재다.
   * 위키에 같은 이름의 아이콘 파일이 없고 도면에도 등장하지 않는다. 받으려 하면
   * "못 찾음 542개" 같은 소음만 남는다. 실제 부품·자원·장비만 받는다.
   */
  if (ALL) return items.filter((i) => i.kind !== 'building-descriptor');
  const need = new Set();
  const byProduct = new Map();
  for (const r of recipes) {
    for (const p of r.products) {
      if (!byProduct.has(p.item)) byProduct.set(p.item, r);
    }
  }
  const add = (id, depth = 0) => {
    if (need.has(id) || depth > 12) return;
    need.add(id);
    const r = byProduct.get(id);
    if (!r) return;
    for (const g of r.ingredients) add(g.item, depth + 1);
  };
  for (const m of milestones) {
    if (m.tier > MAX_TIER) continue;
    for (const c of m.cost) add(c.item);
  }
  // 원자재는 무조건 포함 (채굴 표시에 쓴다)
  for (const i of items) if (i.kind === 'resource') need.add(i.id);
  return items.filter((i) => need.has(i.id));
}

/** 파일명 — 클래스 id 로 저장한다. 표시명이 바뀌어도 참조가 안 깨진다. */
const fileFor = (item) => `${item.id}.png`;

/**
 * 문서의 대표 이미지를 받는다.
 *
 * 파일명을 이름에서 추측하는 방식은 한계가 있다 — 위키의 실제 파일명이 표시명과 달라
 * "Conveyor Belt Mk.1" 같은 것들이 통째로 실패했다. 문서를 찾아 그 문서가 쓰는 이미지를
 * 받는 쪽이 이름 규칙에 덜 의존한다.
 */
async function wikiPageImage(title, width) {
  const url =
    `${WIKI}?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=${width}` +
    `&redirects=1&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  for (const key of Object.keys(pages)) {
    const t = pages[key]?.thumbnail?.source;
    if (t) return t;
  }
  return null;
}

async function wikiThumb(title, width) {
  const url =
    `${WIKI}?action=query&format=json&prop=imageinfo&iiprop=url|size&iiurlwidth=${width}` +
    `&titles=${encodeURIComponent(`File:${title}.png`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = json?.query?.pages ?? {};
  for (const key of Object.keys(pages)) {
    const info = pages[key]?.imageinfo?.[0];
    if (info) return info.thumburl ?? info.url ?? null;
  }
  return null;
}

/**
 * 건물 아이콘도 PNG로 받는다.
 *
 * 저장소에는 이미 webp 건물 아이콘이 있지만, 도면 렌더러(resvg)가 webp 를 읽지 못해
 * **브라우저와 검증 렌더가 다른 그림**이 됐다. 검증 루프가 못 보는 것은 고칠 수 없다.
 * 그래서 같은 아이콘을 PNG로도 받아 도면에서는 PNG를 쓴다.
 */
async function fetchBuildings() {
  fs.mkdirSync(OUT_B, { recursive: true });
  /*
   * 이름 정규식으로 고르던 것을 분류로 바꾼다. 정규식은 벨트·파이프·싱크까지 걷어냈고,
   * 그것들은 레퍼런스 표와 도면에 실제로 등장한다.
   * 구조물(벽·경사로·통로 388개)과 장식만 뺀다 — 위키에 같은 이름의 아이콘이 없고 쓰지도 않는다.
   */
  /*
   * 기본은 실제 설비만. `--cosmetics` 를 주면 구조물·장식까지 받는다 —
   * 어썸 싱크 상점 화면이 대부분 꾸미기용이라 그것들이 필요하다.
   */
  const COSMETICS = argv.includes('--cosmetics');
  const SKIP_CAT = COSMETICS ? new Set() : new Set(['structure', 'decoration']);
  const wanted = buildings.filter((b) => !SKIP_CAT.has(b.category));

  let got = 0;
  const missing = [];
  for (const b of wanted) {
    const dest = path.join(OUT_B, `${b.id}.png`);
    if (fs.existsSync(dest)) continue;
    let url = null;
    for (const c of [b.en, b.en.replace(/\s+/g, '_'), b.en.replace(/\./g, '')]) {
      url = await wikiThumb(c, 128);
      if (url) break;
    }
    if (!url) url = await wikiPageImage(b.en, 128);
    if (!url) {
      missing.push(b.en);
      continue;
    }
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      missing.push(b.en);
      continue;
    }
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    got++;
    process.stdout.write('#');
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`
건물 아이콘: 받음 ${got}개 · 못 찾음 ${missing.length}개${missing.length ? ' — ' + missing.slice(0, 10).join(', ') : ''}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = wanted();
  console.log(`대상 ${list.length}개 (티어 ${ALL ? '전부' : MAX_TIER}까지)`);

  const attribution = [];
  let got = 0;
  let skipped = 0;
  const missing = [];

  for (const item of list) {
    const dest = path.join(OUT, fileFor(item));
    if (fs.existsSync(dest)) {
      skipped++;
      attribution.push({ id: item.id, en: item.en, file: fileFor(item) });
      continue;
    }
    // 위키 파일명은 영문 표시명이다. 몇 가지 변형을 시도한다.
    const candidates = [item.en, item.en.replace(/\s+/g, '_'), item.en.replace(/\./g, '')];
    let url = null;
    for (const c of candidates) {
      url = await wikiThumb(c, 96);
      if (url) break;
    }
    if (!url) url = await wikiPageImage(item.en, 96);
    if (!url) {
      missing.push(item.en);
      continue;
    }
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      missing.push(item.en);
      continue;
    }
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    attribution.push({ id: item.id, en: item.en, file: fileFor(item), source: url });
    got++;
    process.stdout.write('.');
    // 위키에 부담을 주지 않는다
    await new Promise((r) => setTimeout(r, 120));
  }

  fs.writeFileSync(
    path.join(OUT, 'ATTRIBUTION.json'),
    JSON.stringify(
      {
        $comment:
          '아이템 아이콘. Coffee Stain Studios 자산이며 공식 위키(satisfactory.wiki.gg)에서 가져왔습니다. ' +
          'MIT 라이선스 대상이 아닙니다. 상업적 사용·게임사 사칭을 하지 않습니다. (CLAUDE.md §4)',
        source: 'https://satisfactory.wiki.gg/',
        fetchedBy: 'scripts/fetch-icons.mjs',
        items: attribution,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n받음 ${got}개 · 이미 있음 ${skipped}개 · 못 찾음 ${missing.length}개`);
  if (missing.length) console.log('  못 찾음:', missing.slice(0, 20).join(', '));
}

main()
  .then(() => fetchBuildings())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
