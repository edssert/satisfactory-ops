/**
 * machine-symbol.ts — 기계별 **top-down 심볼**.
 *
 * 왜 필요한가: 도면에 기계를 사각형 + 번호로만 그렸더니 "그냥 2D로 흩뿌려놓은 도면"이라는 지적을
 * 받았다. 정당한 지적이다. 사각형 열두 개가 놓인 그림에서는 어느 것이 제련기고 어느 것이 조립기인지
 * 모른다. 실제 공정 도면(P&ID·플랜트 배치도)은 **설비 종류마다 다른 실루엣**을 쓴다.
 *
 * 왜 게임 스프라이트를 안 쓰는가 (조사 결과, docs/research/drawing-tools-visual.md):
 *   · 공개된 top-down 이미지·SVG 세트가 어디에도 없다. 공식 위키 이미지는 아이소메트릭이다
 *   · satisfactory-calculator(SCIM)의 자산은 저장소가 재사용을 명시적으로 금지한다
 *   · 게임 메시를 직접 추출해 렌더하는 것은 무겁고, 자산 취급 원칙(CLAUDE.md §4)에도 어긋난다
 * 그래서 **직접 그린다.** 실루엣은 게임의 기계를 위에서 본 특징을 단순화한 것이다.
 *
 * 규칙:
 *   · 도형은 0..1 정규화 좌표의 **원시 요소 목록**으로 적고, drawSymbol 이 실제 픽셀 좌표를
 *     계산해 path 를 만든다. SVG transform 으로 늘리지 않는다 — 비균등 scale 은 선 굵기까지
 *     늘리고, 렌더러가 `vector-effect="non-scaling-stroke"` 를 지원하지 않으면 1.8 px 선이
 *     140 px 가 되어 도면이 검은 덩어리가 된다. 실제로 그렇게 됐다.
 *   · y = 0 이 **뒷면(입력)**, y = 1 이 **앞면(출력)**. 포트 관행이 근거다
 *     (위키 Manufacturer Trivia: 제조기만 입력이 앞, 나머지는 뒤)
 *   · 색은 쓰지 않는다. 선과 형태로만 구분한다 — 색각 이상 대응(CLAUDE.md 코딩 규약)
 */

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'ellipse'; cx: number; cy: number; r: number }
  | { t: 'poly'; pts: [number, number][]; close?: boolean };

export interface SymbolPart {
  prim: Prim;
  kind: 'outline' | 'detail' | 'hint';
}

export interface MachineSymbol {
  parts: SymbolPart[];
  /** 입력 포트 개수 (뒷면에 균등 배치) */
  inputs: number;
  /** 출력 포트 개수 */
  outputs: number;
  /** 입력이 앞면인가 — 제조기만 그렇다 */
  inputsOnFront?: boolean;
  /** 사람이 읽는 이름 (범례용) */
  label: string;
}

type Kind = SymbolPart['kind'];
const R = (x: number, y: number, w: number, h: number, kind: Kind = 'detail'): SymbolPart => ({
  prim: { t: 'rect', x, y, w, h },
  kind,
});
const E = (cx: number, cy: number, r: number, kind: Kind = 'detail'): SymbolPart => ({
  prim: { t: 'ellipse', cx, cy, r },
  kind,
});
const P = (pts: [number, number][], kind: Kind = 'detail', close = false): SymbolPart => ({
  prim: { t: 'poly', pts, close },
  kind,
});

/**
 * 기계별 실루엣. 각 심볼이 무엇을 단순화한 것인지 주석으로 남긴다 —
 * 나중에 고칠 사람이 근거를 알 수 있어야 한다.
 */
export const SYMBOLS: Record<string, MachineSymbol> = {
  // 제련기 — 가운데 도가니(원)와 뒷면 장입구
  Build_SmelterMk1_C: {
    label: '제련기',
    inputs: 1,
    outputs: 1,
    parts: [
      R(0.06, 0.04, 0.88, 0.92, 'outline'),
      E(0.5, 0.46, 0.26),
      E(0.5, 0.46, 0.13),
      R(0.3, 0.08, 0.4, 0.1, 'hint'),
    ],
  },
  // 제작기 — 가운데를 가로지르는 롤러와 앞뒤 레일
  Build_ConstructorMk1_C: {
    label: '제작기',
    inputs: 1,
    outputs: 1,
    parts: [
      R(0.06, 0.04, 0.88, 0.92, 'outline'),
      R(0.14, 0.4, 0.72, 0.2),
      P([
        [0.14, 0.5],
        [0.86, 0.5],
      ]),
      R(0.2, 0.1, 0.6, 0.12, 'hint'),
      R(0.2, 0.78, 0.6, 0.12, 'hint'),
    ],
  },
  // 조립기 — 뒷면 장입구 둘, 가운데 작업 플랫폼
  Build_AssemblerMk1_C: {
    label: '조립기',
    inputs: 2,
    outputs: 1,
    parts: [
      R(0.05, 0.03, 0.9, 0.94, 'outline'),
      R(0.16, 0.34, 0.68, 0.34),
      P([
        [0.16, 0.51],
        [0.84, 0.51],
      ]),
      R(0.14, 0.07, 0.28, 0.16, 'hint'),
      R(0.58, 0.07, 0.28, 0.16, 'hint'),
    ],
  },
  // 제조기 — 앞면에 장입구 넷 (입력이 앞면인 유일한 기계)
  Build_ManufacturerMk1_C: {
    label: '제조기',
    inputs: 4,
    outputs: 1,
    inputsOnFront: true,
    parts: [
      R(0.04, 0.03, 0.92, 0.94, 'outline'),
      R(0.14, 0.3, 0.72, 0.4),
      P([
        [0.14, 0.5],
        [0.86, 0.5],
      ]),
      R(0.1, 0.8, 0.16, 0.13, 'hint'),
      R(0.3, 0.8, 0.16, 0.13, 'hint'),
      R(0.54, 0.8, 0.16, 0.13, 'hint'),
      R(0.74, 0.8, 0.16, 0.13, 'hint'),
    ],
  },
  // 주조소 — 도가니 둘
  Build_FoundryMk1_C: {
    label: '주조소',
    inputs: 2,
    outputs: 1,
    parts: [
      R(0.05, 0.04, 0.9, 0.92, 'outline'),
      E(0.33, 0.45, 0.17),
      E(0.67, 0.45, 0.17),
      R(0.14, 0.08, 0.24, 0.1, 'hint'),
      R(0.62, 0.08, 0.24, 0.1, 'hint'),
    ],
  },
  // 정제소 — 증류탑과 배관부
  Build_OilRefinery_C: {
    label: '정제소',
    inputs: 2,
    outputs: 2,
    parts: [
      R(0.05, 0.03, 0.9, 0.94, 'outline'),
      E(0.5, 0.36, 0.22),
      E(0.5, 0.36, 0.11),
      R(0.2, 0.64, 0.6, 0.2),
      P(
        [
          [0.2, 0.74],
          [0.8, 0.74],
        ],
        'hint'
      ),
    ],
  },
  // 포장기 — 캔 형태
  Build_Packager_C: {
    label: '포장기',
    inputs: 2,
    outputs: 2,
    parts: [
      R(0.06, 0.06, 0.88, 0.88, 'outline'),
      R(0.32, 0.28, 0.36, 0.44),
      P([
        [0.32, 0.38],
        [0.68, 0.38],
      ]),
      P([
        [0.32, 0.62],
        [0.68, 0.62],
      ]),
    ],
  },
  // 혼합기 — 교반기
  Build_Blender_C: {
    label: '혼합기',
    inputs: 4,
    outputs: 2,
    parts: [
      R(0.04, 0.04, 0.92, 0.92, 'outline'),
      E(0.5, 0.5, 0.24),
      P([
        [0.32, 0.5],
        [0.42, 0.36],
        [0.58, 0.64],
        [0.68, 0.5],
      ]),
    ],
  },
  // 입자 가속기 — 링
  Build_HadronCollider_C: {
    label: '입자 가속기',
    inputs: 3,
    outputs: 1,
    parts: [R(0.02, 0.04, 0.96, 0.92, 'outline'), E(0.5, 0.5, 0.34), E(0.5, 0.5, 0.24)],
  },
  // 채굴기 — 드릴(동심원)
  Build_MinerMk1_C: {
    label: '채굴기',
    inputs: 0,
    outputs: 1,
    parts: [
      R(0.1, 0.06, 0.8, 0.88, 'outline'),
      E(0.5, 0.42, 0.24),
      E(0.5, 0.42, 0.14),
      E(0.5, 0.42, 0.05),
      R(0.34, 0.76, 0.32, 0.14, 'hint'),
    ],
  },
  // 물 추출기 — 물결
  Build_WaterPump_C: {
    label: '물 추출기',
    inputs: 0,
    outputs: 1,
    parts: [
      R(0.05, 0.05, 0.9, 0.9, 'outline'),
      P([
        [0.15, 0.4],
        [0.3, 0.33],
        [0.45, 0.47],
        [0.6, 0.33],
        [0.85, 0.4],
      ]),
      P([
        [0.15, 0.62],
        [0.3, 0.55],
        [0.45, 0.69],
        [0.6, 0.55],
        [0.85, 0.62],
      ]),
    ],
  },
  // 컨베이어 리프트 — 위로 가는 화살표
  Build_ConveyorLiftMk1_C: {
    label: '컨베이어 리프트',
    inputs: 1,
    outputs: 1,
    parts: [
      R(0.12, 0.12, 0.76, 0.76, 'outline'),
      P([
        [0.5, 0.78],
        [0.5, 0.24],
      ]),
      P([
        [0.32, 0.42],
        [0.5, 0.22],
        [0.68, 0.42],
      ]),
    ],
  },
};

/** 채굴기 상위 등급은 같은 실루엣을 쓴다 */
SYMBOLS.Build_MinerMk2_C = { ...SYMBOLS.Build_MinerMk1_C!, label: '채굴기 Mk.2' };
SYMBOLS.Build_MinerMk3_C = { ...SYMBOLS.Build_MinerMk1_C!, label: '채굴기 Mk.3' };
for (const mk of [2, 3, 4, 5, 6]) {
  SYMBOLS[`Build_ConveyorLiftMk${mk}_C`] = {
    ...SYMBOLS.Build_ConveyorLiftMk1_C!,
    label: `컨베이어 리프트 Mk.${mk}`,
  };
}

/** 실루엣이 없는 기계 — 대각선으로 "아직 안 그렸다"를 표시한다 */
export const FALLBACK: MachineSymbol = {
  label: '기타 설비',
  inputs: 1,
  outputs: 1,
  parts: [
    R(0.06, 0.06, 0.88, 0.88, 'outline'),
    P(
      [
        [0.2, 0.2],
        [0.8, 0.8],
      ],
      'hint'
    ),
    P(
      [
        [0.8, 0.2],
        [0.2, 0.8],
      ],
      'hint'
    ),
  ],
};

export const symbolFor = (buildingId: string): MachineSymbol => SYMBOLS[buildingId] ?? FALLBACK;

const n2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 심볼을 **실제 픽셀 좌표의 path** 로 만든다.
 *
 * rotated 면 심볼을 90도 돌린다 — 입력 면이 어디를 보는지 그림에서 읽혀야 한다.
 */
export function drawSymbol(
  sym: MachineSymbol,
  x: number,
  y: number,
  w: number,
  h: number,
  rotated = false
): { d: string; kind: Kind }[] {
  // 회전하면 정규화 좌표 (u, v) 를 (v, 1-u) 로 옮긴다
  const map = (u: number, v: number): [number, number] =>
    rotated ? [x + v * w, y + (1 - u) * h] : [x + u * w, y + v * h];

  return sym.parts.map(({ prim, kind }) => {
    if (prim.t === 'rect') {
      const c = [
        map(prim.x, prim.y),
        map(prim.x + prim.w, prim.y),
        map(prim.x + prim.w, prim.y + prim.h),
        map(prim.x, prim.y + prim.h),
      ];
      return {
        kind,
        d:
          `M ${n2(c[0]![0])} ${n2(c[0]![1])}` +
          ` L ${n2(c[1]![0])} ${n2(c[1]![1])}` +
          ` L ${n2(c[2]![0])} ${n2(c[2]![1])}` +
          ` L ${n2(c[3]![0])} ${n2(c[3]![1])} Z`,
      };
    }
    if (prim.t === 'ellipse') {
      // 반지름을 폭·높이에 각각 곱한다. 기계가 정사각이 아니면 타원이 되는 게 맞다 —
      // 축척을 지키는 도면이므로 원을 억지로 원으로 유지하지 않는다.
      const [cx, cy] = map(prim.cx, prim.cy);
      const rx = n2(prim.r * w);
      const ry = n2(prim.r * h);
      return {
        kind,
        d:
          `M ${n2(cx - rx)} ${n2(cy)}` +
          ` a ${rx} ${ry} 0 1 0 ${n2(rx * 2)} 0` +
          ` a ${rx} ${ry} 0 1 0 ${n2(-rx * 2)} 0`,
      };
    }
    const pts = prim.pts.map(([u, v]) => map(u, v));
    return {
      kind,
      d:
        `M ${n2(pts[0]![0])} ${n2(pts[0]![1])} ` +
        pts
          .slice(1)
          .map((pt) => `L ${n2(pt[0])} ${n2(pt[1])}`)
          .join(' ') +
        (prim.close ? ' Z' : ''),
    };
  });
}
