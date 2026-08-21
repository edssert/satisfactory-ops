#!/usr/bin/env node
/**
 * 사용자가 승인한 검증 후보만 배포 WebP로 변환하고 매니페스트 갱신용 메타데이터를 출력한다.
 * 매니페스트는 자동 수정하지 않는다.
 *
 * 사용:
 *   node scripts/topview/promote-validated-asset.mjs <receipt.json> <output.webp> --approved-sha256=<hash>
 *
 * 종료:
 *   0 변환 성공, 2 승인·해시·영수증 오류.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const [receiptArg, outputArg] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const approvedHash = process.argv.find((value) => value.startsWith('--approved-sha256='))?.slice('--approved-sha256='.length).toLowerCase();
if (!receiptArg || !outputArg || !/^[0-9a-f]{64}$/.test(approvedHash ?? '')) {
  process.stderr.write('사용: node scripts/topview/promote-validated-asset.mjs <receipt.json> <output.webp> --approved-sha256=<hash>\n');
  process.exit(2);
}
const receiptPath = resolve(receiptArg);
const outputPath = resolve(outputArg);
if (!existsSync(receiptPath)) {
  process.stderr.write(`영수증이 없습니다: ${receiptPath}\n`);
  process.exit(2);
}
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
if (!['validated-baseline-match-not-approved', 'validated-change-candidate-not-approved'].includes(receipt.status)) {
  process.stderr.write(`검증 영수증 상태가 아닙니다: ${receipt.status}\n`);
  process.exit(2);
}
const candidatePath = receipt.outputs?.candidate?.path;
if (!candidatePath || !existsSync(candidatePath)) {
  process.stderr.write(`후보 PNG가 없습니다: ${candidatePath}\n`);
  process.exit(2);
}
const candidateBuffer = readFileSync(candidatePath);
const actualCandidateHash = createHash('sha256').update(candidateBuffer).digest('hex');
if (actualCandidateHash !== receipt.outputs.candidate.sha256 || actualCandidateHash !== approvedHash) {
  process.stderr.write(`승인 SHA-256 불일치: actual=${actualCandidateHash} receipt=${receipt.outputs.candidate.sha256} approved=${approvedHash}\n`);
  process.exit(2);
}

const occupancyFrame = receipt.contracts?.occupancyFrame;
if (!occupancyFrame || ![occupancyFrame.x, occupancyFrame.y, occupancyFrame.width, occupancyFrame.height].every(Number.isFinite)) {
  process.stderr.write('영수증에 Blender 기하 기반 점유 프레임이 없습니다.\n');
  process.exit(2);
}
const image = sharp(candidateBuffer).ensureAlpha();
const { data: normalizedPixels, info } = await image.raw().toBuffer({ resolveWithObject: true });
for (let offset = 0; offset < normalizedPixels.length; offset += 4) {
  if (normalizedPixels[offset + 3] !== 0) continue;
  normalizedPixels[offset] = 0;
  normalizedPixels[offset + 1] = 0;
  normalizedPixels[offset + 2] = 0;
}
await sharp(normalizedPixels, { raw: info }).webp({ lossless: true, effort: 6 }).toFile(outputPath);
const outputHash = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
const metadata = {
  sourceCandidateSha256: actualCandidateHash,
  sha256: outputHash,
  renderPx: { width: info.width, height: info.height },
  occupancyFrame,
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
