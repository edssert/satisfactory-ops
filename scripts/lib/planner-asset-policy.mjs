/**
 * 게임 생성 건물과 자산 정책을 결합해 설계판 자산 완료 범위를 도출한다.
 * 표시 이름은 범위 판정에 쓰지 않고 클래스 ID, nativeClass, buildCost만 사용한다.
 */
import { createHash } from 'node:crypto';

function rowsById(rows, idKey, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label}는 배열이어야 합니다.`);
  const map = new Map();
  for (const row of rows) {
    const id = row?.[idKey];
    if (typeof id !== 'string' || !id) throw new TypeError(`${label}에 ${idKey}가 없는 행이 있습니다.`);
    if (map.has(id)) throw new Error(`${label} 클래스 중복: ${id}`);
    map.set(id, row);
  }
  return map;
}

function rulesByKey(rules, key, label) {
  if (!Array.isArray(rules)) throw new TypeError(`${label}는 배열이어야 합니다.`);
  const map = new Map();
  for (const rule of rules) {
    const value = rule?.[key];
    if (typeof value !== 'string' || !value) throw new TypeError(`${label}에 ${key}가 없는 규칙이 있습니다.`);
    if (map.has(value)) throw new Error(`${label} 규칙 중복: ${value}`);
    map.set(value, rule);
  }
  return map;
}

function validateIncludeRule(rule, owner) {
  if (typeof rule.plannerKind !== 'string' || !rule.plannerKind) {
    throw new TypeError(`${owner}: plannerKind가 없습니다.`);
  }
  if (typeof rule.representation !== 'string' || !rule.representation) {
    throw new TypeError(`${owner}: representation이 없습니다.`);
  }
}

function validatePolicy(policy) {
  if (!policy || policy.$schemaVersion !== 1) throw new Error('planner asset policy schemaVersion은 1이어야 합니다.');
  if (!Number.isInteger(policy.buildCl) || policy.buildCl <= 0 || typeof policy.gameBuild !== 'string') {
    throw new Error('planner asset policy의 게임 빌드 식별자가 잘못됐습니다.');
  }
  if (policy.confidence !== 'verified' || !policy.source || policy.eligibility?.requiresBuildCost !== true) {
    throw new Error('planner asset policy의 출처·신뢰도·buildCost 계약이 잘못됐습니다.');
  }

  const includeNative = rulesByKey(policy.include?.nativeClasses, 'nativeClass', 'include.nativeClasses');
  const includeClasses = rulesByKey(policy.include?.classOverrides, 'buildingClass', 'include.classOverrides');
  const excludeNative = rulesByKey(policy.exclude?.nativeClasses, 'nativeClass', 'exclude.nativeClasses');
  const implicitNative = rulesByKey(policy.implicitPowerNetwork?.nativeClasses, 'nativeClass', 'implicitPowerNetwork.nativeClasses');
  const excludeClasses = rulesByKey(policy.exclude?.classOverrides, 'buildingClass', 'exclude.classOverrides');
  for (const [key, rule] of includeNative) {
    validateIncludeRule(rule, `include.nativeClasses/${key}`);
    if (excludeNative.has(key)) throw new Error(`nativeClass 포함·제외 충돌: ${key}`);
    if (implicitNative.has(key)) throw new Error(`nativeClass 포함·자동연결 충돌: ${key}`);
  }
  for (const [key, rule] of includeClasses) {
    validateIncludeRule(rule, `include.classOverrides/${key}`);
    if (excludeClasses.has(key)) throw new Error(`buildingClass 포함·제외 충돌: ${key}`);
  }
  for (const [key, rule] of implicitNative) {
    validateIncludeRule(rule, `implicitPowerNetwork.nativeClasses/${key}`);
    if (excludeNative.has(key)) throw new Error(`nativeClass 자동연결·제외 충돌: ${key}`);
  }

  const patterns = (policy.exclude?.classPatterns ?? []).map((rule, index) => {
    if (typeof rule.nativeClass !== 'string' || typeof rule.buildingClassPattern !== 'string' || !rule.reason) {
      throw new TypeError(`exclude.classPatterns[${index}] 계약이 잘못됐습니다.`);
    }
    return { rule, regex: new RegExp(rule.buildingClassPattern) };
  });
  const indicatorClasses = new Set(policy.productionIndicatorClasses ?? []);
  if (indicatorClasses.size !== (policy.productionIndicatorClasses ?? []).length) {
    throw new Error('productionIndicatorClasses에 중복 클래스가 있습니다.');
  }
  const footprintOverrides = rulesByKey(policy.footprintOverrides ?? [], 'buildingClass', 'footprintOverrides');
  for (const [id, row] of footprintOverrides) {
    if (![row.widthM, row.lengthM, row.heightM].every((value) => Number.isFinite(value) && value > 0)
        || row.confidence !== 'verified' || !row.source) {
      throw new Error(`footprintOverrides/${id}: 크기·출처·신뢰도 오류`);
    }
  }
  return { includeNative, includeClasses, implicitNative, excludeNative, excludeClasses, patterns, indicatorClasses, footprintOverrides };
}

function sourceMetadata(policy) {
  return {
    buildCl: policy.buildCl,
    gameBuild: policy.gameBuild,
    source: policy.source,
    confidence: policy.confidence,
  };
}

function includedRow(id, raw, app, rule, matchedBy, policy, rules) {
  return {
    buildingClass: id,
    nativeClass: raw.nativeClass,
    plannerKind: rule.plannerKind,
    representation: rule.representation,
    statusMode: rules.indicatorClasses.has(id) ? 'production-indicator-4-state' : 'single-state',
    unlockTier: app.unlockTier ?? null,
    category: app.category ?? null,
    scopeSource: matchedBy,
    confidence: policy.confidence,
    ...(rules.footprintOverrides.has(id) ? { footprintOverride: rules.footprintOverrides.get(id) } : {}),
  };
}

function implicitPowerRow(id, raw, app, rule, policy) {
  return {
    buildingClass: id,
    nativeClass: raw.nativeClass,
    plannerKind: rule.plannerKind,
    representation: rule.representation,
    placementMode: policy.implicitPowerNetwork.placementMode,
    capabilities: policy.implicitPowerNetwork.capabilities,
    statusMode: 'single-state',
    unlockTier: app.unlockTier ?? null,
    category: app.category ?? null,
    reason: rule.reason,
    scopeSource: 'implicit-power-native',
    confidence: policy.confidence,
  };
}

function excludedRow(id, raw, rule, matchedBy, policy) {
  return {
    buildingClass: id,
    nativeClass: raw?.nativeClass ?? null,
    reason: rule?.reason ?? '정책에 포함 규칙이 없음',
    scopeSource: matchedBy,
    confidence: policy.confidence,
  };
}

/** 정렬된 클래스 ID를 줄바꿈으로 결합한 재현 가능한 SHA-256을 반환한다. */
export function sha256Ids(entries) {
  const ids = [...entries].map((entry) => typeof entry === 'string' ? entry : entry?.buildingClass);
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new TypeError('sha256Ids에는 클래스 ID가 필요합니다.');
  if (new Set(ids).size !== ids.length) throw new Error('sha256Ids 입력에 중복 클래스가 있습니다.');
  return createHash('sha256').update(ids.sort().join('\n')).digest('hex');
}

/**
 * buildCost가 있는 모든 앱 건물을 포함·제외·미분류로 완전 분할한다.
 * exclude class override/pattern은 포함 nativeClass보다 우선한다.
 */
export function derivePlannerAssetScope(rawBuildings, appBuildings, policy) {
  const rawById = rowsById(rawBuildings, 'className', 'rawBuildings');
  const appById = rowsById(appBuildings, 'id', 'appBuildings');
  const rules = validatePolicy(policy);
  const included = [];
  const excluded = [];
  const unclassified = [];
  const nonBuildable = [];
  const implicitPowerNetwork = [];

  for (const [id, app] of appById) {
    const raw = rawById.get(id);
    if (!Array.isArray(app.buildCost) || app.buildCost.length === 0) {
      nonBuildable.push({ buildingClass: id, nativeClass: raw?.nativeClass ?? null });
      continue;
    }
    if (!raw || typeof raw.nativeClass !== 'string' || !raw.nativeClass) {
      unclassified.push(excludedRow(id, raw, { reason: 'raw buildings nativeClass 누락' }, 'missing-raw-building', policy));
      continue;
    }

    const excludeClass = rules.excludeClasses.get(id);
    if (excludeClass) {
      excluded.push(excludedRow(id, raw, excludeClass, 'exclude-class', policy));
      continue;
    }
    const excludePattern = rules.patterns.find(({ rule, regex }) =>
      rule.nativeClass === raw.nativeClass && regex.test(id));
    if (excludePattern) {
      excluded.push(excludedRow(id, raw, excludePattern.rule, 'exclude-pattern', policy));
      continue;
    }

    const includeClass = rules.includeClasses.get(id);
    if (includeClass) {
      included.push(includedRow(id, raw, app, includeClass, 'include-class', policy, rules));
      continue;
    }
    const includeNative = rules.includeNative.get(raw.nativeClass);
    if (includeNative) {
      included.push(includedRow(id, raw, app, includeNative, 'include-native', policy, rules));
      continue;
    }
    const excludeNative = rules.excludeNative.get(raw.nativeClass);
    const implicitNative = rules.implicitNative.get(raw.nativeClass);
    if (implicitNative) {
      implicitPowerNetwork.push(implicitPowerRow(id, raw, app, implicitNative, policy));
      continue;
    }
    if (excludeNative) {
      excluded.push(excludedRow(id, raw, excludeNative, 'exclude-native', policy));
      continue;
    }
    unclassified.push(excludedRow(id, raw, null, 'unclassified', policy));
  }

  for (const id of rules.indicatorClasses) {
    if (!included.some((row) => row.buildingClass === id)) {
      throw new Error(`ProductionIndicator 클래스가 포함 범위에 없습니다: ${id}`);
    }
  }

  const byId = (left, right) => left.buildingClass.localeCompare(right.buildingClass, 'en');
  included.sort(byId);
  excluded.sort(byId);
  unclassified.sort(byId);
  nonBuildable.sort(byId);
  implicitPowerNetwork.sort(byId);
  const buildableCount = included.length + implicitPowerNetwork.length + excluded.length + unclassified.length;
  return {
    schemaVersion: 1,
    ...sourceMetadata(policy),
    included,
    excluded,
    implicitPowerNetwork,
    unclassified,
    nonBuildable,
    counts: {
      appBuildings: appById.size,
      rawBuildings: rawById.size,
      buildable: buildableCount,
      included: included.length,
      implicitPowerNetwork: implicitPowerNetwork.length,
      excluded: excluded.length,
      unclassified: unclassified.length,
      nonBuildable: nonBuildable.length,
      byPlannerKind: Object.fromEntries(
        [...Map.groupBy(included, (row) => row.plannerKind)]
          .map(([kind, rows]) => [kind, rows.length])
          .sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
      byRepresentation: Object.fromEntries(
        [...Map.groupBy(included, (row) => row.representation)]
          .map(([representation, rows]) => [representation, rows.length])
          .sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
      byStatusMode: Object.fromEntries(
        [...Map.groupBy(included, (row) => row.statusMode)]
          .map(([mode, rows]) => [mode, rows.length])
          .sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
    },
    hashes: {
      included: sha256Ids(included),
      implicitPowerNetwork: sha256Ids(implicitPowerNetwork),
      excluded: sha256Ids(excluded),
      buildablePartition: sha256Ids([...included, ...implicitPowerNetwork, ...excluded, ...unclassified]),
    },
  };
}
