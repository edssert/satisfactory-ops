/**
 * flow-layout.ts — 공정 흐름도의 배치 계산. 그리기(SVG)와 분리한다.
 *
 * 축척이 없다. 좌표는 "읽기 좋은 배치"일 뿐 게임 안의 위치가 아니다.
 * 원자재가 위, 완제품이 아래. 한 계층이 한 줄.
 *
 * 서버에서 그리는 큐레이션 도면과 브라우저에서 그리는 사용자 도면이 같은 모양이어야 하므로
 * 치수를 여기 한 곳에 둔다.
 */

export const NODE_W = 176;
export const NODE_H = 80;
export const GAP_X = 26;
export const GAP_Y = 86;
export const PAD = 28;
export const CHIP_H = 30;

export interface LayoutNode {
  id: string;
  layer: number;
}

export interface Placed<T extends LayoutNode> {
  x: number;
  y: number;
  n: T;
}

export interface Layout<T extends LayoutNode> {
  width: number;
  height: number;
  placed: Map<string, Placed<T>>;
}

/**
 * 계층별로 가운데 정렬해 늘어놓는다.
 *
 * `extraBottom` 은 맨 아래 계층 밑에 붙는 산출 칩 자리다. 이걸 안 잡으면 칩이 그림 밖으로 나간다.
 */
export function layout<T extends LayoutNode>(nodes: T[], extraBottom = 0): Layout<T> {
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const byLayer = layers.map((l) => nodes.filter((n) => n.layer === l));
  const maxPerLayer = Math.max(...byLayer.map((r) => r.length), 1);
  const width = PAD * 2 + maxPerLayer * NODE_W + (maxPerLayer - 1) * GAP_X;

  const placed = new Map<string, Placed<T>>();
  byLayer.forEach((row, li) => {
    const total = row.length * NODE_W + (row.length - 1) * GAP_X;
    row.forEach((n, k) => {
      placed.set(n.id, {
        x: (width - total) / 2 + k * (NODE_W + GAP_X),
        y: PAD + li * (NODE_H + GAP_Y),
        n,
      });
    });
  });

  const height = PAD * 2 + layers.length * NODE_H + (layers.length - 1) * GAP_Y + extraBottom;
  return { width, height, placed };
}

/** 위 상자 아래쪽에서 아래 상자 위쪽으로 내려가는 선. 꺾임은 직각으로 */
export function link(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} L${x2},${y2}`;
  const mid = y1 + (y2 - y1) / 2;
  const r = Math.min(12, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
  const dir = x2 > x1 ? 1 : -1;
  return (
    `M${x1},${y1} L${x1},${mid - r} ` +
    `Q${x1},${mid} ${x1 + r * dir},${mid} ` +
    `L${x2 - r * dir},${mid} ` +
    `Q${x2},${mid} ${x2},${mid + r} ` +
    `L${x2},${y2}`
  );
}

/** 라벨 칩 폭 — 한글 12px, 나머지 7px로 어림. 아이콘이 붙으면 그만큼 더 */
export function chipWidth(text: string, withIcon = true): number {
  let w = withIcon ? 34 : 12;
  for (const ch of text) w += /[가-힣]/.test(ch) ? 12 : 7;
  return Math.ceil(w);
}

/** 소수점이 붙을 때만 보여준다. 5.00 대신 5 */
export const fmtRate = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
