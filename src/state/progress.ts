/**
 * progress.ts — 진행 상태 스토어 (signals).
 *
 * 아일랜드는 이 모듈을 import할 뿐 상태를 소유하지 않는다. 페이지가 바뀌면 아일랜드는
 * 재마운트되지만 상태는 localStorage에서 복원된다 (ADR-0011).
 *
 * 저장하는 것은 "체크했다"는 사실뿐이다. 현재 티어·다음 할 일은 전부 파생값이다.
 */

import { computed, signal } from '@preact/signals';
import { initialState, load, save, type SetupState, type UserState } from './persist.ts';

const state = signal<UserState>(initialState());
export const recovered = signal<{ recovered: boolean; backupKey: string | null }>({
  recovered: false,
  backupKey: null,
});

let hydrated = false;

/** 브라우저에서 1회 복원. 멱등이다 — 아일랜드가 여러 개여도 안전하다. */
export function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const r = load();
  state.value = r.state;
  recovered.value = { recovered: r.recovered, backupKey: r.backupKey };
}

const update = (fn: (s: UserState) => UserState): void => {
  const next = fn(state.value);
  state.value = next;
  save(next);
};

export const doneMilestones = computed(() => new Set(state.value.doneMilestones));
export const ownedAlternates = computed(() => new Set(state.value.ownedAlternates));
export const setup = computed(() => state.value.setup);

export const isDone = (id: string): boolean => doneMilestones.value.has(id);

export function toggleMilestone(id: string): void {
  update((s) => {
    const has = s.doneMilestones.includes(id);
    return {
      ...s,
      doneMilestones: has ? s.doneMilestones.filter((x) => x !== id) : [...s.doneMilestones, id],
    };
  });
}

export function setSetup(patch: Partial<SetupState>): void {
  update((s) => ({ ...s, setup: { ...s.setup, ...patch } }));
}

export function resetAll(): void {
  update(() => initialState());
}

export function replaceAll(next: UserState): void {
  update(() => next);
}

export const snapshot = (): UserState => state.value;

/**
 * 현재 티어 판정 (FRD F1-4).
 * 규칙: 앞 티어를 전부 끝냈고 아직 남은 마일스톤이 있는 가장 낮은 티어가 "지금 하는 중"이다.
 * 전부 끝냈으면 마지막 티어를 돌려준다.
 */
export function currentTier(tiers: { tier: number; ids: string[] }[]): number {
  const done = doneMilestones.value;
  for (const t of tiers) {
    if (t.ids.some((id) => !done.has(id))) return t.tier;
  }
  return tiers.at(-1)?.tier ?? 0;
}

/** 티어별 완료율 (FRD F1-8) */
export function tierProgress(ids: string[]): { done: number; total: number } {
  const done = doneMilestones.value;
  return { done: ids.filter((id) => done.has(id)).length, total: ids.length };
}
