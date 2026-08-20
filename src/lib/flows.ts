/**
 * flows.ts — 가이드에 싣는 공정 흐름도의 정의.
 *
 * 랜딩과 가이드가 같은 그림을 쓰므로 한 곳에서 만든다. 두 벌로 두었더니 한쪽만 고쳐져
 * 서로 다른 대수를 보여줬다.
 *
 * 모든 수치는 레시피에서 읽는다. 대수는 목표 처리량을 레시피 처리량으로 나눈 값이다.
 */
import { building, item, recipe } from './gamedata';

/** FlowChart.astro 의 Props 와 같은 모양. .astro 에서 타입을 가져올 수 없어 여기 둔다 */
export interface FlowNodeDef {
  id: string;
  machineKo: string;
  productKo?: string;
  count: number;
  clock?: number;
  machineId?: string;
  out?: { itemKo: string; itemId?: string; perMinute: number };
  layer: number;
}
export interface FlowEdgeDef {
  from: string;
  to: string;
  itemKo: string;
  itemId?: string;
  perMinute: number;
  split?: boolean;
}
export interface FlowDef {
  nodes: FlowNodeDef[];
  edges: FlowEdgeDef[];
  caption: string;
}

const inOf = (id: string) => recipe(id).ingredients[0]?.perMinute ?? 0;
const outOf = (id: string) => recipe(id).products[0]?.perMinute ?? 0;
const ko = (id: string) => item(id).ko;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * 필요량 전개 — 목표 품목 N//분을 만들려면 상류가 얼마나 필요한가.
 *
 * 조립기 입력만 세면 안 된다. 그 입력을 만드는 제작기·제련기·채굴기까지 내려가야
 * 실제 노드 소요가 나온다. (가이드가 지능형 도금판 5/분을 철광석 22.5/분이라 적은 적이 있다.
 * 조립기 바로 앞만 세서 나온 값이고, 실제는 116.25/분이다.)
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
  const r = recipe(recipeId);
  const out = r.products[0]?.perMinute ?? 0;
  const exact = targetPerMinute / out;
  const count = Math.ceil(exact - 1e-9);
  return { count, clock: Math.round((exact / count) * 1000) / 10 };
}

/**
 * 초반 철 라인 — **보강된 철판 5/분을 먹여 살리는 크기**로 잡는다.
 *
 * 이 크기를 쓰는 이유: 보강된 철판 5/분이 철광석 정확히 60/분이고, 그게 채굴기 한 대가
 * 벨트 Mk.1 로 낼 수 있는 최대치와 같다. 노드 하나·벨트 한 줄이 딱 떨어진다.
 *
 * 철괴 60 을 철판용 45 와 철봉용 15 로 나눠야 하는데 정수비가 아니라 밸런서로는 못 나눈다.
 * 제련기 두 대 출력을 한 줄로 합치고 제작기를 그 줄에 차례로 무는 매니폴드가 표준 해법이다.
 */
export function ironLine(): FlowDef {
  const miner = building('Build_MinerMk1_C');
  const smelter = building('Build_SmelterMk1_C');
  const constructor = building('Build_ConstructorMk1_C');

  const need = expandDemand('Desc_IronPlateReinforced_C', 5);
  const ore = need.get('Desc_OreIron_C') ?? 0;
  const ingot = need.get('Desc_IronIngot_C') ?? 0;
  const plate = need.get('Desc_IronPlate_C') ?? 0;
  const rod = need.get('Desc_IronRod_C') ?? 0;
  const screw = need.get('Desc_IronScrew_C') ?? 0;

  const ingotToPlate = (inOf('Recipe_IronPlate_C') * plate) / outOf('Recipe_IronPlate_C');
  const ingotToRod = (inOf('Recipe_IronRod_C') * rod) / outOf('Recipe_IronRod_C');

  const pSmelt = plan('Recipe_IngotIron_C', ingot);
  const pPlate = plan('Recipe_IronPlate_C', plate);
  const pRod = plan('Recipe_IronRod_C', rod);
  const pScrew = plan('Recipe_Screw_C', screw);

  const belt = building('Build_ConveyorBeltMk1_C').beltItemsPerMinute ?? 60;

  return {
    nodes: [
      { id: 'mine', machineKo: miner.ko, productKo: ko('Desc_OreIron_C'), machineId: miner.id, count: 1, layer: 0 },
      { id: 'smelt', machineKo: smelter.ko, productKo: ko('Desc_IronIngot_C'), machineId: smelter.id, count: pSmelt.count, clock: pSmelt.clock, layer: 1 },
      {
        id: 'plate',
        machineKo: constructor.ko,
        productKo: ko('Desc_IronPlate_C'),
        machineId: constructor.id,
        count: pPlate.count,
        clock: pPlate.clock,
        layer: 2,
        out: { itemKo: ko('Desc_IronPlate_C'), itemId: 'Desc_IronPlate_C', perMinute: plate },
      },
      { id: 'rod', machineKo: constructor.ko, productKo: ko('Desc_IronRod_C'), machineId: constructor.id, count: pRod.count, clock: pRod.clock, layer: 2 },
      {
        id: 'screw',
        machineKo: constructor.ko,
        productKo: ko('Desc_IronScrew_C'),
        machineId: constructor.id,
        count: pScrew.count,
        clock: pScrew.clock,
        layer: 3,
        out: { itemKo: ko('Desc_IronScrew_C'), itemId: 'Desc_IronScrew_C', perMinute: screw },
      },
    ],
    edges: [
      { from: 'mine', to: 'smelt', itemKo: ko('Desc_OreIron_C'), itemId: 'Desc_OreIron_C', perMinute: ore },
      { from: 'smelt', to: 'plate', itemKo: ko('Desc_IronIngot_C'), itemId: 'Desc_IronIngot_C', perMinute: ingotToPlate, split: true },
      { from: 'smelt', to: 'rod', itemKo: ko('Desc_IronIngot_C'), itemId: 'Desc_IronIngot_C', perMinute: ingotToRod },
      { from: 'rod', to: 'screw', itemKo: ko('Desc_IronRod_C'), itemId: 'Desc_IronRod_C', perMinute: rod },
    ],
    caption:
      `철광석 ${fmt(ore)}개/분 — 채굴기 한 대가 벨트 Mk.1(${fmt(belt)}개/분)로 낼 수 있는 최대치와 정확히 같습니다. ` +
      `철괴를 철판용 ${fmt(ingotToPlate)} 와 철봉용 ${fmt(ingotToRod)} 로 나누는데 정수비가 아니라 밸런서로는 못 나눕니다. ` +
      `제련기 출력을 한 줄로 합치고 제작기를 그 줄에 차례로 무십시오(매니폴드).`,
  };
}

/**
 * 티어 2 지능형 도금판 라인. 목표 5개/분.
 *
 * 대수를 늘리는 대신 클럭을 내린다 — 전력이 클럭에 지수(약 1.32)로 붙어서,
 * 두 대를 절반씩 돌리는 것보다 한 대를 낮춰 돌리는 편이 싸다.
 */
export function smartPlatingLine(target = 5): FlowDef {
  const assembler = building('Build_AssemblerMk1_C');

  const plan = (recipeId: string) => {
    const out = outOf(recipeId);
    const exact = target / out;
    const count = Math.ceil(exact - 1e-9);
    return { count, clock: Math.round((exact / count) * 1000) / 10 };
  };
  const rip = plan('Recipe_IronPlateReinforced_C');
  const rotor = plan('Recipe_Rotor_C');
  const smart = plan('Recipe_SpaceElevatorPart_1_C');

  return {
    nodes: [
      {
        id: 'rip',
        machineKo: assembler.ko,
        productKo: ko('Desc_IronPlateReinforced_C'),
        machineId: assembler.id,
        count: rip.count,
        clock: rip.clock,
        layer: 0,
      },
      {
        id: 'rotor',
        machineKo: assembler.ko,
        productKo: ko('Desc_Rotor_C'),
        machineId: assembler.id,
        count: rotor.count,
        clock: rotor.clock,
        layer: 0,
      },
      {
        id: 'smart',
        machineKo: assembler.ko,
        productKo: ko('Desc_SpaceElevatorPart_1_C'),
        machineId: assembler.id,
        count: smart.count,
        clock: smart.clock,
        layer: 1,
        out: {
          itemKo: ko('Desc_SpaceElevatorPart_1_C'),
          itemId: 'Desc_SpaceElevatorPart_1_C',
          perMinute: target,
        },
      },
    ],
    edges: [
      { from: 'rip', to: 'smart', itemKo: ko('Desc_IronPlateReinforced_C'), itemId: 'Desc_IronPlateReinforced_C', perMinute: target },
      { from: 'rotor', to: 'smart', itemKo: ko('Desc_Rotor_C'), itemId: 'Desc_Rotor_C', perMinute: target },
    ],
    caption:
      `조립기는 ${rip.count + rotor.count + smart.count}대면 되지만, 이 그림이 감추는 것은 상류입니다 — ` +
      `여기까지 오려면 나사 ${fmt(expandDemand('Desc_SpaceElevatorPart_1_C', target).get('Desc_IronScrew_C') ?? 0)}개/분, ` +
      `철광석 ${fmt(expandDemand('Desc_SpaceElevatorPart_1_C', target).get('Desc_OreIron_C') ?? 0)}개/분이 필요합니다. ` +
      `노드 하나로는 못 댑니다.`,
  };
}

/**
 * 허브 6 급유 자동화. 주운 것을 컨테이너에 붓기만 하면 연소기까지 자동으로 간다.
 * 나무와 이파리는 개당 열량이 10배 차이 나므로 나무 기준으로 잡는다.
 */
export function biomassLine(): FlowDef {
  const constructor = building('Build_ConstructorMk1_C');
  const burner = building('Build_GeneratorBiomass_Automated_C');
  const container = building('Build_StorageContainerMk1_C');

  const bioPerBurner = ((burner.powerGenMW ?? 30) / (item('Desc_GenericBiomass_C').energyMJ ?? 180)) * 60;
  const woodIn = inOf('Recipe_Biomass_Wood_C');
  const bioOut = outOf('Recipe_Biomass_Wood_C');
  const woodPerBurner = (bioPerBurner / bioOut) * woodIn;
  const burnersPerConstructor = bioOut / bioPerBurner;

  return {
    nodes: [
      {
        id: 'box',
        machineKo: container.ko,
        productKo: `${ko('Desc_Wood_C')} · ${ko('Desc_Leaves_C')}`,
        machineId: container.id,
        count: 1,
        layer: 0,
      },
      {
        id: 'bio',
        machineKo: constructor.ko,
        productKo: ko('Desc_GenericBiomass_C'),
        machineId: constructor.id,
        count: 1,
        layer: 1,
      },
      {
        id: 'burn',
        machineKo: burner.ko,
        productKo: `${burner.powerGenMW} MW`,
        machineId: burner.id,
        count: 1,
        layer: 2,
      },
    ],
    edges: [
      { from: 'box', to: 'bio', itemKo: ko('Desc_Wood_C'), itemId: 'Desc_Wood_C', perMinute: woodPerBurner },
      { from: 'bio', to: 'burn', itemKo: ko('Desc_GenericBiomass_C'), itemId: 'Desc_GenericBiomass_C', perMinute: bioPerBurner },
    ],
    caption:
      `연소기 한 대는 ${burner.powerGenMW} MW 를 내고 ${ko('Desc_GenericBiomass_C')} ${fmt(bioPerBurner)}개/분을 먹습니다 — ` +
      `나무로는 ${fmt(woodPerBurner)}개/분입니다. 제작기는 클럭을 건드릴 필요가 없습니다. ` +
      `벨트가 차면 알아서 멈추고, 연소기가 먹는 만큼만 다시 돕니다.`,
  };
}
