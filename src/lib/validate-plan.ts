/**
 * validate-plan.ts — **계획이 실제로 지어지는가**를 검사한다.
 *
 * 왜 이 파일이 생겼는가:
 *
 * 지금까지 검증은 기하뿐이었다 — 상자가 겹치나. 그래서 "지을 수 없는 계획"이 그대로 화면에
 * 나갔고, 그걸 사용자가 눈으로 찾아 알려주는 일이 반복됐다. 실제로 이런 것들이 그렇게 발견됐다:
 *
 *   · 컨베이어 Mk.1(60/분)만 있는 티어에서 채굴기 산출을 120/분으로 잡았다.
 *     채굴기 출력은 벨트 한 줄이라 60이 상한인데, 그 위에 제작기 3대를 세웠다 — 못 짓는다.
 *   · 부품 목록의 분배기 수는 "1대가 3대를 먹인다"는 트리 구조 값인데, 도면은 세로 한 줄
 *     매니폴드였다. 그림과 표가 서로 다른 구조를 말하고 있었다.
 *   · 기계에 벨트가 하나도 연결되지 않은 채 도면에 떠 있었다.
 *
 * 전부 데이터도 있고 규칙도 아는데 검사하지 않아서 놓친 것이다. 그래서 규칙을 코드로 적는다.
 * **어기면 빌드가 실패한다.** 다음 결함은 사람 눈이 아니라 여기서 잡혀야 한다.
 *
 * 원칙:
 *   · 한 곳에서 계산하고 나머지는 읽기만 한다. 같은 값을 두 곳에서 만들면 반드시 어긋난다.
 *   · "모르는 것"과 "틀린 것"을 구분한다. 포트 높이는 몰라서 못 그리는 것이고(경고),
 *     벨트 상한 초과는 틀린 것이다(오류).
 */

import type { ModulePlan } from './module-plan.ts';

export type Severity = 'error' | 'warn';

export interface PlanIssue {
  severity: Severity;
  /** 어긴 규칙의 이름 — 무엇을 검사했는지 한 줄로 */
  rule: string;
  /** 무엇이 어떻게 어겼는가 */
  detail: string;
}

export interface ValidateInput {
  plan: ModulePlan;
  /** 이 계획을 짓는 시점의 티어 */
  tier: number;
  /** 건물 해금 티어 — 이름으로 찾는다 (계획이 이름만 들고 있다) */
  unlockTierOf: (buildingKo: string) => number | null;
  /** 지금 쓸 수 있는 벨트 처리량 */
  beltPerMinute: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 계획이 지켜야 하는 규칙 전부.
 *
 * 각 규칙에 **왜 그런가**를 적는다. 규칙만 있고 근거가 없으면 나중에 누가 지운다.
 */
export function validatePlan(input: ValidateInput): PlanIssue[] {
  const { plan, tier, unlockTierOf, beltPerMinute } = input;
  const issues: PlanIssue[] = [];
  const err = (rule: string, detail: string) => issues.push({ severity: 'error', rule, detail });
  const warn = (rule: string, detail: string) => issues.push({ severity: 'warn', rule, detail });

  const machines = plan.placements.filter((p) => p.kind === 'machine');

  // ── 1. 채굴기 출력은 벨트 한 줄 상한을 넘을 수 없다
  //
  // 채굴기의 출력구는 하나다. 거기서 나오는 벨트 한 줄이 못 나르는 양은 존재하지 않는 양이다.
  // 순수 노드가 120/분이어도 Mk.1(60/분)만 있으면 실제로 얻는 것은 60/분이다.
  for (const m of plan.mining) {
    for (const a of m.assignments) {
      if (a.ratePerMinute > beltPerMinute + 1e-6) {
        err(
          '채굴기 출력 ≤ 벨트 한 줄',
          `${m.itemKo} 채굴기(${a.cell} ${a.purityKo})가 ${a.ratePerMinute}/분을 낸다고 계획했지만, ` +
            `지금 벨트는 ${beltPerMinute}/분이 상한입니다. 채굴기 출력구는 하나라 나눠 실을 수 없습니다. ` +
            `채굴기를 ${r2((beltPerMinute / a.ratePerMinute) * a.clockPercent)}%로 낮추거나 상위 벨트가 필요합니다.`
        );
      }
    }
  }

  // ── 2. 모든 벨트 구간의 유량은 줄 수 × 벨트 처리량 안에 들어와야 한다
  for (const b of plan.belts) {
    const capacity = beltPerMinute * Math.max(1, b.lines);
    if (b.perMinute > capacity + 1e-6) {
      err(
        '벨트 유량 ≤ 줄 수 × 처리량',
        `${b.itemKo} ${b.perMinute}/분을 ${b.lines}줄로 나른다고 했지만 ` +
          `${beltPerMinute}/분 × ${b.lines}줄 = ${capacity}/분이 상한입니다.`
      );
    }
  }

  // ── 3. 모든 기계는 입력과 출력이 이어져 있어야 한다
  //
  // 도면에 기계가 떠 있으면 그건 도면이 아니다. 실제로 그런 그림이 나갔다.
  for (const g of plan.groups) {
    const gi = plan.groups.indexOf(g);
    const feeds = plan.belts.filter((b) => b.toGroup === gi).length;
    const drains = plan.belts.filter((b) => b.fromGroup === gi).length;
    if (feeds === 0) {
      err('모든 공정에 입력 벨트', `${g.itemKo} 공정으로 들어오는 벨트가 없습니다.`);
    }
    if (drains === 0) {
      err('모든 공정에 출력 벨트', `${g.itemKo} 공정에서 나가는 벨트가 없습니다.`);
    }
  }

  // ── 4. 부품 목록의 수는 도면에 실제로 놓인 수와 같아야 한다
  //
  // 목록은 공식으로, 그림은 배치 코드로 따로 만들면 반드시 어긋난다.
  // 사용자가 "이 도면대로 지으려면 분배기가 최소 2개 있어야 하는 것 아니냐"고 지적한 지점이다.
  const drawnSplitters = plan.placements.filter((p) => p.kind === 'splitter').length;
  const drawnMergers = plan.placements.filter((p) => p.kind === 'merger').length;
  const bomOf = (ko: string) => plan.bom.find((b) => b.ko === ko)?.count ?? 0;
  if (bomOf('분배기') !== drawnSplitters) {
    err(
      '부품 수 = 도면에 놓인 수',
      `분배기: 목록 ${bomOf('분배기')}개 vs 도면 ${drawnSplitters}개. ` +
        '목록과 그림이 다른 구조를 말하고 있습니다.'
    );
  }
  if (bomOf('병합기') !== drawnMergers) {
    err(
      '부품 수 = 도면에 놓인 수',
      `병합기: 목록 ${bomOf('병합기')}개 vs 도면 ${drawnMergers}개.`
    );
  }
  for (const g of plan.groups) {
    const drawn = machines.filter((p) => plan.groups[p.group ?? -1]?.machineId === g.machineId).length;
    void drawn;
  }
  const machineCountByKo = new Map<string, number>();
  for (const p of machines) {
    const g = p.group != null ? plan.groups[p.group] : undefined;
    if (!g) continue;
    machineCountByKo.set(g.machineKo, (machineCountByKo.get(g.machineKo) ?? 0) + 1);
  }
  for (const [ko, n] of machineCountByKo) {
    if (bomOf(ko) !== n) {
      err('부품 수 = 도면에 놓인 수', `${ko}: 목록 ${bomOf(ko)}대 vs 도면 ${n}대.`);
    }
  }

  // ── 5. 계획에 쓰인 건물은 그 시점에 해금돼 있어야 한다
  //
  // 해금 안 된 설비를 전제한 계획은 못 짓는 계획이다.
  for (const b of plan.bom) {
    const t = unlockTierOf(b.ko);
    if (t != null && t > tier) {
      err(
        '해금된 건물만 사용',
        `${b.ko}는 티어 ${t}에 열리는데 이 계획은 티어 ${tier} 기준입니다.`
      );
    }
  }

  // ── 6. 질량 보존 — 각 공정의 산출은 그것을 쓰는 공정의 소요와 맞아야 한다
  for (const g of plan.groups) {
    const consumers = plan.groups.filter((c) => c.inputs.some((i) => i.itemKo === g.itemKo));
    if (consumers.length === 0) continue; // 최종 산출물
    const demand = consumers.reduce(
      (s, c) => s + (c.inputs.find((i) => i.itemKo === g.itemKo)?.perMinute ?? 0),
      0
    );
    if (Math.abs(demand - g.outPerMinute) > 0.01) {
      err(
        '공정 산출 = 다음 공정 소요',
        `${g.itemKo}: 만드는 양 ${g.outPerMinute}/분 vs 쓰는 양 ${r2(demand)}/분.`
      );
    }
  }

  // ── 7. 지은 대수는 필요량 이상이고, 클럭은 100%를 넘지 않는다
  for (const g of plan.groups) {
    if (g.built < g.exact - 1e-9) {
      err('지은 대수 ≥ 필요량', `${g.itemKo}: ${g.built}대는 필요량 ${g.exact}대보다 적습니다.`);
    }
    if (g.clockPercent > 100.0001) {
      err(
        '클럭 ≤ 100%',
        `${g.itemKo}: ${g.clockPercent}% — 파워 슈미기 없이 100%를 넘을 수 없습니다.`
      );
    }
  }

  // ── 8. 채굴 계획이 수요를 채워야 한다
  for (const m of plan.mining) {
    if (m.shortfallPerMinute > 0.01) {
      err(
        '채굴량이 수요를 채움',
        `${m.itemKo}: ${m.shortfallPerMinute}/분 모자랍니다 (필요 ${m.demandPerMinute}, 확보 ${m.suppliedPerMinute}).`
      );
    }
  }

  // ── 9. 도형은 무엇인지 알 수 있어야 한다
  //
  // 채굴기에 좌표와 순도만 적고 무슨 광석인지 안 적어서 알아볼 수 없었다.
  for (const m of plan.mining) {
    if (!m.itemKo || m.itemKo.startsWith('Desc_')) {
      err('라벨은 식별 가능', `채굴 항목의 이름이 비었거나 클래스명입니다: ${m.itemKo}`);
    }
  }

  // ── 10. 토대 밖으로 나간 것이 없어야 한다
  for (const p of plan.placements) {
    if (p.kind === 'extractor') continue; // 채굴기는 노드 위, 토대 밖이 정상이다
    if (p.x < -1e-9 || p.y < -1e-9) {
      err('배치는 토대 안', `${p.label.split('\n')[0]}이 토대 밖(음수 좌표)에 있습니다.`);
    }
    if (p.x + p.wTiles > plan.foundation.wTiles + 1e-9 || p.y + p.hTiles > plan.foundation.hTiles + 1e-9) {
      err(
        '배치는 토대 안',
        `${p.label.split('\n')[0]}이 토대(${plan.foundation.wTiles}×${plan.foundation.hTiles}칸)를 벗어납니다.`
      );
    }
  }

  // ── 경고: 모르는 것 (틀린 것과 구분한다)
  if (plan.unreachableMachines > 0) {
    warn(
      '기계 접근',
      `${plan.unreachableMachines}대는 바닥에서 손이 닿지 않습니다 — 캣워크가 목록에 있는지 확인하세요.`
    );
  }
  if (plan.belts.some((b) => b.path.length <= 2 && b.perMinute > 0)) {
    warn(
      '벨트 경로',
      '기계를 피해 도는 경로를 못 찾아 직선으로 표시한 벨트가 있습니다 — 실제로는 리프트가 필요합니다.'
    );
  }

  return issues;
}

/** 오류만 (경고 제외) */
export const errorsOf = (issues: PlanIssue[]): PlanIssue[] =>
  issues.filter((i) => i.severity === 'error');
