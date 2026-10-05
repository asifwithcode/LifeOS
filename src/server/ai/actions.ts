import { z } from "zod";
import { ACTIVITY_TYPES, PRIORITIES, TARGET_PERIODS, TARGET_UNITS, TASK_STATUSES, type EntityType } from "@/lib/domain/constants";
import { isISODate } from "@/lib/domain/dates";

// Typed AI action catalog. The model can only *propose* these; nothing executes without approval.
// Every payload is validated here when proposed and again when executed.

const ref = (prefix: string) => z.string().regex(new RegExp(`^${prefix}-\\d{4,}$`), `Expected a ${prefix}-0000 reference`);
const date = z.string().refine(isISODate, "Use YYYY-MM-DD");
const text = (max: number) => z.string().trim().min(1).max(max);
const reason = z.string().trim().max(500).optional().describe("One sentence on why this helps, shown to the user.");

const milestone = z.object({
  title: text(200),
  weight: z.number().int().min(1).max(10).optional(),
  dueDate: date.optional(),
  tasks: z.array(z.object({ title: text(300), dueDate: date.optional(), estimatedMinutes: z.number().int().min(1).max(10000).optional() })).max(30).optional(),
});

const targetSpec = z.object({
  title: text(200),
  amount: z.number().positive().max(1_000_000),
  unit: z.enum(TARGET_UNITS),
  customUnit: z.string().trim().max(40).optional(),
  period: z.enum(TARGET_PERIODS.filter((p) => p !== "custom") as ["daily", "weekly", "monthly", "quarterly", "yearly"]),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  skillRef: ref("SKL").optional(),
  projectRef: ref("PRJ").optional(),
});

export const ACTION_SCHEMAS = {
  create_task: z.object({
    title: text(300),
    description: z.string().max(5000).optional(),
    dueDate: date.optional(),
    priority: z.enum(PRIORITIES).optional(),
    estimatedMinutes: z.number().int().min(1).max(10000).optional(),
    projectRef: ref("PRJ").optional(),
    goalRef: ref("GOL").optional(),
    skillRef: ref("SKL").optional(),
    reason,
  }),
  update_task: z
    .object({
      ref: ref("TSK"),
      title: text(300).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      dueDate: date.nullable().optional(),
      priority: z.enum(PRIORITIES).optional(),
      reason,
    })
    .refine((v) => v.title !== undefined || v.status !== undefined || v.dueDate !== undefined || v.priority !== undefined, "Nothing to change"),
  create_goal: z.object({
    title: text(300),
    why: z.string().max(2000).optional(),
    description: z.string().max(5000).optional(),
    targetDate: date.optional(),
    milestones: z.array(milestone.omit({ tasks: true })).max(20).optional(),
    reason,
  }),
  create_target: targetSpec.extend({ goalRef: ref("GOL").optional(), reason }),
  create_project: z.object({
    title: text(200),
    summary: z.string().max(300).optional(),
    description: z.string().max(10000).optional(),
    goalRef: ref("GOL").optional(),
    milestones: z.array(milestone).max(20).optional(),
    reason,
  }),
  create_plan: z.object({
    title: text(300).describe("The outcome, e.g. 'Learn ESP32 in 3 months'"),
    why: z.string().max(2000).optional(),
    targetDate: date.optional(),
    milestones: z.array(milestone).min(1).max(24),
    targets: z.array(targetSpec).max(6).optional(),
    reason,
  }),
  save_note: z.object({ title: text(200), content: z.string().max(100_000), collection: z.string().trim().max(60).optional(), reason }),
  create_idea: z.object({ title: text(300), description: z.string().max(10000).optional(), reason }),
  log_session: z
    .object({
      title: text(200),
      activityType: z.enum(ACTIVITY_TYPES),
      date: date.optional(),
      durationMinutes: z.number().int().min(1).max(1440).optional(),
      quantity: z.number().positive().max(1_000_000).optional(),
      unit: z.string().trim().max(40).optional(),
      skillRef: ref("SKL").optional(),
      projectRef: ref("PRJ").optional(),
      taskRef: ref("TSK").optional(),
      reason,
    })
    .refine((v) => v.durationMinutes !== undefined || (v.quantity !== undefined && !!v.unit), "Give a duration or a quantity with unit"),
  add_memory: z.object({
    content: text(1000),
    kind: z.enum(["preference", "goal", "decision", "constraint", "plan", "fact"]),
    reason,
  }),
  link_entities: z.object({ sourceRef: z.string().regex(/^[A-Z]{3}-\d{4,}$/), targetRef: z.string().regex(/^[A-Z]{3}-\d{4,}$/), reason }),
  convert_idea: z.object({ ref: ref("IDE"), reason }),
  add_routine_block: z.object({
    date: date.optional().describe("Defaults to today"),
    title: text(120),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(5).max(600),
    activityType: z.enum(ACTIVITY_TYPES).optional(),
    taskRef: ref("TSK").optional(),
    reason,
  }),
} as const;

export type ActionKind = keyof typeof ACTION_SCHEMAS;
export const ACTION_KINDS = Object.keys(ACTION_SCHEMAS) as ActionKind[];
export type ActionPayload<K extends ActionKind> = z.infer<(typeof ACTION_SCHEMAS)[K]>;

export const ACTION_LABEL: Record<ActionKind, string> = {
  create_task: "Create task",
  update_task: "Update task",
  create_goal: "Create goal",
  create_target: "Create target",
  create_project: "Create project",
  create_plan: "Save plan",
  save_note: "Save note",
  create_idea: "Capture idea",
  log_session: "Log session",
  add_memory: "Remember",
  link_entities: "Link items",
  convert_idea: "Convert idea to project",
  add_routine_block: "Add to today's plan",
};

/** Which entity type each ref field must resolve to. */
export const REF_FIELD_TYPE: Record<string, EntityType> = {
  projectRef: "project",
  goalRef: "goal",
  skillRef: "skill",
  taskRef: "task",
};

export function validateAction(kind: string, payload: unknown): { ok: true; kind: ActionKind; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!(ACTION_KINDS as string[]).includes(kind)) return { ok: false, error: `Unknown action ${kind}` };
  const parsed = ACTION_SCHEMAS[kind as ActionKind].safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  return { ok: true, kind: kind as ActionKind, payload: parsed.data as Record<string, unknown> };
}

/** All refs mentioned anywhere in a payload (for existence checks). */
export function collectRefs(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (/^[A-Z]{3}-\d{4,}$/.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(payload);
  return [...out];
}

/** Human preview lines shown on the approval card. */
export function describeAction(kind: ActionKind, p: Record<string, unknown>): { summary: string; details: string[] } {
  const d: string[] = [];
  const opt = (label: string, v: unknown) => (v !== undefined && v !== null && v !== "" ? d.push(`${label}: ${v}`) : 0);
  const ms = (p.milestones as { title: string; weight?: number; dueDate?: string; tasks?: { title: string }[] }[] | undefined) ?? [];
  switch (kind) {
    case "create_task":
      opt("Due", p.dueDate);
      opt("Priority", p.priority);
      opt("Estimate", p.estimatedMinutes ? `${p.estimatedMinutes} min` : undefined);
      opt("Project", p.projectRef);
      opt("Goal", p.goalRef);
      opt("Skill", p.skillRef);
      return { summary: `Create task “${p.title}”`, details: d };
    case "update_task":
      opt("New title", p.title);
      opt("Status", p.status);
      if (p.dueDate !== undefined) d.push(`Due: ${p.dueDate ?? "cleared"}`);
      opt("Priority", p.priority);
      return { summary: `Update ${p.ref}`, details: d };
    case "create_goal":
      opt("Target date", p.targetDate);
      opt("Why", p.why);
      ms.forEach((m) => d.push(`Milestone: ${m.title}${m.weight ? ` (weight ${m.weight})` : ""}${m.dueDate ? ` · ${m.dueDate}` : ""}`));
      return { summary: `Create goal “${p.title}”`, details: d };
    case "create_target":
      opt("Counts", [p.activityType, p.skillRef, p.projectRef].filter(Boolean).join(", ") || "all matching sessions");
      opt("Goal", p.goalRef);
      return { summary: `Create target “${p.title}”: ${p.amount} ${p.unit === "custom" ? p.customUnit : p.unit} per ${String(p.period).replace("ly", "").replace("dai", "day")}`, details: d };
    case "create_project":
    case "create_plan": {
      opt("Target date", p.targetDate);
      opt("Goal", p.goalRef);
      let tasks = 0;
      ms.forEach((m) => {
        tasks += m.tasks?.length ?? 0;
        d.push(`Milestone: ${m.title}${m.dueDate ? ` · ${m.dueDate}` : ""}${m.tasks?.length ? ` · ${m.tasks.length} task${m.tasks.length === 1 ? "" : "s"}` : ""}`);
      });
      const targets = (p.targets as { title: string; amount: number; unit: string; period: string }[] | undefined) ?? [];
      targets.forEach((t) => d.push(`Target: ${t.title} — ${t.amount} ${t.unit} ${t.period}`));
      const what = kind === "create_plan" ? "goal" : "project";
      return { summary: `${kind === "create_plan" ? "Save plan" : "Create project"} “${p.title}” — ${what} with ${ms.length} milestone${ms.length === 1 ? "" : "s"}, ${tasks} task${tasks === 1 ? "" : "s"}${targets.length ? `, ${targets.length} target${targets.length === 1 ? "" : "s"}` : ""}`, details: d };
    }
    case "save_note":
      opt("Collection", p.collection);
      d.push(`${String(p.content).length} characters of Markdown`);
      return { summary: `Save note “${p.title}”`, details: d };
    case "create_idea":
      return { summary: `Capture idea “${p.title}”`, details: d };
    case "log_session":
      opt("Date", p.date ?? "today");
      opt("Duration", p.durationMinutes ? `${p.durationMinutes} min` : undefined);
      opt("Amount", p.quantity ? `${p.quantity} ${p.unit}` : undefined);
      opt("Skill", p.skillRef);
      opt("Project", p.projectRef);
      opt("Task", p.taskRef);
      return { summary: `Log ${p.activityType} session “${p.title}”`, details: d };
    case "add_memory":
      d.push(`Kind: ${p.kind}`);
      return { summary: `Remember: “${p.content}”`, details: d };
    case "link_entities":
      return { summary: `Link ${p.sourceRef} ↔ ${p.targetRef}`, details: d };
    case "convert_idea":
      return { summary: `Convert ${p.ref} into a project (the idea is kept)`, details: d };
    case "add_routine_block":
      opt("Date", p.date ?? "today");
      opt("Task", p.taskRef);
      return { summary: `Plan “${p.title}” at ${p.startTime} for ${p.durationMinutes} min`, details: [...d, "Temporary — your routine templates are not changed."] };
  }
}
