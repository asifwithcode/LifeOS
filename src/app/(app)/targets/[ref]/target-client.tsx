"use client";

import { useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { archiveTargetAction, deleteTargetAction, setTargetStatusAction } from "@/actions/targets";
import type { Target } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EntityMenu } from "@/components/entities/entity-menu";
import { TargetForm } from "@/components/forms/target-form";

export function TargetActions({ target, options }: { target: Target; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = target.status === "active" ? "paused" : "active";
      const r = await setTargetStatusAction(target.id, next);
      if (r.ok) toast.success(next === "paused" ? "Paused — hidden from Today and the dashboard" : "Resumed");
      else toast.error(r.error);
    });
  return (
    <>
      <Button onClick={toggle} loading={pending}>
        {target.status === "active" ? <Pause /> : <Play />}
        {target.status === "active" ? "Pause" : "Resume"}
      </Button>
      <Button onClick={() => setEditing(true)}>Edit</Button>
      <EntityMenu id={target.id} archived={!!target.archivedAt} deleted={!!target.deletedAt} archive={archiveTargetAction} remove={deleteTargetAction} afterDeleteHref="/targets" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${target.ref}`} description="Changing the amount is recorded in history." wide>
          <TargetForm options={options} target={target} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
