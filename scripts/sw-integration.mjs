/**
 * sw-integration.mjs — 빌드 산출물 목록으로 서비스워커를 생성하는 Astro 통합.
 *
 * Workbox를 쓰지 않는다. 앱 껍데기가 작아 전량 프리캐시가 성립하므로,
 * 필요한 것은 "파일 목록 + 버전 해시 + 원자적 install"뿐이다. 그 코드가 60줄이다.
 * 의존성을 하나 줄이는 대신 이 코드를 우리가 소유한다 (arch-offline.md §11-9의 트레이드오프를 인지하고 선택).
 *
 * 전략 (docs/research/arch-offline.md §4~6):
 *  - install: 전체 목록을 원자적으로 캐시. 하나라도 실패하면 install 실패 → 구버전 유지
 *  - activate: 이전 버전 캐시 삭제
 *  - fetch: 캐시 우선. 네비게이션은 캐시된 index.html로 폴백
 *  - 업데이트: 자동 적용하지 않고 페이지에 알린다 (prompt). 사용자가 새로고침을 누를 때 전환
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * 네비게이션 URL을 프리캐시 키로 바꾼다.
 *
 * 프리캐시 목록은 빌드 산출물 경로(`.../milestones/index.html`)인데 브라우저는
 * 디렉터리 URL(`.../milestones/`)로 네비게이션한다. 이 변환이 없으면 캐시가 항상 빗나가고
 * 폴백으로 랜딩 페이지가 나온다 — 내부 링크가 전부 "안 열리는" 것처럼 보인다.
 */
export function navigationCacheKey(pathname) {
  if (pathname.endsWith('/')) return pathname + 'index.html';
  if (!pathname.split('/').pop().includes('.')) return pathname + '/index.html';
  return pathname;
}

/**
 * 프리캐시에서 제외할 것.
 *
 * install 은 **원자적**이다 — 목록 전체를 받아야 이 버전이 설치된다. 그래서 목록에 넣는 것은
 * "첫 화면에 반드시 필요한가"로 골라야 한다. 재 보니 15MB 였고, 그중 7.6MB 가 아이콘 611장,
 * 4.2MB 가 그림이었다. 첫 방문자가 도감을 열지도 않았는데 그걸 다 받고 있었다.
 *
 * 뺀 것은 사라지지 않는다. 아래 fetch 처리기가 **쓰는 순간 받아 캐시에 넣는다.**
 * 한 번 본 화면은 그다음부터 오프라인에서도 열린다.
 */
const EXCLUDE = [
  /\.map$/i,
  /LICENSE/i,
  /\.txt$/i,
  /*
   * 지도 확대 타일은 미리 받지 않는다. 32장 1.8MB 인데 확대해야 쓰이고,
   * 미리보기 한 장이면 지도 화면이 열린다. 오프라인에서도 전체 보기는 된다.
   */
  /assets[\/]map[\/][a-z]+[\/]\d+-\d+\.webp$/i,
  /*
   * 아이템·설비 아이콘 611장 7.6MB. 한 화면이 쓰는 것은 수십 장이고, 대부분의 방문자는
   * 대부분을 평생 안 본다. 쓸 때 받아서 캐시에 남긴다.
   */
  /assets[\/](items|buildings-png|buildings)[\/]/i,
  /*
   * 큰 그림(키아트·배경). 첫 화면 것 하나면 되고 나머지는 스크롤해야 나온다.
   */
  /assets[\/]art[\/]/i,
  /*
   * 세이브 파서 청크 2.6MB. 일부러 지연 import 로 만들어 뒀는데 프리캐시가 그걸 무력화했다 —
   * 세이브를 열 생각이 없는 사람도 받고 있었다. 파일을 고르는 순간 받는다.
   */
  /_astro[\/]build\.[A-Za-z0-9_-]+\.js$/,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export default function serviceWorker({ base = '/' } = {}) {
  return {
    name: 'sfops-service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = dir.pathname.replace(/^\/([A-Za-z]:)/, '$1');
        const files = walk(outDir)
          .map((f) => path.relative(outDir, f).split(path.sep).join('/'))
          .filter((f) => !EXCLUDE.some((re) => re.test(f)))
          .filter((f) => f !== 'sw.js')
          .sort();

        const prefix = base.endsWith('/') ? base : base + '/';
        const urls = files.map((f) => prefix + f);

        // 버전 = 파일 목록 + 각 파일 크기의 해시. 내용이 바뀌면 버전이 바뀐다.
        const hash = crypto.createHash('sha256');
        for (const f of files) {
          hash.update(f);
          hash.update(String(fs.statSync(path.join(outDir, f)).size));
        }
        const version = hash.digest('hex').slice(0, 12);

        const sw = `/* 생성 파일 — scripts/sw-integration.mjs 가 만듭니다. 직접 수정하지 마세요. */
const VERSION = ${JSON.stringify(version)};
const CACHE = 'sfops-' + VERSION;
const SHELL = ${JSON.stringify(prefix + 'index.html')};
const ASSETS = ${JSON.stringify(urls)};

// install — 전량을 원자적으로 받는다. 하나라도 실패하면 이 버전은 설치되지 않는다.
// 설치에 성공하면 즉시 대기 상태를 건너뛴다: 이전 버전이 고장난 경우 사용자가 탭을 전부 닫기 전까지
// 영원히 교체되지 않는 문제가 실제로 발생했다 (arch-offline §5의 prompt 전략에서 의도적으로 이탈).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// activate — 이전 버전 캐시를 지운다.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 프리캐시 키는 .../index.html 인데 네비게이션은 .../ 로 온다. 이 변환이 없으면 전부 빗나간다.
${navigationCacheKey.toString()}

/**
 * 문서(HTML)는 **네트워크 우선**이다.
 *
 * 캐시 우선으로 두었더니 낡은 HTML이 새로 배포된 JS와 만나는 상태가 생겼다.
 * 그러면 하이드레이션이 어긋나 옛 내용과 새 내용이 같은 자리에 겹쳐 그려진다 —
 * 실제로 글자가 두 겹으로 나오는 화면이 나왔다. HTML은 항상 새 것을 받아야 한다.
 * 오프라인에서는 캐시로 떨어지므로 오프라인 동작은 그대로다.
 */
async function handleNavigate(req) {
  const cache = await caches.open(CACHE);
  const url = new URL(req.url);
  const key = navigationCacheKey(url.pathname);

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(key, res.clone());
      return res;
    }
  } catch (e) { /* 오프라인 — 아래에서 캐시로 떨어진다 */ }

  return (
    (await cache.match(key)) ||
    (await cache.match(req, { ignoreSearch: true })) ||
    (await cache.match(SHELL)) ||
    Response.error()
  );
}

// fetch — 해시가 붙은 자산은 캐시 우선, 문서는 위에서 네트워크 우선.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }

  event.respondWith(handleAsset(req));
});

/**
 * 자산은 캐시 우선. 캐시에 없으면 받아서 **넣어 둔다**.
 *
 * 프리캐시에서 뺀 아이콘·그림·파서가 여기로 온다. 한 번 본 것은 그다음부터 오프라인에서도 열린다.
 * 넣기에 실패해도(용량 초과 등) 응답은 그대로 돌려준다 — 캐시는 부가물이지 조건이 아니다.
 */
async function handleAsset(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    } catch (e) { /* 캐시에 못 넣어도 화면은 떠야 한다 */ }
  }
  return res;
}

// 페이지가 요청하면 즉시 전환한다 (사용자가 "새로고침"을 눌렀을 때).
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
`;

        fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
        const bytes = urls.reduce(
          (n, _, i) => n + fs.statSync(path.join(outDir, files[i])).size,
          0
        );
        logger.info(
          `서비스워커 생성: ${urls.length}개 파일 / ${(bytes / 1024 / 1024).toFixed(2)}MB 프리캐시 (버전 ${version})`
        );
      },
    },
  };
}
