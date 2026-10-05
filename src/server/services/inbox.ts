import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ENTITY_LABEL, entityUrl, type EntityType } from "@/lib/domain/constants";
import { ruleBasedClassifier, type CaptureClassifier, type CaptureSuggestion } from "@/lib/domain/capture";
import { addDays } from "@/lib/domain/dates";
import type { InboxConvertInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { inboxItems, projects, type InboxItem } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { createGoal } from "./goals";
import { createNote } from "./notes";
import { createIdea, createProject } from "./projects";
import { createSkill } from "./skills";
import { createTask } from "./tasks";

// Phase 2 swaps in an AI classifier with the same interface.
const classifier: CaptureClassifier = ruleBasedClassifier;

async function projectContext(userId: string) {
  return db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.deletedAt), isNull(projects.archivedAt), inArray(projects.status, ["planned", "active", "on_hold"])));
}

export async function suggestFor(actor: Actor, content: string): Promise<CaptureSuggestion> {
  return classifier.classify(content, { projects: await projectContext(actor.userId) });
}

export async function capture(actor: Actor, content: string, kindHint: string | null = null) {
  const suggestion = await suggestFor(actor, content);
  return db.transaction(async (tx) => {
    const ref = await nextRef(tx, actor.userId, "inbox_item");
    const [row] = await tx
      .insert(inboxItems)
      .values({ userId: actor.userId, ref, content: content.trim(), url: suggestion.url ?? null, kindHint, suggestion })
      .returning();
    await recordEvent(tx, actor, {
      type: "inbox.captured",
      entityType: "inbox_item",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: suggestion.title,
      payload: { suggestedType: suggestion.type },
    });
    return row;
  });
}

async function loadPending(tx: Tx, actor: Actor, id: string): Promise<InboxItem> {
  const [row] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, actor.userId))).limit(1);
  if (!row) notFound("Inbox item");
  if (row.status !== "pending") throw new DomainError("This item was already processed", "conflict");
  return row;
}

export interface ConvertResult {
  entityType: EntityType;
  id: string;
  ref: string;
  url: string;
}

/** Turns an inbox item into a real entity; the original text is preserved in the description. */
export async function convertInboxItem(actor: Actor, id: string, input: InboxConvertInput): Promise<ConvertResult> {
  return db.transaction(async (tx) => {
    const item = await loadPending(tx, actor, id);
    const body = item.content.trim() === input.title.trim() ? null : item.content;
    const today = todayOf(actor);
    let result: { entityType: EntityType; id: string; ref: string };
    switch (input.destination) {
      case "task": {
        const t = await createTask(
          actor,
          {
            title: input.title,
            description: body,
            status: "todo",
            priority: input.priority ?? "none",
            dueDate: input.dueDate,
            startDate: null,
            someday: !input.dueDate,
            estimatedMinutes: null,
            recurrence: null,
            parentTaskId: null,
            projectId: input.projectId,
            goalId: null,
            skillId: null,
            milestoneId: null,
            lifeAreaId: null,
            tags: input.tags,
          },
          tx,
        );
        result = { entityType: "task", id: t.id, ref: t.ref };
        break;
      }
      case "note": {
        const n = await createNote(actor, { title: input.title, content: item.content, collection: "Inbox", pinned: false, lifeAreaId: null, tags: input.tags }, tx);
        result = { entityType: "note", id: n.id, ref: n.ref };
        break;
      }
      case "idea": {
        const i = await createIdea(actor, { title: input.title, description: body, category: null, status: "captured", lifeAreaId: null, tags: input.tags }, tx);
        result = { entityType: "idea", id: i.id, ref: i.ref };
        break;
      }
      case "project": {
        const p = await createProject(
          actor,
          { title: input.title, summary: null, description: body, status: "planned", priority: "medium", lifeAreaId: null, goalId: null, startDate: today, targetDate: null, progressMode: "milestones", tags: input.tags },
          {},
          tx,
        );
        result = { entityType: "project", id: p.id, ref: p.ref };
        break;
      }
      case "goal": {
        const g = await createGoal(
          actor,
          { title: input.title, description: body, why: null, lifeAreaId: null, status: "active", priority: "medium", startDate: today, targetDate: null, progressMode: "milestones" },
          tx,
        );
        result = { entityType: "goal", id: g.id, ref: g.ref };
        break;
      }
      case "skill": {
        const s = await createSkill(
          actor,
          { name: input.title, description: body, category: "technical", lifeAreaId: null, currentLevel: 0, targetLevel: 3, status: "active" },
          [],
          tx,
        );
        result = { entityType: "skill", id: s.id, ref: s.ref };
        break;
      }
    }
    await tx
      .update(inboxItems)
      .set({ status: "processed", processedEntityType: result.entityType, processedEntityId: result.id, processedAt: nowOf(actor) })
      .where(eq(inboxItems.id, item.id));
    await recordEvent(tx, actor, {
      type: "inbox.processed",
      entityType: "inbox_item",
      entityId: item.id,
      entityRef: item.ref,
      entityTitle: input.title,
      payload: { into: result.entityType, ref: result.ref, label: ENTITY_LABEL[result.entityType] },
    });
    return { ...result, url: entityUrl(result.entityType, result.ref) };
  });
}

/** Default conversion straight from the stored suggestion (used by bulk actions). */
export function defaultConversion(item: InboxItem, today: string): InboxConvertInput {
  const s = item.suggestion;
  const destination = s && s.type !== "resource" ? s.type : "note";
  return {
    destination,
    title: s?.title || item.content.slice(0, 120),
    projectId: destination === "task" ? (s?.projectId ?? null) : null,
    priority: s?.priority,
    dueDate: s?.dueHint === "today" ? today : s?.dueHint === "tomorrow" ? addDays(today, 1) : null,
    tags: s?.tags ?? [],
  };
}

export async function bulkAccept(actor: Actor, ids: string[]) {
  const items = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, actor.userId), inArray(inboxItems.id, ids), eq(inboxItems.status, "pending")));
  const today = todayOf(actor);
  const results: ConvertResult[] = [];
  for (const item of items) results.push(await convertInboxItem(actor, item.id, defaultConversion(item, today)));
  return results;
}

export async function discardInboxItems(actor: Actor, ids: string[]) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(inboxItems)
      .set({ status: "discarded", processedAt: nowOf(actor) })
      .where(and(eq(inboxItems.userId, actor.userId), inArray(inboxItems.id, ids), eq(inboxItems.status, "pending")))
      .returning();
    for (const r of rows) {
      await recordEvent(tx, actor, {
        type: "inbox.discarded",
        entityType: "inbox_item",
        entityId: r.id,
        entityRef: r.ref,
        entityTitle: r.suggestion?.title ?? r.content.slice(0, 80),
      });
    }
    return rows.length;
  });
}

export async function restoreInboxItem(actor: Actor, id: string) {
  await db
    .update(inboxItems)
    .set({ status: "pending", processedAt: null })
    .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, actor.userId), eq(inboxItems.status, "discarded")));
}

export async function listInbox(actor: Actor, status: "pending" | "processed" | "discarded" = "pending") {
  return db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, actor.userId), eq(inboxItems.status, status)))
    .orderBy(desc(inboxItems.createdAt))
    .limit(status === "pending" ? 500 : 100);
}

export async function inboxCount(userId: string) {
  const rows = await db
    .select({ id: inboxItems.id })
    .from(inboxItems)
    .where(and(eq(inboxItems.userId, userId), eq(inboxItems.status, "pending")));
  return rows.length;
}

/** Re-run classification (e.g. after creating the project it mentions). */
export async function reclassify(actor: Actor, id: string) {
  const [item] = await db.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, actor.userId)));
  if (!item) notFound("Inbox item");
  const suggestion = await suggestFor(actor, item.content);
  await db.update(inboxItems).set({ suggestion }).where(eq(inboxItems.id, id));
  return suggestion;
}
