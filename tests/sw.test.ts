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

  // 모든 페이지 라우트가 변환 후 캐시에서 찾아져야 한다
  const routes = assets
    .filter((a) => a.endsWith('/index.html'))
    .map((a) => a.replace(/index\.html$/, ''));
  assert.ok(routes.length >= 6, `라우트가 너무 적다: ${routes.length}`);

  for (const route of routes) {
    assert.ok(
      cached.has(navigationCacheKey(route)),
      `${route} 가 캐시에서 빗나간다 → 폴백으로 랜딩이 뜬다`
    );
  }
});
