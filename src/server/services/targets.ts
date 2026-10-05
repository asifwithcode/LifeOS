import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { compareISO, type ISODate } from "@/lib/domain/dates";
import {
  aggregateActual,
  describeEvaluation,
  evaluateTarget,
  metricForUnit,
  quantityUnitKey,
  periodRange,
  previousPeriodRange,
  sessionMatches,
  type PeriodRange,
  type TargetEvaluation,
} from "@/lib/domain/targets";
import type { TargetInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { goals, lifeAreas, projects, skills, targets, type Target } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned, changedFields, inTx } from "./_shared";
import { listSessions, sessionsForRange } from "./sessions";
import { completedTasksInRange } from "./tasks";

async function reindex(tx: Tx, actor: Actor, t: Target) {
  if (t.deletedAt) return removeFromIndex(tx, actor.userId, "target", t.id);
  await indexEntity(tx, actor.userId, {
    entityType: "target",
    entityId: t.id,
    ref: t.ref,
    title: t.title,
    body: t.description,
    archived: !!t.archivedAt,
  });
}

function values(input: TargetInput) {
  return {
    title: input.title,
    description: input.description,
    period: input.period,
    customStart: input.period === "custom" ? input.customStart : null,
    customEnd: input.period === "custom" ? input.customEnd : null,
    amount: input.amount,
    unit: input.unit,
    customUnit: input.unit === "custom" ? input.customUnit : null,
    activityType: input.activityType,
    lifeAreaId: input.lifeAreaId,
    skillId: input.skillId,
    projectId: input.projectId,
    goalId: input.goalId,
  };
}

export async function createTarget(actor: Actor, input: TargetInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId, skillId: input.skillId, projectId: input.projectId, goalId: input.goalId });
    const ref = await nextRef(tx, actor.userId, "target");
    const [row] = await tx.insert(targets).values({ ...values(input), userId: actor.userId, ref }).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, {
      type: "target.created",
      entityType: "target",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { period: row.period, amount: row.amount, unit: row.unit },
    });
    return row;
  });
}

async function loadOwned(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(targets).where(and(eq(targets.id, id), eq(targets.userId, actor.userId))).limit(1);
  if (!row) notFound("Target");
  return row;
}

export async function updateTarget(actor: Actor, id: string, input: TargetInput) {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId, skillId: input.skillId, projectId: input.projectId, goalId: input.goalId });
    const v = values(input);
    const changed = changedFields(before as unknown as Record<string, unknown>, v);
    const [row] = await tx.update(targets).set({ ...v, updatedAt: nowOf(actor) }).where(eq(targets.id, id)).returning();
    await reindex(tx, actor, row);
    if (changed.length) {
      await recordEvent(tx, actor, {
        type: "target.updated",
        entityType: "target",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        // Amount changes are history: keep the old value so reviews can explain jumps.
        payload: { changed, previousAmount: before.amount, amount: row.amount },
      });
    }
    return row;
  });
}

export async function setTargetStatus(actor: Actor, id: string, status: "active" | "paused") {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(targets).set({ status, updatedAt: nowOf(actor) }).where(eq(targets.id, id)).returning();
    await recordEvent(tx, actor, { type: "target.updated", entityType: "target", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { changed: ["status"], status } });
    return row;
  });
}

export async function setTargetArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(targets).set({ archivedAt: archived ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(targets.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "target.archived" : "target.restored", entityType: "target", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function setTargetDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(targets).set({ deletedAt: deleted ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(targets.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: deleted ? "target.deleted" : "target.restored", entityType: "target", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

// ── Evaluation (the Progress Engine for targets) ──

export interface EvaluatedTarget extends Target {
  evaluation: TargetEvaluation;
  summary: string;
  skillName: string | null;
  projectTitle: string | null;
  goalTitle: string | null;
  lifeAreaName: string | null;
}

export interface TargetQuery {
  ids?: string[];
  goalId?: string;
  skillId?: string;
  projectId?: string;
  period?: string;
  includePaused?: boolean;
  includeArchived?: boolean;
  today?: ISODate;
}

function rangeFor(t: Target, today: ISODate, weekStartsOn: number): PeriodRange {
  return periodRange(t.period, today, weekStartsOn, { start: t.customStart, end: t.customEnd });
}

/** Loads matching targets and evaluates each against real sessions/tasks in its current period. */
export async function evaluateTargets(actor: Actor, q: TargetQuery = {}): Promise<EvaluatedTarget[]> {
  const today = q.today ?? todayOf(actor);
  const conds: SQL[] = [eq(targets.userId, actor.userId), isNull(targets.deletedAt)];
  if (!q.includeArchived) conds.push(isNull(targets.archivedAt));
  if (!q.includePaused) conds.push(eq(targets.status, "active"));
  if (q.ids?.length) conds.push(inArray(targets.id, q.ids));
  if (q.goalId) conds.push(eq(targets.goalId, q.goalId));
  if (q.skillId) conds.push(eq(targets.skillId, q.skillId));
  if (q.projectId) conds.push(eq(targets.projectId, q.projectId));
  if (q.period) conds.push(eq(targets.period, q.period));

  const rows = await db
    .select({ target: targets, skillName: skills.name, projectTitle: projects.title, goalTitle: goals.title, lifeAreaName: lifeAreas.name })
    .from(targets)
    .leftJoin(skills, eq(skills.id, targets.skillId))
    .leftJoin(projects, eq(projects.id, targets.projectId))
    .leftJoin(goals, eq(goals.id, targets.goalId))
    .leftJoin(lifeAreas, eq(lifeAreas.id, targets.lifeAreaId))
    .where(and(...conds))
    .orderBy(asc(targets.sortOrder), asc(targets.createdAt));
  if (rows.length === 0) return [];

  const ranges = rows.map((r) => rangeFor(r.target, today, actor.weekStartsOn));
  const from = ranges.reduce((m, r) => (compareISO(r.start, m) < 0 ? r.start : m), ranges[0].start);
  const to = ranges.reduce((m, r) => (compareISO(r.end, m) > 0 ? r.end : m), ranges[0].end);
  const needsTasks = rows.some((r) => r.target.unit === "tasks");
  const [sessions, done] = await Promise.all([
    sessionsForRange(actor.userId, from, to),
    needsTasks ? completedTasksInRange(actor, from, to) : Promise.resolve([]),
  ]);

  return rows.map((r, i) => {
    const t = r.target;
    const actual = aggregateActual(t, ranges[i], sessions, done);
    const evaluation = evaluateTarget(t.amount, actual, ranges[i], today);
    return {
      ...t,
      evaluation,
      summary: describeEvaluation(evaluation, t.unit, t.customUnit, t.period),
      skillName: r.skillName,
      projectTitle: r.projectTitle,
      goalTitle: r.goalTitle,
      lifeAreaName: r.lifeAreaName,
    };
  });
}

export async function getTargetByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select()
    .from(targets)
    .where(and(eq(targets.userId, actor.userId), eq(targets.ref, ref.toUpperCase()), isNull(targets.deletedAt)))
    .limit(1);
  if (!row) return null;
  const [evaluated] = await evaluateTargets(actor, { ids: [row.id], includePaused: true, includeArchived: true });
  const today = todayOf(actor);

  // History: the six previous periods (not for custom periods).
  const history: { range: PeriodRange; actual: number; percent: number }[] = [];
  const prevRanges = [1, 2, 3, 4, 5, 6].map((n) => previousPeriodRange(row.period, today, actor.weekStartsOn, n)).filter(Boolean) as PeriodRange[];
  if (prevRanges.length) {
    const from = prevRanges[prevRanges.length - 1].start;
    const to = prevRanges[0].end;
    const [sessions, done] = await Promise.all([
      sessionsForRange(actor.userId, from, to),
      row.unit === "tasks" ? completedTasksInRange(actor, from, to) : Promise.resolve([]),
    ]);
    for (const r of prevRanges) {
      const actual = aggregateActual(row, r, sessions, done);
      history.push({ range: r, actual, percent: Math.round((actual / row.amount) * 1000) / 10 });
    }
  }

  // Contributing sessions in the current period.
  const range = evaluated.evaluation.range;
  const metric = metricForUnit(row.unit);
  const unitKey = quantityUnitKey(row.unit, row.customUnit);
  const sessions =
    metric === "tasks"
      ? []
      : (await listSessions(actor, { from: range.start, to: range.end, limit: 500 })).filter(
          (s) =>
            sessionMatches(row, s.session) &&
            (metric !== "time" || (s.session.durationMinutes ?? 0) > 0) &&
            (metric !== "quantity" || (s.session.unit ?? "") === unitKey),
        );

  return { target: evaluated, history, sessions };
}

export async function listArchivedTargets(actor: Actor) {
  return db
    .select()
    .from(targets)
    .where(and(eq(targets.userId, actor.userId), isNull(targets.deletedAt), isNotNull(targets.archivedAt)))
    .orderBy(asc(targets.title));
}
