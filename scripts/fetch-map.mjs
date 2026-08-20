#!/usr/bin/env node
/**
 * fetch-map.mjs — 지도 바탕을 받아 배율별 타일로 잘라 둔다.
 *
 * 어떤 그림인가:
 *   앞서 공식 위키의 `Map.jpg` 를 썼는데 그건 **인게임 지도 화면**이라 색이 거의 없다.
 *   커뮤니티 지도 도구들이 쓰는 것은 세계를 실제로 렌더한 그림이고 색이 살아 있다.
 *   그 렌더를 타일 피라미드로 공개해 둔 곳(rockfactory/satisfactory-logistics, MIT)에서
 *   한 번 받아 이어 붙인 뒤, 우리 배율 계단으로 다시 자른다.
 *
 *   지형    세계 렌더 (색 있음). 타일을 이어 붙여 8192 를 만든 뒤 다시 자른다
 *   생물군계 공식 위키의 Biome Map (지대 구분용)
 *
 * 왜 배율별인가:
 *   한 장만 두면 둘 중 하나가 된다 — 작으면 확대할 때 뭉개지고, 크면 첫 화면에서 몇 MB 를 받는다.
 *
 *     L0  1024 한 장     첫 화면. 즉시 뜬다
 *     L1  2048 (2×2)     조금 확대했을 때
 *     L2  5120 (5×5)     더 확대했을 때
 *
 * 자산 취급 (CLAUDE.md §4):
 *   지도 그림은 Coffee Stain Studios 자산이다. 출처를 기록하고 상업적 사용을 하지 않는다.
 *   좌표 데이터와 타일 배치는 MIT 프로젝트에서 왔고 그 출처도 함께 남긴다.
 *
 * 사용법: node scripts/fetch-map.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/map');
const CACHE = path.join(ROOT, '.tmp-research/map-src');
const WIKI = 'https://satisfactory.wiki.gg/api.php';
const UA =
  'satisfactory-ops/1.0 (open-source playbook; contact via github.com/edssert/satisfactory-ops)';

/** 세계 렌더 타일 피라미드. z=5 면 32×32 타일 = 8192px */
const TERRAIN_CDN =
  'https://satisfactory-logistics-maps.fra1.cdn.digitaloceanspaces.com/map/v2';
const TERRAIN_Z = 5;
const CDN_TILE = 256;

const FORCE = process.argv.includes('--force');

const TILE = 1024;
const LEVELS = [
  { level: 1, grid: 2, quality: 82 },
  { level: 2, grid: 5, quality: 78 },
];
const PREVIEW = 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 위키 파일의 원본 주소 */
async function wikiFile(file) {
  const url =
    `${WIKI}?action=query&format=json&prop=imageinfo&iiprop=url|size` +
    `&titles=${encodeURIComponent(`File:${file}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const page = Object.values((await res.json())?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

/**
 * 세계 렌더를 타일로 받아 한 장으로 잇는다.
 *
 * 1024장을 받으므로 한 번 받아 두면 캐시에 남는다(.tmp-research 는 저장소에 안 들어간다).
 */
async function buildTerrain() {
  const out = path.join(CACHE, `terrain-${TERRAIN_Z}.png`);
  if (!FORCE && fs.existsSync(out)) return out;

  const n = 2 ** TERRAIN_Z;
  const size = n * CDN_TILE;
  console.log(`지형 렌더 타일 ${n}×${n}장 내려받는 중 (${size}×${size})…`);
  const parts = [];
  let got = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cached = path.join(CACHE, 'tiles', `${TERRAIN_Z}-${x}-${y}.webp`);
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(path.dirname(cached), { recursive: true });
        const res = await fetch(`${TERRAIN_CDN}/${TERRAIN_Z}/${x}/${y}.webp`, {
          headers: { 'User-Agent': UA },
        });
        if (!res.ok) {
          console.error(`[실패] 타일 ${TERRAIN_Z}/${x}/${y} → ${res.status}`);
          process.exit(2);
        }
        fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
        await sleep(20);
      }
      parts.push({ input: cached, left: x * CDN_TILE, top: y * CDN_TILE });
      got++;
      if (got % 128 === 0) process.stdout.write(`  ${got}/${n * n}\r`);
    }
  }
  console.log(`  ${got}/${n * n} 완료. 이어 붙이는 중…`);
  await sharp({
    create: { width: size, height: size, channels: 3, background: '#000' },
  })
    .composite(parts)
    .png()
    .toFile(out);
  return out;
}

/** 한 장을 우리 배율 계단으로 자른다 */
async function slice(src, key, ko) {
  const meta = await sharp(src).metadata();
  const dir = path.join(OUT, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  await sharp(src)
    .resize(PREVIEW, PREVIEW, { fit: 'fill' })
    .webp({ quality: 84 })
    .toFile(path.join(dir, 'preview.webp'));

  const sizes = [`미리보기 ${(fs.statSync(path.join(dir, 'preview.webp')).size / 1024) | 0}KB`];
  for (const L of LEVELS) {
    const full = await sharp(src)
      .resize(L.grid * TILE, L.grid * TILE, { fit: 'fill', kernel: 'lanczos3' })
      .toBuffer();
    let bytes = 0;
    for (let j = 0; j < L.grid; j++) {
      for (let i = 0; i < L.grid; i++) {
        const o = path.join(dir, `${L.level}-${i}-${j}.webp`);
        await sharp(full)
          .extract({ left: i * TILE, top: j * TILE, width: TILE, height: TILE })
          .webp({ quality: L.quality })
          .toFile(o);
        bytes += fs.statSync(o).size;
      }
    }
    sizes.push(`L${L.level} ${L.grid * TILE}px ${L.grid ** 2}장 ${(bytes / 1048576).toFixed(1)}MB`);
  }
  console.log(`${ko}: 원본 ${meta.width}×${meta.height} → ${sizes.join(' · ')}`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const terrain = await buildTerrain();
await slice(terrain, 'terrain', '지형');

const biomeSrc = path.join(CACHE, 'Biome Map.jpg');
if (FORCE || !fs.existsSync(biomeSrc)) {
  const u = await wikiFile('Biome Map.jpg');
  if (!u) {
    console.error('[실패] Biome Map 을 위키에서 못 찾았습니다');
    process.exit(2);
  }
  const res = await fetch(u, { headers: { 'User-Agent': UA } });
  fs.writeFileSync(biomeSrc, Buffer.from(await res.arrayBuffer()));
}
await slice(biomeSrc, 'biome', '생물군계');

fs.writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      tile: TILE,
      preview: PREVIEW,
      levels: LEVELS.map((l) => ({ level: l.level, grid: l.grid })),
      layers: [
        { key: 'terrain', ko: '지형', source: `${TERRAIN_CDN} (z=${TERRAIN_Z})` },
        { key: 'biome', ko: '생물군계', source: 'satisfactory.wiki.gg File:Biome Map.jpg' },
      ],
      note:
        '지도 그림은 Coffee Stain Studios 자산이다. 세계 렌더는 rockfactory/satisfactory-logistics(MIT) 가 ' +
        '공개한 타일 피라미드에서 받아 다시 잘랐고, 생물군계는 공식 위키에서 받았다.',
    },
    null,
    2
  ) + '\n'
);
console.log('완료.');
