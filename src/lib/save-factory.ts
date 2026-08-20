/**
 * save-factory.ts — 세이브에서 "내가 실제로 지은 공장"을 읽어 낸다.
 *
 * 왜 이걸 만드나:
 *   이 앱은 "지금 뭘 해야 하는지"를 답하기로 했다. 마일스톤은 세이브로 알아냈지만,
 *   정작 **지금 내 공장이 뭐가 문제인지**는 몰랐다.
 *   그런데 세이브에 그 답이 이미 들어 있다 — 게임이 설비마다 직전 5분의 가동률을 적어 둔다.
 *   가동률이 낮은 설비가 곧 병목이고, 그게 지금 손대야 할 자리다.
 *
 * 조사로 확인한 것들(전부 실제 세이브에서 값을 찍어 봤다):
 *   - 건물은 두 군데에 나뉘어 있다. 인벤토리를 가진 것은 액터로, 토대·벽 같은 것은
 *     FGLightweightBuildableSubsystem 이 통째로 들고 있다. 뒤쪽을 빼면 건물의 70%가 사라진다
 *   - 기본값은 저장되지 않는다. 클럭(mCurrentPotential)은 100%가 아닌 설비에만 있다
 *   - mIsProducing 은 못 쓴다. 저장 직전 틱 상태라 실제로 돌던 설비도 false 였다
 *   - 인벤토리는 별도 객체다. instanceName 으로 찾아가야 한다
 *   - 경로 중간과 클래스명의 대소문자가 다른 경우가 있다(MinerMK1 / MinerMk1).
 *     항상 마지막 마디만 잘라 쓴다
 *
 * 세이브 파일을 서버로 보내지 않는다(CLAUDE.md). 전부 브라우저 안에서 끝난다.
 */

/** 우리 지도와 같은 변환 */
const X0 = -324700;
const X_RANGE = 750100;
const Y0 = -375000;
const Y_RANGE = 750000;

export interface CheckupCatalog {
  buildings: Record<
    string,
    { ko: string; cat: string; p: number | null; g: number | null; e: number | null }
  >;
  recipes: Record<string, { ko: string; out: string | null; per: number }>;
  items: Record<string, string>;
  nodes: Record<string, { r: string; p: string }>;
  belts: Record<string, number>;
}

export interface FactoryMachine {
  /** 세이브 안의 고유 이름. 간선이 이것으로 설비를 가리킨다 */
  key: string;
  id: string;
  ko: string;
  recipe: string | null;
  recipeKo: string | null;
  /** 1 = 100% */
  clock: number;
  /** 0~1. 직전 측정 창의 가동률. 없으면 null */
  uptime: number | null;
  fx: number;
  fy: number;
  /** 채굴기만. 무슨 노드에 올라가 있나 */
  node: { id: string; resourceKo: string; purity: string } | null;
  /** 이 설비가 만드는 것의 이론 산출 (분당). 레시피와 클럭을 반영한다 */
  ratePerMinute: number | null;
  outItem: string | null;
}

export interface FactoryModel {
  session: string;
  hours: number;
  machines: FactoryMachine[];
  /** Build_*_C → 개수. 경량 건물(토대·벽)도 포함한다 */
  counts: Record<string, number>;
  power: { genMW: number; useMW: number; circuits: number };
  /** Desc_*_C → 창고와 설비에 든 총 개수 */
  stock: Record<string, number>;
  /** 설비 → 설비. 벨트를 따라가 이은 것이다 */
  edges: { from: string; to: string }[];
  /** 아무 데도 안 이어진 출력구 수 */
  danglingOutputs: number;
  /** 세이브에 든 객체 수 — 제대로 읽었는지 눈으로 확인하는 값 */
  objects: number;
}

/* 파서가 주는 객체는 형태가 느슨하다. 필요한 부분만 좁게 적는다 */
interface Ref {
  pathName?: string;
}
interface Prop {
  value?: unknown;
  values?: unknown[];
}
interface SaveObj {
  type?: string;
  typePath?: string;
  instanceName?: string;
  parentEntityName?: string;
  components?: Ref[];
  transform?: { translation?: { x: number; y: number; z: number } };
  properties?: Record<string, Prop>;
  specialProperties?: Record<string, unknown>;
}

const tail = (s: string | undefined) => (s ?? '').split('.').pop() ?? '';
const num = (p: Prop | undefined): number | undefined =>
  typeof p?.value === 'number' ? p.value : undefined;
const ref = (p: Prop | undefined): string | undefined =>
  (p?.value as { pathName?: string } | undefined)?.pathName;

/** 물건을 나르기만 하는 것. 간선을 따라갈 때 건너뛴다 */
const TRANSPORT = /Conveyor(Belt|Lift)|FoundationPassthrough|Pipeline|PipeMk/;

export async function readFactory(
  buf: ArrayBuffer,
  catalog: CheckupCatalog,
  name = 'save'
): Promise<FactoryModel> {
  const { Parser } = await import('@etothepii/satisfactory-file-parser');
  const save = Parser.ParseSave(name, buf) as unknown as {
    header?: { sessionName?: string; playDurationSeconds?: number };
    levels: Record<string, { objects?: SaveObj[] }>;
  };

  const all: SaveObj[] = [];
  for (const lv of Object.values(save.levels ?? {})) for (const o of lv.objects ?? []) all.push(o);
  const byName = new Map(all.map((o) => [o.instanceName ?? '', o]));

  /* ---------------------------------------------------------------- 건물 수 */
  const counts: Record<string, number> = {};
  const actors = all.filter(
    (o) => o.type === 'SaveEntity' && /^Build_.*_C$/.test(tail(o.typePath))
  );
  for (const o of actors) {
    const id = tail(o.typePath);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  /* 토대·벽은 액터가 아니라 서브시스템 하나가 통째로 들고 있다 */
  for (const o of all) {
    if (!/FGLightweightBuildableSubsystem/.test(o.typePath ?? '')) continue;
    const list = (o.specialProperties as { buildables?: unknown[] } | undefined)?.buildables ?? [];
    for (const b of list as { typeReference?: Ref; instances?: unknown[] }[]) {
      const id = tail(b.typeReference?.pathName);
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + (b.instances?.length ?? 0);
    }
  }

  /* ---------------------------------------------------------------- 설비 */
  const machines: FactoryMachine[] = [];
  for (const o of actors) {
    const id = tail(o.typePath);
    const meta = catalog.buildings[id];
    const p = o.properties ?? {};
    const rid = tail(ref(p.mCurrentRecipe));
    const isMaker = !!rid || meta?.cat === 'extractor' || meta?.cat === 'generator';
    if (!isMaker) continue;

    const t = o.transform?.translation;
    if (!t) continue;

    /* 가동률. 생산한 시간 ÷ 측정 창. 게임이 5분 창으로 적어 둔다 */
    const made = num(p.mLastProductivityMeasurementProduceDuration);
    const win = num(p.mLastProductivityMeasurementDuration);
    const uptime = made != null && win ? Math.min(1, made / win) : null;

    const nodeId = tail(ref(p.mExtractableResource));
    const nodeMeta = nodeId ? catalog.nodes[nodeId] : undefined;

    const clock = num(p.mCurrentPotential) ?? 1;
    const r = rid ? catalog.recipes[rid] : undefined;

    machines.push({
      key: o.instanceName ?? '',
      id,
      ko: meta?.ko ?? id,
      recipe: rid || null,
      recipeKo: r?.ko ?? null,
      clock,
      uptime,
      fx: (t.x - X0) / X_RANGE,
      fy: (t.y - Y0) / Y_RANGE,
      node: nodeMeta ? { id: nodeId, resourceKo: nodeMeta.r, purity: nodeMeta.p } : null,
      ratePerMinute: r ? r.per * clock : null,
      outItem: r?.out ?? null,
    });
  }

  /* ---------------------------------------------------------------- 전력 */
  let genMW = 0;
  let useMW = 0;
  for (const o of actors) {
    const pi = ref(o.properties?.mPowerInfo);
    if (!pi) continue;
    const info = byName.get(pi);
    useMW += num(info?.properties?.mTargetConsumption) ?? 0;
    genMW += num(info?.properties?.mDynamicProductionCapacity) ?? 0;
  }
  let circuits = 0;
  for (const o of all) {
    if (!/BP_CircuitSubsystem/.test(o.typePath ?? '')) continue;
    circuits = ((o.specialProperties as { circuits?: unknown[] } | undefined)?.circuits ?? []).length;
  }

  /* ---------------------------------------------------------------- 재고 */
  const stock: Record<string, number> = {};
  const addInventory = (path: string | undefined) => {
    if (!path) return;
    const inv = byName.get(path);
    const stacks = inv?.properties?.mInventoryStacks?.values as
      | { properties?: Record<string, Prop> }[]
      | undefined;
    for (const st of stacks ?? []) {
      const itemId = (
        st.properties?.Item?.value as { itemReference?: Ref } | undefined
      )?.itemReference?.pathName;
      const n = num(st.properties?.NumItems);
      const key = tail(itemId);
      if (!key || !n) continue;
      stock[key] = (stock[key] ?? 0) + n;
    }
  };
  for (const o of actors) {
    const p = o.properties ?? {};
    addInventory(ref(p.mStorageInventory));
    addInventory(ref(p.mInputInventory));
    addInventory(ref(p.mOutputInventory));
  }

  /* ------------------------------------------------------- 벨트 연결 그래프 */
  const conns = all.filter((o) => /FGFactoryConnectionComponent/.test(o.typePath ?? ''));
  const link = new Map<string, string>();
  for (const c of conns) {
    const to = ref(c.properties?.mConnectedComponent);
    if (to) link.set(c.instanceName ?? '', to);
  }
  const ownerOf = (comp: string) =>
    byName.get(comp)?.parentEntityName ?? comp.split('.').slice(0, -1).join('.');
  const connsOf = (owner: string) =>
    (byName.get(owner)?.components ?? [])
      .map((x) => x.pathName ?? '')
      .filter((p) => /FGFactoryConnectionComponent/.test(byName.get(p)?.typePath ?? ''));

  /** 출력구에서 벨트를 타고 내려가 닿는 설비를 찾는다 */
  function downstream(from: string): string | null {
    let cur = link.get(from);
    /* 벨트가 길게 이어질 수 있다. 무한 루프만 막는다 */
    for (let i = 0; cur && i < 400; i++) {
      const owner = ownerOf(cur);
      if (!TRANSPORT.test(owner)) return owner;
      const next = connsOf(owner).filter((c) => c !== cur);
      if (!next.length) return null;
      cur = link.get(next[0]!);
    }
    return null;
  }

  const machineKeys = new Set(machines.map((m) => m.key));
  const edges: { from: string; to: string }[] = [];
  let danglingOutputs = 0;
  for (const c of conns) {
    if (!/^Output/.test(tail(c.instanceName))) continue;
    const owner = ownerOf(c.instanceName ?? '');
    if (!machineKeys.has(owner)) continue;
    const to = downstream(c.instanceName ?? '');
    if (!to) {
      danglingOutputs++;
      continue;
    }
    edges.push({ from: owner, to });
  }

  const header = save.header ?? {};
  return {
    session: header.sessionName || name,
    hours: Math.round(((header.playDurationSeconds ?? 0) / 3600) * 10) / 10,
    machines,
    counts,
    power: { genMW: Math.round(genMW * 10) / 10, useMW: Math.round(useMW * 10) / 10, circuits },
    stock,
    edges,
    danglingOutputs,
    objects: all.length,
  };
}
