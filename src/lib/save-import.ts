/**
 * save-import.ts — 인게임 세이브(.sav)를 읽어 진행 상황을 가져온다.
 *
 * 왜 되는가:
 *   슬러그·소머슬룹·머서 구체·화물칸은 맵에 고정으로 놓여 있고, 게임은 **손댄 것만**
 *   세이브에 적는다. 그래서 세이브에 있는 수집품 액터 = 이미 주운 것이다.
 *   (플레이 24시간 세이브 228건, 35시간 세이브 343건. 전체 1764건보다 훨씬 적다.)
 *   액터 이름의 마지막 마디가 우리 수집품 id 와 그대로 같다 — 228/228 일치를 확인했다.
 *
 * 대체 제작법은 mPurchasedSchematics 에서 가져온다. 이름 규칙으로 유추하지 않고
 * 배포 데이터에서 만든 지도(save-unlocks.json)를 쓴다 — 하드 드라이브와 MAM 양쪽에서
 * 같은 제작법이 나오는 경우가 있기 때문이다.
 *
 * 세이브 파일을 서버로 보내지 않는다(CLAUDE.md). 전부 브라우저 안에서 끝난다.
 * 파서는 2.6MB짜리라 파일을 고른 뒤에야 내려받는다.
 */

/** 세이브에 나타나는 수집품 클래스 → 우리 종류 */
const COLLECTIBLE_CLASS: Record<string, string> = {
  BP_Crystal_C: 'slug1',
  BP_Crystal_mk2_C: 'slug2',
  BP_Crystal_mk3_C: 'slug3',
  BP_WAT1_C: 'sloop',
  BP_WAT2_C: 'mercer',
  BP_DropPod_C: 'drive',
};

export interface SaveReport {
  /** 세이브 이름 */
  session: string;
  /** 플레이 시간(시) */
  hours: number;
  /** 주운 수집품 id */
  collected: string[];
  /** 종류별로 몇 개를 주웠나 */
  byKind: Record<string, number>;
  /** 딴 대체 제작법 id */
  alternates: string[];
  /** 산 스키매틱 수 — 세이브를 제대로 읽었는지 눈으로 확인하는 값 */
  schematics: number;
}

const tail = (s: string) => s.split('.').pop() ?? s;

export async function readSave(
  file: File,
  unlockMap: Record<string, string[]>
): Promise<SaveReport> {
  const buf = await file.arrayBuffer();
  /* 파일을 고른 뒤에야 파서를 내려받는다 */
  const { Parser } = await import('@etothepii/satisfactory-file-parser');
  const save = Parser.ParseSave(file.name.replace(/\.sav$/i, ''), buf) as {
    header?: { sessionName?: string; playDurationSeconds?: number };
    levels: Record<string, { objects?: { typePath?: string; instanceName?: string }[] }>;
  };

  const collected: string[] = [];
  const byKind: Record<string, number> = {};
  for (const lv of Object.values(save.levels ?? {})) {
    for (const o of lv.objects ?? []) {
      const kind = COLLECTIBLE_CLASS[tail(o.typePath ?? '')];
      if (!kind || !o.instanceName) continue;
      collected.push(tail(o.instanceName));
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
  }

  /* 스키매틱은 매니저 객체 하나가 통째로 들고 있다 */
  const alternates = new Set<string>();
  let schematics = 0;
  for (const lv of Object.values(save.levels ?? {})) {
    for (const o of lv.objects ?? []) {
      if (!/BP_SchematicManager/.test(o.typePath ?? '')) continue;
      const arr = (o as { properties?: Record<string, { values?: { pathName?: string }[] }> })
        .properties?.mPurchasedSchematics?.values;
      if (!Array.isArray(arr)) continue;
      schematics = arr.length;
      for (const v of arr) {
        for (const r of unlockMap[tail(v.pathName ?? '')] ?? []) alternates.add(r);
      }
    }
  }

  const header = save.header ?? {};
  return {
    session: header.sessionName || file.name,
    hours: Math.round(((header.playDurationSeconds ?? 0) / 3600) * 10) / 10,
    collected,
    byKind,
    alternates: [...alternates],
    schematics,
  };
}
