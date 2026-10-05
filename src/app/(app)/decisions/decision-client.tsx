"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDecisionAction } from "@/actions/projects";
import type { Decision } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { DecisionForm } from "@/components/forms/decision-form";

export function DecisionMenu({ decision, options }: { decision: Decision; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  return (
    <>
      <Dropdown>
        <DropdownTrigger className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-bg-muted hover:text-fg" aria-label={`Actions for ${decision.title}`}>
          <MoreHorizontal className="size-4" />
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem icon={<Pencil />} onSelect={() => setEditing(true)}>Edit</DropdownItem>
          <DropdownItem
            danger
            icon={<Trash2 />}
            onSelect={() =>
              start(async () => {
                const r = await deleteDecisionAction(decision.id);
                if (r.ok) toast.success("Decision deleted");
                else toast.error(r.error);
              })
            }
          >
            Delete
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${decision.ref}`} wide>
          <DecisionForm options={options} decision={decision} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
