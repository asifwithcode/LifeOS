import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { projectProgress, type ProgressResult } from "@/lib/domain/progress";
import type { DecisionInput, IdeaInput, ProjectInput } from "@/lib/validation";
import { db, type Tx } from "@/server/db";
import { decisions, goals, ideas, lifeAreas, milestones, projects, tasks, type Decision, type Idea, type Project } from "@/server/db/schema";
import { recordEvent } from "@/server/engines/activity";
import { nowOf, todayOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { nextRef } from "@/server/engines/refs";
import { link } from "@/server/engines/relations";
import { indexEntity, removeFromIndex } from "@/server/engines/search";
import { assertOwned, changedFields, inTx } from "./_shared";
import { listMilestones } from "./milestones";
import { totalMinutes } from "./sessions";
import { getTagsFor, setEntityTags } from "./tags";

// ───────────────────────────── Projects ─────────────────────────────

async function reindexProject(tx: Tx, actor: Actor, p: Project) {
  if (p.deletedAt) return removeFromIndex(tx, actor.userId, "project", p.id);
  await indexEntity(tx, actor.userId, {
    entityType: "project",
    entityId: p.id,
    ref: p.ref,
    title: p.title,
    body: [p.summary, p.description].filter(Boolean).join("\n\n"),
    archived: !!p.archivedAt,
  });
}

function projectValues(input: ProjectInput) {
  return {
    title: input.title,
    summary: input.summary,
    description: input.description,
    status: input.status,
    priority: input.priority,
    lifeAreaId: input.lifeAreaId,
    goalId: input.goalId,
    startDate: input.startDate,
    targetDate: input.targetDate,
    progressMode: input.progressMode,
  };
}

export async function createProject(actor: Actor, input: ProjectInput, opts: { sourceIdeaId?: string } = {}, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId, goalId: input.goalId });
    const ref = await nextRef(tx, actor.userId, "project");
    const [row] = await tx
      .insert(projects)
      .values({
        ...projectValues(input),
        userId: actor.userId,
        ref,
        sourceIdeaId: opts.sourceIdeaId ?? null,
        completedAt: input.status === "completed" ? nowOf(actor) : null,
      })
      .returning();
    await setEntityTags(tx, actor.userId, "project", row.id, input.tags);
    await reindexProject(tx, actor, row);
    await recordEvent(tx, actor, {
      type: "project.created",
      entityType: "project",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { goalId: row.goalId, sourceIdeaId: row.sourceIdeaId },
    });
    return row;
  });
}

async function loadProject(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, actor.userId))).limit(1);
  if (!row) notFound("Project");
  return row;
}

export async function updateProject(actor: Actor, id: string, input: ProjectInput) {
  return db.transaction(async (tx) => {
    const before = await loadProject(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId, goalId: input.goalId });
    const v = projectValues(input);
    const changed = changedFields(before as unknown as Record<string, unknown>, v);
    const completedAt = input.status === "completed" ? (before.completedAt ?? nowOf(actor)) : null;
    const [row] = await tx.update(projects).set({ ...v, completedAt, updatedAt: nowOf(actor) }).where(eq(projects.id, id)).returning();
    await setEntityTags(tx, actor.userId, "project", id, input.tags);
    await reindexProject(tx, actor, row);
    if (before.status !== row.status) {
      await recordEvent(tx, actor, {
        type: "project.status_changed",
        entityType: "project",
        entityId: id,
        entityRef: row.ref,
        entityTitle: row.title,
        payload: { from: before.status, to: row.status },
      });
    }
    const other = changed.filter((c) => c !== "status");
    if (other.length) {
      await recordEvent(tx, actor, { type: "project.updated", entityType: "project", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { changed: other } });
    }
    return row;
  });
}

export async function setProjectArchived(actor: Actor, id: string, archived: boolean) {
  return db.transaction(async (tx) => {
    await loadProject(tx, actor, id);
    const [row] = await tx.update(projects).set({ archivedAt: archived ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(projects.id, id)).returning();
    await reindexProject(tx, actor, row);
    await recordEvent(tx, actor, { type: archived ? "project.archived" : "project.restored", entityType: "project", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function setProjectDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadProject(tx, actor, id);
    const [row] = await tx.update(projects).set({ deletedAt: deleted ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(projects.id, id)).returning();
    await reindexProject(tx, actor, row);
    await recordEvent(tx, actor, { type: deleted ? "project.deleted" : "project.restored", entityType: "project", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export interface ProjectWithProgress extends Project {
  progress: ProgressResult;
  goalTitle: string | null;
  goalRef: string | null;
  lifeAreaName: string | null;
  lifeAreaColor: string | null;
  openTasks: number;
  tags: string[];
}

export type ProjectView = "active" | "all" | "completed" | "archived" | "trash";

export async function listProjects(actor: Actor, opts: { view?: ProjectView; goalId?: string } = {}): Promise<ProjectWithProgress[]> {
  const view = opts.view ?? "active";
  const conds: SQL[] = [eq(projects.userId, actor.userId)];
  if (view === "trash") conds.push(isNotNull(projects.deletedAt));
  else {
    conds.push(isNull(projects.deletedAt));
    conds.push(view === "archived" ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt));
    if (view === "active") conds.push(inArray(projects.status, ["planned", "active", "on_hold"]));
    if (view === "completed") conds.push(inArray(projects.status, ["completed", "cancelled"]));
  }
  if (opts.goalId) conds.push(eq(projects.goalId, opts.goalId));
  const rows = await db
    .select({ project: projects, goalTitle: goals.title, goalRef: goals.ref, lifeAreaName: lifeAreas.name, lifeAreaColor: lifeAreas.color })
    .from(projects)
    .leftJoin(goals, eq(goals.id, projects.goalId))
    .leftJoin(lifeAreas, eq(lifeAreas.id, projects.lifeAreaId))
    .where(and(...conds))
    .orderBy(sql`CASE ${projects.status} WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END`, desc(projects.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.project.id);
  const [ms, ts, tagMap] = await Promise.all([
    db.select().from(milestones).where(inArray(milestones.projectId, ids)),
    db
      .select({ projectId: tasks.projectId, status: tasks.status, parentTaskId: tasks.parentTaskId, milestoneId: tasks.milestoneId })
      .from(tasks)
      .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt))),
    getTagsFor(actor.userId, "project", ids),
  ]);
  return rows.map(({ project, ...rest }) => {
    const pt = ts.filter((t) => t.projectId === project.id);
    return {
      ...project,
      ...rest,
      tags: tagMap.get(project.id) ?? [],
      openTasks: pt.filter((t) => !t.parentTaskId && (t.status === "todo" || t.status === "in_progress")).length,
      progress: projectProgress(
        project.progressMode,
        ms.filter((m) => m.projectId === project.id),
        pt,
      ),
    };
  });
}

export async function getProjectByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select({ project: projects, goalTitle: goals.title, goalRef: goals.ref, lifeAreaName: lifeAreas.name })
    .from(projects)
    .leftJoin(goals, eq(goals.id, projects.goalId))
    .leftJoin(lifeAreas, eq(lifeAreas.id, projects.lifeAreaId))
    .where(and(eq(projects.userId, actor.userId), eq(projects.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const p = row.project;
  const [ms, ts, decs, minutes, tagMap, idea] = await Promise.all([
    listMilestones(actor.userId, { projectId: p.id }),
    db
      .select({ status: tasks.status, parentTaskId: tasks.parentTaskId, milestoneId: tasks.milestoneId })
      .from(tasks)
      .where(and(eq(tasks.projectId, p.id), isNull(tasks.deletedAt))),
    db
      .select()
      .from(decisions)
      .where(and(eq(decisions.projectId, p.id), isNull(decisions.deletedAt)))
      .orderBy(desc(decisions.decidedOn), desc(decisions.createdAt)),
    totalMinutes(actor.userId, { projectId: p.id }),
    getTagsFor(actor.userId, "project", [p.id]),
    p.sourceIdeaId ? db.select({ ref: ideas.ref, title: ideas.title }).from(ideas).where(eq(ideas.id, p.sourceIdeaId)) : Promise.resolve([]),
  ]);
  return {
    project: p,
    goalTitle: row.goalTitle,
    goalRef: row.goalRef,
    lifeAreaName: row.lifeAreaName,
    tags: tagMap.get(p.id) ?? [],
    milestones: ms,
    decisions: decs,
    minutes,
    sourceIdea: idea[0] ?? null,
    progress: projectProgress(p.progressMode, ms, ts),
  };
}

export async function listProjectOptions(userId: string) {
  return db
    .select({ id: projects.id, ref: projects.ref, title: projects.title })
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.deletedAt), isNull(projects.archivedAt), inArray(projects.status, ["planned", "active", "on_hold"])))
    .orderBy(asc(projects.title));
}

// ───────────────────────────── Ideas ─────────────────────────────

async function reindexIdea(tx: Tx, actor: Actor, i: Idea) {
  if (i.deletedAt) return removeFromIndex(tx, actor.userId, "idea", i.id);
  await indexEntity(tx, actor.userId, {
    entityType: "idea",
    entityId: i.id,
    ref: i.ref,
    title: i.title,
    body: [i.description, i.category].filter(Boolean).join("\n\n"),
    archived: i.status === "archived",
  });
}

export async function createIdea(actor: Actor, input: IdeaInput, outer?: Tx) {
  return inTx(outer, async (tx) => {
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const ref = await nextRef(tx, actor.userId, "idea");
    const [row] = await tx
      .insert(ideas)
      .values({ userId: actor.userId, ref, title: input.title, description: input.description, category: input.category, status: input.status, lifeAreaId: input.lifeAreaId })
      .returning();
    await setEntityTags(tx, actor.userId, "idea", row.id, input.tags);
    await reindexIdea(tx, actor, row);
    await recordEvent(tx, actor, { type: "idea.created", entityType: "idea", entityId: row.id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

async function loadIdea(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx.select().from(ideas).where(and(eq(ideas.id, id), eq(ideas.userId, actor.userId))).limit(1);
  if (!row) notFound("Idea");
  return row;
}

export async function updateIdea(actor: Actor, id: string, input: IdeaInput) {
  return db.transaction(async (tx) => {
    const before = await loadIdea(tx, actor, id);
    await assertOwned(tx, actor.userId, { lifeAreaId: input.lifeAreaId });
    const [row] = await tx
      .update(ideas)
      .set({ title: input.title, description: input.description, category: input.category, status: input.status, lifeAreaId: input.lifeAreaId, updatedAt: nowOf(actor) })
      .where(eq(ideas.id, id))
      .returning();
    await setEntityTags(tx, actor.userId, "idea", id, input.tags);
    await reindexIdea(tx, actor, row);
    if (before.status !== row.status) {
      await recordEvent(tx, actor, { type: "idea.status_changed", entityType: "idea", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { from: before.status, to: row.status } });
    } else {
      await recordEvent(tx, actor, { type: "idea.updated", entityType: "idea", entityId: id, entityRef: row.ref, entityTitle: row.title });
    }
    return row;
  });
}

export async function setIdeaStatus(actor: Actor, id: string, status: string) {
  return db.transaction(async (tx) => {
    const before = await loadIdea(tx, actor, id);
    if (before.status === status) return before;
    const [row] = await tx.update(ideas).set({ status, updatedAt: nowOf(actor) }).where(eq(ideas.id, id)).returning();
    await reindexIdea(tx, actor, row);
    await recordEvent(tx, actor, { type: "idea.status_changed", entityType: "idea", entityId: id, entityRef: row.ref, entityTitle: row.title, payload: { from: before.status, to: status } });
    return row;
  });
}

export async function setIdeaDeleted(actor: Actor, id: string, deleted: boolean) {
  return db.transaction(async (tx) => {
    await loadIdea(tx, actor, id);
    const [row] = await tx.update(ideas).set({ deletedAt: deleted ? nowOf(actor) : null, updatedAt: nowOf(actor) }).where(eq(ideas.id, id)).returning();
    await reindexIdea(tx, actor, row);
    if (deleted) await recordEvent(tx, actor, { type: "idea.deleted", entityType: "idea", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

/** Creates a project from an idea. The idea is kept, linked and moved to "building". */
export async function convertIdeaToProject(actor: Actor, ideaId: string) {
  return db.transaction(async (tx) => {
    const idea = await loadIdea(tx, actor, ideaId);
    if (idea.convertedProjectId) {
      const [existing] = await tx.select().from(projects).where(eq(projects.id, idea.convertedProjectId));
      if (existing && !existing.deletedAt) throw new DomainError(`Already converted to ${existing.ref}`, "conflict");
    }
    const tagMap = await getTagsFor(actor.userId, "idea", [idea.id]);
    const project = await createProject(
      actor,
      {
        title: idea.title,
        summary: null,
        description: idea.description,
        status: "planned",
        priority: "medium",
        lifeAreaId: idea.lifeAreaId,
        goalId: null,
        startDate: todayOf(actor),
        targetDate: null,
        progressMode: "milestones",
        tags: tagMap.get(idea.id) ?? [],
      },
      { sourceIdeaId: idea.id },
      tx,
    );
    const [updated] = await tx
      .update(ideas)
      .set({ convertedProjectId: project.id, status: "building", updatedAt: nowOf(actor) })
      .where(eq(ideas.id, idea.id))
      .returning();
    await reindexIdea(tx, actor, updated);
    await link(tx, actor, { type: "project", id: project.id }, { type: "idea", id: idea.id }, "derived_from");
    await recordEvent(tx, actor, {
      type: "idea.converted",
      entityType: "idea",
      entityId: idea.id,
      entityRef: idea.ref,
      entityTitle: idea.title,
      payload: { projectId: project.id, projectRef: project.ref },
    });
    return project;
  });
}

export async function listIdeas(actor: Actor, opts: { status?: string; includeArchived?: boolean; trash?: boolean } = {}) {
  const conds: SQL[] = [eq(ideas.userId, actor.userId)];
  conds.push(opts.trash ? isNotNull(ideas.deletedAt) : isNull(ideas.deletedAt));
  if (opts.status) conds.push(eq(ideas.status, opts.status));
  else if (!opts.includeArchived && !opts.trash) conds.push(sql`${ideas.status} <> 'archived'`);
  const rows = await db
    .select({ idea: ideas, lifeAreaName: lifeAreas.name, projectRef: projects.ref, projectTitle: projects.title })
    .from(ideas)
    .leftJoin(lifeAreas, eq(lifeAreas.id, ideas.lifeAreaId))
    .leftJoin(projects, eq(projects.id, ideas.convertedProjectId))
    .where(and(...conds))
    .orderBy(desc(ideas.updatedAt));
  const tagMap = await getTagsFor(actor.userId, "idea", rows.map((r) => r.idea.id));
  return rows.map((r) => ({ ...r.idea, lifeAreaName: r.lifeAreaName, projectRef: r.projectRef, projectTitle: r.projectTitle, tags: tagMap.get(r.idea.id) ?? [] }));
}

export async function getIdeaByRef(actor: Actor, ref: string) {
  const [row] = await db
    .select({ idea: ideas, lifeAreaName: lifeAreas.name, projectRef: projects.ref, projectTitle: projects.title })
    .from(ideas)
    .leftJoin(lifeAreas, eq(lifeAreas.id, ideas.lifeAreaId))
    .leftJoin(projects, eq(projects.id, ideas.convertedProjectId))
    .where(and(eq(ideas.userId, actor.userId), eq(ideas.ref, ref.toUpperCase())))
    .limit(1);
  if (!row) return null;
  const tagMap = await getTagsFor(actor.userId, "idea", [row.idea.id]);
  return { ...row.idea, lifeAreaName: row.lifeAreaName, projectRef: row.projectRef, projectTitle: row.projectTitle, tags: tagMap.get(row.idea.id) ?? [] };
}

// ───────────────────────────── Decisions ─────────────────────────────

async function reindexDecision(tx: Tx, actor: Actor, d: Decision) {
  if (d.deletedAt) return removeFromIndex(tx, actor.userId, "decision", d.id);
  await indexEntity(tx, actor.userId, {
    entityType: "decision",
    entityId: d.id,
    ref: d.ref,
    title: d.title,
    body: [d.decision, d.context, d.alternatives, d.consequences].filter(Boolean).join("\n\n"),
    archived: d.status !== "active",
  });
}

function decisionValues(input: DecisionInput) {
  return {
    title: input.title,
    decision: input.decision,
    context: input.context,
    alternatives: input.alternatives,
    consequences: input.consequences,
    decidedOn: input.decidedOn,
    projectId: input.projectId,
    status: input.status,
  };
}

export async function createDecision(actor: Actor, input: DecisionInput) {
  return db.transaction(async (tx) => {
    await assertOwned(tx, actor.userId, { projectId: input.projectId });
    const ref = await nextRef(tx, actor.userId, "decision");
    const [row] = await tx.insert(decisions).values({ ...decisionValues(input), userId: actor.userId, ref }).returning();
    await reindexDecision(tx, actor, row);
    await recordEvent(tx, actor, {
      type: "decision.recorded",
      entityType: "decision",
      entityId: row.id,
      entityRef: row.ref,
      entityTitle: row.title,
      payload: { projectId: row.projectId },
    });
    return row;
  });
}

export async function updateDecision(actor: Actor, id: string, input: DecisionInput) {
  return db.transaction(async (tx) => {
    await assertOwned(tx, actor.userId, { projectId: input.projectId });
    const [row] = await tx
      .update(decisions)
      .set({ ...decisionValues(input), updatedAt: nowOf(actor) })
      .where(and(eq(decisions.id, id), eq(decisions.userId, actor.userId)))
      .returning();
    if (!row) notFound("Decision");
    await reindexDecision(tx, actor, row);
    await recordEvent(tx, actor, { type: "decision.updated", entityType: "decision", entityId: id, entityRef: row.ref, entityTitle: row.title });
    return row;
  });
}

export async function deleteDecision(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(decisions)
      .set({ deletedAt: nowOf(actor) })
      .where(and(eq(decisions.id, id), eq(decisions.userId, actor.userId)))
      .returning();
    if (!row) notFound("Decision");
    await reindexDecision(tx, actor, row);
    await recordEvent(tx, actor, { type: "decision.deleted", entityType: "decision", entityId: id, entityRef: row.ref, entityTitle: row.title });
  });
}

export async function listDecisions(actor: Actor, opts: { projectId?: string } = {}) {
  const conds: SQL[] = [eq(decisions.userId, actor.userId), isNull(decisions.deletedAt)];
  if (opts.projectId) conds.push(eq(decisions.projectId, opts.projectId));
  return db
    .select({ decision: decisions, projectTitle: projects.title, projectRef: projects.ref })
    .from(decisions)
    .leftJoin(projects, eq(projects.id, decisions.projectId))
    .where(and(...conds))
    .orderBy(desc(decisions.decidedOn), desc(decisions.createdAt));
}
