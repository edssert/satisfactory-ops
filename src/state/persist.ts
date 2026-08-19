/**
 * persist.ts — 사용자 데이터 영속 계층. localStorage를 만지는 유일한 모듈이다.
 *
 * 규칙 (TRD D-1~D-5, ADR-0011):
 *  - 최상위에 schemaVersion. 마이그레이션 없는 파괴적 변경 금지
 *  - 마이그레이션 실패 시 원본을 백업하고 사용자에게 알린다
 *  - 저장하는 것은 "사용자가 입력한 사실"뿐. 파생값은 저장하지 않는다
 */

export const STORAGE_KEY = 'sfops.v1';
export const CURRENT_VERSION = 1;

export interface SetupState {
  /** 시작 지점 (게임 신규 세션 선택) */
  startLocation: 'grass-fields' | 'rocky-desert' | 'northern-forest' | 'dune-desert' | null;
  /** 튜토리얼(HUB 업그레이드 1~2)을 건너뛰었는가 */
  tutorialSkipped: boolean;
  /** 1.2 자원 랜덤화를 켰는가 — 켜면 입지 조언이 무효가 된다 (FRD F2-10) */
  randomizedResources: boolean;
}

export interface UserState {
  schemaVersion: number;
  /** 완료 표시한 마일스톤 className 목록 */
  doneMilestones: string[];
  /** 확보한 대체 레시피 className 목록 */
  ownedAlternates: string[];
  setup: SetupState;
  updatedAt: string | null;
}

export const initialState = (): UserState => ({
  schemaVersion: CURRENT_VERSION,
  doneMilestones: [],
  ownedAlternates: [],
  setup: { startLocation: null, tutorialSkipped: false, randomizedResources: false },
  updatedAt: null,
});

/** 버전별 마이그레이션 사다리. 새 버전을 추가할 때 여기에 함수를 하나 더 붙인다. */
const migrations: Record<number, (s: any) => any> = {
  // 예시: 1 → 2 로 올릴 때
  // 1: (s) => ({ ...s, schemaVersion: 2, newField: [] }),
};

export interface LoadResult {
  state: UserState;
  /** 마이그레이션 실패로 초기화되었는가 — UI가 사용자에게 알려야 한다 */
  recovered: boolean;
  backupKey: string | null;
}

export function load(): LoadResult {
  if (typeof localStorage === 'undefined') {
    return { state: initialState(), recovered: false, backupKey: null };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { state: initialState(), recovered: false, backupKey: null };

  try {
    let data = JSON.parse(raw);
    let v = Number(data?.schemaVersion);
    if (!Number.isFinite(v)) throw new Error('schemaVersion 없음');

    while (v < CURRENT_VERSION) {
      const step = migrations[v];
      if (!step) throw new Error(`마이그레이션 경로 없음: v${v} → v${CURRENT_VERSION}`);
      data = step(data);
      const next = Number(data?.schemaVersion);
      if (!(next > v)) throw new Error('마이그레이션이 버전을 올리지 않음');
      v = next;
    }

    return { state: normalize(data), recovered: false, backupKey: null };
  } catch {
    // 원본을 버리지 않는다. 백업 후 초기 상태로 시작한다 (TRD D-3)
    const backupKey = `${STORAGE_KEY}.backup.${Date.now()}`;
    try {
      localStorage.setItem(backupKey, raw);
    } catch {
      /* 용량 초과 시 백업 실패는 감수한다 */
    }
    return { state: initialState(), recovered: true, backupKey };
  }
}

/** 알 수 없는 필드를 떨어뜨리고 타입을 강제한다. 손상된 저장값이 앱을 깨뜨리지 않게. */
function normalize(data: any): UserState {
  const base = initialState();
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    schemaVersion: CURRENT_VERSION,
    doneMilestones: arr(data?.doneMilestones),
    ownedAlternates: arr(data?.ownedAlternates),
    setup: {
      startLocation: data?.setup?.startLocation ?? base.setup.startLocation,
      tutorialSkipped: !!data?.setup?.tutorialSkipped,
      randomizedResources: !!data?.setup?.randomizedResources,
    },
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  };
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** 400ms 디바운스 저장. 체크박스 연타에 매번 직렬화하지 않는다. */
export function save(state: UserState): void {
  if (typeof localStorage === 'undefined') return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
    } catch {
      /* 시크릿 모드·용량 초과. 앱은 계속 동작한다 */
    }
  }, 400);
}

/** 내보내기 (TRD D-4) */
export const exportJson = (state: UserState): string => JSON.stringify(state, null, 2);

/** 가져오기 — 실패 시 던진다. 호출자가 사용자에게 알린다. */
export function importJson(text: string): UserState {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('JSON 객체가 아닙니다.');
  if (!Number.isFinite(Number(data.schemaVersion))) throw new Error('schemaVersion이 없습니다.');
  return normalize(data);
}
