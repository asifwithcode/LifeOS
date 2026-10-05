import "server-only";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { addDays } from "@/lib/domain/dates";
import { todayProgress } from "@/lib/domain/progress";
import { formatTargetAmount } from "@/lib/domain/targets";
import { db } from "@/server/db";
import { milestones, projects, tasks } from "@/server/db/schema";
import { listEvents } from "@/server/engines/activity";
import { todayOf, type Actor } from "@/server/engines/actor";
import { listGoals } from "./goals";
import { inboxCount } from "./inbox";
import { listProjects } from "./projects";
import { getRoutineDay } from "./routine";
import { evaluateTargets, type EvaluatedTarget } from "./targets";
import { listTasks, topPriorities } from "./tasks";

/**
 * Deterministic summary of what's left today, computed from daily targets.
 * This is explicitly NOT an AI insight; it's arithmetic over the user's own data.
 */
export function remainingSummary(daily: EvaluatedTarget[]): string | null {
  if (daily.length === 0) return null;
  const open = daily.filter((t) => t.evaluation.status !== "complete");
  if (open.length === 0) return "All of today's targets are complete.";
  const parts = open.map((t) => `${formatTargetAmount(t.evaluation.remaining, t.unit, t.customUnit)} ${t.title.toLowerCase()}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Another ${list} completes today's targets.`;
}

export async function getUpcomingDeadlines(actor: Actor, days = 14) {
  const today = todayOf(actor);
  const until = addDays(today, days);
  const [taskRows, milestoneRows, projectRows] = await Promise.all([
    db
      .select({ id: tasks.id, ref: tasks.ref, title: tasks.title, date: tasks.dueDate, priority: tasks.priority })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, actor.userId),
          isNull(tasks.deletedAt),
          isNull(tasks.archivedAt),
          inArray(tasks.status, ["todo", "in_progress"]),
          gte(tasks.dueDate, today),
          lte(tasks.dueDate, until),
          inArray(tasks.priority, ["high", "urgent"]),
        ),
      ),
    db
      .select({ id: milestones.id, ref: milestones.ref, title: milestones.title, date: milestones.dueDate, projectRef: projects.ref })
      .from(milestones)
      .leftJoin(projects, eq(projects.id, milestones.projectId))
      .where(and(eq(milestones.userId, actor.userId), inArray(milestones.status, ["pending", "in_progress"]), gte(milestones.dueDate, today), lte(milestones.dueDate, until))),
    db
      .select({ id: projects.id, ref: projects.ref, title: projects.title, date: projects.targetDate })
      .from(projects)
      .where(
        and(
          eq(projects.userId, actor.userId),
          isNull(projects.deletedAt),
          isNull(projects.archivedAt),
          inArray(projects.status, ["planned", "active", "on_hold"]),
          gte(projects.targetDate, today),
          lte(projects.targetDate, until),
        ),
      ),
  ]);
  const items = [
    ...taskRows.map((t) => ({ kind: "task" as const, ref: t.ref, title: t.title, date: t.date!, href: `/tasks/${t.ref}` })),
    ...milestoneRows.map((m) => ({ kind: "milestone" as const, ref: m.ref, title: m.title, date: m.date!, href: m.projectRef ? `/projects/${m.projectRef}` : "/goals" })),
    ...projectRows.map((p) => ({ kind: "project" as const, ref: p.ref, title: p.title, date: p.date!, href: `/projects/${p.ref}` })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

export async function getDashboard(actor: Actor) {
  const today = todayOf(actor);
  const [targets, routine, priorities, todayTasks, overdue, deadlines, projectList, goalList, events, inbox] = await Promise.all([
    evaluateTargets(actor),
    getRoutineDay(actor, today),
    topPriorities(actor, 5),
    listTasks(actor, { view: "today" }),
    listTasks(actor, { view: "overdue" }),
    getUpcomingDeadlines(actor),
    listProjects(actor, { view: "active" }),
    listGoals(actor, { view: "active" }),
    listEvents(actor.userId, { limit: 8 }),
    inboxCount(actor.userId),
  ]);
  const daily = targets.filter((t) => t.period === "daily");
  const progress = todayProgress(
    daily.map((t) => t.evaluation.percent),
    { done: routine.doneCount, scheduled: routine.slots.length },
  );
  return {
    today,
    progress,
    targets,
    daily,
    summary: remainingSummary(daily),
    routine,
    priorities,
    tasksRemaining: todayTasks.length,
    overdueCount: overdue.length,
    deadlines,
    projects: projectList.filter((p) => p.status === "active").slice(0, 5),
    goals: goalList.slice(0, 5),
    events,
    inboxCount: inbox,
  };
}

export async function nextRoutineItems(actor: Actor) {
  const day = await getRoutineDay(actor);
  return day.slots.filter((s) => s.state === "upcoming" || s.state === "now").slice(0, 3);
}

