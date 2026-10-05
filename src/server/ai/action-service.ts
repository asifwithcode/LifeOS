import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { entityUrl, type EntityType } from "@/lib/domain/constants";
import { addDays } from "@/lib/domain/dates";
import { db, type Tx } from "@/server/db";
import { aiActions, searchIndex, tasks, type AiAction } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { link } from "@/server/engines/relations";
import { addAdjustment } from "@/server/services/adjustments";
import { createGoal } from "@/server/services/goals";
import { addMemory } from "@/server/services/memory";
import { addMilestone } from "@/server/services/milestones";
import { createNote } from "@/server/services/notes";
import { convertIdeaToProject, createIdea, createProject } from "@/server/services/projects";
import { logSession } from "@/server/services/sessions";
import { createTarget } from "@/server/services/targets";
import { createTask, setTaskStatus, updateTask } from "@/server/services/tasks";
import { getTagsFor } from "@/server/services/tags";
import { ACTION_LABEL, REF_FIELD_TYPE, collectRefs, describeAction, validateAction, type ActionKind, type ActionPayload } from "./actions";

type Resolved = Map<string, { type: EntityType; id: string; title: string }>;

/** Resolve refs within the user's own data only. Unknown or deleted refs are errors, never guesses. */
async function resolveAll(tx: Tx, userId: string, refs: string[]): Promise<Resolved> {
  const map: Resolved = new Map();
  if (!refs.length) return map;
  const rows = await tx
    .select({ ref: searchIndex.ref, type: searchIndex.entityType, id: searchIndex.entityId, title: searchIndex.title })
    .from(searchIndex)
    .where(and(eq(searchIndex.userId, userId), inArray(searchIndex.ref, refs)));
  for (const r of rows) if (r.ref) map.set(r.ref, { type: r.type as EntityType, id: r.id, title: r.title });
  return map;
}

function checkRefs(kind: ActionKind, payload: Record<string, unknown>, resolved: Resolved): string | null {
  for (const ref of collectRefs(payload)) if (!resolved.has(ref)) return `No item ${ref} exists in your data`;
  const walk = (v: unknown): string | null => {
    if (Array.isArray(v)) {
      for (const x of v) {
        const e = walk(x);
        if (e) return e;
      }
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (REF_FIELD_TYPE[k] && typeof x === "string" && resolved.get(x)?.type !== REF_FIELD_TYPE[k]) return `${x} is not a ${REF_FIELD_TYPE[k]}`;
        const e = walk(x);
        if (e) return e;
      }
    }
    return null;
  };
  void kind;
  return walk(payload);
}

export interface ProposalInput {
  conversationId?: string | null;
  messageId?: string | null;
  kind: string;
  payload: unknown;
}

/** Validate and store a proposal. Nothing is changed in the user's data. */
export async function proposeAction(actor: Actor, input: ProposalInput) {
  const v = validateAction(input.kind, input.payload);
  if (!v.ok) throw new DomainError(v.error);
  return db.transaction(async (tx) => {
    const resolved = await resolveAll(tx, actor.userId, collectRefs(v.payload));
    const refErr = checkRefs(v.kind, v.payload, resolved);
    if (refErr) throw new DomainError(refErr);
    const { summary } = describeAction(v.kind, v.payload);
    const ref = await nextRef(tx, actor.userId, "ai_action");
    const [row] = await tx
      .insert(aiActions)
      .values({ userId: actor.userId, ref, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null, kind: v.kind, payload: v.payload, summary })
      .returning();
    return row;
  });
}

interface Created {
  type: EntityType;
  ref: string | null;
  title: string;
  url: string;
}

const created = (type: EntityType, ref: string | null, title: string): Created => ({ type, ref, title, url: entityUrl(type, ref) });

/** Runs an approved action through the same services the UI uses, inside one transaction. */
async function execute(tx: Tx, actor: Actor, kind: ActionKind, p: Record<string, unknown>, conversationId: string | null): Promise<Created[]> {
  const resolved = await resolveAll(tx, actor.userId, collectRefs(p));
  const refErr = checkRefs(kind, p, resolved);
  if (refErr) throw new DomainError(refErr);
  const id = (r: unknown) => (typeof r === "string" ? (resolved.get(r)?.id ?? null) : null);
  const today = todayOf(actor);
  const taskBase = { description: null, status: "todo" as const, priority: "none" as const, dueDate: null, startDate: null, someday: false, estimatedMinutes: null, recurrence: null, parentTaskId: null, projectId: null, goalId: null, skillId: null, milestoneId: null, lifeAreaId: null, tags: [] as string[] };
  const out: Created[] = [];

  switch (kind) {
    case "create_task": {
      const a = p as ActionPayload<"create_task">;
      const t = await createTask(actor, { ...taskBase, title: a.title, description: a.description ?? null, dueDate: a.dueDate ?? null, priority: a.priority ?? "none", estimatedMinutes: a.estimatedMinutes ?? null, projectId: id(a.projectRef), goalId: id(a.goalRef), skillId: id(a.skillRef), someday: !a.dueDate }, tx);
      out.push(created("task", t.ref, t.title));
      break;
    }
    case "update_task": {
      const a = p as ActionPayload<"update_task">;
      const taskId = id(a.ref)!;
      const [cur] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
      const tagMap = await getTagsFor(actor.userId, "task", [taskId]);
      if (a.title !== undefined || a.dueDate !== undefined || a.priority !== undefined) {
        await updateTask(actor, taskId, {
          ...taskBase,
          title: a.title ?? cur.title,
          description: cur.description,
          status: cur.status as typeof taskBase.status,
          priority: a.priority ?? (cur.priority as typeof taskBase.priority),
          dueDate: a.dueDate === undefined ? cur.dueDate : a.dueDate,
          startDate: cur.startDate,
          someday: a.dueDate ? false : cur.someday,
          estimatedMinutes: cur.estimatedMinutes,
          recurrence: cur.recurrence ? { ...cur.recurrence } : null,
          parentTaskId: cur.parentTaskId,
          projectId: cur.projectId,
          goalId: cur.goalId,
          skillId: cur.skillId,
          milestoneId: cur.milestoneId,
          lifeAreaId: cur.lifeAreaId,
          tags: tagMap.get(taskId) ?? [],
        });
      }
      if (a.status) await setTaskStatus(actor, taskId, a.status, tx);
      out.push(created("task", a.ref, a.title ?? cur.title));
      break;
    }
    case "create_goal": {
      const a = p as ActionPayload<"create_goal">;
      const g = await createGoal(actor, { title: a.title, description: a.description ?? null, why: a.why ?? null, lifeAreaId: null, status: "active", priority: "medium", startDate: today, targetDate: a.targetDate ?? null, progressMode: "milestones" }, tx);
      for (const m of a.milestones ?? []) await addMilestone(actor, { goalId: g.id }, { title: m.title, description: null, weight: m.weight ?? 1, dueDate: m.dueDate ?? null }, tx);
      out.push(created("goal", g.ref, g.title));
      break;
    }
    case "create_target": {
      const a = p as ActionPayload<"create_target">;
      const t = await createTarget(actor, { title: a.title, description: null, period: a.period, customStart: null, customEnd: null, amount: a.amount, unit: a.unit, customUnit: a.customUnit ?? null, activityType: a.activityType ?? null, lifeAreaId: null, skillId: id(a.skillRef), projectId: id(a.projectRef), goalId: id(a.goalRef) }, tx);
      out.push(created("target", t.ref, t.title));
      break;
    }
    case "create_project": {
      const a = p as ActionPayload<"create_project">;
      const pr = await createProject(actor, { title: a.title, summary: a.summary ?? null, description: a.description ?? null, status: "active", priority: "medium", lifeAreaId: null, goalId: id(a.goalRef), startDate: today, targetDate: null, progressMode: "milestones", tags: [] }, {}, tx);
      for (const m of a.milestones ?? []) {
        const ms = await addMilestone(actor, { projectId: pr.id }, { title: m.title, description: null, weight: m.weight ?? 1, dueDate: m.dueDate ?? null }, tx);
        for (const t of m.tasks ?? []) await createTask(actor, { ...taskBase, title: t.title, dueDate: t.dueDate ?? null, estimatedMinutes: t.estimatedMinutes ?? null, projectId: pr.id, milestoneId: ms.id }, tx);
      }
      out.push(created("project", pr.ref, pr.title));
      break;
    }
    case "create_plan": {
      // A plan becomes a goal measured by milestones; each milestone carries its tasks; targets measure the goal.
      const a = p as ActionPayload<"create_plan">;
      const g = await createGoal(actor, { title: a.title, description: null, why: a.why ?? null, lifeAreaId: null, status: "active", priority: "medium", startDate: today, targetDate: a.targetDate ?? null, progressMode: "milestones" }, tx);
      out.push(created("goal", g.ref, g.title));
      let n = 0;
      for (const m of a.milestones) {
        const ms = await addMilestone(actor, { goalId: g.id }, { title: m.title, description: null, weight: m.weight ?? 1, dueDate: m.dueDate ?? null }, tx);
        for (const t of m.tasks ?? []) {
          await createTask(actor, { ...taskBase, title: t.title, dueDate: t.dueDate ?? null, someday: !t.dueDate, estimatedMinutes: t.estimatedMinutes ?? null, goalId: g.id, milestoneId: ms.id }, tx);
          n++;
        }
      }
      for (const t of a.targets ?? []) {
        const tg = await createTarget(actor, { title: t.title, description: null, period: t.period, customStart: null, customEnd: null, amount: t.amount, unit: t.unit, customUnit: t.customUnit ?? null, activityType: t.activityType ?? null, lifeAreaId: null, skillId: id(t.skillRef), projectId: id(t.projectRef), goalId: g.id }, tx);
        out.push(created("target", tg.ref, tg.title));
      }
      if (n) out.push({ type: "task", ref: null, title: `${n} tasks`, url: "/tasks?view=all" });
      break;
    }
    case "save_note": {
      const a = p as ActionPayload<"save_note">;
      const n = await createNote(actor, { title: a.title, content: a.content, collection: a.collection ?? "AI", pinned: false, lifeAreaId: null, tags: [] }, tx);
      out.push(created("note", n.ref, n.title));
      break;
    }
    case "create_idea": {
      const a = p as ActionPayload<"create_idea">;
      const i = await createIdea(actor, { title: a.title, description: a.description ?? null, category: null, status: "captured", lifeAreaId: null, tags: [] }, tx);
      out.push(created("idea", i.ref, i.title));
      break;
    }
    case "log_session": {
      const a = p as ActionPayload<"log_session">;
      const s = await logSession(actor, { activityType: a.activityType, title: a.title, notes: null, date: a.date ?? today, startTime: null, durationMinutes: a.durationMinutes ?? null, quantity: a.quantity ?? null, unit: a.unit ?? null, lifeAreaId: null, skillId: id(a.skillRef), projectId: id(a.projectRef), taskId: id(a.taskRef), goalId: null }, {}, tx);
      out.push(created("session", s.ref, s.title));
      break;
    }
    case "add_memory": {
      const a = p as ActionPayload<"add_memory">;
      const m = await addMemory(actor, { content: a.content, kind: a.kind, source: "ai_suggested", conversationId }, tx);
      out.push(created("memory", m.ref, m.content.slice(0, 80)));
      break;
    }
    case "link_entities": {
      const a = p as ActionPayload<"link_entities">;
      const s = resolved.get(a.sourceRef)!;
      const t = resolved.get(a.targetRef)!;
      await link(tx, actor, { type: s.type, id: s.id }, { type: t.type, id: t.id }, "related");
      out.push(created(s.type, a.sourceRef, s.title));
      break;
    }
    case "convert_idea": {
      const a = p as ActionPayload<"convert_idea">;
      const pr = await convertIdeaToProject(actor, id(a.ref)!, tx);
      out.push(created("project", pr.ref, pr.title));
      break;
    }
    case "add_routine_block": {
      const a = p as ActionPayload<"add_routine_block">;
      const date = a.date ?? today;
      if (date < today || date > addDays(today, 30)) throw new DomainError("Planned blocks must be within the next 30 days");
      const adj = await addAdjustment(actor, { date, title: a.title, startTime: a.startTime, durationMinutes: a.durationMinutes, activityType: a.activityType ?? null, taskId: id(a.taskRef), source: "ai" }, tx);
      out.push({ type: "routine_item", ref: null, title: adj.title, url: `/today?date=${date}` });
      break;
    }
  }
  return out;
}

async function loadProposed(tx: Tx, actor: Actor, id: string): Promise<AiAction> {
  const [row] = await tx.select().from(aiActions).where(and(eq(aiActions.id, id), eq(aiActions.userId, actor.userId))).for("update");
  if (!row) notFound("Proposed action");
  if (row.status !== "proposed") throw new DomainError(`This action was already ${row.status}`, "conflict");
  return row;
}

/**
 * Approve (optionally with an edited payload) and execute. Failures are recorded on the action
 * (audit trail) and nothing partial is kept: the whole action runs in one transaction.
 */
export async function approveAction(actor: Actor, actionId: string, editedPayload?: unknown) {
  // Claim the proposal first so double-clicks can't execute twice.
  const action = await db.transaction(async (tx) => {
    const row = await loadProposed(tx, actor, actionId);
    await tx.update(aiActions).set({ status: "executing", decidedAt: nowOf(actor) }).where(eq(aiActions.id, row.id));
    return row;
  });
  const v = validateAction(action.kind, editedPayload ?? action.payload);
  try {
    if (!v.ok) throw new DomainError(v.error);
    const result = await db.transaction(async (tx) => {
      const createdItems = await execute(tx, actor, v.kind, v.payload, action.conversationId);
      await tx
        .update(aiActions)
        .set({ status: "executed", payload: v.payload, summary: describeAction(v.kind, v.payload).summary, result: { created: createdItems } })
        .where(eq(aiActions.id, action.id));
      await recordEvent(tx, actor, {
        type: "ai.action_executed",
        entityType: "ai_action",
        entityId: action.id,
        entityRef: action.ref,
        entityTitle: describeAction(v.kind, v.payload).summary,
        payload: { kind: v.kind, created: createdItems.map((c) => c.ref).filter(Boolean), edited: editedPayload !== undefined },
      });
      return createdItems;
    });
    return { status: "executed" as const, created: result };
  } catch (err) {
    const message = err instanceof DomainError ? err.message : "Execution failed";
    if (!(err instanceof DomainError)) console.error("[ai action]", err);
    await db.update(aiActions).set({ status: "failed", error: message }).where(eq(aiActions.id, action.id));
    throw new DomainError(message);
  }
}

export async function rejectAction(actor: Actor, actionId: string) {
  return db.transaction(async (tx) => {
    const row = await loadProposed(tx, actor, actionId);
    await tx.update(aiActions).set({ status: "rejected", decidedAt: nowOf(actor) }).where(eq(aiActions.id, row.id));
    await recordEvent(tx, actor, { type: "ai.action_rejected", entityType: "ai_action", entityId: row.id, entityRef: row.ref, entityTitle: row.summary, payload: { kind: row.kind } });
  });
}

/** Lets a failed action be retried (e.g. after editing). */
export async function reopenFailedAction(actor: Actor, actionId: string) {
  await db
    .update(aiActions)
    .set({ status: "proposed", error: null })
    .where(and(eq(aiActions.id, actionId), eq(aiActions.userId, actor.userId), eq(aiActions.status, "failed")));
}

export async function listActions(userId: string, conversationId: string) {
  return db.select().from(aiActions).where(and(eq(aiActions.userId, userId), eq(aiActions.conversationId, conversationId))).orderBy(asc(aiActions.createdAt));
}

export async function pendingActionCount(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(aiActions).where(and(eq(aiActions.userId, userId), eq(aiActions.status, "proposed")));
  return r.n;
}

export function presentAction(a: AiAction) {
  const kind = a.kind as ActionKind;
  const { details } = describeAction(kind, a.payload);
  return {
    id: a.id,
    ref: a.ref,
    kind,
    label: ACTION_LABEL[kind] ?? a.kind,
    summary: a.summary,
    details,
    reason: typeof a.payload.reason === "string" ? a.payload.reason : null,
    payload: a.payload,
    status: a.status,
    error: a.error,
    created: ((a.result?.created as Created[] | undefined) ?? []).map((c) => ({ ...c })),
    messageId: a.messageId,
  };
}
export type PresentedAction = ReturnType<typeof presentAction>;
