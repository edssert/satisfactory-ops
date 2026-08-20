#!/usr/bin/env node
/**
 * build-collectibles.mjs — 지도에 얹을 수집품 좌표를 만든다.
 *
 * 무엇을 담나:
 *   파워 슬러그(파랑·노랑·보라) · 소머슬룹 · 머서 구체 · 하드 드라이브(추락 화물칸).
 *   전부 맵에 고정 개수로 놓여 있고 다시 생기지 않는다. 그래서 "어디에 몇 개 남았나"가
 *   실제 계획에 쓰인다 — 채굴 노드보다 이쪽이 더 자주 필요하다.
 *
 * 하드 드라이브는 잠금을 푸는 데 드는 물건이 화물칸마다 다르다. 그 목록을 같이 담는다.
 *
 * 출처:
 *   좌표는 rockfactory/satisfactory-logistics (MIT) 의 WorldCollectibles.json.
 *   좌표계는 자원 노드와 같은 변환을 쓴다 — fx=(x+324700)/750100, fy=(y+375000)/750000.
 *   (자원 노드 626개로 역산해 맞춘 값이고 최대 오차가 1e-5 다.)
 *   한글 이름과 잠금 비용의 품목 이름은 게임 로케일이 정본이다.
 *
 * 사용법: node scripts/build-collectibles.mjs [--src=경로]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const APP = path.join(ROOT, 'src/data/app');
const SRC_URL =
  'https://raw.githubusercontent.com/rockfactory/satisfactory-logistics/main/src/recipes/WorldCollectibles.json';
const CACHE = path.join(ROOT, '.tmp-research/WorldCollectibles.json');

const X0 = -324700;
const X_RANGE = 750100;
const Y0 = -375000;
const Y_RANGE = 750000;

/** 담을 종류와 게임 안에서의 정체 */
const KINDS = [
  { type: 'slugMk1', key: 'slug1', item: 'Desc_Crystal_C', ko: '파란색 파워 슬러그' },
  { type: 'slugMk2', key: 'slug2', item: 'Desc_Crystal_mk2_C', ko: '노란색 파워 슬러그' },
  { type: 'slugMk3', key: 'slug3', item: 'Desc_Crystal_mk3_C', ko: '보라색 파워 슬러그' },
  { type: 'somersloop', key: 'sloop', item: 'Desc_WAT1_C', ko: '소머슬룹' },
  { type: 'mercerSphere', key: 'mercer', item: 'Desc_WAT2_C', ko: '머서 구체' },
  /*
   * 하드 드라이브는 게임 아이템 목록에 없다 — 스키매틱 비용에만 등장한다.
   * 그림은 싱크 상점에서 받아 둔 것을 아이템 자리에 같은 이름으로 넣어 뒀다.
   */
  { type: 'hardDrive', key: 'drive', item: 'Desc_HardDrive_C', ko: '하드 드라이브' },
];

const arg = process.argv.find((a) => a.startsWith('--src='))?.slice(6);
let raw;
if (arg) raw = JSON.parse(fs.readFileSync(arg, 'utf8'));
else if (fs.existsSync(CACHE)) raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
else {
  const res = await fetch(SRC_URL, { headers: { 'User-Agent': 'satisfactory-ops/1.0' } });
  if (!res.ok) {
    console.error(`[실패] 원본을 못 받았습니다 (${res.status})`);
    process.exit(2);
  }
  const text = await res.text();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, text);
  raw = JSON.parse(text);
}

const items = JSON.parse(fs.readFileSync(path.join(APP, 'items.json'), 'utf8'));
const koOf = new Map(items.map((i) => [i.id, i.ko]));

const round = (n) => Math.round(n * 100000) / 100000;
const byType = new Map(KINDS.map((k) => [k.type, k]));

const out = [];
const missing = new Set();
for (const c of raw) {
  const k = byType.get(c.type);
  if (!k) continue;
  const cost = (c.unlockCost ?? []).map((u) => {
    if (!koOf.has(u.item)) missing.add(u.item);
    return { item: u.item, ko: koOf.get(u.item) ?? u.item, amount: u.amount };
  });
  out.push({
    id: c.id,
    kind: k.key,
    fx: round((c.x - X0) / X_RANGE),
    fy: round((c.y - Y0) / Y_RANGE),
    ...(cost.length ? { cost } : {}),
  });
}

/* 좌표가 지도를 벗어나면 변환이 틀린 것이다. 조용히 밖에 찍히게 두지 않는다 */
const outside = out.filter((c) => c.fx < 0 || c.fx > 1 || c.fy < 0 || c.fy > 1);
if (outside.length) {
  console.error(`[실패] 지도 밖으로 나간 수집품 ${outside.length}개 — 좌표 변환이 틀렸습니다`);
  process.exit(3);
}
if (missing.size) {
  console.error(`[실패] 이름을 못 찾은 잠금 비용 품목: ${[...missing].join(', ')}`);
  process.exit(3);
}

const counts = {};
for (const c of out) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
const drives = out.filter((c) => c.kind === 'drive');

const doc = {
  $comment:
    '지도에 얹는 수집품. 맵에 고정 개수로 놓여 있고 다시 생기지 않는다. ' +
    '하드 드라이브는 화물칸마다 잠금을 푸는 물건이 다르므로 그 목록을 같이 담는다.',
  $source: 'rockfactory/satisfactory-logistics (MIT) — src/recipes/WorldCollectibles.json',
  $transform: `fx=(x-${X0})/${X_RANGE}, fy=(y-${Y0})/${Y_RANGE} — 자원 노드와 같은 변환`,
  $kinds: KINDS.map((k) => ({ key: k.key, ko: k.ko, item: k.item, n: counts[k.key] ?? 0 })),
  $counts: counts,
  $driveNote: `하드 드라이브 ${drives.length}개 중 ${drives.filter((d) => d.cost).length}개에 잠금 비용이 있다. 나머지는 비용 없이 열리거나 전력 연결이 필요한 화물칸이다.`,
  items: out,
};

fs.writeFileSync(path.join(APP, 'collectibles.json'), JSON.stringify(doc) + '\n');
console.log(
  '수집품: ' +
    KINDS.map((k) => `${k.ko} ${counts[k.key] ?? 0}`).join(' · ') +
    `\n하드 드라이브 잠금 비용: ${drives.filter((d) => d.cost).length}/${drives.length}건`
);
