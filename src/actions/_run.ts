import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError, type ZodType } from "zod";
import { fieldErrors } from "@/lib/validation";
import { requireUser } from "@/server/auth/dal";
import type { Actor } from "@/server/engines/actor";
import { DomainError } from "@/server/engines/errors";
import type { ActionResult } from "./result";

type Ctx = Awaited<ReturnType<typeof requireUser>> & { actor: Actor };

/**
 * Standard server-action wrapper: authenticate → run → map errors → refresh.
 * Domain errors are shown to the user; anything else is logged and genericised.
 */
export async function run<T>(fn: (ctx: Ctx) => Promise<T | ActionResult<T>>, opts: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  const ctx = await requireUser();
  try {
    const out = await fn(ctx);
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    if (out && typeof out === "object" && "ok" in (out as object)) return out as ActionResult<T>;
    return { ok: true, data: out as T };
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(err) };
    if (err instanceof DomainError) return { ok: false, error: err.message };
    // Let Next.js control-flow errors (redirect/notFound) through.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) throw err;
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

const ARRAY_KEYS = new Set(["weekdays", "daysOfWeek", "byWeekday", "ids"]);

/** FormData → plain object. Repeated keys become arrays; `tags` is split on commas/spaces. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    if (key === "tags") out.tags = all.join(",").split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    else if (ARRAY_KEYS.has(key)) out[key] = all.filter((v) => v !== "");
    else out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
