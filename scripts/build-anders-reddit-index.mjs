/**
 * 연구 보관소의 AndersPottemager Reddit 아카이브 색인을 배포 이미지가 없는 정규화 증거 색인으로 만든다.
 * 원본 이미지 바이트나 Reddit selftext는 앱 데이터에 복사하지 않는다.
 *
 * 사용:
 *   node scripts/build-anders-reddit-index.mjs
 *
 * 입력:
 *   .tmp-research/anders/original-posts/index.json
 *
 * 출력:
 *   src/data/curated/anders-reddit-posts.json
 *
 * 종료 코드:
 *   0 생성 완료
 *   1 입력·스키마 오류
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const inputPath = resolve(root, '.tmp-research/anders/original-posts/index.json');
const outputPath = resolve(root, 'src/data/curated/anders-reddit-posts.json');

try {
  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  if (raw.$schemaVersion !== 1 || !Array.isArray(raw.posts)) throw new Error('원본 아카이브 색인 스키마가 다릅니다.');

  const posts = raw.posts
    .map((post) => ({
      id: `reddit:${post.id}`,
      redditId: post.id,
      title: post.title,
      role: post.role,
      createdUtc: post.createdUtc,
      permalink: post.permalink,
      media: post.media.map((media) => ({
        id: `reddit-media:${post.id}:${media.index}`,
        index: media.index,
        mediaId: media.mediaId,
        sourceUri: media.uri,
        fallbackUri: media.fallbackUri ?? null,
        widthPx: media.expectedWidthPx,
        heightPx: media.expectedHeightPx,
        mimeType: media.mimeType,
        availability: media.availability,
        sha256: media.sha256 ?? null,
      })),
    }))
    .sort((left, right) => left.createdUtc - right.createdUtc || left.id.localeCompare(right.id));

  const output = {
    $schemaVersion: 1,
    $description: 'AndersPottemager의 Satisfactory Reddit 게시물과 원본 이미지의 정규화 증거 색인. 이미지 바이트는 배포하지 않는다.',
    author: 'AndersPottemager',
    acquisition: {
      metadataSource: 'https://arctic-shift.photon-reddit.com/api/posts/search?author=AndersPottemager&limit=50',
      downloader: 'scripts/archive-anders-layouts.mjs',
      rightsStatus: 'public-reference-only-unless-explicitly-released',
    },
    counts: {
      posts: posts.length,
      media: posts.flatMap((post) => post.media).length,
      archivedMedia: posts.flatMap((post) => post.media).filter((media) => media.availability === 'archived').length,
      unavailableMedia: posts.flatMap((post) => post.media).filter((media) => media.availability === 'unavailable').length,
    },
    posts,
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`PASS  Anders Reddit 증거 색인 ${output.counts.posts}건 · 매체 ${output.counts.media}건 생성\n`);
} catch (error) {
  process.stderr.write(`ERROR ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
}
