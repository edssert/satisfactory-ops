import type { FactoryPlan, Medium, Placement, PortDirection, TransportRoute } from './types.ts';
import {
  buildDirectedMultiGraph,
  graphEndpointKey,
  type DirectedMultiGraph,
  type GraphBuildIssue,
  type GraphEdge,
  type GraphNode,
} from '../../lib/graph-core.ts';

export type TransportMedium = Exclude<Medium, 'power'>;

export interface FactoryGraphIssue {
  code:
    | GraphBuildIssue['code']
    | 'PORT_NOT_FOUND'
    | 'SOURCE_PORT_DIRECTION'
    | 'TARGET_PORT_DIRECTION'
    | 'PORT_MEDIUM'
    | 'PORT_ALREADY_CONNECTED';
  subjectId: string;
  endpoint?: 'from' | 'to';
}

export interface FactoryTransportProjection {
  medium: TransportMedium;
  graph: DirectedMultiGraph<Placement, TransportRoute>;
  issues: readonly FactoryGraphIssue[];
}

function accepts(direction: PortDirection, endpoint: 'from' | 'to'): boolean {
  return direction === 'bidirectional' || direction === (endpoint === 'from' ? 'output' : 'input');
}

/** FactoryPlan 정본을 바꾸지 않는 물류 전용 읽기 projection이다. */
export function projectFactoryTransports(
  plan: FactoryPlan,
  medium: TransportMedium,
): FactoryTransportProjection {
  const nodes: GraphNode<Placement>[] = plan.placements.map((placement) => ({
    id: placement.id,
    data: placement,
  }));
  const routes = plan.transports.filter((route) => route.medium === medium
    && !route.from.placementId.startsWith('manual:')
    && !route.to.placementId.startsWith('manual:'));
  const edges: GraphEdge<TransportRoute>[] = routes.map((route) => ({
    id: route.id,
    from: { nodeId: route.from.placementId, portId: route.from.portId },
    to: { nodeId: route.to.placementId, portId: route.to.portId },
    data: route,
  }));
  const built = buildDirectedMultiGraph(nodes, edges);
  const issues: FactoryGraphIssue[] = [...built.issues];

  for (const edge of built.graph.edgesById.values()) {
    for (const endpoint of ['from', 'to'] as const) {
      const reference = edge[endpoint];
      const placement = built.graph.nodesById.get(reference.nodeId)?.data;
      const port = placement?.spec.ports.find((candidate) => candidate.id === reference.portId);
      if (!port) {
        issues.push({ code: 'PORT_NOT_FOUND', subjectId: edge.id, endpoint });
        continue;
      }
      if (!accepts(port.direction, endpoint)) {
        issues.push({
          code: endpoint === 'from' ? 'SOURCE_PORT_DIRECTION' : 'TARGET_PORT_DIRECTION',
          subjectId: edge.id,
          endpoint,
        });
      }
      if (port.medium !== medium) {
        issues.push({ code: 'PORT_MEDIUM', subjectId: edge.id, endpoint });
      }
    }
  }

  for (const [endpointKey, edgeIds] of built.graph.edgesByEndpoint) {
    if (edgeIds.length > 1) {
      issues.push({ code: 'PORT_ALREADY_CONNECTED', subjectId: endpointKey });
    }
  }

  issues.sort((left, right) =>
    left.code.localeCompare(right.code, 'en') || left.subjectId.localeCompare(right.subjectId, 'en'));
  return { medium, graph: built.graph, issues };
}

export function connectedRouteIds(
  projection: FactoryTransportProjection,
  placementId: string,
  portId: string,
): readonly string[] {
  return projection.graph.edgesByEndpoint.get(graphEndpointKey({ nodeId: placementId, portId })) ?? [];
}
