import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { PRIORITY_RANK, type Priority, type TaskStatus } from "@/lib/domain/constants";
import { addDays, type ISODate } from "@/lib/domain/dates";
import { isBlocked, wouldCreateCycle, type DepEdge } from "@/lib/domain/dependencies";
import { nextOccurrenceOnOrAfter } from "@/lib/domain/recurrence";
import type { TaskInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { dependencies, goals, lifeAreas, milestones, projects, skills, tasks, workSessions, type Task } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { todayOf, nowOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned, changedFields, inTx } from "./_shared";
import { getTagsFor, setEntityTags } from "./tags";

export const TASK_VIEWS = ["today", "upcoming", "overdue", "someday", "completed", "all", "archived", "trash"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

async function loadOwned(tx: Tx, actor: Actor, id: string): Promise<Task> {
  const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, actor.userId))).limit(1);
  if (!row) notFound("Task");
  return row;
}

async function reindex(tx: Tx, actor: Actor, t: Task) {
  if (t.deletedAt) return removeFromIndex(tx, actor.userId, "task", t.id);
  await indexEntity(tx, actor.userId, {
    entityType: "task",
    entityId: t.id,
    ref: t.ref,
    title: t.title,
    body: t.description,
    archived: !!t.archivedAt || t.status === "done" || t.status === "cancelled",
  });
}

function normaliseInput(input: TaskInput) {
  return {
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.someday ? null : input.dueDate,
    startDate: input.startDate,
    someday: input.someday,
    estimatedMinutes: input.estimatedMinutes,
    recurrence: input.recurrence ? { ...input.recurrence, byWeekday: input.recurrence.byWeekday ?? [] } : null,
    parentTaskId: input.parentTaskId,
    projectId: input.projectId,
    goalId: input.goalId,
    skillId: input.skillId,
    milestoneId: input.milestoneId,
    lifeAreaId: input.lifeAreaId,
  };
}

async function validateLinks(tx: Tx, actor: Actor, input: ReturnType<typeof normaliseInput>, selfId?: string) {
  await assertOwned(tx, actor.userId, {
    parentTaskId: input.parentTaskId,
    projectId: input.projectId,
    goalId: input.goalId,
    skillId: input.skillId,
    milestoneId: input.milestoneId,
    lifeAreaId: input.lifeAreaId,
  });
  if (input.recurrence && !input.dueDate) throw new DomainError("Recurring tasks need a due date");
  if (selfId && input.parentTaskId) {
    if (input.parentTaskId === selfId) throw new DomainError("A task can't be its own subtask");
    // Only one level of nesting keeps lists and progress maths simple.
    const [childCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.parentTaskId, selfId));
    if (childCount.n > 0) throw new DomainError("A task with subtasks can't become a subtask");
  }
  if (input.parentTaskId) {
    const [parent] = await tx.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, input.parentTaskId));
    if (parent?.parentTaskId) throw new DomainError("Subtasks can't have their own subtasks");
  }
}

export async function createTask(actor: Actor, input: TaskInput, outer?: Tx): Promise<Task> {
  return inTx(outer, async (tx) => {
    const values = normaliseInput(input);
    await validateLinks(tx, actor, values);
    if (values.parentTaskId) {
      // Subtasks inherit the parent's context unless set explicitly.
      const parent = await loadOwned(tx, actor, values.parentTaskId);
      values.projectId ??= parent.projectId;
      values.goalId ??= parent.goalId;
      values.skillId ??= parent.skillId;
      values.lifeAreaId ??= parent.lifeAreaId;
    }
    if (values.milestoneId && !values.projectId) {
      const [m] = await tx.select({ projectId: milestones.projectId, goalId: milestones.goalId }).from(milestones).where(eq(milestones.id, values.milestoneId));
      values.projectId ??= m?.projectId ?? null;
      values.goalId ??= m?.goalId ?? null;
    }
    const ref = await nextRef(tx, actor.userId, "task");
    const status: TaskStatus = input.status === "done" ? "todo" : input.status;
    const [row] = await tx
      .insert(tasks)
      .values({ ...values, userId: actor.userId, ref, status, seriesId: values.recurrence ? sql`gen_random_uuid()` : null })
      .returning();
    await setEntityTags(tx, actor.userId, "task", row.id, input.tags);
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, {
      type: "task.created",
      entityType: "task",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { projectId: row.projectId, parentTaskId: row.parentTaskId },
    });
    if (input.status === "done") return setTaskStatus(actor, row.id, "done", tx).then((r) => r.task);
    return row;
  });
}

export async function updateTask(actor: Actor, id: string, input: TaskInput): Promise<Task> {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    const values = normaliseInput(input);
    await validateLinks(tx, actor, values, id);
    const changed = changedFields(before as unknown as Record<string, unknown>, values);
    const [row] = await tx
      .update(tasks)
      .set({ ...values, seriesId: values.recurrence ? (before.seriesId ?? sql`gen_random_uuid()`) : before.seriesId, updatedAt: nowOf(actor) })
      .where(eq(tasks.id, id))
      .returning();
    await setEntityTags(tx, actor.userId, "task", id, input.tags);
    if (changed.length) {
      await recordEvent(tx, actor, { type: "task.updated", entityType: "task", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { changed } });
    }
    let result = row;
    if (input.status !== before.status) result = (await setTaskStatus(actor, id, input.status, tx)).task;
    else await reindex(tx, actor, row);
    return result;
  });
}

export interface StatusChangeResult {
  task: Task;
  nextInstance: Task | null;
}

/** Changes status; completing a recurring task spawns the next instance. */
export async function setTaskStatus(actor: Actor, id: string, status: TaskStatus, outer?: Tx): Promise<StatusChangeResult> {
  return inTx(outer, async (tx) => {
    const before = await loadOwned(tx, actor, id);
    if (before.status === status) return { task: before, nextInstance: null };
    const now = nowOf(actor);
    const completing = status === "done";
    const [row] = await tx
      .update(tasks)
      .set({ status, completedAt: completing ? now : null, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    await reindex(tx, actor, row);

    let nextInstance: Task | null = null;
    if (completing) {
      await recordEvent(tx, actor, {
        type: "task.completed",
        entityType: "task",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        payload: {
          projectId: row.projectId,
          goalId: row.goalId,
          skillId: row.skillId,
          lifeAreaId: row.lifeAreaId,
          estimatedMinutes: row.estimatedMinutes,
        },
      });
      if (row.recurrence && row.dueDate) {
        const nextDue = nextOccurrenceOnOrAfter(row.recurrence, row.dueDate, addDays(todayOf(actor), 0));
        const ref = await nextRef(tx, actor.userId, "task");
        const [inst] = await tx
          .insert(tasks)
          .values({
            userId: actor.userId,
            ref,
            title: row.title,
            description: row.description,
            priority: row.priority,
            dueDate: nextDue,
            startDate: null,
            estimatedMinutes: row.estimatedMinutes,
            recurrence: row.recurrence,
            seriesId: row.seriesId,
            parentTaskId: row.parentTaskId,
            projectId: row.projectId,
            goalId: row.goalId,
            skillId: row.skillId,
            milestoneId: row.milestoneId,
            lifeAreaId: row.lifeAreaId,
            routineItemId: row.routineItemId,
          })
          .returning();
        const tagMap = await getTagsFor(actor.userId, "task", [row.id]);
        await setEntityTags(tx, actor.userId, "task", inst.id, tagMap.get(row.id) ?? []);
        await reindex(tx, actor, inst);
        await recordEvent(tx, actor, {
          type: "task.created",
          entityType: "task",
          entityId: inst.id,
          entityRef: inst.ref,
          entityTitle: inst.title,
          payload: { recurrenceOf: row.id, dueDate: nextDue },
        });
        // Stop the completed instance from spawning again if it's reopened and re-completed.
        await tx.update(tasks).set({ recurrence: null }).where(eq(tasks.id, row.id));
        nextInstance = inst;
      }
    } else if (before.status === "done") {
      await recordEvent(tx, actor, { type: "task.reopened", entityType: "task", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { status } });
    } else {
      await recordEvent(tx, actor, {
        type: "task.updated",
        entityType: "task",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        payload: { changed: ["status"], status },
      });
    }
    return { task: row, nextInstance };
  });
}

export async function setTaskArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(tasks).set({ archivedAt: archived ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(tasks.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "task.archived" : "task.restored", entityType: "task", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function setTaskDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const now = nowOf(actor);
    const [row] = await tx.update(tasks).set({ deletedAt: deleted ? now : null, updatedAt: now }).where(eq(tasks.id, id)).returning();
    // Subtasks follow their parent into / out of the trash.
    const children = await tx
      .update(tasks)
      .set({ deletedAt: deleted ? now : null, updatedAt: now })
      .where(and(eq(tasks.parentTaskId, id), deleted ? isNull(tasks.deletedAt) : isNotNull(tasks.deletedAt)))
      .returning();
    for (const t of [row, ...children]) await reindex(tx, actor, t);
    await recordEvent(tx, actor, { type: deleted ? "task.deleted" : "task.restored", entityType: "task", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

// ── Dependencies ──

export async function addTaskDependency(actor: Actor, taskId: string, blockerTaskId: string) {
  return db.transaction(async (tx) => {
    const blocked = await loadOwned(tx, actor, taskId);
    const blocker = await loadOwned(tx, actor, blockerTaskId);
    const existing = await tx.select().from(dependencies).where(eq(dependencies.userId, actor.userId));
    const edge: DepEdge = { blockedType: "task", blockedId: blocked.id, blockerType: "task", blockerId: blocker.id };
    if (wouldCreateCycle(existing as DepEdge[], edge)) throw new DomainError(`That would create a circular dependency between ${blocked.ref} and ${blocker.ref}`, "conflict");
    await tx.insert(dependencies).values({ userId: actor.userId, ...edge }).onConflictDoNothing();
    await recordEvent(tx, actor, {
      type: "task.updated",
      entityType: "task",
      entityId: blocked.id,
      entityRef: blocked.ref,
      entityTitle: blocked.title,
      payload: { changed: ["dependencies"], addedBlocker: blocker.ref },
    });
  });
}

export async function removeTaskDependency(actor: Actor, taskId: string, blockerTaskId: string) {
  await db
    .delete(dependencies)
    .where(
      and(
        eq(dependencies.userId, actor.userId),
        eq(dependencies.blockedType, "task"),
        eq(dependencies.blockedId, taskId),
        eq(dependencies.blockerType, "task"),
        eq(dependencies.blockerId, blockerTaskId),
      ),
    );
}

// ── Queries ──

export interface TaskListItem extends Task {
  projectTitle: string | null;
  projectRef: string | null;
  goalTitle: string | null;
  skillName: string | null;
  lifeAreaName: string | null;
  lifeAreaColor: string | null;
  tags: string[];
  subtaskTotal: number;
  subtaskDone: number;
  blocked: boolean;
  openBlockerRefs: string[];
}

export interface TaskFilters {
  view?: TaskView;
  projectId?: string;
  goalId?: string;
  skillId?: string;
  milestoneId?: string;
  lifeAreaId?: string;
  parentTaskId?: string | null;
  priority?: Priority;
  tag?: string;
  q?: string;
  limit?: number;
  includeSubtasks?: boolean;
}

function viewConditions(view: TaskView, today: ISODate): SQL[] {
  const open = inArray(tasks.status, ["todo", "in_progress"]);
  switch (view) {
    case "today":
      return [open, isNull(tasks.archivedAt), or(lte(tasks.dueDate, today), lte(tasks.startDate, today), eq(tasks.status, "in_progress"))!];
    case "upcoming":
      return [open, isNull(tasks.archivedAt), gt(tasks.dueDate, today)];
    case "overdue":
      return [open, isNull(tasks.archivedAt), lt(tasks.dueDate, today)];
    case "someday":
      return [open, isNull(tasks.archivedAt), or(eq(tasks.someday, true), and(isNull(tasks.dueDate), isNull(tasks.startDate)))!];
    case "completed":
      return [inArray(tasks.status, ["done", "cancelled"]), isNull(tasks.archivedAt)];
    case "archived":
      return [isNotNull(tasks.archivedAt)];
    case "all":
      return [isNull(tasks.archivedAt)];
    default:
      return [];
  }
}

export async function listTasks(actor: Actor, f: TaskFilters = {}): Promise<TaskListItem[]> {
  const today = todayOf(actor);
  const view = f.view ?? "all";
  const conds: SQL[] = [eq(tasks.userId, actor.userId)];
  conds.push(view === "trash" ? isNotNull(tasks.deletedAt) : isNull(tasks.deletedAt));
  conds.push(...viewConditions(view, today));
  if (f.projectId) conds.push(eq(tasks.projectId, f.projectId));
  if (f.goalId) conds.push(eq(tasks.goalId, f.goalId));
  if (f.skillId) conds.push(eq(tasks.skillId, f.skillId));
  if (f.milestoneId) conds.push(eq(tasks.milestoneId, f.milestoneId));
  if (f.lifeAreaId) conds.push(eq(tasks.lifeAreaId, f.lifeAreaId));
  if (f.priority) conds.push(eq(tasks.priority, f.priority));
  if (f.parentTaskId) conds.push(eq(tasks.parentTaskId, f.parentTaskId));
  else if (!f.includeSubtasks) conds.push(isNull(tasks.parentTaskId));
  if (f.q) conds.push(sql`${tasks.title} ILIKE ${"%" + f.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"}`);
  if (f.tag) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'task' AND et.entity_id = ${tasks.id} AND tg.name = ${f.tag.toLowerCase()})`,
    );
  }

  const order =
    view === "completed"
      ? [desc(tasks.completedAt)]
      : view === "trash" || view === "archived"
        ? [desc(tasks.updatedAt)]
        : [sql`${tasks.dueDate} ASC NULLS LAST`, sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`, asc(tasks.sortOrder), asc(tasks.createdAt)];

  const rows = await db
    .select({
      task: tasks,
      projectTitle: projects.title,
      projectRef: projects.ref,
      goalTitle: goals.title,
      skillName: skills.name,
      lifeAreaName: lifeAreas.name,
      lifeAreaColor: lifeAreas.color,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .leftJoin(skills, eq(skills.id, tasks.skillId))
    .leftJoin(lifeAreas, eq(lifeAreas.id, tasks.lifeAreaId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(Math.min(f.limit ?? 300, 1000));

  return enrich(actor, rows.map((r) => ({ ...r.task, projectTitle: r.projectTitle, projectRef: r.projectRef, goalTitle: r.goalTitle, skillName: r.skillName, lifeAreaName: r.lifeAreaName, lifeAreaColor: r.lifeAreaColor })));
}

async function enrich<T extends Task>(actor: Actor, list: T[]): Promise<(T & { tags: string[]; subtaskTotal: number; subtaskDone: number; blocked: boolean; openBlockerRefs: string[] })[]> {
  const ids = list.map((t) => t.id);
  if (ids.length === 0) return [];
  const [tagMap, subCounts, blockers] = await Promise.all([
    getTagsFor(actor.userId, "task", ids),
    db
      .select({
        parentTaskId: tasks.parentTaskId,
        total: sql<number>`count(*) FILTER (WHERE ${tasks.status} <> 'cancelled')::int`,
        done: sql<number>`count(*) FILTER (WHERE ${tasks.status} = 'done')::int`,
      })
      .from(tasks)
      .where(and(inArray(tasks.parentTaskId, ids), isNull(tasks.deletedAt)))
      .groupBy(tasks.parentTaskId),
    db
      .select({ blockedId: dependencies.blockedId, ref: tasks.ref, status: tasks.status })
      .from(dependencies)
      .innerJoin(tasks, and(eq(tasks.id, dependencies.blockerId), eq(dependencies.blockerType, "task")))
      .where(and(eq(dependencies.userId, actor.userId), eq(dependencies.blockedType, "task"), inArray(dependencies.blockedId, ids), isNull(tasks.deletedAt))),
  ]);
  const subMap = new Map(subCounts.map((s) => [s.parentTaskId!, s]));
  const blockMap = new Map<string, { ref: string; done: boolean }[]>();
  for (const b of blockers) {
    const l = blockMap.get(b.blockedId) ?? [];
    l.push({ ref: b.ref, done: b.status === "done" || b.status === "cancelled" });
    blockMap.set(b.blockedId, l);
  }
  return list.map((t) => {
    const bl = blockMap.get(t.id) ?? [];
    return {
      ...t,
      tags: tagMap.get(t.id) ?? [],
      subtaskTotal: subMap.get(t.id)?.total ?? 0,
      subtaskDone: subMap.get(t.id)?.done ?? 0,
      blocked: isBlocked(bl.map((b) => ({ id: b.ref, type: "task" as const, done: b.done }))),
      openBlockerRefs: bl.filter((b) => !b.done).map((b) => b.ref),
    };
  });
}

export async function getTaskByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, actor.userId), eq(tasks.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const [enriched] = await enrich(actor, [row]);

  const [subtasks, blockerRows, blockingRows, sessionAgg, ctx] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, row.id), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),
    db
      .select({ id: tasks.id, ref: tasks.ref, title: tasks.title, status: tasks.status })
      .from(dependencies)
      .innerJoin(tasks, eq(tasks.id, dependencies.blockerId))
      .where(and(eq(dependencies.userId, actor.userId), eq(dependencies.blockedType, "task"), eq(dependencies.blockedId, row.id), eq(dependencies.blockerType, "task"), isNull(tasks.deletedAt))),
    db
      .select({ id: tasks.id, ref: tasks.ref, title: tasks.title, status: tasks.status })
      .from(dependencies)
      .innerJoin(tasks, eq(tasks.id, dependencies.blockedId))
      .where(and(eq(dependencies.userId, actor.userId), eq(dependencies.blockerType, "task"), eq(dependencies.blockerId, row.id), eq(dependencies.blockedType, "task"), isNull(tasks.deletedAt))),
    db
      .select({ minutes: sql<number>`coalesce(sum(${workSessions.durationMinutes}), 0)::int`, count: sql<number>`count(*)::int` })
      .from(workSessions)
      .where(and(eq(workSessions.taskId, row.id), isNull(workSessions.deletedAt))),
    db
      .select({
        projectTitle: projects.title,
        projectRef: projects.ref,
        goalTitle: goals.title,
        goalRef: goals.ref,
        skillName: skills.name,
        skillRef: skills.ref,
        milestoneTitle: milestones.title,
        lifeAreaName: lifeAreas.name,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(goals, eq(goals.id, tasks.goalId))
      .leftJoin(skills, eq(skills.id, tasks.skillId))
      .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .leftJoin(lifeAreas, eq(lifeAreas.id, tasks.lifeAreaId))
      .where(eq(tasks.id, row.id)),
  ]);

  let parent: { ref: string; title: string } | null = null;
  if (row.parentTaskId) {
    const [p] = await db.select({ ref: tasks.ref, title: tasks.title }).from(tasks).where(eq(tasks.id, row.parentTaskId));
    parent = p ?? null;
  }

  return {
    task: enriched,
    context: ctx[0],
    parent,
    subtasks,
    blockers: blockerRows,
    blocking: blockingRows,
    actualMinutes: sessionAgg[0]?.minutes ?? 0,
    sessionCount: sessionAgg[0]?.count ?? 0,
  };
}

/** Lightweight list for pickers (dependencies, session links). */
export async function listOpenTaskOptions(actor: Actor, excludeId?: string) {
  const conds = [eq(tasks.userId, actor.userId), isNull(tasks.deletedAt), isNull(tasks.archivedAt), ne(tasks.status, "cancelled")];
  if (excludeId) conds.push(ne(tasks.id, excludeId));
  return db
    .select({ id: tasks.id, ref: tasks.ref, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(...conds))
    .orderBy(desc(tasks.updatedAt))
    .limit(300);
}

/** Top priorities: open tasks due today/overdue/in progress, ranked by priority then due date. */
export async function topPriorities(actor: Actor, limit = 5) {
  const list = await listTasks(actor, { view: "today" });
  return list
    .filter((t) => !t.blocked)
    .sort((a, b) => {
      const pr = PRIORITY_RANK[b.priority as Priority] - PRIORITY_RANK[a.priority as Priority];
      if (pr) return pr;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    })
    .slice(0, limit);
}

/** Tasks completed in a local date range, for task-count targets. */
export async function completedTasksInRange(actor: Actor, from: ISODate, to: ISODate) {
  const localDate = sql<string>`to_char((${tasks.completedAt} AT TIME ZONE ${actor.timezone})::date, 'YYYY-MM-DD')`;
  return db
    .select({ projectId: tasks.projectId, lifeAreaId: tasks.lifeAreaId, skillId: tasks.skillId, localDate })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, actor.userId),
        eq(tasks.status, "done"),
        isNull(tasks.deletedAt),
        isNull(tasks.parentTaskId),
        isNotNull(tasks.completedAt),
        gte(sql`(${tasks.completedAt} AT TIME ZONE ${actor.timezone})::date`, from),
        lte(sql`(${tasks.completedAt} AT TIME ZONE ${actor.timezone})::date`, to),
      ),
    );
}
