import { describe, expect, it } from "vitest";
import {
  aggregateActual,
  describeEvaluation,
  evaluateTarget,
  formatTargetAmount,
  metricForUnit,
  periodRange,
  previousPeriodRange,
  type SessionForTarget,
  type TargetDefinition,
} from "../targets";

const noFilter = { activityType: null, lifeAreaId: null, skillId: null, projectId: null };

const session = (over: Partial<SessionForTarget>): SessionForTarget => ({
  activityType: "study",
  lifeAreaId: null,
  skillId: null,
  projectId: null,
  durationMinutes: null,
  quantity: null,
  unit: null,
  localDate: "2026-10-05",
  ...over,
});

describe("periodRange", () => {
  it("daily", () => {
    expect(periodRange("daily", "2026-10-05", 1)).toEqual({ start: "2026-10-05", end: "2026-10-05" });
  });
  it("weekly respects week start", () => {
    expect(periodRange("weekly", "2026-10-07", 1)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(periodRange("weekly", "2026-10-07", 0)).toEqual({ start: "2026-10-04", end: "2026-10-10" });
  });
  it("monthly, quarterly, yearly", () => {
    expect(periodRange("monthly", "2028-02-10", 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(periodRange("quarterly", "2026-11-20", 1)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodRange("yearly", "2026-11-20", 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("custom requires dates", () => {
    expect(periodRange("custom", "2026-10-05", 1, { start: "2026-10-01", end: "2026-12-31" })).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(() => periodRange("custom", "2026-10-05", 1)).toThrow();
  });
  it("previous periods", () => {
    expect(previousPeriodRange("monthly", "2026-03-15", 1, 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriodRange("weekly", "2026-10-07", 1, 2)).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(previousPeriodRange("custom", "2026-10-07", 1, 1)).toBeNull();
  });
});

describe("aggregateActual", () => {
  const range = { start: "2026-10-05", end: "2026-10-11" };

  it("sums time in hours, filtered by activity type and range", () => {
    const t: TargetDefinition = { ...noFilter, activityType: "study", unit: "hours", customUnit: null, amount: 25 };
    const actual = aggregateActual(t, range, [
      session({ durationMinutes: 90 }),
      session({ durationMinutes: 30, localDate: "2026-10-11" }),
      session({ durationMinutes: 60, activityType: "coding" }),
      session({ durationMinutes: 60, localDate: "2026-10-12" }),
    ]);
    expect(actual).toBe(2);
  });

  it("matches all set filters", () => {
    const t: TargetDefinition = { ...noFilter, skillId: "kotlin", unit: "minutes", customUnit: null, amount: 60 };
    expect(
      aggregateActual(t, range, [session({ durationMinutes: 40, skillId: "kotlin" }), session({ durationMinutes: 40, skillId: "esp32" })]),
    ).toBe(40);
  });

  it("sums quantities with the same unit only", () => {
    const t: TargetDefinition = { ...noFilter, unit: "pages", customUnit: null, amount: 30 };
    expect(
      aggregateActual(t, range, [
        session({ quantity: 12, unit: "pages" }),
        session({ quantity: 6, unit: "pages" }),
        session({ quantity: 2, unit: "chapters" }),
        session({ durationMinutes: 30 }),
      ]),
    ).toBe(18);
  });

  it("custom units match case-insensitively", () => {
    const t: TargetDefinition = { ...noFilter, unit: "custom", customUnit: "Problems", amount: 10 };
    expect(aggregateActual(t, range, [session({ quantity: 4, unit: "problems" })])).toBe(4);
  });

  it("counts sessions", () => {
    const t: TargetDefinition = { ...noFilter, unit: "sessions", customUnit: null, amount: 5 };
    expect(aggregateActual(t, range, [session({ durationMinutes: 10 }), session({ quantity: 1, unit: "pages" })])).toBe(2);
  });

  it("counts completed tasks for task targets", () => {
    const t: TargetDefinition = { ...noFilter, projectId: "maya", unit: "tasks", customUnit: null, amount: 10 };
    expect(
      aggregateActual(t, range, [], [
        { projectId: "maya", lifeAreaId: null, skillId: null, localDate: "2026-10-06" },
        { projectId: "other", lifeAreaId: null, skillId: null, localDate: "2026-10-06" },
        { projectId: "maya", lifeAreaId: null, skillId: null, localDate: "2026-10-20" },
      ]),
    ).toBe(1);
  });

  it("metric mapping", () => {
    expect(metricForUnit("hours")).toBe("time");
    expect(metricForUnit("tasks")).toBe("tasks");
    expect(metricForUnit("pages")).toBe("quantity");
  });
});

describe("evaluateTarget", () => {
  const month = { start: "2026-10-01", end: "2026-10-31" };

  it("detects behind schedule and required pace", () => {
    // Day 11 of 31; 10 full days elapsed → expected 100*10/31 ≈ 32.3h
    const e = evaluateTarget(100, 20, month, "2026-10-11");
    expect(e.status).toBe("behind");
    expect(e.remaining).toBe(80);
    expect(e.remainingDays).toBe(21);
    expect(e.requiredPerDay).toBeCloseTo(80 / 21, 5);
  });

  it("on track and ahead", () => {
    expect(evaluateTarget(100, 31, month, "2026-10-11").status).toBe("on_track");
    expect(evaluateTarget(100, 40, month, "2026-10-11").status).toBe("ahead");
  });

  it("a fresh period is not behind at the start of day one", () => {
    expect(evaluateTarget(100, 0, month, "2026-10-01").status).toBe("on_track");
  });

  it("complete and exceeded", () => {
    const e = evaluateTarget(4, 5, { start: "2026-10-05", end: "2026-10-05" }, "2026-10-05");
    expect(e.status).toBe("complete");
    expect(e.percent).toBe(125);
    expect(describeEvaluation(e, "hours", null, "daily")).toMatch(/exceeded/);
  });

  it("period ended", () => {
    const e = evaluateTarget(100, 50, month, "2026-11-03");
    expect(e.remainingDays).toBe(0);
    expect(e.status).toBe("behind");
    expect(e.requiredPerDay).toBeNull();
  });

  it("future period", () => {
    const e = evaluateTarget(10, 0, { start: "2026-11-01", end: "2026-11-30" }, "2026-10-20");
    expect(e.status).toBe("not_started");
    expect(e.remainingDays).toBe(30);
  });

  it("uses neutral language", () => {
    const e = evaluateTarget(25, 18, { start: "2026-10-05", end: "2026-10-11" }, "2026-10-09");
    const text = describeEvaluation(e, "hours", null, "weekly");
    expect(text).toBe("7h to go · about 2h 20m/day for the remaining 3 days.");
  });

  it("formats amounts", () => {
    expect(formatTargetAmount(1.5, "hours", null)).toBe("1h 30m");
    expect(formatTargetAmount(1, "pages", null)).toBe("1 page");
    expect(formatTargetAmount(3, "custom", "problems")).toBe("3 problems");
  });
});
