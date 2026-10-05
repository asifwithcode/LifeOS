import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { ISODate } from "@/lib/domain/dates";
import { compareISO } from "@/lib/domain/dates";
import { db, type Tx } from "@/server/db";
import { routineAdjustments, tasks } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { assertOwned, inTx } from "./_shared";
import { deleteSession, logSession } from "./sessions";

// Date-specific plan blocks (e.g. accepted AI day-plan suggestions). Templates are never modified.

export interface AdjustmentInput {
  date: ISODate;
  title: string;
  startTime: string;
  durationMinutes: number;
  activityType?: string | null;
  taskId?: string | null;
  source?: "manual" | "ai";
}

export async function addAdjustment(actor: Actor, input: AdjustmentInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { taskId: input.taskId });
    const [row] = await tx
      .insert(routineAdjustments)
      .values({
        userId: actor.userId,
        date: input.date,
        title: input.title,
        startTime: input.startTime.slice(0, 5),
        durationMinutes: input.durationMinutes,
        activityType: input.activityType ?? null,
        taskId: input.taskId ?? null,
        source: input.source ?? "manual",
      })
      .returning();
    await recordEvent(tx, actor, {
      type: "routine.plan_added",
      entityType: "routine_item",
      entityId: row.id,
      entityTitle: row.title,
      payload: { date: row.date, startTime: row.startTime, durationMinutes: row.durationMinutes, source: row.source },
    });
    return row;
  });
}

export async function listAdjustments(userId: string, date: ISODate) {
  return db
    .select({ adj: routineAdjustments, taskRef: tasks.ref })
    .from(routineAdjustments)
    .leftJoin(tasks, eq(tasks.id, routineAdjustments.taskId))
    .where(and(eq(routineAdjustments.userId, userId), eq(routineAdjustments.date, date)))
    .orderBy(asc(routineAdjustments.startTime));
}

async function load(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(routineAdjustments).where(and(eq(routineAdjustments.id, id), eq(routineAdjustments.userId, actor.userId)));
  if (!row) notFound("Planned block");
  return row;
}

/** Completing a planned block logs a real session, so it counts toward targets like routine blocks. */
export async function completeAdjustment(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const a = await load(tx, actor, id);
    if (compareISO(a.date, todayOf(actor)) > 0) throw new DomainError("You can't complete a future block");
    if (a.status === "done") return a;
    const s = await logSession(
      actor,
      {
        activityType: (a.activityType as never) ?? "other",
        title: a.title,
        notes: null,
        date: a.date,
        startTime: a.startTime.slice(0, 5),
        durationMinutes: a.durationMinutes,
        quantity: null,
        unit: null,
        lifeAreaId: null,
        skillId: null,
        projectId: null,
        taskId: a.taskId,
        goalId: null,
      },
      { source: "routine" },
      tx,
    );
    const [row] = await tx.update(routineAdjustments).set({ status: "done", sessionId: s.id }).where(eq(routineAdjustments.id, id)).returning();
    await recordEvent(tx, actor, { type: "routine.plan_completed", entityType: "routine_item", entityId: id, entityTitle: a.title, payload: { date: a.date, minutes: a.durationMinutes } });
    return row;
  });
}

export async function resetAdjustment(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const a = await load(tx, actor, id);
    if (a.sessionId) await deleteSession(actor, a.sessionId, tx);
    await tx.update(routineAdjustments).set({ status: "planned", sessionId: null }).where(eq(routineAdjustments.id, id));
  });
}

export async function removeAdjustment(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const a = await load(tx, actor, id);
    if (a.sessionId) await deleteSession(actor, a.sessionId, tx);
    await tx.delete(routineAdjustments).where(eq(routineAdjustments.id, id));
  });
}
