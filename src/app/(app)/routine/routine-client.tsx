"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { archiveTemplateAction, duplicateTemplateAction, removeRoutineItemAction } from "@/actions/routine";
import { formatMinutes, minutesToTime, timeToMinutes } from "@/lib/domain/dates";
import type { RoutineItem, RoutineTemplate } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { RoutineItemForm, TemplateForm } from "@/components/forms/routine-forms";
import { DialogButton } from "@/components/entities/dialog-button";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RoutineItemRow({ item, meta, overlap, options }: { item: RoutineItem; meta: string; overlap: boolean; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const end = minutesToTime(timeToMinutes(item.startTime) + item.durationMinutes);
  return (
    <li className="group flex items-start gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="tabular w-24 shrink-0 text-[13px]">
        <span className="text-fg">{item.startTime.slice(0, 5)}</span>
        <span className="text-fg-subtle"> – {end}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{item.title}</p>
        <p className="mt-0.5 text-[11px] text-fg-subtle">
          {formatMinutes(item.durationMinutes)}
          {item.activityType ? ` · ${item.activityType}` : ""}
          {item.daysOfWeek?.length ? ` · ${item.daysOfWeek.map((d) => WD[d]).join(", ")} only` : ""}
          {meta ? ` · ${meta}` : ""}
          {!item.logAsSession ? " · not logged as a session" : ""}
        </p>
        {overlap ? <p className="mt-0.5 text-[11px] text-warning">Overlaps another block</p> : null}
      </div>
      <Dropdown>
        <DropdownTrigger className="grid size-6 place-items-center rounded text-fg-subtle opacity-60 hover:bg-bg-muted group-hover:opacity-100" aria-label={`Actions for ${item.title}`}>
          <MoreHorizontal className="size-4" />
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem icon={<Pencil />} onSelect={() => setEditing(true)}>Edit</DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            danger
            icon={<Trash2 />}
            disabled={pending}
            onSelect={() =>
              start(async () => {
                const r = await removeRoutineItemAction(item.id);
                if (r.ok) toast.success(r.message ?? "Removed");
                else toast.error(r.error);
              })
            }
          >
            Remove
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Edit block" wide>
          <RoutineItemForm options={options} templateId={item.templateId} item={item} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function AddBlockButton({ templateId, options }: { templateId: string; options: EntityOptions }) {
  return (
    <DialogButton variant="secondary" className="self-start" label={<><Plus /> Add block</>} title="Add routine block" wide>
      {(close) => <RoutineItemForm options={options} templateId={templateId} onDone={close} />}
    </DialogButton>
  );
}

export function NewTemplateButton() {
  return (
    <DialogButton variant="primary" label={<><Plus /> New template</>} title="New routine template">
      {(close) => <TemplateForm onDone={close} />}
    </DialogButton>
  );
}

export function TemplateToolbar({ template }: { template: RoutineTemplate }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => setEditing(true)}>
        <Pencil /> Template settings
      </Button>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon-sm" aria-label="More template actions" loading={pending}>
            {!pending ? <MoreHorizontal /> : null}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem
            icon={<Copy />}
            onSelect={() => {
              const name = window.prompt("Name for the copy", `${template.name} (copy)`);
              if (!name) return;
              start(async () => {
                const r = await duplicateTemplateAction(template.id, name);
                if (r.ok && r.data) {
                  toast.success("Template duplicated");
                  router.push(`/routine?template=${r.data.id}`);
                } else if (!r.ok) toast.error(r.error);
              });
            }}
          >
            Duplicate
          </DropdownItem>
          <DropdownItem
            icon={<Archive />}
            danger
            onSelect={() =>
              start(async () => {
                const r = await archiveTemplateAction(template.id, true);
                if (r.ok) {
                  toast.success("Template archived — its history is kept");
                  router.push("/routine");
                } else toast.error(r.error);
              })
            }
          >
            Archive template
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title="Template settings">
          <TemplateForm template={template} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
