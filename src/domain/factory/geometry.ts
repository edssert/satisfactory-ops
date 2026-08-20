import type { Box3, FoundationTile, Placement, PortSpec, Vec3 } from './types.ts';

const EPSILON = 1e-6;

export function rotateQuarter(point: Vec3, rotation: Placement['rotation']): Vec3 {
  switch (rotation) {
    case 0: return { ...point };
    case 90: return { x: -point.y, y: point.x, z: point.z };
    case 180: return { x: -point.x, y: -point.y, z: point.z };
    case 270: return { x: point.y, y: -point.x, z: point.z };
  }
}

export function transformPoint(placement: Placement, point: Vec3): Vec3 {
  const rotated = rotateQuarter(point, placement.rotation);
  return {
    x: placement.positionM.x + rotated.x,
    y: placement.positionM.y + rotated.y,
    z: placement.positionM.z + rotated.z,
  };
}

export function transformBox(placement: Placement, box: Box3): Box3 {
  const corners = [
    { x: box.min.x, y: box.min.y, z: box.min.z },
    { x: box.min.x, y: box.max.y, z: box.min.z },
    { x: box.max.x, y: box.min.y, z: box.min.z },
    { x: box.max.x, y: box.max.y, z: box.min.z },
  ].map((point) => transformPoint(placement, point));
  return {
    min: {
      x: Math.min(...corners.map((point) => point.x)),
      y: Math.min(...corners.map((point) => point.y)),
      z: placement.positionM.z + box.min.z,
    },
    max: {
      x: Math.max(...corners.map((point) => point.x)),
      y: Math.max(...corners.map((point) => point.y)),
      z: placement.positionM.z + box.max.z,
    },
  };
}

export function boxesOverlap(a: Box3, b: Box3, toleranceM = 0.001): boolean {
  return (
    a.min.x < b.max.x - toleranceM && a.max.x > b.min.x + toleranceM
    && a.min.y < b.max.y - toleranceM && a.max.y > b.min.y + toleranceM
    && a.min.z < b.max.z - toleranceM && a.max.z > b.min.z + toleranceM
  );
}

export function portWorldPosition(placement: Placement, port: PortSpec): Vec3 {
  return transformPoint(placement, port.positionM);
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 겹치지 않는 파운데이션 타일이 박스 바닥을 덮는 면적을 계산한다. */
export function supportedArea(box: Box3, foundations: FoundationTile[]): number {
  return foundations
    .filter((tile) => Math.abs(tile.zM - box.min.z) <= EPSILON)
    .reduce((area, tile) => {
      const overlapWidth = Math.max(0, Math.min(box.max.x, tile.xM + tile.sizeM) - Math.max(box.min.x, tile.xM));
      const overlapLength = Math.max(0, Math.min(box.max.y, tile.yM + tile.sizeM) - Math.max(box.min.y, tile.yM));
      return area + overlapWidth * overlapLength;
    }, 0);
}

export function footprintArea(box: Box3): number {
  return (box.max.x - box.min.x) * (box.max.y - box.min.y);
}

