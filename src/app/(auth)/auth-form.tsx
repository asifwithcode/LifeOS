"use client";

import { useActionState, useSyncExternalStore } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/actions/auth";
import type { ActionResult } from "@/actions/result";
import { Button } from "@/components/ui/button";
import { Field, FormErrorsContext } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode, next, registrationOpen }: { mode: "login" | "register"; next?: string; registrationOpen: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(mode === "login" ? loginAction : registerAction, null);
  const tz = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  const errors = state && !state.ok ? { ...(state.fieldErrors ?? {}), _form: state.error } : undefined;
  return (
    <FormErrorsContext.Provider value={errors}>
      <form action={action} className="flex flex-col gap-4 rounded-xl border border-border bg-bg p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)]" noValidate>
        {errors?._form && !state?.ok && !state?.fieldErrors ? <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors._form}</p> : null}
        {mode === "register" ? (
          <>
            <Field label="Your name" name="name">
              {(p) => <Input {...p} name="name" autoComplete="name" required autoFocus />}
            </Field>
            <input type="hidden" name="timezone" value={tz} />
          </>
        ) : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" name="email">
          {(p) => <Input {...p} type="email" name="email" autoComplete="email" required autoFocus={mode === "login"} />}
        </Field>
        <Field label="Password" name="password" hint={mode === "register" ? "At least 10 characters." : undefined}>
          {(p) => <Input {...p} type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        {mode === "register" ? <p className="text-center text-xs text-fg-subtle">Timezone detected: {tz}. You can change it in Settings.</p> : null}
      </form>
      <p className="mt-4 text-center text-[13px] text-fg-muted">
        {mode === "login" ? (
          registrationOpen ? (
            <>
              New here?{" "}
              <Link href="/register" className="text-fg underline-offset-2 hover:underline">
                Create your account
              </Link>
            </>
          ) : null
        ) : (
          <>
            Already set up?{" "}
            <Link href="/login" className="text-fg underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </FormErrorsContext.Provider>
  );
}
