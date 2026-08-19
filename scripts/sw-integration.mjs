/**
 * sw-integration.mjs — 빌드 산출물 목록으로 서비스워커를 생성하는 Astro 통합.
 *
 * Workbox를 쓰지 않는다. 이 앱의 자산 총량이 작아(1~2MB) 전량 프리캐시가 성립하므로,
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

/** 프리캐시에서 제외할 것: 소스맵, 라이선스 텍스트 등 런타임에 필요 없는 파일 */
const EXCLUDE = [/\.map$/i, /LICENSE/i, /\.txt$/i];

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
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
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

async function handleNavigate(req) {
  const cache = await caches.open(CACHE);
  const url = new URL(req.url);
  const key = navigationCacheKey(url.pathname);

  const exact = await cache.match(key);
  if (exact) return exact;

  const asIs = await cache.match(req, { ignoreSearch: true });
  if (asIs) return asIs;

  // 캐시에 없는 경로 — 네트워크를 먼저 시도하고, 실패하면 셸로 폴백한다.
  try {
    const res = await fetch(req);
    if (res && res.ok) return res;
  } catch (e) { /* 오프라인 */ }

  return (await cache.match(SHELL)) || Response.error();
}

// fetch — 캐시 우선. 오프라인에서 네트워크를 한 번도 쓰지 않는다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))
  );
});

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
