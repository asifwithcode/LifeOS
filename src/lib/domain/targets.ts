// Target period ranges, matching, aggregation and pace. See docs/04-progress-model.md.

import type { TargetPeriod, TargetUnit } from "./constants";
import {
  addDays,
  compareISO,
  diffDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  type ISODate,
} from "./dates";

export interface PeriodRange {
  start: ISODate;
  end: ISODate; // inclusive
}

export function periodRange(
  period: TargetPeriod | string,
  today: ISODate,
  weekStartsOn: number,
  custom?: { start: ISODate | null; end: ISODate | null },
): PeriodRange {
  switch (period) {
    case "daily":
      return { start: today, end: today };
    case "weekly": {
      const start = startOfWeek(today, weekStartsOn);
      return { start, end: addDays(start, 6) };
    }
    case "monthly":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "quarterly":
      return { start: startOfQuarter(today), end: endOfQuarter(today) };
    case "yearly":
      return { start: startOfYear(today), end: endOfYear(today) };
    case "custom":
      if (!custom?.start || !custom?.end) throw new Error("Custom period requires start and end dates");
      return { start: custom.start, end: custom.end };
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

/** The range for the period `offset` periods before the current one (offset 1 = previous). */
export function previousPeriodRange(
  period: TargetPeriod | string,
  today: ISODate,
  weekStartsOn: number,
  offset: number,
): PeriodRange | null {
  if (period === "custom") return null;
  const current = periodRange(period, today, weekStartsOn);
  let anchor = current.start;
  for (let i = 0; i < offset; i++) anchor = addDays(periodRange(period, anchor, weekStartsOn).start, -1);
  return periodRange(period, anchor, weekStartsOn);
}

export const TIME_UNITS: readonly string[] = ["minutes", "hours"];

export type TargetMetric = "time" | "sessions" | "tasks" | "quantity";

export function metricForUnit(unit: TargetUnit | string): TargetMetric {
  if (TIME_UNITS.includes(unit)) return "time";
  if (unit === "sessions") return "sessions";
  if (unit === "tasks") return "tasks";
  return "quantity";
}

export interface TargetFilter {
  activityType: string | null;
  lifeAreaId: string | null;
  skillId: string | null;
  projectId: string | null;
}

export interface SessionForTarget {
  activityType: string;
  lifeAreaId: string | null;
  skillId: string | null;
  projectId: string | null;
  durationMinutes: number | null;
  quantity: number | null;
  unit: string | null;
  localDate: ISODate;
}

export interface CompletedTaskForTarget {
  projectId: string | null;
  lifeAreaId: string | null;
  skillId: string | null;
  localDate: ISODate;
}

export function sessionMatches(filter: TargetFilter, s: Omit<SessionForTarget, "durationMinutes" | "quantity" | "unit" | "localDate">): boolean {
  if (filter.activityType && filter.activityType !== s.activityType) return false;
  if (filter.lifeAreaId && filter.lifeAreaId !== s.lifeAreaId) return false;
  if (filter.skillId && filter.skillId !== s.skillId) return false;
  if (filter.projectId && filter.projectId !== s.projectId) return false;
  return true;
}

function inRange(d: ISODate, r: PeriodRange) {
  return compareISO(d, r.start) >= 0 && compareISO(d, r.end) <= 0;
}

export interface TargetDefinition extends TargetFilter {
  unit: TargetUnit | string;
  customUnit: string | null;
  amount: number;
}

/** Unit label a session must carry to count toward a quantity target. */
export function quantityUnitKey(unit: string, customUnit: string | null): string {
  return unit === "custom" ? (customUnit ?? "").trim().toLowerCase() : unit;
}

/** Actual amount achieved in `range`, in the target's unit. */
export function aggregateActual(
  target: TargetDefinition,
  range: PeriodRange,
  sessions: SessionForTarget[],
  completedTasks: CompletedTaskForTarget[] = [],
): number {
  const metric = metricForUnit(target.unit);
  if (metric === "tasks") {
    return completedTasks.filter(
      (t) =>
        inRange(t.localDate, range) &&
        (!target.projectId || target.projectId === t.projectId) &&
        (!target.lifeAreaId || target.lifeAreaId === t.lifeAreaId) &&
        (!target.skillId || target.skillId === t.skillId),
    ).length;
  }
  const matching = sessions.filter((s) => inRange(s.localDate, range) && sessionMatches(target, s));
  if (metric === "time") {
    const minutes = matching.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
    return target.unit === "hours" ? minutes / 60 : minutes;
  }
  if (metric === "sessions") return matching.length;
  const key = quantityUnitKey(target.unit, target.customUnit);
  return matching
    .filter((s) => (s.unit ?? "").trim().toLowerCase() === key)
    .reduce((sum, s) => sum + (s.quantity ?? 0), 0);
}

export type PaceStatus = "complete" | "ahead" | "on_track" | "behind" | "not_started";

export interface TargetEvaluation {
  range: PeriodRange;
  actual: number;
  amount: number;
  percent: number; // uncapped
  remaining: number;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  expectedNow: number;
  requiredPerDay: number | null;
  status: PaceStatus;
}

/** Evaluate progress and pace of a target within `range` as of `today`. */
export function evaluateTarget(amount: number, actual: number, range: PeriodRange, today: ISODate): TargetEvaluation {
  const totalDays = diffDays(range.start, range.end) + 1;
  let elapsedDays: number;
  let remainingDays: number; // today still counts as a day to work in
  if (compareISO(today, range.start) < 0) {
    elapsedDays = 0;
    remainingDays = totalDays;
  } else if (compareISO(today, range.end) > 0) {
    elapsedDays = totalDays;
    remainingDays = 0;
  } else {
    elapsedDays = diffDays(range.start, today) + 1;
    remainingDays = diffDays(today, range.end) + 1;
  }
  const remaining = Math.max(0, amount - actual);
  // Expected by the start of today: only fully elapsed days count, so a fresh period isn't "behind" at 8am.
  const fullDaysBeforeToday = remainingDays === 0 ? totalDays : Math.max(0, elapsedDays - 1);
  const expectedNow = (amount * fullDaysBeforeToday) / totalDays;
  const percent = amount > 0 ? (actual / amount) * 100 : 0;
  let status: PaceStatus;
  if (actual >= amount) status = "complete";
  else if (elapsedDays === 0) status = "not_started";
  else if (expectedNow === 0) status = actual > 0 ? "ahead" : "on_track";
  else if (actual >= expectedNow * 1.05) status = "ahead";
  else if (actual >= expectedNow * 0.9) status = "on_track";
  else status = "behind";
  const requiredPerDay = remaining > 0 && remainingDays > 0 ? remaining / remainingDays : remaining > 0 ? null : 0;
  return {
    range,
    actual,
    amount,
    percent: Math.round(percent * 10) / 10,
    remaining,
    totalDays,
    elapsedDays,
    remainingDays,
    expectedNow,
    requiredPerDay,
    status,
  };
}

export function unitLabel(unit: string, customUnit: string | null, amount = 2): string {
  if (unit === "custom") return customUnit || "units";
  if (amount === 1) return unit.replace(/s$/, "");
  return unit;
}

/** "2.5" → "2.5", 2 → "2", 1.333 → "1.3" */
export function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toString();
}

/** Human formatting in the target's unit, e.g. "1h 30m" for time units. */
export function formatTargetAmount(n: number, unit: string, customUnit: string | null): string {
  if (unit === "minutes" || unit === "hours") {
    const minutes = unit === "hours" ? n * 60 : n;
    const m = Math.round(minutes);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  return `${formatAmount(n)} ${unitLabel(unit, customUnit, n)}`;
}

/** Neutral sentence describing what's left. Never guilt-based. */
export function describeEvaluation(e: TargetEvaluation, unit: string, customUnit: string | null, period: string): string {
  if (e.status === "complete") return e.actual > e.amount ? "Done — exceeded the target." : "Done for this period.";
  const left = formatTargetAmount(e.remaining, unit, customUnit);
  if (period === "daily") return `${left} to go today.`;
  if (e.status === "not_started") return `Starts ${e.range.start}.`;
  if (e.requiredPerDay !== null && e.remainingDays > 0) {
    const perDay = formatTargetAmount(e.requiredPerDay, unit, customUnit);
    return `${left} to go · about ${perDay}/day for the remaining ${e.remainingDays} day${e.remainingDays === 1 ? "" : "s"}.`;
  }
  return `${left} short at period end.`;
}
