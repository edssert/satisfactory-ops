#!/usr/bin/env node
/**
 * AndersPottemager 원본 시트 분석 결과를 영속 후보 카탈로그로 변환한다.
 *
 * 사용: node scripts/build-anders-candidate-catalog.mjs <candidates.json> [출력.json]
 * 입력: scripts/analyze-topview-sheets.py가 생성한 candidates.json
 * 출력: 기본 src/data/curated/anders-topview-candidates.json
 * 종료: 1 입력 없음/읽기 실패, 2 후보·매니페스트 참조 불일치
 */
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3] ?? 'src/data/curated/anders-topview-candidates.json';
if (!input) {
  console.error('candidates.json 경로를 주세요.');
  process.exit(1);
}

let analysis;
let manifest;
try {
  analysis = JSON.parse(fs.readFileSync(input, 'utf8'));
  manifest = JSON.parse(fs.readFileSync('src/data/curated/topview-assets.json', 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const source = manifest.$sources['anders-2023'];
const approvedByKey = new Map();
for (const asset of manifest.assets.filter((entry) => entry.sourceId === 'anders-2023' && entry.reviewStatus === 'approved')) {
  const sheet = asset.sheet ?? source.sheet;
  const key = `${sheet}#${asset.candidateId}`;
  if (approvedByKey.has(key)) {
    console.error(`중복 승인 후보: ${key}`);
    process.exit(2);
  }
  approvedByKey.set(key, asset);
}

const roleOverrides = new Map([
  ['Sheet_00.png#1', { identity: 'Unresolved production building', role: 'building', buildingClasses: [], confidence: 'disputed', identityStatus: 'role-identified' }],
  ['Sheet_00.png#2', { identity: 'Build_OilRefinery_C', role: 'building', buildingClasses: ['Build_OilRefinery_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#3', { identity: 'Build_FoundryMk1_C', role: 'building', buildingClasses: ['Build_FoundryMk1_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#4', { identity: 'Build_ManufacturerMk1_C', role: 'building', buildingClasses: ['Build_ManufacturerMk1_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#5', { identity: 'Build_AssemblerMk1_C', role: 'building', buildingClasses: ['Build_AssemblerMk1_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#7', { identity: 'Build_GeneratorNuclear_C', role: 'building', buildingClasses: ['Build_GeneratorNuclear_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#8', { identity: 'Build_GeneratorCoal_C', role: 'building', buildingClasses: ['Build_GeneratorCoal_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#10', { identity: 'Build_Blender_C', role: 'building', buildingClasses: ['Build_Blender_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#13', { identity: 'Build_Packager_C', role: 'building', buildingClasses: ['Build_Packager_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_00.png#16', { identity: 'Build_SmelterMk1_C', role: 'building', buildingClasses: ['Build_SmelterMk1_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_01.png#2', { identity: 'Build_HadronCollider_C', role: 'building', buildingClasses: ['Build_HadronCollider_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_01.png#7', { identity: 'Build_Foundation_8x1_01_C', role: 'foundation', buildingClasses: ['Build_Foundation_8x1_01_C'], confidence: 'verified', identityStatus: 'class-identified' }],
  ['Sheet_01.png#8', { identity: 'Build_WaterPump_C', role: 'building', buildingClasses: ['Build_WaterPump_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_02.png#1', { identity: 'Build_SpaceElevator_C', role: 'building', buildingClasses: ['Build_SpaceElevator_C'], confidence: 'consensus', identityStatus: 'class-identified' }],
  ['Sheet_02.png#2', { identity: 'Satisfactory logo', role: 'brand-reference', confidence: 'verified', identityStatus: 'class-identified' }],
  ['Texture 02.png#8', { identity: 'Conveyor direction marker A', role: 'transport-direction', confidence: 'verified' }],
  ['Texture 02.png#5', { identity: 'Unresolved production building', role: 'building', buildingClasses: [], confidence: 'disputed', identityStatus: 'role-identified' }],
  ['Texture 02.png#9', { identity: 'Conveyor direction marker B', role: 'transport-direction', confidence: 'verified' }],
  ['Texture 02.png#10', { identity: 'Conveyor belt 90-degree tile', role: 'transport-part', confidence: 'verified' }],
  ['Texture 02.png#11', { identity: 'Conveyor belt straight tile', role: 'transport-part', confidence: 'verified' }],
  ['Texture 02.png#12', { identity: 'Conveyor belt branch tile A', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#13', { identity: 'Conveyor belt branch tile B', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#14', { identity: 'Foundation tile variant', role: 'foundation', confidence: 'consensus' }],
  ['Texture 02.png#15', { identity: 'Pipeline fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#16', { identity: 'Pipeline fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#17', { identity: 'Pipeline fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#19', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#20', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#21', { identity: 'Conveyor Lift top-view head variant A', role: 'conveyor-lift-head', confidence: 'consensus', variant: 'direction-unverified' }],
  ['Texture 02.png#22', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#23', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#24', { identity: 'Pipeline fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#25', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#26', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#27', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#28', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#31', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#32', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#33', { identity: 'Conveyor Lift top-view head variant B', role: 'conveyor-lift-head', confidence: 'consensus', variant: 'direction-unverified' }],
  ['Texture 02.png#34', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#35', { identity: 'Pipeline straight variant', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#36', { identity: 'Pipeline fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#37', { identity: 'Pipeline end fitting', role: 'transport-part', confidence: 'consensus' }],
  ['Texture 02.png#38', { identity: 'Pipeline elbow variant', role: 'transport-part', confidence: 'consensus' }],
]);

/*
 * 알파 연결 성분은 의미 자산과 일대일이 아니다. 흰 설치 범위 코너처럼 본체와 떨어진 픽셀은
 * 별도 성분으로 검출된다. 아래 그룹은 시트에서 명백히 같은 자산에 속하는 성분만 결합한다.
 */
const compositeGroups = new Map([
  ['Sheet_00.png#10', ['Sheet_00.png#11', 'Sheet_00.png#12', 'Sheet_00.png#14', 'Sheet_00.png#15']],
  ['Sheet_00.png#13', ['Sheet_00.png#19']],
  ['Sheet_01.png#8', ['Sheet_01.png#19', 'Sheet_01.png#20']],
]);
const childToParent = new Map(
  [...compositeGroups].flatMap(([parent, children]) => children.map((child) => [child, parent])),
);

const candidates = [];
for (const sheet of analysis.sheets ?? []) {
  for (const candidate of sheet.candidates ?? []) {
    const key = `${sheet.source}#${candidate.id}`;
    const approved = approvedByKey.get(key);
    const override = roleOverrides.get(key);
    const identified = Boolean(approved);
    const parent = childToParent.get(key);
    candidates.push({
      id: key,
      sheet: sheet.source,
      candidateId: candidate.id,
      detectedBoxPx: candidate.bboxPx,
      componentRole: parent ? 'occupancy-frame-marker' : 'primary-or-standalone',
      parentGroupId: parent ? parent.replace('#', '#group-') : null,
      identityStatus: parent ? 'component' : identified ? 'identified' : override?.identityStatus ?? (override ? 'role-identified' : 'unidentified'),
      identity: parent ? 'Occupancy frame corner marker' : approved?.assetId ?? override?.identity ?? null,
      assetId: approved?.assetId ?? null,
      buildingClasses: approved?.buildingClass
        ? [approved.buildingClass]
        : approved?.sharedBuildingClasses ?? override?.buildingClasses ?? [],
      role: approved?.role ?? override?.role ?? null,
      variant: override?.variant ?? null,
      approvedCropPx: approved?.cropPx ?? null,
      confidence: parent ? 'verified' : identified ? 'verified' : override?.confidence ?? 'unsourced',
      sources: [
        'anders-assets-2023',
        identified ? 'src/data/curated/topview-assets.json' : 'scripts/analyze-topview-sheets.py',
      ],
      openQuestion: parent || identified || override?.identityStatus === 'class-identified'
        ? null
        : override?.variant === 'direction-unverified'
          ? '실제 게임 배치와 대조해 상·하단 및 입·출력 방향 의미를 확정한다.'
          : override
            ? '정확한 게임 클래스·Mk·방향·조합 역할을 확정한다.'
            : '번호가 나타내는 게임 클래스 또는 작도 보조 요소를 식별한다.',
    });
  }
}

const total = candidates.length;
const mappedApproved = candidates.filter((entry) => entry.assetId).length;
if (total !== 91 || mappedApproved !== approvedByKey.size) {
  console.error(`후보/승인 매핑 불일치: total=${total}, mapped=${mappedApproved}, approved=${approvedByKey.size}`);
  process.exit(2);
}

const byId = new Map(candidates.map((entry) => [entry.id, entry]));
const groups = candidates.filter((entry) => !childToParent.has(entry.id)).map((root) => {
  const componentIds = [root.id, ...(compositeGroups.get(root.id) ?? [])];
  if (componentIds.some((id) => !byId.has(id))) {
    console.error(`복합 그룹 성분 누락: ${root.id}`);
    process.exit(2);
  }
  return {
    id: root.id.replace('#', '#group-'),
    sheet: root.sheet,
    primaryComponentId: root.id,
    componentIds,
    identityStatus: root.identityStatus,
    identity: root.identity,
    assetId: root.assetId,
    buildingClasses: root.buildingClasses,
    role: root.role,
    variant: root.variant,
    confidence: root.confidence,
    sources: root.sources,
    openQuestion: root.openQuestion,
  };
});

const catalog = {
  $schemaVersion: 2,
  $source: {
    id: 'anders-assets-2023',
    author: 'AndersPottemager',
    archiveUrl: source.download,
    archiveSha256: '400A20946B4049078388D26261C0A3E83B87BD7E04E5D423A2B0756C73452BAC',
    sheetSizePx: { width: 4096, height: 4096 },
    analysisMethod: analysis.method,
  },
  $counts: {
    detectedComponents: total,
    semanticGroups: groups.length,
    identifiedGroups: groups.filter((entry) => entry.identityStatus === 'identified').length,
    classIdentifiedGroups: groups.filter((entry) => entry.identityStatus === 'class-identified').length,
    roleIdentifiedGroups: groups.filter((entry) => entry.identityStatus === 'role-identified').length,
    unidentifiedGroups: groups.filter((entry) => entry.identityStatus === 'unidentified').length,
  },
  components: candidates,
  groups,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify(catalog.$counts));
