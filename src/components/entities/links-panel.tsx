"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { linkEntityAction, unlinkAction } from "@/actions/relations";
import { ENTITY_LABEL, type EntityType } from "@/lib/domain/constants";
import type { RelatedItem } from "@/server/engines/relations";
import { Ref } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Hit {
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
}

const REL_LABEL: Record<string, string> = { mentions: "mentions", derived_from: "derived from", supports: "supports", part_of: "part of", related: "related" };

/** Generic "connected items" panel backed by entity_relations (both directions). */
export function LinksPanel({ source, related }: { source: { type: EntityType; id: string }; related: RelatedItem[] }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!adding || q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
      if (res.ok) setHits(((await res.json()).hits as Hit[]).filter((h) => !(h.entityType === source.type && h.entityId === source.id)));
    }, 150);
    return () => clearTimeout(t);
  }, [q, adding, source.type, source.id]);

  const visibleHits = adding && q.trim().length >= 2 ? hits : [];

  const add = (ref: string) =>
    start(async () => {
      const r = await linkEntityAction({ sourceType: source.type, sourceId: source.id, targetRef: ref, relationType: "related" });
      if (r.ok) {
        setQ("");
        setAdding(false);
        toast.success("Linked");
      } else toast.error(r.error);
    });

  const remove = (relationId: string) =>
    start(async () => {
      const r = await unlinkAction(relationId);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-1">
      {related.length === 0 && !adding ? <p className="py-1 text-xs text-fg-subtle">Nothing linked yet. Link notes, ideas, goals or anything else that relates.</p> : null}
      <ul className="flex flex-col">
        {related.map((r) => (
          <li key={r.relationId} className="group flex items-center gap-2 py-1 text-[13px]">
            <Link2 className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
            <Link href={r.urlPath} className="min-w-0 flex-1 truncate text-fg hover:underline hover:underline-offset-2" title={`${ENTITY_LABEL[r.entityType]} · ${r.title}`}>
              {r.title}
            </Link>
            <span className="shrink-0 text-[11px] text-fg-subtle">
              {r.relationType === "related" ? ENTITY_LABEL[r.entityType] : r.direction === "incoming" && r.relationType === "mentions" ? `${ENTITY_LABEL[r.entityType]} · mentions this` : REL_LABEL[r.relationType]}
            </span>
            {r.ref ? <Ref className="shrink-0">{r.ref}</Ref> : null}
            {r.relationType !== "mentions" ? (
              <button type="button" onClick={() => remove(r.relationId)} disabled={pending} className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-fg group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Unlink ${r.title}`}>
                <X className="size-3" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="relative mt-1">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or ref (e.g. PRJ-0001)…" onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
          {visibleHits.length > 0 ? (
            <ul className="absolute inset-x-0 top-9 z-20 rounded-lg border border-border bg-bg-elevated p-1 shadow-float">
              {visibleHits.map((h) => (
                <li key={h.entityId}>
                  <button type="button" disabled={!h.ref || pending} onClick={() => h.ref && add(h.ref)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-bg-muted disabled:opacity-50">
                    <span className="w-14 shrink-0 text-[11px] text-fg-subtle">{ENTITY_LABEL[h.entityType]}</span>
                    <span className="flex-1 truncate">{h.title}</span>
                    {h.ref ? <Ref>{h.ref}</Ref> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-1 self-start" onClick={() => setAdding(true)}>
          <Plus /> Link item
        </Button>
      )}
    </div>
  );
}
