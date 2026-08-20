/**
 * build-font.mjs — 이 사이트가 실제로 쓰는 글자만 담은 Pretendard 서브셋을 만든다.
 *
 * 왜 이렇게 하는가: Pretendard 가변 원본은 2MB 다. 배포판이 제공하는 동적 서브셋은
 * 92개 조각으로 쪼개져 있어 한국어 페이지 하나가 수십 개를 연쇄로 물어온다.
 * 이 사이트는 정적이고 텍스트가 빌드 시점에 전부 확정되므로, 쓰는 글자만 뽑아
 * 파일 하나로 만드는 편이 낫다 — 요청 1회, 오프라인 캐시도 단순해진다.
 *
 * 수집 범위: 화면에 렌더될 수 있는 모든 소스 (astro/ts/tsx/json/md 데이터).
 * 코드 식별자까지 섞여 들어가지만 라틴 문자는 어차피 전부 포함하므로 손해가 없다.
 * 한글은 실제 등장 음절만 남는다.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const OUT_DIR = join(SRC, 'fonts');
const VARIABLE = join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2');

/** 텍스트가 들어 있을 수 있는 확장자. 폰트·이미지는 당연히 제외 */
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

const chars = new Set();
/**
 * 항상 포함하는 최소 집합. 소스에 없더라도 런타임에 나올 수 있는 것들이다 —
 * 숫자·구두점·통화, 그리고 서식용 기호. 빠지면 폴백 서체로 튀어 글자 모양이 갈린다.
 */
const ALWAYS = ' !"#$%&\'()*+,-./0123456789:;<=>?@[\]^_`{|}~'
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  + '·…—–‘’“”×÷±≈≤≥→←↑↓№㎥㎡°％∙•‧'
  + '　'; // 전각 공백
for (const c of ALWAYS) chars.add(c);

let files = 0;
for (const f of walk(SRC)) {
  files++;
  for (const c of readFileSync(f, 'utf8')) chars.add(c);
}
// 큐레이션 데이터는 src 안에 있지만, 게임 원본 데이터도 화면에 나온다
for (const f of walk(join(SRC, 'data'))) {
  for (const c of readFileSync(f, 'utf8')) chars.add(c);
}

// 제어문자·서로게이트 제거
const text = [...chars]
  .filter((c) => c.codePointAt(0) >= 0x20 && !(c >= '\uD800' && c <= '\uDFFF'))
  .sort()
  .join('');

const hangul = [...text].filter((c) => c >= '가' && c <= '힣').length;

mkdirSync(OUT_DIR, { recursive: true });
const textFile = join(OUT_DIR, '.charset.txt');
writeFileSync(textFile, text, 'utf8');

const out = join(OUT_DIR, 'pretendard-subset.woff2');
execFileSync('pyftsubset', [
  VARIABLE,
  `--text-file=${textFile}`,
  '--flavor=woff2',
  `--output-file=${out}`,
  '--layout-features=kern,liga,calt',
  '--no-hinting',
  '--desubroutinize',
], { stdio: 'inherit' });

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
console.log(
  `폰트 서브셋: 소스 ${files}개 → 글자 ${text.length}자(한글 ${hangul}) → ` +
  `${kb(statSync(out).size)} (원본 ${kb(statSync(VARIABLE).size)})`
);
