"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { setDayPlanAction } from "@/actions/routine";
import { deleteSessionAction } from "@/actions/targets";

export function DayTemplateSwitcher({ date, templates, currentId, overridden }: { date: string; templates: { id: string; name: string }[]; currentId: string | null; overridden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Template for this date"
        disabled={pending}
        value={currentId ?? ""}
        onChange={(e) =>
          start(async () => {
            const r = await setDayPlanAction(date, e.target.value || null);
            if (r.ok) toast.success("Routine changed for this date only — your templates are untouched.");
            else toast.error(r.error);
          })
        }
        className="h-7 rounded-md border border-border bg-bg px-2 text-xs text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {overridden ? (
        <button
          type="button"
          className="text-[11px] text-fg-subtle hover:text-fg"
          onClick={() =>
            start(async () => {
              const r = await setDayPlanAction(date, null);
              if (!r.ok) toast.error(r.error);
            })
          }
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

export function DeleteSessionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete session"
      onClick={() =>
        start(async () => {
          const r = await deleteSessionAction(id);
          if (r.ok) toast.success("Session deleted");
          else toast.error(r.error);
        })
      }
      className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
    >
      <X className="size-3" />
    </button>
  );
}
