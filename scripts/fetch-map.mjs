#!/usr/bin/env node
/**
 * fetch-map.mjs — 지도 바탕을 공식 위키에서 받아 타일로 잘라 둔다.
 *
 * 왜 타일인가:
 *   원본이 5000×5000 이다. 통째로 넣으면 확대해도 안 깨지지만 첫 화면에서 몇 MB 를 받는다.
 *   반대로 1600×1600 한 장만 두면 확대하는 순간 뭉갠다 — 지금까지 그랬다.
 *   그래서 **작은 한 장으로 먼저 보여 주고, 확대하면 그 자리 타일만 받는다.**
 *
 *   preview  1024×1024 한 장   첫 화면. 즉시 뜬다
 *   tiles    4096 을 4×4 로    확대했을 때 보이는 칸만 받는다 (한 칸 1024×1024)
 *
 * 지도 위에 그리는 것(자원 노드·격자·시작 지점)은 전부 SVG 라 배율과 상관없이 선명하다.
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

/** 무엇을 받아 어떤 이름으로 둘 것인가 */
const LAYERS = [
  { file: 'Map.jpg', key: 'terrain', ko: '지형' },
  { file: 'Biome Map.jpg', key: 'biome', ko: '생물군계' },
];

/** 확대용 타일 격자. 4×4 = 16장, 한 장이 1024×1024 */
const GRID = 4;
const TILE = 1024;
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

const manifest = { grid: GRID, tile: TILE, preview: PREVIEW, layers: [] };

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
  fs.mkdirSync(dir, { recursive: true });

  /* 첫 화면용 한 장 */
  await sharp(src)
    .resize(PREVIEW, PREVIEW, { fit: 'fill' })
    .webp({ quality: 82 })
    .toFile(path.join(dir, 'preview.webp'));

  /* 확대용 타일. 원본을 GRID*TILE 로 맞춰 놓고 자른다 */
  const full = await sharp(src)
    .resize(GRID * TILE, GRID * TILE, { fit: 'fill' })
    .toBuffer();
  let bytes = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const out = path.join(dir, `${i}-${j}.webp`);
      await sharp(full)
        .extract({ left: i * TILE, top: j * TILE, width: TILE, height: TILE })
        .webp({ quality: 80 })
        .toFile(out);
      bytes += fs.statSync(out).size;
    }
  }
  const prev = fs.statSync(path.join(dir, 'preview.webp')).size;
  console.log(
    `${layer.ko}: 원본 ${meta.width}×${meta.height} → 미리보기 ${(prev / 1024) | 0}KB · ` +
      `타일 ${GRID * GRID}장 ${(bytes / 1048576).toFixed(1)}MB`
  );
  manifest.layers.push({ key: layer.key, ko: layer.ko, source: `File:${layer.file}` });
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/* 옛 한 장짜리는 지운다. 확대하면 뭉개져서 쓸 데가 없다 */
for (const old of ['ingame-map.webp', 'biome-map.webp']) {
  const p = path.join(OUT, old);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`옛 파일 제거: ${old}`);
  }
}

console.log('완료. 출처: satisfactory.wiki.gg (Coffee Stain Studios 자산)');
