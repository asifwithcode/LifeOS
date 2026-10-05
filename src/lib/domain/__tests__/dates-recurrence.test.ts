import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  formatMinutes,
  isISODate,
  localDateInTz,
  startOfWeek,
  weekday,
} from "../dates";
import { describeRecurrence, nextOccurrence, nextOccurrenceOnOrAfter } from "../recurrence";

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-2-3")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("clamps month addition to month length", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("computes week starts for Monday and Sunday weeks", () => {
    // 2026-10-05 is a Monday
    expect(weekday("2026-10-05")).toBe(1);
    expect(startOfWeek("2026-10-05", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-04", 1)).toBe("2026-09-28");
    expect(startOfWeek("2026-10-07", 0)).toBe("2026-10-04");
  });

  it("diffs and month ends", () => {
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("computes local date in a timezone", () => {
    const instant = new Date("2026-10-05T20:30:00Z");
    expect(localDateInTz("Asia/Dhaka", instant)).toBe("2026-10-06"); // UTC+6
    expect(localDateInTz("America/Los_Angeles", instant)).toBe("2026-10-05");
    expect(localDateInTz("Not/AZone", instant)).toBe("2026-10-05");
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(95)).toBe("1h 35m");
  });
});

describe("recurrence", () => {
  it("daily with interval", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-10-05")).toBe("2026-10-06");
    expect(nextOccurrence({ freq: "daily", interval: 3 }, "2026-10-30")).toBe("2026-11-02");
  });

  it("weekly on the anchor weekday", () => {
    expect(nextOccurrence({ freq: "weekly", interval: 1 }, "2026-10-05")).toBe("2026-10-12");
    expect(nextOccurrence({ freq: "weekly", interval: 2 }, "2026-10-05")).toBe("2026-10-19");
  });

  it("weekly on selected weekdays", () => {
    const rule = { freq: "weekly" as const, interval: 1, byWeekday: [1, 3, 5] }; // Mon Wed Fri
    expect(nextOccurrence(rule, "2026-10-05")).toBe("2026-10-07"); // Mon → Wed
    expect(nextOccurrence(rule, "2026-10-07")).toBe("2026-10-09"); // Wed → Fri
    expect(nextOccurrence(rule, "2026-10-09")).toBe("2026-10-12"); // Fri → next Mon
  });

  it("weekly on selected weekdays every 2 weeks", () => {
    const rule = { freq: "weekly" as const, interval: 2, byWeekday: [2] }; // Tue
    expect(nextOccurrence(rule, "2026-10-06")).toBe("2026-10-20");
  });

  it("monthly clamps to month end", () => {
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31")).toBe("2026-02-28");
  });

  it("skips past occurrences for overdue tasks", () => {
    expect(nextOccurrenceOnOrAfter({ freq: "daily", interval: 1 }, "2026-09-01", "2026-10-05")).toBe("2026-10-05");
    expect(nextOccurrenceOnOrAfter({ freq: "weekly", interval: 1 }, "2026-09-07", "2026-10-06")).toBe("2026-10-12");
  });

  it("describes rules", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [5, 1] })).toBe("Every week on Mon, Fri");
    expect(describeRecurrence({ freq: "daily", interval: 2 })).toBe("Every 2 days");
  });
});
