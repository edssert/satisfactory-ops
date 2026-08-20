/**
 * 서비스워커를 실제로 실행해 응답을 확인한다.
 *
 * 키 문자열만 비교하는 테스트로는 "왜 아직도 랜딩이 뜨는가"를 못 잡는다.
 * 여기서는 dist/sw.js 를 그대로 로드해 install → activate → fetch(navigate) 를 돌리고,
 * 실제로 어떤 문서가 돌아오는지 본문으로 확인한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SW = path.join(DIST, 'sw.js');
const BASE = '/satisfactory-ops';

/** dist/ 를 URL → 내용으로 올려둔 가짜 서버 */
function loadDist(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const rel = path.relative(DIST, full).split(path.sep).join('/');
        files.set(`${BASE}/${rel}`, fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(DIST);
  return files;
}

interface SwHarness {
  navigate(pathname: string): Promise<{ status: number; body: string }>;
  cachedCount: number;
}

async function bootServiceWorker(offline = false): Promise<SwHarness> {
  const server = loadDist();
  const store = new Map<string, Map<string, string>>();
  const listeners = new Map<string, ((e: unknown) => void)[]>();

  const fakeCache = (name: string) => {
    const bucket = store.get(name)!;
    return {
      async addAll(urls: string[]) {
        for (const u of urls) {
          const body = server.get(u);
          if (body === undefined) throw new Error(`프리캐시 대상이 서버에 없음: ${u}`);
          bucket.set(u, body);
        }
      },
      async match(req: unknown) {
        const url = typeof req === 'string' ? req : new URL((req as Request).url).pathname;
        const hit = bucket.get(url);
        return hit === undefined ? undefined : new Response(hit, { status: 200 });
      },
    };
  };

  const context: Record<string, unknown> = {
    console,
    URL,
    Response,
    Request,
    caches: {
      async open(name: string) {
        if (!store.has(name)) store.set(name, new Map());
        return fakeCache(name);
      },
      async keys() {
        return [...store.keys()];
      },
      async delete(name: string) {
        return store.delete(name);
      },
      async match(req: unknown) {
        for (const name of store.keys()) {
          const hit = await fakeCache(name).match(req);
          if (hit) return hit;
        }
        return undefined;
      },
    },
    fetch: async (req: Request) => {
      if (offline) throw new Error('오프라인');
      const url = new URL(typeof req === 'string' ? req : req.url).pathname;
      const body = server.get(url);
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(body, { status: 200 });
    },
  };

  context.self = {
    location: new URL(`https://edssert.github.io${BASE}/sw.js`),
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SW, 'utf8'), context, { filename: 'sw.js' });

  // install
  let installWork: Promise<unknown> = Promise.resolve();
  for (const fn of listeners.get('install') ?? []) {
    fn({ waitUntil: (p: Promise<unknown>) => (installWork = p) });
  }
  await installWork;

  // activate
  let activateWork: Promise<unknown> = Promise.resolve();
  for (const fn of listeners.get('activate') ?? []) {
    fn({ waitUntil: (p: Promise<unknown>) => (activateWork = p) });
  }
  await activateWork;

  const cachedCount = [...store.values()].reduce((n, m) => n + m.size, 0);

  return {
    cachedCount,
    async navigate(pathname: string) {
      const req = new Request(`https://edssert.github.io${pathname}`);
      Object.defineProperty(req, 'mode', { value: 'navigate' });
      const responded: Promise<Response>[] = [];
      for (const fn of listeners.get('fetch') ?? []) {
        fn({ request: req, respondWith: (p: Promise<Response>) => responded.push(p) });
      }
      const first = responded[0];
      if (!first) throw new Error('서비스워커가 응답하지 않았다');
      const res = await first;
      return { status: res.status, body: await res.text() };
    },
  };
}

const titleOf = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '(제목 없음)';

test('설치 시 프리캐시가 채워진다', { skip: !fs.existsSync(SW) }, async () => {
  const sw = await bootServiceWorker();
  assert.ok(sw.cachedCount > 40, `프리캐시된 파일이 너무 적다: ${sw.cachedCount}`);
});

test('온라인에서 각 화면이 자기 문서를 돌려준다', { skip: !fs.existsSync(SW) }, async () => {
  const sw = await bootServiceWorker();
  const cases: [string, string][] = [
    [`${BASE}/`, '지금 무엇을'],
    [`${BASE}/guide/`, '해금 순서대로'],
    [`${BASE}/codex/reference/`, '레퍼런스'],
    [`${BASE}/codex/tiers/0/`, '티어 0'],
    [`${BASE}/codex/mam/quartz/`, 'MAM 도감'],
    [`${BASE}/codex/shop/parts/`, '싱크 상점 도감'],
    [`${BASE}/versions/`, 'Release Notes'],
  ];
  for (const [pathname, expected] of cases) {
    const res = await sw.navigate(pathname);
    const title = titleOf(res.body);
    assert.ok(
      title.includes(expected),
      `${pathname} → "${title}" (기대: "${expected}" 포함). 랜딩이 돌아왔다면 캐시 키가 빗나간 것이다.`
    );
  }
});

test('오프라인에서도 각 화면이 자기 문서를 돌려준다', { skip: !fs.existsSync(SW) }, async () => {
  const sw = await bootServiceWorker(true);
  const res = await sw.navigate(`${BASE}/guide/`);
  assert.ok(titleOf(res.body).includes('해금 순서대로'), `오프라인 응답: ${titleOf(res.body)}`);
});

test('캐시에 없는 경로는 오프라인일 때만 셸로 폴백한다', { skip: !fs.existsSync(SW) }, async () => {
  const offline = await bootServiceWorker(true);
  const res = await offline.navigate(`${BASE}/nope/`);
  assert.ok(titleOf(res.body).length > 0, '셸 폴백이 동작해야 한다');
});
