import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { activityEvents, lifeAreas, routineTemplates, userSettings, workSessions } from "@/server/db/schema";
import { listEvents } from "@/server/engines/activity";
import { listRelated } from "@/server/engines/relations";
import { search } from "@/server/engines/search";
import { createGoal, getGoalByRef, listGoals } from "@/server/services/goals";
import { bulkAccept, capture, convertInboxItem, discardInboxItems, listInbox } from "@/server/services/inbox";
import { addMilestone, setMilestoneStatus } from "@/server/services/milestones";
import { createNote, updateNote } from "@/server/services/notes";
import { convertIdeaToProject, createIdea, createProject, getIdeaByRef, getProjectByRef, listProjects } from "@/server/services/projects";
import {
  completeRoutineItem,
  createRoutineItem,
  getRoutineDay,
  listTemplates,
  resetRoutineItem,
  routineHistory,
  setDayPlan,
  updateTemplate,
} from "@/server/services/routine";
import { deleteSession, logSession } from "@/server/services/sessions";
import { addTopics, createSkill, getSkillByRef, setTopicStatus } from "@/server/services/skills";
import { createTarget, evaluateTargets, getTargetByRef } from "@/server/services/targets";
import {
  addTaskDependency,
  createTask,
  getTaskByRef,
  listTasks,
  setTaskDeleted,
  setTaskStatus,
} from "@/server/services/tasks";
import { authenticate } from "@/server/services/users";
import { exportUserData } from "@/server/services/export";
import { baseProject, baseSession, baseTarget, baseTask, makeActor, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("accounts", () => {
  it("seeds defaults on registration and authenticates", async () => {
    const actor = await makeActor();
    const areas = await db.select().from(lifeAreas).where(eq(lifeAreas.userId, actor.userId));
    const templates = await db.select().from(routineTemplates).where(eq(routineTemplates.userId, actor.userId));
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, actor.userId));
    expect(areas.length).toBeGreaterThan(3);
    expect(templates.filter((t) => t.isDefault)).toHaveLength(1);
    expect(settings.aiPrivacy?.journal).toBe(false);

    const [{ email }] = await db.query.users.findMany({ where: (u, { eq }) => eq(u.id, actor.userId) });
    expect(await authenticate(email, "correct horse battery")).not.toBeNull();
    expect(await authenticate(email, "wrong password!!")).toBeNull();
    expect(await authenticate("nobody@example.com", "whatever")).toBeNull();
  });
});

describe("tasks", () => {
  it("allocates human refs per user", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const t1 = await createTask(a, { ...baseTask, title: "One" });
    const t2 = await createTask(a, { ...baseTask, title: "Two" });
    const t3 = await createTask(b, { ...baseTask, title: "Other user" });
    expect([t1.ref, t2.ref, t3.ref]).toEqual(["TSK-0001", "TSK-0002", "TSK-0001"]);
  });

  it("completing emits an event and recurring tasks spawn the next instance", async () => {
    const actor = await makeActor();
    const t = await createTask(actor, { ...baseTask, title: "Weekly review", dueDate: "2026-10-05", recurrence: { freq: "weekly", interval: 1 } });
    const { task, nextInstance } = await setTaskStatus(actor, t.id, "done");
    expect(task.status).toBe("done");
    expect(nextInstance?.dueDate).toBe("2026-10-12");
    expect(nextInstance?.seriesId).toBe(t.seriesId);
    const events = await listEvents(actor.userId, { entity: { type: "task", id: t.id } });
    expect(events.map((e) => e.type)).toContain("task.completed");
    // Reopening and re-completing must not spawn a duplicate instance.
    await setTaskStatus(actor, t.id, "todo");
    const again = await setTaskStatus(actor, t.id, "done");
    expect(again.nextInstance).toBeNull();
  });

  it("subtasks inherit context and are excluded from top-level lists", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const parent = await createTask(actor, { ...baseTask, title: "BLE provisioning", projectId: p.id });
    const child = await createTask(actor, { ...baseTask, title: "Write GATT service", parentTaskId: parent.id });
    expect(child.projectId).toBe(p.id);
    const list = await listTasks(actor, { view: "all" });
    expect(list.map((t) => t.id)).toEqual([parent.id]);
    expect(list[0].subtaskTotal).toBe(1);
    await expect(createTask(actor, { ...baseTask, title: "Too deep", parentTaskId: child.id })).rejects.toThrow(/Subtasks can't/);
  });

  it("dependencies block tasks and reject cycles", async () => {
    const actor = await makeActor();
    const coroutines = await createTask(actor, { ...baseTask, title: "Learn Kotlin Coroutines" });
    const ktor = await createTask(actor, { ...baseTask, title: "Learn Ktor" });
    const api = await createTask(actor, { ...baseTask, title: "Build API" });
    await addTaskDependency(actor, ktor.id, coroutines.id);
    await addTaskDependency(actor, api.id, ktor.id);
    await expect(addTaskDependency(actor, coroutines.id, api.id)).rejects.toThrow(/circular/);

    let detail = await getTaskByRef(actor, api.ref);
    expect(detail?.task.blocked).toBe(true);
    expect(detail?.task.openBlockerRefs).toEqual([ktor.ref]);
    await setTaskStatus(actor, ktor.id, "done");
    detail = await getTaskByRef(actor, api.ref);
    expect(detail?.task.blocked).toBe(false);
  });

  it("refuses links to another user's rows and hides their data", async () => {
    const a = await makeActor();
    const b = await makeActor();
    const pa = await createProject(a, { ...baseProject, title: "Private" });
    await expect(createTask(b, { ...baseTask, title: "Sneaky", projectId: pa.id })).rejects.toThrow(/Project not found/);
    const ta = await createTask(a, { ...baseTask, title: "Mine" });
    expect(await getTaskByRef(b, ta.ref)).toBeNull();
    await expect(setTaskStatus(b, ta.id, "done")).rejects.toThrow(/not found/);
    expect(await search(b.userId, "Mine")).toHaveLength(0);
  });

  it("soft-deleted tasks leave search and come back on restore", async () => {
    const actor = await makeActor();
    const t = await createTask(actor, { ...baseTask, title: "Calibrate microphone array" });
    expect((await search(actor.userId, "calib")).map((h) => h.entityId)).toContain(t.id);
    expect((await search(actor.userId, t.ref))[0].entityId).toBe(t.id);
    await setTaskDeleted(actor, t.id, true);
    expect(await search(actor.userId, "calib")).toHaveLength(0);
    expect((await listTasks(actor, { view: "trash" })).map((x) => x.id)).toEqual([t.id]);
    await setTaskDeleted(actor, t.id, false);
    expect(await search(actor.userId, "microphone")).toHaveLength(1);
  });
});

describe("sessions → targets (enter once, use everywhere)", () => {
  it("one session updates daily and weekly targets, skill time and timeline", async () => {
    const actor = await makeActor();
    const kotlin = await createSkill(actor, { name: "Kotlin", description: null, category: "technical", lifeAreaId: null, currentLevel: 2, targetLevel: 4, status: "active" });
    const daily = await createTarget(actor, { ...baseTarget, title: "Coding", period: "daily", amount: 2, unit: "hours", activityType: "coding" });
    const weekly = await createTarget(actor, { ...baseTarget, title: "Kotlin practice", period: "weekly", amount: 300, unit: "minutes", skillId: kotlin.id });

    await logSession(actor, { ...baseSession, activityType: "coding", title: "Kotlin practice", date: "2026-10-05", durationMinutes: 60, skillId: kotlin.id });
    await logSession(actor, { ...baseSession, activityType: "coding", title: "Yesterday", date: "2026-10-04", durationMinutes: 45, skillId: kotlin.id });

    const evaluated = await evaluateTargets(actor);
    const d = evaluated.find((t) => t.id === daily.id)!;
    const w = evaluated.find((t) => t.id === weekly.id)!;
    expect(d.evaluation.actual).toBe(1); // hours, today only
    expect(d.summary).toBe("1h to go today.");
    expect(w.evaluation.actual).toBe(60); // week starts Monday 2026-10-05; Sunday excluded
    const skill = await getSkillByRef(actor, kotlin.ref);
    expect(skill?.totals.all.minutes).toBe(105);
    const events = await listEvents(actor.userId, { types: ["session.logged"] });
    expect(events).toHaveLength(2);
  });

  it("sessions on a task inherit its project; deleting a session removes its contribution", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const t = await createTask(actor, { ...baseTask, title: "Display UI", projectId: p.id });
    const target = await createTarget(actor, { ...baseTarget, title: "MAYA work", period: "weekly", amount: 5, unit: "hours", projectId: p.id });
    const s = await logSession(actor, { ...baseSession, activityType: "project", title: "UI work", date: "2026-10-05", durationMinutes: 90, taskId: t.id });
    expect(s.projectId).toBe(p.id);
    expect((await evaluateTargets(actor, { ids: [target.id] }))[0].evaluation.actual).toBe(1.5);
    const detail = await getTargetByRef(actor, target.ref);
    expect(detail?.sessions).toHaveLength(1);
    await deleteSession(actor, s.id);
    expect((await evaluateTargets(actor, { ids: [target.id] }))[0].evaluation.actual).toBe(0);
    expect((await getTaskByRef(actor, t.ref))?.actualMinutes).toBe(0);
  });

  it("quantity and task-count targets", async () => {
    const actor = await makeActor();
    const pages = await createTarget(actor, { ...baseTarget, title: "Reading", period: "daily", amount: 30, unit: "pages" });
    const doneTasks = await createTarget(actor, { ...baseTarget, title: "Tasks", period: "daily", amount: 3, unit: "tasks" });
    await logSession(actor, { ...baseSession, activityType: "reading", title: "Deep Work", date: "2026-10-05", quantity: 18, unit: "Pages" });
    const t = await createTask(actor, { ...baseTask, title: "Done thing" });
    await setTaskStatus(actor, t.id, "done");
    const res = await evaluateTargets(actor);
    expect(res.find((r) => r.id === pages.id)!.evaluation.actual).toBe(18);
    expect(res.find((r) => r.id === doneTasks.id)!.evaluation.actual).toBe(1);
  });
});

describe("routine", () => {
  it("resolves templates, completes blocks into sessions and keeps history", async () => {
    const actor = await makeActor();
    const templates = await listTemplates(actor.userId);
    const normal = templates.find((t) => t.isDefault)!;
    const exam = templates.find((t) => t.kind === "exam")!;
    const item = await createRoutineItem(actor, {
      templateId: normal.id,
      title: "Botany revision",
      startTime: "07:30",
      durationMinutes: 45,
      daysOfWeek: null,
      activityType: "study",
      lifeAreaId: null,
      priority: "medium",
      reminderMinutesBefore: null,
      goalId: null,
      skillId: null,
      projectId: null,
      logAsSession: true,
    });
    const study = await createTarget(actor, { ...baseTarget, title: "Study", period: "daily", amount: 4, unit: "hours", activityType: "study" });

    let day = await getRoutineDay(actor, "2026-10-05");
    expect(day.template?.id).toBe(normal.id);
    expect(day.slots).toHaveLength(1);
    expect(day.slots[0].state).toBe("missed"); // 07:30–08:15, now is 10:00 local

    await completeRoutineItem(actor, item.id, "2026-10-05");
    day = await getRoutineDay(actor, "2026-10-05");
    expect(day.slots[0].state).toBe("done");
    expect((await evaluateTargets(actor, { ids: [study.id] }))[0].evaluation.actual).toBe(0.75);

    await resetRoutineItem(actor, item.id, "2026-10-05");
    expect((await evaluateTargets(actor, { ids: [study.id] }))[0].evaluation.actual).toBe(0);
    const live = await db.select().from(workSessions).where(and(eq(workSessions.userId, actor.userId)));
    expect(live.every((s) => s.deletedAt !== null)).toBe(true);

    // A day-plan override switches template for one date only.
    await setDayPlan(actor, "2026-10-06", exam.id);
    expect((await getRoutineDay(actor, "2026-10-06")).reason).toBe("override");
    expect((await getRoutineDay(actor, "2026-10-07")).template?.id).toBe(normal.id);

    // Weekday assignment.
    await updateTemplate(actor, exam.id, { name: exam.name, kind: "exam", weekdays: [3], isDefault: false });
    expect((await getRoutineDay(actor, "2026-10-07")).template?.id).toBe(exam.id);

    await completeRoutineItem(actor, item.id, "2026-10-05");
    const history = await routineHistory(actor, 3);
    expect(history[0]).toMatchObject({ date: "2026-10-05", scheduled: 1, done: 1, actualMinutes: 45 });
    await expect(completeRoutineItem(actor, item.id, "2026-10-09")).rejects.toThrow(/future/);
  });
});

describe("projects, goals, ideas", () => {
  it("derives project progress from weighted milestones and tasks", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const m1 = await addMilestone(actor, { projectId: p.id }, { title: "Hardware prototype", description: null, weight: 2, dueDate: null });
    const m2 = await addMilestone(actor, { projectId: p.id }, { title: "BLE provisioning", description: null, weight: 2, dueDate: null });
    await setMilestoneStatus(actor, m1.id, "done");
    const t1 = await createTask(actor, { ...baseTask, title: "GATT", milestoneId: m2.id });
    await createTask(actor, { ...baseTask, title: "App flow", milestoneId: m2.id });
    await setTaskStatus(actor, t1.id, "done");
    const detail = await getProjectByRef(actor, p.ref);
    expect(detail?.progress.percent).toBe(75); // (2·1 + 2·0.5) / 4
    expect(detail?.progress.explanation).toContain("partial credit");
    expect((await listProjects(actor))[0].progress.percent).toBe(75);
  });

  it("goal progress from linked targets", async () => {
    const actor = await makeActor();
    const g = await createGoal(actor, { title: "Study abroad", description: null, why: null, lifeAreaId: null, status: "active", priority: "high", startDate: null, targetDate: "2027-09-01", progressMode: "targets" });
    await createTarget(actor, { ...baseTarget, title: "English", period: "daily", amount: 60, unit: "minutes", activityType: "language", goalId: g.id });
    await logSession(actor, { ...baseSession, activityType: "language", title: "Speaking", date: "2026-10-05", durationMinutes: 30 });
    expect((await getGoalByRef(actor, g.ref))?.progress.percent).toBe(50);
    expect((await listGoals(actor))[0].progress.percent).toBe(50);
  });

  it("converts an idea into a project without deleting it", async () => {
    const actor = await makeActor();
    const idea = await createIdea(actor, { title: "Offline voice assistant", description: "ESP32-S3 wake word", category: "hardware", status: "validated", lifeAreaId: null, tags: ["esp32"] });
    const project = await convertIdeaToProject(actor, idea.id);
    expect(project.sourceIdeaId).toBe(idea.id);
    const after = await getIdeaByRef(actor, idea.ref);
    expect(after?.status).toBe("building");
    expect(after?.projectRef).toBe(project.ref);
    const related = await listRelated(actor.userId, { type: "idea", id: idea.id });
    expect(related.map((r) => r.ref)).toContain(project.ref);
    await expect(convertIdeaToProject(actor, idea.id)).rejects.toThrow(/Already converted/);
  });
});

describe("notes, skills, inbox", () => {
  it("note [[REF]] mentions become backlinks", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const n = await createNote(actor, { title: "BLE security", content: `Pairing notes for [[${p.ref}]]`, collection: null, pinned: false, lifeAreaId: null, tags: [] });
    let backlinks = await listRelated(actor.userId, { type: "project", id: p.id });
    expect(backlinks).toMatchObject([{ direction: "incoming", relationType: "mentions", ref: n.ref }]);
    await updateNote(actor, n.id, { title: "BLE security", content: "No mentions now", collection: null, pinned: false, lifeAreaId: null, tags: [] });
    backlinks = await listRelated(actor.userId, { type: "project", id: p.id });
    expect(backlinks).toHaveLength(0);
  });

  it("skill progress comes from completed topics only", async () => {
    const actor = await makeActor();
    const s = await createSkill(actor, { name: "Kotlin", description: null, category: "technical", lifeAreaId: null, currentLevel: 2, targetLevel: 4, status: "active" }, ["Syntax", "OOP"]);
    await addTopics(actor, s.id, ["Coroutines", "Flow"]);
    const detail = await getSkillByRef(actor, s.ref);
    await setTopicStatus(actor, detail!.topics[0].id, "done");
    await setTopicStatus(actor, detail!.topics[2].id, "learning");
    expect((await getSkillByRef(actor, s.ref))?.progress.percent).toBe(25);
    const ev = await db.select().from(activityEvents).where(eq(activityEvents.type, "skill.topic_completed"));
    expect(ev).toHaveLength(1);
  });

  it("captures with a suggestion, converts with confirmation, bulk-accepts and discards", async () => {
    const actor = await makeActor();
    const p = await createProject(actor, { ...baseProject, title: "MAYA" });
    const item = await capture(actor, "Try offline wake-word detection on ESP32-S3 for MAYA #esp32");
    expect(item.suggestion).toMatchObject({ type: "task", projectId: p.id, tags: ["esp32"], source: "rules" });

    const result = await convertInboxItem(actor, item.id, { destination: "task", title: "Try offline wake-word detection", projectId: p.id, priority: "medium", dueDate: null, tags: ["esp32"] });
    expect(result.ref).toMatch(/^TSK-/);
    const task = await getTaskByRef(actor, result.ref);
    expect(task?.task.projectId).toBe(p.id);
    expect(task?.task.tags).toEqual(["esp32"]);
    await expect(convertInboxItem(actor, item.id, { destination: "note", title: "x", projectId: null, dueDate: null, tags: [] })).rejects.toThrow(/already processed/);

    const a = await capture(actor, "Idea: plant watering reminder app");
    const b = await capture(actor, "random thought about nothing");
    const results = await bulkAccept(actor, [a.id]);
    expect(results[0].entityType).toBe("idea");
    expect(await discardInboxItems(actor, [b.id])).toBe(1);
    expect(await listInbox(actor)).toHaveLength(0);
  });
});

describe("export", () => {
  it("exports every owned table for the user only", async () => {
    const a = await makeActor();
    const b = await makeActor();
    await createTask(a, { ...baseTask, title: "A's task" });
    await createTask(b, { ...baseTask, title: "B's task" });
    const dump = await exportUserData(a.userId);
    expect(dump.format).toBe("lifeos-export@1");
    expect((dump.data.tasks as { title: string }[]).map((t) => t.title)).toEqual(["A's task"]);
    expect(JSON.stringify(dump)).not.toContain("password");
  });
});
