"use client";

import { createIdeaAction, updateIdeaAction } from "@/actions/projects";
import { IDEA_STATUSES } from "@/lib/domain/constants";
import type { Idea } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect } from "./selects";

export function IdeaForm({ options, idea, tags = [], onDone }: { options: EntityOptions; idea?: Idea; tags?: string[]; onDone?: () => void }) {
  return (
    <ActionForm action={idea ? updateIdeaAction : createIdeaAction} onSuccess={() => onDone?.()} resetOnSuccess={!idea} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {idea ? <input type="hidden" name="id" value={idea.id} /> : null}
          <Field label="Idea" name="title">
            {(p) => <Input {...p} name="title" defaultValue={idea?.title} required autoFocus placeholder="Offline voice assistant on ESP32-S3" />}
          </Field>
          <Field label="Description" name="description" optional hint="Problem, who it's for, rough solution — whatever you know so far.">
            {(p) => <Textarea {...p} name="description" defaultValue={idea?.description ?? ""} rows={5} />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <EnumSelect name="status" label="Stage" values={IDEA_STATUSES} defaultValue={idea?.status ?? "captured"} />
            <Field label="Category" name="category" optional>
              {(p) => <Input {...p} name="category" defaultValue={idea?.category ?? ""} placeholder="Hardware" />}
            </Field>
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={idea?.lifeAreaId} />
          </div>
          <Field label="Tags" name="tags" optional>
            {(p) => <Input {...p} name="tags" defaultValue={tags.join(", ")} />}
          </Field>
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {idea ? "Save" : "Save idea"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
