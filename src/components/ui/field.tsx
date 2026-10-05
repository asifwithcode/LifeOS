"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const FormErrorsContext = createContext<Record<string, string> | undefined>(undefined);

export function useFieldError(name?: string) {
  const errors = useContext(FormErrorsContext);
  return name ? errors?.[name] : undefined;
}

interface FieldProps {
  label: string;
  name?: string;
  hint?: ReactNode;
  className?: string;
  optional?: boolean;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Label + control + hint/error. Errors come from the nearest <ActionForm>. */
export function Field({ label, name, hint, className, optional, children }: FieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg-muted">
        {label}
        {optional ? <span className="ml-1 font-normal text-fg-subtle">optional</span> : null}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError() {
  const error = useFieldError("_form");
  if (!error) return null;
  return (
    <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
      {error}
    </p>
  );
}
