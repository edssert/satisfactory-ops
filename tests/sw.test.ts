/**
 * 서비스워커 캐시 키 테스트.
 *
 * 실제로 난 사고: 프리캐시 키는 `.../milestones/index.html` 인데 브라우저는 `.../milestones/` 로
 * 네비게이션한다. 캐시가 항상 빗나가 폴백(랜딩)이 나왔고, 내부 링크가 전부 "안 열리는" 것처럼 보였다.
 * 배포된 dist/sw.js 에 이 변환이 실제로 들어갔는지까지 확인한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { navigationCacheKey } from '../scripts/sw-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('디렉터리 URL은 index.html 키로 변환된다', () => {
  assert.equal(navigationCacheKey('/satisfactory-ops/'), '/satisfactory-ops/index.html');
  assert.equal(
    navigationCacheKey('/satisfactory-ops/milestones/'),
    '/satisfactory-ops/milestones/index.html'
  );
});

test('슬래시 없는 경로도 index.html 키로 변환된다', () => {
  assert.equal(
    navigationCacheKey('/satisfactory-ops/calc'),
    '/satisfactory-ops/calc/index.html'
  );
});

test('확장자가 있는 경로는 그대로 둔다', () => {
  assert.equal(navigationCacheKey('/satisfactory-ops/sw.js'), '/satisfactory-ops/sw.js');
  assert.equal(
    navigationCacheKey('/satisfactory-ops/manifest.webmanifest'),
    '/satisfactory-ops/manifest.webmanifest'
  );
});

test('생성된 sw.js 가 모든 라우트를 캐시에서 찾을 수 있다', { skip: !fs.existsSync(path.join(ROOT, 'dist/sw.js')) }, () => {
  const sw = fs.readFileSync(path.join(ROOT, 'dist/sw.js'), 'utf8');

  // 프리캐시 목록 추출
  const m = sw.match(/const ASSETS = (\[[\s\S]*?\]);/);
  assert.ok(m, 'ASSETS 목록을 찾을 수 없음');
  const assets: string[] = JSON.parse(m[1]!);
  const cached = new Set(assets);

  // 네비게이션 변환이 실제로 주입되었는가
  assert.ok(sw.includes('function navigationCacheKey'), 'sw.js 에 키 변환이 없다');

  // 고장난 이전 버전에 갇히지 않도록 설치 즉시 교체되어야 한다
  assert.ok(sw.includes('self.skipWaiting()'), '설치 후 skipWaiting 이 없으면 구버전이 계속 산다');
  assert.ok(sw.includes('self.clients.claim()'), 'activate 에서 clients.claim 이 없다');

  // 모든 페이지 라우트가 변환 후 캐시에서 찾아져야 한다
  const routes = assets
    .filter((a) => a.endsWith('/index.html'))
    .map((a) => a.replace(/index\.html$/, ''));
  /*
   * 개수 대신 실제 경로를 확인한다. 앞선 판본은 최소 개수를 상수로 박아 두었는데,
   * 페이지를 합치면서 그 상수가 곧바로 거짓이 됐다. 사이트 구조는 바뀔 수 있고
   * 이 테스트가 지켜야 할 것은 "있는 라우트가 캐시에서 빗나가지 않는가" 다.
   */
  const EXPECTED = ['/satisfactory-ops/', '/satisfactory-ops/guide/', '/satisfactory-ops/tools/', '/satisfactory-ops/versions/'];
  for (const want of EXPECTED) {
    assert.ok(routes.includes(want), `라우트 누락: ${want}`);
  }

  for (const route of routes) {
    assert.ok(
      cached.has(navigationCacheKey(route)),
      `${route} 가 캐시에서 빗나간다 → 폴백으로 랜딩이 뜬다`
    );
  }
});
