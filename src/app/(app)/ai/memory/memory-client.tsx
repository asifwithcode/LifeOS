"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addMemoryAction, archiveMemoryAction, deleteMemoryAction, setMemoryEnabledAction, updateMemoryAction } from "@/actions/ai";
import { Badge, Ref } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";

const KINDS = ["preference", "goal", "decision", "constraint", "plan", "fact"];

export function MemoryToggle({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setEnabled(next);
          start(async () => {
            const r = await setMemoryEnabledAction(next);
            if (!r.ok) {
              setEnabled(!next);
              toast.error(r.error);
            }
          });
        }}
        className="size-4 accent-[var(--accent)]"
      />
      Memory enabled
    </label>
  );
}

export function MemoryEditor() {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("preference");
  const [pending, start] = useTransition();
  return (
    <div className="mb-8 flex flex-col gap-2">
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add something the assistant should remember…" rows={2} maxLength={1000} aria-label="New memory" />
      <div className="flex justify-end gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36" aria-label="Kind">
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </Select>
        <Button
          variant="primary"
          loading={pending}
          disabled={!content.trim()}
          onClick={() =>
            start(async () => {
              const r = await addMemoryAction(content, kind);
              if (r.ok) setContent("");
              else toast.error(r.error);
            })
          }
        >
          Add memory
        </Button>
      </div>
    </div>
  );
}

export function MemoryRow({ memory: m }: { memory: { id: string; ref: string; content: string; kind: string; source: string; status: string; updatedAt: string } }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(m.content);
  const [kind, setKind] = useState(m.kind);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else if (msg) toast.success(msg);
    });
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editing ? (
        <>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} maxLength={1000} aria-label="Memory" />
          <div className="flex justify-end gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36" aria-label="Kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" loading={pending} onClick={() => run(() => updateMemoryAction(m.id, content, kind).then((r) => (r.ok && setEditing(false), r)))}>
              Save
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px]">{m.content}</p>
            <p className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
              <Badge tone="outline">{m.kind}</Badge>
              {m.source === "ai_suggested" ? "suggested by AI, approved by you" : "added by you"} · {m.updatedAt}
            </p>
          </div>
          <Ref>{m.ref}</Ref>
          <div className="flex gap-0.5">
            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(true)}><Pencil /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={m.status === "active" ? "Archive" : "Restore"} disabled={pending} onClick={() => run(() => archiveMemoryAction(m.id, m.status === "active"))}>
              {m.status === "active" ? <Archive /> : <ArchiveRestore />}
            </Button>
            <Button size="icon-sm" variant="danger-ghost" aria-label="Delete permanently" disabled={pending} onClick={() => window.confirm("Forget this permanently?") && run(() => deleteMemoryAction(m.id), "Forgotten")}>
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
