import { describe, expect, it } from "vitest";
import { collectRefs, describeAction, validateAction } from "@/server/ai/actions";
import { allowedEntityTypes, canUse, resolvePrivacy } from "@/server/ai/privacy";
import { sanitizePlan } from "@/server/ai/planner";
import { prepareForEcho } from "@/server/ai/providers/anthropic";
import { AI_MODE_KEYS, modeAllows } from "@/server/ai/modes";
import { buildTools } from "@/server/ai/tools";

describe("AI action validation", () => {
  it("accepts a valid task proposal", () => {
    const v = validateAction("create_task", { title: "Order ESP32-S3 devkit", dueDate: "2026-10-07", projectRef: "PRJ-0001", priority: "high" });
    expect(v.ok).toBe(true);
  });

  it("rejects unknown kinds, bad dates, bad refs and extra-empty updates", () => {
    expect(validateAction("delete_everything", {}).ok).toBe(false);
    expect(validateAction("create_task", { title: "x", dueDate: "07/10/2026" }).ok).toBe(false);
    expect(validateAction("create_task", { title: "x", projectRef: "GOL-0001" }).ok).toBe(false);
    expect(validateAction("create_task", { title: "" }).ok).toBe(false);
    expect(validateAction("update_task", { ref: "TSK-0001" }).ok).toBe(false);
    expect(validateAction("log_session", { title: "Reading", activityType: "reading", quantity: 10 }).ok).toBe(false);
    expect(validateAction("create_plan", { title: "Learn ESP32", milestones: [] }).ok).toBe(false);
  });

  it("collects refs anywhere in the payload, ignoring free text", () => {
    expect(
      collectRefs({ title: "about PRJ-0001", projectRef: "PRJ-0001", milestones: [{ title: "m", tasks: [{ title: "t" }] }], targets: [{ skillRef: "SKL-0002" }] }).sort(),
    ).toEqual(["PRJ-0001", "SKL-0002"]);
  });

  it("describes plans for the preview card", () => {
    const d = describeAction("create_plan", {
      title: "Learn ESP32 in 3 months",
      milestones: [
        { title: "Month 1: basics", tasks: [{ title: "Blink" }, { title: "GPIO" }] },
        { title: "Month 2: FreeRTOS", tasks: [{ title: "Tasks & queues" }] },
      ],
      targets: [{ title: "ESP32 study", amount: 7, unit: "hours", period: "weekly" }],
    });
    expect(d.summary).toBe("Save plan “Learn ESP32 in 3 months” — goal with 2 milestones, 3 tasks, 1 target");
    expect(d.details).toContain("Target: ESP32 study — 7 hours weekly");
  });
});

describe("privacy", () => {
  it("defaults journal/finance off and maps entity types to modules", () => {
    const p = resolvePrivacy(null);
    expect(p.journal).toBe(false);
    expect(canUse(p, "note")).toBe(true);
    const noNotes = resolvePrivacy({ notes: false });
    expect(canUse(noNotes, "note")).toBe(false);
    expect(allowedEntityTypes(noNotes)).not.toContain("note");
    expect(canUse(p, "inbox_item")).toBe(false);
  });
});

describe("modes & tools", () => {
  it("limits proposal tools by mode and always offers read tools", () => {
    for (const m of AI_MODE_KEYS) {
      const names = buildTools(m).map((t) => t.name);
      expect(names).toContain("search_items");
      expect(names).toContain("get_item");
    }
    expect(modeAllows("research", "create_project")).toBe(false);
    expect(buildTools("general").length).toBeGreaterThan(buildTools("coding").length);
  });
});

describe("day plan sanitizer", () => {
  const plan = {
    summary: "",
    cautions: [],
    blocks: [
      { start: "09:00", durationMinutes: 60, title: "Past", reason: "" },
      { start: "11:00", durationMinutes: 60, title: "Overlaps routine", reason: "" },
      { start: "13:00", durationMinutes: 90, title: "Deep work", reason: "", taskRef: "TSK-0001" },
      { start: "14:00", durationMinutes: 30, title: "Overlaps previous", reason: "" },
      { start: "15:00", durationMinutes: 30, title: "Ghost task", reason: "", taskRef: "TSK-0999" },
      { start: "23:30", durationMinutes: 60, title: "Late", reason: "" },
    ],
  };
  it("keeps only valid future, non-overlapping blocks with known tasks", () => {
    const r = sanitizePlan(plan, [{ start: 11 * 60 + 30, end: 12 * 60 }], 10 * 60, new Set(["TSK-0001"]));
    expect(r.blocks.map((b) => b.title)).toEqual(["Deep work"]);
    expect(r.dropped).toHaveLength(5);
  });
});

describe("fallback echo", () => {
  it("drops declined-model blocks before the last fallback marker", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "text", text: "Partial " },
      { type: "tool_use", id: "t1", name: "x", input: {} },
      { type: "fallback", from: { model: "a" }, to: { model: "b" } },
      { type: "thinking", thinking: "", signature: "s2" },
      { type: "text", text: "continued" },
    ] as never;
    expect(prepareForEcho(content).map((b: { type: string }) => b.type)).toEqual(["text", "fallback", "thinking", "text"]);
    const plain = [{ type: "text", text: "hi" }] as never;
    expect(prepareForEcho(plain)).toBe(plain);
  });
});
