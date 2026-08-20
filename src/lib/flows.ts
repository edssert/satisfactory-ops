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
 * 티어 1 철 3종 라인.
 *
 * **기계를 개별로 그린다.** 같은 종류라도 출력이 다른 곳으로 가면 한 상자로 묶지 않는다 —
 * 묶으면 없는 병합기가 생기고, 그것을 다시 분배기로 가르는 그림이 된다.
 * 실제로는 제련기 #1 이 철판 제작기에 직결되고, 제련기 #2 만 분배기로 갈라진다.
 *
 * 벨트 Mk.1 한 줄(60/분)이 제련기 두 대분이라 채굴기 뒤에 분배기가 하나 필요하다.
 */
export function ironLine(): FlowDef {
  const miner = building('Build_MinerMk1_C');
  const smelter = building('Build_SmelterMk1_C');
  const constructor = building('Build_ConstructorMk1_C');
  const ore = building('Build_ConveyorBeltMk1_C').beltItemsPerMinute ?? 60;

  const smeltIn = inOf('Recipe_IngotIron_C');
  const smeltOut = outOf('Recipe_IngotIron_C');
  const plateIn = inOf('Recipe_IronPlate_C');
  const rodIn = inOf('Recipe_IronRod_C');
  const rodOut = outOf('Recipe_IronRod_C');
  const screwIn = inOf('Recipe_Screw_C');
  const screwOut = outOf('Recipe_Screw_C');

  /** 이 배선은 "제련기 2대 · 철판 1대 · 철봉 2대"라는 정수 비율 위에 서 있다 */
  const smelters = ore / smeltIn;
  const rodsPerSmelter = smeltOut / rodIn;
  if (smelters !== 2 || smeltOut !== plateIn || rodsPerSmelter !== 2) {
    throw new Error(
      `철 라인 비율이 깨졌습니다 (제련기 ${smelters} · 철판 ${smeltOut}/${plateIn} · 철봉 ${rodsPerSmelter}). ` +
        '게임 레시피가 바뀌었으니 그림을 다시 짜야 합니다.'
    );
  }

  const rodNode = (n: number, out: number): FlowNodeDef => ({
    id: `rod${n}`,
    machineKo: `${constructor.ko} #${n + 1}`,
    productKo: ko('Desc_IronRod_C'),
    machineId: constructor.id,
    count: 1,
    layer: 2,
    out: { itemKo: ko('Desc_IronRod_C'), itemId: 'Desc_IronRod_C', perMinute: out },
  });

  return {
    nodes: [
      { id: 'mine', machineKo: miner.ko, productKo: ko('Desc_OreIron_C'), machineId: miner.id, count: 1, layer: 0 },
      { id: 'smelt1', machineKo: `${smelter.ko} #1`, productKo: ko('Desc_IronIngot_C'), machineId: smelter.id, count: 1, layer: 1 },
      { id: 'smelt2', machineKo: `${smelter.ko} #2`, productKo: ko('Desc_IronIngot_C'), machineId: smelter.id, count: 1, layer: 1 },
      {
        id: 'plate',
        machineKo: `${constructor.ko} #1`,
        productKo: ko('Desc_IronPlate_C'),
        machineId: constructor.id,
        count: 1,
        layer: 2,
        out: { itemKo: ko('Desc_IronPlate_C'), itemId: 'Desc_IronPlate_C', perMinute: outOf('Recipe_IronPlate_C') },
      },
      rodNode(1, rodOut - screwIn),
      rodNode(2, rodOut),
      {
        id: 'screw',
        machineKo: `${constructor.ko} #4`,
        productKo: ko('Desc_IronScrew_C'),
        machineId: constructor.id,
        count: 1,
        layer: 3,
        out: { itemKo: ko('Desc_IronScrew_C'), itemId: 'Desc_IronScrew_C', perMinute: screwOut },
      },
    ],
    edges: [
      { from: 'mine', to: 'smelt1', itemKo: ko('Desc_OreIron_C'), itemId: 'Desc_OreIron_C', perMinute: smeltIn, split: true },
      { from: 'mine', to: 'smelt2', itemKo: ko('Desc_OreIron_C'), itemId: 'Desc_OreIron_C', perMinute: smeltIn },
      { from: 'smelt1', to: 'plate', itemKo: ko('Desc_IronIngot_C'), itemId: 'Desc_IronIngot_C', perMinute: plateIn },
      { from: 'smelt2', to: 'rod1', itemKo: ko('Desc_IronIngot_C'), itemId: 'Desc_IronIngot_C', perMinute: rodIn, split: true },
      { from: 'smelt2', to: 'rod2', itemKo: ko('Desc_IronIngot_C'), itemId: 'Desc_IronIngot_C', perMinute: rodIn },
      { from: 'rod1', to: 'screw', itemKo: ko('Desc_IronRod_C'), itemId: 'Desc_IronRod_C', perMinute: screwIn, split: true },
    ],
    caption:
      `분배기는 두 곳에만 들어갑니다 — 채굴기 뒤(${fmt(ore)} → ${fmt(smeltIn)}씩)와 제련기 #2 뒤(${fmt(smeltOut)} → ${fmt(rodIn)}씩). ` +
      `제련기 #1 은 철판 제작기에 그대로 물립니다. 병합기는 쓰지 않습니다.`,
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
    caption: `${assembler.ko} 두 대면 됩니다. 대수를 늘리는 대신 클럭을 내립니다 — 전력이 클럭에 지수로 붙습니다.`,
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
