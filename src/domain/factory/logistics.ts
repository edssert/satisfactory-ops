import type { Vec3 } from './types.ts';

/** 게임 건설 규칙. 근거는 docs/research/conveyor-geometry.md에 행별로 기록한다. */
export const BELT_MIN_SEGMENT_M = .5;
export const BELT_MAX_SEGMENT_M = 56;
export const BELT_MIN_TURN_RADIUS_M = 2;
export const BELT_MAX_INCLINE_DEG = 35;
export const LIFT_MIN_HEIGHT_M = 4;
export const LIFT_MAX_HEIGHT_M = 48;

export const segmentLength = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
export const isVerticalSegment = (a: Vec3, b: Vec3) => (
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) >= 1e-6
);

/** 56 m를 넘는 직선은 실제로 세울 수 있도록 중간 폴 지점으로 나눈다. */
export function splitLongSegments(points: Vec3[], maxM = BELT_MAX_SEGMENT_M): Vec3[] {
  if (points.length < 2) return points;
  const result = [points[0]];
  for (const end of points.slice(1)) {
    const start = result.at(-1)!;
    const length = segmentLength(start, end);
    const pieces = Math.max(1, Math.ceil(length / maxM));
    for (let part = 1; part <= pieces; part += 1) {
      const t = part / pieces;
      result.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      });
    }
  }
  return result;
}
