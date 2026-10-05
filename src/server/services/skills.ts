import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { SkillTopicStatus } from "@/lib/domain/constants";
import { addDays } from "@/lib/domain/dates";
import { skillProgress, type ProgressResult } from "@/lib/domain/progress";
import type { SkillInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { lifeAreas, skills, skillTopics, workSessions, type Skill } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned, inTx } from "./_shared";
import { minutesByDay, totalMinutes } from "./sessions";

async function reindex(tx: Tx, actor: Actor, s: Skill) {
  if (s.deletedAt) return removeFromIndex(tx, actor.userId, "skill", s.id);
  const topics = await tx.select({ title: skillTopics.title }).from(skillTopics).where(eq(skillTopics.skillId, s.id));
  await indexEntity(tx, actor.userId, {
    entityType: "skill",
    entityId: s.id,
    ref: s.ref,
    title: s.name,
    body: [s.description, topics.map((t) => t.title).join(", ")].filter(Boolean).join("\n\n"),
    archived: !!s.archivedAt,
  });
}

export async function createSkill(actor: Actor, input: SkillInput, topics: string[] = [], outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const ref = await nextRef(tx, actor.userId, "skill");
    const [row] = await tx.insert(skills).values({ ...input, userId: actor.userId, ref }).returning();
    const clean = topics.map((t) => t.trim()).filter(Boolean).slice(0, 100);
    if (clean.length) {
      await tx.insert(skillTopics).values(clean.map((title, i) => ({ userId: actor.userId, skillId: row.id, title: title.slice(0, 200), sortOrder: i })));
    }
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: "skill.created", entityType: "skill", entityId: row.id, entityRef: row.ref, entityTitle: row.name, payload: { level: row.currentLevel } });
    return row;
  });
}

async function loadOwned(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(skills).where(and(eq(skills.id, id), eq(skills.userId, actor.userId))).limit(1);
  if (!row) notFound("Skill");
  return row;
}

export async function updateSkill(actor: Actor, id: string, input: SkillInput) {
  return db.transaction(async (tx) => {
    const before = await loadOwned(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const [row] = await tx.update(skills).set({ ...input, updatedAt: nowOf(actor) }).where(eq(skills.id, id)).returning();
    await reindex(tx, actor, row);
    if (before.currentLevel !== row.currentLevel) {
      await recordEvent(tx, actor, {
        type: "skill.level_changed",
        entityType: "skill",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.name,
        payload: { from: before.currentLevel, to: row.currentLevel, selfAssessed: true },
      });
    } else {
      await recordEvent(tx, actor, { type: "skill.updated", entityType: "skill", entityId: id, entityRef: row.ref, entityTitle: row.name });
    }
    return row;
  });
}

export async function setSkillArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(skills).set({ archivedAt: archived ? nowOf(actor) : null }).where(eq(skills.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "skill.archived" : "skill.restored", entityType: "skill", entityId: id, entityRef: row.ref, entityTitle: row.name });
    return row;
  });
}

export async function setSkillDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadOwned(tx, actor, id);
    const [row] = await tx.update(skills).set({ deletedAt: deleted ? nowOf(actor) : null }).where(eq(skills.id, id)).returning();
    await reindex(tx, actor, row);
    await recordEvent(tx, actor, { type: deleted ? "skill.deleted" : "skill.restored", entityType: "skill", entityId: id, entityRef: row.ref, entityTitle: row.name });
    return row;
  });
}

// ── Topics (the skill roadmap) ──

export async function addTopics(actor: Actor, skillId: string, titles: string[]) {
  return db.transaction(async (tx) => {
    const skill = await loadOwned(tx, actor, skillId);
    const clean = titles.map((t) => t.trim()).filter(Boolean).slice(0, 100);
    if (clean.length === 0) throw new DomainError("Enter at least one topic");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${skillTopics.sortOrder}), -1)::int` }).from(skillTopics).where(eq(skillTopics.skillId, skillId));
    await tx.insert(skillTopics).values(clean.map((title, i) => ({ userId: actor.userId, skillId, title: title.slice(0, 200), sortOrder: max + 1 + i })));
    await reindex(tx, actor, skill);
  });
}

async function loadTopic(tx: Tx, actor: Actor, topicId: string) {
  const [row] = await tx.select().from(skillTopics).where(and(eq(skillTopics.id, topicId), eq(skillTopics.userId, actor.userId))).limit(1);
  if (!row) notFound("Topic");
  return row;
}

export async function setTopicStatus(actor: Actor, topicId: string, status: SkillTopicStatus) {
  return db.transaction(async (tx) => {
    const before = await loadTopic(tx, actor, topicId);
    if (before.status === status) return;
    await tx.update(skillTopics).set({ status, completedAt: status === "done" ? nowOf(actor) : null }).where(eq(skillTopics.id, topicId));
    if (status === "done") {
      const skill = await loadOwned(tx, actor, before.skillId);
      await recordEvent(tx, actor, {
        type: "skill.topic_completed",
        entityType: "skill",
        entityId: skill.id,
        entityRef: skill.ref,
        entityTitle: skill.name,
        payload: { topicId, topic: before.title },
      });
    }
  });
}

export async function renameTopic(actor: Actor, topicId: string, title: string) {
  return db.transaction(async (tx) => {
    const t = await loadTopic(tx, actor, topicId);
    await tx.update(skillTopics).set({ title: title.trim().slice(0, 200) }).where(eq(skillTopics.id, topicId));
    await reindex(tx, actor, await loadOwned(tx, actor, t.skillId));
  });
}

export async function deleteTopic(actor: Actor, topicId: string) {
  return db.transaction(async (tx) => {
    const t = await loadTopic(tx, actor, topicId);
    await tx.delete(skillTopics).where(eq(skillTopics.id, topicId));
    await reindex(tx, actor, await loadOwned(tx, actor, t.skillId));
  });
}

export async function moveTopic(actor: Actor, topicId: string, direction: "up" | "down") {
  return db.transaction(async (tx) => {
    const t = await loadTopic(tx, actor, topicId);
    const siblings = await tx.select().from(skillTopics).where(eq(skillTopics.skillId, t.skillId)).orderBy(asc(skillTopics.sortOrder), asc(skillTopics.createdAt));
    const idx = siblings.findIndex((s) => s.id === topicId);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= siblings.length) return;
    [siblings[idx], siblings[swap]] = [siblings[swap], siblings[idx]];
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].sortOrder !== i) await tx.update(skillTopics).set({ sortOrder: i }).where(eq(skillTopics.id, siblings[i].id));
    }
  });
}

// ── Queries ──

export interface SkillWithProgress extends Skill {
  progress: ProgressResult;
  topicTotal: number;
  topicDone: number;
  totalMinutes: number;
  minutes30d: number;
  lifeAreaName: string | null;
}

export async function listSkills(actor: Actor, opts: { view?: "active" | "archived" | "trash" } = {}): Promise<SkillWithProgress[]> {
  const view = opts.view ?? "active";
  const conds: SQL[] = [eq(skills.userId, actor.userId)];
  if (view === "trash") conds.push(isNotNull(skills.deletedAt));
  else {
    conds.push(isNull(skills.deletedAt));
    conds.push(view === "archived" ? isNotNull(skills.archivedAt) : isNull(skills.archivedAt));
  }
  const rows = await db
    .select({ skill: skills, lifeAreaName: lifeAreas.name })
    .from(skills)
    .leftJoin(lifeAreas, eq(lifeAreas.id, skills.lifeAreaId))
    .where(and(...conds))
    .orderBy(asc(skills.name));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.skill.id);
  const since = addDays(todayOf(actor), -29);
  const [topics, minutes] = await Promise.all([
    db.select({ skillId: skillTopics.skillId, title: skillTopics.title, status: skillTopics.status }).from(skillTopics).where(inArray(skillTopics.skillId, ids)),
    db
      .select({
        skillId: workSessions.skillId,
        total: sql<number>`coalesce(sum(${workSessions.durationMinutes}), 0)::int`,
        recent: sql<number>`coalesce(sum(${workSessions.durationMinutes}) FILTER (WHERE ${workSessions.localDate} >= ${since}), 0)::int`,
      })
      .from(workSessions)
      .where(and(inArray(workSessions.skillId, ids), isNull(workSessions.deletedAt)))
      .groupBy(workSessions.skillId),
  ]);
  const minMap = new Map(minutes.map((m) => [m.skillId!, m]));
  return rows.map(({ skill, lifeAreaName }) => {
    const st = topics.filter((t) => t.skillId === skill.id);
    return {
      ...skill,
      lifeAreaName,
      topicTotal: st.length,
      topicDone: st.filter((t) => t.status === "done").length,
      totalMinutes: minMap.get(skill.id)?.total ?? 0,
      minutes30d: minMap.get(skill.id)?.recent ?? 0,
      progress: skillProgress(st),
    };
  });
}

export async function getSkillByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select({ skill: skills, lifeAreaName: lifeAreas.name })
    .from(skills)
    .leftJoin(lifeAreas, eq(lifeAreas.id, skills.lifeAreaId))
    .where(and(eq(skills.userId, actor.userId), eq(skills.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const today = todayOf(actor);
  const [topics, all, last30, daily] = await Promise.all([
    db.select().from(skillTopics).where(eq(skillTopics.skillId, row.skill.id)).orderBy(asc(skillTopics.sortOrder), asc(skillTopics.createdAt)),
    totalMinutes(actor.userId, { skillId: row.skill.id }),
    totalMinutes(actor.userId, { skillId: row.skill.id, from: addDays(today, -29) }),
    minutesByDay(actor.userId, addDays(today, -27), today, { skillId: row.skill.id }),
  ]);
  return { skill: row.skill, lifeAreaName: row.lifeAreaName, topics, progress: skillProgress(topics), totals: { all, last30 }, daily };
}

export async function listSkillOptions(userId: string) {
  return db
    .select({ id: skills.id, ref: skills.ref, title: skills.name })
    .from(skills)
    .where(and(eq(skills.userId, userId), isNull(skills.deletedAt), isNull(skills.archivedAt)))
    .orderBy(asc(skills.name));
}

export async function recentSkillSessions(userId: string, skillId: string, limit = 10) {
  return db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), eq(workSessions.skillId, skillId), isNull(workSessions.deletedAt)))
    .orderBy(desc(workSessions.localDate), desc(workSessions.startedAt))
    .limit(limit);
}
