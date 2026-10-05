"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Pencil, RotateCcw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { approveActionAction, rejectActionAction, reopenActionAction } from "@/actions/ai";
import type { PresentedAction } from "@/server/ai/action-service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Ref } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";

const STATUS: Record<string, { label: string; className: string }> = {
  proposed: { label: "Awaiting your approval", className: "text-accent" },
  executing: { label: "Running…", className: "text-fg-muted" },
  executed: { label: "Approved & done", className: "text-success" },
  rejected: { label: "Rejected", className: "text-fg-subtle" },
  failed: { label: "Failed", className: "text-danger" },
};

/** Preview → approve / edit / reject. Nothing in the user's data changes before approval. */
export function ActionCard({ action, onChange }: { action: PresentedAction; onChange?: (a: PresentedAction) => void }) {
  const [state, setState] = useState(action);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const update = (patch: Partial<PresentedAction>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange?.(next);
  };
  const approve = (payload?: Record<string, unknown>) =>
    start(async () => {
      const r = await approveActionAction(state.id, payload);
      if (r.ok && r.data) {
        update({ status: "executed", created: r.data.created, summary: r.data.summary, payload: payload ?? state.payload });
        toast.success(state.label + " — done");
        setEditing(false);
      } else if (!r.ok) {
        update({ status: "failed", error: r.error });
        toast.error(r.error);
      }
    });
  const reject = () =>
    start(async () => {
      const r = await rejectActionAction(state.id);
      if (r.ok) update({ status: "rejected" });
      else toast.error(r.error);
    });
  const retry = () =>
    start(async () => {
      const r = await reopenActionAction(state.id);
      if (r.ok) update({ status: "proposed", error: null });
    });
  const s = STATUS[state.status] ?? STATUS.proposed;
  return (
    <div className={cn("rounded-lg border bg-bg p-3 text-[13px]", state.status === "proposed" ? "border-accent/40" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-fg-subtle">
            <ShieldCheck className="size-3.5 text-accent" aria-hidden /> Proposed · {state.label}
          </p>
          <p className="mt-1 font-medium text-fg">{state.summary}</p>
        </div>
        <Ref>{state.ref}</Ref>
      </div>
      {state.details.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
          {state.details.slice(0, 14).map((d, i) => (
            <li key={i}>• {d}</li>
          ))}
          {state.details.length > 14 ? <li>… and {state.details.length - 14} more</li> : null}
        </ul>
      ) : null}
      {state.reason ? <p className="mt-2 text-xs italic text-fg-subtle">“{state.reason}”</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={cn("text-xs", s.className)}>
          {s.label}
          {state.error ? ` — ${state.error}` : ""}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {state.status === "proposed" ? (
            <>
              <Button size="sm" variant="ghost" onClick={reject} disabled={pending}>
                <X /> Reject
              </Button>
              <Button size="sm" onClick={() => setEditing(true)} disabled={pending}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" variant="primary" onClick={() => approve()} loading={pending}>
                <Check /> Approve
              </Button>
            </>
          ) : null}
          {state.status === "failed" ? (
            <Button size="sm" onClick={retry} loading={pending}>
              <RotateCcw /> Review again
            </Button>
          ) : null}
          {state.status === "executed"
            ? state.created.map((c, i) => (
                <Link key={i} href={c.url} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-muted">
                  Open {c.ref ?? c.title}
                </Link>
              ))
            : null}
        </div>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit before approving — ${state.label}`} description="Change the details, then approve. Lists (milestones, tasks) are kept as proposed." wide>
          {editing ? <PayloadEditor payload={state.payload} pending={pending} onApprove={(p) => approve(p)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayloadEditor({ payload, pending, onApprove }: { payload: Record<string, unknown>; pending: boolean; onApprove: (p: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(payload);
  const fields = Object.entries(payload).filter(([k, v]) => k !== "reason" && (typeof v === "string" || typeof v === "number"));
  const lists = Object.entries(payload).filter(([, v]) => Array.isArray(v));
  return (
    <div className="flex flex-col gap-3">
      {fields.map(([k, v]) => {
        const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        const long = typeof v === "string" && (k === "content" || k === "description" || v.length > 120);
        return (
          <label key={k} className="flex flex-col gap-1 text-xs text-fg-muted">
            {label}
            {long ? (
              <Textarea value={String(draft[k] ?? "")} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} rows={k === "content" ? 10 : 3} />
            ) : (
              <Input
                value={String(draft[k] ?? "")}
                type={typeof v === "number" ? "number" : "text"}
                onChange={(e) => setDraft({ ...draft, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value })}
              />
            )}
          </label>
        );
      })}
      {lists.map(([k, v]) => (
        <p key={k} className="text-xs text-fg-subtle">
          {k}: {(v as unknown[]).length} item(s) — kept as proposed
        </p>
      ))}
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={() => onApprove(draft)}>
          <Check /> Approve edited
        </Button>
      </div>
    </div>
  );
}
