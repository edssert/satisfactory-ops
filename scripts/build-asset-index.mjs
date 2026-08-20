/**
 * build-asset-index.mjs — **실제로 있는 아이콘 파일 목록**을 만든다.
 *
 * 없는 것을 목록으로 관리하려다 실패했다. 상점이 참조하는 id 중에는 items.json 에
 * 아예 없는 것이 있어서(동상류) "데이터에 있는데 파일이 없는 것"만 세면 놓친다.
 * 반대로 **있는 파일**을 세면 빠질 수가 없다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const list = (dir) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs
        .readdirSync(path.join(ROOT, dir))
        .filter((f) => f.endsWith('.png'))
        .map((f) => f.replace(/\.png$/, ''))
        .sort()
    : [];

const items = list('public/assets/items');
const buildings = list('public/assets/buildings-png');
const out = {
  $comment:
    'public/assets 에 실제로 있는 아이콘 목록. scripts/build-asset-index.mjs 산출물이며 직접 수정하지 않는다. ' +
    '화면은 이 목록에 있는 것만 <img> 로 건다 — 없는 그림을 걸면 빈칸이 나간다.',
  items,
  buildings,
};
fs.writeFileSync(path.join(ROOT, 'src/data/app/assets.json'), JSON.stringify(out) + '\n');
console.log(`자산 색인: 아이템 ${items.length} · 건물 ${buildings.length}`);
