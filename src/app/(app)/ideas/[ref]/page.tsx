import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listEvents } from "@/server/engines/activity";
import { listRelated } from "@/server/engines/relations";
import { getIdeaByRef } from "@/server/services/projects";
import { getEntityOptions } from "@/server/services/options";
import { IDEA_STATUSES } from "@/lib/domain/constants";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { Ref } from "@/components/ui/badge";
import { ActivityList } from "@/components/entities/activity-list";
import { LinksPanel } from "@/components/entities/links-panel";
import { Markdown } from "@/components/entities/markdown";
import { IdeaActions, IdeaStagePicker } from "./idea-client";

export async function generateMetadata(props: PageProps<"/ideas/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function IdeaDetailPage(props: PageProps<"/ideas/[ref]">) {
  const { ref } = await props.params;
  const { actor } = await requireUser();
  const idea = await getIdeaByRef(actor, ref);
  if (!idea) notFound();
  const [options, related, events] = await Promise.all([
    getEntityOptions(actor),
    listRelated(actor.userId, { type: "idea", id: idea.id }),
    listEvents(actor.userId, { entity: { type: "idea", id: idea.id }, limit: 20 }),
  ]);
  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/ideas" className="hover:text-fg">Ideas</Link>
            <span>/</span>
            <Ref>{idea.ref}</Ref>
          </>
        }
        title={idea.title}
        description={[idea.category, idea.lifeAreaName].filter(Boolean).join(" · ") || undefined}
        actions={<IdeaActions idea={idea} tags={idea.tags} options={options} />}
      />
      <IdeaStagePicker id={idea.id} status={idea.status} stages={IDEA_STATUSES} />
      {idea.projectRef ? (
        <p className="mt-4 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-[13px]">
          Converted into project{" "}
          <Link href={`/projects/${idea.projectRef}`} className="font-medium text-accent hover:underline">
            {idea.projectTitle} ({idea.projectRef})
          </Link>
          . The idea stays here as its origin.
        </p>
      ) : null}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section title="Description">
            {idea.description ? <Markdown content={idea.description} /> : <p className="text-[13px] text-fg-muted">No description yet. Who is it for, what problem does it solve, what would an MVP be?</p>}
          </Section>
          <Section title="History">
            {events.length ? <ActivityList events={events} timezone={actor.timezone} showDate /> : <p className="text-xs text-fg-subtle">No history yet.</p>}
          </Section>
        </div>
        <aside className="flex flex-col gap-8">
          {idea.tags.length ? (
            <Section title="Tags">
              <div className="flex flex-wrap gap-2 text-[13px] text-fg-muted">
                {idea.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </Section>
          ) : null}
          <Section title="Linked">
            <LinksPanel source={{ type: "idea", id: idea.id }} related={related} />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
