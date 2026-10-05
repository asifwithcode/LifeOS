"use server";

import { z } from "zod";
import { skillInput, skillTopicStatus } from "@/lib/validation";
import {
  addTopics,
  createSkill,
  deleteTopic,
  moveTopic,
  renameTopic,
  setSkillArchived,
  setSkillDeleted,
  setTopicStatus,
  updateSkill,
} from "@/server/services/skills";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function createSkillAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const raw = formToObject(fd);
    const topics = String(raw.topics ?? "").split("\n");
    const s = await createSkill(actor, skillInput.parse(raw), topics);
    return { ok: true as const, message: `Tracking ${s.name}`, redirectTo: `/skills/${s.ref}` };
  });
}

export async function updateSkillAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    await updateSkill(actor, z.uuid().parse(fd.get("id")), skillInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Saved" };
  });
}

export async function archiveSkillAction(id: string, archived: boolean) {
  return run(({ actor }) => setSkillArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteSkillAction(id: string, deleted: boolean) {
  return run(({ actor }) => setSkillDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}

export async function addTopicsAction(skillId: string, text: string) {
  return run(({ actor }) => addTopics(actor, z.uuid().parse(skillId), text.split("\n")));
}

export async function setTopicStatusAction(topicId: string, status: string) {
  return run(({ actor }) => setTopicStatus(actor, z.uuid().parse(topicId), skillTopicStatus.parse(status)));
}

export async function renameTopicAction(topicId: string, title: string) {
  return run(({ actor }) => renameTopic(actor, z.uuid().parse(topicId), z.string().trim().min(1).max(200).parse(title)));
}

export async function deleteTopicAction(topicId: string) {
  return run(({ actor }) => deleteTopic(actor, z.uuid().parse(topicId)));
}

export async function moveTopicAction(topicId: string, direction: "up" | "down") {
  return run(({ actor }) => moveTopic(actor, z.uuid().parse(topicId), z.enum(["up", "down"]).parse(direction)));
}
