import { z } from "zod";
import {
  ACCENTS,
  ACTIVITY_TYPES,
  AREA_COLORS,
  DECISION_STATUSES,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  IDEA_STATUSES,
  INBOX_DESTINATIONS,
  INBOX_KINDS,
  MILESTONE_STATUSES,
  PRIORITIES,
  PROGRESS_MODES,
  PROJECT_PROGRESS_MODES,
  PROJECT_STATUSES,
  RELATION_TYPES,
  ENTITY_TYPES,
  ROUTINE_TEMPLATE_KINDS,
  SKILL_CATEGORIES,
  SKILL_STATUSES,
  SKILL_TOPIC_STATUSES,
  TARGET_PERIODS,
  TARGET_UNITS,
  TASK_STATUSES,
  THEMES,
} from "./domain/constants";
import { isISODate } from "./domain/dates";
import { RECURRENCE_FREQS } from "./domain/recurrence";

// ── primitives: empty strings from forms become null ──

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const title = (max = 300) => z.string().trim().min(1, "Required").max(max);
export const optText = (max = 20_000) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional()).transform((v) => v ?? null);
export const optDate = z
  .preprocess(emptyToNull, z.string().refine(isISODate, "Invalid date").nullable().optional())
  .transform((v) => v ?? null);
export const isoDate = z.string().refine(isISODate, "Invalid date");
export const optUuid = z.preprocess(emptyToNull, z.uuid().nullable().optional()).transform((v) => v ?? null);
export const optInt = (min: number, max: number) =>
  z
    .preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).max(max).nullable())
    .transform((v) => v ?? null);
export const optPositive = z
  .preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().positive().max(1_000_000).nullable())
  .transform((v) => v ?? null);
export const bool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM");
export const weekdays = z.array(z.coerce.number().int().min(0).max(6)).max(7);
export const tagList = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .transform((s) => s.replace(/^#/, ""))
      .pipe(z.string().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u, "Tags may contain letters, numbers, - and _")),
  )
  .max(20)
  .default([]);

export const recurrenceSchema = z
  .object({
    freq: z.enum(RECURRENCE_FREQS),
    interval: z.coerce.number().int().min(1).max(365),
    byWeekday: weekdays.optional(),
  })
  .nullable();

// ── entities ──

export const taskInput = z.object({
  title: title(),
  description: optText(),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(PRIORITIES).default("none"),
  dueDate: optDate,
  startDate: optDate,
  someday: bool.default(false),
  estimatedMinutes: optInt(1, 100_000),
  recurrence: recurrenceSchema.default(null),
  parentTaskId: optUuid,
  projectId: optUuid,
  goalId: optUuid,
  skillId: optUuid,
  milestoneId: optUuid,
  lifeAreaId: optUuid,
  tags: tagList,
});
export type TaskInput = z.infer<typeof taskInput>;

export const goalInput = z
  .object({
    title: title(),
    description: optText(),
    why: optText(),
    lifeAreaId: optUuid,
    status: z.enum(GOAL_STATUSES).default("active"),
    priority: z.enum(GOAL_PRIORITIES).default("medium"),
    startDate: optDate,
    targetDate: optDate,
    progressMode: z.enum(PROGRESS_MODES).default("milestones"),
  })
  .refine((g) => !g.startDate || !g.targetDate || g.targetDate >= g.startDate, {
    message: "Target date must be after the start date",
    path: ["targetDate"],
  });
export type GoalInput = z.infer<typeof goalInput>;

export const milestoneInput = z.object({
  title: title(),
  description: optText(),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  dueDate: optDate,
});
export type MilestoneInput = z.infer<typeof milestoneInput>;
export const milestoneStatus = z.enum(MILESTONE_STATUSES);

export const targetInput = z
  .object({
    title: title(200),
    description: optText(),
    period: z.enum(TARGET_PERIODS),
    customStart: optDate,
    customEnd: optDate,
    amount: z.coerce.number().positive("Must be greater than zero").max(1_000_000),
    unit: z.enum(TARGET_UNITS),
    customUnit: optText(40),
    activityType: z.preprocess(emptyToNull, z.enum(ACTIVITY_TYPES).nullable().optional()).transform((v) => v ?? null),
    lifeAreaId: optUuid,
    skillId: optUuid,
    projectId: optUuid,
    goalId: optUuid,
  })
  .refine((t) => t.period !== "custom" || (t.customStart && t.customEnd && t.customEnd >= t.customStart), {
    message: "Custom periods need a start and end date",
    path: ["customEnd"],
  })
  .refine((t) => t.unit !== "custom" || !!t.customUnit, { message: "Name your custom unit", path: ["customUnit"] });
export type TargetInput = z.infer<typeof targetInput>;

export const sessionInput = z
  .object({
    activityType: z.enum(ACTIVITY_TYPES),
    title: title(200),
    notes: optText(),
    date: isoDate,
    startTime: z.preprocess(emptyToNull, time.nullable().optional()).transform((v) => v ?? null),
    durationMinutes: optInt(1, 24 * 60),
    quantity: optPositive,
    unit: optText(40),
    lifeAreaId: optUuid,
    skillId: optUuid,
    projectId: optUuid,
    taskId: optUuid,
    goalId: optUuid,
  })
  .refine((s) => s.durationMinutes !== null || s.quantity !== null, {
    message: "Enter a duration or a quantity",
    path: ["durationMinutes"],
  })
  .refine((s) => s.quantity === null || !!s.unit, { message: "Unit is required with a quantity", path: ["unit"] });
export type SessionInput = z.infer<typeof sessionInput>;

export const routineTemplateInput = z.object({
  name: title(80),
  kind: z.enum(ROUTINE_TEMPLATE_KINDS).default("custom"),
  weekdays: weekdays.default([]),
  isDefault: bool.default(false),
});
export type RoutineTemplateInput = z.infer<typeof routineTemplateInput>;

export const routineItemInput = z.object({
  templateId: z.uuid(),
  title: title(120),
  startTime: time,
  durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
  daysOfWeek: weekdays.nullable().default(null),
  activityType: z.preprocess(emptyToNull, z.enum(ACTIVITY_TYPES).nullable().optional()).transform((v) => v ?? null),
  lifeAreaId: optUuid,
  priority: z.enum(PRIORITIES).default("medium"),
  reminderMinutesBefore: optInt(0, 24 * 60),
  goalId: optUuid,
  skillId: optUuid,
  projectId: optUuid,
  logAsSession: bool.default(true),
});
export type RoutineItemInput = z.infer<typeof routineItemInput>;

export const ideaInput = z.object({
  title: title(),
  description: optText(),
  category: optText(60),
  status: z.enum(IDEA_STATUSES).default("captured"),
  lifeAreaId: optUuid,
  tags: tagList,
});
export type IdeaInput = z.infer<typeof ideaInput>;

export const projectInput = z
  .object({
    title: title(200),
    summary: optText(300),
    description: optText(),
    status: z.enum(PROJECT_STATUSES).default("active"),
    priority: z.enum(GOAL_PRIORITIES).default("medium"),
    lifeAreaId: optUuid,
    goalId: optUuid,
    startDate: optDate,
    targetDate: optDate,
    progressMode: z.enum(PROJECT_PROGRESS_MODES).default("milestones"),
    tags: tagList,
  })
  .refine((p) => !p.startDate || !p.targetDate || p.targetDate >= p.startDate, {
    message: "Target date must be after the start date",
    path: ["targetDate"],
  });
export type ProjectInput = z.infer<typeof projectInput>;

export const decisionInput = z.object({
  title: title(200),
  decision: z.string().trim().min(1, "Describe the decision").max(5000),
  context: optText(),
  alternatives: optText(),
  consequences: optText(),
  decidedOn: isoDate,
  projectId: optUuid,
  status: z.enum(DECISION_STATUSES).default("active"),
});
export type DecisionInput = z.infer<typeof decisionInput>;

export const noteInput = z.object({
  title: title(200),
  content: z.string().max(200_000).default(""),
  collection: optText(60),
  pinned: bool.default(false),
  lifeAreaId: optUuid,
  tags: tagList,
});
export type NoteInput = z.infer<typeof noteInput>;

export const skillInput = z.object({
  name: title(120),
  description: optText(),
  category: z.enum(SKILL_CATEGORIES).default("technical"),
  lifeAreaId: optUuid,
  currentLevel: z.coerce.number().int().min(0).max(5).default(0),
  targetLevel: z.coerce.number().int().min(0).max(5).default(3),
  status: z.enum(SKILL_STATUSES).default("active"),
});
export type SkillInput = z.infer<typeof skillInput>;

export const skillTopicStatus = z.enum(SKILL_TOPIC_STATUSES);

export const captureInput = z.object({
  content: z.string().trim().min(1, "Write something to capture").max(5000),
  kindHint: z.preprocess(emptyToNull, z.enum(INBOX_KINDS).nullable().optional()).transform((v) => v ?? null),
});

export const inboxConvertInput = z.object({
  destination: z.enum(INBOX_DESTINATIONS),
  title: title(),
  projectId: optUuid,
  priority: z.enum(PRIORITIES).optional(),
  dueDate: optDate,
  tags: tagList,
});
export type InboxConvertInput = z.infer<typeof inboxConvertInput>;

export const lifeAreaInput = z.object({
  name: title(40),
  color: z.enum(AREA_COLORS).default("graphite"),
});

export const linkInput = z.object({
  sourceType: z.enum(ENTITY_TYPES),
  sourceId: z.uuid(),
  targetRef: z.string().trim().min(5).max(20),
  relationType: z.enum(RELATION_TYPES).default("related"),
});

export const profileInput = z.object({
  name: title(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
});

export const appearanceInput = z.object({
  theme: z.enum(THEMES),
  accent: z.enum(ACCENTS),
});

export const registerInput = z.object({
  name: title(80),
  email: z.email("Enter a valid email").max(200).transform((e) => e.toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  timezone: z.string().max(60).optional(),
});

export const loginInput = z.object({
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  password: z.string().min(1, "Required").max(200),
});

/** Flatten zod issues into a field → message map for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
