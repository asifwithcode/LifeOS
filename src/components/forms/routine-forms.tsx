"use client";

import { saveRoutineItemAction, saveTemplateAction } from "@/actions/routine";
import { PRIORITIES, ROUTINE_TEMPLATE_KINDS } from "@/lib/domain/constants";
import type { RoutineItem, RoutineTemplate } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { ActivitySelect, EnumSelect, OptionSelect, WeekdayPicker } from "./selects";

export function RoutineItemForm({ options, templateId, item, onDone }: { options: EntityOptions; templateId: string; item?: RoutineItem; onDone?: () => void }) {
  return (
    <ActionForm action={saveRoutineItemAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          <input type="hidden" name="templateId" value={item?.templateId ?? templateId} />
          <Field label="Block" name="title">
            {(p) => <Input {...p} name="title" defaultValue={item?.title} required autoFocus placeholder="Botany revision" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Starts" name="startTime">
              {(p) => <Input {...p} type="time" name="startTime" defaultValue={item?.startTime.slice(0, 5) ?? "07:00"} required />}
            </Field>
            <Field label="Duration (min)" name="durationMinutes">
              {(p) => <Input {...p} type="number" min={1} max={1440} name="durationMinutes" defaultValue={item?.durationMinutes ?? 45} required />}
            </Field>
            <ActivitySelect defaultValue={item?.activityType ?? "study"} />
          </div>
          <WeekdayPicker name="daysOfWeek" label="Only on these days (leave empty for every day this template applies)" defaultValue={item?.daysOfWeek ?? []} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OptionSelect name="skillId" label="Skill" options={options.skills} defaultValue={item?.skillId} />
            <OptionSelect name="projectId" label="Project" options={options.projects} defaultValue={item?.projectId} />
            <OptionSelect name="goalId" label="Goal" options={options.goals} defaultValue={item?.goalId} />
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={item?.lifeAreaId} />
            <EnumSelect name="priority" label="Priority" values={PRIORITIES} defaultValue={item?.priority ?? "medium"} labels={{ none: "No priority" }} />
            <Field label="Remind (min before)" name="reminderMinutesBefore" optional hint="Delivered once reminders ship (Phase 4).">
              {(p) => <Input {...p} type="number" min={0} max={1440} name="reminderMinutesBefore" defaultValue={item?.reminderMinutesBefore ?? ""} />}
            </Field>
          </div>
          <Checkbox name="logAsSession" label="Completing this block logs a session (counts toward targets)" defaultChecked={item?.logAsSession ?? true} />
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {item ? "Save" : "Add block"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function TemplateForm({ template, onDone }: { template?: RoutineTemplate; onDone?: () => void }) {
  return (
    <ActionForm action={saveTemplateAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {template ? <input type="hidden" name="id" value={template.id} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name">
              {(p) => <Input {...p} name="name" defaultValue={template?.name} required autoFocus placeholder="Exam Period" />}
            </Field>
            <EnumSelect name="kind" label="Kind" values={ROUTINE_TEMPLATE_KINDS} defaultValue={template?.kind ?? "custom"} />
          </div>
          <WeekdayPicker name="weekdays" label="Use automatically on" defaultValue={template?.weekdays ?? []} />
          <p className="-mt-2 text-xs text-fg-subtle">A weekday can belong to one template. Dates can still be overridden from Today.</p>
          <Checkbox name="isDefault" label="Default template (used when no weekday matches)" defaultChecked={template?.isDefault} />
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {template ? "Save" : "Create template"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
