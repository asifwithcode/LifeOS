import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { EntityType } from "@/lib/domain/constants";
import { db, type Tx } from "@/server/db";
import { entityTags, tags } from "@/server/db/schema";

/** Replace the tag set of an entity, creating tags as needed. */
export async function setEntityTags(tx: Tx, userId: string, entityType: EntityType, entityId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
  await tx.delete(entityTags).where(and(eq(entityTags.userId, userId), eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)));
  if (clean.length === 0) return;
  await tx.insert(tags).values(clean.map((name) => ({ userId, name }))).onConflictDoNothing();
  const rows = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, userId), inArray(tags.name, clean)));
  await tx
    .insert(entityTags)
    .values(rows.map((r) => ({ userId, tagId: r.id, entityType, entityId })))
    .onConflictDoNothing();
}

/** Map of entityId → tag names. */
export async function getTagsFor(userId: string, entityType: EntityType, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ entityId: entityTags.entityId, name: tags.name })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(and(eq(entityTags.userId, userId), eq(entityTags.entityType, entityType), inArray(entityTags.entityId, ids)))
    .orderBy(tags.name);
  for (const r of rows) {
    const list = map.get(r.entityId) ?? [];
    list.push(r.name);
    map.set(r.entityId, list);
  }
  return map;
}

export async function listTags(userId: string) {
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name);
}
