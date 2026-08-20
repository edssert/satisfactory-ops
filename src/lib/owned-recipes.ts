/**
 * owned-recipes.ts — "내가 딴 대체 제작법"을 기억한다.
 *
 * 대체 제작법은 110가지인데 하드 드라이브 수는 그보다 적다. 즉 **사람마다 가진 게 다르다.**
 * 그래서 설계 화면이 110가지를 다 보여 주면, 딴 적도 없는 제작법으로 공장을 짜게 된다.
 * satisfactorytools 나 SCIM 처럼 가진 것을 체크해 두고 그것만 쓰도록 한다.
 *
 * 게임 데이터와 사용자 데이터를 섞지 않는다(코딩 규약). 이건 사용자 데이터라서
 * 별도 키에 버전과 함께 저장하고, 게임 객체는 클래스명으로만 참조한다.
 * 설계판과 대체 제작법 화면이 같은 저장소를 본다.
 */

export const OWNED_KEY = 'sfops.owned';
export const OWNED_VERSION = 1;

export interface OwnedSave {
  version: number;
  /** 딴 대체 제작법의 클래스명 */
  ids: string[];
}

export function loadOwned(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    if (!raw) return new Set();
    const s = JSON.parse(raw) as OwnedSave;
    /* 버전이 다르면 조용히 무시한다. 마이그레이션 없이 구조를 바꾸지 않는다 */
    if (s.version !== OWNED_VERSION || !Array.isArray(s.ids)) return new Set();
    return new Set(s.ids);
  } catch {
    return new Set();
  }
}

export function saveOwned(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const s: OwnedSave = { version: OWNED_VERSION, ids: [...ids] };
    localStorage.setItem(OWNED_KEY, JSON.stringify(s));
  } catch {
    /* 저장 공간이 없어도 화면은 계속 쓸 수 있어야 한다 */
  }
}

/** 다른 탭에서 바뀐 것을 따라간다. 두 화면을 같이 열어 두는 일이 흔하다 */
export function watchOwned(cb: (ids: Set<string>) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const on = (e: StorageEvent) => {
    if (e.key === OWNED_KEY) cb(loadOwned());
  };
  window.addEventListener('storage', on);
  return () => window.removeEventListener('storage', on);
}
