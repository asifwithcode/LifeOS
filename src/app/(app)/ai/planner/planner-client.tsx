"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { acceptPlanBlocksAction, suggestDayPlanAction } from "@/actions/ai";
import { minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";

type Block = { start: string; durationMinutes: number; title: string; activityType?: string; taskRef?: string; reason: string };

export function PlannerClient({ providerLabel }: { providerLabel: string }) {
  const [wishes, setWishes] = useState("");
  const [plan, setPlan] = useState<{ summary: string; blocks: Block[]; cautions: string[] } | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const suggest = () =>
    start(async () => {
      const r = await suggestDayPlanAction(wishes);
      if (!r.ok) return void toast.error(r.error);
      if (!r.data) return void toast.error("The planner couldn't produce a plan. Try again.");
      setPlan(r.data);
      setAccepted(new Set());
    });
  const accept = (idx: number[]) =>
    start(async () => {
      if (!plan) return;
      const blocks = idx.map((i) => plan.blocks[i]);
      const r = await acceptPlanBlocksAction(blocks);
      if (r.ok) {
        setAccepted(new Set([...accepted, ...idx]));
        toast.success(`Added ${idx.length} block${idx.length === 1 ? "" : "s"} to today`);
      } else toast.error(r.error);
    });
  const open = plan ? plan.blocks.map((_, i) => i).filter((i) => !accepted.has(i)) : [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder="Anything to consider? e.g. “gym at 6pm, low energy today”" maxLength={500} aria-label="Wishes for today" />
        <Button variant="primary" onClick={suggest} loading={pending}>
          <Sparkles /> {plan ? "Re-plan" : "Suggest a plan"}
        </Button>
      </div>
      <p className="-mt-4 text-[11px] text-fg-subtle">Sends today&apos;s routine, open tasks and target progress to {providerLabel}.</p>
      {plan ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed">{plan.summary}</p>
          {plan.cautions.length ? (
            <ul className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              {plan.cautions.map((c, i) => (
                <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {c}</li>
              ))}
            </ul>
          ) : null}
          {plan.blocks.length ? (
            <>
              <ol className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
                {plan.blocks.map((b, i) => (
                  <li key={i} className={cn("flex items-start gap-4 px-4 py-3", accepted.has(i) && "bg-bg-subtle")}>
                    <span className="tabular w-24 shrink-0 text-[13px]">
                      {b.start}<span className="text-fg-subtle"> – {minutesToTime(timeToMinutes(b.start) + b.durationMinutes)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{b.title}{b.taskRef ? <span className="ml-2 font-mono text-[11px] text-fg-subtle">{b.taskRef}</span> : null}</p>
                      <p className="text-xs text-fg-muted">{b.reason}</p>
                    </div>
                    {accepted.has(i) ? (
                      <span className="flex items-center gap-1 text-xs text-success"><Check className="size-3.5" /> Added</span>
                    ) : (
                      <Button size="sm" onClick={() => accept([i])} disabled={pending}>Accept</Button>
                    )}
                  </li>
                ))}
              </ol>
              {open.length > 1 ? (
                <Button variant="primary" className="self-end" onClick={() => accept(open)} loading={pending}>
                  Accept all {open.length}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-fg-muted">No free blocks to suggest.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
