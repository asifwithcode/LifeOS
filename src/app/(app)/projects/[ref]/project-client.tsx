"use client";

import { useState } from "react";
import { archiveProjectAction, deleteProjectAction } from "@/actions/projects";
import type { Project } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EntityMenu } from "@/components/entities/entity-menu";
import { ProjectForm } from "@/components/forms/project-form";
import { LogSessionButton } from "../../_components/shell-buttons";

export function ProjectActions({ project, tags, options }: { project: Project; tags: string[]; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <LogSessionButton />
      <Button onClick={() => setEditing(true)}>Edit</Button>
      <EntityMenu id={project.id} archived={!!project.archivedAt} deleted={!!project.deletedAt} archive={archiveProjectAction} remove={deleteProjectAction} afterDeleteHref="/projects" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${project.ref}`} wide>
          <ProjectForm options={options} project={project} tags={tags} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
