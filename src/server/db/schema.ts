import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RecurrenceRule } from "@/lib/domain/recurrence";
import type { CaptureSuggestion } from "@/lib/domain/capture";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const archivedAt = () => timestamp("archived_at", { withTimezone: true });
const deletedAt = () => timestamp("deleted_at", { withTimezone: true });
const ref = () => text("ref").notNull();

// ───────────────────────────── Identity ─────────────────────────────

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: userId(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export type DashboardWidgetPref = { id: string; visible: boolean };

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("system"),
  accent: text("accent").notNull().default("indigo"),
  weekStartsOn: integer("week_starts_on").notNull().default(1),
  dashboardWidgets: jsonb("dashboard_widgets").$type<DashboardWidgetPref[]>(),
  aiPrivacy: jsonb("ai_privacy").$type<Record<string, boolean>>(),
  memoryEnabled: boolean("memory_enabled").notNull().default(false),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Shared ─────────────────────────────

export const refCounters = pgTable(
  "ref_counters",
  {
    userId: userId(),
    prefix: text("prefix").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.prefix] })],
);

export const lifeAreas = pgTable(
  "life_areas",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    color: text("color").notNull().default("graphite"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
  },
  (t) => [index("life_areas_user_idx").on(t.userId)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_user_name_uq").on(t.userId, t.name)],
);

export const entityTags = pgTable(
  "entity_tags",
  {
    userId: userId(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.entityType, t.entityId] }),
    index("entity_tags_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const entityRelations = pgTable(
  "entity_relations",
  {
    id: id(),
    userId: userId(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    relationType: text("relation_type").notNull().default("related"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("entity_relations_uq").on(
      t.userId,
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
      t.relationType,
    ),
    index("entity_relations_source_idx").on(t.sourceType, t.sourceId),
    index("entity_relations_target_idx").on(t.targetType, t.targetId),
  ],
);

export const dependencies = pgTable(
  "dependencies",
  {
    id: id(),
    userId: userId(),
    blockedType: text("blocked_type").notNull(),
    blockedId: uuid("blocked_id").notNull(),
    blockerType: text("blocker_type").notNull(),
    blockerId: uuid("blocker_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dependencies_uq").on(t.blockedType, t.blockedId, t.blockerType, t.blockerId),
    index("dependencies_blocker_idx").on(t.blockerType, t.blockerId),
    check("dependencies_no_self", sql`NOT (${t.blockedType} = ${t.blockerType} AND ${t.blockedId} = ${t.blockerId})`),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    userId: userId(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityRef: text("entity_ref"),
    entityTitle: text("entity_title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    localDate: date("local_date").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("activity_events_user_time_idx").on(t.userId, t.occurredAt.desc()),
    index("activity_events_entity_idx").on(t.userId, t.entityType, t.entityId),
    index("activity_events_user_date_type_idx").on(t.userId, t.localDate, t.type),
  ],
);

export const searchIndex = pgTable(
  "search_index",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: userId(),
    ref: text("ref"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    urlPath: text("url_path").notNull(),
    archived: boolean("archived").notNull().default(false),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce("ref", '') || ' ' || "title"), 'A') || setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', "body"), 'B')`,
    ),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId] }),
    index("search_index_user_idx").on(t.userId),
    index("search_index_tsv_idx").using("gin", t.tsv),
  ],
);

// ───────────────────────────── Planning ─────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    description: text("description"),
    why: text("why"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    priority: text("priority").notNull().default("medium"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    progressMode: text("progress_mode").notNull().default("milestones"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("goals_user_ref_uq").on(t.userId, t.ref)],
);

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    status: text("status").notNull().default("captured"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    convertedProjectId: uuid("converted_project_id").references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("ideas_user_ref_uq").on(t.userId, t.ref)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    summary: text("summary"),
    description: text("description"),
    status: text("status").notNull().default("active"),
    priority: text("priority").notNull().default("medium"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    progressMode: text("progress_mode").notNull().default("milestones"),
    sourceIdeaId: uuid("source_idea_id").references(() => ideas.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("projects_user_ref_uq").on(t.userId, t.ref)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("pending"),
    weight: integer("weight").notNull().default(1),
    dueDate: date("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("milestones_user_ref_uq").on(t.userId, t.ref),
    index("milestones_goal_idx").on(t.goalId),
    index("milestones_project_idx").on(t.projectId),
    check("milestones_one_owner", sql`(${t.goalId} IS NULL) <> (${t.projectId} IS NULL)`),
    check("milestones_weight_range", sql`${t.weight} BETWEEN 1 AND 10`),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("technical"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    currentLevel: integer("current_level").notNull().default(0),
    targetLevel: integer("target_level").notNull().default(3),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("skills_user_ref_uq").on(t.userId, t.ref),
    check("skills_level_range", sql`${t.currentLevel} BETWEEN 0 AND 5 AND ${t.targetLevel} BETWEEN 0 AND 5`),
  ],
);

export const skillTopics = pgTable(
  "skill_topics",
  {
    id: id(),
    userId: userId(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("not_started"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("skill_topics_skill_idx").on(t.skillId)],
);

export const targets = pgTable(
  "targets",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    description: text("description"),
    period: text("period").notNull(),
    customStart: date("custom_start"),
    customEnd: date("custom_end"),
    amount: numeric("amount", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    customUnit: text("custom_unit"),
    activityType: text("activity_type"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("targets_user_ref_uq").on(t.userId, t.ref),
    check("targets_amount_positive", sql`${t.amount} > 0`),
    check(
      "targets_custom_range",
      sql`${t.period} <> 'custom' OR (${t.customStart} IS NOT NULL AND ${t.customEnd} IS NOT NULL AND ${t.customEnd} >= ${t.customStart})`,
    ),
  ],
);

export const routineTemplates = pgTable(
  "routine_templates",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("custom"),
    weekdays: integer("weekdays").array().notNull().default(sql`'{}'::integer[]`),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [index("routine_templates_user_idx").on(t.userId)],
);

export const routineItems = pgTable(
  "routine_items",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => routineTemplates.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startTime: time("start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    daysOfWeek: integer("days_of_week").array(),
    activityType: text("activity_type"),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    priority: text("priority").notNull().default("medium"),
    reminderMinutesBefore: integer("reminder_minutes_before"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    logAsSession: boolean("log_as_session").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("routine_items_user_ref_uq").on(t.userId, t.ref),
    index("routine_items_template_idx").on(t.templateId),
    check("routine_items_duration_positive", sql`${t.durationMinutes} > 0`),
  ],
);

export const routineDayPlans = pgTable(
  "routine_day_plans",
  {
    userId: userId(),
    date: date("date").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => routineTemplates.id, { onDelete: "cascade" }),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("none"),
    dueDate: date("due_date"),
    startDate: date("start_date"),
    someday: boolean("someday").notNull().default(false),
    estimatedMinutes: integer("estimated_minutes"),
    recurrence: jsonb("recurrence").$type<RecurrenceRule>(),
    seriesId: uuid("series_id"),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    routineItemId: uuid("routine_item_id").references(() => routineItems.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("tasks_user_ref_uq").on(t.userId, t.ref),
    index("tasks_user_status_due_idx").on(t.userId, t.status, t.dueDate),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_milestone_idx").on(t.milestoneId),
  ],
);

// ───────────────────────────── Work ─────────────────────────────

export const workSessions = pgTable(
  "work_sessions",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    activityType: text("activity_type").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    localDate: date("local_date").notNull(),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    routineItemId: uuid("routine_item_id").references(() => routineItems.id, { onDelete: "set null" }),
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("work_sessions_user_ref_uq").on(t.userId, t.ref),
    index("work_sessions_user_date_idx").on(t.userId, t.localDate),
    index("work_sessions_skill_idx").on(t.skillId),
    index("work_sessions_task_idx").on(t.taskId),
    check(
      "work_sessions_has_measure",
      sql`(${t.durationMinutes} IS NOT NULL AND ${t.durationMinutes} > 0) OR (${t.quantity} IS NOT NULL AND ${t.quantity} > 0)`,
    ),
  ],
);

export const routineCompletions = pgTable(
  "routine_completions",
  {
    id: id(),
    userId: userId(),
    routineItemId: uuid("routine_item_id")
      .notNull()
      .references(() => routineItems.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").notNull(),
    actualMinutes: integer("actual_minutes"),
    sessionId: uuid("session_id").references(() => workSessions.id, { onDelete: "set null" }),
    itemTitle: text("item_title").notNull(),
    plannedMinutes: integer("planned_minutes").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("routine_completions_item_date_uq").on(t.routineItemId, t.date),
    index("routine_completions_user_date_idx").on(t.userId, t.date),
  ],
);

// ───────────────────────────── Build / Knowledge ─────────────────────────────

export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    decision: text("decision").notNull(),
    context: text("context"),
    alternatives: text("alternatives"),
    consequences: text("consequences"),
    decidedOn: date("decided_on").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("decisions_user_ref_uq").on(t.userId, t.ref)],
);

export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    collection: text("collection"),
    pinned: boolean("pinned").notNull().default(false),
    lifeAreaId: uuid("life_area_id").references(() => lifeAreas.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("notes_user_ref_uq").on(t.userId, t.ref)],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: id(),
    userId: userId(),
    ref: ref(),
    content: text("content").notNull(),
    url: text("url"),
    kindHint: text("kind_hint"),
    suggestion: jsonb("suggestion").$type<CaptureSuggestion>(),
    status: text("status").notNull().default("pending"),
    processedEntityType: text("processed_entity_type"),
    processedEntityId: uuid("processed_entity_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inbox_items_user_ref_uq").on(t.userId, t.ref),
    index("inbox_items_user_status_idx").on(t.userId, t.status),
  ],
);

export type User = typeof users.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillTopic = typeof skillTopics.$inferSelect;
export type WorkSession = typeof workSessions.$inferSelect;
export type RoutineTemplate = typeof routineTemplates.$inferSelect;
export type RoutineItem = typeof routineItems.$inferSelect;
export type RoutineCompletion = typeof routineCompletions.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type LifeArea = typeof lifeAreas.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
