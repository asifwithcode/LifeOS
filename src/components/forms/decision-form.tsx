"use client";

import { saveDecisionAction } from "@/actions/projects";
import { DECISION_STATUSES } from "@/lib/domain/constants";
import type { Decision } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect } from "./selects";

export function DecisionForm({ options, decision, projectId, onDone }: { options: EntityOptions; decision?: Decision; projectId?: string; onDone?: () => void }) {
  return (
    <ActionForm action={saveDecisionAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {decision ? <input type="hidden" name="id" value={decision.id} /> : null}
          <Field label="Title" name="title">
            {(p) => <Input {...p} name="title" defaultValue={decision?.title} required autoFocus placeholder="MCU choice for MAYA" />}
          </Field>
          <Field label="Decision" name="decision">
            {(p) => <Textarea {...p} name="decision" defaultValue={decision?.decision} rows={2} required placeholder="Use ESP32-S3 instead of ESP32-C3" />}
          </Field>
          <Field label="Reason / context" name="context" optional>
            {(p) => <Textarea {...p} name="context" defaultValue={decision?.context ?? ""} rows={2} placeholder="Need additional RAM and peripherals." />}
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Alternatives considered" name="alternatives" optional>
              {(p) => <Textarea {...p} name="alternatives" defaultValue={decision?.alternatives ?? ""} rows={2} />}
            </Field>
            <Field label="Consequences" name="consequences" optional>
              {(p) => <Textarea {...p} name="consequences" defaultValue={decision?.consequences ?? ""} rows={2} />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Decided on" name="decidedOn">
              {(p) => <Input {...p} type="date" name="decidedOn" defaultValue={decision?.decidedOn ?? options.today} required />}
            </Field>
            <OptionSelect name="projectId" label="Project" options={options.projects} defaultValue={decision?.projectId ?? projectId} />
            <EnumSelect name="status" label="Status" values={DECISION_STATUSES} defaultValue={decision?.status ?? "active"} />
          </div>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {decision ? "Save" : "Record decision"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
