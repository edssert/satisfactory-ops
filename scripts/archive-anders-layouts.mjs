/**
 * Arctic Shift에서 확보한 AndersPottemager 게시물 메타데이터를 읽어 Satisfactory 원본 이미지를
 * 연구 보관소에 내려받고 SHA-256 색인을 만든다. 배포 자산을 생성하지 않는다.
 *
 * 사용:
 *   node scripts/archive-anders-layouts.mjs [입력.json] [출력 디렉터리]
 *
 * 기본값:
 *   입력  .tmp-research/anders/anders-posts.json
 *   출력  .tmp-research/anders/original-posts
 *
 * 종료 코드:
 *   0 전부 저장·색인 완료
 *   1 입력 또는 다운로드 실패
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const inputPath = resolve(process.argv[2] ?? '.tmp-research/anders/anders-posts.json');
const outputDirectory = resolve(process.argv[3] ?? '.tmp-research/anders/original-posts');

const roleByPostId = new Map([
  ['1rtz2bi', 'interaction-concept'],
  ['1rtyjzf', 'interaction-concept'],
  ['12l586u', 'asset-pack'],
  ['ri2c86', 'layout'],
  ['re5jyz', 'layout'],
  ['qom52d', 'render-reference'],
  ['qjzjy5', 'layout'],
  ['q5619z', 'render-reference'],
  ['msq6pb', 'tutorial'],
  ['mq91ek', 'asset-pack'],
  ['mozrk1', 'layout'],
  ['mlmmld', 'layout'],
  ['mjj391', 'layout'],
  ['mfuj2c', 'layout'],
  ['kf451i', 'asset-pack'],
  ['k7t5no', 'layout'],
  ['k7dvjn', 'layout'],
  ['k76nk7', 'layout'],
  ['k5at59', 'layout'],
  ['k3dacg', 'layout'],
  ['k251gd', 'layout'],
]);

function decodeUrl(value) {
  return value?.replaceAll('&amp;', '&');
}

function mediaRows(post) {
  if (post.media_metadata && post.gallery_data?.items?.length) {
    return post.gallery_data.items.map(({ media_id: mediaId }, index) => {
      const media = post.media_metadata[mediaId];
      const mimeType = media?.m ?? 'image/png';
      const extension = mimeType === 'image/jpeg' ? '.jpg' : '.png';
      return {
        index: index + 1,
        mediaId,
        uri: `https://i.redd.it/${mediaId}${extension}`,
        fallbackUri: decodeUrl(media?.s?.u),
        expectedWidthPx: media?.s?.x ?? null,
        expectedHeightPx: media?.s?.y ?? null,
        mimeType,
      };
    });
  }

  if (post.url?.startsWith('https://i.redd.it/')) {
    const source = post.preview?.images?.[0]?.source;
    return [{
      index: 1,
      mediaId: post.url.split('/').at(-1).split('.')[0],
      uri: post.url,
      fallbackUri: decodeUrl(source?.url),
      expectedWidthPx: source?.width ?? null,
      expectedHeightPx: source?.height ?? null,
      mimeType: `image/${extname(new URL(post.url).pathname).slice(1) || 'png'}`,
    }];
  }

  return [];
}

async function download(primaryUri, fallbackUri) {
  const attempts = [primaryUri, fallbackUri].filter(Boolean);
  let lastError;
  for (const uri of attempts) {
    try {
      const response = await fetch(uri, { headers: { 'user-agent': 'satisfactory-ops-research/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { bytes: Buffer.from(await response.arrayBuffer()), finalUri: uri, contentType: response.headers.get('content-type') };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('다운로드 URI가 없습니다.');
}

try {
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const posts = payload.data
    .filter((post) => post.subreddit === 'SatisfactoryGame' && roleByPostId.has(post.id))
    .sort((a, b) => a.created_utc - b.created_utc);

  await mkdir(outputDirectory, { recursive: true });
  const index = {
    $schemaVersion: 1,
    source: 'https://arctic-shift.photon-reddit.com/api/posts/search?author=AndersPottemager&limit=50',
    author: 'AndersPottemager',
    generatedAt: new Date().toISOString(),
    posts: [],
  };

  for (const post of posts) {
    const media = [];
    for (const row of mediaRows(post)) {
      try {
        const downloaded = await download(row.uri, row.fallbackUri);
        const extension = downloaded.contentType?.includes('jpeg') ? '.jpg' : '.png';
        const filename = `${post.id}-${String(row.index).padStart(2, '0')}-${row.mediaId}${extension}`;
        await writeFile(resolve(outputDirectory, filename), downloaded.bytes);
        const sha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
        media.push({
          ...row,
          availability: 'archived',
          downloadedUri: downloaded.finalUri,
          filename,
          bytes: downloaded.bytes.length,
          sha256,
        });
        process.stdout.write(`  ${post.id} #${row.index} ${sha256.slice(0, 12)} ${filename}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        media.push({ ...row, availability: 'unavailable', error: message });
        process.stderr.write(`WARN  ${post.id} #${row.index} 원본 미확보: ${message}\n`);
      }
    }

    index.posts.push({
      id: post.id,
      title: post.title,
      role: roleByPostId.get(post.id),
      createdUtc: post.created_utc,
      permalink: `https://www.reddit.com${post.permalink}`,
      selftext: post.selftext ?? '',
      media,
    });
  }

  await writeFile(resolve(outputDirectory, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  const archived = index.posts.flatMap((post) => post.media).filter((media) => media.availability === 'archived').length;
  const unavailable = index.posts.flatMap((post) => post.media).filter((media) => media.availability === 'unavailable').length;
  process.stdout.write(`PASS  Anders 게시물 ${index.posts.length}건 · 이미지 ${archived}건 저장·해시 완료 · 미확보 ${unavailable}건 기록\n`);
} catch (error) {
  process.stderr.write(`ERROR ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
}
