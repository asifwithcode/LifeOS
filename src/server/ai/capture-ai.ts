import "server-only";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CaptureSuggestion } from "@/lib/domain/capture";
import { INBOX_DESTINATIONS, PRIORITIES } from "@/lib/domain/constants";
import { db } from "@/server/db";
import { projects } from "@/server/db/schema";
import type { Actor } from "@/server/engines/actor";
import { getProvider } from "./registry";
import { AIUnavailableError } from "./types";

const schema = z.object({
  type: z.enum(INBOX_DESTINATIONS),
  title: z.string().min(1).max(200),
  projectRef: z.string().regex(/^PRJ-\d{4,}$/).optional(),
  tags: z.array(z.string().max(40)).max(6),
  priority: z.enum(PRIORITIES).optional(),
  dueHint: z.enum(["today", "tomorrow"]).optional(),
  reason: z.string().max(200),
});

/** AI implementation of the capture classifier; returns the same shape as the rule-based one. */
export async function classifyCaptureWithAI(actor: Actor, text: string): Promise<CaptureSuggestion | null> {
  const provider = getProvider();
  if (!provider) throw new AIUnavailableError();
  const active = await db
    .select({ id: projects.id, ref: projects.ref, title: projects.title })
    .from(projects)
    .where(and(eq(projects.userId, actor.userId), isNull(projects.deletedAt), inArray(projects.status, ["planned", "active", "on_hold"])));
  const out = await provider.structured({
    system: "Classify a quick capture from a personal productivity app. Choose the single best destination. Only use a project reference from the list. Tags: short lowercase words.",
    prompt: `Active projects:\n${active.map((p) => `- ${p.ref} ${p.title}`).join("\n") || "- none"}\n\nCapture:\n${text.slice(0, 2000)}`,
    schema,
  });
  if (!out) return null;
  const project = out.projectRef ? active.find((p) => p.ref === out.projectRef) : undefined;
  return {
    type: out.type,
    title: out.title,
    projectId: project?.id ?? null,
    projectTitle: project?.title ?? null,
    tags: out.tags.map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean),
    priority: out.type === "task" ? (out.priority ?? "medium") : undefined,
    dueHint: out.dueHint ?? null,
    url: null,
    reasons: [out.reason],
    source: "ai",
  };
}
