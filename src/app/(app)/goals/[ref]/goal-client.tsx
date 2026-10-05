"use client";

import { useState } from "react";
import { archiveGoalAction, deleteGoalAction } from "@/actions/goals";
import type { Goal } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EntityMenu } from "@/components/entities/entity-menu";
import { GoalForm } from "@/components/forms/goal-form";

export function GoalActions({ goal, options }: { goal: Goal; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Button onClick={() => setEditing(true)}>Edit</Button>
      <EntityMenu id={goal.id} archived={!!goal.archivedAt} deleted={!!goal.deletedAt} archive={archiveGoalAction} remove={deleteGoalAction} afterDeleteHref="/goals" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${goal.ref}`} wide>
          <GoalForm options={options} goal={goal} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
