"use server";

import { z } from "zod";
import { noteInput } from "@/lib/validation";
import { createNote, setNoteArchived, setNoteDeleted, setNotePinned, updateNote } from "@/server/services/notes";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function createNoteAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ actor }) => {
    const n = await createNote(actor, noteInput.parse(formToObject(fd)));
    return { ok: true as const, message: `Created ${n.ref}`, redirectTo: `/notes/${n.ref}?edit=1` };
  });
}

/** Called by the editor's explicit save and its debounced autosave. */
export async function saveNoteAction(id: string, data: { title: string; content: string; collection: string | null; pinned: boolean; lifeAreaId: string | null; tags: string[] }) {
  return run(async ({ actor }) => {
    const n = await updateNote(actor, z.uuid().parse(id), noteInput.parse(data));
    return { updatedAt: n.updatedAt.toISOString() };
  });
}

export async function quickNoteAction(title: string, content = "") {
  return run(async ({ actor }) => {
    const n = await createNote(actor, noteInput.parse({ title, content }));
    return { ref: n.ref };
  });
}

export async function pinNoteAction(id: string, pinned: boolean) {
  return run(({ actor }) => setNotePinned(actor, z.uuid().parse(id), pinned));
}

export async function archiveNoteAction(id: string, archived: boolean) {
  return run(({ actor }) => setNoteArchived(actor, z.uuid().parse(id), archived).then(() => undefined));
}

export async function deleteNoteAction(id: string, deleted: boolean) {
  return run(({ actor }) => setNoteDeleted(actor, z.uuid().parse(id), deleted).then(() => undefined));
}
