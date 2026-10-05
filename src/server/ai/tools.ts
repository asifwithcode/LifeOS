import "server-only";
import { z } from "zod";
import { ENTITY_TYPES, type EntityType } from "@/lib/domain/constants";
import { formatMinutes } from "@/lib/domain/dates";
import type { Actor } from "@/server/engines/actor";
import { DomainError } from "@/server/engines/errors";
import { resolveRef, search } from "@/server/engines/search";
import { getGoalByRef } from "@/server/services/goals";
import { getNoteByRef } from "@/server/services/notes";
import { getIdeaByRef, getProjectByRef, listDecisions } from "@/server/services/projects";
import { getSkillByRef } from "@/server/services/skills";
import { getTargetByRef } from "@/server/services/targets";
import { getTaskByRef } from "@/server/services/tasks";
import { ACTION_KINDS, ACTION_LABEL, ACTION_SCHEMAS, describeAction, type ActionKind } from "./actions";
import { proposeAction } from "./action-service";
import { modeAllows, type AIMode } from "./modes";
import { allowedEntityTypes, canUse, type PrivacyKey } from "./privacy";
import type { ToolOutcome, ToolSpec } from "./types";

const PROPOSE_HINT: Record<ActionKind, string> = {
  create_task: "Propose creating one task.",
  update_task: "Propose changing a task's title, status, due date or priority.",
  create_goal: "Propose a new goal, optionally with weighted milestones.",
  create_target: "Propose a measurable target (amount per period) that counts matching sessions.",
  create_project: "Propose a project with milestones and tasks.",
  create_plan: "Propose saving a multi-week plan (e.g. a learning syllabus): becomes a goal with weighted milestones, each with tasks, plus optional targets.",
  save_note: "Propose saving Markdown as a note (e.g. a summary or explanation the user wants to keep).",
  create_idea: "Propose capturing an idea.",
  log_session: "Propose logging effort the user says they already did.",
  add_memory: "Propose remembering a durable preference, constraint, decision or plan. Only for lasting facts the user would want remembered — not passing remarks.",
  link_entities: "Propose linking two existing items by reference.",
  convert_idea: "Propose converting an idea into a project (the idea is kept).",
  add_routine_block: "Propose a temporary time block in the user's day plan (does not change routine templates).",
};

export function buildTools(mode: AIMode): ToolSpec[] {
  const read: ToolSpec[] = [
    {
      name: "search_items",
      description: "Full-text search across the user's items they have shared with you. Returns references, titles and snippets.",
      kind: "read",
      schema: z.object({ query: z.string().min(1).max(200), types: z.array(z.enum(ENTITY_TYPES)).optional() }),
    },
    {
      name: "get_item",
      description: "Fetch details of one item by reference (e.g. PRJ-0001, TSK-0042, NTE-0003).",
      kind: "read",
      schema: z.object({ ref: z.string().regex(/^[A-Za-z]{3}-\d{4,}$/) }),
    },
  ];
  const propose: ToolSpec[] = ACTION_KINDS.filter((k) => modeAllows(mode, k)).map((k) => ({
    name: `propose_${k}`,
    description: `${PROPOSE_HINT[k]} The user sees a preview and must approve; nothing changes until then.`,
    kind: "propose",
    schema: ACTION_SCHEMAS[k],
  }));
  return [...read, ...propose];
}

async function itemDetails(actor: Actor, type: EntityType, ref: string): Promise<string | null> {
  switch (type) {
    case "task": {
      const d = await getTaskByRef(actor, ref);
      if (!d) return null;
      const t = d.task;
      return [
        `${t.ref} ${t.title} — status ${t.status}, priority ${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""}`,
        t.description ? `Notes: ${t.description}` : "",
        d.context?.projectRef ? `Project: ${d.context.projectRef} ${d.context.projectTitle}` : "",
        d.subtasks.length ? `Subtasks: ${d.subtasks.map((s) => `${s.ref} ${s.title} (${s.status})`).join("; ")}` : "",
        d.blockers.length ? `Waits on: ${d.blockers.map((b) => `${b.ref} ${b.title} (${b.status})`).join("; ")}` : "",
        d.blocking.length ? `Blocks: ${d.blocking.map((b) => `${b.ref} ${b.title}`).join("; ")}` : "",
        `Time logged: ${formatMinutes(d.actualMinutes)}${t.estimatedMinutes ? ` of ${formatMinutes(t.estimatedMinutes)} estimated` : ""}`,
      ].filter(Boolean).join("\n");
    }
    case "project": {
      const d = await getProjectByRef(actor, ref);
      if (!d) return null;
      return [
        `${d.project.ref} ${d.project.title} — ${d.project.status}; progress ${d.progress.percent ?? "n/a"}% (${d.progress.explanation})`,
        d.project.summary ?? "",
        d.project.description ? d.project.description.slice(0, 3000) : "",
        d.milestones.length ? `Milestones: ${d.milestones.map((m) => `${m.title} [${m.status}, weight ${m.weight}, ${m.taskDone}/${m.taskTotal} tasks]`).join("; ")}` : "",
        d.decisions.length ? `Decisions: ${d.decisions.map((x) => `${x.ref} (${x.decidedOn}) ${x.decision}${x.context ? ` — because ${x.context}` : ""}`).join("; ")}` : "",
        `Time spent: ${formatMinutes(d.minutes.minutes)}`,
      ].filter(Boolean).join("\n");
    }
    case "goal": {
      const d = await getGoalByRef(actor, ref);
      if (!d) return null;
      return [
        `${d.goal.ref} ${d.goal.title} — ${d.goal.status}; progress ${d.progress.percent ?? "n/a"}% (${d.progress.explanation})`,
        d.goal.why ? `Why: ${d.goal.why}` : "",
        d.goal.targetDate ? `Target date: ${d.goal.targetDate}` : "",
        d.milestones.length ? `Milestones: ${d.milestones.map((m) => `${m.title} [${m.status}, weight ${m.weight}]`).join("; ")}` : "",
        d.targets.length ? `Targets: ${d.targets.map((t) => `${t.ref} ${t.title}: ${t.summary}`).join("; ")}` : "",
        d.projects.length ? `Projects: ${d.projects.map((p) => `${p.ref} ${p.title}`).join("; ")}` : "",
      ].filter(Boolean).join("\n");
    }
    case "target": {
      const d = await getTargetByRef(actor, ref);
      if (!d) return null;
      const e = d.target.evaluation;
      return `${d.target.ref} ${d.target.title}: ${e.actual} of ${e.amount} ${d.target.unit} (${d.target.period}, ${e.range.start}–${e.range.end}), ${e.status}. ${d.target.summary}\nPrevious periods: ${d.history.map((h) => `${h.range.start}: ${Math.round(h.percent)}%`).join(", ") || "none"}`;
    }
    case "skill": {
      const d = await getSkillByRef(actor, ref);
      if (!d) return null;
      return `${d.skill.ref} ${d.skill.name} — ${d.progress.explanation}\nTopics: ${d.topics.map((t) => `${t.title} (${t.status})`).join("; ")}\nTime: ${formatMinutes(d.totals.all.minutes)} total, ${formatMinutes(d.totals.last30.minutes)} last 30 days. Self-assessed level ${d.skill.currentLevel}/5, target ${d.skill.targetLevel}/5.`;
    }
    case "note": {
      const n = await getNoteByRef(actor, ref);
      return n ? `${n.ref} ${n.title}\n${n.content.slice(0, 8000)}${n.content.length > 8000 ? "\n[…truncated]" : ""}` : null;
    }
    case "idea": {
      const i = await getIdeaByRef(actor, ref);
      return i ? `${i.ref} ${i.title} — stage ${i.status}${i.projectRef ? `, converted to ${i.projectRef}` : ""}\n${i.description ?? ""}` : null;
    }
    case "decision": {
      const rows = await listDecisions(actor);
      const d = rows.find((r) => r.decision.ref === ref)?.decision;
      return d ? `${d.ref} ${d.title} (${d.decidedOn}, ${d.status}): ${d.decision}${d.context ? `\nReason: ${d.context}` : ""}${d.alternatives ? `\nAlternatives: ${d.alternatives}` : ""}` : null;
    }
    default:
      return null;
  }
}

export interface ToolContext {
  actor: Actor;
  privacy: Record<PrivacyKey, boolean>;
  conversationId: string;
  messageId: string;
  mode: AIMode;
  onProposal: (actionId: string) => void;
}

/** Executes read tools (permission-filtered) and records proposals. Never mutates user data. */
export function toolHandler(ctx: ToolContext) {
  return async (name: string, input: unknown): Promise<ToolOutcome> => {
    try {
      if (name === "search_items") {
        const { query, types } = input as { query: string; types?: EntityType[] };
        const allowed = allowedEntityTypes(ctx.privacy);
        const hits = await search(ctx.actor.userId, query, { types: types ? types.filter((t) => allowed.includes(t)) : allowed, limit: 10, includeArchived: true });
        if (!hits.length) return { content: "No matching items." };
        return { content: hits.map((h) => `[${h.entityType}] ${h.ref ?? ""} ${h.title}${h.archived ? " (done/archived)" : ""}${h.snippet ? ` — ${h.snippet.replace(/[«»]/g, "")}` : ""}`).join("\n") };
      }
      if (name === "get_item") {
        const ref = (input as { ref: string }).ref.toUpperCase();
        const hit = await resolveRef(ctx.actor.userId, ref);
        if (!hit) return { content: `No item ${ref}.`, isError: true };
        if (!canUse(ctx.privacy, hit.entityType)) return { content: `The user hasn't shared ${hit.entityType}s with the assistant.`, isError: true };
        return { content: (await itemDetails(ctx.actor, hit.entityType, ref)) ?? `${ref} ${hit.title}` };
      }
      if (name.startsWith("propose_")) {
        const kind = name.slice("propose_".length) as ActionKind;
        if (!ACTION_KINDS.includes(kind) || !modeAllows(ctx.mode, kind)) return { content: `Action ${kind} is not available in this mode.`, isError: true };
        const row = await proposeAction(ctx.actor, { conversationId: ctx.conversationId, messageId: ctx.messageId, kind, payload: input });
        ctx.onProposal(row.id);
        return { content: `Proposal ${row.ref} recorded (“${describeAction(kind, row.payload).summary}”). It is shown to the user as a ${ACTION_LABEL[kind]} card and will only run if they approve. Do not claim it is done.` };
      }
      return { content: `Unknown tool ${name}`, isError: true };
    } catch (err) {
      if (err instanceof DomainError) return { content: err.message, isError: true };
      console.error("[ai tool]", err);
      return { content: "Tool failed.", isError: true };
    }
  };
}
