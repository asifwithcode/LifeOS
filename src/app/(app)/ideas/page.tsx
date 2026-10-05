import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listIdeas } from "@/server/services/projects";
import { getEntityOptions } from "@/server/services/options";
import { IDEA_STATUSES } from "@/lib/domain/constants";
import { titleCase } from "@/lib/ui/format";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { StatusBadge } from "@/components/entities/status";
import { NewIdeaButton } from "../_components/create-buttons";

export const metadata = { title: "Ideas" };

const PIPELINE = IDEA_STATUSES.filter((s) => s !== "archived");

export default async function IdeasPage(props: PageProps<"/ideas">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "archived" ? "archived" : sp.view === "trash" ? "trash" : "pipeline";
  const [ideas, options] = await Promise.all([
    listIdeas(actor, view === "archived" ? { status: "archived" } : view === "trash" ? { trash: true } : {}),
    getEntityOptions(actor),
  ]);
  return (
    <Page width="wide">
      <PageHeader title="Idea Vault" description="Captured → Exploring → Researching → Validated → Planned → Building. Convert any idea into a project without losing it." actions={<NewIdeaButton options={options} defaultOpen={sp.new === "1"} />} />
      <Tabs
        current={view}
        items={[
          { key: "pipeline", label: "Pipeline", href: "/ideas", count: view === "pipeline" ? ideas.length : undefined },
          { key: "archived", label: "Archived", href: "/ideas?view=archived" },
          { key: "trash", label: "Trash", href: "/ideas?view=trash" },
        ]}
      />
      {ideas.length === 0 ? (
        <EmptyState icon={Lightbulb} title={view === "pipeline" ? "No ideas yet" : "Nothing here"} description="Capture ideas the moment they appear — refine them later, and turn the good ones into projects.">
          {view === "pipeline" ? <NewIdeaButton options={options} /> : null}
        </EmptyState>
      ) : view === "pipeline" ? (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {PIPELINE.map((status) => {
            const col = ideas.filter((i) => i.status === status);
            return (
              <section key={status} className="flex w-64 shrink-0 flex-col gap-2" aria-label={titleCase(status)}>
                <h2 className="flex items-center justify-between px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
                  {titleCase(status)} <span className="tabular">{col.length}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {col.map((i) => (
                    <li key={i.id}>
                      <Link href={`/ideas/${i.ref}`} className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg p-3 transition-colors hover:border-border-strong hover:bg-bg-subtle">
                        <span className="line-clamp-2 text-[13px] font-medium leading-5">{i.title}</span>
                        {i.description ? <span className="line-clamp-2 text-xs text-fg-muted">{i.description}</span> : null}
                        <span className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
                          <span className="truncate">{i.projectRef ? `→ ${i.projectRef}` : (i.category ?? i.tags.map((t) => `#${t}`).join(" "))}</span>
                          <Ref>{i.ref}</Ref>
                        </span>
                      </Link>
                    </li>
                  ))}
                  {col.length === 0 ? <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-fg-subtle">Empty</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="flex flex-col">
          {ideas.map((i) => (
            <li key={i.id} className="flex items-center gap-3 border-b border-border py-2.5 text-[13px]">
              <Link href={`/ideas/${i.ref}`} className="flex-1 truncate hover:underline">{i.title}</Link>
              <StatusBadge status={i.status} />
              <Ref>{i.ref}</Ref>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
