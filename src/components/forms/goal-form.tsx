"use client";

import { createGoalAction, updateGoalAction } from "@/actions/goals";
import { GOAL_PRIORITIES, GOAL_STATUSES } from "@/lib/domain/constants";
import type { Goal } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect } from "./selects";

export function GoalForm({ options, goal, onDone }: { options: EntityOptions; goal?: Goal; onDone?: () => void }) {
  return (
    <ActionForm action={goal ? updateGoalAction : createGoalAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {goal ? <input type="hidden" name="id" value={goal.id} /> : null}
          <Field label="Goal" name="title">
            {(p) => <Input {...p} name="title" defaultValue={goal?.title} required autoFocus placeholder="Study abroad for an MSc" />}
          </Field>
          <Field label="Why does this matter?" name="why" optional hint="Your reason — shown on the goal to keep it honest.">
            {(p) => <Textarea {...p} name="why" defaultValue={goal?.why ?? ""} rows={2} />}
          </Field>
          <Field label="Description" name="description" optional>
            {(p) => <Textarea {...p} name="description" defaultValue={goal?.description ?? ""} rows={3} />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={goal?.lifeAreaId} />
            <EnumSelect name="priority" label="Priority" values={GOAL_PRIORITIES} defaultValue={goal?.priority ?? "medium"} />
            <EnumSelect name="status" label="Status" values={GOAL_STATUSES} defaultValue={goal?.status ?? "active"} />
            <Field label="Start" name="startDate" optional>
              {(p) => <Input {...p} type="date" name="startDate" defaultValue={goal?.startDate ?? options.today} />}
            </Field>
            <Field label="Target date" name="targetDate" optional>
              {(p) => <Input {...p} type="date" name="targetDate" defaultValue={goal?.targetDate ?? ""} />}
            </Field>
            <EnumSelect
              name="progressMode"
              label="Measure progress by"
              values={["milestones", "targets"]}
              defaultValue={goal?.progressMode ?? "milestones"}
              labels={{ milestones: "Weighted milestones", targets: "Linked targets" }}
            />
          </div>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {goal ? "Save" : "Create goal"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
