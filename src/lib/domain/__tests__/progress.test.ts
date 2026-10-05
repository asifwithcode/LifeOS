import { describe, expect, it } from "vitest";
import {
  goalProgress,
  projectProgress,
  skillProgress,
  tasksProgress,
  todayProgress,
  weightedMilestoneProgress,
} from "../progress";

const m = (id: string, status: string, weight = 1) => ({ id, title: id.toUpperCase(), status, weight });

describe("tasksProgress", () => {
  it("returns null with no tasks instead of 0%", () => {
    const r = tasksProgress([]);
    expect(r.percent).toBeNull();
    expect(r.explanation).toMatch(/No tasks/);
  });

  it("excludes cancelled tasks and subtasks", () => {
    const r = tasksProgress([
      { status: "done" },
      { status: "todo" },
      { status: "cancelled" },
      { status: "done", parentTaskId: "x" },
      { status: "todo", parentTaskId: "x" },
    ]);
    expect(r.percent).toBe(50);
    expect(r.parts[0]).toEqual({ label: "Tasks", done: 1, total: 2 });
  });
});

describe("weightedMilestoneProgress", () => {
  it("weights milestones", () => {
    const r = weightedMilestoneProgress([m("a", "done", 3), m("b", "pending", 1)]);
    expect(r.percent).toBe(75);
    expect(r.explanation).toContain("1 of 2 milestones done");
    expect(r.explanation).toContain("weighted 3/4");
  });

  it("gives partial credit from linked tasks only", () => {
    const r = weightedMilestoneProgress(
      [m("a", "done"), m("b", "in_progress"), m("c", "in_progress")],
      [
        { status: "done", milestoneId: "b" },
        { status: "todo", milestoneId: "b" },
        { status: "cancelled", milestoneId: "b" },
      ],
    );
    // a = 1, b = 0.5, c (in progress, no tasks) = 0 → 1.5 / 3
    expect(r.percent).toBe(50);
    expect(r.explanation).toContain("partial credit");
  });

  it("returns null with no milestones", () => {
    expect(weightedMilestoneProgress([]).percent).toBeNull();
  });
});

describe("projectProgress", () => {
  it("falls back to tasks when no milestones exist", () => {
    const r = projectProgress("milestones", [], [{ status: "done" }, { status: "todo" }, { status: "todo" }, { status: "done" }]);
    expect(r.percent).toBe(50);
    expect(r.explanation).toMatch(/No milestones yet/);
  });

  it("returns null when there is nothing to measure", () => {
    expect(projectProgress("milestones", [], []).percent).toBeNull();
  });

  it("respects tasks mode even with milestones", () => {
    const r = projectProgress("tasks", [m("a", "done")], [{ status: "todo" }]);
    expect(r.percent).toBe(0);
  });
});

describe("goalProgress", () => {
  it("averages targets capped at 100", () => {
    const r = goalProgress("targets", [], [], [
      { title: "Study", percent: 150 },
      { title: "Reading", percent: 50 },
    ]);
    expect(r.percent).toBe(75);
  });

  it("null when targets mode has no targets", () => {
    expect(goalProgress("targets", [m("a", "done")], [], []).percent).toBeNull();
  });

  it("uses milestones by default", () => {
    expect(goalProgress("milestones", [m("a", "done"), m("b", "pending")], [], []).percent).toBe(50);
  });
});

describe("skillProgress", () => {
  it("counts only completed topics", () => {
    const r = skillProgress([
      { title: "Syntax", status: "done" },
      { title: "OOP", status: "done" },
      { title: "Coroutines", status: "learning" },
      { title: "Flow", status: "not_started" },
    ]);
    expect(r.percent).toBe(50);
    expect(r.explanation).toContain("1 in progress");
  });

  it("null without topics", () => {
    expect(skillProgress([]).percent).toBeNull();
  });
});

describe("todayProgress", () => {
  it("prefers daily targets", () => {
    const r = todayProgress([75, 100, 200], { done: 0, scheduled: 4 });
    expect(r.method).toBe("daily_targets");
    expect(r.percent).toBeCloseTo(91.7, 1);
  });

  it("falls back to routine", () => {
    const r = todayProgress([], { done: 2, scheduled: 5 });
    expect(r.method).toBe("routine");
    expect(r.percent).toBe(40);
  });

  it("null when nothing is planned", () => {
    expect(todayProgress([], { done: 0, scheduled: 0 }).percent).toBeNull();
  });
});
