"use server";

import { z } from "zod";
import { TASK_STATUSES } from "@/lib/domain/constants";
import { taskInput } from "@/lib/validation";
import {
  addTaskDependency,
  createTask,
  removeTaskDependency,
  setTaskArchived,
  setTaskDeleted,
  setTaskStatus,
  updateTask,
} from "@/server/services/tasks";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

/** Folds the recurrence sub-fields of the task form into one object. */
function taskFromForm(fd: FormData) {
  const raw = formToObject(fd);
  const freq = raw.recurrenceFreq as string | undefined;
  raw.recurrence = freq
    ? { freq, interval: raw.recurrenceInterval || 1, byWeekday: fd.getAll("recurrenceWeekdays").map(String) }
    : null;
  delete raw.recurrenceFreq;
  delete raw.recurrenceInterval;
  delete raw.recurrenceWeekdays;
  return taskInput.parse(raw);
}

export async function createTaskAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const task = await createTask(actor, taskFromForm(fd));
    return { ok: true as const, data: { ref: task.ref }, message: `Created ${task.ref}` };
  });
}

export async function updateTaskAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const id = z.uuid().parse(fd.get("id"));
    const task = await updateTask(actor, id, taskFromForm(fd));
    return { ok: true as const, data: { ref: task.ref }, message: "Saved" };
  });
}

export async function setTaskStatusAction(id: string, status: string) {
  return run(async ({ actor }) => {
    const r = await setTaskStatus(actor, z.uuid().parse(id), z.enum(TASK_STATUSES).parse(status));
    return { nextRef: r.nextInstance?.ref ?? null, nextDue: r.nextInstance?.dueDate ?? null };
  });
}

export async function quickAddTaskAction(title: string, extras: { projectId?: string | null; parentTaskId?: string | null; milestoneId?: string | null; dueDate?: string | null; goalId?: string | null; skillId?: string | null } = {}) {
  return run(async ({ actor }) => {
    const input = taskInput.parse({ title, ...extras });
    const t = await createTask(actor, input);
    return { ref: t.ref, id: t.id };
  });
}

export async function archiveTaskAction(id: string, archived: boolean) {
  return run(({ actor }) => setTaskArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteTaskAction(id: string, deleted: boolean) {
  return run(({ actor }) => setTaskDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

export async function addDependencyAction(taskId: string, blockerId: string) {
  return run(({ actor }) => addTaskDependency(actor, z.uuid().parse(taskId), z.uuid().parse(blockerId)));
}

export async function removeDependencyAction(taskId: string, blockerId: string) {
  return run(({ actor }) => removeTaskDependency(actor, z.uuid().parse(taskId), z.uuid().parse(blockerId)));
}
