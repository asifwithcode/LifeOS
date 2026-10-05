import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import { aiMemories, userSettings } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { inTx } from "./_shared";

// Long-term AI memory: durable, user-visible, editable. Never filled from chat automatically —
// entries come from the user or from approved add_memory proposals.

export const MEMORY_KINDS = ["preference", "goal", "decision", "constraint", "plan", "fact"] as const;

export async function addMemory(actor: Actor, input: { content: string; kind: string; source?: "manual" | "ai_suggested"; conversationId?: string | null }, outer?: Tx) {
  const content = input.content.trim();
  if (!content || content.length > 1000) throw new DomainError("Memories must be 1–1000 characters");
  if (!(MEMORY_KINDS as readonly string[]).includes(input.kind)) throw new DomainError("Unknown memory kind");
  return inTx(outer, async (tx) => {
    const ref = await nextRef(tx, actor.userId, "memory");
    const [row] = await tx
      .insert(aiMemories)
      .values({ userId: actor.userId, ref, content, kind: input.kind, source: input.source ?? "manual", sourceConversationId: input.conversationId ?? null })
      .returning();
    await recordEvent(tx, actor, { type: "memory.created", entityType: "memory", entityId: row.id, entityRef: row.ref, entityTitle: content.slice(0, 120), payload: { source: row.source } });
    return row;
  });
}

export async function updateMemory(actor: Actor, id: string, input: { content: string; kind: string }) {
  const content = input.content.trim();
  if (!content || content.length > 1000) throw new DomainError("Memories must be 1–1000 characters");
  if (!(MEMORY_KINDS as readonly string[]).includes(input.kind)) throw new DomainError("Unknown memory kind");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiMemories)
      .set({ content, kind: input.kind, updatedAt: nowOf(actor) })
      .where(and(eq(aiMemories.id, id), eq(aiMemories.userId, actor.userId)))
      .returning();
    if (!row) notFound("Memory");
    await recordEvent(tx, actor, { type: "memory.updated", entityType: "memory", entityId: id, entityRef: row.ref, entityTitle: content.slice(0, 120) });
    return row;
  });
}

export async function setMemoryArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(aiMemories)
      .set({ status: archived ? "archived" : "active", updatedAt: nowOf(actor) })
      .where(and(eq(aiMemories.id, id), eq(aiMemories.userId, actor.userId)))
      .returning();
    if (!row) notFound("Memory");
    if (archived) await recordEvent(tx, actor, { type: "memory.archived", entityType: "memory", entityId: id, entityRef: row.ref, entityTitle: row.content.slice(0, 120) });
  });
}

/** Permanent removal (the user asked to forget it). */
export async function deleteMemory(actor: Actor, id: string) {
  const rows = await db.delete(aiMemories).where(and(eq(aiMemories.id, id), eq(aiMemories.userId, actor.userId))).returning({ id: aiMemories.id });
  if (!rows.length) notFound("Memory");
}

export async function listMemories(userId: string, status: "active" | "archived" = "active") {
  return db
    .select()
    .from(aiMemories)
    .where(and(eq(aiMemories.userId, userId), eq(aiMemories.status, status)))
    .orderBy(desc(aiMemories.updatedAt));
}

export async function setMemoryEnabled(userId: string, enabled: boolean) {
  await db.update(userSettings).set({ memoryEnabled: enabled, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
}

export async function setAiPrivacy(userId: string, privacy: Record<string, boolean>) {
  await db.update(userSettings).set({ aiPrivacy: privacy, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
}
