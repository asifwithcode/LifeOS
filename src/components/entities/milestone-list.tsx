"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteMilestoneAction, moveMilestoneAction, setMilestoneStatusAction } from "@/actions/goals";
import type { MilestoneView } from "@/server/services/milestones";
import { TaskCheck } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { MilestoneForm } from "@/components/forms/milestone-form";
import { cn } from "@/lib/ui/cn";
import { DueBadge } from "./due-badge";

/** ✓ done · ◐ in progress · ○ pending, with weights and dependency locks. */
export function MilestoneList({ milestones, owner, today }: { milestones: MilestoneView[]; owner: { goalId?: string; projectId?: string }; today: string }) {
  const [editing, setEditing] = useState<MilestoneView | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else if (msg) toast.success(msg);
    });
  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0);
  return (
    <div className="flex flex-col">
      {milestones.length === 0 ? <p className="pb-2 text-xs text-fg-subtle">No milestones yet. Break the outcome into 3–7 checkpoints.</p> : null}
      <ol className="flex flex-col">
        {milestones.map((m, i) => (
          <li key={m.id} className="group flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
            <div className="pt-0.5">
              <TaskCheck
                checked={m.status === "done"}
                disabled={pending}
                label={`Complete ${m.title}`}
                onChange={(c) => run(() => setMilestoneStatusAction(m.id, c ? "done" : "pending"), c ? `Completed ${m.title}` : undefined)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn("flex items-center gap-2 text-[13px]", m.status === "done" && "text-fg-subtle line-through")}>
                <span className="truncate">{m.title}</span>
                {m.status === "in_progress" ? <span className="text-[11px] text-accent">◐ in progress</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-fg-subtle">
                <span>weight {m.weight}{totalWeight ? ` (${Math.round((m.weight / totalWeight) * 100)}%)` : ""}</span>
                {m.taskTotal ? <span>{m.taskDone}/{m.taskTotal} tasks</span> : null}
                <DueBadge date={m.dueDate} today={today} done={m.status === "done"} />
                {m.blocked ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Lock className="size-3" /> after {m.blockers.filter((b) => !b.done).map((b) => b.title).join(", ")}
                  </span>
                ) : null}
              </div>
            </div>
            <Dropdown>
              <DropdownTrigger className="grid size-6 place-items-center rounded text-fg-subtle opacity-60 hover:bg-bg-muted group-hover:opacity-100" aria-label={`Actions for ${m.title}`}>
                <MoreHorizontal className="size-4" />
              </DropdownTrigger>
              <DropdownContent>
                {m.status !== "in_progress" && m.status !== "done" ? <DropdownItem onSelect={() => run(() => setMilestoneStatusAction(m.id, "in_progress"))}>Mark in progress</DropdownItem> : null}
                <DropdownItem icon={<Pencil />} onSelect={() => setEditing(m)}>Edit</DropdownItem>
                <DropdownItem icon={<ArrowUp />} disabled={i === 0} onSelect={() => run(() => moveMilestoneAction(m.id, "up"))}>Move up</DropdownItem>
                <DropdownItem icon={<ArrowDown />} disabled={i === milestones.length - 1} onSelect={() => run(() => moveMilestoneAction(m.id, "down"))}>Move down</DropdownItem>
                <DropdownSeparator />
                <DropdownItem danger icon={<Trash2 />} onSelect={() => run(() => deleteMilestoneAction(m.id), "Milestone removed")}>Delete</DropdownItem>
              </DropdownContent>
            </Dropdown>
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-1 self-start" onClick={() => setAdding(true)}>
        <Plus /> Add milestone
      </Button>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add milestone">
          <MilestoneForm owner={owner} onDone={() => setAdding(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit milestone">{editing ? <MilestoneForm milestone={editing} onDone={() => setEditing(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
