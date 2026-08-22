/**
 * 목적별 그래프 projection이 공유하는 최소 방향 다중 그래프 코어다.
 * 제품 정본을 대체하지 않으며, 검증·진단을 위해 매번 새로 만든다.
 */

export interface GraphEndpoint {
  nodeId: string;
  portId?: string;
}

export interface GraphNode<NodeData = unknown> {
  id: string;
  data: NodeData;
}

export interface GraphEdge<EdgeData = unknown> {
  id: string;
  from: GraphEndpoint;
  to: GraphEndpoint;
  data: EdgeData;
}

export interface GraphBuildIssue {
  code: 'DUPLICATE_NODE' | 'DUPLICATE_EDGE' | 'DANGLING_SOURCE' | 'DANGLING_TARGET';
  subjectId: string;
}

export interface DirectedMultiGraph<NodeData = unknown, EdgeData = unknown> {
  nodesById: ReadonlyMap<string, GraphNode<NodeData>>;
  edgesById: ReadonlyMap<string, GraphEdge<EdgeData>>;
  incomingByNode: ReadonlyMap<string, readonly string[]>;
  outgoingByNode: ReadonlyMap<string, readonly string[]>;
  edgesByEndpoint: ReadonlyMap<string, readonly string[]>;
}

export interface GraphBuildResult<NodeData = unknown, EdgeData = unknown> {
  graph: DirectedMultiGraph<NodeData, EdgeData>;
  issues: readonly GraphBuildIssue[];
}

export function graphEndpointKey(endpoint: GraphEndpoint): string {
  return endpoint.portId === undefined ? endpoint.nodeId : `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function append(index: Map<string, string[]>, key: string, edgeId: string): void {
  const values = index.get(key);
  if (values) values.push(edgeId);
  else index.set(key, [edgeId]);
}

function sortedIndex(index: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
  for (const values of index.values()) values.sort((left, right) => left.localeCompare(right, 'en'));
  return index;
}

export function buildDirectedMultiGraph<NodeData, EdgeData>(
  nodes: Iterable<GraphNode<NodeData>>,
  edges: Iterable<GraphEdge<EdgeData>>,
): GraphBuildResult<NodeData, EdgeData> {
  const nodesById = new Map<string, GraphNode<NodeData>>();
  const edgesById = new Map<string, GraphEdge<EdgeData>>();
  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();
  const edgesByEndpoint = new Map<string, string[]>();
  const issues: GraphBuildIssue[] = [];

  for (const node of nodes) {
    if (nodesById.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE', subjectId: node.id });
      continue;
    }
    nodesById.set(node.id, node);
    incomingByNode.set(node.id, []);
    outgoingByNode.set(node.id, []);
  }

  for (const edge of edges) {
    if (edgesById.has(edge.id)) {
      issues.push({ code: 'DUPLICATE_EDGE', subjectId: edge.id });
      continue;
    }
    edgesById.set(edge.id, edge);
    if (!nodesById.has(edge.from.nodeId)) {
      issues.push({ code: 'DANGLING_SOURCE', subjectId: edge.id });
    } else {
      append(outgoingByNode, edge.from.nodeId, edge.id);
    }
    if (!nodesById.has(edge.to.nodeId)) {
      issues.push({ code: 'DANGLING_TARGET', subjectId: edge.id });
    } else {
      append(incomingByNode, edge.to.nodeId, edge.id);
    }
    append(edgesByEndpoint, graphEndpointKey(edge.from), edge.id);
    append(edgesByEndpoint, graphEndpointKey(edge.to), edge.id);
  }

  issues.sort((left, right) =>
    left.code.localeCompare(right.code, 'en') || left.subjectId.localeCompare(right.subjectId, 'en'));
  return {
    graph: {
      nodesById,
      edgesById,
      incomingByNode: sortedIndex(incomingByNode),
      outgoingByNode: sortedIndex(outgoingByNode),
      edgesByEndpoint: sortedIndex(edgesByEndpoint),
    },
    issues,
  };
}

function adjacentNodeIds<NodeData, EdgeData>(
  graph: DirectedMultiGraph<NodeData, EdgeData>,
  nodeId: string,
  reverse: boolean,
): string[] {
  const edgeIds = reverse ? graph.incomingByNode.get(nodeId) : graph.outgoingByNode.get(nodeId);
  const values = (edgeIds ?? []).map((edgeId) => {
    const edge = graph.edgesById.get(edgeId)!;
    return reverse ? edge.from.nodeId : edge.to.nodeId;
  });
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

export function hasDirectedPath<NodeData, EdgeData>(
  graph: DirectedMultiGraph<NodeData, EdgeData>,
  fromId: string,
  toId: string,
): boolean {
  if (!graph.nodesById.has(fromId) || !graph.nodesById.has(toId)) return false;
  if (fromId === toId) return true;
  const seen = new Set([fromId]);
  const queue = [fromId];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of adjacentNodeIds(graph, queue[cursor]!, false)) {
      if (next === toId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** 순환이면 null, 아니면 결정적인 Kahn 순서를 돌려준다. 재귀를 쓰지 않는다. */
export function topologicalOrder<NodeData, EdgeData>(
  graph: DirectedMultiGraph<NodeData, EdgeData>,
): string[] | null {
  const inDegree = new Map<string, number>();
  for (const nodeId of graph.nodesById.keys()) inDegree.set(nodeId, 0);
  for (const edge of graph.edgesById.values()) {
    if (inDegree.has(edge.from.nodeId) && inDegree.has(edge.to.nodeId)) {
      inDegree.set(edge.to.nodeId, inDegree.get(edge.to.nodeId)! + 1);
    }
  }
  const ready = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const order: string[] = [];
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const nodeId = ready[cursor]!;
    order.push(nodeId);
    for (const edgeId of graph.outgoingByNode.get(nodeId) ?? []) {
      const targetId = graph.edgesById.get(edgeId)!.to.nodeId;
      const degree = inDegree.get(targetId);
      if (degree === undefined) continue;
      inDegree.set(targetId, degree - 1);
      if (degree === 1) ready.push(targetId);
    }
  }
  return order.length === graph.nodesById.size ? order : null;
}

/** Kosaraju를 반복형 DFS로 구현해 긴 생산선에서도 호출 스택을 쓰지 않는다. */
export function stronglyConnectedComponents<NodeData, EdgeData>(
  graph: DirectedMultiGraph<NodeData, EdgeData>,
): string[][] {
  const visited = new Set<string>();
  const finish: string[] = [];
  const nodeIds = [...graph.nodesById.keys()].sort((left, right) => left.localeCompare(right, 'en'));

  for (const root of nodeIds) {
    if (visited.has(root)) continue;
    const stack: Array<[string, boolean]> = [[root, false]];
    while (stack.length) {
      const [nodeId, expanded] = stack.pop()!;
      if (expanded) {
        finish.push(nodeId);
        continue;
      }
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      stack.push([nodeId, true]);
      const neighbors = adjacentNodeIds(graph, nodeId, false);
      for (let index = neighbors.length - 1; index >= 0; index--) {
        if (!visited.has(neighbors[index]!)) stack.push([neighbors[index]!, false]);
      }
    }
  }

  visited.clear();
  const components: string[][] = [];
  for (let index = finish.length - 1; index >= 0; index--) {
    const root = finish[index]!;
    if (visited.has(root)) continue;
    const component: string[] = [];
    const stack = [root];
    visited.add(root);
    while (stack.length) {
      const nodeId = stack.pop()!;
      component.push(nodeId);
      for (const next of adjacentNodeIds(graph, nodeId, true)) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    component.sort((left, right) => left.localeCompare(right, 'en'));
    components.push(component);
  }
  return components.sort((left, right) => left[0]!.localeCompare(right[0]!, 'en'));
}
