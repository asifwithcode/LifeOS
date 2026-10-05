import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { goalProgress, projectProgress, type ProgressResult } from "@/lib/domain/progress";
import type { GoalInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { goals, lifeAreas, milestones, projects, tasks, type Goal } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, type Actor } from "@/server/engines/actor";
import { notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned, changedFields, inTx } from "./_shared";
import { listMilestones } from "./milestones";
import { totalMinutes } from "./sessions";
import { evaluateTargets } from "./targets";

async function reindex(tx: Tx, actor: Actor, g: Goal) {
  if (g.deletedAt) return removeFromIndex(tx, actor.userId, "goal", g.id);
  await indexEntity(tx, actor.userId, {
    entityType: "goal",
    entityId: g.id,
    ref: g.ref,
    title: g.title,
    body: [g.description, g.why].filter(Boolean).join("\n\n"),
    archived: !!g.archivedAt,
  });
}

function values(input: GoalInput) {
  return {
    title: input.title,
    description: input.description,
    why: input.why,
    lifeAreaId: input.lifeAreaId,
    status: input.status,
    priority: input.priority,
    startDate: input.startDate,
    targetDate: input.targetDate,
    progressMode: input.progressMode,
  };
}

export async function createGoal(actor: Actor, input: GoalInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const ref = await nextRef(tx, actor.userId, "goal");
    const [row] = await tx
      .insert(goals)
      .values({ ...values(input), userId: actor.userId, ref, completedAt: input.status === "achieved" ? nowOf(actor) : null })
      .returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: "goal.created", entityType: "goal", entityId: row.id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

async function loadOwned(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, actor.userId))).limit(1);
  if (!row) notFound("Goal");
  return row;
}

export async function updateGoal(actor: Actor, id: string, input: GoalInput) {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const v = values(input);
    const changed = changedFields(before as unknown as Record<string, unknown>, v);
    const completedAt = input.status === "achieved" ? (before.completedAt ?? nowOf(actor)) : null;
    const [row] = await tx.update(goals).set({ ...v, completedAt, updatedAt: nowOf(actor) }).where(eq(goals.id, id)).returning();
    await reindex(tx, actor, row);
    if (before.status !== row.status) {
      await recordEvent(tx, actor, {
        type: "goal.status_changed",
        entityType: "goal",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        payload: { from: before.status, to: row.status },
      });
    }
    const other = changed.filter((c) => c !== "status");
    if (other.length) {
      await recordEvent(tx, actor, { type: "goal.updated", entityType: "goal", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { changed: other } });
    }
    return row;
  });
}

export async function setGoalArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(goals).set({ archivedAt: archived ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(goals.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "goal.archived" : "goal.restored", entityType: "goal", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function setGoalDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(goals).set({ deletedAt: deleted ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(goals.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: deleted ? "goal.deleted" : "goal.restored", entityType: "goal", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export interface GoalWithProgress extends Goal {
  progress: ProgressResult;
  lifeAreaName: string | null;
  lifeAreaColor: string | null;
  milestoneTotal: number;
  milestoneDone: number;
}

/** Goals with progress, batched (no N+1 on milestones/tasks). */
export async function listGoals(actor: Actor, opts: { view?: "active" | "all" | "archived" | "trash" } = {}): Promise<GoalWithProgress[]> {
  const view = opts.view ?? "active";
  const conds: SQL[] = [eq(goals.userId, actor.userId)];
  if (view === "trash") conds.push(isNotNull(goals.deletedAt));
  else {
    conds.push(isNull(goals.deletedAt));
    if (view === "archived") conds.push(isNotNull(goals.archivedAt));
    else conds.push(isNull(goals.archivedAt));
    if (view === "active") conds.push(inArray(goals.status, ["active", "not_started", "paused"]));
  }
  const rows = await db
    .select({ goal: goals, lifeAreaName: lifeAreas.name, lifeAreaColor: lifeAreas.color })
    .from(goals)
    .leftJoin(lifeAreas, eq(lifeAreas.id, goals.lifeAreaId))
    .where(and(...conds))
    .orderBy(sql`CASE ${goals.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`, sql`${goals.targetDate} ASC NULLS LAST`, desc(goals.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.goal.id);
  const [ms, ts, evaluated] = await Promise.all([
    db.select().from(milestones).where(inArray(milestones.goalId, ids)),
    db
      .select({ status: tasks.status, parentTaskId: tasks.parentTaskId, milestoneId: tasks.milestoneId, goalId: milestones.goalId })
      .from(tasks)
      .innerJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(and(inArray(milestones.goalId, ids), isNull(tasks.deletedAt))),
    rows.some((r) => r.goal.progressMode === "targets") ? evaluateTargets(actor, {}) : Promise.resolve([]),
  ]);
  return rows.map(({ goal, lifeAreaName, lifeAreaColor }) => {
    const gm = ms.filter((m) => m.goalId === goal.id);
    const gt = ts.filter((t) => t.goalId === goal.id);
    const targetPercents = evaluated.filter((t) => t.goalId === goal.id).map((t) => ({ title: t.title, percent: t.evaluation.percent }));
    return {
      ...goal,
      lifeAreaName,
      lifeAreaColor,
      milestoneTotal: gm.length,
      milestoneDone: gm.filter((m) => m.status === "done").length,
      progress: goalProgress(goal.progressMode, gm, gt, targetPercents),
    };
  });
}

export async function getGoalByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select({ goal: goals, lifeAreaName: lifeAreas.name })
    .from(goals)
    .leftJoin(lifeAreas, eq(lifeAreas.id, goals.lifeAreaId))
    .where(and(eq(goals.userId, actor.userId), eq(goals.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const goal = row.goal;
  const [ms, milestoneTasks, linkedTargets, linkedProjects, minutes] = await Promise.all([
    listMilestones(actor.userId, { goalId: goal.id }),
    db
      .select({ status: tasks.status, parentTaskId: tasks.parentTaskId, milestoneId: tasks.milestoneId })
      .from(tasks)
      .innerJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(and(eq(milestones.goalId, goal.id), isNull(tasks.deletedAt))),
    evaluateTargets(actor, { goalId: goal.id, includePaused: true }),
    db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, actor.userId), eq(projects.goalId, goal.id), isNull(projects.deletedAt)))
      .orderBy(asc(projects.title)),
    totalMinutes(actor.userId, { goalId: goal.id }),
  ]);

  // Project progress for linked projects (batched).
  const pids = linkedProjects.map((p) => p.id);
  const [pms, pts] = pids.length
    ? await Promise.all([
        db.select().from(milestones).where(inArray(milestones.projectId, pids)),
        db
          .select({ projectId: tasks.projectId, status: tasks.status, parentTaskId: tasks.parentTaskId, milestoneId: tasks.milestoneId })
          .from(tasks)
          .where(and(inArray(tasks.projectId, pids), isNull(tasks.deletedAt))),
      ])
    : [[], []];
  const projectsWithProgress = linkedProjects.map((p) => ({
    ...p,
    progress: projectProgress(
      p.progressMode,
      pms.filter((m) => m.projectId === p.id),
      pts.filter((t) => t.projectId === p.id),
    ),
  }));

  const activeTargets = linkedTargets.filter((t) => t.status === "active");
  const progress = goalProgress(
    goal.progressMode,
    ms,
    milestoneTasks,
    activeTargets.map((t) => ({ title: t.title, percent: t.evaluation.percent })),
  );
  return { goal, lifeAreaName: row.lifeAreaName, milestones: ms, targets: linkedTargets, projects: projectsWithProgress, progress, minutes };
}

export async function listGoalOptions(userId: string) {
  return db
    .select({ id: goals.id, ref: goals.ref, title: goals.title })
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt), isNull(goals.archivedAt)))
    .orderBy(asc(goals.title));
}
