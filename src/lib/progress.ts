/**
 * progress.ts — 내가 게임에서 어디까지 왔는지 기억한다.
 *
 * 이 앱의 약속은 "지금 뭘 해야 하는지"를 알려 주는 것이다. 그러려면 지금 어디인지를
 * 알아야 하는데, 지금까지는 사용자가 직접 찾아 내려가야 했다.
 * 세이브에는 산 마일스톤이 클래스명 그대로 들어 있다 — 그걸 그대로 쓴다.
 *
 * 게임 데이터와 사용자 데이터를 섞지 않는다(코딩 규약). 버전 필드를 둔다.
 */

import { load as loadUnifiedState, saveNow, type UserState } from '../state/persist.ts';

export const PROGRESS_KEY = 'sfops.progress';
export const PROGRESS_VERSION = 1;

export interface ProgressSave {
  version: number;
  /** 산 마일스톤·허브 업그레이드의 클래스명 */
  ids: string[];
  /** 어느 세이브에서 읽었나 — 화면에 그대로 보여 준다 */
  session: string;
  hours: number;
}

export function loadProgress(impliedPrerequisites: string[] = []): ProgressSave | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const unified = loadUnifiedState().state;
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      let ids = withImpliedPrerequisites(unified.doneMilestones, impliedPrerequisites);
      if (!ids.length && unified.setup.tutorialSkipped) ids = [...impliedPrerequisites];
      if (!ids.length) return null;
      syncUnifiedProgress(unified, ids);
      return {
        version: PROGRESS_VERSION,
        ids,
        session: '',
        hours: 0,
      };
    }
    const s = JSON.parse(raw) as ProgressSave;
    if (s.version !== PROGRESS_VERSION || !Array.isArray(s.ids)) return null;
    const ids = withImpliedPrerequisites(s.ids, impliedPrerequisites);
    syncUnifiedProgress(unified, ids);
    return { ...s, ids };
  } catch {
    return null;
  }
}

export function saveProgress(s: Omit<ProgressSave, 'version'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, ...s }));
    syncUnifiedProgress(loadUnifiedState().state, s.ids);
  } catch {
    /* 저장 공간이 없어도 가이드는 계속 읽을 수 있어야 한다 */
  }
}

export function clearProgress(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PROGRESS_KEY);
    syncUnifiedProgress(loadUnifiedState().state, []);
  } catch {
    /* 무시 */
  }
}

function syncUnifiedProgress(state: UserState, ids: string[]): void {
  const nextIds = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  if (
    state.doneMilestones.length === nextIds.length
    && state.doneMilestones.every((id, index) => id === nextIds[index])
  ) return;
  saveNow({ ...state, doneMilestones: nextIds });
}

/** 후속 마일스톤이 있으면 그 전에 끝내야 했던 HUB 단계도 완료로 복원한다. */
function withImpliedPrerequisites(ids: string[], prerequisites: string[]): string[] {
  const prerequisiteSet = new Set(prerequisites);
  const hasLaterProgress = ids.some((id) => !prerequisiteSet.has(id));
  return hasLaterProgress ? [...new Set([...prerequisites, ...ids])] : [...new Set(ids)];
}
