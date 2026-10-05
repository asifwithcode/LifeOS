"use client";

import { ACTIVITY_TYPES, PRIORITIES } from "@/lib/domain/constants";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import type { Option } from "@/components/app/options";

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function OptionSelect({
  name,
  label: text,
  options,
  defaultValue,
  emptyLabel = "None",
  optional = true,
  hint,
  className,
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string | null;
  emptyLabel?: string;
  optional?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <Field label={text} name={name} optional={optional} hint={hint} className={className}>
      {(p) => (
        <Select {...p} name={name} defaultValue={defaultValue ?? ""}>
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
              {o.ref ? ` · ${o.ref}` : ""}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function EnumSelect({
  name,
  label: text,
  values,
  defaultValue,
  allowEmpty,
  emptyLabel = "Any",
  labels,
  hint,
  className,
  optional,
}: {
  name: string;
  label: string;
  values: readonly string[];
  defaultValue?: string | null;
  allowEmpty?: boolean;
  emptyLabel?: string;
  labels?: Record<string, string>;
  hint?: string;
  className?: string;
  optional?: boolean;
}) {
  return (
    <Field label={text} name={name} hint={hint} className={className} optional={optional}>
      {(p) => (
        <Select {...p} name={name} defaultValue={defaultValue ?? (allowEmpty ? "" : values[0])}>
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {values.map((v) => (
            <option key={v} value={v}>
              {labels?.[v] ?? label(v)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function PrioritySelect({ defaultValue, name = "priority" }: { defaultValue?: string; name?: string }) {
  return <EnumSelect name={name} label="Priority" values={PRIORITIES} defaultValue={defaultValue ?? "none"} labels={{ none: "No priority" }} />;
}

export function ActivitySelect({ defaultValue, allowEmpty, name = "activityType", label: text = "Activity", hint }: { defaultValue?: string | null; allowEmpty?: boolean; name?: string; label?: string; hint?: string }) {
  return <EnumSelect name={name} label={text} values={ACTIVITY_TYPES} defaultValue={defaultValue} allowEmpty={allowEmpty} emptyLabel="Any activity" hint={hint} optional={allowEmpty} />;
}

export function WeekdayPicker({ name, defaultValue = [], label: text }: { name: string; defaultValue?: number[]; label: string }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-fg-muted">{text}</legend>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name={name} value={d} defaultChecked={defaultValue.includes(d)} className="peer sr-only" />
            <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-border-strong text-xs text-fg-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
              {days[d]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
