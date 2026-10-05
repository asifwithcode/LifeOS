"use server";

import { z } from "zod";
import { linkInput } from "@/lib/validation";
import { db } from "@/server/db";
import { link, unlinkById } from "@/server/engines/relations";
import { resolveRef } from "@/server/engines/search";
import { DomainError } from "@/server/engines/errors";
import { run } from "./_run";

export async function linkEntityAction(input: unknown) {
  return run(async ({ actor }) => {
    const data = linkInput.parse(input);
    const target = await resolveRef(actor.userId, data.targetRef);
    if (!target) throw new DomainError(`No item with reference ${data.targetRef}`);
    await db.transaction((tx) => link(tx, actor, { type: data.sourceType, id: data.sourceId }, { type: target.entityType, id: target.entityId }, data.relationType));
  });
}

export async function unlinkAction(relationId: string) {
  return run(({ actor }) => db.transaction((tx) => unlinkById(tx, actor, z.uuid().parse(relationId))));
}
