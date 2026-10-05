"use client";

import { addMilestoneAction, updateMilestoneAction } from "@/actions/goals";
import type { Milestone } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";

export function MilestoneForm({ owner, milestone, onDone }: { owner?: { goalId?: string; projectId?: string }; milestone?: Milestone; onDone?: () => void }) {
  return (
    <ActionForm action={milestone ? updateMilestoneAction : addMilestoneAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {milestone ? <input type="hidden" name="id" value={milestone.id} /> : null}
          {owner?.goalId ? <input type="hidden" name="goalId" value={owner.goalId} /> : null}
          {owner?.projectId ? <input type="hidden" name="projectId" value={owner.projectId} /> : null}
          <Field label="Milestone" name="title">
            {(p) => <Input {...p} name="title" defaultValue={milestone?.title} required autoFocus placeholder="IELTS 7.0" />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" name="weight" hint="Bigger milestones count more toward progress.">
              {(p) => (
                <Select {...p} name="weight" defaultValue={String(milestone?.weight ?? 1)}>
                  {[1, 2, 3, 5, 8, 10].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Due" name="dueDate" optional>
              {(p) => <Input {...p} type="date" name="dueDate" defaultValue={milestone?.dueDate ?? ""} />}
            </Field>
          </div>
          <Field label="Description" name="description" optional>
            {(p) => <Textarea {...p} name="description" defaultValue={milestone?.description ?? ""} rows={2} />}
          </Field>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {milestone ? "Save" : "Add milestone"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
