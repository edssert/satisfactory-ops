/**
 * progress.ts — 내가 게임에서 어디까지 왔는지 기억한다.
 *
 * 이 앱의 약속은 "지금 뭘 해야 하는지"를 알려 주는 것이다. 그러려면 지금 어디인지를
 * 알아야 하는데, 지금까지는 사용자가 직접 찾아 내려가야 했다.
 * 세이브에는 산 마일스톤이 클래스명 그대로 들어 있다 — 그걸 그대로 쓴다.
 *
 * 게임 데이터와 사용자 데이터를 섞지 않는다(코딩 규약). 버전 필드를 둔다.
 */

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

export function loadProgress(): ProgressSave | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ProgressSave;
    if (s.version !== PROGRESS_VERSION || !Array.isArray(s.ids)) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveProgress(s: Omit<ProgressSave, 'version'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, ...s }));
  } catch {
    /* 저장 공간이 없어도 가이드는 계속 읽을 수 있어야 한다 */
  }
}

export function clearProgress(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* 무시 */
  }
}
