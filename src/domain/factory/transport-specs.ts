import buildingRows from '../../data/app/buildings.json' with { type: 'json' };
import type { TransportRoute } from './types.ts';

export interface TransportSpec {
  buildingClass: string;
  name: string;
  medium: TransportRoute['medium'];
  capacityPerMinute: number;
  mark: number;
}

const solidRows = buildingRows
  .filter((row) => /^Build_ConveyorBeltMk\d+_C$/.test(row.id) && row.beltItemsPerMinute)
  .sort((left, right) => (left.beltItemsPerMinute ?? 0) - (right.beltItemsPerMinute ?? 0));
const fluidRows = buildingRows
  .filter((row) => /^Build_Pipeline(?:MK2)?_C$/.test(row.id) && row.pipeFlowM3PerMinute)
  .sort((left, right) => (left.pipeFlowM3PerMinute ?? 0) - (right.pipeFlowM3PerMinute ?? 0));

export const transportSpecs: readonly TransportSpec[] = [
  ...solidRows.map((row, index) => ({
    buildingClass: row.id,
    name: row.ko,
    medium: 'solid' as const,
    capacityPerMinute: row.beltItemsPerMinute!,
    mark: index + 1,
  })),
  ...fluidRows.map((row, index) => ({
    buildingClass: row.id,
    name: row.ko,
    medium: 'fluid' as const,
    capacityPerMinute: row.pipeFlowM3PerMinute!,
    mark: index + 1,
  })),
];

const byClass = new Map(transportSpecs.map((spec) => [spec.buildingClass, spec]));

export function getTransportSpec(buildingClass: string): TransportSpec | undefined {
  return byClass.get(buildingClass);
}

export function transportSpecForFlow(medium: TransportRoute['medium'], flowPerMinute: number): TransportSpec {
  const candidates = transportSpecs.filter((spec) => spec.medium === medium);
  const required = Math.max(0, flowPerMinute);
  const spec = candidates.find((candidate) => candidate.capacityPerMinute >= required) ?? candidates.at(-1);
  if (!spec) throw new Error(`운송 규격이 없습니다: ${medium}`);
  return spec;
}

export function resolveTransportSpec(route: Pick<TransportRoute, 'medium' | 'flowPerMinute' | 'transportClass'>): TransportSpec {
  const stored = getTransportSpec(route.transportClass);
  return stored?.medium === route.medium ? stored : transportSpecForFlow(route.medium, route.flowPerMinute);
}
