/** 도면 화면 맞춤과 파일 내보내기가 공유하는 실제 미터 좌표 경계. */
import { transformBox } from './geometry.ts';
import type { Box3, FoundationTile, Placement, Vec3 } from './types.ts';

export interface DrawingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function machineBounds(placement: Placement): Box3 {
  const local: Box3 = {
    min: {
      x: Math.min(...placement.spec.hardBoxes.map((box) => box.min.x)),
      y: Math.min(...placement.spec.hardBoxes.map((box) => box.min.y)),
      z: Math.min(...placement.spec.hardBoxes.map((box) => box.min.z)),
    },
    max: {
      x: Math.max(...placement.spec.hardBoxes.map((box) => box.max.x)),
      y: Math.max(...placement.spec.hardBoxes.map((box) => box.max.y)),
      z: Math.max(...placement.spec.hardBoxes.map((box) => box.max.z)),
    },
  };
  return transformBox(placement, local);
}

export function factoryDrawingBounds(
  placements: Placement[],
  foundations: FoundationTile[],
  transports: { pathM: Vec3[] }[],
  paddingM = 4,
): DrawingBounds | null {
  const boxes = placements.map(machineBounds);
  const points = [
    ...boxes.flatMap((box) => [box.min, box.max]),
    ...foundations.flatMap((tile) => [
      { x: tile.xM, y: tile.yM, z: tile.zM },
      { x: tile.xM + tile.sizeM, y: tile.yM + tile.sizeM, z: tile.zM },
    ]),
    ...transports.flatMap((route) => route.pathM),
  ];
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point.x)) - paddingM;
  const maxX = Math.max(...points.map((point) => point.x)) + paddingM;
  const minY = Math.min(...points.map((point) => point.y)) - paddingM;
  const maxY = Math.max(...points.map((point) => point.y)) + paddingM;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function drawingPixelSize(bounds: DrawingBounds, maxPixels = 8192, pixelsPerMeter = 96) {
  const scale = Math.min(pixelsPerMeter, maxPixels / bounds.width, maxPixels / bounds.height);
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}
