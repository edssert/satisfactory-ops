// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import preact from '@astrojs/preact';
import serviceWorker from './scripts/sw-integration.mjs';

// 결정 근거: docs/adr/0009-frontend-architecture.md
export default defineConfig({
  site: 'https://edssert.github.io',
  base: '/satisfactory-ops',
  output: 'static',
  // GitHub Pages의 디렉터리 인덱스와 서비스워커 프리캐시 키를 일치시킨다.
  trailingSlash: 'always',
  // 자산은 이미 최적화된 webp다. sharp(네이티브 의존성)를 도입하지 않는다.
  image: { service: passthroughImageService() },
  integrations: [preact({ compat: false }), serviceWorker({ base: '/satisfactory-ops/' })],
  /*
   * 탭이 페이지 이동이라 누를 때마다 새로 받았다. 화면이 한 번 비었다가 다시 그려져
   * 「움찔거린다」는 말이 나왔다. 링크가 보이면 미리 받아 두면 이동이 즉시 끝난다.
   * 아일랜드를 늘리는 게 아니라 <link rel="prefetch"> 를 넣는 것이라 JS 예산과 무관하다.
   */
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
