#!/usr/bin/env node
/**
 * field-scope.mjs — 게임 원본에서 **어떤 클래스들이 이 필드를 갖고 있는지** 센다.
 *
 * 왜 있나: `mSpeed` 는 컨베이어에서만 처리량이다. 그런데 작업자용 엘리베이터
 * (FGBuildableElevator)에도 같은 이름의 필드가 있고 값이 800 이다. 그걸 벨트로 읽어
 * 400/분짜리 벨트가 생겼고, 화면이 "그때 필요한 벨트: 작업자용 엘리베이터"라고 답했다.
 *
 * 필드 이름은 소유자를 말해 주지 않는다. 이 스크립트가 소유자를 세어 준다.
 *
 * 사용:
 *   node .claude/skills/external-data-claim/scripts/field-scope.mjs mSpeed
 *   node .claude/skills/external-data-claim/scripts/field-scope.mjs mSpeed --gen
 *
 *   --gen  원본 대신 생성물(src/data/buildings.json)에서 센다. 필터가 새는지 볼 때 쓴다.
 *
 * 읽는 법:
 *   나온 nativeClass 가 **하나뿐**이면 그 필드를 그대로 써도 된다.
 *   둘 이상이면 값의 뜻이 클래스마다 다르다고 보고, 쓰기 전에 클래스로 좁혀라.
 *
 * 종료 코드: 0 = 하나뿐(안전) · 3 = 둘 이상(좁혀야 함) · 1 = 필드 없음/원본 없음
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const field = process.argv[2];
const useGenerated = process.argv.includes('--gen');

if (!field) {
  console.error('사용: node .claude/skills/external-data-claim/scripts/field-scope.mjs <필드명> [--gen]');
  process.exit(1);
}

const short = (s) => (String(s).match(/'(?:.*\.)?(\w+)'/) ?? [])[1] ?? String(s);

/** nativeClass -> 그 필드를 가진 클래스들 */
const groups = new Map();
const add = (k, label) => {
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(label);
};

if (useGenerated) {
  const p = path.join(ROOT, 'src/data/buildings.json');
  if (!fs.existsSync(p)) {
    console.error('[없음] src/data/buildings.json — `npm run data:game` 을 먼저 돌리세요.');
    process.exit(1);
  }
  for (const b of JSON.parse(fs.readFileSync(p, 'utf8'))) {
    if (b[field] != null) add(b.nativeClass ?? '(nativeClass 없음)', `${b.className}=${b[field]}`);
  }
} else {
  const metaPath = path.join(ROOT, 'src/data/meta.json');
  if (!fs.existsSync(metaPath)) {
    console.error('[없음] src/data/meta.json — `npm run data:game` 을 먼저 돌리세요.');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const src = meta.source?.file;
  if (!src || !fs.existsSync(src)) {
    console.error(`[없음] 게임 원본이 이 자리에 없습니다: ${src}`);
    console.error('       게임이 설치된 기기에서 돌리거나 --gen 으로 생성물을 보세요.');
    process.exit(1);
  }
  const enc = meta.source.encoding === 'utf-16le' ? 'utf16le' : 'utf8';
  const raw = JSON.parse(fs.readFileSync(src).toString(enc).replace(/^﻿/, ''));
  for (const g of raw) {
    const n = short(g.NativeClass);
    for (const c of g.Classes ?? []) {
      if (c[field] !== undefined) add(n, `${c.ClassName}=${c[field]}`);
    }
  }
}

if (groups.size === 0) {
  console.error(`[없음] '${field}' 를 가진 클래스가 하나도 없습니다. 필드 이름을 확인하세요.`);
  process.exit(1);
}

console.log(`'${field}' 를 가진 nativeClass ${groups.size}종:\n`);
for (const [k, v] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(34)} ${String(v.length).padStart(4)}개   ${v.slice(0, 2).join(' | ')}`);
}

if (groups.size > 1) {
  console.log(
    `\n[좁혀야 함] 소유자가 ${groups.size}종입니다. 값의 뜻이 클래스마다 다릅니다.\n` +
      `            쓰기 전에 nativeClass 로 거르고, build-data.mjs 새니티 표에\n` +
      `            "이 필드가 붙은 건물은 X 뿐" 검사를 추가하세요.`
  );
  process.exit(3);
}
console.log('\n[안전] 소유자가 하나뿐입니다.');
