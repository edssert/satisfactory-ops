/**
 * collected.ts — 이미 주운 수집품을 기억한다.
 *
 * 슬러그·소머슬룹·머서 구체·하드 드라이브는 맵에 고정 개수로 놓여 있고 다시 생기지 않는다.
 * 그래서 실제로 필요한 물음은 "어디에 있나"가 아니라 **"어디가 아직 남았나"** 다.
 * 주운 것을 표시해 두면 지도가 남은 것만 보여 주는 목록이 된다.
 *
 * 게임 데이터와 사용자 데이터를 섞지 않는다(코딩 규약). 이건 사용자 데이터라서
 * 별도 키에 버전과 함께 저장한다. 게임 객체는 클래스명 그대로 참조한다.
 */

export const COLLECTED_KEY = 'sfops.collected';
export const COLLECTED_VERSION = 1;

export interface CollectedSave {
  version: number;
  /** 주운 수집품의 id (BP_Crystal1 처럼 게임 안의 이름) */
  ids: string[];
}

export function loadCollected(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(COLLECTED_KEY);
    if (!raw) return new Set();
    const s = JSON.parse(raw) as CollectedSave;
    /* 버전이 다르면 조용히 무시한다. 마이그레이션 없이 구조를 바꾸지 않는다 */
    if (s.version !== COLLECTED_VERSION || !Array.isArray(s.ids)) return new Set();
    return new Set(s.ids);
  } catch {
    return new Set();
  }
}

export function saveCollected(ids: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const s: CollectedSave = { version: COLLECTED_VERSION, ids: [...ids] };
    localStorage.setItem(COLLECTED_KEY, JSON.stringify(s));
  } catch {
    /* 저장 공간이 없어도 지도는 계속 쓸 수 있어야 한다 */
  }
}
