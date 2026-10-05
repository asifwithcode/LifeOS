"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { updateWidgetsAction } from "@/actions/settings";
import { DASHBOARD_WIDGETS } from "@/lib/domain/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function WidgetCustomizer({ widgets }: { widgets: { id: string; visible: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(widgets);
  const [pending, start] = useTransition();
  const label = (id: string) => DASHBOARD_WIDGETS.find((w) => w.id === id)?.label ?? id;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = () =>
    start(async () => {
      const r = await updateWidgetsAction(list);
      if (r.ok) {
        toast.success("Dashboard updated");
        setOpen(false);
      } else toast.error(r.error);
    });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setList(widgets); }}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal /> Customize
      </Button>
      <DialogContent title="Customize dashboard" description="Choose what you see and in which order. Keep it calm — fewer is better.">
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {list.map((w, i) => (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2">
              <input
                id={`w-${w.id}`}
                type="checkbox"
                checked={w.visible}
                onChange={(e) => setList(list.map((x) => (x.id === w.id ? { ...x, visible: e.target.checked } : x)))}
                className="size-3.5 accent-[var(--accent)]"
              />
              <label htmlFor={`w-${w.id}`} className="flex-1 text-[13px]">
                {label(w.id)}
              </label>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${label(w.id)} up`}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${label(w.id)} down`}>
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={pending}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
