import "server-only";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { DASHBOARD_WIDGETS, DEFAULT_LIFE_AREAS } from "@/lib/domain/constants";
import { db, type Tx } from "@/server/db";
import { lifeAreas, routineTemplates, userSettings, users, type DashboardWidgetPref } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { DomainError } from "@/server/engines/errors";

export const DEFAULT_AI_PRIVACY = {
  goals: true,
  targets: true,
  tasks: true,
  projects: true,
  ideas: true,
  notes: true,
  skills: true,
  study: true,
  routine: true,
  journal: false,
  finance: false,
  files: false,
};

export function defaultWidgets(): DashboardWidgetPref[] {
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

export async function userCount() {
  const [row] = await db.select({ n: count() }).from(users);
  return row.n;
}

export async function registrationOpen() {
  return process.env.ALLOW_REGISTRATION === "true" || (await userCount()) === 0;
}

async function seedDefaults(tx: Tx, userId: string) {
  await tx.insert(userSettings).values({
    userId,
    dashboardWidgets: defaultWidgets(),
    aiPrivacy: DEFAULT_AI_PRIVACY,
  });
  await tx.insert(lifeAreas).values(DEFAULT_LIFE_AREAS.map((a, i) => ({ userId, name: a.name, color: a.color, sortOrder: i })));
  await tx.insert(routineTemplates).values([
    { userId, name: "Normal Day", kind: "normal", weekdays: [], isDefault: true, sortOrder: 0 },
    { userId, name: "Weekend", kind: "weekend", weekdays: [], sortOrder: 1 },
    { userId, name: "University Day", kind: "university", weekdays: [], sortOrder: 2 },
    { userId, name: "Exam Period", kind: "exam", weekdays: [], sortOrder: 3 },
    { userId, name: "Holiday", kind: "holiday", weekdays: [], sortOrder: 4 },
  ]);
}

export async function registerUser(input: { name: string; email: string; password: string; timezone?: string }) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  let timezone = "UTC";
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      timezone = input.timezone;
    } catch {
      /* keep UTC */
    }
  }
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) throw new DomainError("An account with this email already exists", "conflict");
    const [user] = await tx.insert(users).values({ name: input.name.trim(), email, passwordHash, timezone }).returning();
    await seedDefaults(tx, user.id);
    return user;
  });
}

// Equalise timing between unknown-email and wrong-password paths.
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return ok && user ? user : null;
}

export async function updateProfile(userId: string, input: { name: string; timezone: string; weekStartsOn: number }) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: input.name, timezone: input.timezone, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.update(userSettings).set({ weekStartsOn: input.weekStartsOn, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  });
}

export async function updateAppearance(userId: string, input: { theme: string; accent: string }) {
  await db.update(userSettings).set({ theme: input.theme, accent: input.accent, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
}

export async function updateDashboardWidgets(userId: string, widgets: DashboardWidgetPref[]) {
  const known = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id));
  const clean = widgets.filter((w) => known.has(w.id));
  for (const w of DASHBOARD_WIDGETS) if (!clean.some((c) => c.id === w.id)) clean.push({ id: w.id, visible: false });
  await db.update(userSettings).set({ dashboardWidgets: clean, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
}

export async function changePassword(userId: string, current: string, next: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) throw new DomainError("Current password is incorrect");
  await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, userId));
}

// ── Life areas ──

export async function listLifeAreas(userId: string, includeArchived = false) {
  return db
    .select()
    .from(lifeAreas)
    .where(includeArchived ? eq(lifeAreas.userId, userId) : and(eq(lifeAreas.userId, userId), isNull(lifeAreas.archivedAt)))
    .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.name));
}

export async function createLifeArea(userId: string, input: { name: string; color: string }) {
  const existing = await listLifeAreas(userId, true);
  if (existing.some((a) => a.name.toLowerCase() === input.name.toLowerCase())) throw new DomainError("That area already exists", "conflict");
  const [row] = await db
    .insert(lifeAreas)
    .values({ userId, name: input.name, color: input.color, sortOrder: existing.length })
    .returning();
  return row;
}

export async function updateLifeArea(userId: string, id: string, input: { name: string; color: string }) {
  const [row] = await db
    .update(lifeAreas)
    .set({ name: input.name, color: input.color })
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .returning();
  if (!row) throw new DomainError("Life area not found", "not_found");
  return row;
}

export async function setLifeAreaArchived(userId: string, id: string, archived: boolean) {
  await db
    .update(lifeAreas)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)));
}
