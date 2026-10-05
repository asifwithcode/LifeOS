import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { search } from "@/server/engines/search";
import { ENTITY_LABEL, ENTITY_TYPES, type EntityType } from "@/lib/domain/constants";
import { Page, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";

export const metadata = { title: "Search" };

const SEARCHABLE: EntityType[] = ["task", "project", "goal", "target", "idea", "note", "skill", "decision", "routine_item"];

function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function SearchPage(props: PageProps<"/search">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const type = (ENTITY_TYPES as readonly string[]).includes(String(sp.type)) ? (sp.type as EntityType) : undefined;
  const includeArchived = sp.archived === "1";
  const hits = q ? await search(actor.userId, q, { limit: 60, types: type ? [type] : undefined, includeArchived }) : [];
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { q, type, archived: includeArchived ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/search?${p}`;
  };
  return (
    <Page width="narrow">
      <PageHeader title="Search" description="Full-text search across tasks, projects, goals, ideas, notes, skills and decisions. Semantic search arrives with the AI Brain (Phase 2)." />
      <form role="search" action="/search" className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <Input name="q" defaultValue={q} autoFocus placeholder="Search everything, or type a ref like PRJ-0001" className="h-10 pl-9 text-[14px]" aria-label="Search" />
        {type ? <input type="hidden" name="type" value={type} /> : null}
      </form>
      <nav className="mb-6 flex flex-wrap gap-1 text-[13px]" aria-label="Filter by type">
        <Link href={href({ type: undefined })} className={cn("rounded-md px-2.5 py-1", !type ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>All</Link>
        {SEARCHABLE.map((t) => (
          <Link key={t} href={href({ type: t })} className={cn("rounded-md px-2.5 py-1", type === t ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
            {ENTITY_LABEL[t]}s
          </Link>
        ))}
        <Link href={href({ archived: includeArchived ? undefined : "1" })} className="ml-auto rounded-md px-2.5 py-1 text-fg-muted hover:bg-bg-subtle">
          {includeArchived ? "✓ " : ""}Include done & archived
        </Link>
      </nav>
      {!q ? (
        <p className="text-[13px] text-fg-muted">Tip: press ⌘K anywhere for instant search and commands.</p>
      ) : hits.length ? (
        <ul className="flex flex-col">
          {hits.map((h) => (
            <li key={`${h.entityType}:${h.entityId}`} className="border-b border-border last:border-b-0">
              <Link href={h.urlPath} className="flex flex-col gap-0.5 py-3 hover:bg-bg-subtle">
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[11px] text-fg-subtle">{ENTITY_LABEL[h.entityType]}</span>
                  <span className={cn("flex-1 truncate text-[13px] font-medium", h.archived && "text-fg-muted")}>{h.title}</span>
                  {h.ref ? <Ref>{h.ref}</Ref> : null}
                </div>
                {h.snippet ? (
                  <p className="line-clamp-2 pl-[92px] text-xs text-fg-muted">
                    <Snippet text={h.snippet} />
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={SearchIcon} title={`Nothing found for “${q}”`} description="Try fewer words, a prefix (“esp” finds “ESP32”), or include done & archived items." />
      )}
    </Page>
  );
}
