/**
 * 검증형 공장 설계판.
 *
 * 화면에 그리는 사각형·포트·경로는 페이지가 전달한 버전 데이터만 사용한다. 기존 포트 코퍼스는
 * 재검증 중이므로 UI에서 검증 완료로 표현하지 않는다. 발행 가능 여부는 domain/factory 검증기 하나가
 * 판정하되, 근거 승인 상태도 별도 게이트로 결합해야 한다.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  migrateStoredPlan,
  nextEditorSequence,
  restoreStoredPlan,
  toStoredPlan,
  type StoredPlacement,
  type StoredPlan,
} from '../domain/factory/editor-state';
import { drawingPixelSize, factoryDrawingBounds, type DrawingBounds } from '../domain/factory/drawing-bounds';
import { routeAroundMachines } from '../domain/factory/route';
import { transportPathParts, type TransportTurnPart } from '../domain/factory/transport-geometry';
import { resolveTransportSpec, transportSpecForFlow } from '../domain/factory/transport-specs';
import { validateFactoryPlan } from '../domain/factory/validate';
import {
  loadPlannerHandoff,
  savePlannerHandoff,
  type PlannerHandoff,
  type PlannerHandoffEntry,
} from '../state/planner-handoff';
import type {
  Box3,
  FactoryPlan,
  FoundationTile,
  MachineSpec,
  Placement,
  PortReference,
  QuarterTurn,
  RailRoute,
  TransportRoute,
  ValidationIssue,
  Vec3,
} from '../domain/factory/types';

export interface DrawingMachine extends MachineSpec {
  imageUrl: string;
  imageKind: 'topview' | 'icon';
  occupancyFrame?: { x: number; y: number; width: number; height: number };
  statusImageUrls?: { active: string; activeWithCrystal: string; standby: string; error: string };
  recipes: DrawingRecipe[];
  somersloopSlots: number;
  basePowerMW: number;
  powerExponent: number;
  productionBoostPowerExponent: number;
}

export interface DrawingRecipePart { item: string; name: string; perMinute: number }
export interface DrawingRecipe {
  id: string;
  name: string;
  isAlternate: boolean;
  ingredients: DrawingRecipePart[];
  products: DrawingRecipePart[];
}

interface Props {
  machines: DrawingMachine[];
  railName: string;
}

type DragState = {
  kind: 'machine' | 'foundation';
  id: string;
  dx: number;
  dy: number;
  historyRecorded: boolean;
} | {
  kind: 'canvas';
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
} | {
  kind: 'marquee';
  start: Vec3;
};

type PlacementTool = { kind: 'foundation' } | { kind: 'rail' }
  | { kind: 'transport'; medium: 'solid' | 'fluid' }
  | { kind: 'lift'; medium: 'solid' | 'fluid' }
  | {
  kind: 'machine';
  buildingClass: string;
  handoff?: PlannerHandoffEntry;
};

const SAVE_KEY = 'sfops.validated-planner.v4';
const FOUNDATION = 8;
const SNAP = 1;

type DrawingLayer = 'foundations' | 'machines' | 'logistics' | 'elevation' | 'flow';
type DrawingLayers = Record<DrawingLayer, boolean>;

const INLINE_SVG_PROPERTIES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
  'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect',
] as const;

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('자산을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function standaloneSvgBlob(svg: SVGSVGElement, bounds: DrawingBounds): Promise<Blob> {
  const stateful = [...svg.querySelectorAll('.is-selected, .is-active')];
  const savedClasses = stateful.map((element) => element.getAttribute('class'));
  stateful.forEach((element) => {
    element.classList.remove('is-selected');
    element.classList.remove('is-active');
  });

  const clone = svg.cloneNode(true) as SVGSVGElement;
  try {
    const originals = [svg, ...svg.querySelectorAll('*')];
    const copies = [clone, ...clone.querySelectorAll('*')];
    originals.forEach((original, index) => {
      const copy = copies[index] as SVGElement | undefined;
      if (!copy) return;
      const computed = getComputedStyle(original);
      const inline = INLINE_SVG_PROPERTIES
        .map((property) => `${property}:${computed.getPropertyValue(property)}`)
        .join(';');
      copy.setAttribute('style', inline);
    });
  } finally {
    stateful.forEach((element, index) => {
      const className = savedClasses[index];
      if (className) element.setAttribute('class', className);
      else element.removeAttribute('class');
    });
  }

  clone.querySelectorAll('.vp-port, .vp-machine-hover, .vp-placement-ghost, .vp-marquee, .vp-foundation-hit')
    .forEach((element) => element.remove());
  clone.removeAttribute('class');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.setAttribute('width', String(Math.ceil(bounds.width * 64)));
  clone.setAttribute('height', String(Math.ceil(bounds.height * 64)));
  clone.querySelectorAll('.vp-grid-bg, .vp-grid-overlay').forEach((element) => {
    element.setAttribute('x', String(bounds.x));
    element.setAttribute('y', String(bounds.y));
    element.setAttribute('width', String(bounds.width));
    element.setAttribute('height', String(bounds.height));
  });

  const cache = new Map<string, string>();
  for (const image of clone.querySelectorAll('image')) {
    const href = image.getAttribute('href');
    if (!href || href.startsWith('data:')) continue;
    const absolute = new URL(href, window.location.href).href;
    let embedded = cache.get(absolute);
    if (!embedded) {
      const response = await fetch(absolute);
      if (!response.ok) throw new Error(`도면 자산 응답 ${response.status}`);
      embedded = await blobAsDataUrl(await response.blob());
      cache.set(absolute, embedded);
    }
    image.setAttribute('href', embedded);
  }
  const namespace = 'http://www.w3.org/2000/svg';
  const metadata = document.createElementNS(namespace, 'metadata');
  metadata.textContent = JSON.stringify({
    schemaVersion: 1,
    scale: { pixelsPerMeter: 64, meterGridM: 1, foundationGridM: 8 },
    layers: ['foundations', 'lower-logistics', 'machines', 'upper-logistics', 'labels'],
    contracts: ['game-hard-clearance', 'transport-mark-flow-capacity', 'elevation-z'],
  });
  clone.prepend(metadata);

  const rootStyle = getComputedStyle(document.documentElement);
  const color = (token: string) => rootStyle.getPropertyValue(token).trim() || 'currentColor';
  const legend = document.createElementNS(namespace, 'g');
  const legendWidth = Math.min(44, Math.max(24, bounds.width * .58));
  const legendHeight = 5.4;
  legend.setAttribute('class', 'construction-legend');
  legend.setAttribute('transform', `translate(${bounds.x + .8} ${bounds.y + bounds.height - legendHeight - .8})`);
  const background = document.createElementNS(namespace, 'rect');
  background.setAttribute('width', String(legendWidth));
  background.setAttribute('height', String(legendHeight));
  background.setAttribute('rx', '.35');
  background.setAttribute('fill', color('--bg'));
  background.setAttribute('fill-opacity', '.92');
  background.setAttribute('stroke', color('--line-strong'));
  background.setAttribute('stroke-width', '.08');
  legend.append(background);
  [
    'Satisfactory Ops 시공 도면 · 64 px/m',
    '그리드 1 m · 파운데이션 8 m · 흰 코너 = 게임 하드 점유',
    '운송 라벨 = Mk · 품목 · 유량/용량 · 화살표 = 흐름 방향',
    '하부 운송 → 설비 → 상부 운송/리프트 · Z 라벨 = 높이',
  ].forEach((label, index) => {
    const text = document.createElementNS(namespace, 'text');
    text.setAttribute('x', '.65');
    text.setAttribute('y', String(1.05 + index * 1.18));
    text.setAttribute('fill', color(index === 0 ? '--ink-1' : '--ink-2'));
    text.setAttribute('font-family', color('--font-mono'));
    text.setAttribute('font-size', index === 0 ? '.62' : '.5');
    text.setAttribute('font-weight', index === 0 ? '700' : '500');
    text.textContent = label;
    legend.append(text);
  });
  clone.append(legend);
  const xml = new XMLSerializer().serializeToString(clone);
  return new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
}

function boundsOf(spec: MachineSpec): Box3 {
  return {
    min: {
      x: Math.min(...spec.hardBoxes.map((box) => box.min.x)),
      y: Math.min(...spec.hardBoxes.map((box) => box.min.y)),
      z: Math.min(...spec.hardBoxes.map((box) => box.min.z)),
    },
    max: {
      x: Math.max(...spec.hardBoxes.map((box) => box.max.x)),
      y: Math.max(...spec.hardBoxes.map((box) => box.max.y)),
      z: Math.max(...spec.hardBoxes.map((box) => box.max.z)),
    },
  };
}

export function imageRect(spec: DrawingMachine, bounds: Box3) {
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const frame = spec.occupancyFrame;
  if (!frame) return { x: bounds.min.x, y: bounds.min.y, width, height };
  const imageWidth = width / frame.width;
  const imageHeight = height / frame.height;
  return {
    x: bounds.min.x - frame.x * imageWidth,
    y: bounds.min.y - frame.y * imageHeight,
    width: imageWidth,
    height: imageHeight,
  };
}

export type MachineVisualState = 'active' | 'activeWithCrystal' | 'standby' | 'error';

export function machineVisualState(
  placement: Placement,
  spec: DrawingMachine,
  placements: Placement[],
  routes: TransportRoute[],
  issues: ValidationIssue[],
): MachineVisualState {
  const connected = new Set(routes.flatMap((route) => [
    `${route.from.placementId}:${route.from.portId}`,
    `${route.to.placementId}:${route.to.portId}`,
  ]));
  if (spec.ports.some((port) => !connected.has(`${placement.id}:${port.id}`)) ||
      issues.some((issue) => issue.severity === 'error' && issue.subjectIds.includes(placement.id))) return 'error';

  const byId = new Map(placements.map((entry) => [entry.id, entry]));
  const operation = placement.operation;
  if (operation) {
    for (const [itemId, required] of Object.entries(operation.inputRates)) {
      const supplied = routes.filter((route) => route.to.placementId === placement.id && route.itemId === itemId)
        .reduce((sum, route) => sum + (byId.get(route.from.placementId)?.operation?.outputRates[itemId] ?? route.flowPerMinute), 0);
      if (supplied + 1e-6 < required) return 'standby';
    }
    for (const [itemId, produced] of Object.entries(operation.outputRates)) {
      const demanded = routes.filter((route) => route.from.placementId === placement.id && route.itemId === itemId)
        .reduce((sum, route) => sum + (byId.get(route.to.placementId)?.operation?.inputRates[itemId] ?? route.flowPerMinute), 0);
      if (demanded + 1e-6 < produced) return 'standby';
    }
    if ((operation.powerShards ?? 0) > 0 || (operation.clockPercent ?? 100) > 100) return 'activeWithCrystal';
  }
  return 'active';
}

function operationFor(machine: DrawingMachine, recipe: DrawingRecipe, clockPercent = 100, powerShards = 0, somersloops = 0) {
  const clock = Math.max(.01, Math.min(2.5, clockPercent / 100));
  const usedSloops = Math.max(0, Math.min(machine.somersloopSlots, somersloops));
  const outputMultiplier = machine.somersloopSlots ? 1 + usedSloops / machine.somersloopSlots : 1;
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    clockPercent: clock * 100,
    powerShards,
    somersloops: usedSloops,
    outputMultiplier,
    inputRates: Object.fromEntries(recipe.ingredients.map((part) => [part.item, part.perMinute * clock])),
    outputRates: Object.fromEntries(recipe.products.map((part) => [part.item, part.perMinute * clock * outputMultiplier])),
    powerDemandMW: machine.basePowerMW * clock ** machine.powerExponent * outputMultiplier ** machine.productionBoostPowerExponent,
  };
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 커서가 들어 있는 8m 셀의 좌상단을 반환한다. 교차점 반올림은 다음 셀로 튀므로 쓰지 않는다. */
export function foundationCellOrigin(point: Pick<Vec3, 'x' | 'y'>): { x: number; y: number } {
  return {
    x: Math.floor(point.x / FOUNDATION) * FOUNDATION,
    y: Math.floor(point.y / FOUNDATION) * FOUNDATION,
  };
}

/** 잘라낸 이미지의 회전 중심에 의존하지 않고 두 연결 방향으로 90° 곡선을 만든다. */
export function transportTurnPath(turn: TransportTurnPart, radiusM = 2): string {
  const startX = turn.at.x + turn.connectionA.x * radiusM;
  const startY = turn.at.y + turn.connectionA.y * radiusM;
  const endX = turn.at.x + turn.connectionB.x * radiusM;
  const endY = turn.at.y + turn.connectionB.y * radiusM;
  return `M ${startX} ${startY} Q ${turn.at.x} ${turn.at.y} ${endX} ${endY}`;
}

function svgPoint(svg: SVGSVGElement, event: PointerEvent): Vec3 {
  let matrix: DOMMatrix | null = null;
  try { matrix = svg.getScreenCTM?.() ?? null; } catch { matrix = null; }
  if (svg.createSVGPoint && matrix) try {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const world = point.matrixTransform(matrix.inverse());
    return { x: world.x, y: world.y, z: 0 };
  } catch {
    // happy-dom과 일부 경량 SVG 구현은 메서드만 노출하고 행렬 연산은 구현하지 않는다.
  }
  const values = (svg.getAttribute('viewBox') ?? '-64 -36 128 72').split(/\s+/).map(Number);
  const rect = svg.getBoundingClientRect();
  const width = rect.width || 1280;
  const height = rect.height || 720;
  return {
    x: values[0] + (event.clientX - rect.left) / width * values[2],
    y: values[1] + (event.clientY - rect.top) / height * values[3],
    z: 0,
  };
}

function rerouteTransports(routes: TransportRoute[], placements: Placement[]): TransportRoute[] {
  return routes.map((route) => {
    const fromPlacement = placements.find((placement) => placement.id === route.from.placementId);
    const toPlacement = placements.find((placement) => placement.id === route.to.placementId);
    const fromPort = fromPlacement?.spec.ports.find((port) => port.id === route.from.portId);
    const toPort = toPlacement?.spec.ports.find((port) => port.id === route.to.portId);
    if (!fromPlacement || !toPlacement || !fromPort || !toPort) return route;
    return { ...route, pathM: routeAroundMachines(fromPlacement, fromPort, toPlacement, toPort, placements) };
  });
}

function portRate(placement: Placement, portId: string) {
  const port = placement.spec.ports.find((entry) => entry.id === portId);
  const operation = placement.operation;
  if (!port || !operation) return undefined;
  const ports = placement.spec.ports.filter((entry) => entry.medium === port.medium && entry.direction === port.direction);
  const index = ports.findIndex((entry) => entry.id === portId);
  const rates = port.direction === 'input' ? operation.inputRates : operation.outputRates;
  const entry = Object.entries(rates)[Math.max(0, index)];
  return entry ? { itemId: entry[0], flowPerMinute: entry[1] } : undefined;
}

function syncTransportRates(routes: TransportRoute[], placements: Placement[]): TransportRoute[] {
  return routes.map((route) => {
    const from = placements.find((placement) => placement.id === route.from.placementId);
    const to = placements.find((placement) => placement.id === route.to.placementId);
    const rate = (from && portRate(from, route.from.portId)) || (to && portRate(to, route.to.portId));
    if (!rate) return route;
    const transport = transportSpecForFlow(route.medium, rate.flowPerMinute);
    return {
      ...route,
      ...rate,
      transportClass: transport.buildingClass,
      capacityPerMinute: transport.capacityPerMinute,
    };
  });
}

export default function ValidatedFactoryPlanner({ machines, railName }: Props) {
  const byClass = useMemo(() => new Map(machines.map((machine) => [machine.buildingClass, machine])), [machines]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [foundations, setFoundations] = useState<FoundationTile[]>([]);
  const [transports, setTransports] = useState<TransportRoute[]>([]);
  const [rails, setRails] = useState<RailRoute[]>([]);
  const [handoff, setHandoff] = useState<PlannerHandoff | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFoundationId, setSelectedFoundationId] = useState<string | null>(null);
  const [selectedRailId, setSelectedRailId] = useState<string | null>(null);
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [pendingPort, setPendingPort] = useState<PortReference | null>(null);
  const [placementTool, setPlacementTool] = useState<PlacementTool | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Vec3 | null>(null);
  const [railStart, setRailStart] = useState<Vec3 | null>(null);
  const [transportStart, setTransportStart] = useState<Vec3 | null>(null);
  const [marquee, setMarquee] = useState<{ start: Vec3; end: Vec3 } | null>(null);
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<DrawingLayers>({ foundations: true, machines: true, logistics: true, elevation: true, flow: true });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState({ width: 1200, height: 720 });
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const seq = useRef(1);
  const drag = useRef<DragState | null>(null);
  const copiedPlacement = useRef<StoredPlacement | null>(null);
  const history = useRef<{ past: StoredPlan[]; future: StoredPlan[] }>({ past: [], future: [] });
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const stored = migrateStoredPlan(JSON.parse(raw) as unknown);
        if (stored) {
          const restored = restoreStoredPlan(stored, byClass);
          setPlacements(restored.placements);
          setFoundations(restored.foundations);
          setTransports(restored.transports);
          setRails(restored.rails);
          seq.current = nextEditorSequence(stored);
        }
      }
    } catch {
      // 저장 손상은 빈 검증 도면으로 격리한다.
    }
    setHandoff(loadPlannerHandoff());
    setReady(true);
  }, [byClass]);

  useEffect(() => {
    if (!ready) return;
    const stored = toStoredPlan(placements, foundations, transports, rails);
    localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
  }, [ready, placements, foundations, transports, rails]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      setBox((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        setPlacementTool(null);
        setCursorWorld(null);
        setPendingPort(null);
        setRailStart(null);
        setTransportStart(null);
        setNotice('배치 취소');
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelected();
        event.preventDefault();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        if (event.shiftKey) redo();
        else undo();
        event.preventDefault();
        return;
      }
      if (key === 'y') {
        redo();
        event.preventDefault();
        return;
      }
      if (key === 'c') {
        const selected = placements.find((placement) => placement.id === selectedId);
        if (!selected) return;
        copiedPlacement.current = {
          id: selected.id,
          buildingClass: selected.spec.buildingClass,
          positionM: selected.positionM,
          rotation: selected.rotation,
          operation: selected.operation,
        };
        setNotice(`${selected.spec.name} 복사됨 · Ctrl+V로 붙여넣기`);
        event.preventDefault();
        return;
      }
      if (key !== 'v') return;
      const copied = copiedPlacement.current;
      const spec = copied ? byClass.get(copied.buildingClass) : undefined;
      if (!copied || !spec) return;
      recordHistory();
      const next: Placement = {
        id: `machine-${seq.current++}`,
        spec,
        positionM: { ...copied.positionM, x: copied.positionM.x + 2, y: copied.positionM.y + 2 },
        rotation: copied.rotation,
        operation: copied.operation ? structuredClone(copied.operation) : undefined,
      };
      setPlacements((current) => [...current, next]);
      setSelectedId(next.id);
      setSelectedFoundationId(null);
      setGroupSelection([]);
      setNotice(`${spec.name} 붙여넣음`);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [byClass, groupSelection, historyCounts, placements, selectedFoundationId, selectedId, selectedRailId]);

  const plan: FactoryPlan = useMemo(() => {
    return {
      schemaVersion: 1,
      id: 'browser-plan',
      foundations,
      placements,
      transports,
      rails,
      powerSources: [],
      powerEdges: [],
    };
  }, [foundations, placements, transports, rails]);
  const validation = useMemo(() => validateFactoryPlan(plan, { validatePower: false }), [plan]);

  const visibleMachines = useMemo(() => machines.filter((machine) => (
    !query || machine.name.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko'))
  )), [machines, query]);
  const selectedPlacement = placements.find((placement) => placement.id === selectedId);
  const selectedMachine = selectedPlacement ? byClass.get(selectedPlacement.spec.buildingClass) : undefined;
  const selectedRecipe = selectedMachine?.recipes.find((recipe) => recipe.id === selectedPlacement?.operation?.recipeId);
  const itemNames = useMemo(() => new Map(machines.flatMap((machine) => machine.recipes.flatMap((recipe) => (
    [...recipe.ingredients, ...recipe.products].map((part) => [part.item, part.name] as const)
  )))), [machines]);
  const ghostMachine = placementTool?.kind === 'machine' ? byClass.get(placementTool.buildingClass) : undefined;
  const ghostPoint = cursorWorld
    ? placementTool?.kind === 'foundation'
      ? foundationCellOrigin(cursorWorld)
      : {
          x: Math.round(cursorWorld.x / SNAP) * SNAP,
          y: Math.round(cursorWorld.y / SNAP) * SNAP,
        }
    : null;

  const viewWidth = 128 / zoom;
  const viewHeight = viewWidth * Math.max(.48, box.height / Math.max(box.width, 1));
  const viewBox = `${pan.x - viewWidth / 2} ${pan.y - viewHeight / 2} ${viewWidth} ${viewHeight}`;

  function updateHistoryCounts() {
    setHistoryCounts({ undo: history.current.past.length, redo: history.current.future.length });
  }

  function clearTransientSelection() {
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setPendingPort(null);
    setPlacementTool(null);
    setCursorWorld(null);
    setRailStart(null);
    setMarquee(null);
  }

  function applyStoredState(stored: StoredPlan) {
    const restored = restoreStoredPlan(stored, byClass);
    setPlacements(restored.placements);
    setFoundations(restored.foundations);
    setTransports(restored.transports);
    setRails(restored.rails);
    seq.current = nextEditorSequence(stored);
    clearTransientSelection();
  }

  function recordHistory() {
    const snapshot = toStoredPlan(placements, foundations, transports, rails);
    const previous = history.current.past.at(-1);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(snapshot)) {
      history.current.past.push(snapshot);
      if (history.current.past.length > 50) history.current.past.shift();
    }
    history.current.future = [];
    updateHistoryCounts();
  }

  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(toStoredPlan(placements, foundations, transports, rails));
    if (history.current.future.length > 50) history.current.future.shift();
    applyStoredState(previous);
    updateHistoryCounts();
    setNotice('실행 취소 · Ctrl+Shift+Z로 다시 실행');
  }

  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(toStoredPlan(placements, foundations, transports, rails));
    if (history.current.past.length > 50) history.current.past.shift();
    applyStoredState(next);
    updateHistoryCounts();
    setNotice('다시 실행 · Ctrl+Z로 실행 취소');
  }

  function addMachine(machine: DrawingMachine, positionM: Vec3, handoffEntry?: PlannerHandoffEntry) {
    recordHistory();
    const handoffRecipe = handoffEntry
      ? machine.recipes.find((recipe) => recipe.id === handoffEntry.recipeId)
      : undefined;
    const defaultRecipe = machine.recipes.find((recipe) => !recipe.isAlternate) ?? machine.recipes[0];
    const placement: Placement = {
      id: `machine-${seq.current++}`,
      spec: machine,
      positionM,
      rotation: 0,
      operation: handoffRecipe
        ? operationFor(machine, handoffRecipe, handoffEntry!.clockPercent)
        : defaultRecipe ? operationFor(machine, defaultRecipe) : undefined,
    };
    setPlacements((current) => [...current, placement]);
    setSelectedId(placement.id);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    if (handoffEntry) {
      const remaining = handoffEntry.remaining - 1;
      setHandoff((current) => {
        if (!current) return current;
        const entries = current.entries.flatMap((entry) => (
          entry.id !== handoffEntry.id ? [entry] : remaining > 0 ? [{ ...entry, remaining }] : []
        ));
        const next = entries.length ? { ...current, entries } : null;
        savePlannerHandoff(next);
        return next;
      });
      setPlacementTool(remaining > 0
        ? { kind: 'machine', buildingClass: machine.buildingClass, handoff: { ...handoffEntry, remaining } }
        : null);
      setNotice(`${machine.name} 배치 완료${remaining > 0 ? ` · 대기열 ${remaining}대 남음` : ' · 대기열 항목 완료'}`);
    } else {
      setPlacementTool(null);
      setNotice(`${machine.name} 배치 완료`);
    }
  }

  function addFoundation(xM: number, yM: number, zM = 0) {
    if (foundations.some((tile) => tile.xM === xM && tile.yM === yM && tile.zM === zM)) {
      setNotice('같은 층의 같은 자리에 이미 파운데이션이 있습니다.');
      return;
    }
    recordHistory();
    const tile: FoundationTile = { id: `foundation-${seq.current++}`, xM, yM, zM, sizeM: FOUNDATION };
    setFoundations((current) => [...current, tile]);
    setSelectedFoundationId(tile.id);
    setSelectedId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setNotice('파운데이션 배치 완료 · 계속 좌클릭해 배치하거나 Esc로 종료');
  }

  function queueMachine(machine: DrawingMachine) {
    setPlacementTool({ kind: 'machine', buildingClass: machine.buildingClass });
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setNotice(`${machine.name} · 캔버스에서 놓을 위치를 좌클릭하세요. Esc 취소`);
  }

  function queueFoundation() {
    setPlacementTool({ kind: 'foundation' });
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setNotice('파운데이션 · 캔버스에서 연속 배치할 위치를 좌클릭하세요. Esc 종료');
  }

  function queueRail() {
    setPlacementTool({ kind: 'rail' });
    setRailStart(null);
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setNotice('철도 · 시작점과 끝점을 차례로 클릭하세요. Esc 종료');
  }

  function queueTransport(medium: 'solid' | 'fluid') {
    setPlacementTool({ kind: 'transport', medium });
    setTransportStart(null);
    setRailStart(null);
    setNotice(`${medium === 'solid' ? '컨베이어 벨트' : '파이프'} 시작점을 클릭하세요.`);
  }

  function queueLift(medium: 'solid' | 'fluid') {
    setPlacementTool({ kind: 'lift', medium });
    setTransportStart(null);
    setRailStart(null);
    setNotice(`${medium === 'solid' ? '컨베이어 리프트' : '파이프 라이저'} 위치를 클릭하세요.`);
  }

  function removeSelected() {
    if (selectedRailId) {
      recordHistory();
      setRails((current) => current.filter((rail) => rail.id !== selectedRailId));
      setSelectedRailId(null);
      return;
    }
    if (selectedFoundationId) {
      recordHistory();
      setFoundations((current) => current.filter((tile) => tile.id !== selectedFoundationId));
      setSelectedFoundationId(null);
      return;
    }
    const targets = new Set([...(selectedId ? [selectedId] : []), ...groupSelection]);
    if (!targets.size) return;
    recordHistory();
    setPlacements((current) => current.filter((placement) => !targets.has(placement.id)));
    setTransports((current) => current.filter((route) => (
      !targets.has(route.from.placementId) && !targets.has(route.to.placementId)
    )));
    setPendingPort(null);
    setSelectedId(null);
    setGroupSelection([]);
  }

  function rotateSelected() {
    if (!selectedId) return;
    recordHistory();
    setPlacements((current) => {
      const next = current.map((placement) => placement.id === selectedId ? {
        ...placement,
        rotation: ((placement.rotation + 90) % 360) as QuarterTurn,
      } : placement);
      setTransports((routes) => rerouteTransports(routes, next));
      return next;
    });
  }

  function resetPlan() {
    if (!placements.length && !foundations.length && !transports.length && !rails.length) return;
    recordHistory();
    setPlacements([]);
    setFoundations([]);
    setTransports([]);
    setRails([]);
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setPendingPort(null);
    setPlacementTool(null);
    setCursorWorld(null);
    setRailStart(null);
    setGroupSelection([]);
    setMarquee(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    seq.current = 1;
    setNotice('');
  }

  function fitToPlan(
    nextPlacements = placements,
    nextFoundations = foundations,
    nextTransports = transports,
    nextRails = rails,
  ) {
    const bounds = factoryDrawingBounds(nextPlacements, nextFoundations, [...nextTransports, ...nextRails], 6);
    if (!bounds) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const aspect = Math.max(.48, box.height / Math.max(box.width, 1));
    const nextZoom = Math.max(.55, Math.min(2.4, 128 / bounds.width, (128 * aspect) / bounds.height));
    setZoom(nextZoom);
    setPan({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    setNotice('도면 전체를 화면에 맞췄습니다.');
  }

  function queueHandoff(entry: PlannerHandoffEntry) {
    const machine = byClass.get(entry.buildingClass);
    if (!machine) return;
    setPlacementTool({ kind: 'machine', buildingClass: machine.buildingClass, handoff: entry });
    setSelectedId(null);
    setSelectedFoundationId(null);
    setSelectedRailId(null);
    setGroupSelection([]);
    setNotice(`${machine.name} · 계산 대기열 ${entry.remaining}대 중 놓을 위치를 고르세요.`);
  }

  function toggleLayer(layer: DrawingLayer) {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  async function exportDrawing(format: 'svg' | 'png') {
    const svg = svgRef.current;
    const bounds = factoryDrawingBounds(placements, foundations, [...transports, ...rails], 4);
    if (!svg || !bounds) return;
    try {
      const svgBlob = await standaloneSvgBlob(svg, bounds);
      if (format === 'svg') {
        downloadBlob(svgBlob, 'satisfactory-construction-plan.svg');
        setNotice('독립 SVG 도면을 내보냈습니다. 모든 탑뷰 자산이 파일 안에 포함됩니다.');
        return;
      }
      const size = drawingPixelSize(bounds);
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PNG 캔버스를 만들지 못했습니다.');
      context.drawImage(image, 0, 0, size.width, size.height);
      URL.revokeObjectURL(url);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (
        blob ? resolve(blob) : reject(new Error('PNG 인코딩 실패'))
      ), 'image/png'));
      downloadBlob(png, 'satisfactory-construction-plan.png');
      setNotice(`고해상도 PNG 도면 ${size.width.toLocaleString('ko-KR')} × ${size.height.toLocaleString('ko-KR')} px를 내보냈습니다.`);
    } catch (error) {
      setNotice(`도면 내보내기 실패 · ${error instanceof Error ? error.message : '자산을 확인하세요.'}`);
    }
  }

  function changeElevation(deltaM: number) {
    if (selectedFoundationId) {
      recordHistory();
      setFoundations((current) => current.map((tile) => tile.id === selectedFoundationId
        ? { ...tile, zM: Math.max(0, tile.zM + deltaM) }
        : tile));
      return;
    }
    if (!selectedId) return;
    recordHistory();
    setPlacements((current) => {
      const next = current.map((placement) => placement.id === selectedId
        ? { ...placement, positionM: { ...placement.positionM, z: Math.max(0, placement.positionM.z + deltaM) } }
        : placement);
      setTransports((routes) => rerouteTransports(routes, next));
      return next;
    });
  }

  function pointerDown(event: PointerEvent, placement: Placement) {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event);
    drag.current = { kind: 'machine', id: placement.id, dx: placement.positionM.x - point.x, dy: placement.positionM.y - point.y, historyRecorded: false };
    svg.setPointerCapture(event.pointerId);
    setSelectedId(placement.id);
    setSelectedFoundationId(null);
  }

  function foundationPointerDown(event: PointerEvent, tile: FoundationTile) {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      beginCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event);
    drag.current = { kind: 'foundation', id: tile.id, dx: tile.xM - point.x, dy: tile.yM - point.y, historyRecorded: false };
    svg.setPointerCapture(event.pointerId);
    setSelectedFoundationId(tile.id);
    setSelectedId(null);
    setPendingPort(null);
  }

  function pointerMove(event: PointerEvent) {
    const state = drag.current;
    const svg = svgRef.current;
    if (!svg) return;
    const hoverPoint = svgPoint(svg, event);
    if (placementTool) setCursorWorld(hoverPoint);
    if (!state) return;
    if (state.kind === 'canvas') {
      setPan({
        x: state.startPanX - (event.clientX - state.startClientX) * viewWidth / Math.max(box.width, 1),
        y: state.startPanY - (event.clientY - state.startClientY) * viewHeight / Math.max(box.height, 1),
      });
      return;
    }
    if (state.kind === 'marquee') {
      const next = { start: state.start, end: hoverPoint };
      setMarquee(next);
      const minX = Math.min(next.start.x, next.end.x);
      const maxX = Math.max(next.start.x, next.end.x);
      const minY = Math.min(next.start.y, next.end.y);
      const maxY = Math.max(next.start.y, next.end.y);
      setGroupSelection(placements.filter((placement) => {
        const bounds = boundsOf(placement.spec);
        const centerX = placement.positionM.x + (bounds.min.x + bounds.max.x) / 2;
        const centerY = placement.positionM.y + (bounds.min.y + bounds.max.y) / 2;
        return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
      }).map((placement) => placement.id));
      return;
    }
    const point = hoverPoint;
    const snap = state.kind === 'foundation' ? FOUNDATION : SNAP;
    const x = Math.round((point.x + state.dx) / snap) * snap;
    const y = Math.round((point.y + state.dy) / snap) * snap;
    const moved = state.kind === 'foundation'
      ? foundations.some((tile) => tile.id === state.id && (tile.xM !== x || tile.yM !== y))
      : placements.some((placement) => placement.id === state.id && (placement.positionM.x !== x || placement.positionM.y !== y));
    if (moved && !state.historyRecorded) {
      recordHistory();
      drag.current = { ...state, historyRecorded: true };
    }
    if (state.kind === 'foundation') {
      setFoundations((current) => current.map((tile) => tile.id === state.id
        ? { ...tile, xM: x, yM: y }
        : tile));
      return;
    }
    setPlacements((current) => {
      const next = current.map((placement) => placement.id === state.id
        ? { ...placement, positionM: { ...placement.positionM, x, y } }
        : placement);
      setTransports((routes) => rerouteTransports(routes, next));
      return next;
    });
  }

  function beginCanvasPan(event: PointerEvent) {
    event.preventDefault();
    drag.current = {
      kind: 'canvas',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function canvasPointerDown(event: PointerEvent) {
    const target = event.target as Element;
    if (event.button === 1) {
      beginCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (target.closest('.vp-placement, .vp-foundation, .vp-port')) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event);
    if (placementTool) return;
    if (event.shiftKey) {
      drag.current = { kind: 'marquee', start: point };
      setMarquee({ start: point, end: point });
      setSelectedId(null);
      setSelectedFoundationId(null);
      setGroupSelection([]);
      svg.setPointerCapture(event.pointerId);
      return;
    }
    beginCanvasPan(event);
    setSelectedId(null);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setPendingPort(null);
  }

  function canvasWheel(event: WheelEvent) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg || event.deltaY === 0) return;
    const point = svgPoint(svg, event as unknown as PointerEvent);
    const rect = svg.getBoundingClientRect();
    const ratioX = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    const ratioY = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1)));
    const nextZoom = Math.min(2.4, Math.max(.55, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (nextZoom === zoom) return;
    const nextWidth = 128 / nextZoom;
    const nextHeight = nextWidth * Math.max(.48, box.height / Math.max(box.width, 1));
    setZoom(nextZoom);
    setPan({
      x: point.x + (0.5 - ratioX) * nextWidth,
      y: point.y + (0.5 - ratioY) * nextHeight,
    });
  }

  function canvasClick(event: MouseEvent) {
    if (!placementTool) return;
    const target = event.target as Element;
    if (target.closest('.vp-placement, .vp-foundation, .vp-port')) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event as unknown as PointerEvent);
    if (placementTool.kind === 'foundation') {
      const origin = foundationCellOrigin(point);
      addFoundation(origin.x, origin.y);
      return;
    }
    if (placementTool.kind === 'rail') {
      const snapped = { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 };
      if (!railStart) {
        setRailStart(snapped);
        setNotice('철도 시작점 선택 · 끝점을 클릭하세요.');
        return;
      }
      if (Math.hypot(snapped.x - railStart.x, snapped.y - railStart.y) <= 1e-6) {
        setNotice('철도 끝점은 시작점과 달라야 합니다.');
        return;
      }
      recordHistory();
      setRails((current) => [...current, { id: `rail-${seq.current++}`, pathM: [railStart, snapped] }]);
      setRailStart(null);
      setNotice('철도 구간 배치 완료 · 다음 시작점을 클릭하거나 Esc로 종료');
      return;
    }
    if (placementTool.kind === 'transport') {
      const snapped = { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 };
      if (!transportStart) {
        setTransportStart(snapped);
        setNotice(`${placementTool.medium === 'solid' ? '컨베이어 벨트' : '파이프'} 끝점을 클릭하세요.`);
        return;
      }
      if (Math.hypot(snapped.x - transportStart.x, snapped.y - transportStart.y) <= 1e-6) {
        setNotice('운송 경로 끝점은 시작점과 달라야 합니다.');
        return;
      }
      const id = `route-${seq.current++}`;
      const spec = transportSpecForFlow(placementTool.medium, 0);
      const corner = transportStart.x !== snapped.x && transportStart.y !== snapped.y
        ? [{ x: snapped.x, y: transportStart.y, z: 0 }]
        : [];
      recordHistory();
      setTransports((current) => [...current, {
        id,
        from: { placementId: `manual:${id}`, portId: 'start' },
        to: { placementId: `manual:${id}`, portId: 'end' },
        medium: placementTool.medium,
        itemId: 'unassigned',
        flowPerMinute: 0,
        transportClass: spec.buildingClass,
        capacityPerMinute: spec.capacityPerMinute,
        pathM: [transportStart, ...corner, snapped],
      }]);
      setTransportStart(null);
      setNotice('직선·90° 회전 탑뷰 경로 배치 완료 · 다음 시작점을 클릭하거나 Esc로 종료');
      return;
    }
    if (placementTool.kind === 'lift') {
      const origin = { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 };
      const id = `route-${seq.current++}`;
      const spec = transportSpecForFlow(placementTool.medium, 0);
      recordHistory();
      setTransports((current) => [...current, {
        id,
        from: { placementId: `manual:${id}`, portId: 'bottom' },
        to: { placementId: `manual:${id}`, portId: 'top' },
        medium: placementTool.medium,
        itemId: 'unassigned',
        flowPerMinute: 0,
        transportClass: spec.buildingClass,
        capacityPerMinute: spec.capacityPerMinute,
        pathM: [origin, { ...origin, z: 4 }],
      }]);
      setNotice(`${placementTool.medium === 'solid' ? '컨베이어 리프트' : '파이프 라이저'} 4 m 탑뷰 배치 완료`);
      return;
    }
    const machine = byClass.get(placementTool.buildingClass);
    if (machine) addMachine(
      machine,
      { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 },
      placementTool.handoff,
    );
  }

  function beginCatalogDrag(event: DragEvent, tool: PlacementTool) {
    if (tool.kind === 'rail') {
      queueRail();
      return;
    }
    if (tool.kind === 'transport') {
      queueTransport(tool.medium);
      return;
    }
    if (tool.kind === 'lift') {
      queueLift(tool.medium);
      return;
    }
    const payload = tool.kind === 'foundation' ? 'foundation' : `machine:${tool.buildingClass}`;
    event.dataTransfer?.setData('application/x-sfops-placement', payload);
    event.dataTransfer?.setData('text/plain', payload);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    if (tool.kind === 'foundation') queueFoundation();
    else {
      const machine = byClass.get(tool.buildingClass);
      if (machine) queueMachine(machine);
    }
  }

  function stageDragOver(event: DragEvent) {
    const payload = event.dataTransfer?.types.includes('application/x-sfops-placement');
    if (!payload) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    const svg = svgRef.current;
    if (svg) setCursorWorld(svgPoint(svg, event as unknown as PointerEvent));
  }

  function stageDrop(event: DragEvent) {
    const payload = event.dataTransfer?.getData('application/x-sfops-placement')
      || event.dataTransfer?.getData('text/plain');
    if (!payload) return;
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event as unknown as PointerEvent);
    if (payload === 'foundation') {
      const origin = foundationCellOrigin(point);
      addFoundation(origin.x, origin.y);
      return;
    }
    if (!payload.startsWith('machine:')) return;
    const machine = byClass.get(payload.slice('machine:'.length));
    if (machine) addMachine(machine, { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 });
  }

  function finishPointer() {
    if (drag.current?.kind === 'marquee') setNotice(`${groupSelection.length}개 설비 선택 · Delete로 한 번에 삭제`);
    drag.current = null;
    setMarquee(null);
  }

  function connectPort(reference: PortReference) {
    const targetPlacement = placements.find((placement) => placement.id === reference.placementId);
    const targetPort = targetPlacement?.spec.ports.find((port) => port.id === reference.portId);
    if (!targetPlacement || !targetPort) return;
    if (!pendingPort) {
      setPendingPort(reference);
      return;
    }
    const sourcePlacement = placements.find((placement) => placement.id === pendingPort.placementId);
    const sourcePort = sourcePlacement?.spec.ports.find((port) => port.id === pendingPort.portId);
    if (!sourcePlacement || !sourcePort || sourcePlacement.id === targetPlacement.id) {
      setPendingPort(reference);
      return;
    }
    const from = sourcePort.direction === 'output'
      ? { placement: sourcePlacement, port: sourcePort, ref: pendingPort }
      : targetPort.direction === 'output'
        ? { placement: targetPlacement, port: targetPort, ref: reference }
        : null;
    const to = sourcePort.direction === 'input'
      ? { placement: sourcePlacement, port: sourcePort, ref: pendingPort }
      : targetPort.direction === 'input'
        ? { placement: targetPlacement, port: targetPort, ref: reference }
        : null;
    if (from && to && from.port.medium === to.port.medium && from.port.medium !== 'power') {
      const medium: 'solid' | 'fluid' = from.port.medium === 'solid' ? 'solid' : 'fluid';
      const rate = portRate(from.placement, from.port.id) ?? portRate(to.placement, to.port.id);
      const transport = transportSpecForFlow(medium, rate?.flowPerMinute ?? 0);
      recordHistory();
      setTransports((current) => [...current, {
        id: `route-${seq.current++}`,
        from: from.ref,
        to: to.ref,
        medium,
        itemId: rate?.itemId ?? 'unassigned',
        flowPerMinute: rate?.flowPerMinute ?? 0,
        transportClass: transport.buildingClass,
        capacityPerMinute: transport.capacityPerMinute,
        pathM: routeAroundMachines(from.placement, from.port, to.placement, to.port, placements),
      }]);
      setPendingPort(null);
      return;
    }
    setPendingPort(reference);
  }

  function configureSelected(next: { recipeId?: string; clockPercent?: number; powerShards?: number; somersloops?: number }) {
    if (!selectedId) return;
    recordHistory();
    setPlacements((current) => {
      const updated = current.map((placement) => {
        if (placement.id !== selectedId) return placement;
        const machine = byClass.get(placement.spec.buildingClass);
        if (!machine?.recipes.length) return placement;
        const existing = placement.operation;
        const recipe = machine.recipes.find((entry) => entry.id === next.recipeId)
          ?? machine.recipes.find((entry) => entry.id === existing?.recipeId)
          ?? machine.recipes[0];
        let powerShards = next.powerShards ?? existing?.powerShards ?? 0;
        let clockPercent = next.clockPercent ?? existing?.clockPercent ?? 100;
        if (next.clockPercent != null) powerShards = Math.max(powerShards, Math.ceil(Math.max(0, clockPercent - 100) / 50));
        if (next.powerShards != null) clockPercent = Math.min(clockPercent, 100 + powerShards * 50);
        return {
          ...placement,
          operation: operationFor(machine, recipe, clockPercent, powerShards, next.somersloops ?? existing?.somersloops ?? 0),
        };
      });
      setTransports((routes) => syncTransportRates(routes, updated));
      return updated;
    });
  }

  function exportPlan() {
    const payload = JSON.stringify(toStoredPlan(placements, foundations, transports, rails), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'satisfactory-validated-plan.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importPlan(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const stored = migrateStoredPlan(JSON.parse(await file.text()) as unknown);
      if (!stored) throw new Error('지원하지 않는 도면 스키마');
      const restored = restoreStoredPlan(stored, byClass);
      recordHistory();
      applyStoredState(stored);
      fitToPlan(restored.placements, restored.foundations, restored.transports, restored.rails);
      setNotice(`${file.name} 도면을 복원했습니다.`);
    } catch (error) {
      setNotice(`가져오기 실패 · ${error instanceof Error ? error.message : '파일을 확인하세요.'}`);
    } finally {
      input.value = '';
    }
  }

  function renderSolidRoute(route: TransportRoute, elevated: boolean) {
    const transport = resolveTransportSpec(route);
    const parts = transportPathParts(route.pathM);
    const segments = parts.belts.filter((segment) => elevated ? segment.center.z > 2.1 : segment.center.z <= 2.1);
    const turns = parts.turns.filter((turn) => elevated ? turn.at.z > 2.1 : turn.at.z <= 2.1);
    if (!segments.length) return null;
    const labelSegment = segments.reduce((longest, segment) => !longest || segment.planarLengthM > longest.planarLengthM ? segment : longest, undefined as (typeof segments)[number] | undefined);
    return (
      <g class={`vp-route is-solid is-mk-${transport.mark}${elevated ? ' is-elevated' : ''}`} key={`${route.id}-${elevated ? 'high' : 'low'}`} aria-label={transport.name}>
        {segments.map((segment, segmentIndex) => (
          <g class="vp-belt-segment" transform={`translate(${segment.center.x} ${segment.center.y}) rotate(${segment.angleDeg})`} key={`${route.id}-belt-${segmentIndex}`}>
            <rect x={-segment.planarLengthM / 2} y="-1.05" width={segment.planarLengthM} height="2.1" rx=".7" class="vp-belt-frame" />
            <rect x={-segment.planarLengthM / 2} y="-.88" width={segment.planarLengthM} height="1.76" rx=".54" class="vp-belt-surface" />
            {Array.from({ length: Math.max(1, Math.floor(segment.planarLengthM / Math.max(.38, .76 - transport.mark * .06))) }, (_, slatIndex) => {
              const slatCount = Math.max(1, Math.floor(segment.planarLengthM / Math.max(.38, .76 - transport.mark * .06)));
              const x = -segment.planarLengthM / 2 + (slatIndex + .5) * segment.planarLengthM / slatCount;
              return <path key={`${segmentIndex}-slat-${slatIndex}`} d={`M ${x} -.72 V .72`} class="vp-belt-slat" />;
            })}
            <path d={`M ${-segment.planarLengthM / 2} -.88 H ${segment.planarLengthM / 2} M ${-segment.planarLengthM / 2} .88 H ${segment.planarLengthM / 2}`} class="vp-belt-rail" />
            {segment.planarLengthM >= 2.5 && (
              <path d="M -.42 -.42 L 0 0 L -.42 .42 M .12 -.42 L .54 0 L .12 .42" class="vp-belt-direction" />
            )}
          </g>
        ))}
        {turns.map((turn, index) => (
          <g class="vp-belt-turn" key={`${route.id}-turn-${index}`}>
            <path d={transportTurnPath(turn)} class="vp-belt-turn-frame" />
            <path d={transportTurnPath(turn)} class="vp-belt-turn-surface" />
          </g>
        ))}
        {layers.flow && !elevated && labelSegment && (
          <g class="vp-route-label" transform={`translate(${labelSegment.center.x} ${labelSegment.center.y - 1.7})`}>
            <rect x="-8" y="-.7" width="16" height="1.4" rx=".24" />
            <text>{transport.name} · {itemNames.get(route.itemId) ?? (route.itemId === 'unassigned' ? '품목 미지정' : route.itemId)} · {fmt(route.flowPerMinute)}/{fmt(route.capacityPerMinute)}/분</text>
          </g>
        )}
      </g>
    );
  }

  function renderFluidRoute(route: TransportRoute, elevated: boolean) {
    const transport = resolveTransportSpec(route);
    const parts = transportPathParts(route.pathM);
    const segments = parts.belts.filter((segment) => elevated ? segment.center.z > 2.1 : segment.center.z <= 2.1);
    const turns = parts.turns.filter((turn) => elevated ? turn.at.z > 2.1 : turn.at.z <= 2.1);
    const labelSegment = segments.reduce((longest, segment) => !longest || segment.planarLengthM > longest.planarLengthM ? segment : longest, undefined as (typeof segments)[number] | undefined);
    if (!segments.length) return null;
    return (
      <g class={`vp-route is-fluid is-mk-${transport.mark}${elevated ? ' is-elevated' : ''}`} key={`${route.id}-${elevated ? 'high' : 'low'}`} aria-label={transport.name}>
        {segments.map((segment, segmentIndex) => (
          <g class="vp-pipe-segment" transform={`translate(${segment.center.x} ${segment.center.y}) rotate(${segment.angleDeg})`} key={`${route.id}-pipe-${segmentIndex}`}>
            <rect x={-segment.planarLengthM / 2} y="-1.18" width={segment.planarLengthM} height="2.36" rx="1.05" class="vp-pipe-shell" />
            <rect x={-segment.planarLengthM / 2} y="-.79" width={segment.planarLengthM} height="1.58" rx=".72" class="vp-pipe-core" />
            {Array.from({ length: transport.mark }, (_, bandIndex) => (
              <path key={`${segmentIndex}-band-${bandIndex}`} d={`M ${(bandIndex - (transport.mark - 1) / 2) * .42} -1.05 V 1.05`} class="vp-pipe-grade" />
            ))}
            {segment.planarLengthM >= 2.5 && (
              <path d="M -.42 -.42 L 0 0 L -.42 .42 M .12 -.42 L .54 0 L .12 .42" class="vp-pipe-direction" />
            )}
          </g>
        ))}
        {turns.map((turn, index) => (
          <g class="vp-pipe-turn" key={`${route.id}-pipe-turn-${index}`}>
            <path d={transportTurnPath(turn)} class="vp-pipe-turn-shell" />
            <path d={transportTurnPath(turn)} class="vp-pipe-turn-core" />
          </g>
        ))}
        {layers.flow && !elevated && labelSegment && (
          <g class="vp-route-label" transform={`translate(${labelSegment.center.x} ${labelSegment.center.y - 1.9})`}>
            <rect x="-9" y="-.7" width="18" height="1.4" rx=".24" />
            <text>{transport.name} · {itemNames.get(route.itemId) ?? (route.itemId === 'unassigned' ? '유체 미지정' : route.itemId)} · {fmt(route.flowPerMinute)}/{fmt(route.capacityPerMinute)} m³/분</text>
          </g>
        )}
      </g>
    );
  }

  function renderLift(route: TransportRoute) {
    const transport = resolveTransportSpec(route);
    if (route.medium === 'fluid') {
      return transportPathParts(route.pathM).lifts.map((lift, index) => (
        <g class={`vp-pipe-riser is-mk-${transport.mark}`} transform={`translate(${lift.x} ${lift.y})`} key={`${route.id}-riser-${index}`}>
          <circle r="1.18" class="vp-pipe-riser-shell" />
          <circle r=".78" class="vp-pipe-riser-core" />
          {Array.from({ length: transport.mark }, (_, bandIndex) => (
            <circle key={bandIndex} r={.92 + bandIndex * .13} class="vp-pipe-riser-band" />
          ))}
          {layers.elevation && (
            <g class="vp-lift-label" transform="translate(0 -1.65)">
              <rect x="-3.5" y="-.65" width="7" height="1.3" rx=".22" />
              <text>파이프 Mk.{transport.mark} · {fmt(lift.heightM)} m · Z +{fmt(lift.highZ)} m</text>
            </g>
          )}
        </g>
      ));
    }
    return transportPathParts(route.pathM).lifts.map((lift, index) => (
      <g class={`vp-lift is-mk-${transport.mark}`} transform={`translate(${lift.x} ${lift.y})`} key={`${route.id}-lift-${index}`}>
        <rect x="-1.1" y="-1.1" width="2.2" height="2.2" rx=".28" class="vp-lift-bed" />
        <rect x="-.7" y="-1.22" width="1.4" height="2.44" rx=".34" class="vp-lift-column" />
        {Array.from({ length: transport.mark + 2 }, (_, ribIndex) => {
          const y = -.72 + ribIndex * 1.44 / (transport.mark + 1);
          return <path key={ribIndex} d={`M -.38 ${y} H .38`} class="vp-lift-ribs" />;
        })}
        {layers.elevation && (
          <g class="vp-lift-label" transform="translate(0 -1.65)">
            <rect x="-2.25" y="-.65" width="4.5" height="1.3" rx=".22" />
            <text>리프트 Mk.{transport.mark} · {fmt(lift.heightM)} m · Z +{fmt(lift.highZ)} m</text>
          </g>
        )}
      </g>
    ));
  }

  function renderRail(rail: RailRoute) {
    const segments = rail.pathM.slice(1).map((end, index) => {
      const start = rail.pathM[index];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      return {
        center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        length,
        angleDeg: Math.atan2(dy, dx) * 180 / Math.PI,
      };
    });
    const label = segments.reduce((longest, segment) => segment.length > (longest?.length ?? 0) ? segment : longest, undefined as (typeof segments)[number] | undefined);
    return (
      <g
        class={`vp-rail${selectedRailId === rail.id ? ' is-selected' : ''}`}
        key={rail.id}
        aria-label={railName}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedRailId(rail.id);
          setSelectedId(null);
          setSelectedFoundationId(null);
          setGroupSelection([]);
        }}
      >
        {segments.map((segment, segmentIndex) => (
          <g transform={`translate(${segment.center.x} ${segment.center.y}) rotate(${segment.angleDeg})`} key={`${rail.id}-${segmentIndex}`}>
            <rect x={-segment.length / 2} y="-3" width={segment.length} height="6" rx=".35" class="vp-rail-bed" />
            <path d={`M ${-segment.length / 2} -1.55 H ${segment.length / 2} M ${-segment.length / 2} 1.55 H ${segment.length / 2}`} class="vp-rail-track" />
            {Array.from({ length: Math.max(1, Math.floor(segment.length / 1.6)) }, (_, tieIndex) => {
              const ties = Math.max(1, Math.floor(segment.length / 1.6));
              const x = -segment.length / 2 + (tieIndex + .5) * segment.length / ties;
              return <path key={tieIndex} d={`M ${x} -2.45 V 2.45`} class="vp-rail-tie" />;
            })}
          </g>
        ))}
        {layers.flow && label && (
          <g class="vp-route-label" transform={`translate(${label.center.x} ${label.center.y - 3.8})`}>
            <rect x="-4" y="-.7" width="8" height="1.4" rx=".24" />
            <text>{railName} · {fmt(segments.reduce((sum, segment) => sum + segment.length, 0))} m</text>
          </g>
        )}
      </g>
    );
  }

  return (
    <section class="vp" aria-label="검증형 공장 설계판">
      <aside class="vp-catalog">
        <header>
          <p class="vp-eyebrow">PLACEMENT CATALOG</p>
          <h2>설비와 토대</h2>
          <p>항목을 클릭한 뒤 캔버스에 놓거나, 원하는 위치로 직접 드래그하세요.</p>
        </header>
        <label class="vp-search">
          <input aria-label="설비 검색" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="설비 검색" />
        </label>
        <div class="vp-machine-list">
          {handoff?.entries.length ? (
            <section class="vp-handoff" aria-label="계산에서 받은 설계 대기열">
              <header>
                <div><p class="vp-eyebrow">DESIGN QUEUE</p><h3>계산 대기열</h3></div>
                <button type="button" onClick={() => { setHandoff(null); savePlannerHandoff(null); }}>비우기</button>
              </header>
              <div>
                {handoff.entries.map((entry) => {
                  const machine = byClass.get(entry.buildingClass);
                  const recipe = machine?.recipes.find((candidate) => candidate.id === entry.recipeId);
                  if (!machine) return null;
                  return (
                    <button type="button" class="vp-handoff-item" onClick={() => queueHandoff(entry)}>
                    <img src={machine.imageUrl} alt="" loading="lazy" />
                      <span><strong>{machine.name} × {entry.remaining}</strong><small>{recipe?.name ?? entry.recipeId} · {fmt(entry.clockPercent)}% · {fmt(entry.targetFlowPerMinute)}/분</small></span>
                      <span aria-hidden="true">배치</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <button
            type="button"
            draggable
            class={`vp-machine is-foundation${placementTool?.kind === 'foundation' ? ' is-armed' : ''}`}
            onClick={queueFoundation}
            onDragStart={(event) => beginCatalogDrag(event as unknown as DragEvent, { kind: 'foundation' })}
            onDragEnd={() => setCursorWorld(null)}
            title="클릭한 뒤 위치를 고르거나 캔버스로 드래그"
          >
            <span class="vp-foundation-swatch" aria-hidden="true"><i /></span>
            <span><strong>파운데이션</strong><small>클릭 후 배치 · 드래그 가능</small></span>
            <span class="vp-place-hint" aria-hidden="true">배치</span>
          </button>
          <button
            type="button"
            class={`vp-machine is-rail${placementTool?.kind === 'rail' ? ' is-armed' : ''}`}
            onClick={queueRail}
            title="시작점과 끝점을 직접 선택"
          >
            <span class="vp-rail-swatch" aria-hidden="true"><i /><i /><i /></span>
            <span><strong>{railName}</strong><small>두 점을 클릭해 실축 경로 배치</small></span>
            <span class="vp-place-hint" aria-hidden="true">작도</span>
          </button>
          <button type="button" class={`vp-machine is-transport${placementTool?.kind === 'transport' && placementTool.medium === 'solid' ? ' is-armed' : ''}`} onClick={() => queueTransport('solid')}>
            <span class="vp-belt-swatch" aria-hidden="true"><i /><i /><i /></span>
            <span><strong>컨베이어 벨트</strong><small>두 점 · 직선/직각 경로 · 방향 포함</small></span>
            <span class="vp-place-hint" aria-hidden="true">작도</span>
          </button>
          <button type="button" class={`vp-machine is-transport${placementTool?.kind === 'transport' && placementTool.medium === 'fluid' ? ' is-armed' : ''}`} onClick={() => queueTransport('fluid')}>
            <span class="vp-pipe-swatch" aria-hidden="true"><i /><i /></span>
            <span><strong>파이프</strong><small>두 점 · 직선/직각 경로 · Mk 자동</small></span>
            <span class="vp-place-hint" aria-hidden="true">작도</span>
          </button>
          <button type="button" class={`vp-machine is-transport${placementTool?.kind === 'lift' && placementTool.medium === 'solid' ? ' is-armed' : ''}`} onClick={() => queueLift('solid')}>
            <span class="vp-lift-swatch" aria-hidden="true"><i /><i /></span>
            <span><strong>컨베이어 리프트</strong><small>끝단 2개 · 기본 높이 4 m</small></span>
            <span class="vp-place-hint" aria-hidden="true">배치</span>
          </button>
          <button type="button" class={`vp-machine is-transport${placementTool?.kind === 'lift' && placementTool.medium === 'fluid' ? ' is-armed' : ''}`} onClick={() => queueLift('fluid')}>
            <span class="vp-riser-swatch" aria-hidden="true"><i /></span>
            <span><strong>파이프 라이저</strong><small>수직 끝단 · 기본 높이 4 m</small></span>
            <span class="vp-place-hint" aria-hidden="true">배치</span>
          </button>
          {visibleMachines.map((machine) => {
            return (
              <button
                type="button"
                draggable
                class={`vp-machine${placementTool?.kind === 'machine' && placementTool.buildingClass === machine.buildingClass ? ' is-armed' : ''}`}
                onClick={() => queueMachine(machine)}
                onDragStart={(event) => beginCatalogDrag(event as unknown as DragEvent, { kind: 'machine', buildingClass: machine.buildingClass })}
                onDragEnd={() => setCursorWorld(null)}
                title="클릭한 뒤 위치를 고르거나 캔버스로 드래그"
              >
                <img src={machine.imageUrl} alt="" draggable={false} loading="lazy" />
                <span><strong>{machine.name}</strong><small>클릭 후 배치 · 드래그 가능</small></span>
                <span class="vp-place-hint" aria-hidden="true">배치</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div class="vp-workspace">
        <header class="vp-toolbar">
          <div class="vp-status">
            <span class={validation.publishable ? 'is-ready' : 'is-review'} />
            <strong>{validation.publishable ? '시공 검증 통과' : `검토 ${validation.issues.length}건`}</strong>
            <small>설비 {placements.length} · 토대 {foundations.length} · 물류 {transports.length + rails.length}</small>
          </div>
          <div class="vp-actions">
            <button type="button" onClick={undo} disabled={!historyCounts.undo} title="Ctrl+Z">실행 취소</button>
            <button type="button" onClick={redo} disabled={!historyCounts.redo} title="Ctrl+Shift+Z 또는 Ctrl+Y">다시 실행</button>
            <button type="button" onClick={rotateSelected} disabled={!selectedId}>90° 회전</button>
            <button type="button" onClick={() => changeElevation(-4)} disabled={!selectedId && !selectedFoundationId}>높이 −4 m</button>
            <button type="button" onClick={() => changeElevation(4)} disabled={!selectedId && !selectedFoundationId}>높이 +4 m</button>
            <button type="button" data-action="delete-selection" onClick={removeSelected} disabled={!selectedId && !selectedFoundationId && !selectedRailId && !groupSelection.length}>선택 삭제{groupSelection.length ? ` (${groupSelection.length})` : ''}</button>
            <button type="button" class="is-danger" onClick={resetPlan} disabled={!placements.length && !foundations.length && !transports.length && !rails.length}>전체 초기화</button>
            <button type="button" onClick={() => fitToPlan()} disabled={!placements.length && !foundations.length && !transports.length && !rails.length}>도면 맞춤</button>
            <button type="button" onClick={exportPlan}>JSON 내보내기</button>
            <button type="button" onClick={() => void exportDrawing('svg')} disabled={!placements.length && !foundations.length && !transports.length && !rails.length}>SVG 도면</button>
            <button type="button" onClick={() => void exportDrawing('png')} disabled={!placements.length && !foundations.length && !transports.length && !rails.length}>PNG 도면</button>
            <label class="vp-import-button">
              JSON 가져오기
              <input type="file" accept="application/json,.json" onChange={importPlan} />
            </label>
          </div>
          <fieldset class="vp-layers">
            <legend>도면 레이어</legend>
            {([
              ['foundations', '토대'],
              ['machines', '설비'],
              ['logistics', '물류'],
              ['elevation', '층고'],
              ['flow', '품목·유량'],
            ] as const).map(([layer, label]) => (
              <label><input type="checkbox" checked={layers[layer]} onChange={() => toggleLayer(layer)} /> <span>{label}</span></label>
            ))}
          </fieldset>
          {notice && <p class="vp-notice" role="status">{notice}</p>}
        </header>

        <div class="vp-stage" ref={stageRef} onClick={canvasClick} onDragOver={stageDragOver} onDrop={stageDrop}>
          <div class="vp-ruler"><strong>8 m · 파운데이션 1칸</strong><span>카탈로그 드롭 · 휠 클릭 드래그 이동 · 휠 확대/축소 · Shift+드래그 영역 선택 · Ctrl+Z 실행 취소</span></div>
          <div class="vp-zoom">
            <button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + .2))} aria-label="확대">+</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.max(.55, value - .2))} aria-label="축소">−</button>
          </div>
          <svg
            ref={svgRef}
            viewBox={viewBox}
            class="vp-canvas"
            onPointerDown={canvasPointerDown}
            onPointerMove={pointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onWheel={(event) => canvasWheel(event as unknown as WheelEvent)}
            onAuxClick={(event) => event.preventDefault()}
          >
            <defs>
              <pattern id="vp-meter-grid" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" class="vp-grid-meter" />
              </pattern>
              <pattern id="vp-foundation-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="url(#vp-meter-grid)" />
                <path d="M 8 0 L 0 0 0 8" class="vp-grid-foundation" />
              </pattern>
              <filter id="vp-machine-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity=".34" />
              </filter>
            </defs>
            <rect x={-viewWidth} y={-viewHeight} width={viewWidth * 2} height={viewHeight * 2} class="vp-grid-bg" />
            <rect x={-viewWidth} y={-viewHeight} width={viewWidth * 2} height={viewHeight * 2} fill="url(#vp-foundation-grid)" class="vp-grid-overlay" />
            {layers.foundations && [...foundations].sort((a, b) => a.zM - b.zM).map((tile) => (
              <g
                key={tile.id}
                class={`vp-foundation${selectedFoundationId === tile.id ? ' is-selected' : ''}`}
                onPointerDown={(event) => foundationPointerDown(event as unknown as PointerEvent, tile)}
              >
                <rect x={tile.xM} y={tile.yM} width={tile.sizeM} height={tile.sizeM} class="vp-foundation-bed" />
                <rect x={tile.xM + .32} y={tile.yM + .32} width={tile.sizeM - .64} height={tile.sizeM - .64} rx=".24" class="vp-foundation-panel" />
                <path d={`M ${tile.xM + .7} ${tile.yM + .7} H ${tile.xM + 7.3} M ${tile.xM + .7} ${tile.yM + 7.3} H ${tile.xM + 7.3}`} class="vp-foundation-rail" />
                <rect x={tile.xM} y={tile.yM} width={tile.sizeM} height={tile.sizeM} class="vp-foundation-hit" />
                {layers.elevation && tile.zM > 0 && <text x={tile.xM + .5} y={tile.yM + 1.1} class="vp-z-label">Z +{fmt(tile.zM)} m</text>}
              </g>
            ))}

            {layers.logistics && rails.map(renderRail)}
            {layers.logistics && transports.map((route) => route.medium === 'solid' ? renderSolidRoute(route, false) : renderFluidRoute(route, false))}

            {layers.machines && [...placements].sort((a, b) => a.positionM.z - b.positionM.z).map((placement) => {
              const spec = byClass.get(placement.spec.buildingClass)!;
              const bounds = boundsOf(spec);
              const width = bounds.max.x - bounds.min.x;
              const height = bounds.max.y - bounds.min.y;
              const art = imageRect(spec, bounds);
              const selected = selectedId === placement.id || groupSelection.includes(placement.id);
              const compactLogistics = /ConveyorAttachment(?:Splitter|Merger)/.test(spec.buildingClass);
              const visualState = machineVisualState(placement, spec, placements, transports, validation.issues);
              return (
                <g
                  key={placement.id}
                  class={`vp-placement${selected ? ' is-selected' : ''}`}
                  transform={`translate(${placement.positionM.x} ${placement.positionM.y}) rotate(${placement.rotation})`}
                  onPointerDown={(event) => pointerDown(event as unknown as PointerEvent, placement)}
                >
                  <rect x={bounds.min.x} y={bounds.min.y} width={width} height={height} class="vp-clearance" />
                  <image
                    href={spec.statusImageUrls?.[visualState] ?? spec.imageUrl}
                    x={art.x}
                    y={art.y}
                    width={art.width}
                    height={art.height}
                    preserveAspectRatio={spec.imageKind === 'topview' ? 'none' : 'xMidYMid meet'}
                    class={`vp-machine-image is-${spec.imageKind}`}
                    filter="url(#vp-machine-shadow)"
                  />
                  <g
                    class="vp-machine-hover"
                    transform={`rotate(${-placement.rotation} 0 ${bounds.min.y - 1.5})`}
                  >
                    <rect x={-Math.max(3.2, spec.name.length * .62)} y={bounds.min.y - 2.55} width={Math.max(6.4, spec.name.length * 1.24)} height="1.85" rx=".3" />
                    <text x="0" y={bounds.min.y - 1.55}>{spec.name}{placement.operation?.recipeName ? ` · ${placement.operation.recipeName}` : ''}</text>
                  </g>
                  <title>{spec.name}{placement.operation?.recipeName ? ` · ${placement.operation.recipeName} · ${fmt(placement.operation.clockPercent ?? 100)}%` : ''}</title>
                  {layers.elevation && placement.positionM.z > 0 && (
                    <text x={bounds.min.x + .5} y={bounds.min.y + 1.1} class="vp-z-label" transform={`rotate(${-placement.rotation} ${bounds.min.x + .5} ${bounds.min.y + 1.1})`}>Z +{fmt(placement.positionM.z)} m</text>
                  )}
                  {spec.ports.map((port) => {
                    if (port.medium === 'power') return null;
                    const active = pendingPort?.placementId === placement.id && pendingPort.portId === port.id;
                    const laneLengthM = compactLogistics ? 1.1 : 1.8;
                    const lanePath = `M 0 0 L ${port.normal.x * laneLengthM} ${port.normal.y * laneLengthM}`;
                    return (
                      <g
                        key={port.id}
                        class={`vp-port is-${port.medium} is-${port.direction}${compactLogistics ? ' is-compact' : ''}${active ? ' is-active' : ''}`}
                        transform={`translate(${port.positionM.x} ${port.positionM.y})`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); connectPort({ placementId: placement.id, portId: port.id }); }}
                      >
                        <path d={lanePath} class="vp-port-hitbox" />
                        <path d={lanePath} class="vp-port-lane" />
                        <title>{port.direction === 'input' ? '입력' : port.direction === 'output' ? '출력' : '양방향'} · {port.medium === 'solid' ? '컨베이어' : '파이프'} · 표본 {port.sampleCount}</title>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {layers.logistics && transports.map((route) => route.medium === 'solid' ? renderSolidRoute(route, true) : renderFluidRoute(route, true))}
            {layers.logistics && transports.flatMap((route) => renderLift(route))}
            {placementTool?.kind === 'foundation' && ghostPoint && (
              <g class="vp-placement-ghost">
                <rect x={ghostPoint.x} y={ghostPoint.y} width={FOUNDATION} height={FOUNDATION} />
              </g>
            )}
            {placementTool?.kind === 'rail' && railStart && cursorWorld && (
              <g class="vp-rail-ghost">
                <path d={`M ${railStart.x} ${railStart.y} L ${Math.round(cursorWorld.x / SNAP) * SNAP} ${Math.round(cursorWorld.y / SNAP) * SNAP}`} />
              </g>
            )}
            {ghostMachine && ghostPoint && (() => {
              const bounds = boundsOf(ghostMachine);
              const art = imageRect(ghostMachine, bounds);
              return (
                <g class="vp-placement-ghost" transform={`translate(${ghostPoint.x} ${ghostPoint.y})`}>
                  <rect x={bounds.min.x} y={bounds.min.y} width={bounds.max.x - bounds.min.x} height={bounds.max.y - bounds.min.y} />
                  <image href={ghostMachine.imageUrl} x={art.x} y={art.y} width={art.width} height={art.height} preserveAspectRatio={ghostMachine.imageKind === 'topview' ? 'none' : 'xMidYMid meet'} />
                </g>
              );
            })()}
            {marquee && (
              <rect
                x={Math.min(marquee.start.x, marquee.end.x)}
                y={Math.min(marquee.start.y, marquee.end.y)}
                width={Math.abs(marquee.end.x - marquee.start.x)}
                height={Math.abs(marquee.end.y - marquee.start.y)}
                class="vp-marquee"
              />
            )}
          </svg>
          {!placements.length && !foundations.length && !transports.length && !rails.length && (
            <div class="vp-empty">
              <span>01</span>
              <h3>왼쪽에서 설비나 토대를 놓으세요.</h3>
              <p>파운데이션과 설비를 직접 놓고, 실제 포트를 눌러 컨베이어·파이프를 연결합니다.</p>
            </div>
          )}
        </div>

        <section class="vp-inspector" aria-label="도면 검사 결과" aria-live="polite" tabIndex={0}>
          <div class="vp-inspector-title">
            <p class="vp-eyebrow">MACHINE CONTROL</p>
            <h3>{selectedMachine ? selectedMachine.name : selectedFoundationId ? '선택한 파운데이션' : selectedRailId ? `선택한 ${railName}` : '설비를 선택하세요.'}</h3>
            {selectedPlacement && <p>높이 Z +{fmt(selectedPlacement.positionM.z)} m · Ctrl+C / Ctrl+V 복제</p>}
            {selectedFoundationId && <p>높이 Z +{fmt(foundations.find((tile) => tile.id === selectedFoundationId)?.zM ?? 0)} m</p>}
          </div>

          {selectedMachine?.recipes.length && selectedPlacement ? (
            <div class="vp-machine-config">
              <label>
                <span>레시피</span>
                <select value={selectedPlacement.operation?.recipeId} onChange={(event) => configureSelected({ recipeId: event.currentTarget.value })}>
                  {selectedMachine.recipes.map((recipe) => (
                    <option value={recipe.id}>{recipe.isAlternate ? `대체 · ${recipe.name}` : recipe.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>클럭 속도</span>
                <input
                  type="number"
                  min="1"
                  max="250"
                  step="1"
                  value={fmt(selectedPlacement.operation?.clockPercent ?? 100)}
                  onInput={(event) => configureSelected({ clockPercent: Number(event.currentTarget.value) })}
                />
                <b>%</b>
              </label>
              <label>
                <span>파워 샤드</span>
                <select value={selectedPlacement.operation?.powerShards ?? 0} onChange={(event) => configureSelected({ powerShards: Number(event.currentTarget.value) })}>
                  {[0, 1, 2, 3].map((count) => <option value={count}>{count}개 · 최대 {100 + count * 50}%</option>)}
                </select>
              </label>
              {selectedMachine.somersloopSlots > 0 && (
                <label>
                  <span>소머슬룹</span>
                  <select value={selectedPlacement.operation?.somersloops ?? 0} onChange={(event) => configureSelected({ somersloops: Number(event.currentTarget.value) })}>
                    {Array.from({ length: selectedMachine.somersloopSlots + 1 }, (_, count) => (
                      <option value={count}>{count}/{selectedMachine.somersloopSlots} · 출력 ×{fmt(1 + count / selectedMachine.somersloopSlots)}</option>
                    ))}
                  </select>
                </label>
              )}
              <div class="vp-rate-summary">
                <b>{selectedRecipe?.isAlternate ? '대체 레시피' : '기본 레시피'}</b>
                <span>입력 {Object.entries(selectedPlacement.operation?.inputRates ?? {}).map(([id, rate]) => `${itemNames.get(id) ?? id} ${fmt(rate)}/분`).join(' · ') || '없음'}</span>
                <span>출력 {Object.entries(selectedPlacement.operation?.outputRates ?? {}).map(([id, rate]) => `${itemNames.get(id) ?? id} ${fmt(rate)}/분`).join(' · ') || '없음'}</span>
                <span>계산 전력 {fmt(selectedPlacement.operation?.powerDemandMW ?? selectedMachine.basePowerMW)} MW</span>
              </div>
            </div>
          ) : <div class="vp-machine-config is-empty"><p>생산 설비를 선택하면 기본·대체 레시피와 클럭·증폭 설정이 여기에 열립니다.</p></div>}

          <div class="vp-gate-title">
            <p class="vp-eyebrow">CONSTRUCTION GATE</p>
            <h3>{validation.publishable ? '이 도면은 발행할 수 있습니다.' : '아직 시공 도면으로 발행할 수 없습니다.'}</h3>
          </div>
          <ol class="vp-gate-list">
            {validation.issues.slice(0, 6).map((issue, index) => (
              <li key={`${issue.code}-${index}`}><b>{issue.code}</b><span>{issue.message}</span></li>
            ))}
            {!validation.issues.length && <li class="is-pass"><b>PASS</b><span>토대·충돌·포트·유량·운송 용량 검사를 모두 통과했습니다.</span></li>}
          </ol>
        </section>
      </div>
    </section>
  );
}
