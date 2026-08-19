/**
 * FloorPlanSheet — 층 단위 설계 도면 (청사진 형식).
 *
 * 참고: oldshavingfoam "Stackable Concrete Factory Mk.1" 및 Hunter Paramore 시트.
 * 그 도면들의 규칙을 그대로 옮긴다:
 *
 *  - 청사진 격자 배경 + 경계 사각형 = 층의 발자국
 *  - 기계 블록 안에 **제품명 / 클럭·전력 / INPUT 유량 / 기계 종류(대문자)**
 *  - 벨트는 세로 리본 + **유량 표기**, 방향 화살표
 *  - 분배기·머저는 라벨 붙은 박스로 벨트 위에
 *  - 경계 밖에 **입력 알약(주황) · 출력 알약(초록)**
 *  - 층이 2개 이상이면 **LIFT 마커**
 *
 * 글자는 블록 안이나 경계 밖에만 둔다. 벨트 위에 글자를 겹치지 않는다.
 */

import { TILE_M } from '../lib/layout.ts';
import type { FloorPlan, FloorPlanStage } from '../lib/floorplan.ts';

const PX = 64; // 타일 한 칸 (텍스트가 블록에 들어가려면 이 정도가 필요하다)
const PAD_X = 150; // 입출력 알약이 잘리지 않을 폭
const PAD_TOP = 58;
const PAD_BOTTOM = 62;

/** 한글은 폭이 넓다. 글자 수로 알약 폭을 잡아 잘림을 막는다. */
function pillWidth(label: string): number {
  const wide = (label.match(/[가-힣]/g) ?? []).length;
  const rest = label.length - wide;
  return Math.ceil(wide * 11 + rest * 6.2) + 18;
}

/** 좁은 블록에 들어가도록 품목명을 줄인다 */
function short(name: string): string {
  return name.replace(/\s+/g, '').slice(0, 5);
}

export default function FloorPlanSheet({ plan }: { plan: FloorPlan }) {
  return (
    <div class="fps">
      {plan.stages.map((s, i) => (
        <StageSheet key={s.key} stage={s} index={i} plan={plan} />
      ))}
    </div>
  );
}

function StageSheet({
  stage: s,
  index,
  plan,
}: {
  stage: FloorPlanStage;
  index: number;
  plan: FloorPlan;
}) {
  const W = s.widthTiles * PX;
  const H = s.heightTiles * PX;
  const inputs = s.inputsPerFloor;

  return (
    <figure class="fps-stage">
      <figcaption>
        <span class="fps-no n">{index + 1}</span>
        <strong>{s.itemKo}</strong>
        <span class="fps-badge">{s.machineKo}</span>
        <span class="fps-badge">
          층당 <span class="n">{s.perFloor}</span>대
        </span>
        <span class={`fps-badge${s.floors > 1 ? ' is-stack' : ''}`}>
          <span class="n">{s.floors}</span>층
        </span>
        <span class="fps-caption-size n">
          {s.widthTiles * TILE_M}×{s.heightTiles * TILE_M} m / 층
        </span>
      </figcaption>

      <div class="scroll-x">
        <svg
          class="fps-svg"
          viewBox={`${-PAD_X} ${-PAD_TOP} ${W + PAD_X * 2} ${H + PAD_TOP + PAD_BOTTOM}`}
          width={W + PAD_X * 2}
          height={H + PAD_TOP + PAD_BOTTOM}
          role="img"
          aria-label={altText(s, plan)}
        >
          <defs>
            <pattern id={`bp-${index}`} width={PX} height={PX} patternUnits="userSpaceOnUse">
              <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" class="fps-grid-line" />
            </pattern>
            <marker
              id={`fps-arrow-${index}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>

          {/* 청사진 격자 (토대) */}
          <rect x={0} y={0} width={W} height={H} fill={`url(#bp-${index})`} class="fps-floor" />
          <rect x={0} y={0} width={W} height={H} rx="4" class="fps-boundary" />

          {/* 벨트 — 스파인은 머저 박스 위를 지나가지 않게 아래쪽만 그린다 */}
          {s.belts.map((b, k) => {
            const x = b.x * PX + PX / 2;
            const mergerRows = s.attachments.filter((a) => a.kind === 'merger' && a.x === b.x).map((a) => a.y);
            // 스파인은 **첫 머저**부터 아래로 이어야 한다.
            // 마지막 머저부터 그리면 위쪽 머저들이 벨트에 안 붙은 것처럼 보인다.
            const startY = b.role === 'spine' && mergerRows.length ? Math.min(...mergerRows) : b.y;
            const y1 = startY * PX;
            const y2 = (b.y + b.length) * PX;
            return (
              <g key={`b${k}`} class={`fps-belt is-${b.role}${b.lines > 1 ? ' is-over' : ''}`}>
                <line
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke-width={b.lines > 1 ? 7 : 5}
                  marker-end={`url(#fps-arrow-${index})`}
                />
                {/* 방향 셰브론 */}
                {Array.from({ length: Math.max(1, Math.round((y2 - y1) / PX)) }, (_, t) => (
                  <path
                    key={t}
                    class="fps-chevron"
                    d={`M ${x - 4} ${y1 + t * PX + PX * 0.35} L ${x} ${y1 + t * PX + PX * 0.55} L ${x + 4} ${y1 + t * PX + PX * 0.35}`}
                    fill="none"
                  />
                ))}
              </g>
            );
          })}

          {/*
            분배기·머저 — 라벨을 세로로 돌리면 좁은 칸에서 잘린다(실제로 "배기"만 보였다).
            기호로 표시하고 도면 아래 범례에서 풀어 쓴다.
          */}
          {s.attachments.map((a, k) => (
            <g key={`a${k}`} class={`fps-attach is-${a.kind}`}>
              <rect x={a.x * PX + 7} y={a.y * PX + 7} width={PX - 14} height={PX - 14} rx="2" />
              {a.kind === 'splitter' ? (
                <>
                  <line x1={a.x * PX + 13} y1={a.y * PX + PX / 2} x2={a.x * PX + PX / 2} y2={a.y * PX + PX / 2} />
                  <line x1={a.x * PX + PX / 2} y1={a.y * PX + PX / 2} x2={a.x * PX + PX - 15} y2={a.y * PX + 15} />
                  <line x1={a.x * PX + PX / 2} y1={a.y * PX + PX / 2} x2={a.x * PX + PX - 15} y2={a.y * PX + PX - 15} />
                </>
              ) : (
                <>
                  <line x1={a.x * PX + 15} y1={a.y * PX + 15} x2={a.x * PX + PX / 2} y2={a.y * PX + PX / 2} />
                  <line x1={a.x * PX + 15} y1={a.y * PX + PX - 15} x2={a.x * PX + PX / 2} y2={a.y * PX + PX / 2} />
                  <line x1={a.x * PX + PX / 2} y1={a.y * PX + PX / 2} x2={a.x * PX + PX - 13} y2={a.y * PX + PX / 2} />
                </>
              )}
            </g>
          ))}

          {/*
            기계 블록 — 텍스트를 clipPath로 가둔다. 블록보다 긴 글자가 밖으로 새어
            스파인 벨트를 침범하는 일이 실제로 있었다.
          */}
          {s.machines.map((m) => {
            const bx = m.x * PX + 3;
            const by = m.y * PX + 3;
            const bw = m.w * PX - 6;
            const bh = m.l * PX - 6;
            const clip = `fps-clip-${index}-${m.index}`;
            return (
              <g key={m.index} class="fps-machine">
                <clipPath id={clip}>
                  <rect x={bx + 1} y={by + 1} width={bw - 2} height={bh - 2} rx="3" />
                </clipPath>
                <rect x={bx} y={by} width={bw} height={bh} rx="3" />
                <g clip-path={`url(#${clip})`}>
                  <text class="fps-m-product" x={bx + 6} y={by + 17}>
                    {s.itemKo}
                  </text>
                  <text class="fps-m-meta" x={bx + 6} y={by + 31}>
                    {m.clockPercent}% · {s.machinePowerMW}MW
                  </text>
                  {s.inputPerMachine.slice(0, 2).map((inp, k) => (
                    <text key={k} class="fps-m-input" x={bx + 6} y={by + 47 + k * 13}>
                      {short(inp.itemKo)} {inp.perMinute}
                    </text>
                  ))}
                  <text class="fps-m-type" x={bx + 6} y={by + bh - 7}>
                    {s.machineKo}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 입력 알약 — 경계 밖 왼쪽 */}
          {inputs.map((inp, k) => {
            const label = `층당 ${inp.itemKo} ${inp.perMinute}/분`;
            const w = pillWidth(label);
            return (
              <g key={`in${k}`} class="fps-pill is-in">
                <rect x={-w - 14} y={8 + k * 28} width={w} height={22} rx="3" />
                <text x={-w - 6} y={23 + k * 28}>
                  {label}
                </text>
                <line x1={-12} y1={19 + k * 28} x2={0} y2={19 + k * 28} marker-end={`url(#fps-arrow-${index})`} />
              </g>
            );
          })}

          {/* 출력 알약 — 경계 밖 아래 */}
          {(() => {
            const spineX = s.belts.find((b) => b.role === 'spine')!.x * PX + PX / 2;
            const label = `층당 ${s.itemKo} ${s.outputPerFloor}/분`;
            const w = pillWidth(label);
            return (
              <g class="fps-pill is-out">
                <rect x={spineX - w / 2} y={H + 16} width={w} height={22} rx="3" />
                <text x={spineX - w / 2 + 8} y={H + 31}>
                  {label}
                </text>
              </g>
            );
          })()}

          {/* 층 표기 · 리프트 */}
          <text class="fps-title" x={0} y={-34}>
            {s.itemKo} — 층당 {s.perFloor}대 · 총 {s.machinesTotal}대 / {s.floors}층
          </text>
          {s.floors > 1 && (
            <g class="fps-lift">
              <rect x={W + 8} y={0} width={70} height={30} rx="3" />
              <text x={W + 14} y={13}>
                리프트
              </text>
              <text x={W + 14} y={25}>
                ↑ 다음 층
              </text>
            </g>
          )}

          {/* 축척 */}
          <g class="fps-scale">
            <line x1={0} y1={H + PAD_BOTTOM - 16} x2={PX} y2={H + PAD_BOTTOM - 16} />
            <text x={PX + 6} y={H + PAD_BOTTOM - 12}>
              {TILE_M} m
            </text>
          </g>
        </svg>
      </div>

      <p class="fps-legend">
        <span class="fps-key is-splitter" aria-hidden="true" /> 분배기(1→3) ·{' '}
        <span class="fps-key is-merger" aria-hidden="true" /> 머저(3→1) ·{' '}
        <span class="fps-key is-supply" aria-hidden="true" /> 공급 벨트 ·{' '}
        <span class="fps-key is-spine" aria-hidden="true" /> 산출 벨트
      </p>

      <p class="fps-spec">
        층당 입력{' '}
        {inputs.map((i, k) => (
          <span key={i.itemKo}>
            {k > 0 && ' · '}
            {i.itemKo} <span class="n">{i.perMinute}</span>/분
          </span>
        ))}{' '}
        → 층당 산출 <span class="n">{s.outputPerFloor}</span>/분 · 층당 전력{' '}
        <span class="n">{s.powerPerFloorMW}</span> MW · 분배기{' '}
        <span class="n">{s.splittersPerFloor}</span> · 머저 <span class="n">{s.mergersPerFloor}</span>
        {s.floors > 1 && (
          <>
            {' '}
            · <strong>{s.floors}층을 쌓습니다</strong>
            {s.lastFloorMachines !== s.perFloor && ` (마지막 층은 ${s.lastFloorMachines}대)`}
          </>
        )}
      </p>
    </figure>
  );
}

function altText(s: FloorPlanStage, plan: FloorPlan): string {
  return (
    `${s.itemKo} 생산 층 도면. 한 층은 ${s.widthTiles * TILE_M}×${s.heightTiles * TILE_M}미터이고 ` +
    `${s.machineKo} ${s.perFloor}대를 좌우 두 열로 놓습니다. 양 끝 세로 벨트가 공급하고 각 기계 앞에 분배기가 있으며, ` +
    `가운데 벨트가 산출을 모아 아래로 뺍니다. 층당 입력 ` +
    `${s.inputsPerFloor.map((i) => `${i.itemKo} ${i.perMinute}개/분`).join(', ')}, ` +
    `층당 산출 ${s.outputPerFloor}개/분, 전력 ${s.powerPerFloorMW}메가와트. ` +
    `총 ${s.machinesTotal}대를 ${s.floors}층에 나눠 담습니다. 벨트는 ${plan.beltKo}입니다.`
  );
}
