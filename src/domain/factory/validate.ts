import { boxesOverlap, distance, footprintArea, portWorldPosition, supportedArea, transformBox } from './geometry.ts';
import type { FactoryPlan, Placement, PortReference, ValidationIssue, ValidationResult } from './types.ts';

const EPSILON = 1e-6;

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

export function validateFactoryPlan(plan: FactoryPlan): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = [
    ...plan.foundations.map((entry) => entry.id),
    ...plan.placements.map((entry) => entry.id),
    ...plan.transports.map((entry) => entry.id),
    ...plan.powerSources.map((entry) => entry.id),
    ...plan.powerEdges.map((entry) => entry.id),
  ];
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) issues.push(issue('DUPLICATE_ID', duplicateIds, '계획 안의 식별자는 중복될 수 없습니다.'));

  const placements = placementMap(plan);
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
    if (route.flowPerMinute > route.capacityPerMinute + EPSILON) {
      issues.push(issue('TRANSPORT_CAPACITY', [route.id], '구간 유량이 운송 수단의 용량을 초과합니다.', {
        flowPerMinute: route.flowPerMinute,
        capacityPerMinute: route.capacityPerMinute,
      }));
    }
    const outgoingKey = `${route.from.placementId}:${route.itemId}`;
    const incomingKey = `${route.to.placementId}:${route.itemId}`;
    outgoing.set(outgoingKey, (outgoing.get(outgoingKey) ?? 0) + route.flowPerMinute);
    incoming.set(incomingKey, (incoming.get(incomingKey) ?? 0) + route.flowPerMinute);
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
