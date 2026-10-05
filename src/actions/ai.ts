"use server";

import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/domain/constants";
import { isoDate, time } from "@/lib/validation";
import { approveAction, rejectAction, reopenFailedAction } from "@/server/ai/action-service";
import { classifyCaptureWithAI } from "@/server/ai/capture-ai";
import { archiveConversation, deleteConversation, renameConversation } from "@/server/ai/chat";
import { suggestDayPlan } from "@/server/ai/planner";
import { PRIVACY_MODULES } from "@/server/ai/privacy";
import { AIUnavailableError } from "@/server/ai/types";
import { todayOf } from "@/server/engines/actor";
import { DomainError } from "@/server/engines/errors";
import { addAdjustment, completeAdjustment, removeAdjustment, resetAdjustment } from "@/server/services/adjustments";
import { addMemory, deleteMemory, MEMORY_KINDS, setAiPrivacy, setMemoryArchived, setMemoryEnabled, updateMemory } from "@/server/services/memory";
import { resolveRef } from "@/server/engines/search";
import { run } from "./_run";

const uuid = z.uuid();

export async function approveActionAction(id: string, editedPayload?: unknown) {
  return run(async ({ actor }) => approveAction(actor, uuid.parse(id), editedPayload));
}

export async function rejectActionAction(id: string) {
  return run(({ actor }) => rejectAction(actor, uuid.parse(id)));
}

export async function reopenActionAction(id: string) {
  return run(({ actor }) => reopenFailedAction(actor, uuid.parse(id)));
}

export async function renameConversationAction(id: string, title: string) {
  return run(({ user }) => renameConversation(user.id, uuid.parse(id), z.string().max(120).parse(title)));
}

export async function archiveConversationAction(id: string, archived: boolean) {
  return run(({ user }) => archiveConversation(user.id, uuid.parse(id), archived));
}

export async function deleteConversationAction(id: string) {
  return run(({ user }) => deleteConversation(user.id, uuid.parse(id)));
}

const memoryInput = z.object({ content: z.string().trim().min(1, "Write the memory").max(1000), kind: z.enum(MEMORY_KINDS) });

export async function addMemoryAction(content: string, kind: string) {
  return run(async ({ actor }) => {
    const m = memoryInput.parse({ content, kind });
    await addMemory(actor, { ...m, source: "manual" });
  });
}

export async function updateMemoryAction(id: string, content: string, kind: string) {
  return run(({ actor }) => updateMemory(actor, uuid.parse(id), memoryInput.parse({ content, kind })).then(() => undefined));
}

export async function archiveMemoryAction(id: string, archived: boolean) {
  return run(({ actor }) => setMemoryArchived(actor, uuid.parse(id), archived));
}

export async function deleteMemoryAction(id: string) {
  return run(({ actor }) => deleteMemory(actor, uuid.parse(id)));
}

export async function setMemoryEnabledAction(enabled: boolean) {
  return run(({ user }) => setMemoryEnabled(user.id, z.boolean().parse(enabled)));
}

export async function setAiPrivacyAction(privacy: Record<string, boolean>) {
  return run(({ user }) => {
    const keys = PRIVACY_MODULES.map((m) => m.key) as string[];
    const clean = Object.fromEntries(Object.entries(z.record(z.string(), z.boolean()).parse(privacy)).filter(([k]) => keys.includes(k)));
    return setAiPrivacy(user.id, clean);
  });
}

function aiErrors<T>(fn: () => Promise<T>) {
  return fn().catch((err) => {
    if (err instanceof AIUnavailableError) throw new DomainError(err.message);
    throw err;
  });
}

export async function suggestDayPlanAction(wishes: string) {
  return run(({ actor }) => aiErrors(() => suggestDayPlan(actor, z.string().max(500).parse(wishes))), { revalidate: false });
}

export async function suggestCaptureAIAction(content: string) {
  return run(({ actor }) => aiErrors(() => classifyCaptureWithAI(actor, z.string().trim().min(1).max(5000).parse(content))), { revalidate: false });
}

const blockInput = z.object({
  date: isoDate.optional(),
  start: time,
  durationMinutes: z.number().int().min(5).max(600),
  title: z.string().trim().min(1).max(120),
  activityType: z.enum(ACTIVITY_TYPES).optional(),
  taskRef: z.string().regex(/^TSK-\d{4,}$/).optional(),
});

/** Accepting a suggested block is the user's approval; it creates a date-only plan block. */
export async function acceptPlanBlocksAction(blocks: unknown[]) {
  return run(async ({ actor }) => {
    const list = z.array(blockInput).min(1).max(12).parse(blocks);
    for (const b of list) {
      const task = b.taskRef ? await resolveRef(actor.userId, b.taskRef) : null;
      await addAdjustment(actor, {
        date: b.date ?? todayOf(actor),
        title: b.title,
        startTime: b.start,
        durationMinutes: b.durationMinutes,
        activityType: b.activityType ?? null,
        taskId: task?.entityType === "task" ? task.entityId : null,
        source: "ai",
      });
    }
    return { count: list.length };
  });
}

export async function completeAdjustmentAction(id: string) {
  return run(({ actor }) => completeAdjustment(actor, uuid.parse(id)).then(() => undefined));
}

export async function resetAdjustmentAction(id: string) {
  return run(({ actor }) => resetAdjustment(actor, uuid.parse(id)));
}

export async function removeAdjustmentAction(id: string) {
  return run(({ actor }) => removeAdjustment(actor, uuid.parse(id)));
}
