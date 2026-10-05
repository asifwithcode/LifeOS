"use client";

import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { GOAL_PRIORITIES, PROJECT_STATUSES } from "@/lib/domain/constants";
import type { Project } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect } from "./selects";

export function ProjectForm({ options, project, tags = [], onDone }: { options: EntityOptions; project?: Project; tags?: string[]; onDone?: () => void }) {
  return (
    <ActionForm action={project ? updateProjectAction : createProjectAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {project ? <input type="hidden" name="id" value={project.id} /> : null}
          <Field label="Project" name="title">
            {(p) => <Input {...p} name="title" defaultValue={project?.title} required autoFocus placeholder="MAYA voice assistant" />}
          </Field>
          <Field label="One-line summary" name="summary" optional>
            {(p) => <Input {...p} name="summary" defaultValue={project?.summary ?? ""} maxLength={300} />}
          </Field>
          <Field label="Overview" name="description" optional hint="Markdown supported.">
            {(p) => <Textarea {...p} name="description" defaultValue={project?.description ?? ""} rows={4} />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <EnumSelect name="status" label="Status" values={PROJECT_STATUSES} defaultValue={project?.status ?? "active"} labels={{ on_hold: "On hold" }} />
            <EnumSelect name="priority" label="Priority" values={GOAL_PRIORITIES} defaultValue={project?.priority ?? "medium"} />
            <EnumSelect
              name="progressMode"
              label="Progress from"
              values={["milestones", "tasks"]}
              defaultValue={project?.progressMode ?? "milestones"}
              labels={{ milestones: "Weighted milestones", tasks: "Tasks" }}
            />
            <OptionSelect name="goalId" label="Advances goal" options={options.goals} defaultValue={project?.goalId} />
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={project?.lifeAreaId} />
            <Field label="Target date" name="targetDate" optional>
              {(p) => <Input {...p} type="date" name="targetDate" defaultValue={project?.targetDate ?? ""} />}
            </Field>
          </div>
          <input type="hidden" name="startDate" value={project?.startDate ?? options.today} />
          <Field label="Tags" name="tags" optional>
            {(p) => <Input {...p} name="tags" defaultValue={tags.join(", ")} placeholder="iot, esp32" />}
          </Field>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {project ? "Save" : "Create project"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
