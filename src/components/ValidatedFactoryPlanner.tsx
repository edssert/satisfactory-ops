/**
 * 검증형 공장 설계판.
 *
 * 화면에 그리는 사각형·포트·경로는 별도의 근삿값을 만들지 않는다. 페이지가 게임 데이터와
 * 공개 세이브/블루프린트 코퍼스에서 고른 검증 서브셋을 전달하고, 이 컴포넌트는 그 좌표를
 * 그대로 이동·회전시킨다. 발행 가능 여부는 domain/factory 검증기 하나가 판정한다.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  isStoredPlan,
  nextEditorSequence,
  restoreStoredPlan,
  toStoredPlan,
  type StoredPlacement,
  type StoredPlan,
} from '../domain/factory/editor-state';
import { transformBox } from '../domain/factory/geometry';
import { routeAroundMachines } from '../domain/factory/route';
import { validateFactoryPlan } from '../domain/factory/validate';
import type {
  Box3,
  FactoryPlan,
  FoundationTile,
  MachineSpec,
  Placement,
  PortReference,
  QuarterTurn,
  TransportRoute,
  Vec3,
} from '../domain/factory/types';

export interface DrawingMachine extends MachineSpec {
  imageUrl: string;
  imageKind: 'topview' | 'icon';
  occupancyFrame?: { x: number; y: number; width: number; height: number };
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
  beltImageUrl: string;
  liftImageUrl: string;
  foundationImageUrl: string;
  proof: {
    fileCount: number;
    publicFileCount: number;
    observationCount: number;
    toleranceM: number;
  };
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

type PlacementTool = { kind: 'foundation' } | { kind: 'machine'; buildingClass: string };

const SAVE_KEY = 'sfops.validated-planner.v4';
const FOUNDATION = 8;
const SNAP = 1;

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

function imageRect(spec: DrawingMachine, bounds: Box3) {
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

function routePath(points: Vec3[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

interface BeltSegment { x: number; y: number; z: number; length: number; angle: number }

function beltSegments(points: Vec3[]): BeltSegment[] {
  return points.slice(1).flatMap((point, index) => {
    const start = points[index];
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= .02) return [];
    return [{
      x: (start.x + point.x) / 2,
      y: (start.y + point.y) / 2,
      z: (start.z + point.z) / 2,
      length,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    }];
  });
}

function liftSegments(points: Vec3[]) {
  return points.slice(1).flatMap((point, index) => {
    const start = points[index];
    if (Math.abs(start.x - point.x) > .02 || Math.abs(start.y - point.y) > .02 || Math.abs(start.z - point.z) <= .02) return [];
    return [{ x: point.x, y: point.y, lowZ: Math.min(start.z, point.z), highZ: Math.max(start.z, point.z), height: Math.abs(point.z - start.z) }];
  });
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
    return rate ? { ...route, ...rate } : route;
  });
}

export default function ValidatedFactoryPlanner({ machines, beltImageUrl, liftImageUrl, foundationImageUrl, proof }: Props) {
  const byClass = useMemo(() => new Map(machines.map((machine) => [machine.buildingClass, machine])), [machines]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [foundations, setFoundations] = useState<FoundationTile[]>([]);
  const [transports, setTransports] = useState<TransportRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFoundationId, setSelectedFoundationId] = useState<string | null>(null);
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [pendingPort, setPendingPort] = useState<PortReference | null>(null);
  const [placementTool, setPlacementTool] = useState<PlacementTool | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Vec3 | null>(null);
  const [marquee, setMarquee] = useState<{ start: Vec3; end: Vec3 } | null>(null);
  const [query, setQuery] = useState('');
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
        const stored = JSON.parse(raw) as unknown;
        if (isStoredPlan(stored)) {
          const restored = restoreStoredPlan(stored, byClass);
          setPlacements(restored.placements);
          setFoundations(restored.foundations);
          setTransports(restored.transports);
          seq.current = nextEditorSequence(stored);
        }
      }
    } catch {
      // 저장 손상은 빈 검증 도면으로 격리한다.
    }
    setReady(true);
  }, [byClass]);

  useEffect(() => {
    if (!ready) return;
    const stored = toStoredPlan(placements, foundations, transports);
    localStorage.setItem(SAVE_KEY, JSON.stringify(stored));
  }, [ready, placements, foundations, transports]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
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
  }, [byClass, groupSelection, historyCounts, placements, selectedFoundationId, selectedId]);

  const plan: FactoryPlan = useMemo(() => {
    return {
      schemaVersion: 1,
      id: 'browser-plan',
      foundations,
      placements,
      transports,
      powerSources: [],
      powerEdges: [],
    };
  }, [foundations, placements, transports]);
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
  const ghostPoint = cursorWorld ? {
    x: Math.round(cursorWorld.x / (placementTool?.kind === 'foundation' ? FOUNDATION : SNAP)) * (placementTool?.kind === 'foundation' ? FOUNDATION : SNAP),
    y: Math.round(cursorWorld.y / (placementTool?.kind === 'foundation' ? FOUNDATION : SNAP)) * (placementTool?.kind === 'foundation' ? FOUNDATION : SNAP),
  } : null;

  const viewWidth = 128 / zoom;
  const viewHeight = viewWidth * Math.max(.48, box.height / Math.max(box.width, 1));
  const viewBox = `${pan.x - viewWidth / 2} ${pan.y - viewHeight / 2} ${viewWidth} ${viewHeight}`;

  function updateHistoryCounts() {
    setHistoryCounts({ undo: history.current.past.length, redo: history.current.future.length });
  }

  function clearTransientSelection() {
    setSelectedId(null);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setPendingPort(null);
    setPlacementTool(null);
    setCursorWorld(null);
    setMarquee(null);
  }

  function applyStoredState(stored: StoredPlan) {
    const restored = restoreStoredPlan(stored, byClass);
    setPlacements(restored.placements);
    setFoundations(restored.foundations);
    setTransports(restored.transports);
    seq.current = nextEditorSequence(stored);
    clearTransientSelection();
  }

  function recordHistory() {
    const snapshot = toStoredPlan(placements, foundations, transports);
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
    history.current.future.push(toStoredPlan(placements, foundations, transports));
    if (history.current.future.length > 50) history.current.future.shift();
    applyStoredState(previous);
    updateHistoryCounts();
    setNotice('실행 취소 · Ctrl+Shift+Z로 다시 실행');
  }

  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(toStoredPlan(placements, foundations, transports));
    if (history.current.past.length > 50) history.current.past.shift();
    applyStoredState(next);
    updateHistoryCounts();
    setNotice('다시 실행 · Ctrl+Z로 실행 취소');
  }

  function addMachine(machine: DrawingMachine, positionM: Vec3) {
    recordHistory();
    const placement: Placement = {
      id: `machine-${seq.current++}`,
      spec: machine,
      positionM,
      rotation: 0,
      operation: machine.recipes[0] ? operationFor(machine, machine.recipes.find((recipe) => !recipe.isAlternate) ?? machine.recipes[0]) : undefined,
    };
    setPlacements((current) => [...current, placement]);
    setSelectedId(placement.id);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setPlacementTool(null);
    setNotice(`${machine.name} 배치 완료`);
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
    setGroupSelection([]);
    setPlacementTool(null);
    setNotice('파운데이션 배치 완료');
  }

  function queueMachine(machine: DrawingMachine) {
    setPlacementTool({ kind: 'machine', buildingClass: machine.buildingClass });
    setSelectedId(null);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setNotice(`${machine.name} · 캔버스에서 놓을 위치를 좌클릭하세요. Esc 취소`);
  }

  function queueFoundation() {
    setPlacementTool({ kind: 'foundation' });
    setSelectedId(null);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setNotice('파운데이션 · 캔버스에서 놓을 위치를 좌클릭하세요. Esc 취소');
  }

  function removeSelected() {
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
    if (!placements.length && !foundations.length && !transports.length) return;
    recordHistory();
    setPlacements([]);
    setFoundations([]);
    setTransports([]);
    setSelectedId(null);
    setSelectedFoundationId(null);
    setPendingPort(null);
    setPlacementTool(null);
    setCursorWorld(null);
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
  ) {
    const boxes = nextPlacements.map((placement) => transformBox(placement, boundsOf(placement.spec)));
    const points = [
      ...boxes.flatMap((bounds) => [bounds.min, bounds.max]),
      ...nextFoundations.flatMap((tile) => [
        { x: tile.xM, y: tile.yM, z: tile.zM },
        { x: tile.xM + tile.sizeM, y: tile.yM + tile.sizeM, z: tile.zM },
      ]),
      ...nextTransports.flatMap((route) => route.pathM),
    ];
    if (!points.length) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const paddedWidth = Math.max(16, maxX - minX + 12);
    const paddedHeight = Math.max(16, maxY - minY + 12);
    const aspect = Math.max(.48, box.height / Math.max(box.width, 1));
    const nextZoom = Math.max(.55, Math.min(2.4, 128 / paddedWidth, (128 * aspect) / paddedHeight));
    setZoom(nextZoom);
    setPan({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    setNotice('도면 전체를 화면에 맞췄습니다.');
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

  function canvasPointerDown(event: PointerEvent) {
    const target = event.target as Element;
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
    drag.current = {
      kind: 'canvas',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
    setSelectedId(null);
    setSelectedFoundationId(null);
    setGroupSelection([]);
    setPendingPort(null);
  }

  function canvasClick(event: MouseEvent) {
    if (!placementTool) return;
    const target = event.target as Element;
    if (target.closest('.vp-placement, .vp-foundation, .vp-port')) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event as unknown as PointerEvent);
    if (placementTool.kind === 'foundation') {
      addFoundation(Math.round(point.x / FOUNDATION) * FOUNDATION, Math.round(point.y / FOUNDATION) * FOUNDATION);
      return;
    }
    const machine = byClass.get(placementTool.buildingClass);
    if (machine) addMachine(machine, { x: Math.round(point.x / SNAP) * SNAP, y: Math.round(point.y / SNAP) * SNAP, z: 0 });
  }

  function beginCatalogDrag(event: DragEvent, tool: PlacementTool) {
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
      addFoundation(Math.round(point.x / FOUNDATION) * FOUNDATION, Math.round(point.y / FOUNDATION) * FOUNDATION);
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
      recordHistory();
      setTransports((current) => [...current, {
        id: `route-${seq.current++}`,
        from: from.ref,
        to: to.ref,
        medium,
        itemId: rate?.itemId ?? 'unassigned',
        flowPerMinute: rate?.flowPerMinute ?? 0,
        capacityPerMinute: medium === 'solid' ? 60 : 300,
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
    const payload = JSON.stringify(toStoredPlan(placements, foundations, transports), null, 2);
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
      const stored = JSON.parse(await file.text()) as unknown;
      if (!isStoredPlan(stored)) throw new Error('지원하지 않는 도면 스키마');
      const restored = restoreStoredPlan(stored, byClass);
      recordHistory();
      applyStoredState(stored);
      fitToPlan(restored.placements, restored.foundations, restored.transports);
      setNotice(`${file.name} 도면을 복원했습니다.`);
    } catch (error) {
      setNotice(`가져오기 실패 · ${error instanceof Error ? error.message : '파일을 확인하세요.'}`);
    } finally {
      input.value = '';
    }
  }

  function renderSolidRoute(route: TransportRoute, elevated: boolean) {
    const segments = beltSegments(route.pathM).filter((segment) => elevated ? segment.z > 2.1 : segment.z <= 2.1);
    if (!segments.length) return null;
    const labelSegment = segments[Math.floor(segments.length / 2)];
    return (
      <g class={`vp-route is-solid${elevated ? ' is-elevated' : ''}`} key={`${route.id}-${elevated ? 'high' : 'low'}`} aria-label="컨베이어 벨트">
        {segments.map((segment, segmentIndex) => (
          <g class="vp-belt-segment" transform={`translate(${segment.x} ${segment.y}) rotate(${segment.angle})`}>
            <rect x={-segment.length / 2} y="-1.05" width={segment.length} height="2.1" rx=".7" class="vp-belt-frame" />
            {Array.from({ length: Math.ceil(segment.length / 2) }, (_, tileIndex) => {
              const startX = -segment.length / 2 + tileIndex * 2;
              const tileWidth = Math.min(2, segment.length - tileIndex * 2);
              return tileWidth > 0 ? (
                <image
                  key={`${segmentIndex}-${tileIndex}`}
                  href={beltImageUrl}
                  x={startX - .015}
                  y="-.88"
                  width={tileWidth + .03}
                  height="1.76"
                  preserveAspectRatio="none"
                  class="vp-belt-tile"
                />
              ) : null;
            })}
            <path d={`M ${-segment.length / 2} -.88 H ${segment.length / 2} M ${-segment.length / 2} .88 H ${segment.length / 2}`} class="vp-belt-rail" />
            <path d={`M ${-segment.length / 2 + .5} 0 H ${segment.length / 2 - .5}`} class="vp-belt-motion" />
          </g>
        ))}
        {route.pathM.slice(1, -1).filter((point) => elevated ? point.z > 2.1 : point.z <= 2.1).map((point) => <circle cx={point.x} cy={point.y} r="1.02" class="vp-belt-joint" />)}
        {labelSegment && route.flowPerMinute > 0 && (
          <g class="vp-route-label" transform={`translate(${labelSegment.x} ${labelSegment.y - 1.7})`}>
            <rect x="-4.5" y="-.7" width="9" height="1.4" rx=".24" />
            <text>{itemNames.get(route.itemId) ?? route.itemId} · {fmt(route.flowPerMinute)}/분{elevated ? ` · Z +${fmt(labelSegment.z)} m` : ''}</text>
          </g>
        )}
      </g>
    );
  }

  function renderLift(route: TransportRoute) {
    return liftSegments(route.pathM).map((lift, index) => (
      <g class="vp-lift" transform={`translate(${lift.x} ${lift.y})`} key={`${route.id}-lift-${index}`}>
        <rect x="-1.35" y="-2.1" width="2.7" height="4.2" rx=".45" class="vp-lift-bed" />
        <image href={liftImageUrl} x="-1.6" y="-2.4" width="3.2" height="4.8" preserveAspectRatio="xMidYMid meet" />
        <g class="vp-lift-label" transform="translate(0 -2.7)">
          <rect x="-2.25" y="-.65" width="4.5" height="1.3" rx=".22" />
          <text>리프트 {fmt(lift.height)} m · Z +{fmt(lift.highZ)} m</text>
        </g>
      </g>
    ));
  }

  return (
    <section class="vp" aria-label="검증형 공장 설계판">
      <aside class="vp-catalog">
        <header>
          <p class="vp-eyebrow">VERIFIED CATALOG</p>
          <h2>실측 완료 설비</h2>
          <p>게임 충돌 상자와 공개 세이브·블루프린트 포트가 모두 확인된 설비만 놓을 수 있습니다.</p>
        </header>
        <label class="vp-search">
          <input aria-label="설비 검색" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="설비 검색" />
        </label>
        <div class="vp-machine-list">
          <button
            type="button"
            draggable
            class={`vp-machine is-foundation${placementTool?.kind === 'foundation' ? ' is-armed' : ''}`}
            onClick={queueFoundation}
            onDragStart={(event) => beginCatalogDrag(event as unknown as DragEvent, { kind: 'foundation' })}
            onDragEnd={() => setCursorWorld(null)}
            title="클릭한 뒤 위치를 고르거나 캔버스로 드래그"
          >
            <img src={foundationImageUrl} alt="" draggable={false} />
            <span><strong>파운데이션 8 m × 8 m</strong><small>실제 게임 타일 · 8 m 스냅</small></span>
            <b aria-hidden="true">+</b>
          </button>
          {visibleMachines.map((machine) => {
            const bounds = boundsOf(machine);
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
                <img src={machine.imageUrl} alt="" draggable={false} />
                <span><strong>{machine.name}</strong><small>{fmt(bounds.max.x - bounds.min.x)} × {fmt(bounds.max.y - bounds.min.y)} m · 포트 {machine.ports.length}</small></span>
                <b aria-hidden="true">+</b>
              </button>
            );
          })}
        </div>
        <footer>
          <span class="vp-proof-dot" />
          공개 파일 {proof.publicFileCount}건 포함 {proof.fileCount}건 · 연결 관측 {proof.observationCount.toLocaleString('ko-KR')}회 · 합의 반경 {fmt(proof.toleranceM * 100)} cm
        </footer>
      </aside>

      <div class="vp-workspace">
        <header class="vp-toolbar">
          <div class="vp-status">
            <span class={validation.publishable ? 'is-ready' : 'is-review'} />
            <strong>{validation.publishable ? '시공 검증 통과' : `검토 ${validation.issues.length}건`}</strong>
            <small>설비 {placements.length} · 토대 {foundations.length} · 물류 {transports.length}</small>
          </div>
          <div class="vp-actions">
            <button type="button" onClick={undo} disabled={!historyCounts.undo} title="Ctrl+Z">실행 취소</button>
            <button type="button" onClick={redo} disabled={!historyCounts.redo} title="Ctrl+Shift+Z 또는 Ctrl+Y">다시 실행</button>
            <button type="button" onClick={rotateSelected} disabled={!selectedId}>90° 회전</button>
            <button type="button" onClick={() => changeElevation(-4)} disabled={!selectedId && !selectedFoundationId}>높이 −4 m</button>
            <button type="button" onClick={() => changeElevation(4)} disabled={!selectedId && !selectedFoundationId}>높이 +4 m</button>
            <button type="button" onClick={removeSelected} disabled={!selectedId && !selectedFoundationId && !groupSelection.length}>선택 삭제{groupSelection.length ? ` (${groupSelection.length})` : ''}</button>
            <button type="button" class="is-danger" onClick={resetPlan} disabled={!placements.length && !foundations.length}>전체 초기화</button>
            <button type="button" onClick={() => fitToPlan()} disabled={!placements.length && !foundations.length && !transports.length}>도면 맞춤</button>
            <button type="button" onClick={exportPlan}>JSON 내보내기</button>
            <label class="vp-import-button">
              JSON 가져오기
              <input type="file" accept="application/json,.json" onChange={importPlan} />
            </label>
          </div>
          {notice && <p class="vp-notice" role="status">{notice}</p>}
        </header>

        <div class="vp-stage" ref={stageRef} onClick={canvasClick} onDragOver={stageDragOver} onDrop={stageDrop}>
          <div class="vp-ruler"><strong>8 m · 파운데이션 1칸</strong><span>카탈로그 드롭 · 배경 드래그 이동 · Shift+드래그 영역 선택 · Ctrl+Z 실행 취소</span></div>
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
            <rect x={-viewWidth} y={-viewHeight} width={viewWidth * 2} height={viewHeight * 2} fill="url(#vp-foundation-grid)" pointer-events="none" />
            {[...foundations].sort((a, b) => a.zM - b.zM).map((tile) => (
              <g
                key={tile.id}
                class={`vp-foundation${selectedFoundationId === tile.id ? ' is-selected' : ''}`}
                onPointerDown={(event) => foundationPointerDown(event as unknown as PointerEvent, tile)}
              >
                <rect x={tile.xM} y={tile.yM} width={tile.sizeM} height={tile.sizeM} class="vp-foundation-bed" />
                <image
                  href={foundationImageUrl}
                  x={tile.xM - .025}
                  y={tile.yM - .025}
                  width={tile.sizeM + .05}
                  height={tile.sizeM + .05}
                  preserveAspectRatio="none"
                />
                <rect x={tile.xM} y={tile.yM} width={tile.sizeM} height={tile.sizeM} class="vp-foundation-hit" />
                {tile.zM > 0 && <text x={tile.xM + .5} y={tile.yM + 1.1} class="vp-z-label">Z +{fmt(tile.zM)} m</text>}
              </g>
            ))}

            {transports.map((route) => route.medium === 'solid' ? renderSolidRoute(route, false) : (
              <g class="vp-route is-fluid" key={route.id} aria-label="파이프라인">
                <path d={routePath(route.pathM)} class="vp-route-shell" />
                <path d={routePath(route.pathM)} class="vp-route-core" />
              </g>
            ))}

            {[...placements].sort((a, b) => a.positionM.z - b.positionM.z).map((placement) => {
              const spec = byClass.get(placement.spec.buildingClass)!;
              const bounds = boundsOf(spec);
              const width = bounds.max.x - bounds.min.x;
              const height = bounds.max.y - bounds.min.y;
              const art = imageRect(spec, bounds);
              const selected = selectedId === placement.id || groupSelection.includes(placement.id);
              const compactLogistics = /ConveyorAttachment(?:Splitter|Merger)/.test(spec.buildingClass);
              return (
                <g
                  key={placement.id}
                  class={`vp-placement${selected ? ' is-selected' : ''}`}
                  transform={`translate(${placement.positionM.x} ${placement.positionM.y}) rotate(${placement.rotation})`}
                  onPointerDown={(event) => pointerDown(event as unknown as PointerEvent, placement)}
                >
                  <rect x={bounds.min.x} y={bounds.min.y} width={width} height={height} class="vp-clearance" />
                  <image
                    href={spec.imageUrl}
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
                  {spec.ports.map((port) => {
                    const active = pendingPort?.placementId === placement.id && pendingPort.portId === port.id;
                    return (
                      <g
                        key={port.id}
                        class={`vp-port is-${port.medium} is-${port.direction}${compactLogistics ? ' is-compact' : ''}${active ? ' is-active' : ''}`}
                        transform={`translate(${port.positionM.x} ${port.positionM.y}) rotate(${-placement.rotation})`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); connectPort({ placementId: placement.id, portId: port.id }); }}
                      >
                        <circle r={compactLogistics ? '.42' : '.62'} />
                        {compactLogistics
                          ? <path d="M -.16 -.2 L .2 0 L -.16 .2" class="vp-port-chevron" />
                          : <text class="vp-port-label">{port.direction === 'input' ? 'IN' : port.direction === 'output' ? 'OUT' : 'IO'}</text>}
                        <title>{port.direction === 'input' ? '입력' : port.direction === 'output' ? '출력' : '양방향'} · {port.medium === 'solid' ? '컨베이어' : '파이프'} · 표본 {port.sampleCount}</title>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {transports.filter((route) => route.medium === 'solid').map((route) => renderSolidRoute(route, true))}
            {transports.filter((route) => route.medium === 'solid').flatMap((route) => renderLift(route))}
            {placementTool?.kind === 'foundation' && ghostPoint && (
              <g class="vp-placement-ghost">
                <image href={foundationImageUrl} x={ghostPoint.x - .025} y={ghostPoint.y - .025} width={FOUNDATION + .05} height={FOUNDATION + .05} preserveAspectRatio="none" />
                <rect x={ghostPoint.x} y={ghostPoint.y} width={FOUNDATION} height={FOUNDATION} />
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
          {!placements.length && (
            <div class="vp-empty">
              <span>01</span>
              <h3>왼쪽에서 검증 설비를 놓으세요.</h3>
              <p>파운데이션과 설비를 직접 놓고, 실제 포트를 눌러 컨베이어·파이프를 연결합니다.</p>
            </div>
          )}
        </div>

        <section class="vp-inspector" aria-live="polite">
          <div class="vp-inspector-title">
            <p class="vp-eyebrow">MACHINE CONTROL</p>
            <h3>{selectedMachine ? selectedMachine.name : selectedFoundationId ? '선택한 파운데이션' : '설비를 선택하세요.'}</h3>
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
