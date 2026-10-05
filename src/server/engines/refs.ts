import { sql } from "drizzle-orm";
import { REF_PREFIX, type EntityType } from "@/lib/domain/constants";
import { formatRef } from "@/lib/domain/refs";
import type { Tx } from "@/server/db";
import { refCounters } from "@/server/db/schema";

/** Allocates the next human-readable reference (e.g. TSK-0042) atomically. */
export async function nextRef(tx: Tx, userId: string, type: EntityType): Promise<string> {
  const prefix = REF_PREFIX[type];
  const [row] = await tx
    .insert(refCounters)
    .values({ userId, prefix, value: 1 })
    .onConflictDoUpdate({
      target: [refCounters.userId, refCounters.prefix],
      set: { value: sql`${refCounters.value} + 1` },
    })
    .returning({ value: refCounters.value });
  return formatRef(prefix, row.value);
}
