import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import type { Actor } from "@/server/engines/actor";
import { registerUser } from "@/server/services/users";

export async function resetDb() {
  await db.execute(sql`TRUNCATE users RESTART IDENTITY CASCADE`);
}

let n = 0;
/** Registers a user whose clock is pinned to `now` (default 2026-10-05 10:00 in Asia/Dhaka). */
export async function makeActor(now = new Date("2026-10-05T04:00:00Z"), timezone = "Asia/Dhaka"): Promise<Actor> {
  n++;
  const user = await registerUser({ name: `User ${n}`, email: `user${n}-${Date.now()}@example.com`, password: "correct horse battery", timezone });
  return { userId: user.id, timezone, weekStartsOn: 1, now: () => now };
}

export const baseTask = {
  description: null,
  status: "todo" as const,
  priority: "none" as const,
  dueDate: null,
  startDate: null,
  someday: false,
  estimatedMinutes: null,
  recurrence: null,
  parentTaskId: null,
  projectId: null,
  goalId: null,
  skillId: null,
  milestoneId: null,
  lifeAreaId: null,
  tags: [] as string[],
};

export const baseSession = {
  notes: null,
  durationMinutes: null as number | null,
  startTime: null,
  quantity: null,
  unit: null,
  lifeAreaId: null,
  skillId: null,
  projectId: null,
  taskId: null,
  goalId: null,
};

export const baseTarget = {
  description: null,
  customStart: null,
  customEnd: null,
  customUnit: null,
  activityType: null,
  lifeAreaId: null,
  skillId: null,
  projectId: null,
  goalId: null,
};

export const baseProject = {
  summary: null,
  description: null,
  status: "active" as const,
  priority: "medium" as const,
  lifeAreaId: null,
  goalId: null,
  startDate: null,
  targetDate: null,
  progressMode: "milestones" as const,
  tags: [] as string[],
};
