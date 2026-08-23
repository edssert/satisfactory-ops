import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  buildDirectedMultiGraph,
  hasDirectedPath,
  stronglyConnectedComponents,
  topologicalOrder,
  type GraphEdge,
  type GraphNode,
} from '../src/lib/graph-core.ts';
import { connectedRouteIds, projectFactoryTransports } from '../src/domain/factory/graph.ts';
import type { FactoryPlan, MachineSpec, Placement, TransportRoute } from '../src/domain/factory/types.ts';

const nodes = (count: number): GraphNode<null>[] =>
  Array.from({ length: count }, (_, index) => ({ id: `n${index}`, data: null }));

const edge = (id: string, from: string, to: string): GraphEdge<null> => ({
  id,
  from: { nodeId: from },
  to: { nodeId: to },
  data: null,
});

test('임의 DAG의 위상순서는 모든 간선 방향을 보존한다', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 80 }),
    fc.array(fc.tuple(fc.nat(79), fc.nat(79)), { maxLength: 240 }),
    (count, pairs) => {
      const unique = new Map<string, GraphEdge<null>>();
      for (const [rawLeft, rawRight] of pairs) {
        const left = rawLeft % count;
        const right = rawRight % count;
        if (left === right) continue;
        const from = Math.min(left, right);
        const to = Math.max(left, right);
        unique.set(`${from}>${to}`, edge(`e${from}-${to}`, `n${from}`, `n${to}`));
      }
      const graph = buildDirectedMultiGraph(nodes(count), unique.values()).graph;
      const order = topologicalOrder(graph);
      assert.ok(order);
      const position = new Map(order.map((id, index) => [id, index]));
      for (const current of graph.edgesById.values()) {
        assert.ok(position.get(current.from.nodeId)! < position.get(current.to.nodeId)!);
      }
    },
  ), { seed: 502094, numRuns: 250 });
});

test('긴 생산선과 순환을 재귀 없이 판별한다', () => {
  const count = 10_000;
  const chain = Array.from({ length: count - 1 }, (_, index) =>
    edge(`e${index}`, `n${index}`, `n${index + 1}`));
  const dag = buildDirectedMultiGraph(nodes(count), chain).graph;
  assert.equal(topologicalOrder(dag)?.length, count);
  assert.equal(hasDirectedPath(dag, 'n0', `n${count - 1}`), true);

  const cyclic = buildDirectedMultiGraph(nodes(count), [
    ...chain,
    edge('back', `n${count - 1}`, 'n0'),
  ]).graph;
  assert.equal(topologicalOrder(cyclic), null);
  assert.equal(stronglyConnectedComponents(cyclic)[0]?.length, count);
});

test('중복 ID와 dangling 끝점을 조용히 덮어쓰지 않는다', () => {
  const result = buildDirectedMultiGraph(
    [{ id: 'a', data: 1 }, { id: 'a', data: 2 }],
    [edge('same', 'a', 'missing'), edge('same', 'a', 'a')],
  );
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    'DANGLING_TARGET',
    'DUPLICATE_EDGE',
    'DUPLICATE_NODE',
  ]);
});

const machine = (id: string, direction: 'input' | 'output'): MachineSpec => ({
  buildingClass: id,
  name: id,
  hardBoxes: [],
  powerDemandMW: 0,
  ports: [{
    id: direction,
    medium: 'solid',
    direction,
    positionM: { x: 0, y: 0, z: 0 },
    normal: { x: direction === 'output' ? 1 : -1, y: 0, z: 0 },
    confidence: 'verified',
    sampleCount: 1,
    maxDeviationM: 0,
  }],
});

const placement = (id: string, direction: 'input' | 'output'): Placement => ({
  id,
  spec: machine(id, direction),
  positionM: { x: 0, y: 0, z: 0 },
  rotation: 0,
});

const route = (id: string, from: string, to: string): TransportRoute => ({
  id,
  from: { placementId: from, portId: 'output' },
  to: { placementId: to, portId: 'input' },
  medium: 'solid',
  itemId: 'item',
  flowPerMinute: 60,
  transportClass: 'Build_ConveyorBeltMk1_C',
  capacityPerMinute: 60,
  pathM: [],
});

test('설계판 projection은 실제 포트의 중복 연결을 검출하고 edge ID를 보존한다', () => {
  const plan: FactoryPlan = {
    schemaVersion: 1,
    id: 'fixture',
    foundations: [],
    placements: [placement('source', 'output'), placement('a', 'input'), placement('b', 'input')],
    transports: [route('route-a', 'source', 'a'), route('route-b', 'source', 'b')],
    powerSources: [],
    powerEdges: [],
  };
  const projection = projectFactoryTransports(plan, 'solid');
  assert.deepEqual(connectedRouteIds(projection, 'source', 'output'), ['route-a', 'route-b']);
  assert.deepEqual(
    projection.issues.filter((issue) => issue.code === 'PORT_ALREADY_CONNECTED'),
    [{ code: 'PORT_ALREADY_CONNECTED', subjectId: 'source\u0000output' }],
  );
});
