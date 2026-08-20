/**
 * fetch-reddit.mjs — 레딧 스레드를 RSS 로 받아 텍스트로 떨군다.
 *
 * 왜 RSS 인가: reddit.com 본문·`.json`·구 인터페이스·미러(safereddit/redlib)·헤드리스 브라우저가
 * 전부 차단되거나 로그인 벽에 막힌다. `.rss` 만 익명으로 열린다.
 *   https://www.reddit.com/comments/<id>.rss?limit=100
 *
 * 한계: 이미지 글은 본문이 비어 있고 RSS 에 이미지 URL 이 실리지 않는다. 댓글만 얻는다.
 *
 * 사용: node scripts/fetch-reddit.mjs <id> [<id> ...]
 *      node scripts/fetch-reddit.mjs --file ids.txt
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.tmp-research/reddit';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
let ids = [];
if (args[0] === '--file') {
  ids = readFileSync(args[1], 'utf8').split(/\s+/).filter(Boolean);
} else {
  ids = args;
}

const strip = (s) =>
  s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#32;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 요청 간 기본 간격 */
const GAP = 12000;

mkdirSync(OUT, { recursive: true });
let ok = 0;
for (const id of ids) {
  const url = `https://www.reddit.com/comments/${id}.rss?limit=100`;
  try {
    /*
     * 익명 RSS 는 속도 제한이 빡빡하다. 1.2초 간격으로 8건을 던졌더니 두 번째부터 전부 429 였다.
     * 기본 간격을 넉넉히 두고, 429 를 만나면 지수적으로 물러선다.
     */
    let res = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml' } });
      if (res.status !== 429) break;
      const wait = 20000 * Math.pow(2, attempt);
      console.log(`  ${id}  429 — ${wait / 1000}초 대기 후 재시도 (${attempt + 1}/4)`);
      await sleep(wait);
    }
    if (!res || !res.ok) {
      console.log(`  ${id}  HTTP ${res ? res.status : '?'} — 건너뜀`);
      await sleep(GAP);
      continue;
    }
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    const lines = [];
    let title = '';
    entries.forEach((e, i) => {
      const t = strip((e.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]);
      const body = strip((e.match(/<content type="html">([\s\S]*?)<\/content>/) || [, ''])[1])
        .replace(/^\s*submitted by\s*\/u\/\S+\s*to\s*r\/\S+\s*\[link\]\s*\[comments\]\s*/i, '')
        .replace(/^\s*\/u\/\S+\s*/, '');
      const author = (e.match(/<name>([\s\S]*?)<\/name>/) || [, '?'])[1];
      if (i === 0) {
        title = t;
        lines.push(`# ${t}`, ``, `URL: https://www.reddit.com/comments/${id}/`, `작성자: ${author}`, ``, `## 본문`, body || '(본문 없음 — 이미지/링크 글)', ``, `## 댓글 ${entries.length - 1}건`, ``);
      } else if (body.length > 25) {
        lines.push(`[${i}] (${author}) ${body}`, ``);
      }
    });
    writeFileSync(join(OUT, `${id}.txt`), lines.join('\n'), 'utf8');
    console.log(`  ${id}  댓글 ${entries.length - 1}건  ${title.slice(0, 70)}`);
    ok++;
  } catch (e) {
    console.log(`  ${id}  실패: ${e.message}`);
  }
  await sleep(GAP);
}
console.log(`\n${ok}/${ids.length} 건 수집 → ${OUT}/`);
