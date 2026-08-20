/**
 * flows.ts — 가이드에 싣는 공정 흐름도의 정의.
 *
 * 랜딩과 가이드가 같은 그림을 쓰므로 한 곳에서 만든다. 두 벌로 두었더니 한쪽만 고쳐져
 * 서로 다른 대수를 보여줬다.
 *
 * 그림 모델은 FlowChart.astro 참조 — 기계 줄과 분배기 줄(매니폴드)을 세로로 쌓는다.
 * 같은 기계가 여러 대여도 상자를 각각 만든다. "×2" 로 뭉치면 실제로 몇 대를 어디에 놓는지가 안 보인다.
 *
 * 모든 수치는 레시피에서 읽는다. 손으로 적은 값이 없다.
 */
import { building, item, recipe } from './gamedata';
import type { MachineBox, Row, StoreBox } from '../components/FlowChart.astro';

export interface FlowDef {
  rows: Row[];
  caption: string;
}

const inOf = (id: string) => recipe(id).ingredients[0]?.perMinute ?? 0;
const outOf = (id: string) => recipe(id).products[0]?.perMinute ?? 0;
const ko = (id: string) => item(id).ko;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * 필요량 전개 — 목표 품목 N/분을 만들려면 상류가 얼마나 필요한가.
 *
 * 조립기 입력만 세면 안 된다. 그 입력을 만드는 제작기·제련기·채굴기까지 내려가야
 * 실제 노드 소요가 나온다. (가이드가 지능형 도금판 5/분을 철광석 22.5/분이라 적은 적이 있다.
 * 조립기 바로 앞만 세서 나온 값이고 실제는 116.25/분이다.)
 */
const CHAIN: Record<string, string> = {
  Desc_SpaceElevatorPart_1_C: 'Recipe_SpaceElevatorPart_1_C',
  Desc_IronPlateReinforced_C: 'Recipe_IronPlateReinforced_C',
  Desc_Rotor_C: 'Recipe_Rotor_C',
  Desc_IronPlate_C: 'Recipe_IronPlate_C',
  Desc_IronRod_C: 'Recipe_IronRod_C',
  Desc_IronScrew_C: 'Recipe_Screw_C',
  Desc_IronIngot_C: 'Recipe_IngotIron_C',
};

export function expandDemand(itemId: string, perMinute: number): Map<string, number> {
  const need = new Map<string, number>();
  const walk = (id: string, rate: number) => {
    need.set(id, (need.get(id) ?? 0) + rate);
    const rid = CHAIN[id];
    if (!rid) return;
    const r = recipe(rid);
    const out = r.products.find((pr) => pr.item === id)?.perMinute ?? 0;
    if (!out) return;
    for (const g of r.ingredients) walk(g.item, (g.perMinute * rate) / out);
  };
  walk(itemId, perMinute);
  return need;
}

/** 목표 처리량에 필요한 기계 대수와 클럭 */
function plan(recipeId: string, targetPerMinute: number) {
  const out = outOf(recipeId);
  const exact = targetPerMinute / out;
  const count = Math.ceil(exact - 1e-9);
  return { count, clock: Math.round((exact / count) * 1000) / 10, each: targetPerMinute / count };
}

/** 같은 기계를 n 대 만든다. 상자를 각각 만든다 */
function machines(
  n: number,
  make: (i: number) => MachineBox
): { kind: 'machines'; boxes: MachineBox[] } {
  return { kind: 'machines', boxes: Array.from({ length: n }, (_, i) => make(i)) };
}

const bus = (itemId: string, perMinute: number, note?: string): Row => ({
  kind: 'bus',
  bus: { itemKo: ko(itemId), itemId, perMinute, note },
});

/**
 * 초반 철 라인 — 철 노드 하나를 전부 쓰는 크기.
 *
 * **모든 기계를 100% 로 돌린다.** 클럭을 내리면 대수는 줄지만 초반에는 그럴 이유가 없다 —
 * 정수비로 떨어지는 배치가 짓기도 쉽고 나중에 늘리기도 쉽다.
 *
 * 철괴 60 을 30 : 30 으로 나눈다.
 *   철판 쪽 30 → 제작기 한 대(100%) → 철판 20/분
 *   철봉 쪽 30 → 제작기 두 대(100%) → 철봉 30/분
 *     그중 10 만 나사 제작기로 가고(→ 나사 40/분) 나머지 20 은 그대로 납품한다.
 *
 * 산출이 셋이다 — 철판 20 · 철봉 20 · 나사 40. 허브 업그레이드와 티어 1~2 마일스톤이
 * 요구하는 것이 정확히 이 셋이다.
 */
export function ironLine(): FlowDef {
  const miner = building('Build_MinerMk1_C');
  const smelter = building('Build_SmelterMk1_C');
  const constructor = building('Build_ConstructorMk1_C');

  const ore = building('Build_ConveyorBeltMk1_C').beltItemsPerMinute ?? 60;
  const smeltIn = inOf('Recipe_IngotIron_C');
  const smeltOut = outOf('Recipe_IngotIron_C');
  const smelters = ore / smeltIn;
  const ingot = smelters * smeltOut;

  /* 철괴를 절반씩 나눈다 */
  const half = ingot / 2;
  const plateIn = inOf('Recipe_IronPlate_C');
  const plateOut = outOf('Recipe_IronPlate_C');
  const plateMachines = half / plateIn;

  const rodIn = inOf('Recipe_IronRod_C');
  const rodOut = outOf('Recipe_IronRod_C');
  const rodMachines = half / rodIn;
  const rodTotal = rodMachines * rodOut;

  const screwIn = inOf('Recipe_Screw_C');
  const screwOut = outOf('Recipe_Screw_C');
  const screwMachines = 1;
  const rodToScrew = screwIn * screwMachines;
  const rodSpare = rodTotal - rodToScrew;

  /* 이 배치는 정수비 위에 서 있다. 레시피가 바뀌면 그림을 다시 짜야 한다 */
  if (!Number.isInteger(smelters) || !Number.isInteger(plateMachines) || !Number.isInteger(rodMachines)) {
    throw new Error(
      `철 라인이 정수비가 아닙니다 (제련기 ${smelters} · 철판 ${plateMachines} · 철봉 ${rodMachines}).`
    );
  }

  let n = 0;
  const cons = (productKo: string, inKo: string, inRate: number, outRate: number): MachineBox => ({
    ko: `${constructor.ko} #${++n}`,
    machineId: constructor.id,
    inputs: [{ ko: inKo, perMinute: inRate }],
    output: { ko: productKo, perMinute: outRate },
    clock: 100,
  });

  return {
    rows: [
      machines(1, () => ({
        ko: miner.ko,
        machineId: miner.id,
        output: { ko: ko('Desc_OreIron_C'), perMinute: ore },
        clock: 100,
      })),
      bus('Desc_OreIron_C', ore, '분배기 직렬'),
      machines(smelters, (i) => ({
        ko: `${smelter.ko} #${i + 1}`,
        machineId: smelter.id,
        inputs: [{ ko: ko('Desc_OreIron_C'), perMinute: smeltIn }],
        output: { ko: ko('Desc_IronIngot_C'), perMinute: smeltOut },
        clock: 100,
      })),
      bus('Desc_IronIngot_C', ingot, '분배기 직렬'),
      {
        kind: 'machines',
        boxes: [
          {
            ...cons(ko('Desc_IronPlate_C'), ko('Desc_IronIngot_C'), plateIn, plateOut),
            /* 철판은 여기서 끝난다 */
            feedsNext: false,
          },
          ...Array.from({ length: rodMachines }, () =>
            cons(ko('Desc_IronRod_C'), ko('Desc_IronIngot_C'), rodIn, rodOut)
          ),
        ],
      },
      {
        kind: 'bus',
        bus: {
          itemKo: ko('Desc_IronRod_C'),
          itemId: 'Desc_IronRod_C',
          perMinute: rodTotal,
          deliver: { ko: ko('Desc_IronRod_C'), perMinute: rodSpare },
        },
      },
      machines(screwMachines, () =>
        cons(ko('Desc_IronScrew_C'), ko('Desc_IronRod_C'), screwIn, screwOut)
      ),
      {
        kind: 'storage',
        label: '저장 컨테이너로',
        /*
         * 열 번호는 가장 넓은 줄(제작기 3대) 기준이다. 보내는 기계와 같은 열에 두면
         * 선이 곧게 내려와 어디서 왔는지 보인다.
         *   0열 = 제작기 #1(철판) · 1열 = 제작기 #4(나사, 가운데) · 2열 = 철봉 벨트 줄
         */
        boxes: [
          { itemKo: ko('Desc_IronPlate_C'), itemId: 'Desc_IronPlate_C', perMinute: plateOut, col: 0, fromRow: 4 },
          { itemKo: ko('Desc_IronScrew_C'), itemId: 'Desc_IronScrew_C', perMinute: screwOut, col: 1, fromRow: 6 },
          { itemKo: ko('Desc_IronRod_C'), itemId: 'Desc_IronRod_C', perMinute: rodSpare, col: 2, fromRow: 5 },
        ] satisfies StoreBox[],
      },
    ],
    caption: '',
  };
}

/**
 * 허브 6 급유 자동화.
 *
 * 나무와 이파리는 **레시피가 다르다.** 제작기 한 대가 둘 다 처리하지 못하므로 각각 한 대씩 두고
 * 병합기로 합쳐 연소기로 보낸다.
 */
export function biomassLine(withBiofuel = false): FlowDef {
  const constructor = building('Build_ConstructorMk1_C');
  const burner = building('Build_GeneratorBiomass_Automated_C');
  const container = building('Build_StorageContainerMk1_C');

  const bioPerBurner =
    ((burner.powerGenMW ?? 30) / (item('Desc_GenericBiomass_C').energyMJ ?? 180)) * 60;
  /** 두 재료가 절반씩 댄다고 본다. 실제로는 주운 대로 들어가고 벨트가 차면 알아서 멈춘다 */
  const half = bioPerBurner / 2;
  const woodIn = (half / outOf('Recipe_Biomass_Wood_C')) * inOf('Recipe_Biomass_Wood_C');
  const leafIn = (half / outOf('Recipe_Biomass_Leaves_C')) * inOf('Recipe_Biomass_Leaves_C');

  const rows: Row[] = [
    {
      kind: 'machines',
      boxes: [
        /* 컨테이너는 만들지 않는다. 보관하는 물건에 분당은 뜻이 없다 */
        { ko: container.ko, machineId: container.id, note: `${ko('Desc_Wood_C')} 보관` },
        { ko: container.ko, machineId: container.id, note: `${ko('Desc_Leaves_C')} 보관` },
      ],
    },
    {
      kind: 'machines',
      boxes: [
        {
          ko: `${constructor.ko} #1`,
          machineId: constructor.id,
          inputs: [{ ko: ko('Desc_Wood_C'), perMinute: woodIn }],
          output: { ko: ko('Desc_GenericBiomass_C'), perMinute: half },
          clock: Math.round((half / outOf('Recipe_Biomass_Wood_C')) * 1000) / 10,
        },
        {
          ko: `${constructor.ko} #2`,
          machineId: constructor.id,
          inputs: [{ ko: ko('Desc_Leaves_C'), perMinute: leafIn }],
          output: { ko: ko('Desc_GenericBiomass_C'), perMinute: half },
          clock: Math.round((half / outOf('Recipe_Biomass_Leaves_C')) * 1000) / 10,
        },
      ],
    },
    bus('Desc_GenericBiomass_C', bioPerBurner, '병합기로 합침'),
  ];

  let caption =
    `나무와 이파리는 레시피가 달라 제작기가 각각 필요합니다. 나온 바이오매스를 병합기로 합쳐 ` +
    `연소기로 보냅니다. 클럭은 건드리지 않아도 됩니다 — 벨트가 차면 제작기가 멈추고, ` +
    `연소기가 쓰는 만큼만 다시 돕니다.`;

  if (withBiofuel) {
    const fuelPerBurner =
      ((burner.powerGenMW ?? 30) / (item('Desc_Biofuel_C').energyMJ ?? 450)) * 60;
    const bioForFuel = (fuelPerBurner / outOf('Recipe_Biofuel_C')) * inOf('Recipe_Biofuel_C');
    rows.push(
      machines(1, () => ({
        ko: `${constructor.ko} #3`,
        machineId: constructor.id,
        inputs: [{ ko: ko('Desc_GenericBiomass_C'), perMinute: bioForFuel }],
        output: { ko: ko('Desc_Biofuel_C'), perMinute: fuelPerBurner },
        clock: Math.round((fuelPerBurner / outOf('Recipe_Biofuel_C')) * 1000) / 10,
      })),
      bus('Desc_Biofuel_C', fuelPerBurner),
      machines(1, () => ({
        ko: burner.ko,
        machineId: burner.id,
        inputs: [{ ko: ko('Desc_Biofuel_C'), perMinute: fuelPerBurner }],
        output: { ko: '전력', perMinute: burner.powerGenMW ?? 30, unit: ' MW' },
      }))
    );
    caption =
      `나무와 이파리는 레시피가 달라 제작기가 각각 필요합니다. 합친 바이오매스를 제작기 한 대가 ` +
      `고체 바이오 연료로 바꿉니다 — 연소기 한 대가 바이오매스 ${fmt(bioPerBurner)}개/분 대신 ` +
      `고체 바이오 연료 ${fmt(fuelPerBurner)}개/분으로 돕니다. 원료로 환산하면 ${fmt(bioForFuel)}개/분이라 ` +
      `${Math.round((1 - bioForFuel / bioPerBurner) * 100)}%를 아끼고, 벨트 한 칸당 열량이 ` +
      `${item('Desc_Biofuel_C').energyMJ! / item('Desc_GenericBiomass_C').energyMJ!}배입니다.`;
  } else {
    rows.push(
      machines(1, () => ({
        ko: burner.ko,
        machineId: burner.id,
        inputs: [{ ko: ko('Desc_GenericBiomass_C'), perMinute: bioPerBurner }],
        output: { ko: '전력', perMinute: burner.powerGenMW ?? 30, unit: ' MW' },
      }))
    );
  }

  return { rows, caption };
}

/**
 * 티어 2 지능형 도금판 라인.
 *
 * 조립기 대수는 적게 나오지만 이 그림이 감추는 것은 상류다. 회전자가 나사를 대량으로 쓰기 때문에
 * 노드 소요가 보강된 철판 때의 두 배 가까이 된다.
 */
export function smartPlatingLine(target = 5): FlowDef {
  const assembler = building('Build_AssemblerMk1_C');
  const rip = plan('Recipe_IronPlateReinforced_C', target);
  const rotor = plan('Recipe_Rotor_C', target);
  const smart = plan('Recipe_SpaceElevatorPart_1_C', target);
  const need = expandDemand('Desc_SpaceElevatorPart_1_C', target);

  return {
    rows: [
      {
        kind: 'machines',
        boxes: [
          ...Array.from({ length: rip.count }, (_, i) => ({
            ko: `${assembler.ko} #${i + 1}`,
            machineId: assembler.id,
            output: { ko: ko('Desc_IronPlateReinforced_C'), perMinute: rip.each },
            clock: rip.clock,
          })),
          ...Array.from({ length: rotor.count }, (_, i) => ({
            ko: `${assembler.ko} #${rip.count + i + 1}`,
            machineId: assembler.id,
            output: { ko: ko('Desc_Rotor_C'), perMinute: rotor.each },
            clock: rotor.clock,
          })),
        ],
      },
      machines(smart.count, (i) => ({
        ko: `${assembler.ko} #${rip.count + rotor.count + i + 1}`,
        machineId: assembler.id,
        inputs: [
          { ko: ko('Desc_IronPlateReinforced_C'), perMinute: target / smart.count },
          { ko: ko('Desc_Rotor_C'), perMinute: target / smart.count },
        ],
        output: { ko: ko('Desc_SpaceElevatorPart_1_C'), perMinute: smart.each },
        clock: smart.clock,
      })),
    ],
    caption:
      `조립기는 ${rip.count + rotor.count + smart.count}대면 되지만 이 그림이 감추는 것은 상류입니다 — ` +
      `여기까지 오려면 나사 ${fmt(need.get('Desc_IronScrew_C') ?? 0)}개/분, ` +
      `철광석 ${fmt(need.get('Desc_OreIron_C') ?? 0)}개/분이 필요합니다. 노드 하나로는 못 댑니다.`,
  };
}
