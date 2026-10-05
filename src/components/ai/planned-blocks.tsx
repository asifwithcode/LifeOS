"use client";

import { useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { completeAdjustmentAction, removeAdjustmentAction, resetAdjustmentAction } from "@/actions/ai";
import { formatMinutes, minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import { TaskCheck } from "@/components/ui/checkbox";
import { cn } from "@/lib/ui/cn";

export interface PlannedItem {
  id: string;
  title: string;
  startTime: string;
  durationMinutes: number;
  status: string;
  source: string;
  taskRef: string | null;
}

/** Date-only plan blocks (accepted AI suggestions). Completing one logs a session. */
export function PlannedBlocks({ items, canComplete }: { items: PlannedItem[]; canComplete: boolean }) {
  const [pending, start] = useTransition();
  if (!items.length) return <p className="text-xs text-fg-subtle">Nothing extra planned.</p>;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else if (msg) toast.success(msg);
    });
  return (
    <ul className="flex flex-col">
      {items.map((p) => (
        <li key={p.id} className="group flex items-start gap-3 py-2">
          <span className="tabular w-11 shrink-0 pt-0.5 text-xs text-fg-subtle">{p.startTime}</span>
          <div className="pt-0.5">
            <TaskCheck
              checked={p.status === "done"}
              disabled={pending || !canComplete}
              label={`Mark ${p.title} done`}
              onChange={(c) => run(() => (c ? completeAdjustmentAction(p.id) : resetAdjustmentAction(p.id)), c ? `Logged ${formatMinutes(p.durationMinutes)}` : undefined)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("flex items-center gap-1.5 text-[13px]", p.status === "done" && "text-fg-subtle line-through")}>
              {p.source === "ai" ? <Sparkles className="size-3 shrink-0 text-accent" aria-label="Suggested by AI" /> : null}
              <span className="truncate">{p.title}</span>
            </p>
            <p className="text-[11px] text-fg-subtle">
              {formatMinutes(p.durationMinutes)} · until {minutesToTime(timeToMinutes(p.startTime) + p.durationMinutes)}
              {p.taskRef ? ` · ${p.taskRef}` : ""} · today only
            </p>
          </div>
          <button type="button" onClick={() => run(() => removeAdjustmentAction(p.id), "Removed from today")} disabled={pending} className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg-muted group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${p.title}`}>
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
