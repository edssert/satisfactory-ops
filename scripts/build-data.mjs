#!/usr/bin/env node
/**
 * build-data.mjs — Satisfactory 원본 게임 데이터(Docs)를 정규화 JSON으로 변환한다.
 *
 * 소스: <SteamLibrary>/steamapps/common/Satisfactory/CommunityResources/Docs/<locale>.json
 *       (UTF-16LE + BOM, 최상위 [{NativeClass, Classes:[...]}, ...])
 * 출력: src/data/{meta,items,recipes,buildings,schematics,milestones}.json
 *
 * 의존성 없음 (Node 24 내장 fs/path/crypto만 사용).
 * 결정 근거: docs/adr/0008-game-data-source.md
 *
 * 사용법:
 *   node scripts/build-data.mjs                     # 자동 탐색 후 빌드
 *   node scripts/build-data.mjs --check             # 소스 탐지/파싱/검증만, 파일 안 씀
 *   node scripts/build-data.mjs --docs="D:/.../en-US.json"
 *   node scripts/build-data.mjs --locale=ko --out=src/data/ko
 *   SATISFACTORY_DOCS="D:/.../Docs" node scripts/build-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const hit = argv.find((a) => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return fallback;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const OPTS = {
  docs: arg('docs'),
  locale: arg('locale', 'en-US'),
  out: path.resolve(ROOT, String(arg('out', 'src/data'))),
  check: arg('check', false) === true,
  quiet: arg('quiet', false) === true,
};

const log = (...a) => { if (!OPTS.quiet) console.log(...a); };

// ---------------------------------------------------------------- 1. 소스 탐색
// 우선순위: --docs > $SATISFACTORY_DOCS > Steam libraryfolders.vdf > 하드코딩 후보 경로

const RELATIVE_DOCS_DIR = 'steamapps/common/Satisfactory/CommunityResources/Docs';

const STEAM_ROOTS = [
  'C:/Program Files (x86)/Steam',
  'C:/Program Files/Steam',
  'D:/Steam', 'E:/Steam',
  'C:/SteamLibrary', 'D:/SteamLibrary', 'E:/SteamLibrary', 'F:/SteamLibrary',
];

const EXTRA_CANDIDATE_DIRS = [
  // Epic Games (스토어는 다르지만 CommunityResources 하위 구조는 동일)
  'C:/Program Files/Epic Games/Satisfactory/CommunityResources/Docs',
  'C:/Program Files/Epic Games/SatisfactoryExperimental/CommunityResources/Docs',
  'C:/Program Files/Epic Games/SatisfactoryEarlyAccess/CommunityResources/Docs',
  'D:/Epic Games/Satisfactory/CommunityResources/Docs',
  // 게임 미설치 머신 대비 로컬 스냅샷 (git에는 커밋하지 않는다)
  path.join(ROOT, 'assets/gamedata/Docs'),
];

/** libraryfolders.vdf에서 라이브러리 경로만 뽑는 미니 VDF 파서. */
function steamLibraryPaths() {
  const out = [];
  for (const root of STEAM_ROOTS) {
    const vdf = path.join(root, 'steamapps/libraryfolders.vdf');
    if (!fs.existsSync(vdf)) continue;
    let txt = '';
    try { txt = fs.readFileSync(vdf, 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(/"path"\s+"([^"]+)"/g)) {
      out.push(m[1].replace(/\\\\/g, '/').replace(/\\/g, '/'));
    }
  }
  return out;
}

function candidateDocsDirs() {
  const dirs = [];
  const env = process.env.SATISFACTORY_DOCS;
  if (env) dirs.push(env);
  for (const lib of [...steamLibraryPaths(), ...STEAM_ROOTS]) {
    dirs.push(path.join(lib, RELATIVE_DOCS_DIR));
  }
  dirs.push(...EXTRA_CANDIDATE_DIRS);
  return [...new Set(dirs.map((d) => d.replace(/\\/g, '/')))];
}

/** 로케일 파일 경로를 찾는다. 1.0+ 는 Docs/<locale>.json, 그 이전 빌드는 Docs.json. */
function resolveDocsFile() {
  if (OPTS.docs) {
    const p = String(OPTS.docs);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p.replace(/\\/g, '/');
    const inDir = path.join(p, OPTS.locale + '.json');
    if (fs.existsSync(inDir)) return inDir.replace(/\\/g, '/');
    throw new Error('--docs 경로에서 데이터 파일을 찾지 못함: ' + p);
  }
  const tried = [];
  for (const dir of candidateDocsDirs()) {
    for (const name of [OPTS.locale + '.json', 'en-US.json', 'Docs.json']) {
      const p = path.join(dir, name).replace(/\\/g, '/');
      tried.push(p);
      if (fs.existsSync(p)) return p;
    }
  }
  const err = new Error('Satisfactory Docs 데이터를 찾지 못했습니다.');
  err.tried = tried;
  throw err;
}

/** BOM으로 인코딩을 판별해 문자열로 읽는다 (게임 원본은 UTF-16LE + BOM). */
function readDocs(file) {
  const buf = fs.readFileSync(file);
  let encoding, text;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = 'utf-16le'; text = buf.toString('utf16le').slice(1);
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    throw new Error('UTF-16BE 인코딩은 지원하지 않습니다.');
  } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    encoding = 'utf-8-bom'; text = buf.toString('utf8').slice(1);
  } else if (buf[1] === 0x00) {
    encoding = 'utf-16le(no-bom)'; text = buf.toString('utf16le');
  } else {
    encoding = 'utf-8'; text = buf.toString('utf8');
  }
  return {
    encoding,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    text,
  };
}

/** 같은 Steam 라이브러리의 appmanifest에서 buildid를 읽어 스냅샷을 식별한다. */
function readBuildId(docsFile) {
  const lib = docsFile.split('/steamapps/')[0];
  const manifest = path.join(lib, 'steamapps/appmanifest_526870.acf');
  if (!fs.existsSync(manifest)) return null;
  try {
    const txt = fs.readFileSync(manifest, 'utf8');
    const m = txt.match(/"buildid"\s+"(\d+)"/);
    return m ? m[1] : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- 2. Unreal 값 파서

/** ((ItemClass="...Desc_X.Desc_X_C'",Amount=3),(...)) -> [{ class, amount }] */
function parseItemAmounts(raw) {
  if (!raw) return [];
  const out = [];
  const re = /ItemClass\s*=\s*"[^"]*\.([A-Za-z0-9_]+_C)'?"\s*,\s*Amount\s*=\s*(-?[\d.]+)/g;
  for (const m of String(raw).matchAll(re)) out.push({ class: m[1], amount: Number(m[2]) });
  return out;
}

/** ("/Game/A.A_C","/Script/FactoryGame.FGX") -> ["A_C", "FGX"] */
function parseClassList(raw) {
  if (!raw) return [];
  const out = [];
  for (const m of String(raw).matchAll(/"([^"]+)"/g)) {
    const v = m[1];
    const c = (v.includes('.') ? v.split('.').pop() : v).replace(/['"]/g, '').trim();
    if (c) out.push(c);
  }
  return out;
}

/**
 * mClearanceData -> 건물이 차지하는 공간 (m).
 *
 * 충돌 박스가 **여러 개인 건물이 많다**(입자 가속기는 24개). 첫 박스만 읽으면 조립기 높이가
 * 5m가 아니라 3m로 나온다. 전부의 합집합을 잡아야 배치 계산이 맞는다.
 * 단위는 cm이므로 100으로 나눈다. 도면 생성(FRD F13)의 기준 치수다.
 */
/**
 * mClearanceData -> 배치에 쓸 기하.
 *
 * 두 가지를 조사로 확정하고 이 함수를 다시 썼다 (docs/research/clearance-rules.md):
 *
 *  1. **CT_Soft는 건설을 막지 않는다.** 굴뚝·안테나 같은 얇은 기둥이 CT_Soft로 들어 있는데,
 *     그것을 점유 공간에 넣으면 배치가 과도하게 보수적이 된다. 하드(CT_Default)만 센다.
 *     다만 층고를 정할 때는 소프트까지 포함한 높이가 필요하다 (기계 위로 벨트를 지나가게 할 때
 *     굴뚝에 걸린다) — 그래서 visualHeightM 을 따로 낸다.
 *
 *  2. **박스의 Z 오프셋을 반영해야 한다.** 제련기는 4.5 m 박스 위에 z=4.5에서 시작하는 4 m 박스가
 *     얹혀 총 8.5 m다. 앞서는 RelativeTransform 을 무시하고 max(4.5, 4) = 4.5 로 계산했다.
 *     공식 위키가 제련기 높이를 8.5 m로 적고 있어 교차 검증된다.
 *
 * 하드 박스가 여러 개인 건물은 "복합 클리어런스"이고, 박스 사이 빈 공간은 실제로 비어 있다.
 * 그래서 합집합 하나만 내지 않고 개별 박스도 함께 낸다.
 */
function parseClearance(raw) {
  const text = String(raw ?? '');
  if (!text) return null;

  // 항목 하나 = (Type=..., ClearanceBox=(Min=..,Max=..), RelativeTransform=(Translation=..))
  const re =
    /(?:Type=(\w+),)?ClearanceBox=\(Min=\(X=(-?[\d.]+),Y=(-?[\d.]+),Z=(-?[\d.]+)\),Max=\(X=(-?[\d.]+),Y=(-?[\d.]+),Z=(-?[\d.]+)\)[^)]*\)(?:,RelativeTransform=\(Translation=\(X=(-?[\d.]+),Y=(-?[\d.]+),Z=(-?[\d.]+)\))?/g;

  const all = [];
  for (const m of text.matchAll(re)) {
    const type = m[1] ?? 'CT_Default';
    const t = [m[8] ? Number(m[8]) : 0, m[9] ? Number(m[9]) : 0, m[10] ? Number(m[10]) : 0];
    all.push({
      type,
      min: [Number(m[2]) + t[0], Number(m[3]) + t[1], Number(m[4]) + t[2]],
      max: [Number(m[5]) + t[0], Number(m[6]) + t[1], Number(m[7]) + t[2]],
    });
  }
  if (!all.length) return null;

  const hard = all.filter((b) => b.type !== 'CT_Soft');
  const soft = all.filter((b) => b.type === 'CT_Soft');
  const pool = hard.length ? hard : all; // 하드가 없으면(벨트 등) 있는 것으로

  const span = (list, i) => ({
    min: Math.min(...list.map((b) => b.min[i])),
    max: Math.max(...list.map((b) => b.max[i])),
  });
  const m = (v) => round(v / 100);
  const x = span(pool, 0);
  const y = span(pool, 1);
  const z = span(pool, 2);
  const zAll = span(all, 2);

  return {
    // 배치에 쓰는 값 — 하드 클리어런스 합집합
    widthM: m(x.max - x.min),
    lengthM: m(y.max - y.min),
    heightM: m(z.max - z.min),
    // 층고·오버헤드 벨트 판단용 — 굴뚝·안테나까지 포함한 실제 높이
    visualHeightM: m(zAll.max - zAll.min),
    hardBoxes: hard.length,
    softBoxes: soft.length,
    // 복합 클리어런스 건물은 박스 사이가 비어 있다. 개별 박스를 남겨 촘촘한 배치에 쓴다.
    boxes: pool.map((b) => ({
      xM: m(b.min[0]),
      yM: m(b.min[1]),
      zM: m(b.min[2]),
      widthM: m(b.max[0] - b.min[0]),
      lengthM: m(b.max[1] - b.min[1]),
      heightM: m(b.max[2] - b.min[2]),
    })),
  };
}

/** (GameplayTags=((TagName="Recipe.Part"))) -> ["Recipe.Part"] */
const parseTags = (raw) =>
  [...String(raw ?? '').matchAll(/TagName\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

const num = (v) => { const n = Number(String(v ?? '').trim()); return Number.isFinite(n) ? n : 0; };
const bool = (v) => String(v ?? '').trim().toLowerCase() === 'true';
const clean = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
const round = (n) => Math.round(n * 1e6) / 1e6;

// 액체/기체 수치는 원본이 1000배(리터) 단위 → m³로 환산
const FLUID_FORMS = new Set(['RF_LIQUID', 'RF_GAS']);
const FLUID_SCALE = 1000;

// ---------------------------------------------------------------- 3. 정규화

const nativeShort = (grp) => grp.NativeClass.split('.').pop().replace(/'$/, '');
const findGroup = (groups, name) => groups.find((g) => nativeShort(g) === name);

const ITEM_NATIVES = new Set([
  'FGItemDescriptor', 'FGResourceDescriptor', 'FGItemDescriptorBiomass',
  'FGItemDescriptorNuclearFuel', 'FGItemDescriptorPowerBoosterFuel',
  'FGConsumableDescriptor', 'FGEquipmentDescriptor', 'FGPowerShardDescriptor',
  'FGAmmoTypeProjectile', 'FGAmmoTypeInstantHit', 'FGAmmoTypeSpreadshot',
  'FGVehicleDescriptor', 'FGBuildingDescriptor',
]);

function itemKind(n) {
  if (n === 'FGResourceDescriptor') return 'resource';
  if (n === 'FGBuildingDescriptor') return 'building-descriptor';
  if (n === 'FGEquipmentDescriptor') return 'equipment';
  if (n === 'FGVehicleDescriptor') return 'vehicle';
  if (n.startsWith('FGAmmoType')) return 'ammo';
  if (n === 'FGItemDescriptorBiomass') return 'biomass';
  if (n === 'FGItemDescriptorNuclearFuel') return 'nuclear-fuel';
  if (n === 'FGConsumableDescriptor') return 'consumable';
  if (n === 'FGPowerShardDescriptor') return 'power-shard';
  return 'part';
}

function buildItems(groups) {
  const items = [];
  for (const grp of groups) {
    const n = nativeShort(grp);
    if (!ITEM_NATIVES.has(n)) continue;
    for (const c of grp.Classes) {
      const form = clean(c.mForm) || 'RF_INVALID';
      items.push({
        className: c.ClassName,
        name: clean(c.mDisplayName),
        description: clean(c.mDescription),
        abbreviation: clean(c.mAbbreviatedDisplayName) || null,
        nativeClass: n,
        kind: itemKind(n),
        form: form === 'RF_SOLID' ? 'solid'
          : form === 'RF_LIQUID' ? 'liquid'
          : form === 'RF_GAS' ? 'gas' : 'none',
        isFluid: FLUID_FORMS.has(form),
        stackSize: clean(c.mStackSize) || null,
        energyMJ: num(c.mEnergyValue),
        radioactiveDecay: num(c.mRadioactiveDecay),
        sinkPoints: c.mResourceSinkPoints !== undefined ? num(c.mResourceSinkPoints) : null,
        canBeDiscarded: bool(c.mCanBeDiscarded),
        isAlienItem: bool(c.mIsAlienItem),
        icon: clean(c.mSmallIcon).split(' ').pop() || null,
      });
    }
  }
  return items;
}

// 손 제작(작업대 / 장비 작업장 / 빌드건)을 뜻하는 producer 클래스들.
// Build_AutomatedWorkBench_C(장비 작업장)는 Build_ 접두사지만 자동 생산 기계가 아니라
// 플레이어가 직접 돌리는 작업대이므로 producedIn(기계)에서 제외하고 handcraft로 분류한다.
const MANUAL_PRODUCERS = new Set([
  'BP_WorkBenchComponent_C', 'BP_WorkshopComponent_C', 'BP_BuildGun_C',
  'FGBuildGun', 'FGBuildableAutomatedWorkBench', 'Build_AutomatedWorkBench_C',
]);

function buildRecipes(groups, itemIndex) {
  const grp = findGroup(groups, 'FGRecipe');
  if (!grp) return [];

  const scale = (entries) => entries.map((e) => {
    const it = itemIndex.get(e.class);
    const isFluid = it ? it.isFluid : false;
    return {
      item: e.class,
      name: it ? it.name : null,
      amount: isFluid ? e.amount / FLUID_SCALE : e.amount,
      isFluid,
    };
  });

  return grp.Classes.map((c) => {
    const duration = num(c.mManufactoringDuration);
    const producers = parseClassList(c.mProducedIn);
    const machines = producers.filter((p) => p.startsWith('Build_') && !MANUAL_PRODUCERS.has(p));
    const perMin = (amount) => (duration > 0 ? round((amount * 60) / duration) : 0);
    const ingredients = scale(parseItemAmounts(c.mIngredients));
    const products = scale(parseItemAmounts(c.mProduct));
    return {
      className: c.ClassName,
      name: clean(c.mDisplayName),
      isAlternate: c.ClassName.startsWith('Recipe_Alternate'),
      durationSec: duration,
      ingredients: ingredients.map((e) => ({ ...e, perMinute: perMin(e.amount) })),
      products: products.map((e) => ({ ...e, perMinute: perMin(e.amount) })),
      producedIn: machines,
      inHandcraft: producers.some((p) => MANUAL_PRODUCERS.has(p)),
      isBuildingRecipe: products.some((p) => {
        const it = itemIndex.get(p.item);
        return !!it && it.kind === 'building-descriptor';
      }),
      manualMultiplier: num(c.mManualManufacturingMultiplier) || 1,
      variablePower: {
        constantMW: num(c.mVariablePowerConsumptionConstant),
        factor: num(c.mVariablePowerConsumptionFactor),
      },
      tags: parseTags(c.mGameplayTags),
    };
  });
}

function categorize(n) {
  if (n === 'FGBuildableManufacturer' || n === 'FGBuildableManufacturerVariablePower') return 'manufacturer';
  if (/Generator/.test(n)) return 'generator';
  if (/Extractor|WaterPump|Frackin/.test(n)) return 'extractor';
  if (/Conveyor|Pipeline|PipeHyper|Splitter|Merger|Passthrough|PoleConveyor|PolePipe/.test(n)) return 'logistics';
  if (/RailroadTrack|RailroadStation|RailroadSignal|RailroadAttachment|TrainPlatform|DockingStation|DroneStation|Portal/.test(n)) return 'transport';
  if (/Storage|Shelf|CentralStorage/.test(n)) return 'storage';
  if (/PowerPole|PowerStorage|Wire|CircuitSwitch|PriorityPowerSwitch|PowerBooster/.test(n)) return 'power';
  if (/Wall|Foundation|Ramp|Beam|Pillar|Walkway|Stair|Ladder|Door|Barrier|Elevator|Roof|Passthrough/.test(n)) return 'structure';
  if (/Light|Sign|Floodlight/.test(n)) return 'decoration';
  if (/TradingPost|ResourceSink|MAM|BlueprintDesigner|SpaceElevator/.test(n)) return 'hub';
  return 'other';
}

function buildBuildings(groups, itemIndex, recipes) {
  // 건설 레시피에서 (건물 디스크립터 -> 건설 비용) 역인덱스를 만든다
  const costByDescriptor = new Map();
  for (const r of recipes) {
    if (!r.isBuildingRecipe) continue;
    for (const p of r.products) {
      costByDescriptor.set(p.item, r.ingredients.map((i) => ({ item: i.item, name: i.name, amount: i.amount })));
    }
  }
  // Build_X_C <-> Desc_X_C 매칭 (대부분 접두사만 다르다)
  const descFor = (buildClass) => {
    const stem = buildClass.replace(/^Build_/, '').replace(/_C$/, '');
    return itemIndex.has('Desc_' + stem + '_C') ? 'Desc_' + stem + '_C' : null;
  };

  const out = [];
  for (const grp of groups) {
    const n = nativeShort(grp);
    if (!n.startsWith('FGBuildable')) continue;
    for (const c of grp.Classes) {
      const name = clean(c.mDisplayName);
      if (!name) continue; // 표시명 없는 내부 변형 클래스(경량 파운데이션 등)는 제외
      const desc = descFor(c.ClassName);
      const b = {
        className: c.ClassName,
        name,
        description: clean(c.mDescription),
        nativeClass: n,
        category: categorize(n),
        descriptorClass: desc,
        buildCost: desc ? (costByDescriptor.get(desc) ?? null) : null,
        power: {
          consumptionMW: num(c.mPowerConsumption) || null,
          productionMW: num(c.mPowerProduction) || null,
          consumptionExponent: num(c.mPowerConsumptionExponent) || null,
          estimatedMinMW: c.mEstimatedMininumPowerConsumption !== undefined
            ? num(c.mEstimatedMininumPowerConsumption) : null,
          estimatedMaxMW: c.mEstimatedMaximumPowerConsumption !== undefined
            ? num(c.mEstimatedMaximumPowerConsumption) : null,
        },
        manufacturingSpeed: c.mManufacturingSpeed !== undefined ? num(c.mManufacturingSpeed) : null,
        somersloopSlots: c.mProductionShardSlotSize !== undefined ? num(c.mProductionShardSlotSize) : null,
        powerShardSlots: c.mPotentialShardSlots !== undefined ? num(c.mPotentialShardSlots) : null,
        // 배치 도면용 실제 점유 공간 (FRD F13-2)
        footprint: parseClearance(c.mClearanceData),
        productionBoostPowerExponent: c.mProductionBoostPowerConsumptionExponent !== undefined
          ? num(c.mProductionBoostPowerConsumptionExponent) : null,
      };

      // 채취기: 사이클당 산출 -> 분당 산출 (노멀 순도 기준)
      if (c.mExtractCycleTime !== undefined) {
        const cycle = num(c.mExtractCycleTime);
        const raw = num(c.mItemsPerCycle);
        const forms = String(c.mAllowedResourceForms ?? '');
        const fluid = forms.includes('RF_LIQUID') || forms.includes('RF_GAS')
          || n === 'FGBuildableWaterPump' || n === 'FGBuildableFrackingExtractor';
        const per = fluid ? raw / FLUID_SCALE : raw;
        b.extraction = {
          cycleTimeSec: cycle,
          itemsPerCycle: per,
          perMinuteAtNormalPurity: cycle > 0 ? round((per * 60) / cycle) : null,
          allowedForms: forms.replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
        };
      }
      // 발전기: 연료 목록 + 보조 자원(물) 비율
      if (Array.isArray(c.mFuel) && c.mFuel.length) {
        b.fuels = c.mFuel.map((f) => ({
          fuel: f.mFuelClass || null,
          supplemental: f.mSupplementalResourceClass || null,
          byproduct: f.mByproduct || null,
          byproductAmount: f.mByproductAmount ? Number(f.mByproductAmount) : null,
        }));
        b.supplementalToPowerRatio = num(c.mSupplementalToPowerRatio) || null;
      }
      if (c.mSpeed !== undefined) b.beltItemsPerMinute = num(c.mSpeed) / 2; // 내부 단위는 items/min의 2배
      if (c.mFlowLimit !== undefined) b.pipeFlowM3PerMinute = round(num(c.mFlowLimit) * 60);
      if (c.mStorageSizeX !== undefined) b.storageSlots = num(c.mStorageSizeX) * num(c.mStorageSizeY);

      out.push(b);
    }
  }
  return out;
}

const SCHEMATIC_TYPE = {
  EST_Milestone: 'milestone',
  EST_Alternate: 'alternate',
  EST_MAM: 'mam',
  EST_ResourceSink: 'awesome-shop',
  EST_HardDrive: 'hard-drive',
  EST_Custom: 'custom',
  EST_Tutorial: 'tutorial',
  EST_Customization: 'customization',
};

const EMPTY_UNLOCKS = () => ({
  recipes: [], schematics: [], items: [], scannables: [],
  inventorySlots: 0, armSlots: 0, other: [],
});

function normalizeUnlocks(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return EMPTY_UNLOCKS();
    try { list = JSON.parse(raw); } catch { return EMPTY_UNLOCKS(); }
  }
  if (!Array.isArray(list)) return EMPTY_UNLOCKS();
  const u = EMPTY_UNLOCKS();
  for (const e of list) {
    switch (e.Class) {
      case 'BP_UnlockRecipe_C':
        u.recipes.push(...parseClassList(e.mRecipes)); break;
      case 'BP_UnlockSchematic_C':
        u.schematics.push(...parseClassList(e.mSchematics)); break;
      case 'BP_UnlockItemDescriptor_C':
      case 'BP_UnlockGiveItem_C':
        u.items.push(...parseItemAmounts(e.mItemsToGive ?? e.mItems ?? '').map((x) => x.class)); break;
      case 'BP_UnlockScannableResource_C':
      case 'BP_UnlockScannableObject_C':
        u.scannables.push(...parseClassList(e.mResourcePairsToAddToScanner ?? e.mScannableObjects ?? '')
          .filter((x) => x.endsWith('_C'))); break;
      case 'BP_UnlockInventorySlot_C':
        u.inventorySlots += num(e.mNumInventorySlotsToUnlock); break;
      case 'BP_UnlockArmEquipmentSlot_C':
        u.armSlots += num(e.mNumArmEquipmentSlotsToUnlock); break;
      default:
        if (e.Class) u.other.push(e.Class);
    }
  }
  return u;
}

function buildSchematics(groups, itemIndex) {
  const grp = findGroup(groups, 'FGSchematic');
  if (!grp) return [];
  return grp.Classes.map((c) => {
    const cost = parseItemAmounts(c.mCost).map((e) => {
      const it = itemIndex.get(e.class);
      return {
        item: e.class,
        name: it ? it.name : null,
        amount: it && it.isFluid ? e.amount / FLUID_SCALE : e.amount,
      };
    });
    return {
      className: c.ClassName,
      name: clean(c.mDisplayName),
      description: clean(c.mDescription),
      type: SCHEMATIC_TYPE[clean(c.mType)] ?? clean(c.mType),
      rawType: clean(c.mType),
      techTier: c.mTechTier !== undefined ? num(c.mTechTier) : null,
      cost,
      timeToCompleteSec: num(c.mTimeToComplete),
      menuPriority: num(c.mMenuPriority),
      dependencies: parseClassList(c.mSchematicDependencies).filter((x) => x.startsWith('Schematic')),
      unlocks: normalizeUnlocks(c.mUnlocks),
    };
  });
}

// ---------------------------------------------------------------- 4. 실행

function fail(msg, code = 1) {
  console.error('\n[실패] ' + msg);
  process.exit(code);
}

function main() {
  let file;
  try {
    file = resolveDocsFile();
  } catch (e) {
    console.error('\n[실패] ' + e.message);
    if (e.tried) {
      console.error('\n탐색한 경로:');
      for (const p of e.tried.slice(0, 24)) console.error('  - ' + p);
      if (e.tried.length > 24) console.error('  ... 외 ' + (e.tried.length - 24) + '개');
    }
    console.error([
      '',
      '해결 방법:',
      '  1) 게임이 설치된 머신에서 실행하거나',
      '  2) 설치본에서 CommunityResources/Docs/' + OPTS.locale + '.json 을 복사해 온 뒤',
      '     node scripts/build-data.mjs --docs="<복사한 파일 경로>"',
      '  3) 또는 SATISFACTORY_DOCS 환경변수에 Docs 폴더 경로를 지정하세요.',
      '',
      '주의: 공개 저장소 미러(greeny/SatisfactoryTools 등)는 1.2 미반영이라 대체 소스로 쓰지 않습니다.',
      '      근거는 docs/adr/0008-game-data-source.md 참고.',
    ].join('\n'));
    process.exit(1);
  }

  log('소스: ' + file);
  const src = readDocs(file);
  log('  인코딩=' + src.encoding
    + ' 크기=' + (src.bytes / 1048576).toFixed(2) + 'MB'
    + ' sha256=' + src.sha256.slice(0, 16) + '...');

  let groups;
  try {
    groups = JSON.parse(src.text);
  } catch (e) {
    fail('JSON 파싱 오류: ' + e.message);
  }
  if (!Array.isArray(groups) || !groups[0] || !groups[0].NativeClass || !Array.isArray(groups[0].Classes)) {
    fail('예상 구조가 아닙니다. 최상위는 [{NativeClass, Classes:[...]}, ...] 여야 합니다.');
  }
  const totalClasses = groups.reduce((a, g) => a + g.Classes.length, 0);
  log('  구조 OK: NativeClass 그룹 ' + groups.length + '개 / 클래스 ' + totalClasses + '개');

  const items = buildItems(groups);
  const itemIndex = new Map(items.map((i) => [i.className, i]));
  const recipes = buildRecipes(groups, itemIndex);
  const buildings = buildBuildings(groups, itemIndex, recipes);
  // FGBuildingDescriptor는 mDisplayName이 비어 있고 표시명은 Build_* 클래스에 있다.
  // 건물 목록을 만든 뒤 디스크립터 아이템에 이름/설명을 역채움한다.
  for (const b of buildings) {
    if (!b.descriptorClass) continue;
    const it = itemIndex.get(b.descriptorClass);
    if (it && !it.name) {
      it.name = b.name;
      it.description = it.description || b.description;
      it.buildingClass = b.className;
    }
  }

  const schematics = buildSchematics(groups, itemIndex);
  const milestones = schematics
    .filter((s) => s.type === 'milestone')
    .sort((a, b) => (a.techTier - b.techTier) || (a.menuPriority - b.menuPriority));

  // --- 새니티 체크: 스키마가 조용히 바뀐 채로 빌드가 성공하는 것을 막는다
  const wetConcrete = recipes.find((x) => x.className === 'Recipe_Alternate_WetConcrete_C');
  const ironPlate = recipes.find((r) => r.className === 'Recipe_IronPlate_C');
  const constructor = buildings.find((b) => b.className === 'Build_ConstructorMk1_C');
  const beltMk1 = buildings.find((b) => b.className === 'Build_ConveyorBeltMk1_C');
  const checks = [
    ['아이템 100개 이상', items.length >= 100],
    ['레시피 500개 이상', recipes.length >= 500],
    ['건물 100개 이상', buildings.length >= 100],
    ['스키매틱 200개 이상', schematics.length >= 200],
    ['마일스톤 20개 이상', milestones.length >= 20],
    ['대체 레시피 100개 이상', recipes.filter((r) => r.isAlternate).length >= 100],
    ['Iron Plate 레시피 (Iron Ingot 3 -> Iron Plate 2)',
      !!ironPlate && ironPlate.products[0]?.amount === 2 && ironPlate.ingredients[0]?.amount === 3],
    ['액체 단위 환산 (Wet Concrete 물 5 m3)',
      !!wetConcrete && wetConcrete.ingredients.some((i) => i.item === 'Desc_Water_C' && i.amount === 5)],
    ['제조소 전력값 (Constructor 4 MW)', !!constructor && constructor.power.consumptionMW === 4],
    ['벨트 속도 (Mk.1 60 items/min)', !!beltMk1 && beltMk1.beltItemsPerMinute === 60],
    ['건물 치수 — 제작기 8×10×6 m (충돌 박스 합집합)', (() => {
      const f = buildings.find((b) => b.className === 'Build_ConstructorMk1_C')?.footprint;
      return !!f && f.widthM === 8 && f.lengthM === 10 && f.heightM === 6;
    })()],
    ['건물 치수 — 입자 가속기 폭 52 m (Mk.1 블루프린트 32m 초과, 위키와 일치)', (() => {
      const f = buildings.find((b) => b.className === 'Build_HadronCollider_C')?.footprint;
      return !!f && f.widthM === 52;
    })()],
    ['소머슬룹 전력 지수 = 2', (() => {
      const b = buildings.find((x) => x.className === 'Build_ConstructorMk1_C');
      return b?.productionBoostPowerExponent === 2;
    })()],
    // 표시명은 로케일마다 번역되므로 검사에 쓰지 않는다. 클래스명은 로케일 독립이다.
    ['1.2 콘텐츠 포함 (Build_FluidTruckStation_C)',
      buildings.some((b) => b.className === 'Build_FluidTruckStation_C')],
    ['마일스톤에 레시피 언락이 연결됨', milestones.some((m) => m.unlocks.recipes.length > 0)],
    ['레시피 producedIn이 실제 건물과 매칭됨', (() => {
      const known = new Set(buildings.map((b) => b.className));
      const refs = new Set(recipes.flatMap((r) => r.producedIn));
      const miss = [...refs].filter((r) => !known.has(r));
      if (miss.length) log('    (미매칭 producedIn: ' + miss.slice(0, 5).join(', ') + ')');
      return miss.length === 0;
    })()],
  ];
  let failed = 0;
  log('\n검증:');
  for (const [label, ok] of checks) {
    log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label);
    if (!ok) failed++;
  }

  log('\n집계: items=' + items.length
    + ' recipes=' + recipes.length + ' (alt=' + recipes.filter((r) => r.isAlternate).length + ')'
    + ' buildings=' + buildings.length
    + ' schematics=' + schematics.length
    + ' milestones=' + milestones.length);

  if (failed > 0) {
    fail('검증 ' + failed + '건 실패 — 원본 스키마가 바뀌었을 수 있습니다. 파일을 쓰지 않고 종료합니다.', 2);
  }

  const meta = {
    $comment: '이 폴더의 items/recipes/buildings/schematics/milestones.json은 scripts/build-data.mjs가 게임 원본에서 생성합니다. 직접 수정하지 마세요.',
    generatedAt: new Date().toISOString(),
    generator: 'scripts/build-data.mjs',
    source: {
      kind: 'local-game-install',
      file,
      locale: OPTS.locale,
      encoding: src.encoding,
      bytes: src.bytes,
      sha256: src.sha256,
      steamBuildId: readBuildId(file),
      nativeClassGroups: groups.length,
      totalClasses,
    },
    counts: {
      items: items.length,
      recipes: recipes.length,
      alternateRecipes: recipes.filter((r) => r.isAlternate).length,
      buildings: buildings.length,
      schematics: schematics.length,
      milestones: milestones.length,
    },
    conventions: {
      fluidUnits: '액체/기체 수치는 원본의 1/1000 (리터 -> m3)로 환산됨',
      rates: 'perMinute = amount * 60 / durationSec (클록 100%, 소머슬룹 미사용 기준)',
      belt: 'beltItemsPerMinute = mSpeed / 2',
      footprint: 'mClearanceData의 모든 충돌 박스 합집합, cm -> m',
      pipe: 'pipeFlowM3PerMinute = mFlowLimit * 60',
      extraction: 'perMinuteAtNormalPurity = itemsPerCycle * 60 / cycleTimeSec (순도 배율 미적용)',
    },
  };

  if (OPTS.check) {
    log('\n--check 모드: 파일을 쓰지 않았습니다.');
    return;
  }

  fs.mkdirSync(OPTS.out, { recursive: true });
  const write = (name, data) => {
    const p = path.join(OPTS.out, name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
    log('  wrote ' + path.relative(ROOT, p).replace(/\\/g, '/')
      + ' (' + (fs.statSync(p).size / 1024).toFixed(0) + 'KB)');
  };
  log('\n출력: ' + path.relative(ROOT, OPTS.out).replace(/\\/g, '/') + '/');
  write('meta.json', meta);
  write('items.json', items);
  write('recipes.json', recipes);
  write('buildings.json', buildings);
  write('schematics.json', schematics);
  write('milestones.json', milestones);
  log('\n완료.');
}

main();
