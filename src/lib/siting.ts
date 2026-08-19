/**
 * siting.ts — **어디에 지을지**. 노드 좌표에서 부지를 계산한다.
 *
 * 이 앱이 답해야 하는 세 가지 중 하나다 — 무엇을(모듈), 어디에(이 파일), 어떤 순서로(프로그램).
 *
 * 판단 기준은 하나로 좁혔다: **가장 먼 자원까지의 거리(최대 운반 거리)를 최소화한다.**
 *   왜 최대값인가 — 벨트를 깔아야 하는 총 노동은 가장 먼 한 줄이 결정한다. 평균이 짧아도
 *   한 자원이 800 m 떨어져 있으면 그 한 줄 때문에 부지가 나쁜 부지가 된다.
 *   왜 합계가 아닌가 — 합계가 작은 자리는 자원 하나가 아주 가깝고 나머지가 먼 쪽으로 쏠린다.
 *
 * 거리는 직선거리다. 실제 벨트는 지형을 따라 더 길어지므로 이 값은 **하한**이다.
 * 화면에 그렇게 표기한다. (지형 비용 모델은 아직 근거가 없다 — docs/research 미비 항목)
 */

import { distanceM, nodeYield, WORLD_SPAN_M, type Extractor, type ResourceNode } from './mining.ts';

export interface ResourceWant {
  res: string;
  ko: string;
  /** 이 부지에서 분당 확보해야 하는 양 */
  minPerMinute: number;
}

export interface SitedResource {
  res: string;
  ko: string;
  nodes: {
    id: string;
    cell: string;
    purity: ResourceNode['purity'];
    perMinute: number;
    distanceM: number;
    /** 지도 좌표 — 확대도에서 방향을 그리는 데 쓴다. 거리만으로는 배치를 못 그린다. */
    fx: number;
    fy: number;
  }[];
  suppliedPerMinute: number;
  shortfallPerMinute: number;
  /** 이 자원에서 가장 먼 노드까지 */
  maxDistanceM: number;
}

export interface SiteCandidate {
  /** 부지 중심 (지도 비율 좌표) */
  fx: number;
  fy: number;
  cell: string;
  resources: SitedResource[];
  /** 모든 자원 중 가장 먼 거리 — 이 값이 부지 품질을 결정한다 */
  maxHaulM: number;
  /** 못 채운 자원이 있는가 */
  complete: boolean;
  /** 순수 노드를 몇 개 쓰는가 (동점일 때 가른다) */
  pureCount: number;
}

/**
 * 원하는 자원을 모두 확보할 수 있는 부지 후보를 찾는다.
 *
 * 후보 중심은 **첫 자원(보통 가장 많이 쓰는 자원)의 채굴 가능 노드들**로 잡는다.
 * 공장은 결국 주력 자원 옆에 붙는 것이 맞기 때문이다 — 가장 굵은 벨트를 가장 짧게 만든다.
 */
export function findSites(
  nodes: ResourceNode[],
  wants: ResourceWant[],
  extractor: Extractor,
  topN = 5
): SiteCandidate[] {
  const minable = nodes.filter((n) => n.type !== 'deposit');
  const primary = wants[0];
  if (!primary) return [];

  /** 중심에서 각 자원의 필요량을 채우는 노드를 가까운 것부터 고른다 */
  const pickFor = (center: { fx: number; fy: number }): SitedResource[] =>
    wants.map((want) => {
      const sorted = minable
        .filter((n) => n.res === want.res)
        .map((n) => ({ n, d: distanceM(center, n) }))
        // 가까운 것 먼저, 같은 거리면 순도 높은 것 먼저
        .sort((a, b) => a.d - b.d || nodeYield(b.n, extractor) - nodeYield(a.n, extractor));

      const picked: SitedResource['nodes'] = [];
      let sum = 0;
      for (const { n, d } of sorted) {
        if (sum >= want.minPerMinute - 1e-9) break;
        const y = nodeYield(n, extractor);
        picked.push({
          id: n.id,
          cell: n.cell,
          purity: n.purity,
          perMinute: y,
          distanceM: d,
          fx: n.fx,
          fy: n.fy,
        });
        sum += y;
      }
      return {
        res: want.res,
        ko: want.ko,
        nodes: picked,
        suppliedPerMinute: Math.round(sum * 100) / 100,
        shortfallPerMinute: Math.max(0, Math.round((want.minPerMinute - sum) * 100) / 100),
        maxDistanceM: picked.reduce((m, p) => Math.max(m, p.distanceM), 0),
      };
    });

  const maxHaulOf = (center: { fx: number; fy: number }, picked: SitedResource[]) =>
    picked.reduce(
      (m, r) => Math.max(m, r.nodes.reduce((q, n) => Math.max(q, distanceM(center, n)), 0)),
      0
    );

  /**
   * **공장 자리를 자원들 사이로 옮긴다.**
   *
   * 처음에는 후보 중심을 주 자원(철 광석) 노드 위로만 잡았다. 그러면 철은 0 m지만 구리가
   * 107 m가 되어 최대 운반이 107 m로 잡힌다. 공장을 세 자원 사이로 옮기면 그 최대값이 줄어든다.
   * 공장은 노드 위에 지을 필요가 없다 — 채굴기만 노드 위에 서면 된다.
   *
   * 최소 최대거리(1-center) 문제이고, 노드가 몇 개뿐이라 굵은 격자에서 고운 격자로 좁히는
   * 국소 탐색으로 충분하다.
   */
  const refine = (start: { fx: number; fy: number }, picked: SitedResource[]) => {
    let best = { fx: start.fx, fy: start.fy };
    let bestMax = maxHaulOf(best, picked);
    // 400 m 범위에서 시작해 절반씩 좁힌다
    for (let stepM = 200; stepM >= 5; stepM /= 2) {
      const step = stepM / WORLD_SPAN_M;
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 40) {
        improved = false;
        for (const [dx, dy] of [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1],
        ]) {
          const cand = { fx: best.fx + dx * step, fy: best.fy + dy * step };
          const m = maxHaulOf(cand, picked);
          if (m < bestMax - 0.5) {
            best = cand;
            bestMax = m;
            improved = true;
          }
        }
      }
    }
    return best;
  };

  /**
   * 후보 자리는 **모든 자원의 노드**에서 시작한다. 주 자원 노드만 후보로 두면
   * 자원 하나에 붙은 자리만 보게 된다.
   */
  const seeds = minable.filter((n) => wants.some((w) => w.res === n.res));

  const candidates: SiteCandidate[] = seeds.map((seed) => {
    // 1) 씨앗 주변에서 노드를 고르고 2) 그 노드들 사이로 자리를 옮기고 3) 다시 고른다
    let center = { fx: seed.fx, fy: seed.fy };
    let picked = pickFor(center);
    center = refine(center, picked);
    picked = pickFor(center);
    center = refine(center, picked);

    const cellNode = minable.reduce((a, b) =>
      distanceM(center, b) < distanceM(center, a) ? b : a
    );

    return {
      fx: center.fx,
      fy: center.fy,
      // 부지 자체의 그리드 칸 — 가장 가까운 노드의 칸으로 표기한다
      cell: cellNode.cell,
      resources: picked,
      maxHaulM: maxHaulOf(center, picked),
      complete: picked.every((r) => r.shortfallPerMinute === 0),
      pureCount: picked.reduce((c, r) => c + r.nodes.filter((n) => n.purity === 'pure').length, 0),
    };
  });

  return candidates
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        a.maxHaulM - b.maxHaulM ||
        b.pureCount - a.pureCount
    )
    // 같은 자리를 여러 번 추천하지 않는다 — 300 m 안이면 같은 부지로 본다
    .filter((c, i, arr) => arr.findIndex((o) => distanceM(o, c) < 300) === i)
    .slice(0, topN);
}

/** 부지에서 어떤 자원이 문제인지 한 줄로 */
export function siteVerdict(site: SiteCandidate): string {
  if (!site.complete) {
    const bad = site.resources.filter((r) => r.shortfallPerMinute > 0).map((r) => r.ko);
    return `${bad.join('·')} 부족 — 이 부지만으로는 목표 생산량을 못 채웁니다.`;
  }
  const far = [...site.resources].sort((a, b) => b.maxDistanceM - a.maxDistanceM)[0]!;
  if (site.maxHaulM <= 200) {
    return `자원 전부가 ${site.maxHaulM} m 안에 있습니다 — 벨트만으로 충분합니다.`;
  }
  if (site.maxHaulM <= 500) {
    return `가장 먼 자원이 ${far.ko} ${site.maxHaulM} m입니다. 벨트로 이을 수 있지만 전주와 벨트 자재가 그만큼 듭니다.`;
  }
  return `가장 먼 자원이 ${far.ko} ${site.maxHaulM} m입니다. 초반에는 벨트로 잇되, 나중에 열차로 대체할 구간입니다.`;
}
