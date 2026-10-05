import { timeToMinutes, weekday, type ISODate } from "./dates";

export interface TemplateLike {
  id: string;
  weekdays: number[];
  isDefault: boolean;
  archivedAt: Date | null;
  sortOrder: number;
}

export interface ItemLike {
  id: string;
  templateId: string;
  startTime: string;
  durationMinutes: number;
  daysOfWeek: number[] | null;
  archivedAt: Date | null;
}

/**
 * Which template applies on `date`:
 *   1. an explicit day plan override,
 *   2. the first active template whose weekdays include the date's weekday,
 *   3. the default template,
 *   4. none.
 */
export function resolveTemplateForDate<T extends TemplateLike>(
  date: ISODate,
  templates: T[],
  overrideTemplateId?: string | null,
): { template: T | null; reason: "override" | "weekday" | "default" | "none" } {
  const active = templates.filter((t) => !t.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  if (overrideTemplateId) {
    const o = active.find((t) => t.id === overrideTemplateId);
    if (o) return { template: o, reason: "override" };
  }
  const wd = weekday(date);
  const byWeekday = active.find((t) => t.weekdays.includes(wd));
  if (byWeekday) return { template: byWeekday, reason: "weekday" };
  const def = active.find((t) => t.isDefault);
  if (def) return { template: def, reason: "default" };
  return { template: null, reason: "none" };
}

/** Items of `templateId` scheduled on `date`, ordered by start time. */
export function itemsForDate<I extends ItemLike>(date: ISODate, templateId: string, items: I[]): I[] {
  const wd = weekday(date);
  return items
    .filter(
      (i) =>
        i.templateId === templateId &&
        !i.archivedAt &&
        (i.daysOfWeek === null || i.daysOfWeek.length === 0 || i.daysOfWeek.includes(wd)),
    )
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export type RoutineSlotState = "done" | "skipped" | "now" | "upcoming" | "missed";

/** State of a routine slot relative to the current local time (only meaningful for today). */
export function slotState(
  item: Pick<ItemLike, "startTime" | "durationMinutes">,
  completionStatus: "done" | "skipped" | null,
  nowMinutes: number,
  isToday: boolean,
  isPast: boolean,
): RoutineSlotState {
  if (completionStatus) return completionStatus;
  if (isPast) return "missed";
  if (!isToday) return "upcoming";
  const start = timeToMinutes(item.startTime);
  const end = start + item.durationMinutes;
  if (nowMinutes >= start && nowMinutes < end) return "now";
  if (nowMinutes >= end) return "missed";
  return "upcoming";
}

/** Total planned minutes for a set of items. */
export function plannedMinutes(items: Pick<ItemLike, "durationMinutes">[]): number {
  return items.reduce((s, i) => s + i.durationMinutes, 0);
}

/** Detect overlapping items (same day) — returned as pairs of ids. */
export function findOverlaps(items: Pick<ItemLike, "id" | "startTime" | "durationMinutes">[]): [string, string][] {
  const sorted = [...items].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const pairs: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const endI = timeToMinutes(sorted[i].startTime) + sorted[i].durationMinutes;
    for (let j = i + 1; j < sorted.length; j++) {
      if (timeToMinutes(sorted[j].startTime) < endI) pairs.push([sorted[i].id, sorted[j].id]);
      else break;
    }
  }
  return pairs;
}
