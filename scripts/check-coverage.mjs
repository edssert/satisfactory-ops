/**
 * check-coverage.mjs — **빌드 산출물**이 데이터를 빠짐없이 담았는지 검사한다.
 *
 * 왜 필요한가: `db.mjs` 는 데이터끼리의 관계만 본다. 오늘까지 나온 실패는 전부 그 바깥이었다.
 *   - 아이콘 파일이 없는데 그림에 <image> 를 걸어 빈칸으로 배포됐다 (나무·바이오매스)
 *   - 표가 `category === 'manufacturer'` 로 걸러 채굴기·싱크·펌프를 조용히 버렸다
 *   - 발전기 표가 `powerGenMW > 0` 으로 걸러 지열 발전기를 버렸다
 *
 * 셋 다 "필터가 행을 말없이 떨어뜨린다"는 같은 병이다. 사람이 화면을 보고 발견할 게 아니라
 * 빌드가 막아야 한다. 그래서 이 검사는 **렌더된 HTML 을 읽고 데이터와 대조한다.**
 *
 * 실행: node scripts/check-coverage.mjs   (npm run verify 에 포함)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const APP = path.join(ROOT, 'src/data/app');

if (!fs.existsSync(DIST)) {
  console.error('[실패] dist 가 없습니다. `npm run build` 를 먼저 실행하세요.');
  process.exit(2);
}

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const items = read(path.join(APP, 'items.json'));
const buildings = read(path.join(APP, 'buildings.json'));

/** dist 안의 모든 html */
function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = htmlFiles(DIST);
const allHtml = pages.map((p) => ({ p, s: fs.readFileSync(p, 'utf8') }));

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const pass = (msg) => notes.push(`  PASS  ${msg}`);

// ─────────────────────────────────────────────── 1. 참조한 자산이 실제로 있는가
{
  const missing = new Map();
  for (const { p, s } of allHtml) {
    for (const m of s.matchAll(/\/assets\/(items|buildings-png)\/([A-Za-z0-9_]+\.png)/g)) {
      const rel = path.join('public/assets', m[1], m[2]);
      if (!fs.existsSync(path.join(ROOT, rel))) {
        const key = `${m[1]}/${m[2]}`;
        if (!missing.has(key)) missing.set(key, path.relative(DIST, p));
      }
    }
  }
  if (missing.size) {
    fail(
      `그림이 참조하는 자산 ${missing.size}개가 없습니다 — 화면에 빈칸으로 나갑니다:\n` +
        [...missing].slice(0, 12).map(([k, where]) => `      ${k}  (${where})`).join('\n') +
        `\n      → node scripts/fetch-icons.mjs`
    );
  } else {
    pass('렌더된 모든 아이콘 파일이 존재');
  }
}

// ─────────────────────────────────────────────── 1-b. 쓸 만한 자산이 미리 다 모여 있는가
{
  /*
   * "지금 화면이 참조하는 것"만 있으면 되는 게 아니다. 도면에 새 기계를 넣는 순간
   * 또 빈칸이 나온다. 실제 아이템(건축 부재 제외)과 실제 설비(구조물·장식 제외)는
   * 미리 전부 받아 둔다.
   */
  /*
   * **전량**이 기준이다. 분류로 골라 받다가 상점 화면을 만들 때 구조물·장식 125개가
   * 통째로 비어 있는 것을 뒤늦게 알았다. 나중에 화면을 만들면서 다시 받는 일이 없게,
   * 받을 수 있는 것은 미리 다 받아 둔다.
   */
  const wantItems0 = items.filter((i) => i.kind !== 'building-descriptor');
  /*
   * 위키에 개별 아이콘 문서가 없어 받을 수 없는 것들(벽·경사로 변형 등).
   * 목록을 데이터로 고정해 둔다 — 그래야 다음에 또 "왜 안 받아지지" 하며 헤매지 않는다.
   */
  const gaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/asset-gaps.json'), 'utf8'));
  const UNAVAILABLE = new Set(gaps.buildings ?? []);
  const UNAVAILABLE_ITEMS = new Set(gaps.items ?? []);
  const wantBuildings = buildings.filter((b) => !UNAVAILABLE.has(b.id));

  const gone = (dir, list) =>
    list.filter((x) => !fs.existsSync(path.join(ROOT, 'public/assets', dir, `${x.id}.png`)));

  const wantItems = wantItems0.filter((i) => !UNAVAILABLE_ITEMS.has(i.id));
  const mi = gone('items', wantItems);
  const mb = gone('buildings-png', wantBuildings);
  if (mi.length || mb.length) {
    fail(
      `미리 받아 둬야 할 자산이 없습니다 — 아이템 ${mi.length}/${wantItems.length} · ` +
        `설비 ${mb.length}/${wantBuildings.length}
` +
        `      ${[...mi, ...mb].slice(0, 8).map((x) => x.ko).join(', ')}
` +
        `      → node scripts/fetch-icons.mjs`
    );
  } else {
    pass(`자산 미리 확보 — 아이템 ${wantItems.length}개 · 설비 ${wantBuildings.length}개`);
  }
}

// ─────────────────────────────────────────────── 2. 표가 행을 말없이 버리지 않았는가
/* 도구 표는 도감 안으로 옮겼다 (/dex/reference/) */
const toolsPage = allHtml.find(({ p }) =>
  p.includes(`dex${path.sep}reference${path.sep}index.html`)
);
if (!toolsPage) {
  fail('레퍼런스 페이지(dist/dex/reference/index.html)를 찾지 못했습니다');
} else {
  const s = toolsPage.s;
  /** 그 페이지가 실제로 언급한 건물 id 집합 — 이름(ko)이 본문에 있는지로 본다 */
  const mentions = (ko) => ko && s.includes(`>${ko} `) || (ko && s.includes(`>${ko}<`));

  const expectations = [
    {
      what: '전력을 소비하는 건물',
      /** 구버전 세이브 호환용으로만 남은 것은 제외 */
      list: buildings.filter(
        (b) =>
          !['Build_JumpPad_C', 'Build_JumpPadTilted_C'].includes(b.id) &&
          ((b.powerMW ?? 0) > 0 || b.powerIsVariable)
      ),
    },
    { what: '발전기', list: buildings.filter((b) => b.category === 'generator') },
    { what: '채굴·추출 설비', list: buildings.filter((b) => b.extraction) },
  ];

  for (const e of expectations) {
    const absent = e.list.filter((b) => !mentions(b.ko));
    if (absent.length) {
      fail(
        `${e.what} ${absent.length}/${e.list.length}개가 레퍼런스 표에 없습니다 — ` +
          `필터가 행을 버렸을 수 있습니다:\n` +
          `      ${absent.slice(0, 8).map((b) => b.ko).join(', ')}`
      );
    } else {
      pass(`${e.what} ${e.list.length}개 전부 표에 있음`);
    }
  }
}

// ─────────────────────────────────────────────── 3. 큐레이션 산문의 수치가 데이터와 맞는가
{
  const curatedDir = path.join(ROOT, 'src/data/curated');
  const glossary = path.join(ROOT, 'src/data/glossary.json');
  const texts = [];
  if (fs.existsSync(curatedDir)) {
    for (const f of fs.readdirSync(curatedDir)) {
      if (f.endsWith('.json')) texts.push([f, fs.readFileSync(path.join(curatedDir, f), 'utf8')]);
    }
  }
  if (fs.existsSync(glossary)) texts.push(['glossary.json', fs.readFileSync(glossary, 'utf8')]);

  /*
   * 되풀이된 오류를 그대로 규칙으로 박는다. 새 오류가 나오면 여기 한 줄씩 늘린다.
   * 정교한 자연어 검증이 아니라, **한 번 틀린 것을 두 번 틀리지 않게 하는** 장치다.
   */
  const banned = [
    { re: /디자이너 Mk\.?1[^.]{0,20}40\s*m/, why: '청사진 설계소 Mk.1 은 32m(4×4) 다. 40m 는 Mk.2 다' },
    { re: /파운데이션 10칸|토대 10칸/, why: '40m 는 8m 짜리 토대 5칸이다. 10칸은 80m 다' },
    { re: /파워 슈드|파워 쉬드/, why: '게임 로케일 표기는 「동력 조각」이다 (ADR-0017)' },
    { re: /생물자원/, why: '게임 로케일 표기는 「바이오매스」다 (ADR-0017)' },
    { re: /허브는 옮길 수 없/, why: '허브는 철거·재설치로 옮길 수 있고 마일스톤 진행도 유지된다' },
  ];
  let hit = 0;
  for (const [f, t] of texts) {
    for (const b of banned) {
      if (b.re.test(t)) {
        fail(`${f}: ${b.why}`);
        hit++;
      }
    }
  }
  if (!hit) pass(`큐레이션 텍스트 ${texts.length}개에 알려진 오류 표현 없음`);
}

// ─────────────────────────────────────────────── 설계판이 실제로 그려졌는가
{
  /*
   * 아일랜드가 던지면 브라우저에서만 하얗게 죽는다. 빌드는 통과하고 배포도 된다.
   * Astro 는 client:load 아일랜드도 빌드 때 한 번 그려서 HTML 에 넣으므로,
   * 여기서 그 결과를 읽으면 "안 뜨는 화면"을 배포 전에 잡을 수 있다.
   */
  const hit = allHtml.find((h) => h.p.includes(`${path.sep}planner${path.sep}`));
  if (!hit) {
    fail('설계 페이지가 빌드되지 않았습니다');
  } else {
    const need = [
      ['pl-svg', '도면판 자체'],
      ['제련기', '건물 목록'],
      ['채굴기 Mk.1', '채굴기'],
      ['석탄 발전기', '발전기'],
      ['컨베이어 분배기', '물류 설비'],
      ['왼쪽에서 건물을 누르면', '빈 판 안내'],
      ['자동 배치', '자동 배치 단추'],
    ];
    let miss = 0;
    for (const [needle, what] of need) {
      if (!hit.s.includes(needle)) {
        fail(`설계 페이지에 ${what}(${needle})가 없습니다 — 아일랜드가 그려지지 않았을 수 있습니다`);
        miss++;
      }
    }
    /* base 를 안 붙인 절대 경로는 GitHub Pages 하위 경로에서 전부 404 가 된다 */
    if (/src="\/assets\//.test(hit.s)) fail('설계 페이지에 base 없는 자산 경로가 있습니다');
    if (!miss) pass('설계판이 건물·채굴기·발전기와 함께 그려짐');
  }

  /* 한글이 글자 단위로 쪼개지는 것을 한 번 겪었다. 규칙으로 박는다 */
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/planner.css'), 'utf8');
  const keepAll = ['.pl-mname', '.pl-rname', '.pl-sum p', '.pl-empty'];
  const bad = keepAll.filter((sel) => {
    const i = css.indexOf(sel);
    return i < 0 || !css.slice(i, css.indexOf('}', i)).includes('word-break: keep-all');
  });
  if (bad.length) fail(`설계판 CSS 에 word-break: keep-all 이 없습니다: ${bad.join(', ')}`);
  else pass('설계판의 한글 줄바꿈 규칙 유지');
}

// ─────────────────────────────────────────────── 마크다운이 화면으로 새지 않았는가
{
  /*
   * 큐레이션 글에 **강조** 를 써 놓고 그대로 뿌려서 별표가 화면에 보인 적이 있다.
   * 이 앱은 마크다운을 렌더하지 않는다. 강조가 필요하면 마크업으로 해야 한다.
   */
  const leaked = [];
  for (const h of allHtml) {
    const text = h.s.replace(/<script[\s\S]*?<\/script>/g, '');
    if (/\*\*/.test(text)) leaked.push(path.relative(DIST, h.p));
  }
  if (leaked.length) {
    fail(`화면에 마크다운 별표가 그대로 나옵니다: ${leaked.join(', ')} — 큐레이션 글에서 ** 를 빼세요`);
  } else {
    pass('마크다운 별표가 화면으로 새지 않음');
  }
}

// ─────────────────────────────────────────────── 넘겨보내는 주소가 실제로 있는가
{
  /*
   * 옛 주소와 목록 첫 화면은 meta refresh 로 넘겨보낸다. 보내는 곳이 없으면 404 가 되는데
   * 빌드도 통과하고 링크도 눌리므로 눈으로만 보면 안 잡힌다.
   * MAM 첫 화면이 실제로 그렇게 깨져 있었다 — 목록 맨 위가 화면 없는 항목이었다.
   */
  let bad = 0;
  let seen = 0;
  for (const h of allHtml) {
    const m = /<meta http-equiv="refresh" content="0; url=([^"]+)"/.exec(h.s);
    if (!m) continue;
    seen++;
    const to = m[1].replace(/^\/satisfactory-ops/, '');
    const file = path.join(DIST, to.replace(/\/$/, ''), 'index.html');
    if (!fs.existsSync(file)) {
      fail(`${path.relative(DIST, h.p)} 가 없는 주소로 보냅니다: ${m[1]}`);
      bad++;
    }
  }
  if (!bad) pass(`넘겨보내는 주소 ${seen}개가 전부 존재`);
}

// ─────────────────────────────────────── 숫자가 화면에 0 으로 남지 않는가
/*
 * 랜딩의 집계 숫자를 CSS 카운터로 올리다가 화면에 0 이 그대로 남은 적이 있다.
 * 값은 HTML 에 박혀 있어야 하고, 스크립트가 없어도 맞는 수가 보여야 한다.
 */
{
  const rows = [...allHtml.flatMap((h) => [...h.s.matchAll(/data-tick="(\d+)"[^>]*>([^<]*)</g)])];
  if (!rows.length) {
    fail('랜딩 집계 숫자를 찾지 못했습니다');
  } else {
    const bad = rows.filter((m) => m[1] !== m[2].trim() || m[1] === '0');
    if (bad.length) fail(`집계 숫자가 값과 다릅니다: ${bad.map((m) => m[1] + '→' + m[2]).join(', ')}`);
    else pass(`집계 숫자 ${rows.length}개가 HTML 에 그대로 있음`);
  }
}

// ─────────────────────────────────────────────── 지도가 수집품까지 담았는가
{
  const hit = allHtml.find((h) => h.p.includes(`map${path.sep}index.html`));
  if (!hit) {
    fail('지도 페이지가 빌드되지 않았습니다');
  } else {
    const need = ['rm-svg', '파란색 파워 슬러그', '소머슬룹', '머서 구체', '하드 드라이브'];
    const miss = need.filter((n) => !hit.s.includes(n));
    if (miss.length) fail(`지도에 ${miss.join(', ')} 가 없습니다`);
    else pass('지도가 자원 노드와 수집품 네 종류를 담음');
  }
}

// ─────────────────────────────────────────────── 결과
console.log('산출물 커버리지 검사:');
console.log(notes.join('\n'));
if (failures.length) {
  console.error('\n[실패]\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(3);
}
console.log('\n검증 통과.');
