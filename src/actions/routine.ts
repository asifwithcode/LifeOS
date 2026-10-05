"use server";

import { z } from "zod";
import { isoDate, routineItemInput, routineTemplateInput } from "@/lib/validation";
import {
  completeRoutineItem,
  createRoutineItem,
  createTemplate,
  duplicateTemplate,
  removeRoutineItem,
  resetRoutineItem,
  setDayPlan,
  setTemplateArchived,
  skipRoutineItem,
  updateRoutineItem,
  updateTemplate,
} from "@/server/services/routine";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function saveTemplateAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    const input = routineTemplateInput.parse({ weekdays: [], ...raw });
    const id = raw.id ? z.uuid().parse(raw.id) : null;
    const t = id ? await updateTemplate(actor, id, input) : await createTemplate(actor, input);
    return { ok: true as const, message: id ? "Template saved" : `Created ${t.name}`, redirectTo: `/routine?template=${t.id}` };
  });
}

export async function archiveTemplateAction(id: string, archived: boolean) {
  return run(({ actor }) => setTemplateArchived(actor, z.uuid().parse(id), archived));
}

export async function duplicateTemplateAction(id: string, name: string) {
  return run(async ({ actor }) => {
    const t = await duplicateTemplate(actor, z.uuid().parse(id), z.string().trim().min(1).max(80).parse(name));
    return { id: t.id };
  });
}

export async function saveRoutineItemAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    const input = routineItemInput.parse({ daysOfWeek: [], ...raw });
    const id = raw.id ? z.uuid().parse(raw.id) : null;
    if (id) await updateRoutineItem(actor, id, input);
    else await createRoutineItem(actor, input);
    return { ok: true as const, message: id ? "Saved" : `Added ${input.title}` };
  });
}

export async function removeRoutineItemAction(id: string) {
  return run(async ({ actor }) => {
    const r = await removeRoutineItem(actor, z.uuid().parse(id));
    return { ok: true as const, message: r === "archived" ? "Archived (history kept)" : "Removed" };
  });
}

export async function completeRoutineAction(itemId: string, date: string, actualMinutes?: number | null) {
  return run(({ actor }) =>
    completeRoutineItem(actor, z.uuid().parse(itemId), isoDate.parse(date), {
      actualMinutes: actualMinutes ? z.number().int().min(1).max(1440).parse(actualMinutes) : null,
    }).then(() => undefined),
  );
}

export async function skipRoutineAction(itemId: string, date: string) {
  return run(({ actor }) => skipRoutineItem(actor, z.uuid().parse(itemId), isoDate.parse(date)));
}

export async function resetRoutineAction(itemId: string, date: string) {
  return run(({ actor }) => resetRoutineItem(actor, z.uuid().parse(itemId), isoDate.parse(date)));
}

export async function setDayPlanAction(date: string, templateId: string | null) {
  return run(({ actor }) => setDayPlan(actor, isoDate.parse(date), templateId ? z.uuid().parse(templateId) : null));
}
