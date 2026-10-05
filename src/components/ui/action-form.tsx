"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/result";
import { FormErrorsContext, FormError } from "./field";

type FormAction<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/**
 * Progressive-enhancement form bound to a server action. Shows field errors inline,
 * toasts on success, and optionally navigates to `result.redirectTo`.
 */
export function ActionForm<T>({
  action,
  children,
  onSuccess,
  className,
  successMessage,
  resetOnSuccess,
}: {
  action: FormAction<T>;
  children: ReactNode | ((pending: boolean) => ReactNode);
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  className?: string;
  successMessage?: string | false;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(action, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult<T> | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      const msg = successMessage === false ? null : (state.message ?? successMessage);
      if (msg) toast.success(msg);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
    } else if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) {
      toast.error(state.error);
    }
  }, [state, onSuccess, router, successMessage, resetOnSuccess]);

  const errors = state && !state.ok ? { ...(state.fieldErrors ?? {}), ...(state.fieldErrors ? { _form: state.error } : {}) } : undefined;

  return (
    <FormErrorsContext.Provider value={errors}>
      <form ref={formRef} action={formAction} className={className} noValidate>
        {errors && state && !state.ok && state.fieldErrors ? <div className="mb-3"><FormError /></div> : null}
        {typeof children === "function" ? children(pending) : children}
      </form>
    </FormErrorsContext.Provider>
  );
}
