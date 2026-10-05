"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Ban, GitBranch, Lock, MoreHorizontal, Repeat } from "lucide-react";
import { toast } from "sonner";
import { archiveTaskAction, deleteTaskAction, setTaskStatusAction } from "@/actions/tasks";
import { TaskCheck } from "@/components/ui/checkbox";
import { Ref } from "@/components/ui/badge";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/ui/cn";
import { DueBadge } from "./due-badge";
import { PriorityBadge } from "./status";

export interface TaskRowData {
  id: string;
  ref: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  recurrence?: unknown;
  projectTitle?: string | null;
  projectRef?: string | null;
  tags?: string[];
  subtaskTotal?: number;
  subtaskDone?: number;
  blocked?: boolean;
  openBlockerRefs?: string[];
  archivedAt?: Date | string | null;
  deletedAt?: Date | string | null;
}

export function TaskRow({ task, today, showProject = true, compact }: { task: TaskRowData; today: string; showProject?: boolean; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(task.status === "done");
  const cancelled = task.status === "cancelled";

  const toggle = (checked: boolean) =>
    start(async () => {
      setOptimisticDone(checked);
      const r = await setTaskStatusAction(task.id, checked ? "done" : "todo");
      if (!r.ok) toast.error(r.error);
      else if (checked) {
        toast.success(`Completed ${task.ref}`, {
          description: r.data?.nextRef ? `Next: ${r.data.nextRef} due ${r.data.nextDue}` : undefined,
          action: { label: "Undo", onClick: () => void setTaskStatusAction(task.id, "todo") },
        });
      }
    });

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg);
      else toast.error(r.error ?? "Failed");
    });

  return (
    <li className={cn("group flex items-start gap-3 border-b border-border px-1 last:border-b-0", compact ? "py-2" : "py-2.5")}>
      <div className="pt-0.5">
        <TaskCheck checked={optimisticDone} onChange={toggle} disabled={pending || cancelled || !!task.deletedAt} label={`Complete ${task.title}`} priority={task.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/tasks/${task.ref}`} className={cn("block truncate text-[13px] leading-5 text-fg hover:underline hover:underline-offset-2", (optimisticDone || cancelled) && "text-fg-subtle line-through")}>
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 empty:hidden">
          {task.blocked ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-warning" title={`Waiting on ${task.openBlockerRefs?.join(", ")}`}>
              <Lock className="size-3" aria-hidden /> Blocked by {task.openBlockerRefs?.join(", ")}
            </span>
          ) : null}
          <DueBadge date={task.dueDate} today={today} done={optimisticDone} />
          {task.recurrence ? <Repeat className="size-3 text-fg-subtle" aria-label="Repeats" /> : null}
          {showProject && task.projectTitle ? (
            <Link href={`/projects/${task.projectRef}`} className="text-[11px] text-fg-subtle hover:text-fg">
              {task.projectTitle}
            </Link>
          ) : null}
          {task.subtaskTotal ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
              <GitBranch className="size-3" aria-hidden />
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          ) : null}
          {task.tags?.map((t) => (
            <Link key={t} href={`/tasks?tag=${encodeURIComponent(t)}`} className="text-[11px] text-fg-subtle hover:text-fg">
              #{t}
            </Link>
          ))}
          {cancelled ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
              <Ban className="size-3" /> Cancelled
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <PriorityBadge priority={task.priority} />
        <Ref className="hidden sm:inline">{task.ref}</Ref>
        <Dropdown>
          <DropdownTrigger className="grid size-6 place-items-center rounded text-fg-subtle opacity-60 hover:bg-bg-muted hover:text-fg group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Actions for ${task.title}`}>
            <MoreHorizontal className="size-4" />
          </DropdownTrigger>
          <DropdownContent>
            {task.deletedAt ? (
              <DropdownItem onSelect={() => act(() => deleteTaskAction(task.id, false), "Restored")}>Restore from trash</DropdownItem>
            ) : (
              <>
                {task.status !== "in_progress" && task.status !== "done" ? (
                  <DropdownItem onSelect={() => act(() => setTaskStatusAction(task.id, "in_progress"), "Marked in progress")}>Start (in progress)</DropdownItem>
                ) : null}
                {task.status !== "cancelled" ? (
                  <DropdownItem onSelect={() => act(() => setTaskStatusAction(task.id, "cancelled"), "Cancelled")}>Cancel task</DropdownItem>
                ) : (
                  <DropdownItem onSelect={() => act(() => setTaskStatusAction(task.id, "todo"), "Reopened")}>Reopen</DropdownItem>
                )}
                <DropdownSeparator />
                {task.archivedAt ? (
                  <DropdownItem onSelect={() => act(() => archiveTaskAction(task.id, false), "Unarchived")}>Unarchive</DropdownItem>
                ) : (
                  <DropdownItem onSelect={() => act(() => archiveTaskAction(task.id, true), "Archived")}>Archive</DropdownItem>
                )}
                <DropdownItem danger onSelect={() => act(() => deleteTaskAction(task.id, true), "Moved to trash")}>
                  Move to trash
                </DropdownItem>
              </>
            )}
          </DropdownContent>
        </Dropdown>
      </div>
    </li>
  );
}

export function TaskList({ tasks, today, showProject, compact }: { tasks: TaskRowData[]; today: string; showProject?: boolean; compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} today={today} showProject={showProject} compact={compact} />
      ))}
    </ul>
  );
}
