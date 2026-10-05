"use client";

import { createSkillAction, updateSkillAction } from "@/actions/skills";
import { SKILL_CATEGORIES, SKILL_LEVELS, SKILL_STATUSES } from "@/lib/domain/constants";
import type { Skill } from "@/server/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { EntityOptions } from "@/components/app/options";
import { EnumSelect, OptionSelect } from "./selects";

function LevelSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <Field label={label} name={name}>
      {(p) => (
        <Select {...p} name={name} defaultValue={String(defaultValue)}>
          {SKILL_LEVELS.map((l, i) => (
            <option key={l} value={i}>
              {i} · {l}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function SkillForm({ options, skill, onDone }: { options: EntityOptions; skill?: Skill; onDone?: () => void }) {
  return (
    <ActionForm action={skill ? updateSkillAction : createSkillAction} onSuccess={() => onDone?.()} className="flex flex-col gap-4">
      {(pending) => (
        <>
          {skill ? <input type="hidden" name="id" value={skill.id} /> : null}
          <Field label="Skill" name="name">
            {(p) => <Input {...p} name="name" defaultValue={skill?.name} required autoFocus placeholder="Kotlin" />}
          </Field>
          <Field label="Description" name="description" optional>
            {(p) => <Textarea {...p} name="description" defaultValue={skill?.description ?? ""} rows={2} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <EnumSelect name="category" label="Category" values={SKILL_CATEGORIES} defaultValue={skill?.category ?? "technical"} />
            <OptionSelect name="lifeAreaId" label="Life area" options={options.lifeAreas} defaultValue={skill?.lifeAreaId} />
            <LevelSelect name="currentLevel" label="Current level (self-assessed)" defaultValue={skill?.currentLevel ?? 0} />
            <LevelSelect name="targetLevel" label="Target level" defaultValue={skill?.targetLevel ?? 3} />
            {skill ? <EnumSelect name="status" label="Status" values={SKILL_STATUSES} defaultValue={skill.status} /> : null}
          </div>
          {!skill ? (
            <Field label="Roadmap topics" name="topics" optional hint="One per line. Progress comes from topics you complete.">
              {(p) => <Textarea {...p} name="topics" rows={5} placeholder={"Syntax\nOOP\nCollections\nCoroutines\nFlow"} />}
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            {onDone ? (
              <Button variant="ghost" onClick={onDone}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={pending}>
              {skill ? "Save" : "Start tracking"}
            </Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
