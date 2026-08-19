/** src/data/app/*.json 의 타입. build-app-data.mjs 의 출력 스키마와 1:1로 대응한다. */

export interface Item {
  id: string;
  ko: string;
  en: string;
  kind: string;
  form: string;
  isFluid: boolean;
  stackSize: string | null;
  energyMJ: number;
  sinkPoints: number;
}

export interface RecipePart {
  item: string;
  amount: number;
  perMinute: number;
}

export interface Recipe {
  id: string;
  ko: string;
  en: string;
  isAlternate: boolean;
  durationSec: number;
  ingredients: RecipePart[];
  products: RecipePart[];
  producedIn: string[];
  inHandcraft: boolean;
  isBuildingRecipe: boolean;
}

export interface Building {
  id: string;
  ko: string;
  en: string;
  category: string;
  buildCost: { item: string; amount: number }[];
  powerMW: number | null;
  powerGenMW: number | null;
  powerExponent: number | null;
  manufacturingSpeed: number | null;
  somersloopSlots: number | null;
  powerShardSlots: number | null;
  beltItemsPerMinute: number | null;
  pipeFlowM3PerMinute: number | null;
  extraction: { perMinuteAtNormalPurity: number | null; allowedForms: string[] } | null;
  supplementalToPowerRatio: number | null;
  storageSlots: number | null;
  /** 이 건물이 처음 해금되는 티어. 모르면 null. */
  unlockTier: number | null;
}

export interface Milestone {
  id: string;
  ko: string;
  en: string;
  tier: number;
  order: number;
  cost: { item: string; amount: number }[];
  timeToCompleteSec: number;
  unlocksRecipes: string[];
  unlocksItems: string[];
  inventorySlots: number;
}

export interface DataIndex {
  producedBy: Record<string, string[]>;
  consumedBy: Record<string, string[]>;
  byBuilding: Record<string, string[]>;
  tiers: Record<string, string[]>;
  unlockTier: Record<string, number>;
}

export interface AppMeta {
  generatedAt: string;
  generator: string;
  game: {
    steamBuildId: string | null;
    sourceSha256: string | null;
    localeSourceSha256: string | null;
    generatedAt: string | null;
  };
  counts: {
    items: number;
    recipes: number;
    alternateRecipes: number;
    buildings: number;
    milestones: number;
    curatedFiles: number;
  };
  conventions: Record<string, string>;
}
