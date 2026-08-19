/**
 * MilestoneChecklist — F1 마일스톤 진행 체크리스트 (아일랜드).
 *
 * 빌드타임에 SSR되므로 JS가 없어도 목록은 읽힌다. 하이드레이션이 체크·진행판정을 붙인다.
 * 상태는 progress 스토어가 소유한다 (ADR-0011).
 */

import { useEffect } from 'preact/hooks';
import '../styles/milestones.css';
import {
  currentTier,
  doneMilestones,
  hydrate,
  isDone,
  recovered,
  tierProgress,
  toggleMilestone,
} from '../state/progress.ts';

export interface MilestoneView {
  id: string;
  ko: string;
  en: string;
  cost: { ko: string; en: string; amount: number }[];
  unlockCount: number;
  advice?: {
    action: string;
    trap: string;
    why: string;
    dispute?: string;
    confidence: string;
    sources: string[];
  };
}

export interface TierView {
  tier: number;
  note?: { title: string; body: string };
  milestones: MilestoneView[];
}

export interface Props {
  tiers: TierView[];
}

const CONFIDENCE_LABEL: Record<string, string> = {
  verified: '검증됨',
  consensus: '커뮤니티 합의',
  disputed: '출처 불일치',
};

export default function MilestoneChecklist({ tiers }: Props) {
  useEffect(() => {
    hydrate();
  }, []);

  // 파생값 — 저장하지 않는다
  const tierIds = tiers.map((t) => ({ tier: t.tier, ids: t.milestones.map((m) => m.id) }));
  const cur = currentTier(tierIds);
  const doneCount = doneMilestones.value.size;
  const total = tiers.reduce((n, t) => n + t.milestones.length, 0);

  const curTier = tiers.find((t) => t.tier === cur);
  const nextUp = (curTier?.milestones ?? []).filter((m) => !isDone(m.id)).slice(0, 3);

  return (
    <div class="ms">
      {recovered.value.recovered && (
        <p class="ms-recovered">
          저장된 진행 상황을 읽지 못해 초기화했습니다. 원본은{' '}
          <code>{recovered.value.backupKey}</code> 키에 백업해 두었습니다.
        </p>
      )}

      {/* 지금 할 일 — FRD F1-4, F1-5 */}
      <section class="ms-now panel" aria-live="polite">
        <p class="ms-now-label">
          <span class="n">지금</span> 티어 <span class="n">{cur}</span> 진행 중 · 전체{' '}
          <span class="n">{doneCount}</span>/<span class="n">{total}</span>
        </p>
        {nextUp.length > 0 ? (
          <>
            <h2 class="ms-now-title">다음에 할 일</h2>
            <ol class="ms-next">
              {nextUp.map((m) => (
                <li key={m.id}>
                  <strong>{m.ko}</strong> <span class="en">{m.en}</span>
                  <span class="ms-next-cost">
                    {m.cost.map((c, i) => (
                      <span key={c.en}>
                        {i > 0 && ' · '}
                        {c.ko} <span class="n">{c.amount}</span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <h2 class="ms-now-title">이 티어의 마일스톤을 전부 끝냈습니다.</h2>
        )}
        {curTier?.note && (
          <p class="ms-tier-note">
            <span class="note-title">{curTier.note.title}</span>
            {curTier.note.body}
          </p>
        )}
      </section>

      {tiers.map((t) => {
        const p = tierProgress(t.milestones.map((m) => m.id));
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        return (
          <section key={t.tier} class="ms-tier" id={`tier-${t.tier}`}>
            <div class="ms-tier-head">
              <h2>
                티어 <span class="n">{t.tier}</span>
              </h2>
              <span class="ms-progress">
                <span class="ms-track" aria-hidden="true">
                  <span class="ms-fill" style={{ width: pct + '%' }} />
                </span>
                <span class="n">{p.done}</span>/<span class="n">{p.total}</span>
              </span>
            </div>

            <ul class="ms-list">
              {t.milestones.map((m) => {
                const done = isDone(m.id);
                return (
                  <li key={m.id} class={done ? 'is-done' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleMilestone(m.id)}
                      />
                      <span class="ms-name">
                        {m.ko} <span class="en">{m.en}</span>
                      </span>
                    </label>

                    <div class="ms-cost">
                      {m.cost.length === 0 ? (
                        <span class="muted small">비용 없음</span>
                      ) : (
                        m.cost.map((c) => (
                          <span class="chip" key={c.en}>
                            {c.ko} <span class="n">{c.amount}</span>
                          </span>
                        ))
                      )}
                      {m.unlockCount > 0 && (
                        <span class="ms-unlock">
                          레시피 <span class="n">{m.unlockCount}</span>개 해금
                        </span>
                      )}
                    </div>

                    {m.advice && (
                      <div class="ms-advice">
                        <p>
                          <span class="note-title">이 시점 액션</span>
                          {m.advice.action}
                        </p>
                        <p>
                          <span class="note-title">확장성 함정</span>
                          {m.advice.trap}
                        </p>
                        <p class="ms-why">
                          <span class="note-title">왜</span>
                          {m.advice.why}
                        </p>
                        {m.advice.dispute && (
                          <p class="ms-dispute">
                            <span class="note-title">이견</span>
                            {m.advice.dispute}
                          </p>
                        )}
                        <p class="ms-src">
                          {CONFIDENCE_LABEL[m.advice.confidence] ?? m.advice.confidence} · 근거{' '}
                          {m.advice.sources.join(', ')}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {t.note && t.tier !== cur && (
              <p class="ms-tier-note">
                <span class="note-title">{t.note.title}</span>
                {t.note.body}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
