#!/usr/bin/env node
/**
 * fetch-schematic-icons.mjs — **스키매틱 전용 아이콘**과 **보상 종류 배지**를 공식 위키에서 받는다.
 *
 * 왜 따로 받는가:
 *   허브 업그레이드와 마일스톤은 게임 안에서 「해금하는 물건의 그림」을 쓰지 않는다.
 *   전용 스키매틱 아이콘이 따로 있다 — 허브 1~6 은 집 모양에 체크 표시가 붙은 그림이고,
 *   마일스톤은 물류·생산·발전 같은 분류 그림이다. 우리는 여태 해금 목록의 첫 건물 아이콘을
 *   대신 걸어서, 게임 화면과 대조가 안 되는 그림(트럭·번개·건물)을 내보내고 있었다.
 *
 * 어디서 이름을 얻는가:
 *   게임 배포 데이터의 `FGSchematic.mSchematicIcon` 안에 텍스처 이름이 있다
 *   (`.../SchematicIcons/TXUI_SIcon_Logistics.TXUI_SIcon_Logistics`). build-data.mjs 가
 *   그 마지막 마디를 `icon` 으로 뽑아 두고, build-tech.mjs 가 {dir,id} 로 풀어 놓는다.
 *   위키는 같은 그림을 `Schematic_Icon_<이름>.png` 로 갖고 있다. 대응 규칙은 아래 candidates().
 *
 * 종류 배지:
 *   게임은 보상 아이콘 오른쪽 위에 「건물/아이템/장비/차량/탐색기/업그레이드」 배지를 얹는다.
 *   위키도 같은 그림을 Template:MilestoneTable 에서 `Recipe_Icon_*.png` 로 쓴다. 그대로 받는다.
 *
 * 자산 취급 (CLAUDE.md §4):
 *   Coffee Stain Studios 자산이며 공식 위키(satisfactory.wiki.gg)에서 가져온다.
 *   MIT 대상이 아니다. 출처를 ATTRIBUTION.json 에 남기고 상업적 사용·사칭을 하지 않는다.
 *
 * 사용법:
 *   node scripts/fetch-schematic-icons.mjs           없는 것만
 *   node scripts/fetch-schematic-icons.mjs --force   전부 다시
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/schematics');
const OUT_BADGE = path.join(ROOT, 'public/assets/badges');
const WIKI = 'https://satisfactory.wiki.gg/api.php';
const UA =
  'satisfactory-ops/1.0 (open-source playbook; contact via github.com/edssert/satisfactory-ops)';

const FORCE = process.argv.includes('--force');
const tech = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/app/tech.json'), 'utf8'));

/**
 * 보상 종류 배지. 왼쪽이 우리가 쓰는 이름, 오른쪽이 위키 파일 이름이다.
 * 위키 파일은 흰색 실루엣이고 이 앱은 어두운 바탕이라 `_Dark` 가 아닌 쪽이 맞다.
 */
const BADGES = {
  building: 'Recipe_Icon_Building',
  item: 'Recipe_Icon_Item',
  equipment: 'Recipe_Icon_Equipment',
  vehicle: 'Recipe_Icon_Vehicle',
  scanner: 'Recipe_Icon_Scanner',
  upgrade: 'Recipe_Icon_Upgrade',
  resource: 'Recipe_Icon_Resource',
};

/** CamelCase → Snake_Case. BaseBuilding → Base_Building, Logistics2 → Logistics_2 */
const snake = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Za-z])(\d)/g, '$1_$2');

/**
 * 텍스처 이름 → 위키 파일 이름 후보. 앞에서부터 시도한다.
 *
 * 위키가 규칙을 완전히 지키지는 않는다 — `TXUI_SIcon_HyperTubes` 는
 * `Schematic_Icon_HyperTubes.png`(쪼개지 않은 채) 다. 그래서 쪼갠 것과 안 쪼갠 것을 둘 다 넣고,
 * 그래도 빗나가면 File 네임스페이스 검색으로 한 번 더 찾는다.
 */
function candidates(texture) {
  const out = [];
  const push = (n) => {
    if (n && !out.includes(n)) out.push(n);
  };
  const sicon = /^TXUI_SIcon_(.+)$/.exec(texture);
  if (sicon) {
    push(`Schematic_Icon_${snake(sicon[1])}`);
    push(`Schematic_Icon_${sicon[1]}`);
  }
  /* 위키가 언리얼 자산 이름을 그대로 쓴 것들 (허브 업그레이드가 그렇다) */
  push(`${texture}.${texture}`);
  push(texture);
  push(snake(texture));
  return out;
}

async function fileUrl(name, width) {
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

/** 이름으로 못 찾으면 File 네임스페이스를 검색한다 (fetch-shop-icons.mjs 와 같은 방식) */
async function searchFile(name) {
  const url =
    `${WIKI}?action=query&format=json&list=search&srnamespace=6&srlimit=12` +
    `&srsearch=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const hits = (json?.query?.search ?? [])
    .map((h) => h.title.replace(/^File:/, ''))
    .filter((t) => /\.png$/i.test(t) && !/_Dark\.png$/i.test(t));
  if (!hits.length) return null;
  const toks = (s) =>
    s.replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  const want = new Set(toks(name));
  const score = (t) => {
    const ts = toks(t);
    return ts.filter((x) => want.has(x)).length * 10 - Math.abs(ts.length - want.size);
  };
  const best = hits.sort((a, b) => score(b) - score(a))[0];
  return score(best) > 0 ? best.replace(/\.png$/i, '') : null;
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  /*
   * 위키가 안내용 1×1 을 돌려주는 일이 있다. 너무 작으면 실패로 본다.
   * 문턱은 200B — 배지는 단색 실루엣이라 진짜 파일도 394B 밖에 안 된다(업그레이드 배지).
   * 400B 로 뒀다가 멀쩡한 배지를 「못 찾음」으로 버렸다.
   */
  if (buf.length < 200) return false;
  fs.writeFileSync(file, buf);
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 이 그림 하나를 받는다. 받았으면 쓴 위키 파일 이름을 돌려준다 */
async function grab(texture, dest, width) {
  for (const name of candidates(texture)) {
    const u = await fileUrl(name, width);
    if (u && (await download(u, dest))) return name;
    await sleep(80);
  }
  const found = await searchFile(candidates(texture)[0]);
  if (found) {
    const u = await fileUrl(found, width);
    if (u && (await download(u, dest))) return found;
  }
  return null;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT_BADGE, { recursive: true });

/* ─────────────────────────────────────────── 1. 스키매틱 아이콘 */

/** tech.json 이 `schematics/` 를 가리키는 것 전부 — 허브·마일스톤·MAM·상점을 통틀어 */
const wanted = new Map();
for (const group of ['hub', 'milestones', 'mam', 'shop']) {
  for (const e of tech[group] ?? []) {
    if (e.iconRef?.dir === 'schematics') wanted.set(e.iconRef.id, group);
  }
}

const attribution = [];
let got = 0;
let had = 0;
const missing = [];

for (const [texture, group] of wanted) {
  const dest = path.join(OUT, `${texture}.png`);
  if (!FORCE && fs.existsSync(dest)) {
    had++;
    attribution.push({ texture, file: `${texture}.png` });
    continue;
  }
  const used = await grab(texture, dest, 256);
  if (used) {
    got++;
    attribution.push({ texture, file: `${texture}.png`, wikiFile: `File:${used}.png` });
    process.stdout.write('.');
  } else {
    missing.push(`${texture} (${group})`);
    process.stdout.write('x');
  }
  await sleep(80);
}

/* ─────────────────────────────────────────── 2. 종류 배지 */

const badgeAttribution = [];
let badgeGot = 0;
const badgeMissing = [];
for (const [kind, wikiName] of Object.entries(BADGES)) {
  const dest = path.join(OUT_BADGE, `${kind}.png`);
  if (!FORCE && fs.existsSync(dest)) {
    badgeAttribution.push({ kind, file: `${kind}.png`, wikiFile: `File:${wikiName}.png` });
    continue;
  }
  const u = await fileUrl(wikiName, 64);
  if (u && (await download(u, dest))) {
    badgeGot++;
    badgeAttribution.push({ kind, file: `${kind}.png`, wikiFile: `File:${wikiName}.png` });
  } else {
    badgeMissing.push(`${kind} (File:${wikiName}.png)`);
  }
  await sleep(80);
}

/* ─────────────────────────────────────────── 3. 출처 기록 */

const note =
  'Coffee Stain Studios 자산이며 공식 위키(satisfactory.wiki.gg)에서 가져왔습니다. ' +
  'MIT 라이선스 대상이 아닙니다. 상업적 사용·게임사 사칭을 하지 않습니다. (CLAUDE.md §4)';

fs.writeFileSync(
  path.join(OUT, 'ATTRIBUTION.json'),
  JSON.stringify(
    {
      $comment: '스키매틱(허브 업그레이드·마일스톤) 전용 아이콘. ' + note,
      source: 'https://satisfactory.wiki.gg/',
      fetchedBy: 'scripts/fetch-schematic-icons.mjs',
      icons: attribution,
    },
    null,
    2
  ) + '\n'
);
fs.writeFileSync(
  path.join(OUT_BADGE, 'ATTRIBUTION.json'),
  JSON.stringify(
    {
      $comment:
        '보상 종류 배지. 게임이 보상 아이콘 오른쪽 위에 얹는 표식이고, ' +
        '위키 Template:MilestoneTable 이 쓰는 것과 같은 파일이다. ' + note,
      source: 'https://satisfactory.wiki.gg/',
      fetchedBy: 'scripts/fetch-schematic-icons.mjs',
      badges: badgeAttribution,
    },
    null,
    2
  ) + '\n'
);

console.log('');
console.log(
  `스키매틱 아이콘: 새로 ${got}개 · 이미 있던 것 ${had}개 · 못 찾음 ${missing.length}개 ` +
    `(필요 ${wanted.size}개)`
);
if (missing.length) {
  for (const m of missing) console.log('    - ' + m);
  console.log('  → 위키 파일 이름이 다르면 candidates() 에 후보를 추가하세요.');
}
console.log(
  `종류 배지: 새로 ${badgeGot}개 · 전체 ${Object.keys(BADGES).length}개 · 못 찾음 ${badgeMissing.length}개`
);
for (const m of badgeMissing) console.log('    - ' + m);
