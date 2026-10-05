import { and, desc, eq, gte, inArray, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { EntityType } from "@/lib/domain/constants";
import { localDateInTz, type ISODate } from "@/lib/domain/dates";
import { EVENT_CATEGORIES, type EventType } from "@/lib/domain/events";
import { db, type Tx } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { nowOf, type Actor } from "./actor";

export interface EventInput {
  type: EventType;
  entityType: EntityType;
  entityId: string;
  entityRef?: string | null;
  entityTitle: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Appends an activity event. Call inside the same transaction as the state change. */
export async function recordEvent(tx: Tx, actor: Actor, e: EventInput) {
  const occurredAt = e.occurredAt ?? nowOf(actor);
  await tx.insert(activityEvents).values({
    userId: actor.userId,
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    entityRef: e.entityRef ?? null,
    entityTitle: e.entityTitle,
    occurredAt,
    localDate: localDateInTz(actor.timezone, occurredAt),
    payload: e.payload ?? {},
  });
}

export interface EventQuery {
  limit?: number;
  before?: Date;
  category?: string;
  types?: EventType[];
  entity?: { type: EntityType; id: string };
  from?: ISODate;
  to?: ISODate;
}

export async function listEvents(userId: string, q: EventQuery = {}) {
  const conds: SQL[] = [eq(activityEvents.userId, userId)];
  if (q.before) conds.push(lt(activityEvents.occurredAt, q.before));
  if (q.from) conds.push(gte(activityEvents.localDate, q.from));
  if (q.to) conds.push(lte(activityEvents.localDate, q.to));
  if (q.types?.length) conds.push(inArray(activityEvents.type, q.types));
  if (q.entity) {
    conds.push(eq(activityEvents.entityType, q.entity.type), eq(activityEvents.entityId, q.entity.id));
  }
  const cat = q.category ? EVENT_CATEGORIES[q.category] : undefined;
  if (cat) {
    const ors = cat.prefixes.map((p) => like(activityEvents.type, `${p}%`));
    conds.push(ors.length === 1 ? ors[0] : or(...ors)!);
  }
  return db
    .select()
    .from(activityEvents)
    .where(and(...conds))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(Math.min(q.limit ?? 50, 500));
}

/** Counts of events by type on a local date range (used by dashboard/today). */
export async function countEventsByType(userId: string, from: ISODate, to: ISODate) {
  return db
    .select({ type: activityEvents.type, count: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), gte(activityEvents.localDate, from), lte(activityEvents.localDate, to)))
    .groupBy(activityEvents.type);
}
