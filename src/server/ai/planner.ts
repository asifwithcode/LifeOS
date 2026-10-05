import "server-only";
import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/domain/constants";
import { minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import { db } from "@/server/db";
import { userSettings } from "@/server/db/schema";
import { nowMinutesOf, todayOf, type Actor } from "@/server/engines/actor";
import { resolveRef } from "@/server/engines/search";
import { listAdjustments } from "@/server/services/adjustments";
import { getRoutineDay } from "@/server/services/routine";
import { evaluateTargets } from "@/server/services/targets";
import { listTasks } from "@/server/services/tasks";
import { formatTargetAmount } from "@/lib/domain/targets";
import { eq } from "drizzle-orm";
import { resolvePrivacy } from "./privacy";
import { getProvider } from "./registry";
import { AIUnavailableError } from "./types";

export const dayPlanSchema = z.object({
  summary: z.string().max(600).describe("Two sentences: what the plan prioritises and why."),
  blocks: z
    .array(
      z.object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        durationMinutes: z.number().int().min(10).max(240),
        title: z.string().min(1).max(120),
        activityType: z.enum(ACTIVITY_TYPES).optional(),
        taskRef: z.string().regex(/^TSK-\d{4,}$/).optional(),
        reason: z.string().max(200),
      }),
    )
    .max(12),
  cautions: z.array(z.string().max(200)).max(5).describe("Honest warnings, e.g. not enough time for everything."),
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

export interface Busy {
  start: number;
  end: number;
}

/**
 * Server-side guard on model output: drop blocks that start in the past, overlap fixed
 * commitments or each other, run past midnight, or reference unknown tasks.
 */
export function sanitizePlan(plan: DayPlan, busy: Busy[], nowMinutes: number, validTaskRefs: Set<string>): { blocks: DayPlan["blocks"]; dropped: string[] } {
  const taken = [...busy];
  const kept: DayPlan["blocks"] = [];
  const dropped: string[] = [];
  for (const b of [...plan.blocks].sort((x, y) => timeToMinutes(x.start) - timeToMinutes(y.start))) {
    const s = timeToMinutes(b.start);
    const e = s + b.durationMinutes;
    if (s < nowMinutes) dropped.push(`${b.title}: starts in the past`);
    else if (e > 24 * 60) dropped.push(`${b.title}: runs past midnight`);
    else if (taken.some((t) => s < t.end && e > t.start)) dropped.push(`${b.title}: overlaps another block`);
    else if (b.taskRef && !validTaskRefs.has(b.taskRef)) dropped.push(`${b.title}: unknown task ${b.taskRef}`);
    else {
      kept.push(b);
      taken.push({ start: s, end: e });
    }
  }
  return { blocks: kept, dropped };
}

export async function suggestDayPlan(actor: Actor, wishes = "") {
  const provider = getProvider();
  if (!provider) throw new AIUnavailableError();
  const today = todayOf(actor);
  const now = nowMinutesOf(actor);
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, actor.userId));
  const privacy = resolvePrivacy(settings?.aiPrivacy);
  const [routine, adjustments, todayTasks, upcoming, targets] = await Promise.all([
    getRoutineDay(actor, today),
    listAdjustments(actor.userId, today),
    privacy.tasks ? listTasks(actor, { view: "today" }) : Promise.resolve([]),
    privacy.tasks ? listTasks(actor, { view: "upcoming", limit: 10 }) : Promise.resolve([]),
    privacy.targets ? evaluateTargets(actor) : Promise.resolve([]),
  ]);
  const busy: Busy[] = [
    ...routine.slots.filter((s) => s.state !== "skipped").map((s) => ({ start: timeToMinutes(s.item.startTime), end: timeToMinutes(s.item.startTime) + s.item.durationMinutes })),
    ...adjustments.filter((a) => a.adj.status !== "skipped").map((a) => ({ start: timeToMinutes(a.adj.startTime), end: timeToMinutes(a.adj.startTime) + a.adj.durationMinutes })),
  ];
  const tasks = [...todayTasks, ...upcoming.filter((u) => !todayTasks.some((t) => t.id === u.id))].filter((t) => !t.blocked);
  const prompt = [
    `Today is ${today}; the time now is ${minutesToTime(now)}. Plan the rest of today only.`,
    "",
    "Fixed blocks (do not overlap these):",
    ...(routine.slots.length || adjustments.length
      ? [
          ...routine.slots.map((s) => `- ${s.item.startTime.slice(0, 5)}–${s.endTime} ${s.item.title} (${s.state})`),
          ...adjustments.map((a) => `- ${a.adj.startTime.slice(0, 5)} for ${a.adj.durationMinutes}m ${a.adj.title} (already planned)`),
        ]
      : ["- none"]),
    "",
    "Open tasks (unblocked):",
    ...(tasks.length ? tasks.slice(0, 20).map((t) => `- ${t.ref} ${t.title} [${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""}${t.estimatedMinutes ? `, ~${t.estimatedMinutes}m` : ""}]`) : ["- none"]),
    "",
    "Targets and pace:",
    ...(targets.length ? targets.map((t) => `- ${t.title} (${t.period}): ${formatTargetAmount(t.evaluation.actual, t.unit, t.customUnit)} of ${formatTargetAmount(t.amount, t.unit, t.customUnit)} — ${t.summary}`) : ["- none"]),
    wishes.trim() ? `\nThe user's wishes for today: ${wishes.trim().slice(0, 500)}` : "",
    "",
    "Return a realistic plan of focused blocks in free time between now and about 23:00, with breaks between long blocks. Prefer overdue/high-priority tasks and targets behind pace. Use task references only from the list. If not everything fits, say so in cautions.",
  ].join("\n");
  const plan = await provider.structured({
    system: "You are a careful day planner inside LifeOS. Use only the data provided; never invent tasks or commitments. Be realistic rather than ambitious.",
    prompt,
    schema: dayPlanSchema,
  });
  if (!plan) return null;
  const valid = new Set<string>();
  for (const ref of new Set(plan.blocks.map((b) => b.taskRef).filter(Boolean) as string[])) {
    const hit = await resolveRef(actor.userId, ref);
    if (hit?.entityType === "task") valid.add(ref);
  }
  const { blocks, dropped } = sanitizePlan(plan, busy, now, valid);
  return { summary: plan.summary, blocks, cautions: [...plan.cautions, ...dropped.map((d) => `Removed — ${d}`)], provider: provider.label };
}
