import { boxesOverlap, distance, footprintArea, portWorldPosition, supportedArea, transformBox } from './geometry.ts';
import {
  BELT_MAX_SEGMENT_M,
  BELT_MIN_SEGMENT_M,
  BELT_MIN_TURN_RADIUS_M,
  BELT_MAX_INCLINE_DEG,
  isVerticalSegment,
  LIFT_MAX_HEIGHT_M,
  LIFT_MIN_HEIGHT_M,
} from './logistics.ts';
import { transportPathParts } from './transport-geometry.ts';
import type { FactoryPlan, Placement, PortReference, ValidationIssue, ValidationResult } from './types.ts';

const EPSILON = 1e-6;

function segmentCrossesBox(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  clearanceM = 0.05,
): boolean {
  if (Math.max(a.z, b.z) < box.min.z - clearanceM || Math.min(a.z, b.z) > box.max.z + clearanceM) return false;
  const minX = box.min.x - clearanceM;
  const maxX = box.max.x + clearanceM;
  const minY = box.min.y - clearanceM;
  const maxY = box.max.y + clearanceM;
  if (Math.abs(a.x - b.x) <= EPSILON) {
    return a.x > minX && a.x < maxX && Math.max(a.y, b.y) > minY && Math.min(a.y, b.y) < maxY;
  }
  if (Math.abs(a.y - b.y) <= EPSILON) {
    return a.y > minY && a.y < maxY && Math.max(a.x, b.x) > minX && Math.min(a.x, b.x) < maxX;
  }
  return false;
}

function samePoint(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  return distance(a, b) <= .02;
}

/** 같은 높이에서 두 직교 운송 구간이 접속점 없이 교차하거나 겹치는지 판정한다. */
function transportSegmentsCross(
  a1: { x: number; y: number; z: number },
  a2: { x: number; y: number; z: number },
  b1: { x: number; y: number; z: number },
  b2: { x: number; y: number; z: number },
): boolean {
  if (Math.abs(a1.z - a2.z) > EPSILON || Math.abs(b1.z - b2.z) > EPSILON) return false;
  if (Math.abs(a1.z - b1.z) > .2) return false;
  const sharedEndpoint = [a1, a2].some((a) => [b1, b2].some((b) => samePoint(a, b)));
  if (sharedEndpoint) return false;

  const aVertical = Math.abs(a1.x - a2.x) <= EPSILON;
  const bVertical = Math.abs(b1.x - b2.x) <= EPSILON;
  const between = (value: number, left: number, right: number) => (
    value >= Math.min(left, right) - EPSILON && value <= Math.max(left, right) + EPSILON
  );
  if (aVertical !== bVertical) {
    const vertical = aVertical ? [a1, a2] : [b1, b2];
    const horizontal = aVertical ? [b1, b2] : [a1, a2];
    return between(vertical[0].x, horizontal[0].x, horizontal[1].x)
      && between(horizontal[0].y, vertical[0].y, vertical[1].y);
  }
  if (aVertical) {
    return Math.abs(a1.x - b1.x) <= EPSILON
      && Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y))
        < Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - EPSILON;
  }
  return Math.abs(a1.y - b1.y) <= EPSILON
    && Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x))
      < Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - EPSILON;
}

function placementMap(plan: FactoryPlan): Map<string, Placement> {
  return new Map(plan.placements.map((placement) => [placement.id, placement]));
}

function findPort(planPlacements: Map<string, Placement>, reference: PortReference) {
  const placement = planPlacements.get(reference.placementId);
  const port = placement?.spec.ports.find((entry) => entry.id === reference.portId);
  return placement && port ? { placement, port } : undefined;
}

function issue(
  code: ValidationIssue['code'],
  subjectIds: string[],
  message: string,
  detail?: ValidationIssue['detail'],
): ValidationIssue {
  return { code, severity: 'error', subjectIds, message, detail };
}

export interface FactoryValidationOptions {
  validatePower?: boolean;
}

export function validateFactoryPlan(plan: FactoryPlan, options: FactoryValidationOptions = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!plan.placements.length && !plan.foundations.length && !plan.transports.length && !(plan.rails?.length)) {
    issues.push(issue('EMPTY_PLAN', [plan.id], '설비가 하나도 없는 빈 판은 시공 도면으로 발행할 수 없습니다.'));
  }
  const ids = [
    ...plan.foundations.map((entry) => entry.id),
    ...plan.placements.map((entry) => entry.id),
    ...plan.transports.map((entry) => entry.id),
    ...(plan.rails ?? []).map((entry) => entry.id),
    ...plan.powerSources.map((entry) => entry.id),
    ...plan.powerEdges.map((entry) => entry.id),
  ];
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) issues.push(issue('DUPLICATE_ID', duplicateIds, '계획 안의 식별자는 중복될 수 없습니다.'));

  const placements = placementMap(plan);
  for (const rail of plan.rails ?? []) {
    const invalid = rail.pathM.length < 2
      || rail.pathM.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))
      || rail.pathM.slice(1).some((point, index) => distance(rail.pathM[index], point) <= EPSILON);
    if (invalid) issues.push(issue('RAIL_GEOMETRY', [rail.id], '철도 경로는 서로 다른 두 개 이상의 유효한 미터 좌표가 필요합니다.'));
  }
  for (const placement of plan.placements) {
    if (!placement.spec.ports.length || placement.spec.ports.some((port) => port.confidence !== 'verified')) {
      issues.push(issue(
        'PORT_DATA_MISSING',
        [placement.id],
        `${placement.spec.name}의 검증된 포트 좌표가 없어 도면을 발행할 수 없습니다.`,
      ));
    }
    for (const box of placement.spec.hardBoxes
      .map((entry) => transformBox(placement, entry))
      .filter((entry) => Math.abs(entry.min.z - placement.positionM.z) <= EPSILON)) {
      const requiredM2 = footprintArea(box);
      const supportedM2 = supportedArea(box, plan.foundations);
      if (supportedM2 + EPSILON < requiredM2) {
        issues.push(issue('FOUNDATION_SUPPORT', [placement.id], '설비 하드 클리어런스 바닥이 파운데이션에 완전히 지지되지 않습니다.', {
          requiredM2,
          supportedM2,
        }));
      }
    }
  }

  for (let left = 0; left < plan.placements.length; left += 1) {
    for (let right = left + 1; right < plan.placements.length; right += 1) {
      const a = plan.placements[left];
      const b = plan.placements[right];
      const collision = a.spec.hardBoxes.some((aBox) => b.spec.hardBoxes.some((bBox) => (
        boxesOverlap(transformBox(a, aBox), transformBox(b, bBox))
      )));
      if (collision) issues.push(issue('MACHINE_COLLISION', [a.id, b.id], '설비 하드 클리어런스가 겹칩니다.'));
    }
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const route of plan.transports) {
    const manual = route.from.placementId.startsWith('manual:') && route.to.placementId.startsWith('manual:');
    if (!manual) {
      const from = findPort(placements, route.from);
      const to = findPort(placements, route.to);
      if (!from || !to) {
        issues.push(issue('UNSUPPORTED_PORT', [route.id], '물류 경로가 존재하지 않는 설비 또는 포트를 참조합니다.'));
        continue;
      }
      if (from.port.direction !== 'output' || to.port.direction !== 'input') {
        issues.push(issue('PORT_DIRECTION', [route.id], '물류 경로는 출력 포트에서 입력 포트로 연결해야 합니다.'));
      }
      if (from.port.medium !== route.medium || to.port.medium !== route.medium) {
        issues.push(issue('PORT_MEDIUM', [route.id], '경로의 매체와 포트의 매체가 일치하지 않습니다.'));
      }
      const start = route.pathM.at(0);
      const end = route.pathM.at(-1);
      const expectedStart = portWorldPosition(from.placement, from.port);
      const expectedEnd = portWorldPosition(to.placement, to.port);
      if (!start || !end || distance(start, expectedStart) > 0.02 || distance(end, expectedEnd) > 0.02) {
        issues.push(issue('ROUTE_ENDPOINT', [route.id], '물류 경로 끝점이 실제 설비 포트 좌표에 접속하지 않습니다.'));
      }
    }
    const parts = transportPathParts(route.pathM);
    parts.lifts.forEach((part) => {
      if (route.medium !== 'solid') return;
      if (part.heightM < LIFT_MIN_HEIGHT_M - EPSILON || part.heightM > LIFT_MAX_HEIGHT_M + EPSILON) {
        issues.push(issue('LIFT_HEIGHT', [route.id], '컨베이어 리프트의 수직 높이는 4–48 m 범위여야 합니다.', { lengthM: part.heightM }));
      }
    });
    parts.belts.forEach((part) => {
      if (part.lengthM < BELT_MIN_SEGMENT_M - EPSILON || part.lengthM > BELT_MAX_SEGMENT_M + EPSILON) {
        issues.push(issue('ROUTE_SEGMENT_LENGTH', [route.id], '컨베이어 한 구간은 약 0.5–56 m 범위여야 합니다.', { lengthM: part.lengthM }));
      }
      if (part.slopeDeg > BELT_MAX_INCLINE_DEG + EPSILON) {
        issues.push(issue('ROUTE_INCLINE', [route.id], '컨베이어 경사는 35°를 넘을 수 없습니다.', { slopeDeg: part.slopeDeg }));
      }
    });
    if (parts.turns.some((part) => part.touchesIncline)) {
      issues.push(issue('ROUTE_TURN_INCLINE', [route.id], '컨베이어는 평면 회전을 마친 뒤 별도 구간에서 높이를 바꿔야 합니다.'));
    }
    for (let index = 1; index < route.pathM.length - 1; index += 1) {
      const before = route.pathM[index - 1];
      const middle = route.pathM[index];
      const after = route.pathM[index + 1];
      if (isVerticalSegment(before, middle) || isVerticalSegment(middle, after)) continue;
      const a = { x: middle.x - before.x, y: middle.y - before.y };
      const b = { x: after.x - middle.x, y: after.y - middle.y };
      const turns = Math.abs(a.x * b.y - a.y * b.x) > EPSILON;
      if (turns && Math.min(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y)) < BELT_MIN_TURN_RADIUS_M - EPSILON) {
        issues.push(issue('ROUTE_TURN_RADIUS', [route.id], '90° 꺾임 양쪽에 2 m 회전 반경을 만들 직선 길이가 부족합니다.'));
        break;
      }
    }
    const crossed = plan.placements.find((placement) => (
      placement.id !== route.from.placementId
      && placement.id !== route.to.placementId
      && placement.spec.hardBoxes.some((hardBox) => {
        const box = transformBox(placement, hardBox);
        return route.pathM.slice(1).some((point, index) => segmentCrossesBox(route.pathM[index], point, box));
      })
    ));
    if (crossed) {
      issues.push(issue('ROUTE_COLLISION', [route.id, crossed.id], '물류 경로가 다른 설비의 하드 클리어런스를 통과합니다.'));
    }
    if (route.flowPerMinute > route.capacityPerMinute + EPSILON) {
      issues.push(issue('TRANSPORT_CAPACITY', [route.id], '구간 유량이 운송 수단의 용량을 초과합니다.', {
        flowPerMinute: route.flowPerMinute,
        capacityPerMinute: route.capacityPerMinute,
      }));
    }
    if (!manual) {
      const outgoingKey = `${route.from.placementId}:${route.itemId}`;
      const incomingKey = `${route.to.placementId}:${route.itemId}`;
      outgoing.set(outgoingKey, (outgoing.get(outgoingKey) ?? 0) + route.flowPerMinute);
      incoming.set(incomingKey, (incoming.get(incomingKey) ?? 0) + route.flowPerMinute);
    }
  }

  for (let left = 0; left < plan.transports.length; left += 1) {
    for (let right = left + 1; right < plan.transports.length; right += 1) {
      const a = plan.transports[left];
      const b = plan.transports[right];
      const crossing = a.pathM.slice(1).some((aPoint, aIndex) => (
        b.pathM.slice(1).some((bPoint, bIndex) => transportSegmentsCross(
          a.pathM[aIndex], aPoint, b.pathM[bIndex], bPoint,
        ))
      ));
      if (crossing) {
        issues.push(issue(
          'ROUTE_CROSSING',
          [a.id, b.id],
          '같은 높이의 물류 경로가 접속 장치 없이 교차하거나 겹칩니다. 리프트·분배기·병합기 또는 별도 고도를 사용해야 합니다.',
        ));
      }
    }
  }

  for (const placement of plan.placements) {
    if (!placement.operation) continue;
    for (const [itemId, required] of Object.entries(placement.operation.inputRates)) {
      const actual = incoming.get(`${placement.id}:${itemId}`) ?? 0;
      if (Math.abs(actual - required) > EPSILON) {
        issues.push(issue('FLOW_BALANCE', [placement.id], '설비 입력 유량이 작업 조건과 일치하지 않습니다.', { itemId, required, actual }));
      }
    }
    for (const [itemId, produced] of Object.entries(placement.operation.outputRates)) {
      const actual = outgoing.get(`${placement.id}:${itemId}`) ?? 0;
      if (Math.abs(actual - produced) > EPSILON) {
        issues.push(issue('FLOW_BALANCE', [placement.id], '설비 출력 유량이 작업 조건과 일치하지 않습니다.', { itemId, produced, actual }));
      }
    }
  }

  if (options.validatePower === false) {
    return { publishable: !issues.some((entry) => entry.severity === 'error'), issues };
  }

  const graph = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  };
  plan.powerEdges.forEach((edge) => connect(edge.from, edge.to));
  const sourceById = new Map(plan.powerSources.map((source) => [source.id, source]));
  const visited = new Set<string>();
  for (const placement of plan.placements) {
    const demand = placement.operation?.powerDemandMW ?? placement.spec.powerDemandMW;
    if (demand <= 0 || visited.has(placement.id)) continue;
    const queue = [placement.id];
    const component = new Set<string>();
    while (queue.length) {
      const current = queue.shift();
      if (!current || component.has(current)) continue;
      component.add(current);
      visited.add(current);
      graph.get(current)?.forEach((neighbor) => queue.push(neighbor));
    }
    const sources = [...component].map((id) => sourceById.get(id)).filter(Boolean);
    if (!sources.length) {
      issues.push(issue('POWER_DISCONNECTED', [...component], '전력을 쓰는 설비가 발전원과 연결되지 않았습니다.'));
      continue;
    }
    const capacityMW = sources.reduce((sum, source) => sum + (source?.capacityMW ?? 0), 0);
    const demandMW = [...component]
      .map((id) => placements.get(id))
      .filter(Boolean)
      .reduce((sum, entry) => sum + (entry?.operation?.powerDemandMW ?? entry?.spec.powerDemandMW ?? 0), 0);
    if (demandMW > capacityMW + EPSILON) {
      issues.push(issue('POWER_CAPACITY', [...component], '전력망의 소비량이 공급 용량을 초과합니다.', { demandMW, capacityMW }));
    }
  }

  return { publishable: !issues.some((entry) => entry.severity === 'error'), issues };
}
