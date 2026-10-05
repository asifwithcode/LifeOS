"use client";

import { useState } from "react";
import { createTargetAction, updateTargetAction } from "@/actions/targets";
import { TARGET_PERIODS, TARGET_UNITS } from "@/lib/domain/constants";
import type { Target } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { ActivitySelect, OptionSelect } from "./selects";

export function TargetForm({ options, target, defaults = {}, onDone }: { options: EntityOptions; target?: Target; defaults?: Partial<Target>; onDone?: () => void }) {
  const init = { ...defaults, ...target };
  const [period, setPeriod] = useState(init.period ?? "daily");
  const [unit, setUnit] = useState(init.unit ?? "hours");
  return (
    <ActionForm action={target ? updateTargetAction : createTargetAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {target ? <input type="hidden" name="id" value={target.id} /> : null}
          <Field label="Name" name="title">
            {(p) => <Input {...p} name="title" defaultValue={init.title} required autoFocus placeholder="Study" />}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Amount" name="amount">
              {(p) => <Input {...p} type="number" min={0} step="any" name="amount" defaultValue={init.amount ?? ""} required inputMode="decimal" />}
            </Field>
            <Field label="Unit" name="unit">
              {(p) => (
                <Select {...p} name="unit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                  {TARGET_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Per" name="period">
              {(p) => (
                <Select {...p} name="period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                  {TARGET_PERIODS.map((u) => (
                    <option key={u} value={u}>
                      {u === "daily" ? "day" : u === "weekly" ? "week" : u === "monthly" ? "month" : u === "quarterly" ? "quarter" : u === "yearly" ? "year" : "custom range"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {unit === "custom" ? (
            <Field label="Custom unit" name="customUnit" hint="Sessions must use this exact unit to count.">
              {(p) => <Input {...p} name="customUnit" defaultValue={init.customUnit ?? ""} placeholder="problems" />}
            </Field>
          ) : null}
          {period === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" name="customStart">
                {(p) => <Input {...p} type="date" name="customStart" defaultValue={init.customStart ?? options.today} />}
              </Field>
              <Field label="To" name="customEnd">
                {(p) => <Input {...p} type="date" name="customEnd" defaultValue={init.customEnd ?? ""} />}
              </Field>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium text-fg-muted">What counts toward it</legend>
            <p className="-mt-1 text-xs text-fg-subtle">
              {unit === "tasks"
                ? "Completed top-level tasks in the period (filtered by project / skill / area)."
                : "Logged sessions in the period that match every filter you set. Leave all empty to count everything."}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {unit !== "tasks" ? <ActivitySelect allowEmpty defaultValue={init.activityType} /> : null}
              <OptionSelect name="skillId" label="Skill" options={options.skills} defaultValue={init.skillId} emptyLabel="Any skill" />
              <OptionSelect name="projectId" label="Project" options={options.projects} defaultValue={init.projectId} emptyLabel="Any project" />
              <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={init.lifeAreaId} emptyLabel="Any area" />
            </div>
          </fieldset>
          <OptionSelect name="goalId" label="Measures goal" options={options.goals} defaultValue={init.goalId} emptyLabel="Not linked" hint="Goals measured by targets use this." />
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {target ? "Save" : "Create target"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
