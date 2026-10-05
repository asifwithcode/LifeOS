// Closed vocabularies shared by the schema, validation, services and UI.
// Stored as text in Postgres; this file is the single source of truth.

export const ENTITY_TYPES = [
  "goal",
  "milestone",
  "target",
  "task",
  "routine_item",
  "project",
  "idea",
  "decision",
  "note",
  "skill",
  "session",
  "inbox_item",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const REF_PREFIX: Record<EntityType, string> = {
  goal: "GOL",
  milestone: "MIL",
  target: "TGT",
  task: "TSK",
  routine_item: "RTN",
  project: "PRJ",
  idea: "IDE",
  decision: "DEC",
  note: "NTE",
  skill: "SKL",
  session: "SES",
  inbox_item: "INB",
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  goal: "Goal",
  milestone: "Milestone",
  target: "Target",
  task: "Task",
  routine_item: "Routine item",
  project: "Project",
  idea: "Idea",
  decision: "Decision",
  note: "Note",
  skill: "Skill",
  session: "Session",
  inbox_item: "Inbox item",
};

/** Base path for entity detail pages. Entities without their own page link to their list. */
export const ENTITY_PATH: Record<EntityType, string> = {
  goal: "/goals",
  milestone: "/goals",
  target: "/targets",
  task: "/tasks",
  routine_item: "/routine",
  project: "/projects",
  idea: "/ideas",
  decision: "/decisions",
  note: "/notes",
  skill: "/skills",
  session: "/sessions",
  inbox_item: "/inbox",
};

export const ENTITIES_WITH_DETAIL_PAGE: EntityType[] = [
  "goal",
  "target",
  "task",
  "project",
  "idea",
  "note",
  "skill",
];

export function entityUrl(type: EntityType, ref: string | null | undefined): string {
  const base = ENTITY_PATH[type];
  if (ref && ENTITIES_WITH_DETAIL_PAGE.includes(type)) return `${base}/${ref}`;
  return base;
}

export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export const GOAL_STATUSES = ["not_started", "active", "paused", "achieved", "abandoned"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_PRIORITIES = ["low", "medium", "high"] as const;

export const MILESTONE_STATUSES = ["pending", "in_progress", "done"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PROGRESS_MODES = ["milestones", "targets"] as const;
export const PROJECT_PROGRESS_MODES = ["milestones", "tasks"] as const;

export const TARGET_PERIODS = ["daily", "weekly", "monthly", "quarterly", "yearly", "custom"] as const;
export type TargetPeriod = (typeof TARGET_PERIODS)[number];

export const TARGET_UNITS = [
  "minutes",
  "hours",
  "pages",
  "chapters",
  "sessions",
  "tasks",
  "lessons",
  "videos",
  "books",
  "projects",
  "custom",
] as const;
export type TargetUnit = (typeof TARGET_UNITS)[number];

export const ACTIVITY_TYPES = [
  "study",
  "coding",
  "reading",
  "practice",
  "project",
  "language",
  "exercise",
  "writing",
  "research",
  "other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const SESSION_SOURCES = ["manual", "routine", "task", "focus", "reading", "lesson"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

export const ROUTINE_TEMPLATE_KINDS = ["normal", "university", "weekend", "exam", "holiday", "custom"] as const;

export const IDEA_STATUSES = [
  "captured",
  "exploring",
  "researching",
  "validated",
  "planned",
  "building",
  "archived",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const DECISION_STATUSES = ["active", "superseded", "reverted"] as const;

export const SKILL_CATEGORIES = ["technical", "academic", "language", "creative", "professional", "other"] as const;
export const SKILL_STATUSES = ["active", "paused", "achieved"] as const;
export const SKILL_TOPIC_STATUSES = ["not_started", "learning", "done"] as const;
export type SkillTopicStatus = (typeof SKILL_TOPIC_STATUSES)[number];
export const SKILL_LEVELS = ["None", "Beginner", "Elementary", "Intermediate", "Advanced", "Expert"] as const;

export const INBOX_KINDS = [
  "thought",
  "task",
  "idea",
  "note",
  "url",
  "resource",
  "study",
  "project_update",
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Entities an inbox item can be converted into in Phase 1. */
export const INBOX_DESTINATIONS = ["task", "note", "idea", "project", "goal", "skill"] as const;
export type InboxDestination = (typeof INBOX_DESTINATIONS)[number];

export const RELATION_TYPES = ["related", "supports", "mentions", "derived_from", "part_of"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const ACCENTS = ["indigo", "blue", "violet", "emerald", "amber", "rose", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DASHBOARD_WIDGETS = [
  { id: "today", label: "Today's progress" },
  { id: "targets", label: "Targets" },
  { id: "routine", label: "Routine — next up" },
  { id: "priorities", label: "Top priorities" },
  { id: "deadlines", label: "Upcoming deadlines" },
  { id: "projects", label: "Active projects" },
  { id: "goals", label: "Current goals" },
  { id: "inbox", label: "Inbox" },
  { id: "activity", label: "Recent activity" },
] as const;
export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]["id"];

export const DEFAULT_LIFE_AREAS = [
  { name: "Study", color: "blue" },
  { name: "Career", color: "violet" },
  { name: "Skills", color: "indigo" },
  { name: "Projects", color: "emerald" },
  { name: "Health", color: "rose" },
  { name: "Personal", color: "amber" },
  { name: "Finance", color: "graphite" },
] as const;

export const AREA_COLORS = ["indigo", "blue", "violet", "emerald", "amber", "rose", "graphite", "cyan", "orange"] as const;
