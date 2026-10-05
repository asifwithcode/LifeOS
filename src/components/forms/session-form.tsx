"use client";

import { useState } from "react";
import { logSessionAction } from "@/actions/targets";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { ActivitySelect, OptionSelect } from "./selects";

export interface SessionDefaults {
  activityType?: string;
  title?: string;
  skillId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  goalId?: string | null;
  lifeAreaId?: string | null;
  unit?: string | null;
}

/** Logs effort once; it then counts toward targets, skills, projects and the timeline. */
export function SessionForm({ options, defaults = {}, onDone }: { options: EntityOptions; defaults?: SessionDefaults; onDone?: () => void }) {
  const [mode, setMode] = useState<"time" | "quantity">(defaults.unit ? "quantity" : "time");
  return (
    <ActionForm action={logSessionAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {defaults.taskId ? <input type="hidden" name="taskId" value={defaults.taskId} /> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
            <Field label="What did you work on?" name="title">
              {(p) => <Input {...p} name="title" defaultValue={defaults.title} required autoFocus maxLength={200} placeholder="Kotlin practice" />}
            </Field>
            <ActivitySelect defaultValue={defaults.activityType ?? "study"} />
          </div>

          <div className="inline-flex self-start rounded-md border border-border p-0.5 text-xs" role="radiogroup" aria-label="Measure">
            {(["time", "quantity"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`rounded px-2.5 py-1 ${mode === m ? "bg-bg-muted font-medium text-fg" : "text-fg-muted"}`}
              >
                {m === "time" ? "Time" : "Amount (pages, lessons…)"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mode === "time" ? (
              <>
                <Field label="Hours" name="durationMinutes">
                  {(p) => <Input {...p} type="number" min={0} max={24} name="durationHours" defaultValue={0} inputMode="numeric" />}
                </Field>
                <Field label="Minutes" name="durationMinutes">
                  {(p) => <Input {...p} type="number" min={0} max={59} name="durationMins" defaultValue={30} inputMode="numeric" />}
                </Field>
              </>
            ) : (
              <>
                <Field label="Amount" name="quantity">
                  {(p) => <Input {...p} type="number" min={0} step="any" name="quantity" inputMode="decimal" />}
                </Field>
                <Field label="Unit" name="unit">
                  {(p) => <Input {...p} name="unit" defaultValue={defaults.unit ?? "pages"} list="session-units" maxLength={40} />}
                </Field>
                <datalist id="session-units">
                  {["pages", "chapters", "lessons", "videos", "problems", "words", "exercises"].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </>
            )}
            <Field label="Date" name="date">
              {(p) => <Input {...p} type="date" name="date" defaultValue={options.today} max={options.today} required />}
            </Field>
            <Field label="Started" name="startTime" optional>
              {(p) => <Input {...p} type="time" name="startTime" />}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OptionSelect name="skillId" label="Skill" options={options.skills} defaultValue={defaults.skillId} />
            <OptionSelect name="projectId" label="Project" options={options.projects} defaultValue={defaults.projectId} />
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={defaults.lifeAreaId} hint="Inferred from skill/project if empty" />
          </div>
          <Field label="Notes" name="notes" optional>
            {(p) => <Textarea {...p} name="notes" rows={2} placeholder="What did you learn or finish?" />}
          </Field>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              Log session
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
