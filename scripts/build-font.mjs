/**
 * build-font.mjs — 이 사이트가 실제로 쓰는 글자만 담은 서브셋을 만든다.
 *
 * 서체를 역할별로 셋으로 나눈다. 하나로 통일하면 위계가 안 생긴다.
 *
 *   표시(제목)  Wanted Sans   기하학적이고 획이 단단하다. 한글 UI 용으로 만들어진 서체다. OFL 1.1
 *   본문        Pretendard    KRDS 가 국문·영문 공통 기본으로 지정한 서체. 긴 글 가독성이 가장 낫다. OFL 1.1
 *   수치        JetBrains Mono 숫자 구분이 뚜렷하고 0 에 사선이 있다. 표에서 자릿수를 세기 좋다. OFL 1.1
 *
 * 셋 다 SIL Open Font License 1.1 이다. 상업적 사용·수정·재배포가 되고, 폰트 자체를
 * 따로 파는 것만 안 된다. 웹 임베딩에 제약이 없다.
 *
 * 왜 서브셋하는가: 한글 완성형은 11,172자라 원본이 무겁다(가변 2MB 안팎). 이 사이트는
 * 정적이고 텍스트가 빌드 시점에 확정되므로, 쓰는 글자만 뽑아 파일 하나로 만드는 편이 낫다.
 * 요청 1회, 오프라인 캐시도 단순해진다.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const OUT_DIR = join(SRC, 'fonts');

/** 어떤 원본을 어떤 이름으로 자를 것인가 */
const FACES = [
  {
    name: 'Wanted Sans',
    src: 'node_modules/wanted-sans/fonts/webfonts/variable/complete/woff2/WantedSansVariable.woff2',
    out: 'wanted-sans-subset.woff2',
    role: '표시',
  },
  {
    name: 'Pretendard',
    src: 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
    out: 'pretendard-subset.woff2',
    role: '본문',
  },
  {
    name: 'JetBrains Mono',
    src: 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
    out: 'jetbrains-mono-subset.woff2',
    role: '수치',
    /** 라틴 전용이라 한글은 자르지 않는다 */
    latinOnly: true,
  },
];

const TEXT_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.html']);
const SKIP_DIR = new Set(['fonts', 'node_modules', '.git']);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (TEXT_EXT.has(extname(e.name))) {
      yield join(dir, e.name);
    }
  }
}

/**
 * 소스에 없더라도 런타임에 나올 수 있는 것들. 빠지면 그 글자만 폴백 서체로 튀어
 * 한 문장 안에서 서체가 갈린다.
 */
const ALWAYS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@[\\]^_`{|}~' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
  '·…—–‘’“”×÷±≈≤≥→←↑↓№㎥㎡°％∙•‧「」『』' +
  '　';

const chars = new Set();
for (const c of ALWAYS) chars.add(c);

let files = 0;
for (const f of walk(SRC)) {
  files++;
  for (const c of readFileSync(f, 'utf8')) chars.add(c);
}

const all = [...chars]
  .filter((c) => c.codePointAt(0) >= 0x20 && !(c >= '\uD800' && c <= '\uDFFF'))
  .sort()
  .join('');
const latin = [...all].filter((c) => c.codePointAt(0) < 0x2500).join('');
const hangul = [...all].filter((c) => c >= '가' && c <= '힣').length;

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

console.log(`소스 ${files}개 → 글자 ${all.length}자(한글 ${hangul})`);
for (const face of FACES) {
  const src = join(ROOT, face.src);
  if (!existsSync(src)) {
    console.error(`[실패] 원본이 없습니다: ${face.src}\n  → npm i 를 먼저 실행하세요.`);
    process.exit(2);
  }
  const textFile = join(OUT_DIR, `.charset-${face.out}.txt`);
  writeFileSync(textFile, face.latinOnly ? latin : all, 'utf8');
  const out = join(OUT_DIR, face.out);
  execFileSync(
    'pyftsubset',
    [
      src,
      `--text-file=${textFile}`,
      '--flavor=woff2',
      `--output-file=${out}`,
      '--layout-features=kern,liga,calt,tnum',
      '--no-hinting',
      '--desubroutinize',
    ],
    { stdio: 'inherit' }
  );
  console.log(
    `  ${face.role.padEnd(3)} ${face.name.padEnd(15)} ${kb(statSync(src).size)} → ${kb(statSync(out).size)}`
  );
}
