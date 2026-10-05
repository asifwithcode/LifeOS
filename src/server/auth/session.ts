import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { authSessions, users } from "@/server/db/schema";

export const SESSION_COOKIE = "lifeos_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip?.slice(0, 64) ?? null,
  });
  return { token, expiresAt };
}

/** Returns the session's user, renewing the expiry when it's past half-life. */
export async function validateSessionToken(token: string) {
  const id = hashToken(token);
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      user: { id: users.id, email: users.email, name: users.name, timezone: users.timezone },
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, id), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(authSessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(authSessions.id, id));
  }
  return { user: row.user, expiresAt, renewed: expiresAt !== row.expiresAt };
}

export async function invalidateSession(token: string) {
  await db.delete(authSessions).where(eq(authSessions.id, hashToken(token)));
}

export async function invalidateAllSessions(userId: string) {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
