"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, CirclePlay, Plus, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { addDependencyAction, archiveTaskAction, deleteTaskAction, removeDependencyAction, setTaskStatusAction } from "@/actions/tasks";
import type { Task } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Ref } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { TaskCheck } from "@/components/ui/checkbox";
import { EntityMenu } from "@/components/entities/entity-menu";
import { TaskForm } from "@/components/forms/task-form";
import { SessionForm } from "@/components/forms/session-form";

export function TaskDetailActions({ task, options }: { task: Task & { tags: string[] }; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [pending, start] = useTransition();
  const setStatus = (s: string, msg: string) =>
    start(async () => {
      const r = await setTaskStatusAction(task.id, s);
      if (r.ok) toast.success(msg, { description: r.data?.nextRef ? `Next occurrence ${r.data.nextRef} due ${r.data.nextDue}` : undefined });
      else toast.error(r.error);
    });
  return (
    <>
      {task.status === "todo" ? (
        <Button onClick={() => setStatus("in_progress", "Started")} loading={pending}>
          <CirclePlay /> Start
        </Button>
      ) : null}
      {task.status !== "done" ? (
        <Button variant="primary" onClick={() => setStatus("done", `Completed ${task.ref}`)} loading={pending}>
          <Check /> Complete
        </Button>
      ) : (
        <Button onClick={() => setStatus("todo", "Reopened")} loading={pending}>
          Reopen
        </Button>
      )}
      <Button onClick={() => setLogging(true)}>
        <Timer /> Log time
      </Button>
      <EntityMenu id={task.id} archived={!!task.archivedAt} deleted={!!task.deletedAt} onEdit={() => setEditing(true)} archive={archiveTaskAction} remove={deleteTaskAction} afterDeleteHref="/tasks" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${task.ref}`} wide>
          <TaskForm
            options={options}
            initial={{ ...task, tags: task.tags }}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={logging} onOpenChange={setLogging}>
        <DialogContent title="Log time on this task" description="Counts toward the task's project, skill and matching targets." wide>
          <SessionForm options={options} defaults={{ title: task.title, taskId: task.id, skillId: task.skillId, projectId: task.projectId, activityType: task.skillId ? "practice" : "project" }} onDone={() => setLogging(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

type Dep = { id: string; ref: string; title: string; status: string };

export function DependencyEditor({ taskId, blockers, blocking, options }: { taskId: string; blockers: Dep[]; blocking: Dep[]; options: Dep[] }) {
  const [pick, setPick] = useState("");
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      if (!pick) return;
      const r = await addDependencyAction(taskId, pick);
      if (r.ok) setPick("");
      else toast.error(r.error);
    });
  const remove = (blockerId: string) =>
    start(async () => {
      const r = await removeDependencyAction(taskId, blockerId);
      if (!r.ok) toast.error(r.error);
    });
  const available = options.filter((o) => !blockers.some((b) => b.id === o.id) && o.status !== "done");
  const row = (d: Dep, removable: boolean) => (
    <li key={d.id} className="group flex items-center gap-2.5 py-1 text-[13px]">
      <TaskCheck checked={d.status === "done"} onChange={() => {}} disabled label={d.title} size="sm" />
      <Link href={`/tasks/${d.ref}`} className={`flex-1 truncate hover:underline ${d.status === "done" ? "text-fg-subtle line-through" : ""}`}>
        {d.title}
      </Link>
      <Ref>{d.ref}</Ref>
      {removable ? (
        <button type="button" onClick={() => remove(d.id)} className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg-muted group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove dependency on ${d.title}`}>
          <X className="size-3" />
        </button>
      ) : null}
    </li>
  );
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-xs text-fg-muted">Waits on</p>
        {blockers.length ? <ul>{blockers.map((b) => row(b, true))}</ul> : <p className="text-xs text-fg-subtle">No blockers.</p>}
        <div className="mt-2 flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose a blocking task" className="flex-1">
            <option value="">Add a task this one waits on…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ref} · {o.title}
              </option>
            ))}
          </Select>
          <Button onClick={add} disabled={!pick} loading={pending}>
            <Plus /> Add
          </Button>
        </div>
      </div>
      {blocking.length ? (
        <div>
          <p className="mb-1 text-xs text-fg-muted">Blocks</p>
          <ul>{blocking.map((b) => row(b, false))}</ul>
        </div>
      ) : null}
    </div>
  );
}
