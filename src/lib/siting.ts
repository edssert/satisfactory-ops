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

import { distanceM, nodeYield, type Extractor, type ResourceNode } from './mining.ts';

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
  const centers = minable.filter((n) => n.res === primary.res);

  const candidates: SiteCandidate[] = centers.map((center) => {
    const resources: SitedResource[] = wants.map((want) => {
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
        picked.push({ id: n.id, cell: n.cell, purity: n.purity, perMinute: y, distanceM: d });
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

    return {
      fx: center.fx,
      fy: center.fy,
      cell: center.cell,
      resources,
      maxHaulM: resources.reduce((m, r) => Math.max(m, r.maxDistanceM), 0),
      complete: resources.every((r) => r.shortfallPerMinute === 0),
      pureCount: resources.reduce(
        (c, r) => c + r.nodes.filter((n) => n.purity === 'pure').length,
        0
      ),
    };
  });

  return candidates
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        a.maxHaulM - b.maxHaulM ||
        b.pureCount - a.pureCount
    )
    // 같은 자리를 여러 번 추천하지 않는다 — 200 m 안이면 같은 부지로 본다
    .filter((c, i, arr) => arr.findIndex((o) => distanceM(o, c) < 200) === i)
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
