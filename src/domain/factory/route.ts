/** 설비 하드 클리어런스를 피하는 1 m 직교 물류 라우터. */
import { rotateQuarter, transformBox } from './geometry.ts';
import { splitLongSegments } from './logistics.ts';
import type { Placement, PortSpec, Vec3 } from './types.ts';

interface Cell { x: number; y: number }

const key = (cell: Cell) => `${cell.x}:${cell.y}`;
const fromKey = (value: string): Cell => {
  const [x, y] = value.split(':').map(Number);
  return { x, y };
};
const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function simplify(points: Vec3[]): Vec3[] {
  const result: Vec3[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last && last.x === point.x && last.y === point.y && last.z === point.z) continue;
    if (result.length >= 2) {
      const before = result[result.length - 2];
      const middle = result[result.length - 1];
      const sameX = before.x === middle.x && middle.x === point.x && before.z === middle.z && middle.z === point.z;
      const sameY = before.y === middle.y && middle.y === point.y && before.z === middle.z && middle.z === point.z;
      const sameZAxis = before.x === middle.x && middle.x === point.x && before.y === middle.y && middle.y === point.y;
      if (sameX || sameY || sameZAxis) {
        result[result.length - 1] = point;
        continue;
      }
    }
    result.push(point);
  }
  return result;
}

/** 실제 포트와 바깥쪽 2 m 스텁을 보존하고, 그 사이만 격자 탐색한다. */
export function routeAroundMachines(
  fromPlacement: Placement,
  fromPort: PortSpec,
  toPlacement: Placement,
  toPort: PortSpec,
  allPlacements: Placement[],
  clearanceM = 1,
): Vec3[] {
  const start = {
    ...rotateQuarter(fromPort.positionM, fromPlacement.rotation),
    z: fromPlacement.positionM.z + fromPort.positionM.z,
  };
  start.x += fromPlacement.positionM.x;
  start.y += fromPlacement.positionM.y;
  const end = {
    ...rotateQuarter(toPort.positionM, toPlacement.rotation),
    z: toPlacement.positionM.z + toPort.positionM.z,
  };
  end.x += toPlacement.positionM.x;
  end.y += toPlacement.positionM.y;
  const fromNormal = rotateQuarter(fromPort.normal, fromPlacement.rotation);
  const toNormal = rotateQuarter(toPort.normal, toPlacement.rotation);
  const startStub = { x: start.x + fromNormal.x * 2, y: start.y + fromNormal.y * 2, z: start.z };
  const endStub = { x: end.x + toNormal.x * 2, y: end.y + toNormal.y * 2, z: end.z };
  const startCell = { x: Math.round(startStub.x), y: Math.round(startStub.y) };
  const endCell = { x: Math.round(endStub.x), y: Math.round(endStub.y) };

  const blocked = new Set<string>();
  for (const placement of allPlacements) {
    if (placement.id === fromPlacement.id || placement.id === toPlacement.id) continue;
    for (const box of placement.spec.hardBoxes.map((hardBox) => transformBox(placement, hardBox))) {
      for (let y = Math.floor(box.min.y - clearanceM); y <= Math.ceil(box.max.y + clearanceM); y += 1) {
        for (let x = Math.floor(box.min.x - clearanceM); x <= Math.ceil(box.max.x + clearanceM); x += 1) {
          blocked.add(key({ x, y }));
        }
      }
    }
  }
  blocked.delete(key(startCell));
  blocked.delete(key(endCell));

  const margin = 32;
  const minX = Math.min(startCell.x, endCell.x) - margin;
  const maxX = Math.max(startCell.x, endCell.x) + margin;
  const minY = Math.min(startCell.y, endCell.y) - margin;
  const maxY = Math.max(startCell.y, endCell.y) + margin;
  const open = new Set([key(startCell)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map([[key(startCell), 0]]);
  const fScore = new Map([[key(startCell), manhattan(startCell, endCell)]]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

  while (open.size) {
    const currentKey = [...open].reduce((best, candidate) => (
      (fScore.get(candidate) ?? Infinity) < (fScore.get(best) ?? Infinity) ? candidate : best
    ));
    if (currentKey === key(endCell)) {
      const cells: Cell[] = [endCell];
      let walk = currentKey;
      while (cameFrom.has(walk)) {
        walk = cameFrom.get(walk)!;
        cells.push(fromKey(walk));
      }
      cells.reverse();
      const horizontal = simplify([
        start,
        startStub,
        ...cells.map((cell) => ({ x: cell.x, y: cell.y, z: start.z })),
        { ...endStub, z: start.z },
      ]);
      const withLift = Math.abs(start.z - end.z) > 1e-6
        ? [...horizontal, endStub, end]
        : [...horizontal, end];
      return splitLongSegments(simplify(withLift));
    }
    open.delete(currentKey);
    const current = fromKey(currentKey);
    const previous = cameFrom.get(currentKey);
    const previousCell = previous ? fromKey(previous) : undefined;
    for (const [dx, dy] of directions) {
      const neighbor = { x: current.x + dx, y: current.y + dy };
      const neighborKey = key(neighbor);
      if (neighbor.x < minX || neighbor.x > maxX || neighbor.y < minY || neighbor.y > maxY || blocked.has(neighborKey)) continue;
      const changedDirection = previousCell
        ? (current.x - previousCell.x !== dx || current.y - previousCell.y !== dy)
        : false;
      const turnPenalty = changedDirection ? .18 : 0;
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1 + turnPenalty;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + manhattan(neighbor, endCell));
      open.add(neighborKey);
    }
  }

  // 탐색 범위를 벗어난 경우에도 포트 끝점은 정확히 보존한다.
  const middleY = Math.round(((startStub.y + endStub.y) / 2) * 10) / 10;
  const fallback = [
    start,
    startStub,
    { x: startStub.x, y: middleY, z: start.z },
    { x: endStub.x, y: middleY, z: start.z },
    ...(Math.abs(start.z - end.z) > 1e-6 ? [{ ...endStub, z: start.z }, endStub] : [endStub]),
    end,
  ];
  return splitLongSegments(simplify(fallback));
}
