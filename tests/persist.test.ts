import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CURRENT_VERSION,
  LEGACY_PROGRESS_KEY,
  SPLIT_OWNED_KEY,
  SPLIT_PROGRESS_KEY,
  STORAGE_KEY,
  importJson,
  load,
  migrateLegacyProgress,
  migrateUserState,
} from '../src/state/persist.ts';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/${name}`, import.meta.url),
  'utf8',
);

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key: string) { return this.#values.get(key) ?? null; }
  key(index: number) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string) { this.#values.delete(key); }
  setItem(key: string, value: string) { this.#values.set(key, String(value)); }
}

function withStorage(values: Record<string, string>, run: (storage: MemoryStorage) => void) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    run(storage);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('통합 저장 v1 픽스처를 v2로 올리며 사용자 사실을 보존한다', () => {
  const state = migrateUserState(JSON.parse(fixture('user-state-v1.json')));
  assert.equal(state.schemaVersion, CURRENT_VERSION);
  assert.deepEqual(state.doneMilestones, ['Schematic_1-1_C', 'Schematic_1-2_C']);
  assert.deepEqual(state.ownedAlternates, ['Recipe_Alternate_Screw_C']);
  assert.deepEqual(state.setup, {
    startLocation: 'rocky-desert',
    tutorialSkipped: true,
    resourceMode: 'randomized',
  });
  assert.equal(state.updatedAt, '2026-08-20T12:00:00.000Z');
});

test('단일 HTML 시절의 실제 v2 픽스처를 현재 상태로 변환한다', () => {
  const state = migrateLegacyProgress(JSON.parse(fixture('legacy-progress-v2.json')));
  assert.deepEqual(state.doneMilestones, ['Schematic_1-1_C', 'Schematic_1-2_C']);
  assert.deepEqual(state.setup, {
    startLocation: 'northern-forest',
    tutorialSkipped: true,
    resourceMode: 'randomized',
  });
});

test('새 키가 없으면 레거시 키를 읽고 최신 통합 키를 즉시 만든다', () => {
  withStorage({ [LEGACY_PROGRESS_KEY]: fixture('legacy-progress-v2.json') }, (storage) => {
    const result = load();
    assert.equal(result.recovered, false);
    assert.equal(result.migrated, true);
    assert.equal(result.state.schemaVersion, CURRENT_VERSION);
    assert.deepEqual(result.state.doneMilestones, ['Schematic_1-1_C', 'Schematic_1-2_C']);
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)!), result.state);
  });
});

test('분리 저장된 세이브 진척과 대체 제작법을 데이터 손실 없이 합친다', () => {
  withStorage({
    [SPLIT_PROGRESS_KEY]: JSON.stringify({
      version: 1,
      ids: ['Schematic_3-1_C'],
      session: 'Pioneer',
      hours: 42,
    }),
    [SPLIT_OWNED_KEY]: JSON.stringify({ version: 1, ids: ['Recipe_Alternate_Screw_C'] }),
  }, () => {
    const result = load();
    assert.equal(result.migrated, true);
    assert.deepEqual(result.state.doneMilestones, ['Schematic_3-1_C']);
    assert.deepEqual(result.state.ownedAlternates, ['Recipe_Alternate_Screw_C']);
  });
});

test('가져오기도 같은 마이그레이션 경로를 사용하고 미래 버전을 거부한다', () => {
  assert.deepEqual(importJson(fixture('user-state-v1.json')), migrateUserState(JSON.parse(fixture('user-state-v1.json'))));
  assert.throws(
    () => importJson('{"schemaVersion":999}'),
    /새로운 저장 형식/,
  );
});

test('손상된 원문은 덮어쓰지 않고 별도 백업한 뒤 복구 상태를 알린다', () => {
  const raw = '{broken';
  withStorage({ [STORAGE_KEY]: raw }, (storage) => {
    const result = load();
    assert.equal(result.recovered, true);
    assert.equal(result.migrated, false);
    assert.match(result.backupKey ?? '', /^sfops\.v1\.backup\.\d+$/);
    assert.equal(storage.getItem(result.backupKey!), raw);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  });
});
