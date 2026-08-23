export const PLANNER_HANDOFF_KEY = 'sfops.planner-handoff.v1';

export interface PlannerHandoffEntry {
  id: string;
  buildingClass: string;
  recipeId: string;
  clockPercent: number;
  remaining: number;
  targetItemId: string;
  targetFlowPerMinute: number;
}

export interface PlannerHandoff {
  schemaVersion: 1;
  createdAt: string;
  entries: PlannerHandoffEntry[];
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parsePlannerHandoff(value: unknown): PlannerHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlannerHandoff>;
  if (candidate.schemaVersion !== 1 || typeof candidate.createdAt !== 'string' || !Array.isArray(candidate.entries)) return null;
  if (!candidate.entries.every((entry) => (
    typeof entry?.id === 'string'
    && typeof entry.buildingClass === 'string'
    && typeof entry.recipeId === 'string'
    && finite(entry.clockPercent) && entry.clockPercent > 0 && entry.clockPercent <= 250
    && Number.isInteger(entry.remaining) && entry.remaining > 0
    && typeof entry.targetItemId === 'string'
    && finite(entry.targetFlowPerMinute) && entry.targetFlowPerMinute > 0
  ))) return null;
  return structuredClone(candidate as PlannerHandoff);
}

export function loadPlannerHandoff(): PlannerHandoff | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PLANNER_HANDOFF_KEY);
    return raw ? parsePlannerHandoff(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function savePlannerHandoff(handoff: PlannerHandoff | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!handoff?.entries.length) localStorage.removeItem(PLANNER_HANDOFF_KEY);
    else localStorage.setItem(PLANNER_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // 저장 공간 제한이 있어도 현재 계산·설계 화면은 계속 동작한다.
  }
}
