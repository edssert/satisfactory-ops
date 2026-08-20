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
    for (const m of s.matchAll(/\/assets\/(items|buildings-png|schematics|badges)\/([A-Za-z0-9_.]+\.png)/g)) {
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

// ────────────────────── 1-c. 허브·마일스톤이 게임과 같은 아이콘을 쓰는가
{
  /*
   * 예전에는 타일에 「해금 목록의 첫 건물」 그림을 걸었다. 게임은 그러지 않는다 —
   * 스키매틱마다 전용 아이콘이 따로 있고(허브 업그레이드는 집+체크), 사용자가 게임 화면과
   * 대조할 때 그림이 다르면 같은 항목인지 알 수가 없다. 그래서 전용 아이콘 확보를 규칙으로 박는다.
   */
  const tech = read(path.join(APP, 'tech.json'));
  const need = [...tech.hub, ...tech.milestones];
  const noRef = need.filter((e) => e.iconRef?.dir !== 'schematics');
  const noFile = need.filter(
    (e) =>
      e.iconRef?.dir === 'schematics' &&
      !fs.existsSync(path.join(ROOT, 'public/assets/schematics', `${e.iconRef.id}.png`))
  );
  if (noRef.length || noFile.length) {
    fail(
      `허브·마일스톤 전용 아이콘이 없습니다 — 참조 없음 ${noRef.length} · 파일 없음 ${noFile.length} ` +
        `(전체 ${need.length})
` +
        `      ${[...noRef, ...noFile].slice(0, 8).map((e) => e.ko).join(', ')}
` +
        `      → node scripts/fetch-schematic-icons.mjs`
    );
  } else {
    pass(`허브·마일스톤 ${need.length}개가 게임과 같은 스키매틱 아이콘을 씀`);
  }

  /* 보상 종류 배지 — 게임이 보상 그림 오른쪽 위에 얹는 표식 */
  const badges = ['building', 'item', 'equipment', 'vehicle', 'scanner', 'upgrade'];
  const missingBadges = badges.filter(
    (b) => !fs.existsSync(path.join(ROOT, 'public/assets/badges', `${b}.png`))
  );
  if (missingBadges.length) {
    fail(
      `보상 종류 배지가 없습니다: ${missingBadges.join(', ')}
` +
        `      → node scripts/fetch-schematic-icons.mjs`
    );
  } else {
    pass(`보상 종류 배지 ${badges.length}개 확보`);
  }
}

// ────────────────────── 1-d. 보상 칸이 항목을 말없이 버리지 않는가
{
  /*
   * 「그림이 있는 것만」 그리던 시절, 허브 업그레이드 1 의 보상 셋 중 둘이 화면에서 사라졌다.
   * 게임은 셋 다 보여 준다. 그림이 없어도 이름은 나와야 한다 — 그것을 여기서 강제한다.
   */
  /* 앞에 구분자를 붙인다 — 옛 주소 `/codex/tiers/0/`(리다이렉트 껍데기)까지 걸린다 */
  const hit = allHtml.find((h) =>
    h.p.endsWith(`${path.sep}dex${path.sep}tiers${path.sep}0${path.sep}index.html`)
  );
  if (!hit) {
    fail('티어 0 페이지가 빌드되지 않았습니다');
  } else {
    const need = ['장비 작업장', '휴대용 채굴기', '장비 슬롯 +1'];
    const miss = need.filter((n) => !hit.s.includes(n));
    if (miss.length) {
      fail(
        `허브 업그레이드 1 의 보상 ${miss.join(', ')} 가 화면에 없습니다 — ` +
          `그림 없는 보상을 버리고 있습니다`
      );
    } else {
      pass('허브 업그레이드 1 의 보상 세 가지가 전부 화면에 있음');
    }
  }
}

// ─────────────────────────────────────────────── 2. 표가 행을 말없이 버리지 않았는가
/* 도구 표는 도감 안으로 옮겼다 (/dex/reference/) */
const toolsPage = allHtml.find(({ p }) =>
  p.includes(`${path.sep}dex${path.sep}reference${path.sep}index.html`)
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

// ─────────────────────────────────────── 2-b. 표가 헤더만 남고 텅 비지 않았는가
{
  /*
   * 「순도별 산출량」 표가 헤더 여섯 칸만 뜨고 데이터 0행으로 배포됐다.
   * 원인은 필터가 `RF_SOLID` 를 찾는데 데이터에는 `solid` 가 들어 있던 것.
   * 위의 "언급했는가" 검사로는 안 잡힌다 — 그 건물이 다른 표에 나오면 통과하기 때문이다.
   * 그래서 **표마다 tbody 의 행 수를 직접 센다.** 한 표라도 0행이면 세운다.
   */
  const empty = [];
  for (const { p, s: raw } of allHtml) {
    /* <template> 안의 표는 스크립트가 나중에 채운다. 비어 있는 게 정상이다 */
    const s = raw.replace(/<template[\s\S]*?<\/template>/g, ' ');
    for (const m of s.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)) {
      const rows = (m[1].match(/<tr[\s>]/g) ?? []).length;
      if (rows === 0) {
        /* 어느 표인지 알 수 있게 바로 앞의 제목을 찾아 붙인다 */
        const before = s.slice(0, m.index);
        const h = [...before.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].pop();
        const title = h ? h[1].replace(/<[^>]*>/g, '').trim() : '제목 미상';
        empty.push(`${path.relative(DIST, p)} — 「${title}」`);
      }
    }
  }
  if (empty.length) {
    fail(
      `데이터가 한 행도 없는 표가 ${empty.length}개 있습니다 — 필터가 전부 떨어뜨렸습니다:\n` +
        empty.slice(0, 8).map((x) => `      ${x}`).join('\n')
    );
  } else {
    pass('빈 표 없음 — 모든 tbody 에 행이 있음');
  }
}

// ─────────────────────────────────────── 2-c. 내부 클래스명이 화면으로 새지 않았는가
{
  /*
   * 로케일 조회가 실패하면 `Desc_BoomBox_C` 같은 식별자가 이름 자리에 그대로 남는다.
   * 싱크 상점 카드 11장이 실제로 그렇게 배포됐다. 앞으로도 계속 샐 자리라 검사로 막는다.
   *
   * 출처 각주(<details class="src">)는 뺀다 — 거기서는 "게임 데이터의 이 클래스가 근거다"라고
   * 클래스명을 **일부러** 밝힌다. 이름 자리에 쓰는 것과 다른 일이다.
   */
  const ID = /(?:^|[^A-Za-z0-9_/])((?:Desc|BP|Build|Recipe|Research|Schematic|ResourceSink)_[A-Za-z0-9_]*_C)(?![A-Za-z0-9_])/g;
  const leaked = new Map();
  for (const { p, s } of allHtml) {
    const text = s
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<details class="src"[\s\S]*?<\/details>/g, ' ')
      .replace(/<[^>]*>/g, ' ');
    for (const m of text.matchAll(ID)) {
      if (!leaked.has(m[1])) leaked.set(m[1], path.relative(DIST, p));
    }
  }
  if (leaked.size) {
    fail(
      `내부 클래스명 ${leaked.size}개가 화면 글자로 나갑니다 — 이름 자리를 비우거나 ` +
        `src/data/curated/dex-names.json 에 이름을 넣으세요:\n` +
        [...leaked].slice(0, 12).map(([k, where]) => `      ${k}  (${where})`).join('\n')
    );
  } else {
    pass('내부 클래스명이 화면 글자로 새지 않음');
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
      ['vp-stage', '도면판 자체'],
      ['제련기', '건물 목록'],
      ['채굴기 Mk.1', '채굴기'],
      ['바이오매스 연소기', '자동 급유 발전기'],
      ['컨베이어 분배기', '물류 설비'],
      ['왼쪽에서 검증 설비를 놓으세요.', '빈 판 안내'],
      ['도면 맞춤', '도면 맞춤 단추'],
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
    if (hit.s.includes('자동 배치')) fail('수동 설계판에 폐기한 자동 배치 문구가 남아 있습니다');
    if (!miss) pass('설계판이 건물·채굴기·발전기와 함께 그려짐');
  }

  /* 한글이 글자 단위로 쪼개지는 것을 한 번 겪었다. 규칙으로 박는다 */
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/validated-planner.css'), 'utf8');
  const keepAll = ['.vp-machine strong', '.vp-empty p'];
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
    /* 숫자 애니메이션을 안 쓰는 화면 구성도 있다. 없는 것은 문제가 아니고, 0 으로 남는 것이 문제다 */
    pass('애니메이션으로 값을 만드는 숫자가 없음');
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

// ─────────────────────────── 마크업이 붙인 클래스에 스타일이 실제로 있는가
{
  /*
   * 레시피 카드 104장에 「딴 것으로 표시」라는 글자가 제목 위에 겹쳐 찍혀 배포됐다.
   * 원인은 마크업이 `class="sr-only"` 를 썼는데 CSS 에 있는 이름은 `visually-hidden`
   * 하나뿐이었던 것 — 이름이 어긋나면 **숨김이 통째로 안 걸린다.**
   * 빌드는 통과하고 타입 검사도 통과한다. 화면을 봐야만 보이는 종류의 실패다.
   *
   * 그래서 렌더된 HTML 이 붙인 클래스를 전부 모아, 어느 CSS 에서도 정의를 못 찾은 것을 센다.
   * 「정의」는 넓게 잡는다(선택자든 뭐든 `.이름` 이 CSS 어딘가에 있으면 통과) — 좁게 잡아
   * 헛경보를 내는 쪽이 훨씬 나쁘다.
   */
  const cssFiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) cssFiles.push(p);
    }
  })(DIST);

  let cssText = cssFiles.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  /* 인라인된 <style> 도 CSS 다 — 아스트로는 작은 스타일시트를 HTML 안에 넣는다 */
  for (const { s } of allHtml) {
    for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) cssText += '\n' + m[1];
  }
  const defined = new Set();
  for (const m of cssText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);

  const used = new Map();
  for (const { p, s } of allHtml) {
    /* 아일랜드 props 안에 직렬화된 것은 따옴표가 escape 돼 있어 이 패턴에 안 걸린다 */
    for (const m of s.matchAll(/ class="([^"]*)"/g)) {
      for (const c of m[1].trim().split(/\s+/)) {
        if (!c || c.includes('{') || c.includes('$')) continue;
        if (!used.has(c)) used.set(c, { n: 0, where: path.relative(DIST, p) });
        used.get(c).n++;
      }
    }
  }

  /*
   * 스타일이 없어도 되는 자리. 마크업 구조를 잡거나 스크립트가 잡는 손잡이들이다.
   * **여기에 이름을 더할 때는 「이 클래스는 왜 스타일이 없어도 되는가」를 답할 수 있어야 한다.**
   * 답이 안 나오면 그건 이 검사가 잡아낸 진짜 버그다.
   */
  const NO_STYLE_OK = new Set([
    'brand-name',   // 머리띠 브랜드 글자 — 상위 .brand 가 전부 정한다
    'plan-stage', 'fc-store', 'cr-side', 'fb-chain', 'cmp-in', 'score',
    'is-main', 'is-mixed', 'is-conflict', 'is-b', 'is-c',
    'is-both-high', 'is-both-low', 'is-game', 'is-community',
    'is-n', 'is-p', 'is-i',
  ]);

  /* 화면에서 감추는 이름은 예외를 두지 않는다 — 정의가 없으면 글자가 그대로 겹쳐 찍힌다 */
  const MUST_EXIST = ['sr-only', 'visually-hidden'];
  const hidingGone = MUST_EXIST.filter((c) => !defined.has(c));
  if (hidingGone.length) {
    fail(
      `화면에서 감추는 클래스 ${hidingGone.join(', ')} 의 정의가 CSS 에 없습니다 — ` +
        `숨겨야 할 글자가 그대로 겹쳐 찍힙니다. src/styles/base.css 에서 두 이름을 함께 정의하세요`
    );
  }

  const dead = [...used]
    .filter(([c]) => !defined.has(c) && !NO_STYLE_OK.has(c))
    .sort((a, b) => b[1].n - a[1].n);
  if (dead.length) {
    fail(
      `마크업이 붙였는데 어느 CSS 에도 정의가 없는 클래스 ${dead.length}개 — ` +
        `이름이 어긋났거나 규칙이 지워졌습니다:\n` +
        dead.slice(0, 12).map(([c, v]) => `      ${c}  ${v.n}곳  (${v.where})`).join('\n') +
        `\n      → 스타일을 넣거나, 정말 스타일이 필요 없으면 check-coverage.mjs 의 NO_STYLE_OK 에 근거와 함께 적으세요`
    );
  } else if (!hidingGone.length) {
    pass(`마크업 클래스 ${used.size}종이 전부 CSS 에 정의됨 (예외 ${NO_STYLE_OK.size}종)`);
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
