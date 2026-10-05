import "server-only";
import type { EntityOptions } from "@/components/app/options";
import { todayOf, type Actor } from "@/server/engines/actor";
import { getProvider } from "@/server/ai/registry";
import { listGoalOptions } from "./goals";
import { listProjectOptions } from "./projects";
import { listSkillOptions } from "./skills";
import { listLifeAreas } from "./users";

/** Small pick-lists used by forms across the app. */
export async function getEntityOptions(actor: Actor): Promise<EntityOptions> {
  const [projects, goals, skills, areas] = await Promise.all([
    listProjectOptions(actor.userId),
    listGoalOptions(actor.userId),
    listSkillOptions(actor.userId),
    listLifeAreas(actor.userId),
  ]);
  return {
    projects,
    goals,
    skills,
    lifeAreas: areas.map((a) => ({ id: a.id, title: a.name, color: a.color })),
    today: todayOf(actor),
    ai: getProvider()?.label ?? null,
  };
}
