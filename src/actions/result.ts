export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
