import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { MilestoneStatus } from "@/lib/domain/constants";
import { isBlocked, wouldCreateCycle, type DepEdge } from "@/lib/domain/dependencies";
import type { MilestoneInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { dependencies, milestones, tasks, type Milestone } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { assertOwned, inTx } from "./_shared";

export type MilestoneOwner = { goalId: string } | { projectId: string };

export async function addMilestone(actor: Actor, owner: MilestoneOwner, input: MilestoneInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, owner);
    const ownerCond = "goalId" in owner ? eq(milestones.goalId, owner.goalId) : eq(milestones.projectId, owner.projectId);
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${milestones.sortOrder}), -1)::int` }).from(milestones).where(ownerCond);
    const ref = await nextRef(tx, actor.userId, "milestone");
    const [row] = await tx
      .insert(milestones)
      .values({
        userId: actor.userId,
        ref,
        goalId: "goalId" in owner ? owner.goalId : null,
        projectId: "projectId" in owner ? owner.projectId : null,
        title: input.title,
        description: input.description,
        weight: input.weight,
        dueDate: input.dueDate,
        sortOrder: max + 1,
      })
      .returning();
    await recordEvent(tx, actor, {
      type: "milestone.created",
      entityType: "milestone",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { goalId: row.goalId, projectId: row.projectId },
    });
    return row;
  });
}

async function loadOwned(tx: Tx, actor: Actor, id: string): Promise<Milestone> {
  const [row] = await tx.select().from(milestones).where(and(eq(milestones.id, id), eq(milestones.userId, actor.userId))).limit(1);
  if (!row) notFound("Milestone");
  return row;
}

export async function updateMilestone(actor: Actor, id: string, input: MilestoneInput) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx
      .update(milestones)
      .set({ title: input.title, description: input.description, weight: input.weight, dueDate: input.dueDate, updatedAt: nowOf(actor) })
      .where(eq(milestones.id, id))
      .returning();
    return row;
  });
}

export async function setMilestoneStatus(actor: Actor, id: string, status: MilestoneStatus) {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    if (before.status === status) return before;
    const [row] = await tx
      .update(milestones)
      .set({ status, completedAt: status === "done" ? nowOf(actor) : null, updatedAt: nowOf(actor) })
      .where(eq(milestones.id, id))
      .returning();
    if (status === "done" || before.status === "done") {
      await recordEvent(tx, actor, {
        type: status === "done" ? "milestone.completed" : "milestone.reopened",
        entityType: "milestone",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        payload: { goalId: row.goalId, projectId: row.projectId, weight: row.weight },
      });
    }
    return row;
  });
}

export async function deleteMilestone(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const row = await loadOwned(tx, actor, id);
    await tx.update(tasks).set({ milestoneId: null }).where(eq(tasks.milestoneId, id));
    await tx.delete(dependencies).where(
      and(
        eq(dependencies.userId, actor.userId),
        sql`((${dependencies.blockedType} = 'milestone' AND ${dependencies.blockedId} = ${id}) OR (${dependencies.blockerType} = 'milestone' AND ${dependencies.blockerId} = ${id}))`,
      ),
    );
    await tx.delete(milestones).where(eq(milestones.id, id));
    await recordEvent(tx, actor, {
      type: "milestone.deleted",
      entityType: "milestone",
      entityId: id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { goalId: row.goalId, projectId: row.projectId },
    });
  });
}

export async function moveMilestone(actor: Actor, id: string, direction: "up" | "down") {
  return db.transaction(async (tx) => {
    const row = await loadOwned(tx, actor, id);
    const ownerCond = row.goalId ? eq(milestones.goalId, row.goalId) : eq(milestones.projectId, row.projectId!);
    const siblings = await tx.select().from(milestones).where(ownerCond).orderBy(asc(milestones.sortOrder), asc(milestones.createdAt));
    const idx = siblings.findIndex((m) => m.id === id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder !== i) await tx.update(milestones).set({ sortOrder: i }).where(eq(milestones.id, reordered[i].id));
    }
  });
}

/** Milestone "Learn Ktor" waits for milestone "Learn Coroutines". */
export async function addMilestoneDependency(actor: Actor, milestoneId: string, blockerMilestoneId: string) {
  return db.transaction(async (tx) => {
    const blocked = await loadOwned(tx, actor, milestoneId);
    const blocker = await loadOwned(tx, actor, blockerMilestoneId);
    const existing = await tx.select().from(dependencies).where(eq(dependencies.userId, actor.userId));
    const edge: DepEdge = { blockedType: "milestone", blockedId: blocked.id, blockerType: "milestone", blockerId: blocker.id };
    if (wouldCreateCycle(existing as DepEdge[], edge)) throw new DomainError("That would create a circular dependency", "conflict");
    await tx.insert(dependencies).values({ userId: actor.userId, ...edge }).onConflictDoNothing();
  });
}

export async function removeMilestoneDependency(actor: Actor, milestoneId: string, blockerMilestoneId: string) {
  await db
    .delete(dependencies)
    .where(
      and(
        eq(dependencies.userId, actor.userId),
        eq(dependencies.blockedType, "milestone"),
        eq(dependencies.blockedId, milestoneId),
        eq(dependencies.blockerType, "milestone"),
        eq(dependencies.blockerId, blockerMilestoneId),
      ),
    );
}

export interface MilestoneView extends Milestone {
  taskTotal: number;
  taskDone: number;
  blockers: { id: string; title: string; done: boolean }[];
  blocked: boolean;
}

/** Milestones for an owner with task counts and dependency state. */
export async function listMilestones(userId: string, owner: MilestoneOwner): Promise<MilestoneView[]> {
  const ownerCond = "goalId" in owner ? eq(milestones.goalId, owner.goalId) : eq(milestones.projectId, owner.projectId);
  const rows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.userId, userId), ownerCond))
    .orderBy(asc(milestones.sortOrder), asc(milestones.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [counts, deps] = await Promise.all([
    db
      .select({
        milestoneId: tasks.milestoneId,
        total: sql<number>`count(*) FILTER (WHERE ${tasks.status} <> 'cancelled' AND ${tasks.parentTaskId} IS NULL)::int`,
        done: sql<number>`count(*) FILTER (WHERE ${tasks.status} = 'done' AND ${tasks.parentTaskId} IS NULL)::int`,
      })
      .from(tasks)
      .where(and(inArray(tasks.milestoneId, ids), isNull(tasks.deletedAt)))
      .groupBy(tasks.milestoneId),
    db
      .select({ blockedId: dependencies.blockedId, blockerId: dependencies.blockerId })
      .from(dependencies)
      .where(and(eq(dependencies.userId, userId), eq(dependencies.blockedType, "milestone"), eq(dependencies.blockerType, "milestone"), inArray(dependencies.blockedId, ids))),
  ]);
  const countMap = new Map(counts.map((c) => [c.milestoneId!, c]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((r) => {
    const blockers = deps
      .filter((d) => d.blockedId === r.id)
      .map((d) => byId.get(d.blockerId))
      .filter(Boolean)
      .map((b) => ({ id: b!.id, title: b!.title, done: b!.status === "done" }));
    return {
      ...r,
      taskTotal: countMap.get(r.id)?.total ?? 0,
      taskDone: countMap.get(r.id)?.done ?? 0,
      blockers,
      blocked: r.status !== "done" && isBlocked(blockers.map((b) => ({ id: b.id, type: "milestone" as const, done: b.done }))),
    };
  });
}
