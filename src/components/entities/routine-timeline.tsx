"use client";

import { useTransition } from "react";
import { Check, MoreHorizontal, RotateCcw, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { completeRoutineAction, resetRoutineAction, skipRoutineAction } from "@/actions/routine";
import { formatMinutes } from "@/lib/domain/dates";
import type { RoutineSlot } from "@/server/services/routine";
import { TaskCheck } from "@/components/ui/checkbox";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/ui/cn";

const STATE_STYLE: Record<string, string> = {
  done: "text-fg-subtle",
  skipped: "text-fg-subtle line-through",
  now: "text-fg",
  upcoming: "text-fg",
  missed: "text-fg-muted",
};

function SlotRow({ slot, date, canComplete }: { slot: RoutineSlot; date: string; canComplete: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else if (msg) toast.success(msg);
    });
  const done = slot.state === "done";
  return (
    <li className={cn("group relative flex items-start gap-3 py-2 pl-1 pr-1", slot.state === "now" && "rounded-md bg-accent-soft/60")}>
      <span className="tabular w-11 shrink-0 pt-0.5 text-xs text-fg-subtle">{slot.item.startTime.slice(0, 5)}</span>
      <div className="pt-0.5">
        <TaskCheck
          checked={done}
          disabled={pending || !canComplete}
          label={`Mark ${slot.item.title} done`}
          onChange={(c) => run(() => (c ? completeRoutineAction(slot.item.id, date) : resetRoutineAction(slot.item.id, date)), c && slot.item.logAsSession ? `Logged ${formatMinutes(slot.item.durationMinutes)}` : undefined)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("flex items-center gap-2 text-[13px]", STATE_STYLE[slot.state])}>
          <span className="truncate">{slot.item.title}</span>
          {slot.state === "now" ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-medium text-accent-fg">Now</span> : null}
          {slot.state === "missed" ? <span className="text-[11px] text-fg-subtle">· not done</span> : null}
        </div>
        <div className="text-[11px] text-fg-subtle">
          {formatMinutes(slot.item.durationMinutes)} · until {slot.endTime}
          {slot.skillName ? ` · ${slot.skillName}` : ""}
          {slot.projectTitle ? ` · ${slot.projectTitle}` : ""}
          {done && slot.completion?.actualMinutes && slot.completion.actualMinutes !== slot.item.durationMinutes ? ` · actual ${formatMinutes(slot.completion.actualMinutes)}` : ""}
        </div>
      </div>
      {canComplete ? (
        <Dropdown>
          <DropdownTrigger className="grid size-6 shrink-0 place-items-center rounded text-fg-subtle opacity-60 hover:bg-bg-muted group-hover:opacity-100" aria-label={`Options for ${slot.item.title}`}>
            <MoreHorizontal className="size-4" />
          </DropdownTrigger>
          <DropdownContent>
            {!done ? (
              <DropdownItem
                icon={<Check />}
                onSelect={() => {
                  const v = window.prompt(`Actual minutes for "${slot.item.title}"`, String(slot.item.durationMinutes));
                  const n = v ? Number(v) : NaN;
                  if (Number.isFinite(n) && n > 0) run(() => completeRoutineAction(slot.item.id, date, Math.round(n)), `Logged ${formatMinutes(Math.round(n))}`);
                }}
              >
                Done, different duration…
              </DropdownItem>
            ) : null}
            {slot.state !== "skipped" ? (
              <DropdownItem icon={<SkipForward />} onSelect={() => run(() => skipRoutineAction(slot.item.id, date), "Skipped")}>
                Skip today
              </DropdownItem>
            ) : null}
            {slot.completion ? (
              <DropdownItem icon={<RotateCcw />} onSelect={() => run(() => resetRoutineAction(slot.item.id, date), "Reset")}>
                Reset
              </DropdownItem>
            ) : null}
          </DropdownContent>
        </Dropdown>
      ) : null}
    </li>
  );
}

export function RoutineTimeline({ slots, date, canComplete }: { slots: RoutineSlot[]; date: string; canComplete: boolean }) {
  return (
    <ol className="flex flex-col">
      {slots.map((s) => (
        <SlotRow key={s.item.id} slot={s} date={date} canComplete={canComplete} />
      ))}
    </ol>
  );
}
