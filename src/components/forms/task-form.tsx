"use client";

import { useState } from "react";
import { createTaskAction, updateTaskAction } from "@/actions/tasks";
import { TASK_STATUSES } from "@/lib/domain/constants";
import type { RecurrenceRule } from "@/lib/domain/recurrence";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect, PrioritySelect, WeekdayPicker } from "./selects";

export interface TaskFormValues {
  id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  startDate?: string | null;
  someday?: boolean;
  estimatedMinutes?: number | null;
  recurrence?: RecurrenceRule | null;
  parentTaskId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  skillId?: string | null;
  milestoneId?: string | null;
  lifeAreaId?: string | null;
  tags?: string[];
}

export function TaskForm({ options, initial = {}, onDone }: { options: EntityOptions; initial?: TaskFormValues; onDone?: () => void }) {
  const editing = !!initial.id;
  const [freq, setFreq] = useState(initial.recurrence?.freq ?? "");
  const [more, setMore] = useState(editing || !!initial.recurrence);
  return (
    <ActionForm action={editing ? updateTaskAction : createTaskAction} onSuccess={() => onDone?.()} successMessage={editing ? "Saved" : undefined} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
          {initial.parentTaskId ? <input type="hidden" name="parentTaskId" value={initial.parentTaskId} /> : null}
          {initial.milestoneId ? <input type="hidden" name="milestoneId" value={initial.milestoneId} /> : null}
          <Field label="Title" name="title">
            {(p) => <Input {...p} name="title" defaultValue={initial.title} required autoFocus maxLength={300} placeholder="What needs doing?" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PrioritySelect defaultValue={initial.priority} />
            <Field label="Due" name="dueDate" optional>
              {(p) => <Input {...p} type="date" name="dueDate" defaultValue={initial.dueDate ?? ""} />}
            </Field>
            <Field label="Estimate (min)" name="estimatedMinutes" optional>
              {(p) => <Input {...p} type="number" min={1} name="estimatedMinutes" defaultValue={initial.estimatedMinutes ?? ""} inputMode="numeric" />}
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OptionSelect name="projectId" label="Project" options={options.projects} defaultValue={initial.projectId} emptyLabel="No project" />
            <OptionSelect name="goalId" label="Goal" options={options.goals} defaultValue={initial.goalId} emptyLabel="No goal" />
          </div>

          {more ? (
            <>
              <Field label="Notes" name="description" optional>
                {(p) => <Textarea {...p} name="description" defaultValue={initial.description ?? ""} rows={3} />}
              </Field>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {editing ? <EnumSelect name="status" label="Status" values={TASK_STATUSES} defaultValue={initial.status} labels={{ todo: "To do", in_progress: "In progress" }} /> : null}
                <Field label="Start" name="startDate" optional>
                  {(p) => <Input {...p} type="date" name="startDate" defaultValue={initial.startDate ?? ""} />}
                </Field>
                <OptionSelect name="skillId" label="Skill" options={options.skills} defaultValue={initial.skillId} />
                <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={initial.lifeAreaId} />
              </div>
              <Field label="Tags" name="tags" optional hint="Comma separated">
                {(p) => <Input {...p} name="tags" defaultValue={initial.tags?.join(", ") ?? ""} placeholder="esp32, voice" />}
              </Field>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Repeat" name="recurrence">
                    {(p) => (
                      <Select {...p} name="recurrenceFreq" value={freq} onChange={(e) => setFreq(e.target.value)}>
                        <option value="">Doesn&apos;t repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </Select>
                    )}
                  </Field>
                  {freq ? (
                    <Field label="Every" name="recurrence.interval" hint={freq === "daily" ? "days" : freq === "weekly" ? "weeks" : freq === "monthly" ? "months" : "years"}>
                      {(p) => <Input {...p} type="number" min={1} max={365} name="recurrenceInterval" defaultValue={initial.recurrence?.interval ?? 1} />}
                    </Field>
                  ) : null}
                </div>
                {freq === "weekly" ? <WeekdayPicker name="recurrenceWeekdays" label="On" defaultValue={initial.recurrence?.byWeekday ?? []} /> : null}
                {freq ? <p className="text-xs text-fg-subtle">Needs a due date. Completing it creates the next one.</p> : null}
              </div>
              <Checkbox name="someday" label="Someday / maybe (no date)" defaultChecked={initial.someday} />
            </>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="self-start text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline">
              More options — notes, skill, tags, repeat…
            </button>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? "Save" : "Create task"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
