// Explainable progress calculators. See docs/04-progress-model.md.
// Progress is never stored; it's derived from evidence on every read.

import type { MilestoneStatus, SkillTopicStatus, TaskStatus } from "./constants";

export interface ProgressPart {
  label: string;
  done: number;
  total: number;
  weight?: number;
}

export interface ProgressResult {
  /** 0..100, or null when there is not enough data to measure anything. */
  percent: number | null;
  method: string;
  explanation: string;
  parts: ProgressPart[];
}

const NONE = (method: string, explanation: string): ProgressResult => ({
  percent: null,
  method,
  explanation,
  parts: [],
});

const round = (n: number) => Math.round(n * 10) / 10;

export interface TaskForProgress {
  status: TaskStatus | string;
  parentTaskId?: string | null;
  milestoneId?: string | null;
}

export interface MilestoneForProgress {
  id: string;
  title: string;
  status: MilestoneStatus | string;
  weight: number;
}

/** Done / non-cancelled, top-level tasks only (subtasks never double count). */
export function taskCompletion(tasks: TaskForProgress[]): { done: number; total: number } {
  const relevant = tasks.filter((t) => !t.parentTaskId && t.status !== "cancelled");
  return { done: relevant.filter((t) => t.status === "done").length, total: relevant.length };
}

export function tasksProgress(tasks: TaskForProgress[]): ProgressResult {
  const { done, total } = taskCompletion(tasks);
  if (total === 0) return NONE("tasks", "No tasks yet — add tasks to measure progress.");
  return {
    percent: round((done / total) * 100),
    method: "tasks",
    explanation: `${done} of ${total} tasks done (cancelled tasks and subtasks excluded).`,
    parts: [{ label: "Tasks", done, total }],
  };
}

/**
 * Weighted milestones. A done milestone earns full weight; an unfinished milestone with linked
 * tasks earns partial credit equal to its task completion ratio; otherwise nothing.
 */
export function weightedMilestoneProgress(
  milestones: MilestoneForProgress[],
  tasks: TaskForProgress[] = [],
): ProgressResult {
  if (milestones.length === 0) return NONE("weighted_milestones", "No milestones yet — add milestones to measure progress.");
  let earned = 0;
  let totalWeight = 0;
  const parts: ProgressPart[] = [];
  const partials: string[] = [];
  for (const m of milestones) {
    const w = Math.max(1, m.weight || 1);
    totalWeight += w;
    if (m.status === "done") {
      earned += w;
      parts.push({ label: m.title, done: 1, total: 1, weight: w });
      continue;
    }
    const { done, total } = taskCompletion(tasks.filter((t) => t.milestoneId === m.id));
    if (total > 0) {
      earned += w * (done / total);
      parts.push({ label: m.title, done, total, weight: w });
      if (done > 0) partials.push(`'${m.title}' ${done}/${total} tasks`);
    } else {
      parts.push({ label: m.title, done: 0, total: 1, weight: w });
    }
  }
  const doneCount = milestones.filter((m) => m.status === "done").length;
  const percent = round((earned / totalWeight) * 100);
  const weightNote = milestones.some((m) => (m.weight || 1) !== 1) ? ` (weighted ${round(earned)}/${totalWeight})` : "";
  const partialNote = partials.length ? `, plus partial credit from ${partials.join(", ")}` : "";
  return {
    percent,
    method: "weighted_milestones",
    explanation: `${doneCount} of ${milestones.length} milestones done${weightNote}${partialNote}.`,
    parts,
  };
}

export function projectProgress(
  mode: "milestones" | "tasks" | string,
  milestones: MilestoneForProgress[],
  tasks: TaskForProgress[],
): ProgressResult {
  if (mode === "tasks") return tasksProgress(tasks);
  if (milestones.length === 0) {
    const t = tasksProgress(tasks);
    if (t.percent === null) return NONE("weighted_milestones", "No milestones or tasks yet — add some to measure progress.");
    return { ...t, explanation: `No milestones yet, so measured by tasks: ${t.explanation}` };
  }
  return weightedMilestoneProgress(milestones, tasks);
}

export interface TargetPercent {
  title: string;
  percent: number;
}

export function goalProgress(
  mode: "milestones" | "targets" | string,
  milestones: MilestoneForProgress[],
  tasks: TaskForProgress[],
  targets: TargetPercent[],
): ProgressResult {
  if (mode === "targets") {
    if (targets.length === 0) return NONE("targets", "No active targets linked — link a target to measure this goal.");
    const capped = targets.map((t) => Math.min(100, Math.max(0, t.percent)));
    const percent = round(capped.reduce((a, b) => a + b, 0) / capped.length);
    return {
      percent,
      method: "targets",
      explanation: `Average of ${targets.length} linked target${targets.length > 1 ? "s" : ""} in their current period (each capped at 100%).`,
      parts: targets.map((t) => ({ label: t.title, done: Math.min(100, round(t.percent)), total: 100 })),
    };
  }
  return weightedMilestoneProgress(milestones, tasks);
}

export interface TopicForProgress {
  title: string;
  status: SkillTopicStatus | string;
}

export function skillProgress(topics: TopicForProgress[]): ProgressResult {
  if (topics.length === 0) return NONE("roadmap_evidence", "No roadmap topics yet — add topics to measure progress.");
  const done = topics.filter((t) => t.status === "done").length;
  const learning = topics.filter((t) => t.status === "learning").length;
  return {
    percent: round((done / topics.length) * 100),
    method: "roadmap_evidence",
    explanation: `${done} of ${topics.length} roadmap topics completed${learning ? `, ${learning} in progress (not counted until done)` : ""}. Assessments and practice will add evidence in a later phase.`,
    parts: [{ label: "Topics", done, total: topics.length }],
  };
}

/** Headline for "today": daily targets first, then routine completion. */
export function todayProgress(
  dailyTargetPercents: number[],
  routine: { done: number; scheduled: number },
): ProgressResult {
  if (dailyTargetPercents.length > 0) {
    const capped = dailyTargetPercents.map((p) => Math.min(100, Math.max(0, p)));
    return {
      percent: round(capped.reduce((a, b) => a + b, 0) / capped.length),
      method: "daily_targets",
      explanation: `Average of today's ${capped.length} daily target${capped.length > 1 ? "s" : ""}.`,
      parts: [],
    };
  }
  if (routine.scheduled > 0) {
    return {
      percent: round((routine.done / routine.scheduled) * 100),
      method: "routine",
      explanation: `${routine.done} of ${routine.scheduled} routine blocks done (no daily targets set).`,
      parts: [{ label: "Routine", done: routine.done, total: routine.scheduled }],
    };
  }
  return NONE("none", "Set a daily target or a routine to see today's progress.");
}
