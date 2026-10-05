import "server-only";
import { eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";

// Every user-owned table, exported verbatim. Format is versioned so imports can migrate it.
const TABLES: Record<string, PgTable & { userId: PgColumn }> = {
  lifeAreas: s.lifeAreas,
  tags: s.tags,
  entityTags: s.entityTags,
  entityRelations: s.entityRelations,
  dependencies: s.dependencies,
  goals: s.goals,
  milestones: s.milestones,
  targets: s.targets,
  tasks: s.tasks,
  workSessions: s.workSessions,
  routineTemplates: s.routineTemplates,
  routineItems: s.routineItems,
  routineDayPlans: s.routineDayPlans,
  routineCompletions: s.routineCompletions,
  ideas: s.ideas,
  projects: s.projects,
  decisions: s.decisions,
  notes: s.notes,
  skills: s.skills,
  skillTopics: s.skillTopics,
  inboxItems: s.inboxItems,
  activityEvents: s.activityEvents,
};

export async function exportUserData(userId: string) {
  const [user] = await db
    .select({ id: s.users.id, email: s.users.email, name: s.users.name, timezone: s.users.timezone, createdAt: s.users.createdAt })
    .from(s.users)
    .where(eq(s.users.id, userId));
  const [settings] = await db.select().from(s.userSettings).where(eq(s.userSettings.userId, userId));
  const data: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    data[name] = await db.select().from(table).where(eq(table.userId, userId));
  }
  return { format: "lifeos-export@1", exportedAt: new Date().toISOString(), user, settings, data };
}

/** Notes as Markdown files with YAML front matter. */
export async function exportNotesMarkdown(userId: string) {
  const rows = await db.select().from(s.notes).where(eq(s.notes.userId, userId));
  return rows
    .filter((n) => !n.deletedAt)
    .map((n) => ({
      filename: `${n.ref}-${n.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "note"}.md`,
      content: `---\nref: ${n.ref}\ntitle: ${JSON.stringify(n.title)}\ncollection: ${JSON.stringify(n.collection ?? "")}\ncreated: ${n.createdAt.toISOString()}\nupdated: ${n.updatedAt.toISOString()}\n---\n\n${n.content}\n`,
    }));
}
