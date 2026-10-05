import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { userSettings } from "@/server/db/schema";
import type { Actor } from "@/server/engines/actor";
import { SESSION_COOKIE, validateSessionToken } from "./session";

/** Current user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  return result?.user ?? null;
});

export const getSettings = cache(async (userId: string) => {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return row ?? null;
});

/** Use in every protected page, layout and server action. */
export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings(user.id);
  const actor: Actor = { userId: user.id, timezone: user.timezone, weekStartsOn: settings?.weekStartsOn ?? 1 };
  return { user, settings, actor };
});
