/**
 * 공장 편집기의 영속 상태 경계.
 *
 * MachineSpec은 현재 게임 데이터에서 다시 결합하고, 사용자가 만든 위치·운전 설정·물류 경로는
 * JSON에 기록한 값을 그대로 왕복한다. 가져오기 과정에서 경로를 다시 계산하지 않는다.
 */
import type {
  FoundationTile,
  MachineSpec,
  Placement,
  QuarterTurn,
  RailRoute,
  TransportRoute,
  Vec3,
} from './types';
import { transportSpecForFlow } from './transport-specs.ts';

export interface StoredPlacement {
  id: string;
  buildingClass: string;
  positionM: Vec3;
  rotation: QuarterTurn;
  operation?: Placement['operation'];
}

export interface StoredPlan {
  schemaVersion: 6;
  placements: StoredPlacement[];
  foundations: FoundationTile[];
  transports: TransportRoute[];
  rails: RailRoute[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVec3(value: unknown): value is Vec3 {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<Vec3>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y) && isFiniteNumber(point.z);
}

function hasStoredPlanShape(value: unknown): value is Omit<StoredPlan, 'schemaVersion'> & { schemaVersion: number } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredPlan>;
  return Array.isArray(candidate.placements)
    && Array.isArray(candidate.foundations)
    && Array.isArray(candidate.transports)
    && candidate.placements.every((entry) => (
      typeof entry?.id === 'string'
      && typeof entry.buildingClass === 'string'
      && isVec3(entry.positionM)
      && [0, 90, 180, 270].includes(entry.rotation)
    ))
    && candidate.foundations.every((tile) => (
      typeof tile?.id === 'string'
      && isFiniteNumber(tile.xM)
      && isFiniteNumber(tile.yM)
      && isFiniteNumber(tile.zM)
      && isFiniteNumber(tile.sizeM)
      && tile.sizeM > 0
    ))
    && candidate.transports.every((route) => (
      typeof route?.id === 'string'
      && typeof route.from?.placementId === 'string'
      && typeof route.from?.portId === 'string'
      && typeof route.to?.placementId === 'string'
      && typeof route.to?.portId === 'string'
      && (route.medium === 'solid' || route.medium === 'fluid')
      && typeof route.itemId === 'string'
      && isFiniteNumber(route.flowPerMinute)
      && isFiniteNumber(route.capacityPerMinute)
      && Array.isArray(route.pathM)
      && route.pathM.every(isVec3)
    ));
}

export function isStoredPlan(value: unknown): value is StoredPlan {
  if (!hasStoredPlanShape(value) || value.schemaVersion !== 6) return false;
  return value.transports.every((route) => typeof route.transportClass === 'string' && route.transportClass.length > 0)
    && Array.isArray(value.rails)
    && value.rails.every((rail) => typeof rail?.id === 'string' && Array.isArray(rail.pathM) && rail.pathM.length >= 2 && rail.pathM.every(isVec3));
}

export function migrateStoredPlan(value: unknown): StoredPlan | null {
  if (isStoredPlan(value)) return structuredClone(value);
  if (!hasStoredPlanShape(value) || ![4, 5].includes(value.schemaVersion)) return null;
  const migrated: StoredPlan = {
    ...structuredClone(value),
    schemaVersion: 6,
    transports: value.transports.map((route) => {
      const spec = transportSpecForFlow(route.medium, route.flowPerMinute);
      return {
        ...route,
        transportClass: spec.buildingClass,
        capacityPerMinute: spec.capacityPerMinute,
      };
    }),
    rails: [],
  };
  return isStoredPlan(migrated) ? migrated : null;
}

export function toStoredPlan(
  placements: Placement[],
  foundations: FoundationTile[],
  transports: TransportRoute[],
  rails: RailRoute[] = [],
): StoredPlan {
  return {
    schemaVersion: 6,
    placements: placements.map(({ id, spec, positionM, rotation, operation }) => ({
      id,
      buildingClass: spec.buildingClass,
      positionM: structuredClone(positionM),
      rotation,
      operation: operation ? structuredClone(operation) : undefined,
    })),
    foundations: structuredClone(foundations),
    transports: structuredClone(transports),
    rails: structuredClone(rails),
  };
}

export function restoreStoredPlan(stored: StoredPlan, specs: ReadonlyMap<string, MachineSpec>) {
  const placements = stored.placements.map((entry) => {
    const spec = specs.get(entry.buildingClass);
    if (!spec) throw new Error(`현재 데이터에 없는 설비: ${entry.buildingClass}`);
    return {
      ...structuredClone(entry),
      spec,
    } satisfies Placement;
  });
  return {
    placements,
    foundations: structuredClone(stored.foundations),
    transports: structuredClone(stored.transports),
    rails: structuredClone(stored.rails),
  };
}

export function nextEditorSequence(stored: StoredPlan): number {
  return Math.max(
    1,
    ...[...stored.placements, ...stored.foundations, ...stored.transports, ...stored.rails]
      .map((entry) => Number(entry.id.split('-').at(-1)) + 1 || 1),
  );
}
