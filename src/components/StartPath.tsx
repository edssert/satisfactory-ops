/**
 * StartPath — 시작 설정(튜토리얼 스킵 여부·시작 지점·자원 랜덤화)과, 그에 따라 갈리는 첫 10분 경로.
 *
 * 설정은 progress 스토어에 저장되어 다른 화면과 공유된다 (ADR-0011).
 * 요구 수량·부족분은 전부 게임 데이터에서 계산된 값을 props로 받는다.
 */

import { useEffect } from 'preact/hooks';
import '../styles/start.css';
import { hydrate, setSetup, setup } from '../state/progress.ts';

export interface GapRow {
  ko: string;
  en: string;
  need: number;
  have: number;
}

export interface Props {
  /** 첫 마일스톤(기초 건축물) 요구 대비 스킵 시작 보유량 */
  gap: GapRow[];
  /** 허브 건설비 (데이터 유래) */
  hubCost: { ko: string; amount: number }[];
  portableMiners: number;
  inventoryNote: string;
  startPoints: { id: string; name: string; en: string }[];
}

export default function StartPath({ gap, hubCost, portableMiners, inventoryNote, startPoints }: Props) {
  useEffect(() => {
    hydrate();
  }, []);

  const s = setup.value;
  const skip = s.tutorialSkipped;

  return (
    <div class="sp">
      <section class="sp-setup panel" aria-label="게임 설정">
        <div class="sp-group">
          <span class="sp-legend">튜토리얼</span>
          <div class="sp-opts">
            <button
              type="button"
              class="sp-opt"
              aria-pressed={!skip}
              onClick={() => setSetup({ tutorialSkipped: false })}
            >
              진행함
            </button>
            <button
              type="button"
              class="sp-opt"
              aria-pressed={skip}
              onClick={() => setSetup({ tutorialSkipped: true })}
            >
              스킵함
            </button>
          </div>
        </div>

        <div class="sp-group">
          <span class="sp-legend">시작 지점</span>
          <div class="sp-opts">
            {startPoints.map((p) => (
              <button
                key={p.id}
                type="button"
                class="sp-opt"
                aria-pressed={s.startLocation === p.id}
                onClick={() => setSetup({ startLocation: p.id as never })}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div class="sp-group">
          <span class="sp-legend">자원 랜덤화</span>
          <div class="sp-opts">
            <button
              type="button"
              class="sp-opt"
              aria-pressed={!s.randomizedResources}
              onClick={() => setSetup({ randomizedResources: false })}
            >
              끔
            </button>
            <button
              type="button"
              class="sp-opt"
              aria-pressed={s.randomizedResources}
              onClick={() => setSetup({ randomizedResources: true })}
            >
              켬
            </button>
          </div>
        </div>
      </section>

      {s.randomizedResources && (
        <p class="sp-warn">
          <strong>자원 랜덤화를 켰다면 이 화면의 노드 위치·순도 조언은 전부 무효입니다.</strong> 지도와
          노드 데이터는 기본 배치 기준입니다. 부지 판단은 인게임 스캐너로 직접 하세요.
        </p>
      )}

      {skip ? (
        <>
          <p class="sp-lede">
            티어 0 마일스톤이 <strong>전부 해금된 상태</strong>로 시작합니다 — 제련기·제작기·컨베이어
            벨트·채굴기 Mk.1·바이오매스 연소기가 이미 열려 있습니다. 손 채굴 단계를 통째로 건너뜁니다.
          </p>

          <ol class="sp-steps">
            <li>
              <h3>짓기 전에 스캔한다</h3>
              <p>
                자원 스캐너(<kbd>V</kbd> 길게)로 철·구리·석회석 위치를 먼저 확인하세요. 스킵 시작은
                허브를 바로 지을 재료가 있어서 오히려 더 성급해지기 쉽습니다.
              </p>
              <p class="muted">
                근처에 <strong>순수(Pure) 철 노드</strong>가 있는지 특히 잘 보세요 — 바로 채굴기를 꽂을
                수 있어서 노드 선택의 가치가 첫 순간부터 발생합니다.
              </p>
            </li>
            <li>
              <h3>허브를 짓는다</h3>
              <p>
                스킵해도 허브는 직접 지어야 합니다. 건설비는{' '}
                {hubCost.map((c, i) => (
                  <span key={c.ko}>
                    {i > 0 && ' · '}
                    {c.ko} <span class="n">{c.amount}</span>개
                  </span>
                ))}
                이고, 시작 인벤토리가 정확히 그만큼을 줍니다.
              </p>
            </li>
            {portableMiners > 0 && (
              <li>
                <h3>
                  휴대용 채굴기 <span class="n">{portableMiners}</span>개를 즉시 꽂는다
                </h3>
                <p>
                  아무 노드에나 꽂아두면 걸어다니는 동안 알아서 캡니다. 놀리는 만큼 그대로 손해입니다.
                </p>
              </li>
            )}
            <li>
              <h3>첫 자동화를 바로 세운다</h3>
              <p>
                채굴기 Mk.1·벨트·제련기·제작기가 이미 해금돼 있으니 아래 티어 1 계획을 그대로
                세우세요. 튜토리얼 경로는 허브 업그레이드 5까지 가야 여기 도달합니다.
              </p>
            </li>
          </ol>

          <div class="scroll-x">
            <table>
              <caption>첫 마일스톤(기초 건축물)까지의 격차 — 스킵 시작 기준</caption>
              <thead>
                <tr>
                  <th>부품</th>
                  <th class="n">요구</th>
                  <th class="n">시작 보유</th>
                  <th class="n">부족</th>
                </tr>
              </thead>
              <tbody>
                {gap.map((g) => {
                  const short = Math.max(0, g.need - g.have);
                  return (
                    <tr key={g.en}>
                      <td>
                        {g.ko} <span class="en">{g.en}</span>
                      </td>
                      <td class="n">{g.need}</td>
                      <td class="n">{g.have}</td>
                      <td class={'n' + (short > 0 ? ' sp-short' : ' sp-ok')}>
                        {short > 0 ? short : '충족'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="caption">{inventoryNote}</p>
        </>
      ) : (
        <>
          <p class="sp-lede">
            튜토리얼이 시키는 대로만 따라가면 자원 위치를 모른 채 허브를 짓게 됩니다. 순서를 하나만
            바꾸면 됩니다 — <strong>짓기 전에 정찰</strong>.
          </p>

          <ol class="sp-steps">
            <li>
              <h3>드롭포드를 철거한다</h3>
              <p>
                빌드건(<kbd>F</kbd>)으로 드롭포드를 철거하면{' '}
                {hubCost.map((c, i) => (
                  <span key={c.ko}>
                    {i > 0 && ' · '}
                    {c.ko} <span class="n">{c.amount}</span>개
                  </span>
                ))}
                가 나옵니다. 허브 건설비가 정확히 이것입니다.
              </p>
            </li>
            <li>
              <h3>짓기 전에 주변을 스캔한다</h3>
              <p>
                자원 스캐너(<kbd>V</kbd> 길게)로 철·구리·석회석 위치를 먼저 확인하세요. 튜토리얼은 이
                단계를 시키지 않지만, 안 하면 허브를 엉뚱한 곳에 짓게 됩니다.
              </p>
              <p class="muted">
                확인할 것: 세 자원이 걸어서 오갈 만한 거리에 모여 있는가, 그 사이에 평지가 있는가.
              </p>
            </li>
            <li>
              <h3>허브를 세 노드의 가운데에 짓는다</h3>
              <p>
                철·구리·석회석 노드의 대략적인 무게중심, 그리고 평지. 이 두 조건이면 충분합니다. 완벽할
                필요 없습니다 — 언제든 옮길 수 있으니까요.
              </p>
            </li>
            <li>
              <h3>바이오매스를 미리 모아둔다</h3>
              <p>
                허브 업그레이드 2에서 바이오매스 연소기가 풀립니다. 그때 연료가 없으면 멈춰서 잎을
                주우러 다녀야 합니다. 이동하면서 나뭇잎·나무를 계속 주우세요.
              </p>
            </li>
          </ol>
        </>
      )}

      <p class="note">
        <span class="note-title">하지 말 것</span>이 단계의 건물을 <strong>본 공장 예정지 한가운데</strong>
        에 짓지 마세요. 파운데이션은 티어 1에서야 풀리고, 맨땅에 지은 것은 그때 전부 철거하게 됩니다.
        임시 라인은 부지 <em>바깥</em>에 두세요.
      </p>
    </div>
  );
}
