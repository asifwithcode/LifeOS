"use client";

import { Plus } from "lucide-react";
import type { EntityOptions } from "@/components/app/options";
import { DialogButton } from "@/components/entities/dialog-button";
import { GoalForm } from "@/components/forms/goal-form";
import { IdeaForm } from "@/components/forms/idea-form";
import { ProjectForm } from "@/components/forms/project-form";
import { SkillForm } from "@/components/forms/skill-form";
import { TargetForm } from "@/components/forms/target-form";
import { DecisionForm } from "@/components/forms/decision-form";
import type { Target } from "@/server/db/schema";

export function NewGoalButton({ options, defaultOpen }: { options: EntityOptions; defaultOpen?: boolean }) {
  return (
    <DialogButton variant="primary" label={<><Plus /> New goal</>} title="New goal" description="A major outcome you want. Measure it with milestones or targets." wide defaultOpen={defaultOpen}>
      {(close) => <GoalForm options={options} onDone={close} />}
    </DialogButton>
  );
}

export function NewTargetButton({ options, defaultOpen, defaults, variant = "primary", label = "New target" }: { options: EntityOptions; defaultOpen?: boolean; defaults?: Partial<Target>; variant?: "primary" | "secondary" | "ghost"; label?: string }) {
  return (
    <DialogButton variant={variant} size={variant === "ghost" ? "sm" : "md"} label={<><Plus /> {label}</>} title="New target" description="A measurable amount per period. Progress updates from what you log." wide defaultOpen={defaultOpen}>
      {(close) => <TargetForm options={options} defaults={defaults} onDone={close} />}
    </DialogButton>
  );
}

export function NewProjectButton({ options, defaultOpen }: { options: EntityOptions; defaultOpen?: boolean }) {
  return (
    <DialogButton variant="primary" label={<><Plus /> New project</>} title="New project" wide defaultOpen={defaultOpen}>
      {(close) => <ProjectForm options={options} onDone={close} />}
    </DialogButton>
  );
}

export function NewIdeaButton({ options, defaultOpen }: { options: EntityOptions; defaultOpen?: boolean }) {
  return (
    <DialogButton variant="primary" label={<><Plus /> New idea</>} title="Capture an idea" wide defaultOpen={defaultOpen}>
      {(close) => <IdeaForm options={options} onDone={close} />}
    </DialogButton>
  );
}

export function NewSkillButton({ options, defaultOpen }: { options: EntityOptions; defaultOpen?: boolean }) {
  return (
    <DialogButton variant="primary" label={<><Plus /> Track a skill</>} title="Track a skill" description="Progress comes from roadmap topics you complete — never from a guess." wide defaultOpen={defaultOpen}>
      {(close) => <SkillForm options={options} onDone={close} />}
    </DialogButton>
  );
}

export function NewDecisionButton({ options, projectId, variant = "primary" }: { options: EntityOptions; projectId?: string; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <DialogButton variant={variant} size={variant === "ghost" ? "sm" : "md"} label={<><Plus /> Record decision</>} title="Record a decision" description="Capture what you decided and why, so future-you (and the AI) can find it." wide>
      {(close) => <DecisionForm options={options} projectId={projectId} onDone={close} />}
    </DialogButton>
  );
}
