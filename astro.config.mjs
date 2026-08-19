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
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
