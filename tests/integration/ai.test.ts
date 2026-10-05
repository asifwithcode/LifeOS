import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { aiActions, aiMessages, goals, milestones, tasks, targets, userSettings } from "@/server/db/schema";
import { approveAction, proposeAction, rejectAction } from "@/server/ai/action-service";
import { runChatTurn, type ChatEvent } from "@/server/ai/chat";
import { buildContext } from "@/server/ai/context";
import { resolvePrivacy } from "@/server/ai/privacy";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { setProviderForTests } from "@/server/ai/registry";
import { addMemory, setMemoryEnabled } from "@/server/services/memory";
import { createNote } from "@/server/services/notes";
import { createProject } from "@/server/services/projects";
import { getRoutineDay } from "@/server/services/routine";
import { createSkill } from "@/server/services/skills";
import { createTask, setTaskDeleted } from "@/server/services/tasks";
import { listAdjustments } from "@/server/services/adjustments";
import { baseProject, baseTask, makeActor, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => setProviderForTests(null));
afterAll(closeDb);

describe("AI action proposals", () => {
  it("refuses refs that don't exist or belong to someone else", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const pb = await createProject(b, { ...baseProject, title: "B's project" });
    await expect(proposeAction(a, { kind: "create_task", payload: { title: "x", projectRef: "PRJ-0099" } })).rejects.toThrow(/No item PRJ-0099/);
    // Same ref string exists for user B only.
    expect(pb.ref).toBe("PRJ-0001");
    await expect(proposeAction(a, { kind: "create_task", payload: { title: "x", projectRef: "PRJ-0001" } })).rejects.toThrow(/No item PRJ-0001/);
    await createTask(a, { ...baseTask, title: "A task" });
    await expect(proposeAction(a, { kind: "create_task", payload: { title: "x", skillRef: "SKL-0001" } })).rejects.toThrow();
    await expect(proposeAction(a, { kind: "link_entities", payload: { sourceRef: "TSK-0001", targetRef: "TSK-0002" } })).rejects.toThrow(/TSK-0002/);
  });

  it("records a proposal without changing data, then executes on approval exactly once", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const action = await proposeAction(actor, { kind: "create_task", payload: { title: "Order ESP32-S3 devkit", projectRef: p.ref, dueDate: "2026-10-07" } });
    expect(action.status).toBe("proposed");
    expect(await db.select().from(tasks).where(eq(tasks.userId, actor.userId))).toHaveLength(0);

    const r = await approveAction(actor, action.id);
    expect(r.created[0]).toMatchObject({ type: "task", ref: "TSK-0001", url: "/tasks/TSK-0001" });
    const [t] = await db.select().from(tasks).where(eq(tasks.userId, actor.userId));
    expect(t.projectId).toBe(p.id);
    expect(t.dueDate).toBe("2026-10-07");
    await expect(approveAction(actor, action.id)).rejects.toThrow(/already executed/);
  });

  it("saves a plan as goal + weighted milestones + tasks + targets", async () => {
    const actor = await makeActor();
    await createSkill(actor, { name: "ESP32", description: null, category: "technical", lifeAreaId: null, currentLevel: 1, targetLevel: 4, status: "active" });
    const action = await proposeAction(actor, {
      kind: "create_plan",
      payload: {
        title: "Learn ESP32 in 3 months",
        targetDate: "2027-01-05",
        milestones: [
          { title: "Month 1 — GPIO, UART, I2C", weight: 1, dueDate: "2026-11-05", tasks: [{ title: "Blink + button" }, { title: "UART logger", estimatedMinutes: 60 }] },
          { title: "Month 2 — FreeRTOS", weight: 2, tasks: [{ title: "Tasks and queues" }] },
          { title: "Month 3 — Project", weight: 3 },
        ],
        targets: [{ title: "ESP32 study", amount: 7, unit: "hours", period: "weekly", skillRef: "SKL-0001" }],
      },
    });
    const r = await approveAction(actor, action.id);
    const [g] = await db.select().from(goals).where(eq(goals.userId, actor.userId));
    expect(g.title).toBe("Learn ESP32 in 3 months");
    const ms = await db.select().from(milestones).where(eq(milestones.goalId, g.id));
    expect(ms.map((m) => m.weight).sort()).toEqual([1, 2, 3]);
    const ts = await db.select().from(tasks).where(eq(tasks.goalId, g.id));
    expect(ts).toHaveLength(3);
    expect(ts.every((t) => t.milestoneId)).toBe(true);
    const [tg] = await db.select().from(targets).where(eq(targets.userId, actor.userId));
    expect(tg.goalId).toBe(g.id);
    expect(tg.skillId).not.toBeNull();
    expect(r.created.map((c) => c.type)).toEqual(["goal", "target", "task"]);
  });

  it("allows editing before approval and re-validates the edit", async () => {
    const actor = await makeActor();
    const action = await proposeAction(actor, { kind: "create_task", payload: { title: "Draft" } });
    await expect(approveAction(actor, action.id, { title: "" })).rejects.toThrow();
    const [failed] = await db.select().from(aiActions).where(eq(aiActions.id, action.id));
    expect(failed.status).toBe("failed");
  });

  it("fails cleanly when a referenced item disappeared, without partial writes", async () => {
    const actor = await makeActor();
    const t = await createTask(actor, { ...baseTask, title: "Old" });
    const action = await proposeAction(actor, { kind: "update_task", payload: { ref: t.ref, status: "done" } });
    await setTaskDeleted(actor, t.id, true);
    await expect(approveAction(actor, action.id)).rejects.toThrow(/No item TSK-0001/);
    const [row] = await db.select().from(aiActions).where(eq(aiActions.id, action.id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/TSK-0001/);
  });

  it("rejects, and plans day blocks without touching templates", async () => {
    const actor = await makeActor();
    const a1 = await proposeAction(actor, { kind: "create_idea", payload: { title: "Nope" } });
    await rejectAction(actor, a1.id);
    await expect(approveAction(actor, a1.id)).rejects.toThrow(/already rejected/);
    const a2 = await proposeAction(actor, { kind: "add_routine_block", payload: { title: "Kotlin practice", startTime: "19:30", durationMinutes: 60, activityType: "coding" } });
    await approveAction(actor, a2.id);
    const adj = await listAdjustments(actor.userId, "2026-10-05");
    expect(adj).toHaveLength(1);
    const day = await getRoutineDay(actor, "2026-10-05");
    expect(day.slots).toHaveLength(0); // templates unchanged
  });
});

describe("AI context", () => {
  it("only includes modules the user allowed, and memory only when enabled", async () => {
    const actor = await makeActor();
    await createNote(actor, { title: "Secret journal-ish note about pairing", content: "BLE pairing details", collection: null, pinned: false, lifeAreaId: null, tags: [] });
    await createTask(actor, { ...baseTask, title: "Pairing test", dueDate: "2026-10-05" });
    await addMemory(actor, { content: "Prefers studying in the morning", kind: "preference" });

    const all = await buildContext(actor, "pairing", resolvePrivacy({}), false);
    expect(all.refs.map((r) => r.type)).toEqual(expect.arrayContaining(["note", "task"]));
    expect(all.text).not.toContain("Prefers studying");

    const noNotes = await buildContext(actor, "pairing", resolvePrivacy({ notes: false }), true);
    expect(noNotes.refs.some((r) => r.type === "note")).toBe(false);
    expect(noNotes.text).not.toContain("BLE pairing details");
    expect(noNotes.text).toContain("Prefers studying in the morning");
    expect(noNotes.text).toContain("not shared these modules with you: notes");
  });
});

describe("chat turn (test provider)", () => {
  it("persists messages, streams events and turns tool calls into proposals", async () => {
    setProviderForTests(createFakeProvider());
    const actor = await makeActor();
    await db.update(userSettings).set({ memoryEnabled: true }).where(eq(userSettings.userId, actor.userId));
    const events: ChatEvent[] = [];
    await runChatTurn(actor, { message: "task: Buy logic analyser", mode: "general" }, (e) => events.push(e));
    expect(events[0].type).toBe("start");
    const action = events.find((e) => e.type === "action");
    expect(action && action.type === "action" && action.action.summary).toBe("Create task “Buy logic analyser”");
    expect(events.at(-1)?.type).toBe("done");
    const start = events[0] as Extract<ChatEvent, { type: "start" }>;

    // Second turn replays history.
    const events2: ChatEvent[] = [];
    await runChatTurn(actor, { conversationId: start.conversationId, message: "hello" }, (e) => events2.push(e));
    const text = events2.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toContain("History: 2 message(s)");
    const msgs = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, start.conversationId));
    expect(msgs).toHaveLength(4);
    expect(msgs.every((m) => m.status === "complete")).toBe(true);
    expect(await db.select().from(tasks).where(eq(tasks.userId, actor.userId))).toHaveLength(0); // proposal only
    await setMemoryEnabled(actor.userId, false);
  });

  it("refuses mode-disallowed proposals and reports provider absence", async () => {
    setProviderForTests(createFakeProvider());
    const actor = await makeActor();
    const events: ChatEvent[] = [];
    // Coding mode can't propose memories: the tool reports an error and nothing is recorded.
    await runChatTurn(actor, { message: "remember: I like tabs", mode: "coding" }, (e) => events.push(e));
    expect(events.some((e) => e.type === "action")).toBe(false);
    const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toContain("not available in this mode");
    expect(await db.select().from(aiActions).where(eq(aiActions.userId, actor.userId))).toHaveLength(0);
    setProviderForTests(null);
    await expect(runChatTurn(actor, { message: "hi" }, () => {})).rejects.toThrow(/No AI provider/);
  });
});
