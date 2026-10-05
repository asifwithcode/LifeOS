import type { EntityType } from "@/lib/domain/constants";

/** Modules the user can individually allow or block for AI. Journal/finance/files are off by default. */
export const PRIVACY_MODULES = [
  { key: "goals", label: "Goals & milestones" },
  { key: "targets", label: "Targets" },
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects & decisions" },
  { key: "ideas", label: "Ideas" },
  { key: "notes", label: "Notes" },
  { key: "skills", label: "Skills" },
  { key: "routine", label: "Routine" },
  { key: "activity", label: "Sessions & activity history" },
  { key: "study", label: "Study (Phase 3)" },
  { key: "journal", label: "Journal (Phase 4)" },
  { key: "finance", label: "Finance (optional module)" },
  { key: "files", label: "Files (Phase 4)" },
] as const;

export type PrivacyKey = (typeof PRIVACY_MODULES)[number]["key"];
export type Privacy = Partial<Record<PrivacyKey, boolean>>;

export const DEFAULT_PRIVACY: Record<PrivacyKey, boolean> = {
  goals: true,
  targets: true,
  tasks: true,
  projects: true,
  ideas: true,
  notes: true,
  skills: true,
  routine: true,
  activity: true,
  study: true,
  journal: false,
  finance: false,
  files: false,
};

const ENTITY_MODULE: Partial<Record<EntityType, PrivacyKey>> = {
  goal: "goals",
  milestone: "goals",
  target: "targets",
  task: "tasks",
  project: "projects",
  decision: "projects",
  idea: "ideas",
  note: "notes",
  skill: "skills",
  routine_item: "routine",
  session: "activity",
};

export function resolvePrivacy(stored: Record<string, boolean> | null | undefined): Record<PrivacyKey, boolean> {
  return { ...DEFAULT_PRIVACY, ...(stored ?? {}) } as Record<PrivacyKey, boolean>;
}

export function canUse(privacy: Record<PrivacyKey, boolean>, type: EntityType): boolean {
  const mod = ENTITY_MODULE[type];
  return mod ? privacy[mod] === true : false;
}

export function allowedEntityTypes(privacy: Record<PrivacyKey, boolean>): EntityType[] {
  return (Object.keys(ENTITY_MODULE) as EntityType[]).filter((t) => canUse(privacy, t));
}
