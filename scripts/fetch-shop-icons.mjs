#!/usr/bin/env node
/**
 * fetch-shop-icons.mjs — 싱크 상점 품목의 그림을 공식 위키에서 받아 둔다.
 *
 * 왜 따로 받는가:
 *   상점 품목의 절반(173건 중 79건)은 해금하는 게임 객체의 아이콘으로 못 채운다.
 *   무늬·도색·재질·붐박스 테이프처럼 커스터마이저 항목이거나, 여러 건물을 한꺼번에 주는
 *   묶음이기 때문이다. 상점은 그림을 보고 고르는 화면이라 빈 칸이 있으면 화면이 성립하지 않는다.
 *
 * 어떻게:
 *   이 위키에는 pageimages 확장이 없다(prop=pageimages 가 통째로 무시된다).
 *   그래서 File:<이름>.png 를 직접 조회한다. 후보를 여러 개 시도한다 —
 *   품목 이름, 그 품목이 주는 건물·아이템의 영문 이름, 단수형.
 *   게임의 상점도 묶음이면 대표 건물 하나의 그림을 보여 준다(금속 기둥 세트 → 대형 금속 기둥).
 *
 * 자산 취급 (CLAUDE.md §4):
 *   Coffee Stain Studios 자산이고 공식 위키에서 가져온다. 출처를 함께 기록하고
 *   상업적 사용을 하지 않는다.
 *
 * 사용법:
 *   node scripts/fetch-shop-icons.mjs          없는 것만
 *   node scripts/fetch-shop-icons.mjs --force  전부 다시
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/shop');
const APP = path.join(ROOT, 'src/data/app');
const WIKI = 'https://satisfactory.wiki.gg/api.php';
const UA =
  'satisfactory-ops/1.0 (open-source playbook; contact via github.com/edssert/satisfactory-ops)';

const FORCE = process.argv.includes('--force');
const read = (n) => JSON.parse(fs.readFileSync(path.join(APP, n), 'utf8'));
const tech = read('tech.json');
const buildings = new Map(read('buildings.json').map((b) => [b.id, b]));
const items = new Map(read('items.json').map((i) => [i.id, i]));

/** 위키 문서·파일 이름이 게임 표시명과 다른 것들 */
const NAME_FIX = {
  Boombox: 'Boom Box',
  'FICSIT™ Coffee Cup': 'FICSIT Coffee Cup',
  "'Employee of the Planet' Cup": 'Employee of the Planet Cup',
  'Absolute FICSIT Boombox Tape': 'Absolute FICSIT BoomBox Tape',
  'FICSIT Anniversary Boombox Tape': 'FICSIT Anniversary BoomBox Tape',
  'Joel Syntholm Boombox Tape': 'Joel Syntholm BoomBox Tape',
  'Le Michael Boombox Tape': 'Le Michael BoomBox Tape',
  'Sanctum Boombox Tape': 'Sanctum BoomBox Tape',
  'Sanctum 2 Boombox Tape': 'Sanctum 2 BoomBox Tape',
  'Goat Music Boombox Tape': 'Goat Music BoomBox Tape',
  'FICSIT Checkmark™': 'FICSIT Checkmark',
  'FICSIT Factory Cart™': 'Factory Cart',
  'Golden FICSIT Factory Cart™': 'Golden Factory Cart',
  'Radiation Filters': 'Iodine-Infused Filter',
  'Gas Filters': 'Gas Filter',
  Screws: 'Screw',
  'Road Barriers': 'Road Barrier',
  'Basic Shelf Unit': 'Shelf Unit',

  /*
   * 위키가 품목 단위가 아니라 부재 단위로 파일을 두는 것들.
   * 게임 상점도 묶음이면 대표 부재 하나를 보여 주므로 같은 방식으로 고른다.
   */
  'Ramp Wall Bundle': 'Ramp Wall 4m (FICSIT)',
  'Inverted Ramp Wall Bundle': 'Inv. Ramp Wall 4m (FICSIT)',
  'Inverted Ramp Set': 'Inverted Ramp 4m (FICSIT)',
  'Double Ramp Set': 'Double Ramp 8m (FICSIT)',
  'Corner Ramp Pack': 'Up Corner Ramp 4m (FICSIT)',
  'Inverted Corner Ramp Pack': 'Inverted Up Corner Ramp 4m (FICSIT)',
  'Quarter Pipe Extensions Pack': 'Outer Corner Quarter Pipe (FICSIT)',
  'Foundation Stairs Set': 'Catwalk Stairs',
  'Industrial Walkways': 'Walkway Straight',
  'Modern Catwalks': 'Catwalk Straight',
  'Pipeline Wall Attachments': 'Pipeline Wall Support',
  'FICSIT™ Coffee Cup': 'Cup',

  /* 커스터마이저 마감·무늬는 번호로만 파일이 있다 */
  'Unpainted Finish': 'Customizer Finish 1',
  'Copper Paint Finish': 'Customizer Finish 2',
  'Chrome Paint Finish': 'Customizer Finish 3',
  'Carbon Steel Finish': 'Customizer Finish 4',
  'Caterium Paint Finish': 'Customizer Finish 5',
  'Solid Line Patterns': 'Customizer Pattern Use Example',
  'Pathway Patterns': 'Path Cart',
  'Transportation Icon Patterns': 'Path Cart',
  'Coated Concrete Foundation Material': 'Double Ramp 8m (Coated)',

  /* 붐박스 테이프는 전부 붐박스 그림을 쓴다. 테이프별 그림이 위키에 없다 */
  'Goat Music Boombox Tape': 'Boom Box',
  'Absolute FICSIT Boombox Tape': 'Boom Box',
  'FICSIT Anniversary Boombox Tape': 'Boom Box',
  'Joel Syntholm Boombox Tape': 'Boom Box',
  'Le Michael Boombox Tape': 'Boom Box',
  'Sanctum Boombox Tape': 'Boom Box',
  'Sanctum 2 Boombox Tape': 'Boom Box',
};

/** 이 품목의 그림 후보들. 앞에 있는 것부터 시도한다 */
function candidates(s) {
  const out = [];
  const push = (n) => {
    if (n && !out.includes(n)) out.push(n);
  };
  push(NAME_FIX[s.en] ?? s.en);
  /* 묶음은 대표 건물 하나로. 게임 상점도 그렇게 보여 준다 */
  for (const b of s.unlocks.buildings) push(buildings.get(b.id)?.en);
  for (const i of s.unlocks.items) push(items.get(i.id)?.en);
  /* 복수형 묶음 이름은 단수로도 한 번 */
  const base = NAME_FIX[s.en] ?? s.en;
  if (/s$/.test(base)) push(base.replace(/s$/, ''));
  push(base.replace(/ (Set|Pack|Bundle)$/, ''));
  return out;
}

async function fileUrl(name, width = 256) {
  const url =
    `${WIKI}?action=query&format=json&prop=imageinfo&iiprop=url|size&iiurlwidth=${width}` +
    `&titles=${encodeURIComponent(`File:${name}.png`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined) return null;
  return page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? null;
}

/**
 * 후보 이름이 전부 빗나가면 파일 이름을 검색해서 찾는다.
 *
 * 위키의 파일 이름이 상점 품목 이름과 다른 것이 많다 —
 * 「타르 지붕 자재」의 그림은 File:Tar Roof.png 이고, 「경로 패턴」은 무늬 하나하나가 따로 있다.
 * 이름 규칙을 추측하는 대신 검색해서 가장 많이 겹치는 것을 고른다.
 */
async function searchFile(name) {
  const url =
    `${WIKI}?action=query&format=json&list=search&srnamespace=6&srlimit=12` +
    `&srsearch=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const hits = (json?.query?.search ?? [])
    .map((h) => h.title.replace(/^File:/, ''))
    .filter((t) => /\.png$/i.test(t));
  if (!hits.length) return null;

  const want = new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
  const score = (t) => {
    const toks = t
      .replace(/\.png$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const hit = toks.filter((x) => want.has(x)).length;
    /* 겹치는 낱말이 많고, 군더더기가 적은 쪽 */
    return hit * 10 - Math.abs(toks.length - want.size);
  };
  const best = hits.sort((a, b) => score(b) - score(a))[0];
  return score(best) > 0 ? best.replace(/\.png$/i, '') : null;
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  /* 위키가 안내용 1×1 을 돌려주는 일이 있다. 너무 작으면 실패로 본다 */
  if (buf.length < 700) return false;
  fs.writeFileSync(file, buf);
  return true;
}

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let got = 0;
let had = 0;
const missing = [];

/* 쿠폰 그림. 상점의 값표가 이걸 쓴다 */
const couponFile = path.join(OUT, '_coupon.png');
if (FORCE || !fs.existsSync(couponFile)) {
  const u = await fileUrl('FICSIT Coupon', 96);
  if (u && (await download(u, couponFile))) console.log('쿠폰 그림 확보');
  else console.log('[경고] 쿠폰 그림을 못 받았습니다');
}

for (const s of tech.shop) {
  const file = path.join(OUT, `${s.id}.png`);
  if (!FORCE && fs.existsSync(file)) {
    had++;
    continue;
  }
  let ok = false;
  for (const name of candidates(s)) {
    const u = await fileUrl(name);
    if (u && (await download(u, file))) {
      ok = true;
      break;
    }
    await sleep(80);
  }
  if (!ok) {
    /* 이름으로 못 찾으면 검색으로 한 번 더 */
    for (const name of candidates(s).slice(0, 2)) {
      const found = await searchFile(name);
      if (!found) continue;
      const u = await fileUrl(found);
      if (u && (await download(u, file))) {
        ok = true;
        console.log(`
  검색으로 찾음: ${s.ko} → ${found}`);
        break;
      }
      await sleep(80);
    }
  }
  if (ok) {
    got++;
    process.stdout.write('.');
  } else {
    missing.push(`${s.ko} (${s.en})`);
    process.stdout.write('x');
  }
  await sleep(80);
}

console.log('');
console.log(`상점 그림: 새로 ${got}개 · 이미 있던 것 ${had}개 · 못 찾음 ${missing.length}개`);
if (missing.length) {
  console.log('  못 찾음:');
  for (const m of missing) console.log('    - ' + m);
  console.log('  → 위키 파일 이름이 다르면 NAME_FIX 에 적으세요.');
}
