/**
 * check-guide-content.mjs — 진행 가이드의 정보 구조와 외부 주장 회귀를 검증한다.
 *
 * 실행: node scripts/check-guide-content.mjs
 * 종료: 0 통과 · 1 구조/근거/금지 문구 위반
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const spine = JSON.parse(read('src/data/curated/spine.json'));
const guideSource = read('src/pages/guide/index.astro');
const startSource = read('src/pages/guide/start/index.astro');
const finiteSource = read('src/data/curated/finite-resources.json');
const failures = [];
const fail = (message) => failures.push(message);

const validConfidence = new Set(['verified', 'consensus', 'disputed', 'unsourced']);
const legacyKeys = ['gateNote', 'goal', 'actions', 'leaveRoom'];
const bannedPhrases = ['OPERATION BRIEF', 'BUILD NOW', 'CAPACITY', 'GATE CONDITION'];

if (!Array.isArray(spine.steps) || spine.steps.length !== 10) {
  fail(`진행 단계는 티어 0~9의 10개여야 합니다: ${spine.steps?.length ?? 0}`);
}

const ids = new Set();
for (const [index, step] of (spine.steps ?? []).entries()) {
  const where = `steps[${index}](${step.id ?? 'id 없음'})`;
  if (ids.has(step.id)) fail(`${where}: id 중복`);
  ids.add(step.id);
  if (step.tier !== index) fail(`${where}: tier ${step.tier}는 배열 위치 ${index}와 다릅니다.`);
  for (const key of legacyKeys) if (key in step) fail(`${where}: 이전 키 ${key}가 돌아왔습니다.`);
  if (typeof step.brief !== 'string' || step.brief.length < 30) fail(`${where}: brief가 너무 짧거나 없습니다.`);
  if (!Array.isArray(step.doneWhen) || step.doneWhen.length < 3) fail(`${where}: 완료 상태가 3개 미만입니다.`);
  if (!Array.isArray(step.sequence) || step.sequence.length < 3) fail(`${where}: 시공 순서가 3개 미만입니다.`);
  for (const row of step.sequence ?? []) {
    if (!row.build || !row.verify) fail(`${where}: 시공과 현장 검증을 함께 적어야 합니다.`);
  }
  if (typeof step.reserve !== 'string' || step.reserve.length < 20) fail(`${where}: 확장 예약이 없습니다.`);
  if (!Array.isArray(step.sources) || step.sources.length < 2) fail(`${where}: 근거가 2개 미만입니다.`);
  if (!validConfidence.has(step.confidence)) fail(`${where}: confidence가 유효하지 않습니다.`);
  for (const source of step.sources ?? []) {
    if (source.startsWith('https://')) continue;
    if (!fs.existsSync(path.join(root, source))) fail(`${where}: 로컬 근거가 없습니다 — ${source}`);
  }
  const prose = JSON.stringify({
    brief: step.brief,
    doneWhen: step.doneWhen,
    sequence: step.sequence,
    reserve: step.reserve,
  });
  if (/\d/.test(prose)) fail(`${where}: 설명문에 숫자 리터럴이 있습니다. 수치는 앱 데이터에서 계산하세요.`);
}

for (const phrase of bannedPhrases) {
  if ((guideSource + JSON.stringify(spine)).includes(phrase)) fail(`이전 지시서 문구가 돌아왔습니다: ${phrase}`);
}
if (!guideSource.includes('완료 상태') || !guideSource.includes('시공 순서 · 현장 검증') || !guideSource.includes('확장 예약')) {
  fail('새 정보 구조의 화면 라벨이 빠졌습니다.');
}
if (/전부는 못 딴다|하드 드라이브 수는 그보다 적/.test(finiteSource)) {
  fail('폐기된 하드 드라이브 부족설이 돌아왔습니다.');
}
if (/티어 7\s*즈음|초반에는 캘 기계도/.test(startSource)) {
  fail('폐기된 S.A.M. 후반 전용설이 돌아왔습니다.');
}

if (failures.length) {
  console.error(`가이드 콘텐츠 검증 실패 (${failures.length}건)`);
  failures.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}

console.log(`가이드 콘텐츠 검증 통과 — ${spine.steps.length}단계 · 이전 스키마 0 · 수치 중복 0 · 폐기 주장 0`);

