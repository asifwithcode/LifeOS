import { localDateInTz, localMinutesInTz, type ISODate } from "@/lib/domain/dates";

/**
 * Who is acting, plus the user preferences that business rules depend on.
 * Every service call receives an Actor; every query is scoped by `actor.userId`.
 */
export interface Actor {
  userId: string;
  timezone: string;
  weekStartsOn: number;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
}

export function nowOf(actor: Actor): Date {
  return actor.now ? actor.now() : new Date();
}

export function todayOf(actor: Actor): ISODate {
  return localDateInTz(actor.timezone, nowOf(actor));
}

export function nowMinutesOf(actor: Actor): number {
  return localMinutesInTz(actor.timezone, nowOf(actor));
}
