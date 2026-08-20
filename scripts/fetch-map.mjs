#!/usr/bin/env node
/**
 * fetch-map.mjs — 지도 바탕을 공식 위키에서 받아 배율별 타일로 잘라 둔다.
 *
 * 왜 배율별인가:
 *   한 장만 두면 둘 중 하나가 된다 — 작으면 확대할 때 뭉개지고, 크면 첫 화면에서 몇 MB 를 받는다.
 *   앞선 판본이 4096 한 벌만 만들어서 원본(5000)보다 낮은 해상도로 확대하고 있었다.
 *   그래서 **원본 해상도까지 올라가는 계단**을 만든다.
 *
 *     L0  1024 한 장     첫 화면. 즉시 뜬다
 *     L1  2048 (2×2)     조금 확대했을 때
 *     L2  5120 (5×5)     원본 해상도. 더 키워도 원본에 없는 정보라 여기가 끝이다
 *
 *   화면은 배율에 맞는 단계의 **보이는 타일만** 받는다.
 *
 * 지도 위에 그리는 것(자원 노드·격자·시작 지점)은 전부 SVG 라 배율과 무관하게 선명하다.
 * 지형만 사진이다 — 게임 지형의 벡터 원본은 공개된 것이 없다.
 *
 * 자산 취급 (CLAUDE.md §4):
 *   Coffee Stain Studios 자산이고 공식 위키에서 가져온다. 출처를 기록하고 상업적 사용을 하지 않는다.
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

const FORCE = process.argv.includes('--force');

const LAYERS = [
  { file: 'Map.jpg', key: 'terrain', ko: '지형' },
  { file: 'Biome Map.jpg', key: 'biome', ko: '생물군계' },
];

const TILE = 1024;
/** 배율 계단. grid × TILE 이 그 단계의 전체 해상도다 */
const LEVELS = [
  { level: 1, grid: 2, quality: 82 },
  { level: 2, grid: 5, quality: 78 },
];
const PREVIEW = 1024;

async function originalUrl(file) {
  const url =
    `${WIKI}?action=query&format=json&prop=imageinfo&iiprop=url|size` +
    `&titles=${encodeURIComponent(`File:${file}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const page = Object.values((await res.json())?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.url ?? null;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const manifest = { tile: TILE, preview: PREVIEW, levels: LEVELS.map((l) => ({ level: l.level, grid: l.grid })), layers: [] };

for (const layer of LAYERS) {
  const src = path.join(CACHE, layer.file);
  if (FORCE || !fs.existsSync(src)) {
    const u = await originalUrl(layer.file);
    if (!u) {
      console.error(`[실패] ${layer.file} 을 위키에서 못 찾았습니다`);
      process.exit(2);
    }
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error(`[실패] ${layer.file} 내려받기 ${res.status}`);
      process.exit(2);
    }
    fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    console.log(`${layer.ko} 원본 확보 (${(fs.statSync(src).size / 1048576).toFixed(1)}MB)`);
  }

  const meta = await sharp(src).metadata();
  const dir = path.join(OUT, layer.key);
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
        const out = path.join(dir, `${L.level}-${i}-${j}.webp`);
        await sharp(full)
          .extract({ left: i * TILE, top: j * TILE, width: TILE, height: TILE })
          .webp({ quality: L.quality })
          .toFile(out);
        bytes += fs.statSync(out).size;
      }
    }
    sizes.push(`L${L.level} ${L.grid * TILE}px ${L.grid * L.grid}장 ${(bytes / 1048576).toFixed(1)}MB`);
  }

  console.log(`${layer.ko}: 원본 ${meta.width}×${meta.height} → ${sizes.join(' · ')}`);
  manifest.layers.push({ key: layer.key, ko: layer.ko, source: `File:${layer.file}` });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('완료. 출처: satisfactory.wiki.gg (Coffee Stain Studios 자산)');
