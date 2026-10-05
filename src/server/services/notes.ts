import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { extractRefMentions } from "@/lib/domain/refs";
import type { NoteInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { lifeAreas, notes, type Note } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, type Actor } from "@/server/engines/actor";
import { notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { syncOutgoing } from "@/server/engines/relations";
import { indexEntity, removeFromIndex, resolveRefs } from "@/server/engines/search";
import { assertOwned, inTx } from "./_shared";
import { getTagsFor, setEntityTags } from "./tags";

async function reindex(tx: Tx, actor: Actor, n: Note) {
  if (n.deletedAt) return removeFromIndex(tx, actor.userId, "note", n.id);
  await indexEntity(tx, actor.userId, { entityType: "note", entityId: n.id, ref: n.ref, title: n.title, body: n.content, archived: !!n.archivedAt });
}

/** Materialise [[REF]] mentions as relations so backlinks work everywhere. */
async function syncMentions(tx: Tx, actor: Actor, n: Note) {
  const refs = extractRefMentions(n.content);
  const resolved = await resolveRefs(tx, actor.userId, refs);
  await syncOutgoing(tx, actor.userId, { type: "note", id: n.id }, "mentions", resolved.map((r) => ({ type: r.entityType, id: r.entityId })));
}

export async function createNote(actor: Actor, input: NoteInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const ref = await nextRef(tx, actor.userId, "note");
    const [row] = await tx
      .insert(notes)
      .values({ userId: actor.userId, ref, title: input.title, content: input.content, collection: input.collection, pinned: input.pinned, lifeAreaId: input.lifeAreaId })
      .returning();
    await setEntityTags(tx, actor.userId, "note", row.id, input.tags);
    await reindex(tx, actor, row);
    await syncMentions(tx, actor, row);
    await recordEvent(tx, actor, { type: "note.created", entityType: "note", entityId: row.id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

async function loadOwned(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(notes).where(and(eq(notes.id, id), eq(notes.userId, actor.userId))).limit(1);
  if (!row) notFound("Note");
  return row;
}

export async function updateNote(actor: Actor, id: string, input: NoteInput) {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const [row] = await tx
      .update(notes)
      .set({ title: input.title, content: input.content, collection: input.collection, pinned: input.pinned, lifeAreaId: input.lifeAreaId, updatedAt: nowOf(actor) })
      .where(eq(notes.id, id))
      .returning();
    await setEntityTags(tx, actor.userId, "note", id, input.tags);
    await reindex(tx, actor, row);
    await syncMentions(tx, actor, row);
    // Collapse rapid autosaves: one "edited" event per note per 30 minutes.
    const recentlyEdited = before.updatedAt.getTime() > nowOf(actor).getTime() - 30 * 60_000 && before.createdAt.getTime() !== before.updatedAt.getTime();
    if (!recentlyEdited || before.title !== row.title) {
      await recordEvent(tx, actor, { type: "note.updated", entityType: "note", entityId: id, entityRef: row.ref, entityTitle: row.title });
    }
    return row;
  });
}

export async function setNotePinned(actor: Actor, id: string, pinned: boolean) {
  await db.update(notes).set({ pinned }).where(and(eq(notes.id, id), eq(notes.userId, actor.userId)));
}

export async function setNoteArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(notes).set({ archivedAt: archived ? nowOf(actor) : null }).where(eq(notes.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "note.archived" : "note.restored", entityType: "note", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function setNoteDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(notes).set({ deletedAt: deleted ? nowOf(actor) : null }).where(eq(notes.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: deleted ? "note.deleted" : "note.restored", entityType: "note", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function listNotes(actor: Actor, opts: { collection?: string; tag?: string; view?: "active" | "archived" | "trash"; q?: string } = {}) {
  const view = opts.view ?? "active";
  const conds: SQL[] = [eq(notes.userId, actor.userId)];
  if (view === "trash") conds.push(isNotNull(notes.deletedAt));
  else {
    conds.push(isNull(notes.deletedAt));
    conds.push(view === "archived" ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt));
  }
  if (opts.collection) conds.push(eq(notes.collection, opts.collection));
  if (opts.q) conds.push(sql`(${notes.title} ILIKE ${"%" + opts.q + "%"} OR ${notes.content} ILIKE ${"%" + opts.q + "%"})`);
  if (opts.tag) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'note' AND et.entity_id = ${notes.id} AND tg.name = ${opts.tag.toLowerCase()})`,
    );
  }
  const rows = await db
    .select({
      id: notes.id,
      ref: notes.ref,
      title: notes.title,
      excerpt: sql<string>`left(regexp_replace(${notes.content}, '[#*_>\`\\[\\]-]+', '', 'g'), 180)`,
      collection: notes.collection,
      pinned: notes.pinned,
      updatedAt: notes.updatedAt,
      lifeAreaName: lifeAreas.name,
    })
    .from(notes)
    .leftJoin(lifeAreas, eq(lifeAreas.id, notes.lifeAreaId))
    .where(and(...conds))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt));
  const tagMap = await getTagsFor(actor.userId, "note", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export async function listCollections(userId: string) {
  const rows = await db
    .select({ collection: notes.collection, count: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.deletedAt), isNull(notes.archivedAt), isNotNull(notes.collection)))
    .groupBy(notes.collection)
    .orderBy(asc(notes.collection));
  return rows.map((r) => ({ name: r.collection!, count: r.count }));
}

export async function getNoteByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, actor.userId), eq(notes.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const tagMap = await getTagsFor(actor.userId, "note", [row.id]);
  return { ...row, tags: tagMap.get(row.id) ?? [] };
}
