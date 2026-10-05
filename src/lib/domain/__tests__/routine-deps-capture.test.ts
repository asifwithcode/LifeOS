import { describe, expect, it } from "vitest";
import { findOverlaps, itemsForDate, resolveTemplateForDate, slotState } from "../routine";
import { isBlocked, wouldCreateCycle, type DepEdge } from "../dependencies";
import { classifyByRules, extractTags } from "../capture";
import { entityTypeForRef, extractRefMentions, formatRef, parseRef } from "../refs";

const tpl = (id: string, weekdays: number[], isDefault = false, archived = false) => ({
  id,
  weekdays,
  isDefault,
  archivedAt: archived ? new Date() : null,
  sortOrder: 0,
});

describe("routine resolution", () => {
  const templates = [tpl("normal", [], true), tpl("uni", [1, 2, 3, 4]), tpl("weekend", [0, 6]), tpl("old", [5], false, true)];

  it("uses the override first", () => {
    expect(resolveTemplateForDate("2026-10-05", templates, "weekend")).toMatchObject({ reason: "override", template: { id: "weekend" } });
  });
  it("then weekday templates", () => {
    expect(resolveTemplateForDate("2026-10-05", templates).template?.id).toBe("uni"); // Monday
    expect(resolveTemplateForDate("2026-10-10", templates).template?.id).toBe("weekend"); // Saturday
  });
  it("falls back to default, ignoring archived", () => {
    expect(resolveTemplateForDate("2026-10-09", templates)).toMatchObject({ reason: "default", template: { id: "normal" } }); // Friday
  });
  it("none when nothing applies", () => {
    expect(resolveTemplateForDate("2026-10-09", [tpl("uni", [1])]).reason).toBe("none");
  });

  it("filters items by weekday and sorts by time", () => {
    const items = [
      { id: "b", templateId: "t", startTime: "19:30", durationMinutes: 60, daysOfWeek: null, archivedAt: null },
      { id: "a", templateId: "t", startTime: "07:00", durationMinutes: 30, daysOfWeek: [1, 3], archivedAt: null },
      { id: "c", templateId: "t", startTime: "08:00", durationMinutes: 30, daysOfWeek: [2], archivedAt: null },
      { id: "d", templateId: "t", startTime: "09:00", durationMinutes: 30, daysOfWeek: null, archivedAt: new Date() },
      { id: "e", templateId: "x", startTime: "09:00", durationMinutes: 30, daysOfWeek: null, archivedAt: null },
    ];
    expect(itemsForDate("2026-10-05", "t", items).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("computes slot state", () => {
    const item = { startTime: "09:00", durationMinutes: 60 };
    expect(slotState(item, null, 9 * 60 + 30, true, false)).toBe("now");
    expect(slotState(item, null, 8 * 60, true, false)).toBe("upcoming");
    expect(slotState(item, null, 11 * 60, true, false)).toBe("missed");
    expect(slotState(item, "done", 11 * 60, true, false)).toBe("done");
    expect(slotState(item, null, 0, false, true)).toBe("missed");
  });

  it("finds overlaps", () => {
    expect(
      findOverlaps([
        { id: "a", startTime: "09:00", durationMinutes: 60 },
        { id: "b", startTime: "09:30", durationMinutes: 30 },
        { id: "c", startTime: "10:00", durationMinutes: 30 },
      ]),
    ).toEqual([["a", "b"]]);
  });
});

describe("dependencies", () => {
  const e = (blocked: string, blocker: string): DepEdge => ({ blockedType: "task", blockedId: blocked, blockerType: "task", blockerId: blocker });

  it("detects direct and transitive cycles", () => {
    // Ktor waits on Coroutines; API waits on Ktor
    const edges = [e("ktor", "coroutines"), e("api", "ktor")];
    expect(wouldCreateCycle(edges, e("coroutines", "api"))).toBe(true);
    expect(wouldCreateCycle(edges, e("ktor", "api"))).toBe(true);
    expect(wouldCreateCycle(edges, e("api", "coroutines"))).toBe(false);
    expect(wouldCreateCycle(edges, e("x", "x"))).toBe(true);
  });

  it("distinguishes node types", () => {
    const edges: DepEdge[] = [{ blockedType: "milestone", blockedId: "1", blockerType: "task", blockerId: "1" }];
    expect(wouldCreateCycle(edges, { blockedType: "task", blockedId: "1", blockerType: "milestone", blockerId: "1" })).toBe(true);
    expect(wouldCreateCycle(edges, { blockedType: "task", blockedId: "2", blockerType: "milestone", blockerId: "1" })).toBe(false);
  });

  it("blocked while any blocker is open", () => {
    expect(isBlocked([{ id: "a", type: "task", done: true }, { id: "b", type: "task", done: false }])).toBe(true);
    expect(isBlocked([{ id: "a", type: "task", done: true }])).toBe(false);
    expect(isBlocked([])).toBe(false);
  });
});

describe("capture classifier (rules)", () => {
  const ctx = { projects: [{ id: "p1", title: "MAYA" }, { id: "p2", title: "LifeOS" }] };

  it("classifies the spec example as a task for MAYA", () => {
    const s = classifyByRules("Try offline wake-word detection on ESP32-S3 for MAYA #esp32 #voice", ctx);
    expect(s.type).toBe("task");
    expect(s.projectId).toBe("p1");
    expect(s.tags).toEqual(["esp32", "voice"]);
    expect(s.priority).toBe("medium");
    expect(s.source).toBe("rules");
    expect(s.title).toBe("Try offline wake-word detection on ESP32-S3 for MAYA");
  });

  it("detects ideas, notes, goals, resources", () => {
    expect(classifyByRules("What if an app that tracks plant watering?", ctx).type).toBe("idea");
    expect(classifyByRules("TIL: interrupts pause normal CPU execution", ctx).type).toBe("note");
    expect(classifyByRules("Goal: study abroad by 2027", ctx).type).toBe("goal");
    expect(classifyByRules("https://docs.espressif.com/projects/esp-idf", ctx).type).toBe("resource");
  });

  it("reads priority and due hints", () => {
    const s = classifyByRules("Submit the assignment tomorrow !high", ctx);
    expect(s.type).toBe("task");
    expect(s.priority).toBe("high");
    expect(s.dueHint).toBe("tomorrow");
  });

  it("does not match project names inside other words", () => {
    const s = classifyByRules("Buy mayonnaise", ctx);
    expect(s.projectId).toBeNull();
  });

  it("extracts unique lower-case tags", () => {
    expect(extractTags("#ESP32 and #esp32 and #Voice")).toEqual(["esp32", "voice"]);
  });
});

describe("refs", () => {
  it("formats and parses", () => {
    expect(formatRef("PRJ", 1)).toBe("PRJ-0001");
    expect(formatRef("TSK", 12345)).toBe("TSK-12345");
    expect(parseRef("prj-0003")).toEqual({ prefix: "PRJ", number: 3 });
    expect(parseRef("nope")).toBeNull();
    expect(entityTypeForRef("SKL-0002")).toBe("skill");
    expect(entityTypeForRef("ZZZ-0002")).toBeNull();
  });

  it("extracts [[REF]] mentions", () => {
    expect(extractRefMentions("See [[PRJ-0003]] and [[skl-0001]], again [[PRJ-0003]]. Not [PRJ-0004].")).toEqual(["PRJ-0003", "SKL-0001"]);
  });
});
