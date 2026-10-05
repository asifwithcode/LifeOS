"use server";

import { z } from "zod";
import { captureInput, inboxConvertInput } from "@/lib/validation";
import { bulkAccept, capture, convertInboxItem, discardInboxItems, reclassify, restoreInboxItem, suggestFor } from "@/server/services/inbox";
import { run } from "./_run";

/** Live preview of the rule-based suggestion while typing (no writes). */
export async function previewCaptureAction(content: string) {
  return run(async ({ actor }) => {
    const text = z.string().trim().max(5000).parse(content);
    return text ? suggestFor(actor, text) : null;
  }, { revalidate: false });
}

export async function captureAction(content: string, kindHint?: string | null) {
  return run(async ({ actor }) => {
    const input = captureInput.parse({ content, kindHint });
    const item = await capture(actor, input.content, input.kindHint);
    return { id: item.id, ref: item.ref };
  });
}

/** Capture and immediately convert, after the user confirmed the suggestion. */
export async function captureAndConvertAction(content: string, conversion: unknown) {
  return run(async ({ actor }) => {
    const input = captureInput.parse({ content });
    const conv = inboxConvertInput.parse(conversion);
    const item = await capture(actor, input.content);
    return convertInboxItem(actor, item.id, conv);
  });
}

export async function convertInboxAction(id: string, conversion: unknown) {
  return run(({ actor }) => convertInboxItem(actor, z.uuid().parse(id), inboxConvertInput.parse(conversion)));
}

export async function bulkAcceptAction(ids: string[]) {
  return run(async ({ actor }) => {
    const results = await bulkAccept(actor, z.array(z.uuid()).max(200).parse(ids));
    return { count: results.length };
  });
}

export async function discardInboxAction(ids: string[]) {
  return run(async ({ actor }) => ({ count: await discardInboxItems(actor, z.array(z.uuid()).max(500).parse(ids)) }));
}

export async function restoreInboxAction(id: string) {
  return run(({ actor }) => restoreInboxItem(actor, z.uuid().parse(id)));
}

export async function reclassifyAction(id: string) {
  return run(({ actor }) => reclassify(actor, z.uuid().parse(id)));
}
