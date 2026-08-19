/**
 * flow.ts — 배치 계획을 **공정 흐름도**로 바꾼다.
 *
 * 참고한 도면 언어 (docs/research/layout-expert-techniques.md §6):
 *  - **품목별 색 구역**: 철광석 / 철 주괴 / 철봉 / 나사 처럼 중간재마다 구역을 나눈다
 *  - **split · merge를 독립 노드로** 그린다. 이게 없으면 벨트가 기계에 붙지 않는다
 *  - **모든 간선에 유량을 표기**한다. 숫자 없는 선은 도면이 아니다
 *  - 원자재는 왼쪽(채굴), 완제품은 오른쪽
 *  - 기계 노드에 **대수와 클럭**을 적는다
 *
 * 순수 모듈. DOM도 JSON도 모른다.
 */

import { mergersFor, splittersFor, type LayoutResult, type ModuleLayout } from './layout.ts';

export type FlowNodeKind = 'source' | 'split' | 'machine' | 'merge' | 'sink';

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  /** 화면에 적을 제목 */
  label: string;
  /** 보조 표기 (대수·유량·클럭) */
  sub?: string;
  /** 몇 번째 열인가 (0부터, 왼쪽이 원자재) */
  column: number;
  /** 열 안에서 몇 번째인가 */
  row: number;
  /** 이 노드가 속한 품목 구역 */
  zone: string;
  /** 기계 노드일 때만 */
  machines?: number;
  clockPercent?: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  itemKo: string;
  perMinute: number;
  /** 이 유량에 필요한 벨트 줄 수. 2 이상이면 한 줄로 못 나른다 */
  lines: number;
}

export interface FlowZone {
  key: string;
  label: string;
  column: number;
  columns: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  zones: FlowZone[];
  columns: number;
  rows: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * 배치 결과 → 흐름도.
 *
 * 열 구성: [원자재] → (split) → [기계] → (merge) → ... → [완제품]
 * 공정마다 3열(split · 기계 · merge)을 쓰고, 부속이 필요 없으면 그 열은 비워 둔다.
 */
export function buildFlow(plan: LayoutResult, beltPerMinute: number): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const zones: FlowZone[] = [];

  const rowOf = new Map<number, number>(); // column -> 다음 행
  const nextRow = (column: number): number => {
    const r = rowOf.get(column) ?? 0;
    rowOf.set(column, r + 1);
    return r;
  };

  const lines = (perMinute: number, isFluid = false): number =>
    isFluid ? 1 : Math.max(1, Math.ceil(perMinute / beltPerMinute - 1e-6));

  // 공정을 만드는 품목 → 그 공정의 merge(또는 기계) 노드 id
  const producerOut = new Map<string, string>();

  plan.modules.forEach((m, idx) => {
    const baseCol = idx * 3;
    zones.push({ key: m.key, label: m.producesKo, column: baseCol, columns: 3 });

    // ── 입력측: 외부 원자재는 source, 내부 생산은 앞 공정의 산출에서 온다
    const externalInputs = plan.externals.filter((e) => e.toKey === m.key);
    const internalInputs = plan.connections.filter((c) => c.toKey === m.key);

    const supplyIds: { id: string; itemKo: string; perMinute: number; isFluid: boolean }[] = [];

    for (const e of externalInputs) {
      const id = `src:${m.key}:${e.itemKo}`;
      nodes.push({
        id,
        kind: 'source',
        label: e.itemKo,
        sub: `${round(e.perMinute)}/분 채굴`,
        column: baseCol,
        row: nextRow(baseCol),
        zone: e.itemKo,
      });
      supplyIds.push({ id, itemKo: e.itemKo, perMinute: e.perMinute, isFluid: e.isFluid });
    }
    for (const c of internalInputs) {
      const from = producerOut.get(c.itemKo);
      if (from) supplyIds.push({ id: from, itemKo: c.itemKo, perMinute: c.perMinute, isFluid: false });
    }

    // ── 기계 노드 (대수가 많으면 묶어서 한 노드로, 대신 대수를 적는다)
    const machineId = `mch:${m.key}`;
    const machineRow = nextRow(baseCol + 1);
    nodes.push({
      id: machineId,
      kind: 'machine',
      label: m.machineKo,
      sub: `${m.machinesBuilt}대 · ${round(m.outputRatePerMinute)}/분`,
      column: baseCol + 1,
      row: machineRow,
      zone: m.producesKo,
      machines: m.machinesBuilt,
      clockPercent: 100,
    });

    // ── 공급측 스플리터: 기계가 2대 이상이면 반드시 필요하다
    const splitCount = splittersFor(m.machinesBuilt);
    for (const s of supplyIds) {
      if (splitCount > 0) {
        const splitId = `spl:${m.key}:${s.itemKo}`;
        nodes.push({
          id: splitId,
          kind: 'split',
          label: '분배기',
          sub: `${splitCount}개 · ${s.itemKo}`,
          column: baseCol,
          row: nextRow(baseCol),
          zone: m.producesKo,
        });
        edges.push({
          from: s.id,
          to: splitId,
          itemKo: s.itemKo,
          perMinute: round(s.perMinute),
          lines: lines(s.perMinute, s.isFluid),
        });
        edges.push({
          from: splitId,
          to: machineId,
          itemKo: s.itemKo,
          perMinute: round(s.perMinute),
          lines: lines(s.perMinute, s.isFluid),
        });
      } else {
        edges.push({
          from: s.id,
          to: machineId,
          itemKo: s.itemKo,
          perMinute: round(s.perMinute),
          lines: lines(s.perMinute, s.isFluid),
        });
      }
    }

    // ── 산출측 머저
    const mergeCount = mergersFor(m.machinesBuilt);
    let outId = machineId;
    if (mergeCount > 0) {
      const mergeId = `mrg:${m.key}`;
      nodes.push({
        id: mergeId,
        kind: 'merge',
        label: '병합기',
        sub: `${mergeCount}개`,
        column: baseCol + 2,
        row: nextRow(baseCol + 2),
        zone: m.producesKo,
      });
      edges.push({
        from: machineId,
        to: mergeId,
        itemKo: m.producesKo,
        perMinute: round(m.outputRatePerMinute),
        lines: lines(m.outputRatePerMinute),
      });
      outId = mergeId;
    }
    producerOut.set(m.producesKo, outId);
  });

  // ── 완제품 출구
  const last = plan.modules.at(-1);
  if (last) {
    const from = producerOut.get(last.producesKo)!;
    const col = plan.modules.length * 3;
    const sinkId = 'sink';
    nodes.push({
      id: sinkId,
      kind: 'sink',
      label: last.producesKo,
      sub: `${round(last.outputRatePerMinute)}/분 · 저장고`,
      column: col,
      row: nextRow(col),
      zone: last.producesKo,
    });
    edges.push({
      from,
      to: sinkId,
      itemKo: last.producesKo,
      perMinute: round(last.outputRatePerMinute),
      lines: lines(last.outputRatePerMinute),
    });
  }

  const columns = Math.max(1, ...nodes.map((n) => n.column + 1));
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1));
  return { nodes, edges, zones, columns, rows };
}

/** 흐름도 자기 검증 — 끊긴 간선, 유량 없는 간선, 떠 있는 노드를 잡는다. */
export function validateFlow(flow: FlowGraph): string[] {
  const ids = new Set(flow.nodes.map((n) => n.id));
  const problems: string[] = [];

  for (const e of flow.edges) {
    if (!ids.has(e.from)) problems.push(`간선 시작 노드 없음: ${e.from}`);
    if (!ids.has(e.to)) problems.push(`간선 끝 노드 없음: ${e.to}`);
    if (!(e.perMinute > 0)) problems.push(`유량 없는 간선: ${e.from} → ${e.to}`);
    if (!e.itemKo) problems.push(`품목 없는 간선: ${e.from} → ${e.to}`);
  }

  const connected = new Set<string>();
  for (const e of flow.edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  for (const n of flow.nodes) {
    if (!connected.has(n.id)) problems.push(`아무것과도 연결되지 않은 노드: ${n.id}`);
  }

  // 기계 노드는 반드시 입력과 출력을 가져야 한다
  for (const n of flow.nodes.filter((x) => x.kind === 'machine')) {
    if (!flow.edges.some((e) => e.to === n.id)) problems.push(`입력이 없는 기계: ${n.id}`);
    if (!flow.edges.some((e) => e.from === n.id)) problems.push(`출력이 없는 기계: ${n.id}`);
  }

  return problems;
}

export type { ModuleLayout };
