"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createNoteAction } from "@/actions/notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewNoteButton({ collection }: { collection?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("title", "Untitled note");
          fd.set("content", "");
          if (collection) fd.set("collection", collection);
          const r = await createNoteAction(null, fd);
          if (r.ok && r.redirectTo) router.push(r.redirectTo);
          else if (!r.ok) toast.error(r.error);
        })
      }
    >
      <Plus /> New note
    </Button>
  );
}

export function NoteSearch({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/notes?q=${encodeURIComponent(q.trim())}` : "/notes");
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter notes…" className="pl-8" aria-label="Filter notes" />
    </form>
  );
}
