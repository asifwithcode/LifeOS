import { addDays, addMonths, compareISO, weekday, type ISODate } from "./dates";

export const RECURRENCE_FREQS = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Every N units, ≥ 1 */
  interval: number;
  /** Weekly only: weekdays (0=Sun..6=Sat). Empty/undefined = same weekday as the anchor. */
  byWeekday?: number[];
}

/**
 * The first occurrence strictly after `from`, following `rule` anchored at `from`.
 * For weekly rules with byWeekday, `interval` counts weeks between active weeks.
 */
export function nextOccurrence(rule: RecurrenceRule, from: ISODate): ISODate {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case "daily":
      return addDays(from, interval);
    case "weekly": {
      const days = (rule.byWeekday ?? []).filter((d) => d >= 0 && d <= 6);
      if (days.length === 0) return addDays(from, 7 * interval);
      const sorted = [...new Set(days)].sort((a, b) => a - b);
      const wd = weekday(from);
      // Later weekday in the same week?
      const later = sorted.find((d) => d > wd);
      if (later !== undefined) return addDays(from, later - wd);
      // Otherwise first selected weekday of the week `interval` weeks ahead.
      const startOfThisWeek = addDays(from, -wd); // Sunday-based week for rule maths
      return addDays(startOfThisWeek, 7 * interval + sorted[0]);
    }
    case "monthly":
      return addMonths(from, interval);
    case "yearly":
      return addMonths(from, 12 * interval);
  }
}

/**
 * Next occurrence after `from` that is on or after `notBefore`
 * (used so an overdue recurring task doesn't respawn in the past).
 */
export function nextOccurrenceOnOrAfter(rule: RecurrenceRule, from: ISODate, notBefore: ISODate): ISODate {
  let next = nextOccurrence(rule, from);
  let guard = 0;
  while (compareISO(next, notBefore) < 0 && guard < 5000) {
    next = nextOccurrence(rule, next);
    guard++;
  }
  return next;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeRecurrence(rule: RecurrenceRule): string {
  const n = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case "daily":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "weekly": {
      const days = rule.byWeekday?.length ? ` on ${[...rule.byWeekday].sort().map((d) => WD[d]).join(", ")}` : "";
      return (n === 1 ? "Every week" : `Every ${n} weeks`) + days;
    }
    case "monthly":
      return n === 1 ? "Every month" : `Every ${n} months`;
    case "yearly":
      return n === 1 ? "Every year" : `Every ${n} years`;
  }
}
