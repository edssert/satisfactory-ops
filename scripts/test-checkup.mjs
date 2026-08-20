#!/usr/bin/env node
/**
 * test-checkup.mjs — 세이브 진단(save-factory / diagnose)이 맞는 값을 내는지 잠근다.
 *
 * 왜 필요한가:
 *   세이브 파싱은 조용히 틀린다. 경량 건물을 빼먹으면 건물 수의 70%가 사라지고, 벨트를
 *   안 따라가면 간선이 통째로 비고, 그래도 화면은 멀쩡히 그려진다. 눈으로는 못 잡는다.
 *   그래서 조사(.tmp-research/save-factory-*.mjs)로 확인한 값을 여기에 박아 두고 대조한다.
 *
 * 무엇과 대조하나 (두 겹이다):
 *   1) 박아 둔 정답값 — rese.sav 에서 실제로 찍어 확인한 수치
 *   2) 이 스크립트가 파서로 직접 다시 센 값 — 모듈과 독립적으로 계산한다.
 *      정답값이 낡았을 때 어느 쪽이 움직였는지 구분하려고 두 겹으로 본다
 *
 * 실행: node scripts/test-checkup.mjs <세이브경로>
 *   경로를 안 주면 알려진 세이브 폴더의 rese.sav 를 쓴다.
 *   정답 대조는 rese.sav 에만 한다. 나머지 세이브는 크래시·불변식만 본다.
 *
 * 종료 코드: 하나라도 어긋나면 1, 전부 맞으면 0.
 *   내 모듈이 아직 없으면 그 사실만 알리고 0으로 끝낸다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_FACTORY = path.join(ROOT, 'src/lib/save-factory.ts');
const SRC_DIAGNOSE = path.join(ROOT, 'src/lib/diagnose.ts');
const CATALOG = path.join(ROOT, 'src/data/app/checkup-catalog.json');
const TMP = path.join(ROOT, '.tmp-research');

const SAVE_DIR = 'C:/Users/User/AppData/Local/FactoryGame/Saved/SaveGames/76561198202040483';
const GOLDEN_SAVE = 'rese.sav';
const OTHER_SAVES = ['111_autosave_0.sav', '111_autosave_1.sav', '111_autosave_2.sav'];

const near = (a, b, eps) => typeof a === 'number' && Math.abs(a - b) <= eps;

/* ------------------------------------------------------------------ 정답값 */
/**
 * rese.sav 에서 조사로 확인한 값. 출처는 .tmp-research/save-factory-08-report.mjs,
 * -10-graph.mjs, -11-nodes-and-perf.mjs, -12-productivity.mjs 의 출력이다.
 * 게임 패치나 세이브 교체로 이 값이 바뀌면 여기가 먼저 깨져야 한다 — 그게 목적이다.
 */
const GOLD = {
  fileKB: 484,
  objects: 4419,
  session: '111',
  hours: 35.9,
  fullActors: 408,
  fullKinds: 28,
  lightweight: 987,
  lightKinds: 22,
  machinesWithRecipe: 32,
  /*
   * 분배기·병합기를 접은 뒤의 수. **이 스크립트의 참조 구현이 낸 값**이다
   * (`node scripts/test-checkup.mjs --ref` 로 다시 뽑을 수 있다).
   * 모듈이 낸 값을 베끼면 검증이 아니게 되므로 근거를 참조 구현 쪽에 둔다.
   * 접기 전 값은 91/23 이었다 — 그때는 "제련기 → 분배기" 를 세고 있었다.
   */
  edges: 121,
  danglingOutputs: 11,
  /* 그래프의 점: 생산 설비 43 + 창고 17 */
  graphNodes: 60,
  storageNodes: 17,
  genMW: 210.0,
  useMW: 153.0,
  circuits: 1,
  storageContainers: 16,
  /* 저장 컨테이너만 합한 값 (설비 버퍼는 빼고) */
  storageOnly: { Desc_Cement_C: 13015, Desc_IronScrew_C: 11000, Desc_Wire_C: 10000 },
  miners: [
    { node: 'BP_ResourceNode445', resourceKo: '구리 광석', purity: 'pure' },
    { node: 'BP_ResourceNode435_26', resourceKo: '철 광석', purity: 'pure' },
    { node: 'BP_ResourceNode440', resourceKo: '석회석', purity: 'pure' },
    { node: 'BP_ResourceNode437_30', resourceKo: '철 광석', purity: 'pure' },
  ],
  /* 직전 5분 창의 가동률 */
  uptimes: [
    { what: '채굴기(느린 쪽)', pct: '16.7%', match: (x) => x.node && near(x.uptime, 0.167, 0.002) },
    { what: '채굴기(빠른 쪽)', pct: '49.9%', match: (x) => x.node && near(x.uptime, 0.499, 0.002) },
    {
      what: '제작기 바이오매스(나무)',
      pct: '6.7%',
      match: (x) => /바이오매스\(나무\)/.test(x.recipeKo ?? '') && near(x.uptime, 0.067, 0.002),
    },
    {
      what: '조립기 보강된 철판',
      pct: '100%',
      match: (x) => /보강된 철판/.test(x.recipeKo ?? '') && near(x.uptime, 1, 1e-9),
    },
  ],
};

/* ------------------------------------------------------------------ 판정판 */
const results = [];
function ok(name, detail) {
  results.push({ pass: true, name, detail });
  console.log(`  [통과] ${name.padEnd(24)} ${detail ?? ''}`);
}
function bad(name, detail) {
  results.push({ pass: false, name, detail });
  console.log(`  [실패] ${name.padEnd(24)} ${detail ?? ''}`);
}
/** 값을 실제로 찍어 비교한다. "아마 맞을 것" 은 없다 */
function eq(name, got, want, fmt = (v) => String(v)) {
  if (got === want) ok(name, fmt(got));
  else bad(name, `기대 ${fmt(want)} · 실제 ${fmt(got)}`);
}
function eqNear(name, got, want, eps, unit = '') {
  if (near(got, want, eps)) ok(name, `${got}${unit}`);
  else bad(name, `기대 ${want}${unit} · 실제 ${got}${unit}`);
}

/* ------------------------------------------- 1단계: 내 모듈이 있나 / 번들 */
if (!fs.existsSync(SRC_FACTORY)) {
  console.log('■ src/lib/save-factory.ts — 아직 없음. 파일이 생기면 다시 돌리세요.');
  process.exit(0);
}
if (!fs.existsSync(CATALOG)) {
  console.log('■ src/data/app/checkup-catalog.json — 아직 없음. 파일이 생기면 다시 돌리세요.');
  process.exit(0);
}
const hasDiagnose = fs.existsSync(SRC_DIAGNOSE);

console.log('■ 준비');
console.log(`  save-factory.ts  있음 (${(fs.statSync(SRC_FACTORY).size / 1024).toFixed(1)} KB)`);
console.log(
  `  diagnose.ts      ${hasDiagnose ? `있음 (${(fs.statSync(SRC_DIAGNOSE).size / 1024).toFixed(1)} KB)` : '아직 없음 — 이 부분 검사는 건너뜁니다'}`
);
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

/*
 * --ref : 내 모듈은 안 부르고, 참조 구현이 낸 값만 찍는다.
 * 정답값(GOLD)을 새로 잡을 때 쓴다. 모듈이 낸 값을 베끼면 검증이 아니게 되므로,
 * 기준은 항상 여기서 나온 값으로 삼는다.
 */
if (process.argv.includes('--ref')) {
  console.log('');
  console.log('■ 참조 구현이 낸 값 (모듈 없이 파서만 씀)');  for (const f of [GOLDEN_SAVE, ...OTHER_SAVES].map((x) => path.join(SAVE_DIR, x))) {
    if (!fs.existsSync(f)) continue;
    const r = reference(f);
    console.log(
      `  ${path.basename(f).padEnd(20)} 객체 ${r.objects} · 완전 ${r.fullActors}/${r.fullKinds}종 · 경량 ${r.lightweight}/${r.lightKinds}종 · ` +
        `점 ${r.nodeKeys.size}(창고 ${r.storageKeys.size}) · 간선 ${r.edges}(중복 뺀 쌍 ${r.edgeSet.size}) · 끊긴 출력구 ${r.dangling}`
    );
  }
  process.exit(0);
}

/*
 * TypeScript 는 node 가 그대로 못 읽는다. esbuild 로 묶어서 .mjs 로 떨군 뒤 불러 온다.
 * (tests/planner-ui.test.ts 가 쓰는 것과 같은 수법이다. 거기는 파일 하나라 transformSync 로
 *  충분했지만, 여기는 모듈이 서로를 부를 수 있으므로 bundle 로 묶는다.)
 * node_modules 는 external 로 둔다 — 파서를 통째로 묶으면 느리기만 하고 얻는 게 없다.
 */
const { build } = await import('esbuild');
fs.mkdirSync(TMP, { recursive: true });
const entry = path.join(TMP, '.checkup-entry.mjs');
const bundle = path.join(TMP, '.checkup-bundle.mjs');
const imp = (p) => JSON.stringify(path.relative(TMP, p).split(path.sep).join('/'));
fs.writeFileSync(
  entry,
  `export * as factory from ${imp(SRC_FACTORY)};\n` +
    (hasDiagnose ? `export * as diagnose from ${imp(SRC_DIAGNOSE)};\n` : ''),
  'utf8'
);
try {
  await build({
    entryPoints: [entry],
    outfile: bundle,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    logLevel: 'silent',
    absWorkingDir: ROOT,
  });
} catch (e) {
  const msg = (e.errors ?? []).map((x) => `${x.location?.file ?? ''}:${x.location?.line ?? ''} ${x.text}`);
  console.log(`\n  [실패] esbuild 번들\n         ${msg.join('\n         ') || e.message}`);
  console.log('\n[실패] 번들이 안 돼서 검사를 못 했습니다.');
  process.exit(1);
}
const mod = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`);
const readFactory = mod.factory?.readFactory;
if (typeof readFactory !== 'function') {
  console.log(
    `\n  [실패] save-factory.ts 에 readFactory 내보내기가 없습니다. 내보낸 것: ${Object.keys(mod.factory ?? {}).join(', ') || '(없음)'}`
  );
  process.exit(1);
}
console.log('  번들             완료');

/* ------------------------------------------- 2단계: 독립 기준 구현(참조값) */
/**
 * 모듈을 안 쓰고 파서로 직접 다시 센다. 조사 스크립트가 하던 계산을 그대로 옮긴 것이다.
 * 모듈과 이것이 다르면 둘 중 하나가 틀린 것이고, 어느 쪽인지는 정답값이 갈라 준다.
 */
function reference(input) {
  const { Parser } = require('@etothepii/satisfactory-file-parser');
  /*
   * 경로가 아니라 이미 읽어 둔 바이트를 받는다.
   * 게임이 켜져 있으면 오토세이브가 5분마다 덮어써진다 — 모델과 참조가 각자 파일을
   * 다시 읽으면 서로 다른 세이브를 보고 엉뚱하게 어긋난다. 한 번 읽어 둘 다 그걸 쓴다.
   */
  const raw = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const save = Parser.ParseSave('ref', raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const all = [];
  for (const lv of Object.values(save.levels ?? {})) for (const o of lv.objects ?? []) all.push(o);
  const byName = new Map(all.map((o) => [o.instanceName, o]));
  const cls = (p) => (p ?? '').split('.').pop();
  const acts = all.filter((o) => o.type === 'SaveEntity' && /^Build_.*_C$/.test(cls(o.typePath)));

  const full = new Map();
  for (const o of acts) full.set(cls(o.typePath), (full.get(cls(o.typePath)) ?? 0) + 1);
  const light = new Map();
  let lightTotal = 0;
  for (const o of all) {
    if (!/FGLightweightBuildableSubsystem/.test(o.typePath ?? '')) continue;
    for (const g of o.specialProperties?.buildables ?? []) {
      const c = cls(g.typeReference.pathName);
      light.set(c, (light.get(c) ?? 0) + g.instances.length);
      lightTotal += g.instances.length;
    }
  }
  const counts = new Map(full);
  for (const [k, v] of light) counts.set(k, (counts.get(k) ?? 0) + v);

  /* 재고 — 창고만 / 창고+설비버퍼 두 가지로 낸다. 모듈이 어느 쪽을 재는지 구분하려고 */
  const sumInv = (pn, into) => {
    const inv = byName.get(pn);
    for (const s of inv?.properties?.mInventoryStacks?.values ?? []) {
      const it = cls(s.properties?.Item?.value?.itemReference?.pathName ?? '');
      const n = s.properties?.NumItems?.value ?? 0;
      if (!it || !n) continue;
      into.set(it, (into.get(it) ?? 0) + n);
    }
  };
  const storageOnly = new Map();
  const withBuffers = new Map();
  for (const o of acts) {
    const p = o.properties ?? {};
    if (p.mStorageInventory) {
      sumInv(p.mStorageInventory.value.pathName, storageOnly);
      sumInv(p.mStorageInventory.value.pathName, withBuffers);
    }
    if (p.mInputInventory) sumInv(p.mInputInventory.value.pathName, withBuffers);
    if (p.mOutputInventory) sumInv(p.mOutputInventory.value.pathName, withBuffers);
  }

  /* -------------------------------------------------- 접힌 그래프 (독립 구현) */
  /*
   * 점(node) = 생산 설비(레시피가 붙었거나 채굴기·발전기) + 저장 컨테이너.
   * 그 사이의 벨트·리프트·분배기·병합기·바닥 구멍은 전부 접는다 —
   * 분배기는 도착지가 아니라 갈림길이라 "제련기 → 분배기" 로 끊으면 흐름을 못 읽는다.
   *
   * 무엇을 접을지는 **카탈로그의 cat === 'logistics'** 로 정한다.
   * 모듈은 클래스명 정규식으로 정한다 — 일부러 다른 근거를 쓴다. 같은 근거를 쓰면
   * 같이 틀려도 둘 다 통과해 버린다. (참고로 cat 쪽이 더 넓다. 선별 분배기·우선 병합기·
   * 밸브·처리량 모니터까지 든다. 이 세이브 4개에는 그런 게 없어 결과는 같아야 한다.)
   *
   * 우주 엘리베이터는 연결구가 6개나 되지만 접으면 안 된다 — 물건이 들어가고 끝나는
   * 종점이지 통로가 아니다. cat 이 'structure' 라 자연히 걸러진다.
   */
  const B = catalog.buildings ?? {};
  const isMachine = (o) => {
    const cat = B[cls(o.typePath)]?.cat;
    return !!o.properties?.mCurrentRecipe || cat === 'extractor' || cat === 'generator';
  };
  const isNode = (o) => isMachine(o) || !!o.properties?.mStorageInventory;
  const nodeKeys = new Set(acts.filter(isNode).map((o) => o.instanceName));
  /* 창고는 설비가 아니면서 점인 것 — 모듈의 storageKeys 와 같은 뜻이어야 한다 */
  const storageKeys = new Set(
    acts.filter((o) => !isMachine(o) && o.properties?.mStorageInventory).map((o) => o.instanceName)
  );

  const conns = all.filter((o) => /FGFactoryConnectionComponent/.test(o.typePath ?? ''));
  const link = new Map();
  for (const c of conns) {
    const t = c.properties?.mConnectedComponent?.value?.pathName;
    if (t) link.set(c.instanceName, t);
  }
  const ownerOf = (n) => byName.get(n)?.parentEntityName ?? n.split('.').slice(0, -1).join('.');
  const compsOf = (n) =>
    (byName.get(n)?.components ?? [])
      .map((x) => x.pathName)
      .filter((p) => /FGFactoryConnectionComponent/.test(byName.get(p)?.typePath ?? ''));
  /** 통로인가. 점이면 절대 통로가 아니다 — 순서가 중요하다 */
  const isConduit = (owner) => {
    const o = byName.get(owner);
    if (!o || nodeKeys.has(owner)) return false;
    return B[cls(o.typePath)]?.cat === 'logistics';
  };

  /**
   * 출력구 하나에서 시작해 닿는 점을 전부 모은다.
   * 모듈은 너비 우선 큐를 쓴다. 여기는 깊이 우선 스택으로 훑는다 — 같은 답이 나와야 한다.
   */
  const reachable = (startComp) => {
    const hit = new Set();
    const seen = new Set();
    const stack = [];
    const first = link.get(startComp);
    if (first) stack.push(first);
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const owner = ownerOf(cur);
      if (!isConduit(owner)) {
        /* 점이 아니면(우주 엘리베이터·싱크 등) 그냥 버린다 */
        if (nodeKeys.has(owner)) hit.add(owner);
        continue;
      }
      for (const c of compsOf(owner)) {
        if (c === cur) continue;
        const nxt = link.get(c);
        if (nxt && !seen.has(nxt)) stack.push(nxt);
      }
    }
    return hit;
  };

  const edgeList = [];
  let dangling = 0;
  for (const o of acts) {
    if (!nodeKeys.has(o.instanceName)) continue;
    for (const cp of compsOf(o.instanceName)) {
      if (!/^Output/.test(cp.split('.').pop())) continue;
      const hits = reachable(cp);
      if (!hits.size) {
        dangling++;
        continue;
      }
      for (const to of hits) edgeList.push({ from: o.instanceName, to });
    }
  }

  const circuits =
    all.find((o) => /BP_CircuitSubsystem/.test(o.typePath ?? ''))?.specialProperties?.circuits ?? [];

  return {
    objects: all.length,
    fullActors: acts.length,
    fullKinds: full.size,
    lightweight: lightTotal,
    lightKinds: light.size,
    counts,
    countsTotal: [...counts.values()].reduce((a, b) => a + b, 0),
    withRecipe: acts.filter((o) => o.properties?.mCurrentRecipe).length,
    storageOnly,
    withBuffers,
    edgeList,
    edges: edgeList.length,
    edgeSet: new Set(edgeList.map((e) => `${e.from}\u0000${e.to}`)),
    dangling,
    nodeKeys,
    storageKeys,
    /* 어긋났을 때 instanceName 대신 "제련기#123" 처럼 찍으려고 */
    label: new Map(
      acts.map((o) => [
        o.instanceName,
        `${B[cls(o.typePath)]?.ko ?? cls(o.typePath)}#${(o.instanceName ?? '').split('_').pop()}`,
      ])
    ),
    circuits: circuits.length,
    instanceNames: new Set(all.map((o) => o.instanceName)),
    session: save.header?.sessionName,
    hours: Math.round((save.header?.playDurationSeconds ?? 0) / 360) / 10,
  };
}

/* ------------------------------------------------------------------- 실행 */
const argSave = process.argv[2];
const target = argSave ? path.resolve(argSave) : path.join(SAVE_DIR, GOLDEN_SAVE);
if (!fs.existsSync(target)) {
  console.log(`\n[실패] 세이브가 없습니다: ${target}`);
  process.exit(1);
}

/** 계약이 동기일 수도 비동기일 수도 있다. 둘 다 받는다 */
async function runOne(file) {
  const stat = fs.statSync(file);
  const raw = fs.readFileSync(file);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const t0 = performance.now();
  const model = await readFactory(ab, catalog, path.basename(file));
  return { model, ms: performance.now() - t0, kb: stat.size / 1024, raw };
}

let run;
try {
  run = await runOne(target);
} catch (e) {
  console.log(`\n[실패] readFactory 가 던졌습니다\n${e?.stack ?? e}`);
  process.exit(1);
}
const m = run.model;
const ref = reference(run.raw);
const keyOf = (x) => x.key ?? x.instanceName ?? x.id;
const nameOf = (n) => ref.label.get(n) ?? (n ?? '').split('.').pop() ?? String(n);
const isGolden = path.basename(target).toLowerCase() === GOLDEN_SAVE;

console.log(`\n■ ${path.basename(target)} — ${run.kb.toFixed(0)} KB · 파싱+모델링 ${run.ms.toFixed(0)} ms`);

/* ------------------------------------------------- 구조 검사 (모든 세이브) */
console.log('\n  · 구조');
const need = ['session', 'hours', 'machines', 'counts', 'power', 'stock', 'edges', 'danglingOutputs'];
const missing = need.filter((k) => m?.[k] === undefined);
if (missing.length) bad('필드 존재', `빠진 것: ${missing.join(', ')}`);
else ok('필드 존재', need.join(', '));

/*
 * 계약이 흔들리면 여기 먼저 보인다. 통과/실패로 세지는 않는다 —
 * 모듈을 아직 쓰는 중이라 필드가 늘고 줄 수 있고, 그걸 실패로 부르면 시끄럽기만 하다.
 */
{
  const m0 = (m.machines ?? [])[0];
  const e0 = (m.edges ?? [])[0];
  const notes = [
    `readFactory  ${readFactory.constructor.name === 'AsyncFunction' ? 'async (Promise 반환)' : '동기'}`,
    `FactoryModel 필드  ${Object.keys(m ?? {}).join(', ')}`,
    `machine 필드       ${m0 ? Object.keys(m0).join(', ') : '(설비 없음)'}`,
    `edge 필드          ${e0 ? Object.keys(e0).join(', ') : '(간선 없음)'}`,
  ];
  console.log('\n  · 계약 (참고 — 통과/실패로 세지 않음)');
  for (const n of notes) console.log(`  [참고] ${n}`);
}

/* 3. counts 의 합이 실제 객체 수와 맞는가 */
eq('counts 합', Object.values(m.counts ?? {}).reduce((a, b) => a + b, 0), ref.countsTotal,
  (v) => `${v}개 (완전 ${ref.fullActors} + 경량 ${ref.lightweight})`);
eq('counts 종류 수', Object.keys(m.counts ?? {}).length, ref.counts.size, (v) => `${v}종`);
{
  const diff = [];
  for (const [k, v] of ref.counts) if ((m.counts?.[k] ?? 0) !== v) diff.push(`${k} 기대${v}/실제${m.counts?.[k] ?? 0}`);
  for (const k of Object.keys(m.counts ?? {})) if (!ref.counts.has(k)) diff.push(`${k} 기대0/실제${m.counts[k]}`);
  if (diff.length) bad('counts 종류별', diff.slice(0, 6).join(', ') + (diff.length > 6 ? ` 외 ${diff.length - 6}건` : ''));
  else ok('counts 종류별', `${ref.counts.size}종 전부 일치`);
}

/* 4. 좌표가 전부 [0,1] 안인가 */
{
  const inRange = (v) => typeof v === 'number' && v >= 0 && v <= 1;
  const out = (m.machines ?? []).filter((x) => !(inRange(x.fx) && inRange(x.fy)));
  if (out.length)
    bad('좌표 [0,1]', `벗어남 ${out.length}대 — 예: ${out.slice(0, 3).map((x) => `${x.id}(${x.fx},${x.fy})`).join(', ')}`);
  else {
    const fx = (m.machines ?? []).map((x) => x.fx);
    const fy = (m.machines ?? []).map((x) => x.fy);
    ok('좌표 [0,1]', `${m.machines.length}대 · fx ${Math.min(...fx).toFixed(4)}..${Math.max(...fx).toFixed(4)} · fy ${Math.min(...fy).toFixed(4)}..${Math.max(...fy).toFixed(4)}`);
  }
}

/* 5. edges 의 양 끝이 진짜 이름인가 */
{
  const machineKeys = new Set((m.machines ?? []).map(keyOf));
  const ends = (m.edges ?? []).flatMap((e) => [e.from, e.to]);
  const notReal = [...new Set(ends.filter((n) => !ref.instanceNames.has(n)))];
  if (notReal.length) bad('간선 끝 = 실제 객체', `세이브에 없는 이름 ${notReal.length}개 — ${notReal.slice(0, 3).join(', ')}`);
  else ok('간선 끝 = 실제 객체', `${ends.length}개 끝 전부 세이브에 있음`);

  /* 그래프의 점은 설비 + 창고다. 창고도 도착지라야 "쌓이기만 하는지" 를 볼 수 있다 */
  const graphKeys = new Set([...machineKeys, ...(m.storageKeys ?? [])]);
  const notNode = [...new Set(ends.filter((n) => !graphKeys.has(n)))];
  if (notNode.length) {
    const kinds = new Map();
    for (const n of notNode) {
      const t = (n.split('.').pop() ?? n).replace(/_\d+$/, '');
      kinds.set(t, (kinds.get(t) ?? 0) + 1);
    }
    bad('간선 끝 = 설비∪창고', `점이 아닌 끝 ${notNode.length}개 — ${[...kinds].map(([k, v]) => `${k}×${v}`).join(', ')}`);
  } else ok('간선 끝 = 설비∪창고', `${ends.length}개 전부 설비 ${machineKeys.size} + 창고 ${(m.storageKeys ?? []).length} 안`);

  /* 자기 자신으로 가는 간선은 흐름이 아니다 — 접기가 되돌아왔다는 뜻이다 */
  const loops = (m.edges ?? []).filter((e) => e.from === e.to);
  if (loops.length) {
    const kinds = [...new Set(loops.map((e) => (e.from.split('.').pop() ?? '').replace(/_\d+$/, '')))];
    bad('자기 간선 없음', `from === to 인 간선 ${loops.length}개 — ${kinds.slice(0, 4).join(', ')}`);
  } else ok('자기 간선 없음', `${(m.edges ?? []).length}개 중 0개`);

  /* 같은 쌍이 두 번 나오면 분배기 갈래를 훑다가 같은 길을 두 번 센 것이다 */
  {
    const seen = new Map();
    for (const e of m.edges ?? []) {
      const k = `${e.from} ${e.to}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dup = [...seen].filter(([, v]) => v > 1);
    if (dup.length) {
      const ex = dup
        .slice(0, 3)
        .map(([k, v]) => {
          const [a, z] = k.split(' ');
          return `${nameOf(a)}→${nameOf(z)} ×${v}`;
        })
        .join(', ');
      bad('간선 쌍 중복 없음', `중복 쌍 ${dup.length}종 — ${ex}`);
    } else ok('간선 쌍 중복 없음', `서로 다른 쌍 ${seen.size}개`);
  }

  /* 설비와 창고가 겹치면 같은 것을 두 번 세게 된다 */
  {
    const overlap = (m.storageKeys ?? []).filter((k) => machineKeys.has(k));
    if (overlap.length)
      bad('설비∩창고 = ∅', `양쪽에 든 것 ${overlap.length}개 — ${overlap.slice(0, 3).map(nameOf).join(', ')}`);
    else ok('설비∩창고 = ∅', `설비 ${machineKeys.size} + 창고 ${(m.storageKeys ?? []).length} = 점 ${graphKeys.size}`);
  }

  /* item 은 출발 설비가 만드는 것이라야 한다. 창고에서 나가는 것은 알 수 없으니 null */
  {
    const outOf = new Map((m.machines ?? []).map((x) => [keyOf(x), x.outItem ?? null]));
    const wrong = (m.edges ?? []).filter((e) => {
      if (!('item' in e)) return true;
      return e.item !== (outOf.has(e.from) ? outOf.get(e.from) : null);
    });
    if (!(m.edges ?? []).length) ok('간선 item', '(간선 없음)');
    else if (wrong.length)
      bad('간선 item', `출발 설비의 산출물과 다른 간선 ${wrong.length}개 — 예: ${nameOf(wrong[0].from)} item=${wrong[0].item} vs 산출 ${outOf.get(wrong[0].from)}`);
    else ok('간선 item', `${m.edges.length}개 전부 출발 설비의 산출물과 일치`);
  }
}

/* --------------------------------- 참조 구현과의 대조 (정답값 없는 세이브도) */
console.log('\n  · 참조 구현 대조 (파서로 직접 다시 센 값)');
eq('세션 이름', m.session, ref.session);
eqNear('플레이 시간', m.hours, ref.hours, 0.11, 'h');
eq('회로 수', m.power?.circuits, ref.circuits, (v) => `${v}개`);
eq('그래프의 점', (m.machines ?? []).length + (m.storageKeys ?? []).length, ref.nodeKeys.size,
  (v) => `${v}개 (설비 ${ref.nodeKeys.size - ref.storageKeys.size} + 창고 ${ref.storageKeys.size})`);
eq('창고 수', (m.storageKeys ?? []).length, ref.storageKeys.size, (v) => `${v}개`);
eq('설비→설비 간선', (m.edges ?? []).length, ref.edges, (v) => `${v}개`);
eq('연결 안 된 출력구', m.danglingOutputs, ref.dangling, (v) => `${v}개`);
{
  /* 수만 같고 연결이 다를 수 있다. 쪽을 통째로 맞췄 본다 */
  const mine = new Set((m.edges ?? []).map((e) => `${e.from} ${e.to}`));
  const only = [...mine].filter((k) => !ref.edgeSet.has(k));
  const miss = [...ref.edgeSet].filter((k) => !mine.has(k));
  const show = (k) => {
    const [a, z] = k.split(' ');
    return `${nameOf(a)}→${nameOf(z)}`;
  };
  if (!only.length && !miss.length) ok('간선 집합', `${mine.size}쌍 전부 일치`);
  else
    bad('간선 집합',
      `모듈에만 ${only.length}쌍(${only.slice(0, 2).map(show).join(', ')}), ` +
        `참조에만 ${miss.length}쌍(${miss.slice(0, 2).map(show).join(', ')})`);
}
{
  /* stock 이 창고만인지 설비 버퍼까지인지 구분해서 알려 준다 */
  const same = (map) => {
    for (const k of new Set([...map.keys(), ...Object.keys(m.stock ?? {})]))
      if ((map.get(k) ?? 0) !== (m.stock?.[k] ?? 0)) return false;
    return true;
  };
  if (same(ref.withBuffers)) ok('재고 합', '창고 + 설비 버퍼와 일치');
  else if (same(ref.storageOnly)) ok('재고 합', '창고만과 일치 (설비 버퍼는 안 셈)');
  else {
    const diff = [];
    for (const k of new Set([...ref.withBuffers.keys(), ...Object.keys(m.stock ?? {})])) {
      const a = m.stock?.[k] ?? 0;
      const b = ref.withBuffers.get(k) ?? 0;
      const c = ref.storageOnly.get(k) ?? 0;
      if (a !== b && a !== c) diff.push(`${catalog.items?.[k] ?? k} 실제${a}/창고${c}/창고+버퍼${b}`);
    }
    bad('재고 합', diff.slice(0, 6).join(', ') + (diff.length > 6 ? ` 외 ${diff.length - 6}건` : ''));
  }
}

/* ------------------------------------------------ 정답값 대조 (rese.sav 만) */
if (isGolden) {
  console.log('\n  · 박아 둔 정답값 대조');
  eqNear('파일 크기', Math.round(run.kb), GOLD.fileKB, 2, ' KB');
  eq('세션', m.session, GOLD.session);
  eqNear('플레이 시간', m.hours, GOLD.hours, 0.11, 'h');
  if (m.objects !== undefined) eq('세이브 객체 수', m.objects, GOLD.objects, (v) => `${v}개`);
  eq('완전 액터', ref.fullActors, GOLD.fullActors, (v) => `${v}개`);
  eq('완전 액터 종류', ref.fullKinds, GOLD.fullKinds, (v) => `${v}종`);
  eq('경량 인스턴스', ref.lightweight, GOLD.lightweight, (v) => `${v}개`);
  eq('경량 종류', ref.lightKinds, GOLD.lightKinds, (v) => `${v}종`);

  /* 생산 설비 32대 전부 레시피가 붙어 있고, 그 레시피가 카탈로그에 있는가 */
  const withRecipe = (m.machines ?? []).filter((x) => x.recipe);
  eq('레시피 붙은 설비', withRecipe.length, GOLD.machinesWithRecipe, (v) => `${v}대`);
  const unknown = withRecipe.filter((x) => !x.recipeKo || !catalog.recipes[x.recipe]);
  if (unknown.length) bad('레시피 이름 해석', `못 찾은 것 ${unknown.length}건 — ${unknown.slice(0, 3).map((x) => x.recipe).join(', ')}`);
  else ok('레시피 이름 해석', `${withRecipe.length}/${withRecipe.length} 매칭`);

  eq('그래프의 점(정답값)', (m.machines ?? []).length + (m.storageKeys ?? []).length, GOLD.graphNodes, (v) => `${v}개`);
  eq('창고 수(정답값)', (m.storageKeys ?? []).length, GOLD.storageNodes, (v) => `${v}개`);
  eq('설비→설비 간선(정답값)', (m.edges ?? []).length, GOLD.edges, (v) => `${v}개`);
  eq('연결 안 된 출력구(정답값)', m.danglingOutputs, GOLD.danglingOutputs, (v) => `${v}개`);

  eqNear('발전', m.power?.genMW, GOLD.genMW, 0.05, ' MW');
  eqNear('소비', m.power?.useMW, GOLD.useMW, 0.05, ' MW');
  eq('회로 수', m.power?.circuits, GOLD.circuits, (v) => `${v}개`);

  eq('저장 컨테이너', m.counts?.Build_StorageContainerMk1_C, GOLD.storageContainers, (v) => `${v}개`);
  for (const [item, want] of Object.entries(GOLD.storageOnly)) {
    const got = m.stock?.[item];
    const label = `재고 ${catalog.items?.[item] ?? item}`;
    if (got === want) ok(label, `${got}개 (창고만)`);
    else if (typeof got === 'number' && got > want) ok(label, `${got}개 — 창고 ${want} + 설비 버퍼 ${got - want}`);
    else bad(label, `기대 ${want} 이상 · 실제 ${got}`);
  }

  /* 채굴기 4대와 그 노드 */
  const miners = (m.machines ?? []).filter((x) => x.node);
  eq('노드에 붙은 채굴기', miners.length, GOLD.miners.length, (v) => `${v}대`);
  for (const want of GOLD.miners) {
    const hit = miners.find((x) => x.node?.id === want.node);
    if (!hit) bad(`노드 ${want.node}`, `채굴기를 못 찾음 (실제 노드: ${miners.map((x) => x.node?.id).join(', ') || '없음'})`);
    else if (hit.node.resourceKo !== want.resourceKo || hit.node.purity !== want.purity)
      bad(`노드 ${want.node}`, `기대 ${want.resourceKo}/${want.purity} · 실제 ${hit.node.resourceKo}/${hit.node.purity}`);
    else ok(`노드 ${want.node}`, `${want.resourceKo} · ${want.purity}`);
  }

  /* 가동률 */
  for (const u of GOLD.uptimes) {
    const hit = (m.machines ?? []).filter(u.match);
    if (hit.length) ok(`가동률 ${u.what}`, `${u.pct} (${hit.length}대 일치)`);
    else {
      const seen = (m.machines ?? [])
        .filter((x) => x.uptime != null)
        .map((x) => `${x.ko}/${x.recipeKo ?? '-'}=${(x.uptime * 100).toFixed(1)}%`);
      bad(`가동률 ${u.what}`, `${u.pct} 인 설비가 없음. 실제: ${seen.slice(0, 8).join(', ')}${seen.length > 8 ? ` 외 ${seen.length - 8}대` : ''}`);
    }
  }
}

/* ------------------------------------- diagnose.ts 가 있으면 만져만 본다 */
if (hasDiagnose) {
  console.log('\n  · diagnose');
  const dg = mod.diagnose ?? {};
  const fn = typeof dg.diagnose === 'function' ? dg.diagnose : Object.values(dg).find((v) => typeof v === 'function');
  if (!fn) bad('diagnose 내보내기', `함수가 없음. 내보낸 것: ${Object.keys(dg).join(', ') || '(없음)'}`);
  else {
    try {
      const out = await fn(m, catalog);
      const n = Array.isArray(out) ? out.length : Object.keys(out ?? {}).length;
      ok('diagnose 호출', `${Array.isArray(out) ? '배열' : typeof out} · ${n}건`);
    } catch (e) {
      bad('diagnose 호출', `던짐 — ${String(e?.message ?? e).split('\n')[0]}`);
    }
  }
}

/* ------------------------------------------- 2. 세이브 4개 전부 돌아가는가 */
console.log('\n■ 나머지 세이브 — 크래시·불변식만');
const others = OTHER_SAVES.map((f) => path.join(SAVE_DIR, f)).filter(
  (f) => fs.existsSync(f) && path.resolve(f) !== target
);
if (!others.length) console.log('  (같은 폴더에 다른 세이브가 없습니다)');
for (const f of others) {
  try {
    const r = await runOne(f);
    const mm = r.model;
    const rr = reference(r.raw);
    const total = Object.values(mm.counts ?? {}).reduce((a, b) => a + b, 0);
    const outside = (mm.machines ?? []).filter((x) => !(x.fx >= 0 && x.fx <= 1 && x.fy >= 0 && x.fy <= 1)).length;
    const ends = (mm.edges ?? []).flatMap((e) => [e.from, e.to]);
    const fake = ends.filter((n) => !rr.instanceNames.has(n)).length;
    const problems = [];
    if (total !== rr.countsTotal) problems.push(`counts 합 ${total} ≠ 참조 ${rr.countsTotal}`);
    if (outside) problems.push(`좌표 벗어남 ${outside}대`);
    if (fake) problems.push(`세이브에 없는 간선 끝 ${fake}개`);
    /* 주 세이브와 같은 불변식을 그대로 걸어 본다 */
    const mKeys = new Set((mm.machines ?? []).map(keyOf));
    const gKeys = new Set([...mKeys, ...(mm.storageKeys ?? [])]);
    const notNode = ends.filter((n) => !gKeys.has(n)).length;
    if (notNode) problems.push(`점이 아닌 간선 끝 ${notNode}개`);
    const loops = (mm.edges ?? []).filter((e) => e.from === e.to).length;
    if (loops) problems.push(`자기 간선 ${loops}개`);
    const pairs = new Set((mm.edges ?? []).map((e) => `${e.from} ${e.to}`));
    if (pairs.size !== (mm.edges ?? []).length)
      problems.push(`간선 중복 ${(mm.edges ?? []).length - pairs.size}개`);
    const overlap = (mm.storageKeys ?? []).filter((k) => mKeys.has(k)).length;
    if (overlap) problems.push(`설비∩창고 ${overlap}개`);
    if (mKeys.size + (mm.storageKeys ?? []).length !== rr.nodeKeys.size)
      problems.push(`점 ${mKeys.size + (mm.storageKeys ?? []).length} ≠ 참조 ${rr.nodeKeys.size}`);
    /* 간선은 수가 아니라 집합으로 맞췄 본다 */
    const onlyMine = [...pairs].filter((k) => !rr.edgeSet.has(k)).length;
    const onlyRef = [...rr.edgeSet].filter((k) => !pairs.has(k)).length;
    if (onlyMine || onlyRef)
      problems.push(`간선 집합 어긋남 (모듈에만 ${onlyMine}, 참조에만 ${onlyRef})`);
    if (mm.danglingOutputs !== rr.dangling)
      problems.push(`끊긴 출력구 ${mm.danglingOutputs} ≠ 참조 ${rr.dangling}`);
    const line = `${r.kb.toFixed(0)} KB · ${r.ms.toFixed(0)} ms · 건물 ${total} · 설비 ${mKeys.size}+창고 ${(mm.storageKeys ?? []).length} · 간선 ${mm.edges?.length ?? 0} · 끊긴 ${mm.danglingOutputs} · 발전 ${mm.power?.genMW}/소비 ${mm.power?.useMW} MW`;
    if (problems.length) bad(path.basename(f), `${line}\n         ↳ ${problems.join(', ')}`);
    else ok(path.basename(f), line);
  } catch (e) {
    bad(path.basename(f), `던짐 — ${String(e?.message ?? e).split('\n')[0]}`);
  }
}

/* ------------------------------------------------------------------- 요약 */
const failed = results.filter((r) => !r.pass);
console.log(`\n■ 요약: ${results.length - failed.length}통과 / ${failed.length}실패`);
if (failed.length) {
  console.log('\n어긋난 것:');
  for (const f of failed) console.log(`  · ${f.name} — ${f.detail}`);
}
console.log(failed.length ? '\n[실패]' : '\n[통과]');
process.exit(failed.length ? 1 : 0);
