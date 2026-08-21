/**
 * persist.ts — 사용자 데이터 영속 계층. localStorage를 만지는 유일한 모듈이다.
 *
 * 규칙 (TRD D-1~D-5, ADR-0011):
 *  - 최상위에 schemaVersion. 마이그레이션 없는 파괴적 변경 금지
 *  - 마이그레이션 실패 시 원본을 백업하고 사용자에게 알린다
 *  - 저장하는 것은 "사용자가 입력한 사실"뿐. 파생값은 저장하지 않는다
 */

export const STORAGE_KEY = 'sfops.v1';
export const CURRENT_VERSION = 2;
export const LEGACY_PROGRESS_KEY = 'sops.progress.v1';
export const SPLIT_PROGRESS_KEY = 'sfops.progress';
export const SPLIT_OWNED_KEY = 'sfops.owned';

export type ResourceMode = 'standard' | 'randomized';

export interface SetupState {
  /** 시작 지점 (게임 신규 세션 선택) */
  startLocation: 'grass-fields' | 'rocky-desert' | 'northern-forest' | 'dune-desert' | null;
  /** 튜토리얼(HUB 업그레이드 1~2)을 건너뛰었는가 */
  tutorialSkipped: boolean;
  /** 표준 배치인가, 1.2 자원 랜덤화인가 (FRD F2-10) */
  resourceMode: ResourceMode;
}

export interface UserState {
  schemaVersion: 2;
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
  setup: { startLocation: null, tutorialSkipped: false, resourceMode: 'standard' },
  updatedAt: null,
});

/** 버전별 마이그레이션 사다리. 새 버전을 추가할 때 여기에 함수를 하나 더 붙인다. */
const migrations: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  1: (state) => {
    const setup = isRecord(state.setup) ? state.setup : {};
    return {
      ...state,
      schemaVersion: 2,
      setup: {
        ...setup,
        resourceMode: setup.randomizedResources === true ? 'randomized' : 'standard',
      },
    };
  },
};

export interface LoadResult {
  state: UserState;
  /** 마이그레이션 실패로 초기화되었는가 — UI가 사용자에게 알려야 한다 */
  recovered: boolean;
  backupKey: string | null;
  /** 구형 키 또는 구형 스키마를 최신 형식으로 올렸는가 */
  migrated: boolean;
}

export function load(): LoadResult {
  if (typeof localStorage === 'undefined') {
    return { state: initialState(), recovered: false, backupKey: null, migrated: false };
  }

  const primaryRaw = localStorage.getItem(STORAGE_KEY);
  const legacyRaw = primaryRaw ? null : localStorage.getItem(LEGACY_PROGRESS_KEY);
  const splitProgressRaw = primaryRaw || legacyRaw ? null : localStorage.getItem(SPLIT_PROGRESS_KEY);
  const splitOwnedRaw = primaryRaw || legacyRaw ? null : localStorage.getItem(SPLIT_OWNED_KEY);
  const raw = primaryRaw ?? legacyRaw ?? splitProgressRaw ?? splitOwnedRaw;
  if (!raw) return { state: initialState(), recovered: false, backupKey: null, migrated: false };

  try {
    let state: UserState;
    let migrated = false;

    if (primaryRaw) {
      const parsed = JSON.parse(primaryRaw) as unknown;
      const version = storedVersion(parsed);
      state = migrateUserState(parsed);
      migrated = version !== CURRENT_VERSION;
    } else if (legacyRaw) {
      state = migrateLegacyProgress(JSON.parse(legacyRaw));
      migrated = true;
    } else {
      state = migrateSplitState(splitProgressRaw, splitOwnedRaw);
      migrated = true;
    }

    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* 저장 공간이 막혀도 메모리에서 복원한 상태는 버리지 않는다 */
      }
    }
    return { state, recovered: false, backupKey: null, migrated };
  } catch {
    // 원본을 버리지 않는다. 백업 후 초기 상태로 시작한다 (TRD D-3)
    const backupKey = `${STORAGE_KEY}.backup.${Date.now()}`;
    try {
      localStorage.setItem(backupKey, raw);
    } catch {
      /* 용량 초과 시 백업 실패는 감수한다 */
    }
    return { state: initialState(), recovered: true, backupKey, migrated: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function storedVersion(value: unknown): number {
  if (!isRecord(value)) throw new Error('JSON 객체가 아닙니다.');
  const version = Number(value.schemaVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error('올바른 schemaVersion이 없습니다.');
  return version;
}

/** 현재 키의 모든 공개 스키마를 순서대로 최신 상태로 올린다. */
export function migrateUserState(value: unknown): UserState {
  if (!isRecord(value)) throw new Error('JSON 객체가 아닙니다.');
  let data = structuredClone(value);
  let version = storedVersion(data);
  if (version > CURRENT_VERSION) throw new Error(`이 앱보다 새로운 저장 형식입니다: v${version}`);

  while (version < CURRENT_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`마이그레이션 경로 없음: v${version} → v${CURRENT_VERSION}`);
    data = step(data);
    const next = storedVersion(data);
    if (next <= version) throw new Error('마이그레이션이 버전을 올리지 않음');
    version = next;
  }
  return normalize(data);
}

const LEGACY_STARTS: Record<string, SetupState['startLocation']> = {
  grass: 'grass-fields',
  rocky: 'rocky-desert',
  north: 'northern-forest',
  dune: 'dune-desert',
};

/** 단일 HTML 시절 `sops.progress.v1`의 실제 v1/v2 구조를 변환한다. */
export function migrateLegacyProgress(value: unknown): UserState {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    throw new Error('지원하지 않는 레거시 진행 형식입니다.');
  }
  const done = isRecord(value.done) ? value.done : {};
  const setup = isRecord(value.setup) ? value.setup : {};
  return normalize({
    schemaVersion: 2,
    doneMilestones: Object.entries(done).filter(([, checked]) => !!checked).map(([id]) => id),
    ownedAlternates: [],
    setup: {
      startLocation: typeof setup.start === 'string' ? LEGACY_STARTS[setup.start] ?? null : null,
      tutorialSkipped: setup.mode === 'skip',
      resourceMode: setup.random === true ? 'randomized' : 'standard',
    },
    updatedAt: null,
  });
}

/** 리빌드 전 분리 키(`sfops.progress`, `sfops.owned`)를 한 번만 합친다. */
function migrateSplitState(progressRaw: string | null, ownedRaw: string | null): UserState {
  const progress = progressRaw ? JSON.parse(progressRaw) as unknown : null;
  const owned = ownedRaw ? JSON.parse(ownedRaw) as unknown : null;
  if (progress !== null && (!isRecord(progress) || progress.version !== 1)) {
    throw new Error('지원하지 않는 분리 진행 형식입니다.');
  }
  if (owned !== null && (!isRecord(owned) || owned.version !== 1)) {
    throw new Error('지원하지 않는 분리 대체 제작법 형식입니다.');
  }
  return normalize({
    schemaVersion: 2,
    doneMilestones: isRecord(progress) ? progress.ids : [],
    ownedAlternates: isRecord(owned) ? owned.ids : [],
    setup: initialState().setup,
    updatedAt: null,
  });
}

/** 알 수 없는 필드를 떨어뜨리고 타입을 강제한다. 손상된 저장값이 앱을 깨뜨리지 않게. */
function normalize(data: unknown): UserState {
  const base = initialState();
  const record = isRecord(data) ? data : {};
  const setup = isRecord(record.setup) ? record.setup : {};
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const starts: SetupState['startLocation'][] = [
    'grass-fields', 'rocky-desert', 'northern-forest', 'dune-desert', null,
  ];
  const startLocation = starts.includes(setup.startLocation as SetupState['startLocation'])
    ? setup.startLocation as SetupState['startLocation']
    : base.setup.startLocation;
  return {
    schemaVersion: CURRENT_VERSION,
    doneMilestones: [...new Set(arr(record.doneMilestones))],
    ownedAlternates: [...new Set(arr(record.ownedAlternates))],
    setup: {
      startLocation,
      tutorialSkipped: setup.tutorialSkipped === true,
      resourceMode: setup.resourceMode === 'randomized' ? 'randomized' : 'standard',
    },
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
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
  return migrateUserState(JSON.parse(text));
}
