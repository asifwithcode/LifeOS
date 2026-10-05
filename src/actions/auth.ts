"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { fieldErrors, loginInput, registerInput } from "@/lib/validation";
import { rateLimit, resetRateLimit } from "@/server/auth/rate-limit";
import { createSession, invalidateSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { getSettings } from "@/server/auth/dal";
import { DomainError } from "@/server/engines/errors";
import { authenticate, registerUser, registrationOpen } from "@/server/services/users";
import type { ActionResult } from "./result";

async function clientMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local", userAgent: h.get("user-agent") };
}

async function startSession(userId: string) {
  const meta = await clientMeta();
  const { token, expiresAt } = await createSession(userId, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  const settings = await getSettings(userId);
  const prefOpts = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };
  store.set("lifeos_theme", settings?.theme ?? "system", prefOpts);
  store.set("lifeos_accent", settings?.accent ?? "indigo", prefOpts);
}

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function registerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { ip } = await clientMeta();
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000).ok) return { ok: false, error: "Too many attempts. Try again later." };
  if (!(await registrationOpen())) return { ok: false, error: "Registration is closed for this LifeOS instance." };
  const parsed = registerInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const user = await registerUser(parsed.data);
    await startSession(user.id);
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message, fieldErrors: { email: err.message } };
    console.error(err);
    return { ok: false, error: "Could not create the account." };
  }
  redirect("/");
}

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = loginInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { ip } = await clientMeta();
  const key = `login:${ip}:${parsed.data.email}`;
  const limit = rateLimit(key, 8, 15 * 60_000);
  if (!limit.ok) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60_000)} min.` };
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) return { ok: false, error: "Email or password is incorrect.", fieldErrors: { password: "Email or password is incorrect." } };
  resetRateLimit(key);
  await startSession(user.id);
  redirect(safeNext(fd.get("next")));
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
