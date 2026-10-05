"use client";

import { useState, useTransition } from "react";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { convertIdeaAction, deleteIdeaAction, setIdeaStatusAction } from "@/actions/projects";
import type { Idea } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EntityMenu } from "@/components/entities/entity-menu";
import { IdeaForm } from "@/components/forms/idea-form";
import { titleCase } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

export function IdeaActions({ idea, tags, options }: { idea: Idea; tags: string[]; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const convert = () =>
    start(async () => {
      const r = await convertIdeaAction(idea.id);
      if (r.ok) {
        toast.success(r.message ?? "Project created");
        if (r.redirectTo) router.push(r.redirectTo);
      } else toast.error(r.error);
    });
  return (
    <>
      {!idea.convertedProjectId && !idea.deletedAt ? (
        <Button variant="primary" onClick={convert} loading={pending}>
          <FolderKanban /> Convert to project
        </Button>
      ) : null}
      <Button onClick={() => setEditing(true)}>Edit</Button>
      <EntityMenu id={idea.id} deleted={!!idea.deletedAt} remove={deleteIdeaAction} afterDeleteHref="/ideas" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${idea.ref}`} wide>
          <IdeaForm options={options} idea={idea} tags={tags} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function IdeaStagePicker({ id, status, stages }: { id: string; status: string; stages: readonly string[] }) {
  const [pending, start] = useTransition();
  const idx = stages.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Idea stage">
      {stages.map((s, i) => (
        <li key={s}>
          <button
            type="button"
            disabled={pending || s === status}
            aria-current={s === status ? "step" : undefined}
            onClick={() =>
              start(async () => {
                const r = await setIdeaStatusAction(id, s);
                if (!r.ok) toast.error(r.error);
              })
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              s === status ? "border-accent bg-accent-soft font-medium text-accent" : i < idx && s !== "archived" ? "border-border bg-bg-muted text-fg-muted" : "border-border text-fg-subtle hover:text-fg",
            )}
          >
            {titleCase(s)}
          </button>
        </li>
      ))}
    </ol>
  );
}
