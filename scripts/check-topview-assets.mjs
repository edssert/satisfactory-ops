/**
 * 설계판 탑뷰 자산의 매니페스트·파일·출처·시각 프로파일을 검증한다.
 *
 * 사용:
 *   node scripts/check-topview-assets.mjs
 *   node scripts/check-topview-assets.mjs --strict-visual
 *
 * 종료 코드:
 *   0 구조 검증 통과
 *   2 매니페스트 또는 파일 구조 오류
 *   3 시각 프로파일 승인 미완료(--strict-visual)
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
const assetRoot = resolve(publicRoot, 'assets/planner/top-view');
const manifestPath = resolve(root, 'src/data/curated/topview-assets.json');
const candidateCatalogPath = resolve(root, 'src/data/curated/anders-topview-candidates.json');
const layoutCorpusPath = resolve(root, 'src/data/curated/anders-layout-corpus.json');
const redditArchivePath = resolve(root, 'src/data/curated/anders-reddit-posts.json');
const goldenCasesPath = resolve(root, 'scripts/topview/golden-cases.json');
const materialProfilePath = resolve(root, 'scripts/topview/satisfactory-material-profile.json');
const sceneRoot = resolve(root, 'scripts/topview/scenes');
const strictVisual = process.argv.includes('--strict-visual');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const candidateCatalog = JSON.parse(readFileSync(candidateCatalogPath, 'utf8'));
const layoutCorpus = JSON.parse(readFileSync(layoutCorpusPath, 'utf8'));
const redditArchive = JSON.parse(readFileSync(redditArchivePath, 'utf8'));
const goldenCases = JSON.parse(readFileSync(goldenCasesPath, 'utf8'));
const materialProfile = JSON.parse(readFileSync(materialProfilePath, 'utf8'));
const sceneRecipes = readdirSync(sceneRoot)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ path: resolve(sceneRoot, name), data: JSON.parse(readFileSync(resolve(sceneRoot, name), 'utf8')) }));
const errors = [];
const warnings = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

if (manifest.$schemaVersion !== 3) errors.push(`schemaVersion: ${manifest.$schemaVersion}`);
const ids = new Set();
const assetsById = new Map();
const paths = new Set();
const usedFiles = new Set();
const buildingProfiles = new Map();
const allowedRoles = new Set(['building', 'foundation', 'transport-part', 'transport-direction', 'golden-reference']);
const allowedReview = new Set(['candidate', 'approved', 'rejected', 'superseded']);
const sha256Pattern = /^[0-9a-f]{64}$/;

for (const asset of manifest.assets) {
  if (!asset.assetId || ids.has(asset.assetId)) errors.push(`중복 또는 빈 assetId: ${asset.assetId}`);
  ids.add(asset.assetId);
  assetsById.set(asset.assetId, asset);
  if (!allowedRoles.has(asset.role)) errors.push(`${asset.assetId}: role=${asset.role}`);
  if (!allowedReview.has(asset.reviewStatus)) errors.push(`${asset.assetId}: reviewStatus=${asset.reviewStatus}`);
  if (!manifest.$sources[asset.sourceId]) errors.push(`${asset.assetId}: sourceId=${asset.sourceId}`);
  if (!asset.derivation || !asset.visualProfile) errors.push(`${asset.assetId}: 파생·시각 프로파일 누락`);
  if (!asset.path?.startsWith('assets/planner/top-view/') || asset.path.includes('..') || !asset.path.endsWith('.webp')) {
    errors.push(`${asset.assetId}: 잘못된 path=${asset.path}`);
    continue;
  }
  if (paths.has(asset.path)) errors.push(`중복 path: ${asset.path}`);
  paths.add(asset.path);
  const absolute = resolve(publicRoot, asset.path);
  if (!absolute.startsWith(`${assetRoot}${sep}`)) errors.push(`${asset.assetId}: 경로 이탈`);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) errors.push(`${asset.assetId}: 파일 누락 ${asset.path}`);
  else {
    usedFiles.add(absolute);
    const sha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    if (asset.sha256 && asset.sha256 !== sha256) errors.push(`${asset.assetId}: SHA-256 불일치`);
    process.stdout.write(`  ${asset.assetId.padEnd(44)} ${sha256.slice(0, 12)}  ${asset.reviewStatus}\n`);
  }
  if (asset.hardFootprintM && (![asset.hardFootprintM.width, asset.hardFootprintM.length].every(Number.isFinite) ||
      asset.hardFootprintM.width <= 0 || asset.hardFootprintM.length <= 0)) {
    errors.push(`${asset.assetId}: hardFootprintM 오류`);
  }
  if (asset.occupancyFrame) {
    const { x, y, width, height } = asset.occupancyFrame;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        x + width > 1.001 || y + height > 1.001) errors.push(`${asset.assetId}: occupancyFrame 오류`);
  }
  if (asset.statusImages) {
    for (const state of ['active', 'activeWithCrystal', 'standby', 'error']) {
      const variant = asset.statusImages[state];
      if (!variant?.path?.startsWith('assets/planner/top-view/') || !sha256Pattern.test(variant?.sha256 ?? '')) {
        errors.push(`${asset.assetId}: 상태 자산 ${state} 계약 오류`);
        continue;
      }
      const variantPath = resolve(publicRoot, variant.path);
      if (!existsSync(variantPath)) errors.push(`${asset.assetId}: 상태 자산 ${state} 파일 누락 ${variant.path}`);
      else {
        usedFiles.add(variantPath);
        const variantHash = createHash('sha256').update(readFileSync(variantPath)).digest('hex');
        if (variantHash !== variant.sha256) errors.push(`${asset.assetId}: 상태 자산 ${state} SHA-256 불일치`);
      }
    }
  }
  if (asset.buildingClass && asset.role === 'building') {
    buildingProfiles.set(asset.buildingClass, asset.visualProfile);
  }
}

if (candidateCatalog.$schemaVersion !== 2) errors.push(`Anders 후보 schemaVersion: ${candidateCatalog.$schemaVersion}`);
if (candidateCatalog.$counts?.detectedComponents !== 91 || candidateCatalog.components?.length !== 91) {
  errors.push(`Anders 연결 성분 수: counts=${candidateCatalog.$counts?.detectedComponents}, rows=${candidateCatalog.components?.length}`);
}
const candidateIds = new Set();
const candidateStatuses = new Set(['identified', 'class-identified', 'role-identified', 'unidentified', 'component']);
const candidateConfidence = new Set(['verified', 'consensus', 'disputed', 'unsourced']);
for (const candidate of candidateCatalog.components ?? []) {
  if (!candidate.id || candidateIds.has(candidate.id)) errors.push(`Anders 후보 중복/빈 id: ${candidate.id}`);
  candidateIds.add(candidate.id);
  if (candidate.id !== `${candidate.sheet}#${candidate.candidateId}`) errors.push(`${candidate.id}: sheet/candidateId 불일치`);
  if (!candidateStatuses.has(candidate.identityStatus)) errors.push(`${candidate.id}: identityStatus=${candidate.identityStatus}`);
  if (!candidateConfidence.has(candidate.confidence)) errors.push(`${candidate.id}: confidence=${candidate.confidence}`);
  const box = candidate.detectedBoxPx;
  if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
    errors.push(`${candidate.id}: detectedBoxPx 오류`);
  }
  if (!Array.isArray(candidate.sources) || !candidate.sources.length) errors.push(`${candidate.id}: sources 누락`);
  if (candidate.identityStatus === 'component' && (!candidate.parentGroupId || candidate.componentRole !== 'occupancy-frame-marker')) {
    errors.push(`${candidate.id}: 복합 성분의 parentGroupId/componentRole 누락`);
  }
  if (candidate.identityStatus === 'identified' && (!candidate.assetId || !ids.has(candidate.assetId))) {
    errors.push(`${candidate.id}: 승인 assetId 불일치 ${candidate.assetId}`);
  }
  if (candidate.identityStatus === 'identified' && assetsById.get(candidate.assetId)?.reviewStatus === 'rejected') {
    errors.push(`${candidate.id}: 거절된 자산을 identified로 사용 ${candidate.assetId}`);
  }
  if (['role-identified', 'unidentified'].includes(candidate.identityStatus) && !candidate.openQuestion) errors.push(`${candidate.id}: openQuestion 누락`);
}

if (candidateCatalog.$counts?.semanticGroups !== 84 || candidateCatalog.groups?.length !== 84) {
  errors.push(`Anders 의미 그룹 수: counts=${candidateCatalog.$counts?.semanticGroups}, rows=${candidateCatalog.groups?.length}`);
}
const groupIds = new Set();
const assignedComponents = new Set();
for (const group of candidateCatalog.groups ?? []) {
  if (!group.id || groupIds.has(group.id)) errors.push(`Anders 그룹 중복/빈 id: ${group.id}`);
  groupIds.add(group.id);
  if (!Array.isArray(group.componentIds) || !group.componentIds.length || !group.componentIds.includes(group.primaryComponentId)) {
    errors.push(`${group.id}: componentIds/primaryComponentId 오류`);
    continue;
  }
  for (const componentId of group.componentIds) {
    if (!candidateIds.has(componentId)) errors.push(`${group.id}: 없는 성분 ${componentId}`);
    if (assignedComponents.has(componentId)) errors.push(`${group.id}: 중복 소속 성분 ${componentId}`);
    assignedComponents.add(componentId);
  }
  if (group.identityStatus === 'identified' && (!group.assetId || !ids.has(group.assetId))) {
    errors.push(`${group.id}: 승인 assetId 불일치 ${group.assetId}`);
  }
  if (['role-identified', 'unidentified'].includes(group.identityStatus) && !group.openQuestion) errors.push(`${group.id}: openQuestion 누락`);
}
if (assignedComponents.size !== candidateIds.size) errors.push(`Anders 그룹 미소속 성분: ${candidateIds.size - assignedComponents.size}건`);
const countedGroups = {
  identifiedGroups: (candidateCatalog.groups ?? []).filter((entry) => entry.identityStatus === 'identified').length,
  classIdentifiedGroups: (candidateCatalog.groups ?? []).filter((entry) => entry.identityStatus === 'class-identified').length,
  roleIdentifiedGroups: (candidateCatalog.groups ?? []).filter((entry) => entry.identityStatus === 'role-identified').length,
  unidentifiedGroups: (candidateCatalog.groups ?? []).filter((entry) => entry.identityStatus === 'unidentified').length,
};
for (const [key, value] of Object.entries(countedGroups)) {
  if (candidateCatalog.$counts?.[key] !== value) errors.push(`Anders 그룹 집계 ${key}: ${candidateCatalog.$counts?.[key]} != ${value}`);
}

if (layoutCorpus.$schemaVersion !== 2) errors.push(`Anders 도면 코퍼스 schemaVersion: ${layoutCorpus.$schemaVersion}`);
const corpusSourceIds = new Set();
for (const source of layoutCorpus.sources ?? []) {
  if (!source.id || corpusSourceIds.has(source.id)) errors.push(`Anders 도면 출처 중복/빈 id: ${source.id}`);
  corpusSourceIds.add(source.id);
  if (!source.kind || !source.status || !source.rightsStatus) errors.push(`${source.id}: 출처 종류/상태/권리 누락`);
}

const mediaIds = new Set();
const corpusHashes = new Map();
const registerCorpusHash = (hash, owner) => {
  if (!sha256Pattern.test(hash ?? '')) errors.push(`${owner}: SHA-256 오류`);
  const previous = corpusHashes.get(hash);
  if (previous) errors.push(`${owner}: SHA-256 중복 ${previous}`);
  else corpusHashes.set(hash, owner);
};
for (const media of layoutCorpus.media ?? []) {
  if (!media.id || mediaIds.has(media.id)) errors.push(`Anders 도면 매체 중복/빈 id: ${media.id}`);
  mediaIds.add(media.id);
  if (!media.role || !media.mimeType) errors.push(`${media.id}: role/mimeType 누락`);
  for (const sourceId of media.sourceIds ?? []) {
    if (!corpusSourceIds.has(sourceId)) errors.push(`${media.id}: 없는 출처 ${sourceId}`);
  }
  registerCorpusHash(media.sha256, media.id);
}

const layoutIds = new Set();
for (const layout of layoutCorpus.layouts ?? []) {
  if (!layout.id || layoutIds.has(layout.id)) errors.push(`Anders 도면 중복/빈 id: ${layout.id}`);
  layoutIds.add(layout.id);
  if (!layout.id?.startsWith('layout:')) errors.push(`${layout.id}: 안정 ID 접두사 오류`);
  if (!layout.title || !layout.layoutAuthor || !layout.assetAuthor) errors.push(`${layout.id}: 제목/제작자 누락`);
  if (!Number.isInteger(layout.widthPx) || layout.widthPx <= 0 || !Number.isInteger(layout.heightPx) || layout.heightPx <= 0) {
    errors.push(`${layout.id}: 픽셀 크기 오류`);
  }
  if (!Array.isArray(layout.sourceIds) || !layout.sourceIds.length) errors.push(`${layout.id}: sourceIds 누락`);
  for (const sourceId of layout.sourceIds ?? []) {
    if (!corpusSourceIds.has(sourceId)) errors.push(`${layout.id}: 없는 출처 ${sourceId}`);
  }
  registerCorpusHash(layout.sha256, layout.id);
  for (const [index, variant] of (layout.observedVariants ?? []).entries()) {
    if (!Number.isInteger(variant.widthPx) || variant.widthPx <= 0 || !Number.isInteger(variant.heightPx) || variant.heightPx <= 0 || !variant.relation) {
      errors.push(`${layout.id}: observedVariants[${index}] 오류`);
    }
    registerCorpusHash(variant.sha256, `${layout.id}.observedVariants[${index}]`);
  }
  if (layout.titleStatus === 'descriptive-placeholder' && layout.confidence === 'verified') {
    errors.push(`${layout.id}: 임시 제목을 verified로 둘 수 없음`);
  }
}

if (redditArchive.$schemaVersion !== 1) errors.push(`Anders Reddit 색인 schemaVersion: ${redditArchive.$schemaVersion}`);
const redditPostIds = new Set();
const redditMediaIds = new Set();
let archivedRedditMedia = 0;
let unavailableRedditMedia = 0;
for (const post of redditArchive.posts ?? []) {
  if (!post.id || redditPostIds.has(post.id)) errors.push(`Anders Reddit 게시물 중복/빈 id: ${post.id}`);
  redditPostIds.add(post.id);
  if (!post.id?.startsWith('reddit:') || !post.redditId || !post.title || !post.role || !post.permalink) {
    errors.push(`${post.id}: 게시물 식별·제목·역할·URL 누락`);
  }
  for (const media of post.media ?? []) {
    if (!media.id || redditMediaIds.has(media.id)) errors.push(`Anders Reddit 매체 중복/빈 id: ${media.id}`);
    redditMediaIds.add(media.id);
    if (!media.sourceUri || !Number.isInteger(media.widthPx) || media.widthPx <= 0 || !Number.isInteger(media.heightPx) || media.heightPx <= 0) {
      errors.push(`${media.id}: 원본 URI/픽셀 크기 오류`);
    }
    if (media.availability === 'archived') {
      archivedRedditMedia += 1;
      if (!sha256Pattern.test(media.sha256 ?? '')) errors.push(`${media.id}: 보관 매체 SHA-256 오류`);
    } else if (media.availability === 'unavailable') {
      unavailableRedditMedia += 1;
      if (media.sha256 !== null) errors.push(`${media.id}: 미확보 매체에 SHA-256 존재`);
    } else errors.push(`${media.id}: availability=${media.availability}`);
  }
}
if (redditArchive.counts?.posts !== redditPostIds.size || redditArchive.counts?.media !== redditMediaIds.size ||
    redditArchive.counts?.archivedMedia !== archivedRedditMedia || redditArchive.counts?.unavailableMedia !== unavailableRedditMedia) {
  errors.push('Anders Reddit 색인 집계 불일치');
}

for (const asset of manifest.assets.filter((entry) => entry.sourceId === 'anders-2023')) {
  const source = manifest.$sources[asset.sourceId];
  const candidateKey = `${asset.sheet ?? source.sheet}#${asset.candidateId}`;
  if (!candidateIds.has(candidateKey)) errors.push(`${asset.assetId}: Anders 후보 카탈로그 누락 ${candidateKey}`);
}

if (goldenCases.$schemaVersion !== 1 || !Array.isArray(goldenCases.cases) || !goldenCases.cases.length) {
  errors.push('골든 사례 스키마/행 누락');
} else {
  for (const golden of goldenCases.cases) {
    const asset = manifest.assets.find((entry) => entry.assetId === golden.assetId);
    if (!asset || asset.role !== 'golden-reference' || asset.reviewStatus !== 'approved') {
      errors.push(`${golden.id}: 승인 golden-reference asset 불일치`);
    }
    if (resolve(root, golden.reference) !== resolve(publicRoot, asset?.path ?? '')) {
      errors.push(`${golden.id}: reference 경로 불일치`);
    }
    const current = golden.currentGameFootprintM;
    if (!current || current.width / current.length !== current.ratio) errors.push(`${golden.id}: 현재 실축 비율 오류`);
    const reference = golden.referenceFramePx;
    if (!reference || Math.abs(reference.width / reference.height - reference.ratio) > 1e-9) {
      errors.push(`${golden.id}: 골든 프레임 비율 오류`);
    }
    for (const control of golden.currentGameControls ?? []) {
      if (!control.id || !control.view || !Number.isInteger(control.width) || control.width <= 0 ||
          !Number.isInteger(control.height) || control.height <= 0 || !sha256Pattern.test(control.sha256 ?? '')) {
        errors.push(`${golden.id}: 현재 게임 대조 이미지 메타데이터 오류 ${control.id}`);
      }
    }
    if (golden.controlProjection !== 'perspective' || golden.metricMeasurement !== false ||
        !golden.controlUse?.includes('assembly-error-detection')) {
      errors.push(`${golden.id}: 인게임 원근 대조군 사용 범위 오류`);
    }
  }
}

if (materialProfile.$schemaVersion !== 1 || materialProfile.grid?.columns !== 3 || materialProfile.grid?.rows !== 3 ||
    materialProfile.cells?.length !== 9) errors.push('Satisfactory 재질 프로파일 3×3 스키마 오류');
for (const cell of materialProfile.cells ?? []) {
  if (!/^#[0-9a-f]{6}$/i.test(cell.color ?? '') ||
      ![cell.metallic, cell.roughness, cell.emission].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    errors.push(`재질 셀 오류 ${cell.row}:${cell.column}`);
  }
}

const confidenceValues = new Set(['verified', 'consensus', 'disputed', 'unsourced']);
const featureStatuses = new Set(['present', 'present-but-projection-pending', 'present-but-material-pending', 'pending-final-validation', 'pending-vat', 'pending-isometric']);
for (const recipeEntry of sceneRecipes) {
  const recipe = recipeEntry.data;
  if (recipe.$schemaVersion !== 1 || !recipe.id || !recipe.buildingClass) {
    errors.push(`${relative(root, recipeEntry.path)}: 장면 레시피 식별/스키마 오류`);
    continue;
  }
  const footprint = recipe.footprint;
  if (!footprint || ![footprint.widthM, footprint.lengthM, footprint.heightM].every((value) => Number.isFinite(value) && value > 0) ||
      !confidenceValues.has(footprint.confidence) || footprint.cornerEnvelope !== 'game-hard-clearance') {
    errors.push(`${recipe.id}: 실축 점유영역 오류`);
  }
  const componentIds = new Set();
  let enabledBodies = 0;
  for (const component of recipe.components ?? []) {
    if (!component.id || componentIds.has(component.id)) errors.push(`${recipe.id}: 구성품 중복/빈 ID ${component.id}`);
    componentIds.add(component.id);
    if (!['body', 'production-indicator', 'metadata-only', 'excluded'].includes(component.renderMode)) {
      errors.push(`${recipe.id}/${component.id}: renderMode=${component.renderMode}`);
    }
    if (!confidenceValues.has(component.confidence)) errors.push(`${recipe.id}/${component.id}: confidence=${component.confidence}`);
    if (component.renderMode !== 'excluded' && component.enabled !== false) enabledBodies += component.renderMode === 'body' ? 1 : 0;
    const sourcePath = component.path ? resolve(root, component.path) : null;
    if (component.renderMode !== 'metadata-only' && sourcePath && !existsSync(sourcePath)) warnings.push(`${recipe.id}/${component.id}: 로컬 추출 메시 없음 ${component.path}`);
    if (component.renderMode !== 'excluded' && (!Array.isArray(component.transform) || component.transform.length !== 4 ||
        !component.transform.every(Number.isFinite))) {
      errors.push(`${recipe.id}/${component.id}: transform은 [x,y,z,yaw]여야 함`);
    }
    if (component.scale && (!Array.isArray(component.scale) || component.scale.length !== 3 ||
        !component.scale.every((value) => Number.isFinite(value) && value > 0))) {
      errors.push(`${recipe.id}/${component.id}: scale은 양수 [x,y,z]여야 함`);
    }
    if (component.renderMode === 'excluded' && !component.reason) errors.push(`${recipe.id}/${component.id}: 제외 근거 누락`);
  }
  if (!enabledBodies) errors.push(`${recipe.id}: 활성 본체 메시 없음`);
  for (const [channel, mappings] of Object.entries(recipe.materials ?? {})) {
    if (!['albedo', 'ao', 'normal', 'reflection', 'stateMask'].includes(channel)) continue;
    for (const [materialName, rawPath] of Object.entries(mappings)) {
      if (!materialName || typeof rawPath !== 'string') errors.push(`${recipe.id}: ${channel} 재질 매핑 오류`);
      else if (!existsSync(resolve(root, rawPath))) warnings.push(`${recipe.id}: ${channel}/${materialName} 로컬 텍스처 없음`);
    }
  }
  for (const [materialName, color] of Object.entries(recipe.materials?.baseColor ?? {})) {
    if (!materialName || !/^#[0-9a-f]{6}$/i.test(color)) errors.push(`${recipe.id}: baseColor/${materialName} 오류`);
  }
  for (const selector of recipe.materials?.emissiveGeometrySelectors ?? []) {
    if (!selector.id || !selector.material || !Number.isInteger(selector.expectedComponents) || selector.expectedComponents <= 0 ||
        !/^#[0-9a-f]{6}$/i.test(selector.color ?? '') || !Number.isFinite(selector.strength) || selector.strength <= 0) {
      errors.push(`${recipe.id}: 발광 기하 선택자 기본 필드 오류 ${selector.id}`);
    }
    for (const group of [selector.sizeM, selector.centerM]) {
      if (!group || ['x', 'y', 'z'].some((axis) => !Array.isArray(group[axis]) || group[axis].length !== 2 ||
          !group[axis].every(Number.isFinite) || group[axis][0] > group[axis][1])) {
        errors.push(`${recipe.id}: 발광 기하 선택자 범위 오류 ${selector.id}`);
      }
    }
  }
  for (const selector of recipe.materials?.opacityGeometrySelectors ?? []) {
    const opacityValue = selector.perComponentOpacity ?? selector.combinedOpacity;
    if (!selector.id || !selector.material || !Number.isInteger(selector.expectedComponents) || selector.expectedComponents <= 0 ||
        !Number.isFinite(opacityValue) || opacityValue < 0 || opacityValue >= 1 ||
        (selector.overlapLayers !== undefined && (!Number.isInteger(selector.overlapLayers) || selector.overlapLayers <= 0))) {
      errors.push(`${recipe.id}: 투과 기하 선택자 기본 필드 오류 ${selector.id}`);
    }
    for (const group of [selector.sizeM, selector.centerM]) {
      if (!group || ['x', 'y', 'z'].some((axis) => !Array.isArray(group[axis]) || group[axis].length !== 2 ||
          !group[axis].every(Number.isFinite) || group[axis][0] > group[axis][1])) {
        errors.push(`${recipe.id}: 투과 기하 선택자 범위 오류 ${selector.id}`);
      }
    }
  }
  const staticMaterialName = recipe.buildingClass === 'Build_SmelterMk1_C' ? 'MI_SmelterMk1_01' : 'MI_ConstructorMk1';
  if (!Array.isArray(recipe.materials?.normalOnly) || recipe.materials?.baseColor?.Decal_Normal !== recipe.materials?.baseColor?.[staticMaterialName]) {
    errors.push(`${recipe.id}: 지연 normal 데칼 중립 underlay 계약 누락`);
  }
  const featureIds = new Set();
  for (const feature of recipe.assemblyFeatures ?? []) {
    if (!feature.id || featureIds.has(feature.id)) errors.push(`${recipe.id}: 조립 특징 중복/빈 ID ${feature.id}`);
    featureIds.add(feature.id);
    if (feature.owner !== 'renderer' && !componentIds.has(feature.owner)) errors.push(`${recipe.id}/${feature.id}: 없는 owner ${feature.owner}`);
    if (!featureStatuses.has(feature.status)) errors.push(`${recipe.id}/${feature.id}: status=${feature.status}`);
  }
  const incomplete = (recipe.assemblyFeatures ?? []).filter((feature) => feature.status !== 'present');
  if (incomplete.length) warnings.push(`${recipe.id}: 골든 비교 게이트 미통과 ${incomplete.map((feature) => feature.id).join(', ')}`);
  for (const [groupName, checks] of [['materialChecks', recipe.materialChecks], ['cameraLightingChecks', recipe.cameraLightingChecks]]) {
    if (!Array.isArray(checks) || !checks.length) errors.push(`${recipe.id}: ${groupName} 누락`);
    const ids = new Set();
    for (const check of checks ?? []) {
      if (!check.id || ids.has(check.id) || !['present', 'pending'].includes(check.status)) errors.push(`${recipe.id}: ${groupName} 항목 오류 ${check.id}`);
      ids.add(check.id);
    }
    const pending = (checks ?? []).filter((check) => check.status !== 'present');
    if (pending.length) warnings.push(`${recipe.id}: ${groupName} 미완료 ${pending.map((check) => check.id).join(', ')}`);
  }
  const audit = recipe.pipelineAudit;
  if (audit?.repeatedDefectThreshold !== 2 || audit?.systemicDefectThreshold !== 1 || audit?.rawVatCandidateAllowed !== false ||
      !Array.isArray(audit?.requiredStages) || !audit.requiredStages.includes('view-feature-matrix')) {
    errors.push(`${recipe.id}: 반복 결함 파이프라인 감사 계약 오류`);
  }
  if (recipe.buildingClass === 'Build_SmelterMk1_C') {
    const controlIds = new Set((goldenCases.cases.find((entry) => entry.currentGameControls)?.currentGameControls ?? []).map((entry) => entry.id));
    const featureIdsForViews = new Set((recipe.assemblyFeatures ?? []).map((entry) => entry.id));
    const matrixControlIds = new Set();
    for (const view of recipe.validationViews ?? []) {
      if (!controlIds.has(view.controlId) || matrixControlIds.has(view.controlId) || !Array.isArray(view.requiredFeatures) || !view.requiredFeatures.length) {
        errors.push(`${recipe.id}: 뷰 검증 행렬 오류 ${view.controlId}`);
      }
      matrixControlIds.add(view.controlId);
      for (const featureId of view.requiredFeatures ?? []) if (!featureIdsForViews.has(featureId)) errors.push(`${recipe.id}/${view.controlId}: 없는 필수 특징 ${featureId}`);
    }
    if (matrixControlIds.size !== controlIds.size) errors.push(`${recipe.id}: 뷰 검증 행렬 ${matrixControlIds.size}/${controlIds.size}`);
  }
  for (const component of recipe.components ?? []) {
    if (component.vatPose?.status !== undefined && !['applied', 'base-pose-verified'].includes(component.vatPose.status)) {
      warnings.push(`${recipe.id}/${component.id}: Idle VAT 미적용으로 제품 후보 금지`);
    }
    if (component.vatPose?.status === 'base-pose-verified' &&
        (component.vatPose.basisCorrectionDeg !== 180 || component.vatPose.viewMatrixVerified !== true)) {
      errors.push(`${recipe.id}/${component.id}: VAT base pose 검증 증거 오류`);
    }
    if (component.vatPose?.status === 'applied') {
      const pose = component.vatPose;
      if (pose.lookupUvLayer !== 'UVMap.002' || pose.expectedGroups !== 7 || pose.allowQuaternionDeformation !== false ||
          !sha256Pattern.test(pose.positionDataSha256 ?? '') || !sha256Pattern.test(pose.rotationDataSha256 ?? '')) {
        errors.push(`${recipe.id}/${component.id}: Idle VAT 적용 증거 오류`);
      }
      for (const [pathKey, hashKey] of [['positionData', 'positionDataSha256'], ['rotationData', 'rotationDataSha256']]) {
        const absolute = resolve(root, pose[pathKey]);
        if (existsSync(absolute)) {
          const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
          if (actual !== pose[hashKey]) errors.push(`${recipe.id}/${component.id}: ${pathKey} SHA-256 불일치`);
        }
      }
    }
  }
  if (!['orthographic-top', 'orthographic-oblique'].includes(recipe.camera?.projection) || !Number.isFinite(recipe.camera?.frontTiltDeg)) {
    errors.push(`${recipe.id}: 카메라 투영 계약 오류`);
  }
  if (recipe.camera?.projection === 'orthographic-top' && recipe.camera.frontTiltDeg !== 0) {
    errors.push(`${recipe.id}: 런타임 수직 탑뷰는 frontTiltDeg=0이어야 함`);
  }
  if (recipe.buildingClass === 'Build_SmelterMk1_C' && (recipe.canonicalOrientation?.screenEdge !== 'bottom' || recipe.camera?.displayYawDeg !== 0 ||
      !recipe.canonicalOrientation?.authority?.includes('smelter-current-top'))) {
    errors.push(`${recipe.id}: 인게임 대조군 기반 canonical orientation 오류`);
  }
  if (recipe.referenceComparisonCamera &&
      (recipe.referenceComparisonCamera.projection !== 'orthographic-oblique' || !Number.isFinite(recipe.referenceComparisonCamera.frontTiltDeg) ||
       !Number.isFinite(recipe.referenceComparisonCamera.displayYawDeg))) {
    errors.push(`${recipe.id}: 연구용 사선 비교 카메라 계약 오류`);
  }
  if (typeof recipe.lighting?.groundAo !== 'boolean' || typeof recipe.lighting?.bloom !== 'boolean' ||
      (!recipe.lighting.groundAo && recipe.lighting.shadowMode !== 'alpha-near-and-wide-postprocess')) {
    errors.push(`${recipe.id}: 조명/AO 계약 오류`);
  }
  if (![recipe.lighting?.keyEnergy, recipe.lighting?.fillEnergy, recipe.lighting?.worldStrength].every((value) => Number.isFinite(value) && value >= 0) ||
      !Number.isFinite(recipe.lighting?.exposure)) errors.push(`${recipe.id}: 스튜디오 조명 수치 오류`);
}

for (const file of walk(assetRoot)) {
  if (!usedFiles.has(file)) errors.push(`매니페스트에 없는 런타임 자산: ${relative(publicRoot, file)}`);
}

const profileGroups = Map.groupBy([...buildingProfiles], ([, profile]) => profile);
const candidateBuildings = manifest.assets.filter((asset) => asset.role === 'building' && asset.reviewStatus !== 'approved');
const unidentifiedCandidates = candidateCatalog.groups.filter((candidate) => candidate.identityStatus === 'unidentified');
if (profileGroups.size > 1) warnings.push(`설비 visualProfile ${profileGroups.size}종 혼용: ${[...profileGroups.keys()].join(', ')}`);
if (candidateBuildings.length) warnings.push(`설비 승인 대기 ${candidateBuildings.length}건: ${candidateBuildings.map((asset) => asset.assetId).join(', ')}`);
if (unidentifiedCandidates.length) warnings.push(`Anders 후보 미식별 ${unidentifiedCandidates.length}건`);

if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
  process.exit(2);
}
for (const warning of warnings) process.stderr.write(`WARN  ${warning}\n`);
if (strictVisual && warnings.length) process.exit(3);
process.stdout.write(`PASS  탑뷰 ${manifest.assets.length}건 · 파일/출처/경로 구조 일치\n`);
process.stdout.write(`PASS  Blender 장면 레시피 ${sceneRecipes.length}건 · 구성품/재질/카메라/조명 계약 일치\n`);
process.stdout.write(`PASS  Anders 연결 성분 ${candidateCatalog.components.length}건 → 의미 자산 그룹 ${candidateCatalog.groups.length}건 · 소속/박스/식별 상태 일치\n`);
process.stdout.write(`PASS  Anders 도면 코퍼스 ${layoutCorpus.layouts.length}건 · 출처 ${layoutCorpus.sources.length}건 · 매체 ${layoutCorpus.media.length}건 · 해시/참조 일치\n`);
process.stdout.write(`PASS  Anders Reddit 원출처 ${redditPostIds.size}건 · 이미지 ${archivedRedditMedia}건 보관 · 미확보 ${unavailableRedditMedia}건 명시\n`);
process.stdout.write(`PASS  탑뷰 골든 ${goldenCases.cases.length}건 · 3×3 재질 셀 ${materialProfile.cells.length}건 · 스타일/현재 기하 분리\n`);
