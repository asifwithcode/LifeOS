import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/server/db";
import {
  goals,
  lifeAreas,
  milestones,
  projects,
  routineItems,
  routineTemplates,
  skills,
  tasks,
} from "@/server/db/schema";
import { DomainError } from "@/server/engines/errors";

/** Runs `fn` in a transaction (a savepoint when `outer` is already a transaction). */
export function inTx<T>(outer: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (outer ?? db).transaction(fn);
}

type OwnedTable = PgTable & { id: PgColumn; userId: PgColumn };

const OWNED: Record<string, { table: OwnedTable; label: string }> = {
  projectId: { table: projects, label: "Project" },
  goalId: { table: goals, label: "Goal" },
  skillId: { table: skills, label: "Skill" },
  lifeAreaId: { table: lifeAreas, label: "Life area" },
  milestoneId: { table: milestones, label: "Milestone" },
  parentTaskId: { table: tasks, label: "Parent task" },
  taskId: { table: tasks, label: "Task" },
  templateId: { table: routineTemplates, label: "Routine template" },
  routineItemId: { table: routineItems, label: "Routine item" },
};

/**
 * Verifies that every foreign id supplied by the client belongs to the acting user.
 * Prevents attaching another user's rows by guessing UUIDs.
 */
export async function assertOwned(tx: Tx, userId: string, refs: Partial<Record<keyof typeof OWNED, string | null | undefined>>) {
  for (const [key, value] of Object.entries(refs)) {
    if (!value) continue;
    const spec = OWNED[key];
    if (!spec) continue;
    const rows = await tx
      .select({ id: spec.table.id })
      .from(spec.table)
      .where(and(eq(spec.table.id, value), eq(spec.table.userId, userId)))
      .limit(1);
    if (rows.length === 0) throw new DomainError(`${spec.label} not found`, "not_found");
  }
}

/** Build a WHERE for "row of this user, not soft-deleted". */
export function ownedActive<T extends OwnedTable & { deletedAt: PgColumn }>(table: T, userId: string) {
  return and(eq(table.userId, userId), isNull(table.deletedAt));
}

export function idIn(col: PgColumn, ids: string[]) {
  return ids.length ? inArray(col, ids) : undefined;
}

/** Shallow diff of changed keys for event payloads. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): string[] {
  return Object.keys(after).filter((k) => {
    const a = before[k];
    const b = after[k];
    if (a instanceof Date || b instanceof Date) return String(a) !== String(b);
    if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    return (a ?? null) !== (b ?? null);
  });
}
