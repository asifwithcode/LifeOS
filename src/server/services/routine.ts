import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, compareISO, timeToMinutes, type ISODate } from "@/lib/domain/dates";
import { findOverlaps, itemsForDate, plannedMinutes, resolveTemplateForDate, slotState, type RoutineSlotState } from "@/lib/domain/routine";
import type { RoutineItemInput, RoutineTemplateInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import {
  goals,
  projects,
  routineCompletions,
  routineDayPlans,
  routineItems,
  routineTemplates,
  skills,
  type RoutineCompletion,
  type RoutineItem,
  type RoutineTemplate,
} from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowMinutesOf, nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned } from "./_shared";
import { deleteSession, logSession } from "./sessions";

// ── Templates ──

export async function listTemplates(userId: string, includeArchived = false) {
  return db
    .select()
    .from(routineTemplates)
    .where(includeArchived ? eq(routineTemplates.userId, userId) : and(eq(routineTemplates.userId, userId), isNull(routineTemplates.archivedAt)))
    .orderBy(asc(routineTemplates.sortOrder), asc(routineTemplates.createdAt));
}

async function loadTemplate(tx: Tx, actor: Actor, id: string): Promise<RoutineTemplate> {
  const [row] = await tx.select().from(routineTemplates).where(and(eq(routineTemplates.id, id), eq(routineTemplates.userId, actor.userId))).limit(1);
  if (!row) notFound("Routine template");
  return row;
}

/** A weekday may belong to at most one template; claiming it removes it from the others. */
async function claimWeekdays(tx: Tx, actor: Actor, templateId: string, weekdays: number[]) {
  if (weekdays.length === 0) return;
  const others = await tx.select().from(routineTemplates).where(and(eq(routineTemplates.userId, actor.userId), sql`${routineTemplates.id} <> ${templateId}`));
  for (const o of others) {
    const remaining = o.weekdays.filter((d) => !weekdays.includes(d));
    if (remaining.length !== o.weekdays.length) await tx.update(routineTemplates).set({ weekdays: remaining }).where(eq(routineTemplates.id, o.id));
  }
}

async function setDefault(tx: Tx, actor: Actor, templateId: string) {
  await tx.update(routineTemplates).set({ isDefault: false }).where(and(eq(routineTemplates.userId, actor.userId), sql`${routineTemplates.id} <> ${templateId}`));
}

export async function createTemplate(actor: Actor, input: RoutineTemplateInput) {
  return db.transaction(async (tx) => {
    const existing = await listTemplates(actor.userId, true);
    const [row] = await tx
      .insert(routineTemplates)
      .values({ userId: actor.userId, name: input.name, kind: input.kind, weekdays: [...new Set(input.weekdays)].sort(), isDefault: input.isDefault, sortOrder: existing.length })
      .returning();
    await claimWeekdays(tx, actor, row.id, row.weekdays);
    if (row.isDefault) await setDefault(tx, actor, row.id);
    return row;
  });
}

export async function updateTemplate(actor: Actor, id: string, input: RoutineTemplateInput) {
  return db.transaction(async (tx) => {
    await loadTemplate(tx, actor, id);
    const [row] = await tx
      .update(routineTemplates)
      .set({ name: input.name, kind: input.kind, weekdays: [...new Set(input.weekdays)].sort(), isDefault: input.isDefault, updatedAt: nowOf(actor) })
      .where(eq(routineTemplates.id, id))
      .returning();
    await claimWeekdays(tx, actor, id, row.weekdays);
    if (row.isDefault) await setDefault(tx, actor, id);
    return row;
  });
}

export async function setTemplateArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    const t = await loadTemplate(tx, actor, id);
    if (archived && t.isDefault) throw new DomainError("Choose another default template before archiving this one");
    await tx.update(routineTemplates).set({ archivedAt: archived ? nowOf(actor) : null, weekdays: archived ? [] : t.weekdays }).where(eq(routineTemplates.id, id));
  });
}

/** Copies a template and its active items (e.g. "Exam Period" from "Normal Day"). */
export async function duplicateTemplate(actor: Actor, id: string, name: string) {
  return db.transaction(async (tx) => {
    const src = await loadTemplate(tx, actor, id);
    const existing = await listTemplates(actor.userId, true);
    const [copy] = await tx
      .insert(routineTemplates)
      .values({ userId: actor.userId, name, kind: src.kind, weekdays: [], isDefault: false, sortOrder: existing.length })
      .returning();
    const items = await tx.select().from(routineItems).where(and(eq(routineItems.templateId, id), isNull(routineItems.archivedAt)));
    for (const it of items) {
      const ref = await nextRef(tx, actor.userId, "routine_item");
      const { id: _id, ref: _ref, createdAt: _c, updatedAt: _u, templateId: _t, ...rest } = it;
      void _id;
      void _ref;
      void _c;
      void _u;
      void _t;
      const [created] = await tx.insert(routineItems).values({ ...rest, ref, templateId: copy.id }).returning();
      await reindexItem(tx, actor, created);
    }
    return copy;
  });
}

// ── Items ──

async function reindexItem(tx: Tx, actor: Actor, it: RoutineItem) {
  if (it.archivedAt) return removeFromIndex(tx, actor.userId, "routine_item", it.id);
  await indexEntity(tx, actor.userId, { entityType: "routine_item", entityId: it.id, ref: it.ref, title: it.title, body: `Routine at ${it.startTime.slice(0, 5)}` });
}

function itemValues(input: RoutineItemInput) {
  return {
    templateId: input.templateId,
    title: input.title,
    startTime: input.startTime.slice(0, 5),
    durationMinutes: input.durationMinutes,
    daysOfWeek: input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? [...new Set(input.daysOfWeek)].sort() : null,
    activityType: input.activityType,
    lifeAreaId: input.lifeAreaId,
    priority: input.priority,
    reminderMinutesBefore: input.reminderMinutesBefore,
    goalId: input.goalId,
    skillId: input.skillId,
    projectId: input.projectId,
    logAsSession: input.logAsSession,
  };
}

export async function createRoutineItem(actor: Actor, input: RoutineItemInput) {
  return db.transaction(async (tx) => {
    await assertOwned(tx, actor.userId, { templateId: input.templateId, lifeAreaId: input.lifeAreaId, goalId: input.goalId, skillId: input.skillId, projectId: input.projectId });
    const ref = await nextRef(tx, actor.userId, "routine_item");
    const [row] = await tx.insert(routineItems).values({ ...itemValues(input), userId: actor.userId, ref }).returning();
    await reindexItem(tx, actor, row);
    return row;
  });
}

async function loadItem(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(routineItems).where(and(eq(routineItems.id, id), eq(routineItems.userId, actor.userId))).limit(1);
  if (!row) notFound("Routine item");
  return row;
}

export async function updateRoutineItem(actor: Actor, id: string, input: RoutineItemInput) {
  return db.transaction(async (tx) => {
    await loadItem(tx, actor, id);
    await assertOwned(tx, actor.userId, { templateId: input.templateId, lifeAreaId: input.lifeAreaId, goalId: input.goalId, skillId: input.skillId, projectId: input.projectId });
    const [row] = await tx.update(routineItems).set({ ...itemValues(input), updatedAt: nowOf(actor) }).where(eq(routineItems.id, id)).returning();
    await reindexItem(tx, actor, row);
    return row;
  });
}

/** Items with history are archived (history stays intact); unused items are deleted. */
export async function removeRoutineItem(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    await loadItem(tx, actor, id);
    const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(routineCompletions).where(eq(routineCompletions.routineItemId, id));
    if (used.n > 0) {
      const [row] = await tx.update(routineItems).set({ archivedAt: nowOf(actor) }).where(eq(routineItems.id, id)).returning();
      await reindexItem(tx, actor, row);
      return "archived" as const;
    }
    await removeFromIndex(tx, actor.userId, "routine_item", id);
    await tx.delete(routineItems).where(eq(routineItems.id, id));
    return "deleted" as const;
  });
}

export async function listItems(userId: string, templateId?: string) {
  const conds = [eq(routineItems.userId, userId), isNull(routineItems.archivedAt)];
  if (templateId) conds.push(eq(routineItems.templateId, templateId));
  return db
    .select({ item: routineItems, skillName: skills.name, projectTitle: projects.title, goalTitle: goals.title })
    .from(routineItems)
    .leftJoin(skills, eq(skills.id, routineItems.skillId))
    .leftJoin(projects, eq(projects.id, routineItems.projectId))
    .leftJoin(goals, eq(goals.id, routineItems.goalId))
    .where(and(...conds))
    .orderBy(asc(routineItems.startTime));
}

// ── Day plans (temporary template overrides; the original routine is untouched) ──

export async function setDayPlan(actor: Actor, date: ISODate, templateId: string | null, note?: string | null) {
  return db.transaction(async (tx) => {
    if (!templateId) {
      await tx.delete(routineDayPlans).where(and(eq(routineDayPlans.userId, actor.userId), eq(routineDayPlans.date, date)));
      return;
    }
    await loadTemplate(tx, actor, templateId);
    await tx
      .insert(routineDayPlans)
      .values({ userId: actor.userId, date, templateId, note: note ?? null })
      .onConflictDoUpdate({ target: [routineDayPlans.userId, routineDayPlans.date], set: { templateId, note: note ?? null } });
  });
}

export async function listDayPlans(userId: string, from: ISODate, to: ISODate) {
  return db
    .select({ date: routineDayPlans.date, templateId: routineDayPlans.templateId, note: routineDayPlans.note, templateName: routineTemplates.name })
    .from(routineDayPlans)
    .innerJoin(routineTemplates, eq(routineTemplates.id, routineDayPlans.templateId))
    .where(and(eq(routineDayPlans.userId, userId), gte(routineDayPlans.date, from), lte(routineDayPlans.date, to)))
    .orderBy(asc(routineDayPlans.date));
}

// ── Day view ──

export interface RoutineSlot {
  item: RoutineItem;
  state: RoutineSlotState;
  completion: RoutineCompletion | null;
  skillName: string | null;
  projectTitle: string | null;
  endTime: string;
}

export interface RoutineDay {
  date: ISODate;
  template: RoutineTemplate | null;
  reason: "override" | "weekday" | "default" | "none";
  slots: RoutineSlot[];
  plannedMinutes: number;
  doneCount: number;
  overlaps: [string, string][];
  next: RoutineSlot | null;
}

export async function getRoutineDay(actor: Actor, date: ISODate = todayOf(actor)): Promise<RoutineDay> {
  const today = todayOf(actor);
  const [templates, [plan]] = await Promise.all([
    listTemplates(actor.userId),
    db.select().from(routineDayPlans).where(and(eq(routineDayPlans.userId, actor.userId), eq(routineDayPlans.date, date))).limit(1),
  ]);
  const { template, reason } = resolveTemplateForDate(date, templates, plan?.templateId);
  if (!template) return { date, template: null, reason, slots: [], plannedMinutes: 0, doneCount: 0, overlaps: [], next: null };

  const itemRows = await listItems(actor.userId, template.id);
  const items = itemsForDate(
    date,
    template.id,
    itemRows.map((r) => r.item),
  );
  const completions = items.length
    ? await db
        .select()
        .from(routineCompletions)
        .where(and(eq(routineCompletions.userId, actor.userId), eq(routineCompletions.date, date), inArray(routineCompletions.routineItemId, items.map((i) => i.id))))
    : [];
  const compMap = new Map(completions.map((c) => [c.routineItemId, c]));
  const meta = new Map(itemRows.map((r) => [r.item.id, r]));
  const nowMin = nowMinutesOf(actor);
  const isToday = date === today;
  const isPast = compareISO(date, today) < 0;
  const slots: RoutineSlot[] = items.map((item) => {
    const completion = compMap.get(item.id) ?? null;
    const end = timeToMinutes(item.startTime) + item.durationMinutes;
    return {
      item,
      completion,
      state: slotState(item, (completion?.status as "done" | "skipped") ?? null, nowMin, isToday, isPast),
      skillName: meta.get(item.id)?.skillName ?? null,
      projectTitle: meta.get(item.id)?.projectTitle ?? null,
      endTime: `${String(Math.floor((end % 1440) / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    };
  });
  return {
    date,
    template,
    reason,
    slots,
    plannedMinutes: plannedMinutes(items),
    doneCount: slots.filter((s) => s.state === "done").length,
    overlaps: findOverlaps(items),
    next: slots.find((s) => s.state === "now") ?? slots.find((s) => s.state === "upcoming") ?? null,
  };
}

export async function completeRoutineItem(actor: Actor, itemId: string, date: ISODate, opts: { actualMinutes?: number | null; notes?: string | null } = {}) {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, actor, itemId);
    if (compareISO(date, todayOf(actor)) > 0) throw new DomainError("You can't complete a future routine block");
    const [existing] = await tx.select().from(routineCompletions).where(and(eq(routineCompletions.routineItemId, itemId), eq(routineCompletions.date, date)));
    if (existing?.status === "done") return existing;
    if (existing) {
      if (existing.sessionId) await deleteSession(actor, existing.sessionId, tx);
      await tx.delete(routineCompletions).where(eq(routineCompletions.id, existing.id));
    }
    const minutes = opts.actualMinutes ?? item.durationMinutes;
    let sessionId: string | null = null;
    if (item.logAsSession && minutes > 0) {
      // Completing a routine block logs real effort → counts toward targets, skills and analytics.
      const s = await logSession(
        actor,
        {
          activityType: (item.activityType as never) ?? "other",
          title: item.title,
          notes: opts.notes ?? null,
          date,
          startTime: item.startTime.slice(0, 5),
          durationMinutes: minutes,
          quantity: null,
          unit: null,
          lifeAreaId: item.lifeAreaId,
          skillId: item.skillId,
          projectId: item.projectId,
          taskId: null,
          goalId: item.goalId,
        },
        { source: "routine", routineItemId: item.id },
        tx,
      );
      sessionId = s.id;
    }
    const [row] = await tx
      .insert(routineCompletions)
      .values({
        userId: actor.userId,
        routineItemId: itemId,
        date,
        status: "done",
        actualMinutes: minutes,
        sessionId,
        itemTitle: item.title,
        plannedMinutes: item.durationMinutes,
      })
      .returning();
    await recordEvent(tx, actor, {
      type: "routine.item_completed",
      entityType: "routine_item",
      entityId: item.id,
      entityRef: item.ref,
      entityTitle: item.title,
      payload: { date, plannedMinutes: item.durationMinutes, actualMinutes: minutes, sessionId },
    });
    return row;
  });
}

export async function skipRoutineItem(actor: Actor, itemId: string, date: ISODate) {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, actor, itemId);
    const [existing] = await tx.select().from(routineCompletions).where(and(eq(routineCompletions.routineItemId, itemId), eq(routineCompletions.date, date)));
    if (existing?.sessionId) await deleteSession(actor, existing.sessionId, tx);
    if (existing) await tx.delete(routineCompletions).where(eq(routineCompletions.id, existing.id));
    await tx.insert(routineCompletions).values({
      userId: actor.userId,
      routineItemId: itemId,
      date,
      status: "skipped",
      itemTitle: item.title,
      plannedMinutes: item.durationMinutes,
    });
    await recordEvent(tx, actor, { type: "routine.item_skipped", entityType: "routine_item", entityId: item.id, entityRef: item.ref, entityTitle: item.title, payload: { date } });
  });
}

/** Undo a done/skipped mark; the logged session (if any) is removed with it. */
export async function resetRoutineItem(actor: Actor, itemId: string, date: ISODate) {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, actor, itemId);
    const [existing] = await tx.select().from(routineCompletions).where(and(eq(routineCompletions.routineItemId, itemId), eq(routineCompletions.date, date)));
    if (!existing) return;
    if (existing.sessionId) await deleteSession(actor, existing.sessionId, tx);
    await tx.delete(routineCompletions).where(eq(routineCompletions.id, existing.id));
    await recordEvent(tx, actor, { type: "routine.item_reset", entityType: "routine_item", entityId: item.id, entityRef: item.ref, entityTitle: item.title, payload: { date, was: existing.status } });
  });
}

export interface RoutineHistoryDay {
  date: ISODate;
  templateName: string | null;
  scheduled: number;
  done: number;
  skipped: number;
  plannedMinutes: number;
  actualMinutes: number;
}

/**
 * Adherence over the last `days` days. The schedule of a past day is reconstructed from the
 * items that existed on that day (created before it ended and not archived before it began).
 */
export async function routineHistory(actor: Actor, days = 14): Promise<RoutineHistoryDay[]> {
  const today = todayOf(actor);
  const from = addDays(today, -(days - 1));
  const [templates, allItems, completions, plans] = await Promise.all([
    listTemplates(actor.userId, true),
    db.select().from(routineItems).where(eq(routineItems.userId, actor.userId)),
    db.select().from(routineCompletions).where(and(eq(routineCompletions.userId, actor.userId), gte(routineCompletions.date, from), lte(routineCompletions.date, today))),
    listDayPlans(actor.userId, from, today),
  ]);
  const out: RoutineHistoryDay[] = [];
  for (let d = from; compareISO(d, today) <= 0; d = addDays(d, 1)) {
    const dayEnd = new Date(`${addDays(d, 1)}T00:00:00Z`);
    const dayStart = new Date(`${d}T00:00:00Z`);
    const templatesThen = templates.filter((t) => !t.archivedAt || t.archivedAt > dayStart);
    const plan = plans.find((p) => p.date === d);
    const { template } = resolveTemplateForDate(d, templatesThen.map((t) => ({ ...t, archivedAt: null })), plan?.templateId);
    const itemsThen = allItems
      .filter((i) => i.createdAt < dayEnd && (!i.archivedAt || i.archivedAt > dayStart))
      .map((i) => ({ ...i, archivedAt: null }));
    const scheduled = template ? itemsForDate(d, template.id, itemsThen) : [];
    const dayComps = completions.filter((c) => c.date === d);
    out.push({
      date: d,
      templateName: template?.name ?? null,
      scheduled: scheduled.length,
      done: dayComps.filter((c) => c.status === "done").length,
      skipped: dayComps.filter((c) => c.status === "skipped").length,
      plannedMinutes: plannedMinutes(scheduled),
      actualMinutes: dayComps.reduce((s, c) => s + (c.actualMinutes ?? 0), 0),
    });
  }
  return out.reverse();
}
