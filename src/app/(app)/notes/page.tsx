import Link from "next/link";
import { FileText, Pin, X } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listCollections, listNotes } from "@/server/services/notes";
import { relativeDay } from "@/lib/ui/format";
import { localDateInTz } from "@/lib/domain/dates";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";
import { NewNoteButton, NoteSearch } from "./notes-client";

export const metadata = { title: "Notes" };

export default async function NotesPage(props: PageProps<"/notes">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "archived" ? "archived" : sp.view === "trash" ? "trash" : "active";
  const collection = typeof sp.collection === "string" ? sp.collection : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const [notes, collections] = await Promise.all([listNotes(actor, { view, collection, tag, q }), listCollections(actor.userId)]);
  const today = localDateInTz(actor.timezone);

  return (
    <Page width="wide" className="max-w-6xl">
      <PageHeader title="Notes" description="Your second brain. Write in Markdown, link anything with [[REF]] (e.g. [[PRJ-0001]]) and get backlinks automatically." actions={<NewNoteButton collection={collection} />} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        <aside className="flex flex-col gap-4">
          <NoteSearch initial={q ?? ""} />
          <nav className="flex flex-row flex-wrap gap-1 lg:flex-col" aria-label="Collections">
            <Link href="/notes" className={cn("rounded-md px-2.5 py-1.5 text-[13px]", !collection && view === "active" ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
              All notes
            </Link>
            {collections.map((c) => (
              <Link key={c.name} href={`/notes?collection=${encodeURIComponent(c.name)}`} className={cn("flex justify-between rounded-md px-2.5 py-1.5 text-[13px]", collection === c.name ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
                <span className="truncate">{c.name}</span>
                <span className="tabular text-[11px] text-fg-subtle">{c.count}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Tabs
            current={view}
            items={[
              { key: "active", label: "Notes", href: collection ? `/notes?collection=${encodeURIComponent(collection)}` : "/notes" },
              { key: "archived", label: "Archived", href: "/notes?view=archived" },
              { key: "trash", label: "Trash", href: "/notes?view=trash" },
            ]}
          />
          {tag ? (
            <p className="mb-3 flex items-center gap-2 text-[13px] text-fg-muted">
              Tagged #{tag}
              <Link href="/notes" className="inline-flex items-center gap-1 text-xs hover:text-fg"><X className="size-3" /> clear</Link>
            </p>
          ) : null}
          {notes.length ? (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={`/notes/${n.ref}`} className="flex h-full flex-col gap-1.5 rounded-[10px] border border-border p-4 transition-colors hover:border-border-strong hover:bg-bg-subtle">
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-1 text-[14px] font-medium">{n.title}</span>
                      {n.pinned ? <Pin className="size-3.5 shrink-0 text-accent" aria-label="Pinned" /> : null}
                    </div>
                    <p className="line-clamp-3 text-[13px] leading-relaxed text-fg-muted">{n.excerpt || <span className="text-fg-subtle">Empty note</span>}</p>
                    <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-fg-subtle">
                      <span>{relativeDay(localDateInTz(actor.timezone, n.updatedAt), today)}</span>
                      {n.collection ? <span>· {n.collection}</span> : null}
                      {n.tags.length ? <span className="truncate">· {n.tags.map((t) => `#${t}`).join(" ")}</span> : null}
                      <Ref className="ml-auto">{n.ref}</Ref>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={FileText} title={q ? `No notes match “${q}”` : view === "trash" ? "Trash is empty" : "No notes yet"} description="Capture concepts, research, snippets and project knowledge. Mention any item with [[REF]].">
              {view === "active" && !q ? <NewNoteButton collection={collection} /> : null}
            </EmptyState>
          )}
        </div>
      </div>
    </Page>
  );
}
