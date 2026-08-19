/**
 * FlowDiagram — 공정 흐름도.
 *
 * 참고 도면의 언어를 그대로 쓴다:
 *  - 품목별 색 구역
 *  - 분배기·병합기를 **독립 노드**로 (없으면 벨트가 기계에 안 붙는다)
 *  - **모든 간선에 유량 배지**. 숫자 없는 선은 도면이 아니다
 *  - 원자재는 왼쪽, 완제품은 오른쪽
 *  - 벨트 한 줄로 못 나르는 간선은 굵게 + 위험색 + 줄 수 표기
 */

import type { FlowGraph, FlowNode } from '../lib/flow.ts';

const NODE_W = 132;
const NODE_H = 56;
const COL_PITCH = 196;
const ROW_PITCH = 84;
const PAD = 30;
const ZONE_PAD = 14;

const nodeX = (n: FlowNode) => n.column * COL_PITCH;
const nodeY = (n: FlowNode) => n.row * ROW_PITCH;

export default function FlowDiagram({ flow }: { flow: FlowGraph }) {
  const W = (flow.columns - 1) * COL_PITCH + NODE_W;
  const H = (flow.rows - 1) * ROW_PITCH + NODE_H;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));

  // 구역 박스 — 같은 zone 노드들을 감싼다
  const zoneBoxes = [...new Set(flow.nodes.map((n) => n.zone))].map((zone, i) => {
    const ns = flow.nodes.filter((n) => n.zone === zone);
    const x0 = Math.min(...ns.map(nodeX)) - ZONE_PAD;
    const y0 = Math.min(...ns.map(nodeY)) - ZONE_PAD - 12;
    const x1 = Math.max(...ns.map((n) => nodeX(n) + NODE_W)) + ZONE_PAD;
    const y1 = Math.max(...ns.map((n) => nodeY(n) + NODE_H)) + ZONE_PAD;
    return { zone, x: x0, y: y0, w: x1 - x0, h: y1 - y0, tint: i % 4 };
  });

  return (
    <svg
      class="fl"
      viewBox={`${-PAD} ${-PAD - 12} ${W + PAD * 2} ${H + PAD * 2 + 12}`}
      width={W + PAD * 2}
      height={H + PAD * 2 + 12}
      role="img"
      aria-label={altText(flow)}
    >
      <defs>
        <marker id="fl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" />
        </marker>
      </defs>

      {/* 품목 구역 */}
      {zoneBoxes.map((z) => (
        <g key={z.zone} class={`fl-zone tint-${z.tint}`}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="6" />
          <text x={z.x + 8} y={z.y + 14}>
            {z.zone}
          </text>
        </g>
      ))}

      {/* 간선 — 직각 라우팅 + 유량 배지 */}
      {flow.edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const x1 = nodeX(a) + NODE_W;
        const y1 = nodeY(a) + NODE_H / 2;
        const x2 = nodeX(b);
        const y2 = nodeY(b) + NODE_H / 2;
        const midX = x1 + (x2 - x1) / 2;
        const d =
          Math.abs(y1 - y2) < 1
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        const label = `${e.perMinute}${e.lines > 1 ? ` ×${e.lines}줄` : ''}`;
        const lx = midX;
        const ly = (y1 + y2) / 2;
        return (
          <g key={i} class={`fl-edge${e.lines > 1 ? ' is-over' : ''}`}>
            <path d={d} marker-end="url(#fl-arrow)" stroke-width={e.lines > 1 ? 3.5 : 2} fill="none" />
            <rect x={lx - 22} y={ly - 9} width={44} height={18} rx="3" class="fl-badge" />
            <text x={lx} y={ly + 4} text-anchor="middle">
              {label}
            </text>
          </g>
        );
      })}

      {/* 노드 */}
      {flow.nodes.map((n) => (
        <g key={n.id} class={`fl-node is-${n.kind}`} transform={`translate(${nodeX(n)} ${nodeY(n)})`}>
          <rect width={NODE_W} height={NODE_H} rx="4" />
          {/* 입력 포트(초록) · 출력 포트(주황) — 참고 시트의 색 규약 */}
          {n.kind !== 'source' && <rect class="fl-port is-in" x={-2} y={NODE_H / 2 - 9} width={4} height={18} />}
          {n.kind !== 'sink' && (
            <rect class="fl-port is-out" x={NODE_W - 2} y={NODE_H / 2 - 9} width={4} height={18} />
          )}
          <text class="fl-label" x={10} y={22}>
            {n.label}
          </text>
          {n.sub && (
            <text class="fl-sub" x={10} y={40}>
              {n.sub}
            </text>
          )}
          {n.clockPercent != null && n.clockPercent !== 100 && (
            <text class="fl-clock" x={NODE_W - 8} y={18} text-anchor="end">
              {n.clockPercent}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function altText(flow: FlowGraph): string {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const steps = flow.edges.map((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    return `${a?.label ?? e.from}에서 ${b?.label ?? e.to}로 ${e.itemKo} ${e.perMinute}개/분${e.lines > 1 ? `, 벨트 ${e.lines}줄 필요` : ''}`;
  });
  return `공정 흐름도. 노드 ${flow.nodes.length}개, 연결 ${flow.edges.length}개. ${steps.join('. ')}.`;
}
