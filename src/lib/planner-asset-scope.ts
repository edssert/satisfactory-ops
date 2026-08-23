/** 생성된 설계 자산 범위를 정렬·표시하는 순수 유틸리티다. 범위 자체는 생성 데이터가 결정한다. */

export type PlannerAssetTarget = {
  buildingClass: string;
  plannerKind: string;
  representation: string;
  statusMode: string;
  unlockTier: number | null;
};

export const PLANNER_ASSET_KIND_ORDER: Readonly<Record<string, number>> = {
  extractor: 0,
  generator: 1,
  facility: 2,
  belt: 3,
  lift: 4,
  pipeline: 5,
  hypertube: 6,
  'logistics-device': 7,
  'logistics-support': 8,
  storage: 9,
  transport: 10,
  rail: 11,
  foundation: 12,
  'foundation-slope': 13,
};

const EARLY_TIER_ASSET_ORDER: Readonly<Record<string, number>> = {
  Build_MinerMk1_C: 0,
  Build_GeneratorBiomass_Automated_C: 1,
  Build_ConstructorMk1_C: 2,
  Build_SmelterMk1_C: 3,
  Build_ConveyorBeltMk1_C: 4,
  Build_ConveyorPole_C: 5,
  Build_StorageContainerMk1_C: 6,
};

export function comparePlannerAssetTargets(left: PlannerAssetTarget, right: PlannerAssetTarget): number {
  return (left.unlockTier ?? 99) - (right.unlockTier ?? 99)
    || (EARLY_TIER_ASSET_ORDER[left.buildingClass] ?? 99) - (EARLY_TIER_ASSET_ORDER[right.buildingClass] ?? 99)
    || (PLANNER_ASSET_KIND_ORDER[left.plannerKind] ?? 99) - (PLANNER_ASSET_KIND_ORDER[right.plannerKind] ?? 99)
    || left.buildingClass.localeCompare(right.buildingClass, 'en');
}

export function requiresOperationalStateAssets(target: PlannerAssetTarget): boolean {
  return target.statusMode === 'production-indicator-4-state';
}

const COMPOSED_REPRESENTATIONS = new Set([
  'foundation-piece',
  'foundation-slope',
  'parametric-belt',
  'parametric-lift',
  'parametric-pipeline',
  'parametric-hypertube',
  'parametric-rail',
  'support-attachment',
  'opening-attachment',
  'rail-attachment',
]);

/** 별도 래스터 탑뷰가 필요한 고정 설비·부착물만 자산 제작 대상으로 삼는다. */
export function requiresRasterTopview(target: PlannerAssetTarget): boolean {
  return !COMPOSED_REPRESENTATIONS.has(target.representation);
}
