import type { Vec3 } from './types.ts';

const EPSILON = 1e-6;

export interface TransportBeltPart {
  kind: 'belt';
  start: Vec3;
  end: Vec3;
  center: Vec3;
  lengthM: number;
  planarLengthM: number;
  slopeDeg: number;
  angleDeg: number;
}

export interface TransportLiftPart {
  kind: 'lift';
  start: Vec3;
  end: Vec3;
  x: number;
  y: number;
  lowZ: number;
  highZ: number;
  heightM: number;
}

export interface TransportTurnPart {
  kind: 'turn';
  at: Vec3;
  connectionA: { x: number; y: number };
  connectionB: { x: number; y: number };
  assetRotationDeg: 0 | 90 | 180 | 270;
  touchesIncline: boolean;
}

export interface TransportPathParts {
  belts: TransportBeltPart[];
  lifts: TransportLiftPart[];
  turns: TransportTurnPart[];
}

const direction = (x: number, y: number) => {
  if (Math.abs(x) >= Math.abs(y)) return { x: Math.sign(x), y: 0 };
  return { x: 0, y: Math.sign(y) };
};

function turnRotation(a: { x: number; y: number }, b: { x: number; y: number }): 0 | 90 | 180 | 270 {
  const keys = new Set([`${a.x}:${a.y}`, `${b.x}:${b.y}`]);
  if (keys.has('-1:0') && keys.has('0:-1')) return 0;
  if (keys.has('0:-1') && keys.has('1:0')) return 90;
  if (keys.has('1:0') && keys.has('0:1')) return 180;
  return 270;
}

/** 경로 점을 시공 가능한 평면 벨트·수직 리프트·90° 곡선 부품으로 분해한다. */
export function transportPathParts(points: Vec3[]): TransportPathParts {
  const belts: TransportBeltPart[] = [];
  const lifts: TransportLiftPart[] = [];
  const turns: TransportTurnPart[] = [];

  points.slice(1).forEach((end, index) => {
    const start = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const planarLengthM = Math.hypot(dx, dy);
    if (planarLengthM <= EPSILON && Math.abs(dz) > EPSILON) {
      lifts.push({
        kind: 'lift', start, end, x: end.x, y: end.y,
        lowZ: Math.min(start.z, end.z), highZ: Math.max(start.z, end.z), heightM: Math.abs(dz),
      });
      return;
    }
    if (planarLengthM <= EPSILON) return;
    belts.push({
      kind: 'belt', start, end,
      center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 },
      lengthM: Math.hypot(planarLengthM, dz),
      planarLengthM,
      slopeDeg: Math.atan2(Math.abs(dz), planarLengthM) * 180 / Math.PI,
      angleDeg: Math.atan2(dy, dx) * 180 / Math.PI,
    });
  });

  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1];
    const at = points[index];
    const after = points[index + 1];
    const a = direction(before.x - at.x, before.y - at.y);
    const b = direction(after.x - at.x, after.y - at.y);
    if ((!a.x && !a.y) || (!b.x && !b.y) || Math.abs(a.x * b.y - a.y * b.x) <= EPSILON) continue;
    turns.push({
      kind: 'turn', at, connectionA: a, connectionB: b,
      assetRotationDeg: turnRotation(a, b),
      touchesIncline: Math.abs(before.z - at.z) > EPSILON || Math.abs(after.z - at.z) > EPSILON,
    });
  }

  return { belts, lifts, turns };
}
