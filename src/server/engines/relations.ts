import { and, eq, or, sql } from "drizzle-orm";
import type { EntityType, RelationType } from "@/lib/domain/constants";
import { db, type Tx } from "@/server/db";
import { entityRelations, searchIndex } from "@/server/db/schema";
import type { Actor } from "./actor";
import { recordEvent } from "./activity";
import { DomainError } from "./errors";

export interface EntityKey {
  type: EntityType;
  id: string;
}

async function lookup(tx: Tx, userId: string, key: EntityKey) {
  const [row] = await tx
    .select({ title: searchIndex.title, ref: searchIndex.ref })
    .from(searchIndex)
    .where(and(eq(searchIndex.userId, userId), eq(searchIndex.entityType, key.type), eq(searchIndex.entityId, key.id)))
    .limit(1);
  return row ?? null;
}

/** Creates a typed link between two of the user's entities (idempotent). */
export async function link(tx: Tx, actor: Actor, source: EntityKey, target: EntityKey, relationType: RelationType = "related") {
  if (source.type === target.type && source.id === target.id) throw new DomainError("An item can't be linked to itself");
  const [s, t] = await Promise.all([lookup(tx, actor.userId, source), lookup(tx, actor.userId, target)]);
  if (!s || !t) throw new DomainError("Item not found", "not_found");
  const inserted = await tx
    .insert(entityRelations)
    .values({
      userId: actor.userId,
      sourceType: source.type,
      sourceId: source.id,
      targetType: target.type,
      targetId: target.id,
      relationType,
    })
    .onConflictDoNothing()
    .returning({ id: entityRelations.id });
  if (inserted.length && relationType !== "mentions") {
    await recordEvent(tx, actor, {
      type: "entity.linked",
      entityType: source.type,
      entityId: source.id,
      entityRef: s.ref,
      entityTitle: s.title,
      payload: { targetType: target.type, targetId: target.id, targetRef: t.ref, targetTitle: t.title, relationType },
    });
  }
}

export async function unlinkById(tx: Tx, actor: Actor, relationId: string) {
  const [rel] = await tx
    .delete(entityRelations)
    .where(and(eq(entityRelations.userId, actor.userId), eq(entityRelations.id, relationId)))
    .returning();
  if (!rel) throw new DomainError("Link not found", "not_found");
  const s = await lookup(tx, actor.userId, { type: rel.sourceType as EntityType, id: rel.sourceId });
  await recordEvent(tx, actor, {
    type: "entity.unlinked",
    entityType: rel.sourceType as EntityType,
    entityId: rel.sourceId,
    entityRef: s?.ref ?? null,
    entityTitle: s?.title ?? "Item",
    payload: { targetType: rel.targetType, targetId: rel.targetId, relationType: rel.relationType },
  });
}

/** Replace all outgoing relations of one type (used for note [[REF]] mentions). */
export async function syncOutgoing(tx: Tx, userId: string, source: EntityKey, relationType: RelationType, targets: EntityKey[]) {
  await tx
    .delete(entityRelations)
    .where(
      and(
        eq(entityRelations.userId, userId),
        eq(entityRelations.sourceType, source.type),
        eq(entityRelations.sourceId, source.id),
        eq(entityRelations.relationType, relationType),
      ),
    );
  const unique = targets.filter(
    (t, i) => !(t.type === source.type && t.id === source.id) && targets.findIndex((u) => u.type === t.type && u.id === t.id) === i,
  );
  if (unique.length) {
    await tx
      .insert(entityRelations)
      .values(
        unique.map((t) => ({
          userId,
          sourceType: source.type,
          sourceId: source.id,
          targetType: t.type,
          targetId: t.id,
          relationType,
        })),
      )
      .onConflictDoNothing();
  }
}

export interface RelatedItem {
  relationId: string;
  relationType: RelationType;
  direction: "outgoing" | "incoming";
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
  urlPath: string;
  archived: boolean;
}

/** All links touching an entity, in both directions, resolved through the search index. */
export async function listRelated(userId: string, key: EntityKey): Promise<RelatedItem[]> {
  const rows = await db
    .select({
      relationId: entityRelations.id,
      relationType: entityRelations.relationType,
      sourceType: entityRelations.sourceType,
      sourceId: entityRelations.sourceId,
      targetType: entityRelations.targetType,
      targetId: entityRelations.targetId,
      ref: searchIndex.ref,
      title: searchIndex.title,
      urlPath: searchIndex.urlPath,
      archived: searchIndex.archived,
    })
    .from(entityRelations)
    .innerJoin(
      searchIndex,
      sql`${searchIndex.userId} = ${entityRelations.userId} AND (
        (${entityRelations.sourceType} = ${key.type} AND ${entityRelations.sourceId} = ${key.id}
          AND ${searchIndex.entityType} = ${entityRelations.targetType} AND ${searchIndex.entityId} = ${entityRelations.targetId})
        OR
        (${entityRelations.targetType} = ${key.type} AND ${entityRelations.targetId} = ${key.id}
          AND ${searchIndex.entityType} = ${entityRelations.sourceType} AND ${searchIndex.entityId} = ${entityRelations.sourceId}))`,
    )
    .where(
      and(
        eq(entityRelations.userId, userId),
        or(
          and(eq(entityRelations.sourceType, key.type), eq(entityRelations.sourceId, key.id)),
          and(eq(entityRelations.targetType, key.type), eq(entityRelations.targetId, key.id)),
        ),
      ),
    );
  return rows.map((r) => {
    const outgoing = r.sourceType === key.type && r.sourceId === key.id;
    return {
      relationId: r.relationId,
      relationType: r.relationType as RelationType,
      direction: outgoing ? "outgoing" : "incoming",
      entityType: (outgoing ? r.targetType : r.sourceType) as EntityType,
      entityId: outgoing ? r.targetId : r.sourceId,
      ref: r.ref,
      title: r.title,
      urlPath: r.urlPath,
      archived: r.archived,
    };
  });
}

/** Removes every relation touching an entity (on hard delete). */
export async function removeAllRelations(tx: Tx, userId: string, key: EntityKey) {
  await tx
    .delete(entityRelations)
    .where(
      and(
        eq(entityRelations.userId, userId),
        or(
          and(eq(entityRelations.sourceType, key.type), eq(entityRelations.sourceId, key.id)),
          and(eq(entityRelations.targetType, key.type), eq(entityRelations.targetId, key.id)),
        ),
      ),
    );
}
