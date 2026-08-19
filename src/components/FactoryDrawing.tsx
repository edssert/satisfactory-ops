/**
 * FactoryDrawing — 공장 전체 배치도 한 장.
 *
 * 조사한 관행을 따른다 (docs/research/layout-expert-techniques.md §6):
 *  - **축척 평면도 먼저** (스파게티 다이어그램): 파운데이션 격자가 축척이다
 *  - **경로를 실제로 그린다**: 공정 산출 → 왼쪽 채널 → 다음 공정 공급. 이걸 빠뜨려서 조각들이 이어지지 않았다
 *  - **선 굵기 ∝ 유량** (산키 다이어그램): 굵은 선이 곧 병목 후보다
 *  - **직각 라우팅**: 대각선 금지
 *  - **입출력 포트**: 기계의 입력변·출력변을 표시하고 거기에만 연결한다
 *
 * 겹침 방지: 글자는 격자 바깥에만. 격자 안에는 기계 번호뿐.
 */

import { TILE_M, type Connection, type LayoutResult } from '../lib/layout.ts';

export const PX = 30;

/** 산키 관행 — 유량에 굵기를 비례시킨다. 최고 벨트(1200/분)를 상한으로 정규화. */
function strokeFor(perMinute: number): number {
  const t = Math.min(1, perMinute / 1200);
  return 1.5 + t * 5;
}

export default function FactoryDrawing({ plan }: { plan: LayoutResult }) {
  const CH = 16; // 채널 간격 (px)
  const channelsPx = plan.channels * CH + 14;
  const GUTTER = 196 + channelsPx;
  const RIGHT = 176;
  const TOP = 36;
  const BOTTOM = 30;

  const rows = plan.totalLengthTiles;
  const cols = Math.max(1, plan.totalWidthTiles);
  const W = cols * PX;
  const H = rows * PX;

  /** 채널 x 좌표 — 격자 왼쪽. 번호가 클수록 멀다. */
  const chX = (c: number) => -14 - c * CH;
  const laneY = (y: number) => y * PX + PX / 2;
  const moduleByKey = new Map(plan.modules.map((m) => [m.key, m]));

  return (
    <svg
      class="fd"
      viewBox={`${-GUTTER} ${-TOP} ${GUTTER + W + RIGHT} ${TOP + H + BOTTOM}`}
      width={GUTTER + W + RIGHT}
      height={TOP + H + BOTTOM}
      role="img"
      aria-label={alt(plan)}
    >
      <defs>
        <marker id="fd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" />
        </marker>
      </defs>

      {/* 축척 평면도 — 파운데이션 8m 격자 */}
      <g class="fd-foundation">
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => (
            <rect key={`f${r}-${c}`} x={c * PX} y={r * PX} width={PX} height={PX} />
          ))
        )}
      </g>

      {/* 공정 간 연결 — 산출 → 채널 → 다음 공정 공급 (직각 라우팅) */}
      {plan.connections.map((c, i) => (
        <ConnectionPath key={i} conn={c} chX={chX(c.channel)} laneY={laneY} width={W} />
      ))}

      {/* 외부 공급 (원자재) */}
      {plan.externals.map((e, i) => (
        <g key={`e${i}`} class={`fd-external${e.isFluid ? ' is-fluid' : ''}`}>
          <line
            x1={chX(plan.channels - 1) - 26}
            y1={laneY(e.y)}
            x2={0}
            y2={laneY(e.y)}
            stroke-width={strokeFor(e.perMinute)}
            marker-end="url(#fd-arrow)"
          />
          <text x={chX(plan.channels - 1) - 30} y={laneY(e.y) - 5} text-anchor="end">
            {e.itemKo} {e.perMinute}/분
            {e.lines > 1 ? ` ×${e.lines}줄` : ''}
          </text>
        </g>
      ))}

      {plan.modules.map((m, i) => {
        const top = Math.min(...m.supplyLanes.map((l) => l.y), ...m.placements.map((p) => p.y));
        return (
          <g key={m.key} class="fd-band">
            {/* 공정 라벨 — 격자 바깥 거터 */}
            <text class="fd-no" x={-GUTTER + 6} y={top * PX + 14}>
              {i + 1}
            </text>
            <text class="fd-title" x={-GUTTER + 26} y={top * PX + 14}>
              {m.title}
            </text>
            <text class="fd-sub" x={-GUTTER + 26} y={top * PX + 30}>
              {m.machineKo} {m.machinesBuilt}대
            </text>

            {/* 공급 레인 — 기계 줄마다 */}
            {m.supplyLanes.map((lane, k) => (
              <line
                key={`s${k}`}
                class="fd-supply"
                x1={0}
                y1={laneY(lane.y)}
                x2={lane.xTo * PX}
                y2={laneY(lane.y)}
                stroke-width={strokeFor(m.inputRatePerMinute)}
              />
            ))}

            {/* 기계 — 입력변(위)·출력변(아래) 표시 */}
            {m.placements.map((p, k) => {
              const cx = p.x * PX + (p.w * PX) / 2;
              return (
                <g key={`m${k}`}>
                  <line class="fd-branch" x1={cx} y1={laneY(p.y - 1)} x2={cx} y2={p.y * PX + 4} />
                  <line
                    class="fd-branch is-out"
                    x1={cx}
                    y1={(p.y + p.l) * PX - 4}
                    x2={cx}
                    y2={laneY(m.outputLane.y)}
                  />
                  <rect
                    class="fd-machine"
                    x={p.x * PX + 4}
                    y={p.y * PX + 4}
                    width={p.w * PX - 8}
                    height={p.l * PX - 8}
                    rx="2"
                  />
                  {/* 입력 포트 */}
                  <rect class="fd-port is-in" x={cx - 5} y={p.y * PX + 4} width={10} height={3} />
                  {/* 출력 포트 */}
                  <rect class="fd-port is-out" x={cx - 5} y={(p.y + p.l) * PX - 7} width={10} height={3} />
                  <text class="fd-mno" x={cx} y={p.y * PX + (p.l * PX) / 2 + 4} text-anchor="middle">
                    {k + 1}
                  </text>
                </g>
              );
            })}

            {/* 산출 레인 */}
            <line
              class="fd-output"
              x1={0}
              y1={laneY(m.outputLane.y)}
              x2={m.outputLane.xTo * PX}
              y2={laneY(m.outputLane.y)}
              stroke-width={strokeFor(m.outputRatePerMinute)}
            />

            {/* 최종 공정은 오른쪽으로 빠진다 */}
            {i === plan.modules.length - 1 && (
              <g class="fd-final">
                <line
                  x1={m.outputLane.xTo * PX}
                  y1={laneY(m.outputLane.y)}
                  x2={W + 24}
                  y2={laneY(m.outputLane.y)}
                  stroke-width={strokeFor(m.outputRatePerMinute)}
                  marker-end="url(#fd-arrow)"
                />
                <text x={W + 30} y={laneY(m.outputLane.y) + 4}>
                  {m.title} → 완제품
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 치수 */}
      <text class="fd-dim" x={W / 2} y={-14} text-anchor="middle">
        {cols * TILE_M} m · 토대 {cols}×{rows}장
      </text>
      <text
        class="fd-dim"
        x={-6}
        y={H / 2}
        text-anchor="middle"
        transform={`rotate(-90 ${-6} ${H / 2})`}
      >
        {rows * TILE_M} m
      </text>

      {/* 연결선 라벨은 마지막에 그려 선 위에 올린다 */}
      {plan.connections.map((c, i) => {
        const from = moduleByKey.get(c.fromKey);
        return (
          <text
            key={`cl${i}`}
            class="fd-conn-label"
            x={chX(c.channel) - 4}
            y={(laneY(c.fromY) + laneY(c.toY)) / 2}
            text-anchor="end"
          >
            {c.itemKo} {c.perMinute}/분{c.lines > 1 ? ` ×${c.lines}줄` : ''}
            {from ? '' : ''}
          </text>
        );
      })}
    </svg>
  );
}

/** 산출 레인 → 채널 → 공급 레인. 직각으로만 꺾는다. */
function ConnectionPath({
  conn,
  chX,
  laneY,
  width,
}: {
  conn: Connection;
  chX: number;
  laneY: (y: number) => number;
  width: number;
}) {
  const y1 = laneY(conn.fromY);
  const y2 = laneY(conn.toY);
  const d = `M ${width} ${y1} L ${chX} ${y1} L ${chX} ${y2} L 0 ${y2}`;
  return (
    <path
      class={`fd-conn${conn.lines > 1 ? ' is-over' : ''}`}
      d={d}
      stroke-width={strokeFor(conn.perMinute)}
      marker-end="url(#fd-arrow)"
      fill="none"
    />
  );
}

function alt(plan: LayoutResult): string {
  const stages = plan.modules.map(
    (m, i) =>
      `${i + 1}단계 ${m.title}, ${m.machineKo} ${m.machinesBuilt}대, ${m.widthTiles * TILE_M}×${m.lengthTiles * TILE_M}미터`
  );
  const links = plan.connections.map(
    (c) => `${c.itemKo} ${c.perMinute}/분이 ${c.lines}줄 벨트로 다음 공정에 들어갑니다`
  );
  const ext = plan.externals.map((e) => `${e.itemKo} ${e.perMinute}/분을 외부에서 받습니다`);
  return (
    `공장 배치도. 파운데이션 ${plan.totalWidthTiles}×${plan.totalLengthTiles}장 위에 공정 ${plan.modules.length}개를 ` +
    `원자재에서 완제품 순으로 배치합니다. ${stages.join('. ')}. ` +
    `${ext.join('. ')}. ${links.join('. ')}.`
  );
}
