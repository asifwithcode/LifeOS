import { and, eq, inArray, sql } from "drizzle-orm";
import { entityUrl, type EntityType } from "@/lib/domain/constants";
import { db, type Tx } from "@/server/db";
import { searchIndex } from "@/server/db/schema";

export interface IndexDoc {
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
  body?: string | null;
  archived?: boolean;
}

/** Upserts the search document for an entity. Called by services on every write. */
export async function indexEntity(tx: Tx, userId: string, doc: IndexDoc) {
  const values = {
    userId,
    entityType: doc.entityType,
    entityId: doc.entityId,
    ref: doc.ref,
    title: doc.title,
    body: (doc.body ?? "").slice(0, 100_000),
    urlPath: entityUrl(doc.entityType, doc.ref),
    archived: doc.archived ?? false,
    updatedAt: new Date(),
  };
  await tx
    .insert(searchIndex)
    .values(values)
    .onConflictDoUpdate({
      target: [searchIndex.entityType, searchIndex.entityId],
      set: {
        ref: values.ref,
        title: values.title,
        body: values.body,
        urlPath: values.urlPath,
        archived: values.archived,
        updatedAt: values.updatedAt,
      },
    });
}

export async function removeFromIndex(tx: Tx, userId: string, entityType: EntityType, entityId: string) {
  await tx
    .delete(searchIndex)
    .where(and(eq(searchIndex.userId, userId), eq(searchIndex.entityType, entityType), eq(searchIndex.entityId, entityId)));
}

/** Turns free text into a safe prefix tsquery string: "esp fre" → "esp:* & fre:*". */
export function toPrefixQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(" & ");
}

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
  urlPath: string;
  snippet: string | null;
  archived: boolean;
  rank: number;
}

export interface SearchOptions {
  types?: EntityType[];
  limit?: number;
  includeArchived?: boolean;
}

export async function search(userId: string, query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const tsq = toPrefixQuery(q);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const limit = Math.min(opts.limit ?? 20, 100);

  const match = tsq
    ? sql`(${searchIndex.tsv} @@ to_tsquery('simple', ${tsq}) OR ${searchIndex.tsv} @@ to_tsquery('english', ${tsq}) OR ${searchIndex.title} ILIKE ${like} OR ${searchIndex.ref} ILIKE ${like})`
    : sql`(${searchIndex.title} ILIKE ${like} OR ${searchIndex.ref} ILIKE ${like})`;

  const rank = tsq
    ? sql<number>`(ts_rank_cd(${searchIndex.tsv}, to_tsquery('simple', ${tsq})) + ts_rank_cd(${searchIndex.tsv}, to_tsquery('english', ${tsq}))
        + CASE WHEN ${searchIndex.title} ILIKE ${like} THEN 1 ELSE 0 END
        + CASE WHEN upper(${searchIndex.ref}) = upper(${q}) THEN 5 ELSE 0 END)::float`
    : sql<number>`(CASE WHEN ${searchIndex.title} ILIKE ${like} THEN 1 ELSE 0 END)::float`;

  const snippet = tsq
    ? sql<string | null>`CASE WHEN ${searchIndex.body} <> '' THEN ts_headline('english', ${searchIndex.body}, to_tsquery('english', ${tsq}), 'MaxWords=18, MinWords=6, StartSel=«, StopSel=», MaxFragments=1') ELSE NULL END`
    : sql<string | null>`NULL`;

  const conds = [eq(searchIndex.userId, userId), match];
  if (!opts.includeArchived) conds.push(eq(searchIndex.archived, false));
  if (opts.types?.length) conds.push(inArray(searchIndex.entityType, opts.types));

  const rows = await db
    .select({
      entityType: searchIndex.entityType,
      entityId: searchIndex.entityId,
      ref: searchIndex.ref,
      title: searchIndex.title,
      urlPath: searchIndex.urlPath,
      archived: searchIndex.archived,
      rank,
      snippet,
    })
    .from(searchIndex)
    .where(and(...conds))
    .orderBy(sql`${rank} DESC`, searchIndex.title)
    .limit(limit);
  return rows.map((r) => ({ ...r, entityType: r.entityType as EntityType }));
}

/** Resolve a human ref (e.g. PRJ-0003) to its indexed entity. */
export async function resolveRef(userId: string, ref: string) {
  const [row] = await db
    .select()
    .from(searchIndex)
    .where(and(eq(searchIndex.userId, userId), sql`upper(${searchIndex.ref}) = upper(${ref})`))
    .limit(1);
  return row ? { ...row, entityType: row.entityType as EntityType } : null;
}

export async function resolveRefs(tx: Tx, userId: string, refs: string[]) {
  if (refs.length === 0) return [];
  const rows = await tx
    .select({ entityType: searchIndex.entityType, entityId: searchIndex.entityId, ref: searchIndex.ref })
    .from(searchIndex)
    .where(and(eq(searchIndex.userId, userId), inArray(searchIndex.ref, refs.map((r) => r.toUpperCase()))));
  return rows.map((r) => ({ ...r, entityType: r.entityType as EntityType }));
}
