"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { setAiPrivacyAction } from "@/actions/ai";
import { archiveLifeAreaAction, changePasswordAction, saveLifeAreaAction, signOutEverywhereAction, updateAppearanceAction, updateProfileAction } from "@/actions/settings";
import { logoutAction } from "@/actions/auth";
import { ACCENTS, AREA_COLORS } from "@/lib/domain/constants";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { AREA_HEX, AreaDot } from "@/components/app/area-dot";
import { cn } from "@/lib/ui/cn";

const ACCENT_HEX: Record<string, string> = { indigo: "#5e6ad2", blue: "#2f7cf6", violet: "#8b5cf6", emerald: "#0f9f6e", amber: "#d97706", rose: "#e11d48", graphite: "#52525b" };

export function ProfileForm({ name, email, timezone, weekStartsOn }: { name: string; email: string; timezone: string; weekStartsOn: number }) {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];
  return (
    <ActionForm action={updateProfileAction} className="flex max-w-md flex-col gap-4">
      {(pending) => (
        <>
          <Field label="Name" name="name">
            {(p) => <Input {...p} name="name" defaultValue={name} required />}
          </Field>
          <Field label="Email" hint="Used to sign in.">
            {(p) => <Input {...p} value={email} disabled readOnly />}
          </Field>
          <Field label="Timezone" name="timezone" hint="Decides what “today” means for targets, routine and sessions.">
            {(p) => (
              <Select {...p} name="timezone" defaultValue={timezone}>
                {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Week starts on" name="weekStartsOn" hint="Used by weekly targets.">
            {(p) => (
              <Select {...p} name="weekStartsOn" defaultValue={String(weekStartsOn)}>
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
                <option value="6">Saturday</option>
              </Select>
            )}
          </Field>
          <Button type="submit" variant="primary" loading={pending} className="self-start">Save profile</Button>
        </>
      )}
    </ActionForm>
  );
}

export function AppearanceSettings({ theme, accent }: { theme: string; accent: string }) {
  const [t, setT] = useState(theme);
  const [a, setA] = useState(accent);
  const [, start] = useTransition();
  const router = useRouter();
  const apply = (nextTheme: string, nextAccent: string) => {
    setT(nextTheme);
    setA(nextAccent);
    // Apply instantly, then persist.
    const root = document.documentElement;
    if (nextTheme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", nextTheme);
    root.setAttribute("data-accent", nextAccent);
    start(async () => {
      const r = await updateAppearanceAction(nextTheme, nextAccent);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };
  const themes = [
    { key: "system", label: "System", icon: Laptop },
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
  ];
  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-fg-muted">Theme</legend>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {themes.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => apply(key, a)} aria-pressed={t === key} className={cn("flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-[13px] transition-colors", t === key ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-muted hover:bg-bg-subtle")}>
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-fg-muted">Accent colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button key={c} type="button" onClick={() => apply(t, c)} aria-pressed={a === c} aria-label={c} className={cn("grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-bg transition-shadow", a === c && "ring-2 ring-fg")} style={{ background: ACCENT_HEX[c] }}>
              {a === c ? <Check className="size-4 text-white" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-fg-subtle">Motion follows your system’s reduced-motion setting.</p>
    </div>
  );
}

export function LifeAreasSettings({ areas }: { areas: { id: string; name: string; color: string; archived: boolean }[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">Life areas categorise goals, projects, skills and sessions — Study, Career, Health, or anything you define.</p>
      <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
        {areas.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="p-3">
              <AreaForm area={a} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className={cn("flex items-center gap-3 px-3 py-2.5 text-[13px]", a.archived && "opacity-50")}>
              <AreaDot color={a.color} className="size-2.5" />
              <span className="flex-1">{a.name}{a.archived ? " (archived)" : ""}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(a.id)}>Edit</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await archiveLifeAreaAction(a.id, !a.archived);
                    if (!r.ok) toast.error(r.error);
                  })
                }
              >
                {a.archived ? "Restore" : "Archive"}
              </Button>
            </li>
          ),
        )}
      </ul>
      <div>
        <p className="mb-2 text-xs font-medium text-fg-muted">Add an area</p>
        <AreaForm />
      </div>
    </div>
  );
}

function AreaForm({ area, onDone }: { area?: { id: string; name: string; color: string }; onDone?: () => void }) {
  const [color, setColor] = useState(area?.color ?? "indigo");
  return (
    <ActionForm action={saveLifeAreaAction} onSuccess={() => onDone?.()} resetOnSuccess={!area} className="flex flex-wrap items-end gap-2">
      {(pending) => (
        <>
          {area ? <input type="hidden" name="id" value={area.id} /> : null}
          <input type="hidden" name="color" value={color} />
          <Field label="Name" name="name" className="min-w-40 flex-1">
            {(p) => <Input {...p} name="name" defaultValue={area?.name} required placeholder="Travel" />}
          </Field>
          <div className="flex gap-1 pb-1.5">
            {AREA_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} className={cn("size-5 rounded-full ring-offset-2 ring-offset-bg", color === c && "ring-2 ring-fg")} style={{ background: AREA_HEX[c] }} />
            ))}
          </div>
          <Button type="submit" variant="primary" loading={pending}>{area ? "Save" : "Add"}</Button>
          {onDone ? <Button variant="ghost" onClick={onDone}>Cancel</Button> : null}
        </>
      )}
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="flex max-w-md flex-col gap-4">
      {(pending) => (
        <>
          <Field label="Current password" name="current">
            {(p) => <Input {...p} type="password" name="current" autoComplete="current-password" required />}
          </Field>
          <Field label="New password" name="next" hint="At least 10 characters.">
            {(p) => <Input {...p} type="password" name="next" autoComplete="new-password" required />}
          </Field>
          <Button type="submit" variant="primary" loading={pending} className="self-start">Change password</Button>
        </>
      )}
    </ActionForm>
  );
}

export function SignOutEverywhere() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger-ghost"
      loading={pending}
      className="self-start"
      onClick={() =>
        start(async () => {
          const r = await signOutEverywhereAction();
          if (r.ok) await logoutAction();
          else toast.error(r.error);
        })
      }
    >
      Sign out of all sessions
    </Button>
  );
}

export function AiPrivacySettings({ privacy, modules }: { privacy: Record<string, boolean>; modules: { key: string; label: string }[] }) {
  const [state, setState] = useState(privacy);
  const [pending, start] = useTransition();
  const toggle = (key: string, value: boolean) => {
    const next = { ...state, [key]: value };
    setState(next);
    start(async () => {
      const r = await setAiPrivacyAction(next);
      if (!r.ok) {
        toast.error(r.error);
        setState(state);
      }
    });
  };
  return (
    <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {modules.map((m) => (
        <li key={m.key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px]">
          <label htmlFor={`ai-${m.key}`} className="flex-1 cursor-pointer">{m.label}</label>
          <input id={`ai-${m.key}`} type="checkbox" checked={!!state[m.key]} disabled={pending} onChange={(e) => toggle(m.key, e.target.checked)} className="size-4 accent-[var(--accent)]" />
        </li>
      ))}
    </ul>
  );
}
