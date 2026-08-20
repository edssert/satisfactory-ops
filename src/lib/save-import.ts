/**
 * save-import.ts — 인게임 세이브(.sav)를 읽어 진행 상황을 가져온다.
 *
 * 주운 것을 어디서 읽나:
 *   레벨마다 `collectables` 목록이 따로 있다. 이게 **실제로 주운 것**이다.
 *   경로의 마지막 마디가 우리 수집품 id 와 그대로 같다.
 *
 *   처음에는 세이브에 들어 있는 수집품 액터를 주운 것으로 봤다. 틀렸다 —
 *   그건 **지나간 지역에 있는 것**이지 주운 것이 아니다. 36시간 세이브에서 액터는 228개인데
 *   실제로 주운 것은 14개였고, 창고 재고(파란 슬러그 5 + 동력 조각 1, 노란 1, 소머슬룹 1)와
 *   맞는 쪽은 14개였다. 지도가 주운 것을 열 배 넘게 부풀려 표시하고 있었다.
 *
 * 대체 제작법은 mPurchasedSchematics 에서 가져온다. 이름 규칙으로 유추하지 않고
 * 배포 데이터에서 만든 지도(save-unlocks.json)를 쓴다 — 하드 드라이브와 MAM 양쪽에서
 * 같은 제작법이 나오는 경우가 있기 때문이다.
 *
 * 세이브 파일을 서버로 보내지 않는다(CLAUDE.md). 전부 브라우저 안에서 끝난다.
 * 파서는 2.6MB짜리라 파일을 고른 뒤에야 내려받는다.
 */

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
  /** 산 스키매틱의 클래스명. 마일스톤 id 와 그대로 같아서 진행 상황을 여기서 뽑는다 */
  schematicIds: string[];
}

const tail = (s: string) => s.split('.').pop() ?? s;

export async function readSave(
  file: File,
  unlockMap: Record<string, string[]>,
  /** 우리가 아는 수집품 id → 종류. 모르는 것(버섯·열매·머서 사당)은 세지 않는다 */
  kindOf: Record<string, string> = {}
): Promise<SaveReport> {
  const buf = await file.arrayBuffer();
  /* 파일을 고른 뒤에야 파서를 내려받는다 */
  const { Parser } = await import('@etothepii/satisfactory-file-parser');
  const save = Parser.ParseSave(file.name.replace(/\.sav$/i, ''), buf) as {
    header?: { sessionName?: string; playDurationSeconds?: number };
    levels: Record<
      string,
      {
        objects?: { typePath?: string; instanceName?: string }[];
        collectables?: { pathName?: string }[];
      }
    >;
  };

  const collected: string[] = [];
  const byKind: Record<string, number> = {};
  for (const lv of Object.values(save.levels ?? {})) {
    for (const c of lv.collectables ?? []) {
      const id = tail(c.pathName ?? '');
      const kind = kindOf[id];
      /* 버섯·열매처럼 우리가 안 다루는 것도 여기 섞여 있다. 아는 것만 센다 */
      if (!kind) continue;
      collected.push(id);
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
  }

  /* 스키매틱은 매니저 객체 하나가 통째로 들고 있다 */
  const alternates = new Set<string>();
  let schematicIds: string[] = [];
  for (const lv of Object.values(save.levels ?? {})) {
    for (const o of lv.objects ?? []) {
      if (!/BP_SchematicManager/.test(o.typePath ?? '')) continue;
      const arr = (o as { properties?: Record<string, { values?: { pathName?: string }[] }> })
        .properties?.mPurchasedSchematics?.values;
      if (!Array.isArray(arr)) continue;
      schematicIds = arr.map((v) => tail(v.pathName ?? ''));
      for (const id of schematicIds) {
        for (const r of unlockMap[id] ?? []) alternates.add(r);
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
    schematics: schematicIds.length,
    schematicIds,
  };
}
