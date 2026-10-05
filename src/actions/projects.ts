"use server";

import { z } from "zod";
import { IDEA_STATUSES } from "@/lib/domain/constants";
import { decisionInput, ideaInput, projectInput } from "@/lib/validation";
import {
  convertIdeaToProject,
  createDecision,
  createIdea,
  createProject,
  deleteDecision,
  setIdeaDeleted,
  setIdeaStatus,
  setProjectArchived,
  setProjectDeleted,
  updateDecision,
  updateIdea,
  updateProject,
} from "@/server/services/projects";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function createProjectAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const p = await createProject(actor, projectInput.parse(formToObject(fd)));
    return { ok: true as const, message: `Created ${p.ref}`, redirectTo: `/projects/${p.ref}` };
  });
}

export async function updateProjectAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateProject(actor, z.uuid().parse(fd.get("id")), projectInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function archiveProjectAction(id: string, archived: boolean) {
  return run(({ actor }) => setProjectArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteProjectAction(id: string, deleted: boolean) {
  return run(({ actor }) => setProjectDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

export async function createIdeaAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const i = await createIdea(actor, ideaInput.parse(formToObject(fd)));
    return { ok: true as const, message: `Captured ${i.ref}` };
  });
}

export async function updateIdeaAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateIdea(actor, z.uuid().parse(fd.get("id")), ideaInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function setIdeaStatusAction(id: string, status: string) {
  return run(({ actor }) => setIdeaStatus(actor, z.uuid().parse(id), z.enum(IDEA_STATUSES).parse(status)).then(() => undefined));
}

export async function deleteIdeaAction(id: string, deleted: boolean) {
  return run(({ actor }) => setIdeaDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

export async function convertIdeaAction(id: string) {
  return run(async ({ actor }) => {
    const p = await convertIdeaToProject(actor, z.uuid().parse(id));
    return { ok: true as const, message: `Created project ${p.ref}`, redirectTo: `/projects/${p.ref}` };
  });
}

export async function saveDecisionAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    const input = decisionInput.parse(raw);
    if (raw.id) await updateDecision(actor, z.uuid().parse(raw.id), input);
    else await createDecision(actor, input);
    return { ok: true as const, message: raw.id ? "Saved" : "Decision recorded" };
  });
}

export async function deleteDecisionAction(id: string) {
  return run(({ actor }) => deleteDecision(actor, z.uuid().parse(id)));
}
