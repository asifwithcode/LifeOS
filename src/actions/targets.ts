"use server";

import { z } from "zod";
import { sessionInput, targetInput } from "@/lib/validation";
import { deleteSession, logSession } from "@/server/services/sessions";
import { createTarget, setTargetArchived, setTargetDeleted, setTargetStatus, updateTarget } from "@/server/services/targets";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function createTargetAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const t = await createTarget(actor, targetInput.parse(formToObject(fd)));
    return { ok: true as const, message: `Created ${t.ref}` };
  });
}

export async function updateTargetAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateTarget(actor, z.uuid().parse(fd.get("id")), targetInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function setTargetStatusAction(id: string, status: "active" | "paused") {
  return run(({ actor }) => setTargetStatus(actor, z.uuid().parse(id), z.enum(["active", "paused"]).parse(status)).then(() => undefined));
}

export async function archiveTargetAction(id: string, archived: boolean) {
  return run(({ actor }) => setTargetArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteTargetAction(id: string, deleted: boolean) {
  return run(({ actor }) => setTargetDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

export async function logSessionAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    // Duration can be entered as hours + minutes.
    if (raw.durationHours !== undefined || raw.durationMins !== undefined) {
      const total = Number(raw.durationHours || 0) * 60 + Number(raw.durationMins || 0);
      raw.durationMinutes = total > 0 ? total : "";
      delete raw.durationHours;
      delete raw.durationMins;
    }
    const s = await logSession(actor, sessionInput.parse(raw));
    return { ok: true as const, message: `Logged ${s.title}` };
  });
}

export async function deleteSessionAction(id: string) {
  return run(({ actor }) => deleteSession(actor, z.uuid().parse(id)).then(() => undefined));
}
