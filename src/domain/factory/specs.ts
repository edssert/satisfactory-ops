import buildingRows from '../../data/app/buildings.json' with { type: 'json' };
import plannerScope from '../../data/app/planner-asset-scope.json' with { type: 'json' };
import portRows from '../../data/curated/machine-ports.json' with { type: 'json' };
import type { Box3, MachineSpec, PortSpec, Vec3 } from './types.ts';

interface BuildingRow {
  id: string;
  ko: string;
  powerMW: number | null;
  footprint?: {
    boxes?: Array<{ xM: number; yM: number; zM: number; widthM: number; lengthM: number; heightM: number }>;
  };
}

interface PortRow {
  buildingClass: string;
  id: string;
  medium: PortSpec['medium'];
  direction: PortSpec['direction'];
  positionM: Vec3;
  sampleCount: number;
  maxDeviationM: number;
  confidence: PortSpec['confidence'];
}

function normalFromPosition(position: Vec3): Vec3 {
  if (Math.abs(position.x) > Math.abs(position.y)) {
    return { x: Math.sign(position.x), y: 0, z: 0 };
  }
  return { x: 0, y: Math.sign(position.y), z: 0 };
}

const ports = (portRows.ports as PortRow[]).reduce<Map<string, PortSpec[]>>((map, row) => {
  const list = map.get(row.buildingClass) ?? [];
  list.push({
    id: row.id,
    medium: row.medium,
    direction: row.direction,
    positionM: row.positionM,
    normal: normalFromPosition(row.positionM),
    confidence: row.confidence,
    sampleCount: row.sampleCount,
    maxDeviationM: row.maxDeviationM,
  });
  map.set(row.buildingClass, list);
  return map;
}, new Map());
const completeBuildings = new Set(portRows.$completeBuildings as string[]);
const footprintOverrides = new Map(plannerScope.targets
  .filter((target) => 'footprintOverride' in target)
  .map((target) => [target.buildingClass, target.footprintOverride]));

const specs = new Map((buildingRows as BuildingRow[]).map((row) => {
  const hardBoxes: Box3[] = (row.footprint?.boxes ?? []).map((box) => {
    const x2 = box.xM + box.widthM;
    const y2 = box.yM + box.lengthM;
    const z2 = box.zM + box.heightM;
    return {
      min: { x: Math.min(box.xM, x2), y: Math.min(box.yM, y2), z: Math.min(box.zM, z2) },
      max: { x: Math.max(box.xM, x2), y: Math.max(box.yM, y2), z: Math.max(box.zM, z2) },
    };
  });
  const override = footprintOverrides.get(row.id);
  if (!hardBoxes.length && override) {
    hardBoxes.push({
      min: { x: -override.widthM / 2, y: -override.lengthM / 2, z: 0 },
      max: { x: override.widthM / 2, y: override.lengthM / 2, z: override.heightM },
    });
  }
  const spec: MachineSpec = {
    buildingClass: row.id,
    name: row.ko,
    hardBoxes,
    ports: ports.get(row.id) ?? [],
    powerDemandMW: row.powerMW ?? 0,
  };
  return [row.id, spec] as const;
}));

export function getMachineSpec(buildingClass: string): MachineSpec | undefined {
  return specs.get(buildingClass);
}

export function requireMachineSpec(buildingClass: string): MachineSpec {
  const spec = getMachineSpec(buildingClass);
  if (!spec) throw new Error(`게임 데이터에 없는 설비 클래스: ${buildingClass}`);
  return spec;
}

export function drawingSupported(buildingClass: string): boolean {
  const spec = getMachineSpec(buildingClass);
  return Boolean(
    completeBuildings.has(buildingClass)
    && spec?.ports.length
    && spec.ports.every((port) => port.confidence === 'verified'),
  );
}
