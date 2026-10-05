"use server";

import { z } from "zod";
import { goalInput, milestoneInput, milestoneStatus } from "@/lib/validation";
import { createGoal, setGoalArchived, setGoalDeleted, updateGoal } from "@/server/services/goals";
import {
  addMilestone,
  addMilestoneDependency,
  deleteMilestone,
  moveMilestone,
  removeMilestoneDependency,
  setMilestoneStatus,
  updateMilestone,
} from "@/server/services/milestones";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function createGoalAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const g = await createGoal(actor, goalInput.parse(formToObject(fd)));
    return { ok: true as const, message: `Created ${g.ref}`, redirectTo: `/goals/${g.ref}` };
  });
}

export async function updateGoalAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateGoal(actor, z.uuid().parse(fd.get("id")), goalInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function archiveGoalAction(id: string, archived: boolean) {
  return run(({ actor }) => setGoalArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteGoalAction(id: string, deleted: boolean) {
  return run(({ actor }) => setGoalDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

const ownerSchema = z.union([z.object({ goalId: z.uuid() }), z.object({ projectId: z.uuid() })]);

export async function addMilestoneAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    const owner = ownerSchema.parse(raw.goalId ? { goalId: raw.goalId } : { projectId: raw.projectId });
    const m = await addMilestone(actor, owner, milestoneInput.parse(raw));
    return { ok: true as const, message: `Added ${m.title}` };
  });
}

export async function updateMilestoneAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateMilestone(actor, z.uuid().parse(fd.get("id")), milestoneInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function setMilestoneStatusAction(id: string, status: string) {
  return run(({ actor }) => setMilestoneStatus(actor, z.uuid().parse(id), milestoneStatus.parse(status)).then(() => undefined));
}

export async function deleteMilestoneAction(id: string) {
  return run(({ actor }) => deleteMilestone(actor, z.uuid().parse(id)));
}

export async function moveMilestoneAction(id: string, direction: "up" | "down") {
  return run(({ actor }) => moveMilestone(actor, z.uuid().parse(id), z.enum(["up", "down"]).parse(direction)));
}

export async function addMilestoneDependencyAction(id: string, blockerId: string) {
  return run(({ actor }) => addMilestoneDependency(actor, z.uuid().parse(id), z.uuid().parse(blockerId)));
}

export async function removeMilestoneDependencyAction(id: string, blockerId: string) {
  return run(({ actor }) => removeMilestoneDependency(actor, z.uuid().parse(id), z.uuid().parse(blockerId)));
}
