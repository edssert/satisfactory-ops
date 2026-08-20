import buildingRows from '../../data/app/buildings.json' with { type: 'json' };
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

const specs = new Map((buildingRows as BuildingRow[]).map((row) => {
  const hardBoxes: Box3[] = (row.footprint?.boxes ?? []).map((box) => ({
    min: { x: box.xM, y: box.yM, z: box.zM },
    max: { x: box.xM + box.widthM, y: box.yM + box.lengthM, z: box.zM + box.heightM },
  }));
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
