/**
 * flows.ts — 가이드에 싣는 공정 흐름도의 정의.
 *
 * 랜딩과 가이드가 같은 그림을 쓰므로 한 곳에서 만든다. 두 벌로 두었더니 한쪽만 고쳐져
 * 서로 다른 대수를 보여줬다.
 *
 * 그림 모델은 FlowChart.astro 참조 — 상자를 줄로 쌓고 `links` 로 기계끼리 직접 잇는다.
 * 연결을 자동으로 만들지 않는 이유: 제련기 두 대를 병합기로 합쳤다가 다시 뿌리는 그림이
 * 나오는데 실제로는 그렇게 짓지 않는다. 제련기 한 대의 산출을 제작기 한 대가 통째로 먹으면
 * 벨트 한 줄로 직결한다.
 *
 * 모든 수치는 레시피에서 읽는다. 손으로 적은 값이 없다.
 */
import { building, item, recipe } from './gamedata';
import type { Link, MachineBox, Row, StoreBox } from '../components/FlowChart.astro';

export interface FlowDef {
  rows: Row[];
  links: Link[];
  caption: string;
  /** 투입이 둘 이상이라 한 줄이 긴 그림 — 상자를 넓혀야 글자가 안 잘린다 */
  wide?: boolean;
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

/**
 * 초반 철 라인 — 철 노드 하나를 전부 쓰는 크기.
 *
 * 모든 기계를 100% 로 돌린다. 클럭을 내리면 대수는 줄지만 초반에는 그럴 이유가 없다 —
 * 정수비로 떨어지는 배치가 짓기도 쉽고 나중에 늘리기도 쉽다.
 *
 * 배선이 이 그림의 핵심이다. 병합기가 한 대도 없다:
 *   채굴기 60 → 분배기 → 제련기 두 대(각 30)
 *   제련기 #1 30 → 제작기 #1 이 통째로 먹는다 (철판 20/분)
 *   제련기 #2 30 → 분배기 → 제작기 #2·#3 (각 15, 철봉 15/분씩)
 *   제작기 #2 의 철봉 15 → 분배기 → 나사 제작기 10 · 컨테이너 5
 *   제작기 #3 의 철봉 15 → 컨테이너 (컨테이너는 벨트 두 줄을 직접 받는다)
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

  const plateIn = inOf('Recipe_IronPlate_C');
  const plateOut = outOf('Recipe_IronPlate_C');
  const rodIn = inOf('Recipe_IronRod_C');
  const rodOut = outOf('Recipe_IronRod_C');
  const screwIn = inOf('Recipe_Screw_C');
  const screwOut = outOf('Recipe_Screw_C');

  /*
   * 이 그림은 정수비 위에 서 있다. 레시피가 바뀌면 배선이 통째로 달라지므로 조용히
   * 틀린 그림을 내는 대신 빌드를 실패시킨다.
   *   - 제련기 두 대(채굴기 한 대가 정확히 두 대분)
   *   - 제련기 #1 한 대분이 철판 제작기 한 대분과 같음
   *   - 제련기 #2 한 대분이 철봉 제작기 두 대분과 같음
   */
  const rodMachines = smeltOut / rodIn;
  if (smelters !== 2 || smeltOut !== plateIn || rodMachines !== 2) {
    throw new Error(
      `철 라인의 정수비가 깨졌습니다 (제련기 ${smelters} · 철판 ${smeltOut}/${plateIn} · 철봉 ${rodMachines}).`
    );
  }

  const rodEach = rodOut;
  const rodSpare = rodEach - screwIn;
  const rodStored = rodEach + rodSpare;

  let n = 0;
  const cons = (
    productKo: string,
    inKo: string,
    inRate: number,
    outRate: number,
    col: number
  ): MachineBox => ({
    ko: `${constructor.ko} #${++n}`,
    machineId: constructor.id,
    inputs: [{ ko: inKo, perMinute: inRate }],
    output: { ko: productKo, perMinute: outRate },
    clock: 100,
    col,
  });

  const rows: Row[] = [
    {
      kind: 'machines',
      boxes: [
        {
          ko: miner.ko,
          machineId: miner.id,
          output: { ko: ko('Desc_OreIron_C'), perMinute: ore },
          clock: 100,
          col: 1,
        },
      ],
    },
    {
      kind: 'machines',
      boxes: [0, 2].map((col, i) => ({
        ko: `${smelter.ko} #${i + 1}`,
        machineId: smelter.id,
        inputs: [{ ko: ko('Desc_OreIron_C'), perMinute: smeltIn }],
        output: { ko: ko('Desc_IronIngot_C'), perMinute: smeltOut },
        clock: 100,
        col,
      })),
    },
    {
      kind: 'machines',
      boxes: [
        cons(ko('Desc_IronPlate_C'), ko('Desc_IronIngot_C'), plateIn, plateOut, 0),
        cons(ko('Desc_IronRod_C'), ko('Desc_IronIngot_C'), rodIn, rodOut, 1),
        cons(ko('Desc_IronRod_C'), ko('Desc_IronIngot_C'), rodIn, rodOut, 2),
      ],
    },
    {
      kind: 'machines',
      boxes: [cons(ko('Desc_IronScrew_C'), ko('Desc_IronRod_C'), screwIn, screwOut, 1)],
    },
    {
      kind: 'storage',
      label: '저장 컨테이너로',
      boxes: [
        { itemKo: ko('Desc_IronPlate_C'), itemId: 'Desc_IronPlate_C', perMinute: plateOut, col: 0 },
        { itemKo: ko('Desc_IronScrew_C'), itemId: 'Desc_IronScrew_C', perMinute: screwOut, col: 1 },
        { itemKo: ko('Desc_IronRod_C'), itemId: 'Desc_IronRod_C', perMinute: rodStored, col: 2 },
      ] satisfies StoreBox[],
    },
  ];

  const links: Link[] = [
    { from: [0, 0], to: [1, 0], perMinute: smeltIn },
    { from: [0, 0], to: [1, 1], perMinute: smeltIn },
    /* 제련기 #1 한 대분을 철판 제작기가 통째로 먹는다 — 분배기도 병합기도 없다 */
    { from: [1, 0], to: [2, 0] },
    { from: [1, 1], to: [2, 1], perMinute: rodIn },
    { from: [1, 1], to: [2, 2], perMinute: rodIn },
    { from: [2, 1], to: [3, 0], perMinute: screwIn },
    { from: [2, 1], to: [4, 2], perMinute: rodSpare },
    { from: [2, 2], to: [4, 2] },
    { from: [2, 0], to: [4, 0] },
    { from: [3, 0], to: [4, 1] },
  ];

  return { rows, links, caption: '' };
}

/**
 * 허브 6 급유 자동화.
 *
 * 나무와 이파리는 레시피가 다르다. 제작기 한 대가 둘 다 처리하지 못하므로 각각 한 대씩 두고
 * 병합기로 합쳐 연소기로 보낸다. 여기서는 병합기가 실제로 필요하다 — 같은 물건(바이오매스)이
 * 연소기 투입구 하나로 들어가기 때문이다.
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
        { ko: container.ko, machineId: container.id, note: `${ko('Desc_Wood_C')} 보관`, col: 0 },
        { ko: container.ko, machineId: container.id, note: `${ko('Desc_Leaves_C')} 보관`, col: 1 },
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
          col: 0,
        },
        {
          ko: `${constructor.ko} #2`,
          machineId: constructor.id,
          inputs: [{ ko: ko('Desc_Leaves_C'), perMinute: leafIn }],
          output: { ko: ko('Desc_GenericBiomass_C'), perMinute: half },
          clock: Math.round((half / outOf('Recipe_Biomass_Leaves_C')) * 1000) / 10,
          col: 1,
        },
      ],
    },
  ];

  const links: Link[] = [
    { from: [0, 0], to: [1, 0] },
    { from: [0, 1], to: [1, 1] },
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
      {
        kind: 'machines',
        boxes: [
          {
            ko: `${constructor.ko} #3`,
            machineId: constructor.id,
            inputs: [{ ko: ko('Desc_GenericBiomass_C'), perMinute: bioForFuel }],
            output: { ko: ko('Desc_Biofuel_C'), perMinute: fuelPerBurner },
            clock: Math.round((fuelPerBurner / outOf('Recipe_Biofuel_C')) * 1000) / 10,
          },
        ],
      },
      {
        kind: 'machines',
        boxes: [
          {
            ko: burner.ko,
            machineId: burner.id,
            inputs: [{ ko: ko('Desc_Biofuel_C'), perMinute: fuelPerBurner }],
            output: { ko: '전력', perMinute: burner.powerGenMW ?? 30, unit: ' MW' },
          },
        ],
      }
    );
    links.push(
      { from: [1, 0], to: [2, 0] },
      { from: [1, 1], to: [2, 0] },
      { from: [2, 0], to: [3, 0] }
    );
    caption =
      `나무와 이파리는 레시피가 달라 제작기가 각각 필요합니다. 합친 바이오매스를 제작기 한 대가 ` +
      `고체 바이오 연료로 바꿉니다 — 연소기 한 대가 바이오매스 ${fmt(bioPerBurner)}개/분 대신 ` +
      `고체 바이오 연료 ${fmt(fuelPerBurner)}개/분으로 돕니다. 원료로 환산하면 ${fmt(bioForFuel)}개/분이라 ` +
      `${Math.round((1 - bioForFuel / bioPerBurner) * 100)}%를 아끼고, 벨트 한 칸당 열량이 ` +
      `${item('Desc_Biofuel_C').energyMJ! / item('Desc_GenericBiomass_C').energyMJ!}배입니다.`;
  } else {
    rows.push({
      kind: 'machines',
      boxes: [
        {
          ko: burner.ko,
          machineId: burner.id,
          inputs: [{ ko: ko('Desc_GenericBiomass_C'), perMinute: bioPerBurner }],
          output: { ko: '전력', perMinute: burner.powerGenMW ?? 30, unit: ' MW' },
        },
      ],
    });
    links.push({ from: [1, 0], to: [2, 0] }, { from: [1, 1], to: [2, 0] });
  }

  return { rows, links, caption };
}

/**
 * 티어 2 지능형 도금판 라인.
 *
 * 보강된 철판과 회전자는 서로 다른 물건이라 조립기 투입구가 따로다. 병합기가 필요 없다.
 * 조립기 대수는 적게 나오지만 이 그림이 감추는 것은 상류다 — 회전자가 나사를 대량으로 쓴다.
 */
export function smartPlatingLine(target = 5): FlowDef {
  const assembler = building('Build_AssemblerMk1_C');
  const container = building('Build_StorageContainerMk1_C');
  const rip = plan('Recipe_IronPlateReinforced_C', target);
  const rotor = plan('Recipe_Rotor_C', target);
  const smart = plan('Recipe_SpaceElevatorPart_1_C', target);
  const need = expandDemand('Desc_SpaceElevatorPart_1_C', target);

  const makers = [
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
  ];

  const rows: Row[] = [
    { kind: 'machines', boxes: makers },
    {
      kind: 'machines',
      boxes: Array.from({ length: smart.count }, (_, i) => ({
        ko: `${assembler.ko} #${rip.count + rotor.count + i + 1}`,
        machineId: assembler.id,
        inputs: [
          { ko: ko('Desc_IronPlateReinforced_C'), perMinute: target / smart.count },
          { ko: ko('Desc_Rotor_C'), perMinute: target / smart.count },
        ],
        output: { ko: ko('Desc_SpaceElevatorPart_1_C'), perMinute: smart.each },
        clock: smart.clock,
      })),
    },
    {
      kind: 'storage',
      label: `${container.ko}로`,
      boxes: Array.from({ length: smart.count }, () => ({
        itemKo: ko('Desc_SpaceElevatorPart_1_C'),
        itemId: 'Desc_SpaceElevatorPart_1_C',
        perMinute: smart.each,
      })) satisfies StoreBox[],
    },
  ];

  const links: Link[] = [
    ...makers.map((_, i) => ({ from: [0, i] as [number, number], to: [1, i % smart.count] as [number, number] })),
    ...Array.from({ length: smart.count }, (_, i) => ({
      from: [1, i] as [number, number],
      to: [2, i] as [number, number],
    })),
  ];

  return {
    rows,
    links,
    caption:
      `조립기는 ${rip.count + rotor.count + smart.count}대면 되지만 이 그림이 감추는 것은 상류입니다 — ` +
      `여기까지 오려면 나사 ${fmt(need.get('Desc_IronScrew_C') ?? 0)}개/분, ` +
      `철광석 ${fmt(need.get('Desc_OreIron_C') ?? 0)}개/분이 필요합니다. 노드 하나로는 못 댑니다.`,
  };
}

/**
 * 발전기 한 대가 분당 먹는 연료. 발전량 ÷ 연료 열량 이다.
 *
 * 유체는 단위가 다르다 — 게임 데이터의 열량은 낱개 기준인데 화면과 벨트는 m³ 로 센다.
 * 1 m³ = 1000 낱개라 유체는 1000으로 나눈다. (이걸 빼먹어 발전기가 「전력 0 MW」로 나왔다.)
 */
function burnPerMinute(buildingId: string, fuelId: string): number {
  const g = building(buildingId);
  const f = item(fuelId);
  if (!g.powerGenMW || !f.energyMJ) return 0;
  const raw = (g.powerGenMW / f.energyMJ) * 60;
  return f.form === 'solid' ? raw : raw / 1000;
}

/**
 * 티어 5 원유 — 부산물이 라인을 멈추는 구조를 그린다.
 *
 * 이 그림의 요점은 대수가 아니다. **정제소가 쓸 것과 안 쓸 것을 같이 낸다**는 점이다.
 * 중유 잔여물의 출구를 안 만들면 파이프가 차고, 파이프가 차면 정제소가 선다.
 * 그래서 잔여물 줄을 다른 색으로 그리고, 그 줄이 실제로 어디로 가는지까지 잇는다.
 *
 * 규모는 플라스틱 20/분 + 고무 20/분 — 정제소 한 대씩으로 떨어지는 가장 작은 단위다.
 */
export function oilLine(): FlowDef {
  const refinery = building('Build_OilRefinery_C');
  const gen = building('Build_GeneratorFuel_C');

  const rPlastic = recipe('Recipe_Plastic_C');
  const rRubber = recipe('Recipe_Rubber_C');
  const rFuel = recipe('Recipe_ResidualFuel_C');

  const outAt = (r: typeof rPlastic, id: string) =>
    r.products.find((x) => x.item === id)?.perMinute ?? 0;

  const HOR = 'Desc_HeavyOilResidue_C';
  const residue = outAt(rPlastic, HOR) + outAt(rRubber, HOR);
  /* 잔여물 전부를 연료로 돌린다. 한 대를 다 못 채우면 클럭을 내린다 */
  const fuelPlan = plan('Recipe_ResidualFuel_C', (outAt(rFuel, 'Desc_LiquidFuel_C') * residue) / inOf('Recipe_ResidualFuel_C'));
  const fuelMade = (outAt(rFuel, 'Desc_LiquidFuel_C') * residue) / inOf('Recipe_ResidualFuel_C');
  const burn = burnPerMinute('Build_GeneratorFuel_C', 'Desc_LiquidFuel_C');
  const genCount = Math.ceil(fuelMade / burn - 1e-9);

  const rows: Row[] = [
    {
      kind: 'machines',
      boxes: [
        {
          ko: `${refinery.ko} #1`,
          machineId: refinery.id,
          inputs: [{ ko: ko('Desc_LiquidOil_C'), perMinute: inOf('Recipe_Plastic_C') }],
          output: { ko: ko('Desc_Plastic_C'), perMinute: outAt(rPlastic, 'Desc_Plastic_C') },
          byproduct: { ko: ko(HOR), perMinute: outAt(rPlastic, HOR) },
        },
        {
          ko: `${refinery.ko} #2`,
          machineId: refinery.id,
          inputs: [{ ko: ko('Desc_LiquidOil_C'), perMinute: inOf('Recipe_Rubber_C') }],
          output: { ko: ko('Desc_Rubber_C'), perMinute: outAt(rRubber, 'Desc_Rubber_C') },
          byproduct: { ko: ko(HOR), perMinute: outAt(rRubber, HOR) },
        },
      ],
    },
    {
      kind: 'machines',
      boxes: [
        {
          ko: `${refinery.ko} #3`,
          machineId: refinery.id,
          inputs: [{ ko: ko(HOR), perMinute: residue }],
          output: { ko: ko('Desc_LiquidFuel_C'), perMinute: fuelMade },
          clock: fuelPlan.clock,
          col: 1,
        },
      ],
    },
    {
      kind: 'machines',
      boxes: Array.from({ length: genCount }, (_, i) => ({
        ko: `${gen.ko} #${i + 1}`,
        machineId: gen.id,
        inputs: [{ ko: ko('Desc_LiquidFuel_C'), perMinute: fuelMade / genCount }],
        output: {
          ko: '전력',
          perMinute: Math.round(((gen.powerGenMW ?? 250) * fuelMade) / genCount / burn),
          unit: ' MW',
        },
        col: 1,
      })),
    },
    {
      kind: 'storage',
      label: '쓰는 곳으로',
      boxes: [
        { itemKo: ko('Desc_Plastic_C'), itemId: 'Desc_Plastic_C', perMinute: outAt(rPlastic, 'Desc_Plastic_C'), col: 0 },
        { itemKo: ko('Desc_Rubber_C'), itemId: 'Desc_Rubber_C', perMinute: outAt(rRubber, 'Desc_Rubber_C'), col: 2 },
      ],
    },
  ];

  const links: Link[] = [
    /* 부산물은 두 정제소에서 나와 세 번째 정제소로 모인다 */
    { from: [0, 0], to: [1, 0], byproduct: true },
    { from: [0, 1], to: [1, 0], byproduct: true },
    { from: [1, 0], to: [2, 0] },
    /* 주 산출은 중간 줄을 지나쳐 곧장 쓰는 곳으로 간다 */
    { from: [0, 0], to: [3, 0] },
    { from: [0, 1], to: [3, 1] },
  ];

  return {
    rows,
    links,
    caption:
      `정제소 두 대가 ${ko(HOR)} ${fmt(residue)}/분을 같이 냅니다. 이 줄을 만들지 않으면 ` +
      `파이프가 차고, 파이프가 차면 위의 정제소 두 대가 함께 멈춥니다. ` +
      `태워서 없애는 김에 ${genCount * (gen.powerGenMW ?? 250)} MW가 나옵니다.`,
  };
}

/**
 * 티어 7 알루미늄 — 물이 되돌아오는 구조를 그린다.
 *
 * 알루미늄이 어렵다는 말의 실체는 이것 하나다. 알루미늄 조각을 만들면 물이 딸려 나오고,
 * 그 물을 버리면 파이프가 막히고 흘려보내면 앞이 마른다. 되돌리는 줄을 그려야 이해된다.
 */
export function aluminiumLine(): FlowDef {
  const refinery = building('Build_OilRefinery_C');
  const foundry = building('Build_FoundryMk1_C');
  const pump = building('Build_WaterPump_C');
  const constructor = building('Build_ConstructorMk1_C');

  const rAlumina = recipe('Recipe_AluminaSolution_C');
  const rScrap = recipe('Recipe_AluminumScrap_C');
  const rIngot = recipe('Recipe_IngotAluminum_C');
  const rSilica = recipe('Recipe_Silica_C');

  const outAt = (r: typeof rAlumina, id: string) =>
    r.products.find((x) => x.item === id)?.perMinute ?? 0;
  const inAt = (r: typeof rAlumina, id: string) =>
    r.ingredients.find((x) => x.item === id)?.perMinute ?? 0;

  const W = 'Desc_Water_C';
  const SIL = 'Desc_Silica_C';

  /* 정제소 한 대 기준으로 아래를 다 맞춘다 */
  const aluminaOut = outAt(rAlumina, 'Desc_AluminaSolution_C');
  const scrapRuns = aluminaOut / inAt(rScrap, 'Desc_AluminaSolution_C');
  const backWater = outAt(rScrap, W) * scrapRuns;
  const needWater = inAt(rAlumina, W);
  const freshWater = Math.max(0, needWater - backWater);
  const scrapOut = outAt(rScrap, 'Desc_AluminumScrap_C') * scrapRuns;
  const ingotRuns = scrapOut / inAt(rIngot, 'Desc_AluminumScrap_C');
  const ingotOut = outAt(rIngot, 'Desc_AluminumIngot_C') * ingotRuns;

  /*
   * 이산화규소는 알루미나 용액에서 부산물로 나오지만 **모자란다**.
   * 처음 이 그림을 그렸을 때 "따로 캐 오지 않아도 된다"고 적었다가 그림이 그걸 반박했다 —
   * 나오는 양과 쓰는 양을 나란히 두면 바로 보인다.
   */
  const silicaFree = outAt(rAlumina, SIL);
  const silicaNeed = inAt(rIngot, SIL) * ingotRuns;
  const silicaShort = Math.max(0, silicaNeed - silicaFree);
  const silicaPlan = plan('Recipe_Silica_C', silicaShort);

  const rows: Row[] = [
    {
      kind: 'machines',
      boxes: [
        {
          ko: pump.ko,
          machineId: pump.id,
          output: { ko: ko(W), perMinute: freshWater },
          note: `되돌아오는 ${fmt(backWater)}/분만큼 덜 뽑습니다`,
          col: 0,
        },
        {
          ko: refinery.ko,
          machineId: refinery.id,
          inputs: [
            { ko: ko('Desc_OreBauxite_C'), perMinute: inAt(rAlumina, 'Desc_OreBauxite_C') },
            { ko: ko(W), perMinute: needWater },
          ],
          output: { ko: ko('Desc_AluminaSolution_C'), perMinute: aluminaOut },
          byproduct: { ko: ko(SIL), perMinute: silicaFree },
          col: 1,
        },
      ],
    },
    {
      kind: 'machines',
      boxes: [
        {
          ko: `${refinery.ko} (조각)`,
          machineId: refinery.id,
          inputs: [
            { ko: ko('Desc_AluminaSolution_C'), perMinute: aluminaOut },
            { ko: ko('Desc_Coal_C'), perMinute: inAt(rScrap, 'Desc_Coal_C') * scrapRuns },
          ],
          output: { ko: ko('Desc_AluminumScrap_C'), perMinute: scrapOut },
          byproduct: { ko: ko(W), perMinute: backWater },
          clock: Math.round(scrapRuns * 1000) / 10,
          col: 1,
        },
        {
          ko: `${constructor.ko} ×${silicaPlan.count}`,
          machineId: constructor.id,
          inputs: [
            {
              ko: ko('Desc_RawQuartz_C'),
              perMinute: (inAt(rSilica, 'Desc_RawQuartz_C') * silicaShort) / outAt(rSilica, SIL),
            },
          ],
          output: { ko: ko(SIL), perMinute: silicaShort },
          note: `부산물로 모자란 ${fmt(silicaShort)}/분을 채웁니다`,
          clock: silicaPlan.clock,
          col: 2,
        },
      ],
    },
    {
      kind: 'machines',
      boxes: [
        {
          ko: foundry.ko,
          machineId: foundry.id,
          inputs: [
            { ko: ko('Desc_AluminumScrap_C'), perMinute: scrapOut },
            { ko: ko(SIL), perMinute: silicaNeed },
          ],
          output: { ko: ko('Desc_AluminumIngot_C'), perMinute: ingotOut },
          clock: Math.round(ingotRuns * 1000) / 10,
          col: 1,
        },
      ],
    },
    {
      kind: 'storage',
      label: '쓰는 곳으로',
      boxes: [
        {
          itemKo: ko('Desc_AluminumIngot_C'),
          itemId: 'Desc_AluminumIngot_C',
          perMinute: ingotOut,
          col: 1,
        },
      ],
    },
  ];

  const links: Link[] = [
    { from: [0, 0], to: [0, 1] },
    { from: [0, 1], to: [1, 0] },
    /* 부산물 이산화규소는 주조소로 곧장 간다. 모자란 만큼은 제작기가 채운다 */
    { from: [0, 1], to: [2, 0], byproduct: true },
    { from: [1, 1], to: [2, 0] },
    { from: [1, 0], to: [2, 0] },
    /* 되돌아오는 물. 이 줄이 이 그림의 전부다 */
    { from: [1, 0], to: [0, 1], byproduct: true },
    { from: [2, 0], to: [3, 0] },
  ];

  return {
    rows,
    links,
    wide: true,
    caption:
      `조각 공정이 물 ${fmt(backWater)}/분을 되돌립니다. 그래서 새로 뽑는 물은 ` +
      `${fmt(needWater)}/분이 아니라 ${fmt(freshWater)}/분이면 됩니다. 되돌린 물을 먼저 넣고 ` +
      `모자란 만큼만 추출기가 채우게 지으면 시동할 때 흔들리지 않습니다. ` +
      `${ko(SIL)}는 부산물로 ${fmt(silicaFree)}/분이 나오는데 주조소가 ${fmt(silicaNeed)}/분을 ` +
      `먹으므로 ${fmt(silicaShort)}/분은 석영에서 따로 만들어야 합니다.`,
  };
}
