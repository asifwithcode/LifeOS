"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { bulkAcceptAction, convertInboxAction, discardInboxAction, restoreInboxAction } from "@/actions/inbox";
import type { CaptureSuggestion } from "@/lib/domain/capture";
import { ENTITY_LABEL } from "@/lib/domain/constants";
import type { Option } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Ref } from "@/components/ui/badge";
import { ConversionEditor, conversionFromSuggestion, type Conversion } from "@/components/entities/conversion-editor";

interface Item {
  id: string;
  ref: string;
  content: string;
  suggestion: CaptureSuggestion | null;
  createdAt: string;
}

function suggestionLabel(s: CaptureSuggestion | null) {
  if (!s) return "Note";
  const type = s.type === "resource" ? "Note (link)" : ENTITY_LABEL[s.type];
  return [type, s.projectTitle ? `· ${s.projectTitle}` : null, s.priority && s.priority !== "none" && s.type === "task" ? `· ${s.priority}` : null, s.tags.length ? `· ${s.tags.map((t) => `#${t}`).join(" ")}` : null]
    .filter(Boolean)
    .join(" ");
}

function InboxRow({ item, projects, today, selected, onSelect }: { item: Item; projects: Option[]; today: string; selected: boolean; onSelect: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<Conversion>(() => conversionFromSuggestion(item.suggestion, item.content, today));
  const [pending, start] = useTransition();
  const router = useRouter();
  const convert = (c: Conversion) =>
    start(async () => {
      const r = await convertInboxAction(item.id, c);
      if (r.ok && r.data) {
        const url = r.data.url;
        toast.success(`Created ${r.data.ref}`, { action: { label: "Open", onClick: () => router.push(url) } });
      } else if (!r.ok) toast.error(r.error);
    });
  const discard = () =>
    start(async () => {
      const r = await discardInboxAction([item.id]);
      if (r.ok) toast.success("Discarded", { action: { label: "Undo", onClick: () => void restoreInboxAction(item.id) } });
      else toast.error(r.error);
    });
  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} className="mt-1 size-3.5 accent-[var(--accent)]" aria-label={`Select ${item.ref}`} />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-[13px] text-fg">{item.content}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Sparkles className="size-3 text-accent" aria-hidden />
            Suggested: <span className="text-fg-muted">{suggestionLabel(item.suggestion)}</span>
            {item.suggestion?.reasons.length ? <span className="hidden sm:inline">— {item.suggestion.reasons[0]}</span> : null}
          </p>
        </div>
        <Ref className="hidden sm:inline">{item.ref}</Ref>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <Button size="sm" variant="primary" loading={pending} onClick={() => convert(conversionFromSuggestion(item.suggestion, item.content, today))}>
          <Check /> Accept
        </Button>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          <Wand2 /> {open ? "Close" : "Edit & convert"}
        </Button>
        <Button size="sm" variant="ghost" onClick={discard} disabled={pending}>
          <Trash2 /> Discard
        </Button>
      </div>
      {open ? (
        <div className="ml-6 mt-3 flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-3">
          <ConversionEditor value={conv} onChange={setConv} projects={projects} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" loading={pending} disabled={!conv.title.trim()} onClick={() => convert(conv)}>
              Create {ENTITY_LABEL[conv.destination].toLowerCase()}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function InboxList({ items, projects, today }: { items: Item[]; projects: Option[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const ids = [...selected].filter((id) => items.some((i) => i.id === id));
  const all = ids.length === items.length && items.length > 0;
  const bulk = (kind: "accept" | "discard") =>
    start(async () => {
      const r = kind === "accept" ? await bulkAcceptAction(ids) : await discardInboxAction(ids);
      if (r.ok) {
        toast.success(kind === "accept" ? `Filed ${r.data?.count ?? 0} items` : `Discarded ${r.data?.count ?? 0} items`);
        setSelected(new Set());
      } else toast.error(r.error);
    });
  return (
    <div>
      <div className="sticky top-12 z-10 -mx-1 mb-1 flex flex-wrap items-center gap-2 border-b border-border bg-bg/95 px-1 py-2 backdrop-blur lg:top-0">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={all} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} className="size-3.5 accent-[var(--accent)]" />
          {ids.length ? `${ids.length} selected` : "Select all"}
        </label>
        {ids.length ? (
          <>
            <Button size="sm" variant="primary" loading={pending} onClick={() => bulk("accept")}>
              Accept suggestions
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => bulk("discard")}>
              Discard
            </Button>
          </>
        ) : null}
      </div>
      <ul>
        {items.map((i) => (
          <InboxRow
            key={i.id}
            item={i}
            projects={projects}
            today={today}
            selected={selected.has(i.id)}
            onSelect={(v) => {
              const next = new Set(selected);
              if (v) next.add(i.id);
              else next.delete(i.id);
              setSelected(next);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

export function RestoreButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await restoreInboxAction(id);
          if (r.ok) toast.success("Back in your inbox");
          else toast.error(r.error);
        })
      }
    >
      Restore
    </Button>
  );
}
