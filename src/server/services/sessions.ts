import "server-only";
import { and, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { SessionSource } from "@/lib/domain/constants";
import { zonedTimeToUtc, type ISODate } from "@/lib/domain/dates";
import type { SessionInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { lifeAreas, projects, skills, tasks, workSessions, type WorkSession } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { assertOwned, inTx } from "./_shared";

export interface LogSessionOptions {
  source?: SessionSource;
  routineItemId?: string | null;
}

/**
 * Logs effort once; targets, skills, projects, analytics and the timeline all read from it.
 * Context is inherited from the linked task / skill so a session on a task also counts
 * toward that task's project, skill and life area.
 */
export async function logSession(actor: Actor, input: SessionInput, opts: LogSessionOptions = {}, outer?: Tx): Promise<WorkSession> {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, {
      lifeAreaId: input.lifeAreaId,
      skillId: input.skillId,
      projectId: input.projectId,
      taskId: input.taskId,
      goalId: input.goalId,
      routineItemId: opts.routineItemId,
    });
    const links = {
      lifeAreaId: input.lifeAreaId,
      skillId: input.skillId,
      projectId: input.projectId,
      taskId: input.taskId,
      goalId: input.goalId,
    };
    if (links.taskId) {
      const [t] = await tx
        .select({ projectId: tasks.projectId, skillId: tasks.skillId, goalId: tasks.goalId, lifeAreaId: tasks.lifeAreaId })
        .from(tasks)
        .where(eq(tasks.id, links.taskId));
      if (t) {
        links.projectId ??= t.projectId;
        links.skillId ??= t.skillId;
        links.goalId ??= t.goalId;
        links.lifeAreaId ??= t.lifeAreaId;
      }
    }
    if (links.skillId && !links.lifeAreaId) {
      const [s] = await tx.select({ lifeAreaId: skills.lifeAreaId }).from(skills).where(eq(skills.id, links.skillId));
      links.lifeAreaId = s?.lifeAreaId ?? null;
    }
    if (links.projectId && !links.lifeAreaId) {
      const [p] = await tx.select({ lifeAreaId: projects.lifeAreaId, goalId: projects.goalId }).from(projects).where(eq(projects.id, links.projectId));
      links.lifeAreaId = p?.lifeAreaId ?? null;
      links.goalId ??= p?.goalId ?? null;
    }

    const now = nowOf(actor);
    let startedAt: Date;
    if (input.startTime) startedAt = zonedTimeToUtc(input.date, input.startTime, actor.timezone);
    else if (input.date === todayOf(actor)) startedAt = input.durationMinutes ? new Date(now.getTime() - input.durationMinutes * 60_000) : now;
    else startedAt = zonedTimeToUtc(input.date, "12:00", actor.timezone);
    const endedAt = input.durationMinutes ? new Date(startedAt.getTime() + input.durationMinutes * 60_000) : null;

    const ref = await nextRef(tx, actor.userId, "session");
    const [row] = await tx
      .insert(workSessions)
      .values({
        userId: actor.userId,
        ref,
        activityType: input.activityType,
        title: input.title,
        notes: input.notes,
        startedAt,
        endedAt,
        durationMinutes: input.durationMinutes,
        quantity: input.quantity,
        unit: input.quantity !== null ? (input.unit?.trim().toLowerCase() ?? null) : null,
        localDate: input.date,
        ...links,
        routineItemId: opts.routineItemId ?? null,
        source: opts.source ?? "manual",
      })
      .returning();
    await recordEvent(tx, actor, {
      type: "session.logged",
      entityType: "session",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      occurredAt: endedAt && endedAt < now ? endedAt : undefined,
      payload: {
        activityType: row.activityType,
        durationMinutes: row.durationMinutes,
        quantity: row.quantity,
        unit: row.unit,
        skillId: row.skillId,
        projectId: row.projectId,
        taskId: row.taskId,
        source: row.source,
        localDate: row.localDate,
      },
    });
    return row;
  });
}

export async function deleteSession(actor: Actor, id: string, outer?: Tx) {
  return inTx(outer, async (tx) => {
    const [row] = await tx
      .update(workSessions)
      .set({ deletedAt: nowOf(actor) })
      .where(and(eq(workSessions.id, id), eq(workSessions.userId, actor.userId), isNull(workSessions.deletedAt)))
      .returning();
    if (!row) notFound("Session");
    await recordEvent(tx, actor, {
      type: "session.deleted",
      entityType: "session",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { durationMinutes: row.durationMinutes, quantity: row.quantity, unit: row.unit },
    });
    return row;
  });
}

export interface SessionFilters {
  from?: ISODate;
  to?: ISODate;
  skillId?: string;
  projectId?: string;
  taskId?: string;
  goalId?: string;
  activityType?: string;
  limit?: number;
}

export async function listSessions(actor: Actor, f: SessionFilters = {}) {
  const conds: SQL[] = [eq(workSessions.userId, actor.userId), isNull(workSessions.deletedAt)];
  if (f.from) conds.push(gte(workSessions.localDate, f.from));
  if (f.to) conds.push(lte(workSessions.localDate, f.to));
  if (f.skillId) conds.push(eq(workSessions.skillId, f.skillId));
  if (f.projectId) conds.push(eq(workSessions.projectId, f.projectId));
  if (f.taskId) conds.push(eq(workSessions.taskId, f.taskId));
  if (f.goalId) conds.push(eq(workSessions.goalId, f.goalId));
  if (f.activityType) conds.push(eq(workSessions.activityType, f.activityType));
  return db
    .select({
      session: workSessions,
      skillName: skills.name,
      skillRef: skills.ref,
      projectTitle: projects.title,
      projectRef: projects.ref,
      taskTitle: tasks.title,
      taskRef: tasks.ref,
      lifeAreaName: lifeAreas.name,
    })
    .from(workSessions)
    .leftJoin(skills, eq(skills.id, workSessions.skillId))
    .leftJoin(projects, eq(projects.id, workSessions.projectId))
    .leftJoin(tasks, eq(tasks.id, workSessions.taskId))
    .leftJoin(lifeAreas, eq(lifeAreas.id, workSessions.lifeAreaId))
    .where(and(...conds))
    .orderBy(desc(workSessions.localDate), desc(workSessions.startedAt))
    .limit(Math.min(f.limit ?? 100, 1000));
}

/** Raw rows for target aggregation over a date range. */
export async function sessionsForRange(userId: string, from: ISODate, to: ISODate) {
  return db
    .select({
      activityType: workSessions.activityType,
      lifeAreaId: workSessions.lifeAreaId,
      skillId: workSessions.skillId,
      projectId: workSessions.projectId,
      durationMinutes: workSessions.durationMinutes,
      quantity: workSessions.quantity,
      unit: workSessions.unit,
      localDate: workSessions.localDate,
    })
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), isNull(workSessions.deletedAt), gte(workSessions.localDate, from), lte(workSessions.localDate, to)));
}

/** Minutes per day for a date range (for sparklines / summaries). */
export async function minutesByDay(userId: string, from: ISODate, to: ISODate, filter: { skillId?: string; projectId?: string } = {}) {
  const conds: SQL[] = [eq(workSessions.userId, userId), isNull(workSessions.deletedAt), gte(workSessions.localDate, from), lte(workSessions.localDate, to)];
  if (filter.skillId) conds.push(eq(workSessions.skillId, filter.skillId));
  if (filter.projectId) conds.push(eq(workSessions.projectId, filter.projectId));
  return db
    .select({ date: workSessions.localDate, minutes: sql<number>`coalesce(sum(${workSessions.durationMinutes}), 0)::int` })
    .from(workSessions)
    .where(and(...conds))
    .groupBy(workSessions.localDate)
    .orderBy(workSessions.localDate);
}

export async function totalMinutes(userId: string, filter: { skillId?: string; projectId?: string; goalId?: string; from?: ISODate }) {
  const conds: SQL[] = [eq(workSessions.userId, userId), isNull(workSessions.deletedAt)];
  if (filter.skillId) conds.push(eq(workSessions.skillId, filter.skillId));
  if (filter.projectId) conds.push(eq(workSessions.projectId, filter.projectId));
  if (filter.goalId) conds.push(eq(workSessions.goalId, filter.goalId));
  if (filter.from) conds.push(gte(workSessions.localDate, filter.from));
  const [row] = await db
    .select({ minutes: sql<number>`coalesce(sum(${workSessions.durationMinutes}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(workSessions)
    .where(and(...conds));
  return row;
}
