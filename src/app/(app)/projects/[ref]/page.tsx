import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listEvents } from "@/server/engines/activity";
import { listRelated } from "@/server/engines/relations";
import { getProjectByRef } from "@/server/services/projects";
import { listTasks } from "@/server/services/tasks";
import { getEntityOptions } from "@/server/services/options";
import { evaluateTargets } from "@/server/services/targets";
import { formatMinutes } from "@/lib/domain/dates";
import { relativeDay, shortDate } from "@/lib/ui/format";
import { Page, PageHeader, Section, Tabs } from "@/components/ui/layout";
import { ProgressExplained } from "@/components/ui/progress";
import { Ref } from "@/components/ui/badge";
import { ActivityList } from "@/components/entities/activity-list";
import { LinksPanel } from "@/components/entities/links-panel";
import { Markdown } from "@/components/entities/markdown";
import { MilestoneList } from "@/components/entities/milestone-list";
import { StatusBadge } from "@/components/entities/status";
import { TargetLine } from "@/components/entities/target-card";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { NewDecisionButton, NewTargetButton } from "../../_components/create-buttons";
import { ProjectActions } from "./project-client";

export async function generateMetadata(props: PageProps<"/projects/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function ProjectDetailPage(props: PageProps<"/projects/[ref]">) {
  const { ref } = await props.params;
  const sp = await props.searchParams;
  const tab = ["overview", "tasks", "decisions", "activity"].includes(String(sp.tab)) ? String(sp.tab) : "overview";
  const { actor } = await requireUser();
  const data = await getProjectByRef(actor, ref);
  if (!data) notFound();
  const { project: p, milestones, decisions, progress, minutes } = data;
  const [options, related, events, openTasks, doneTasks, targets] = await Promise.all([
    getEntityOptions(actor),
    listRelated(actor.userId, { type: "project", id: p.id }),
    listEvents(actor.userId, { entity: { type: "project", id: p.id }, limit: 30 }),
    listTasks(actor, { view: "all", projectId: p.id }),
    tab === "tasks" ? listTasks(actor, { view: "completed", projectId: p.id, limit: 50 }) : Promise.resolve([]),
    evaluateTargets(actor, { projectId: p.id }),
  ]);
  const base = `/projects/${p.ref}`;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/projects" className="hover:text-fg">Projects</Link>
            <span>/</span>
            <Ref>{p.ref}</Ref>
            <StatusBadge status={p.status} label={p.status === "on_hold" ? "On hold" : undefined} />
          </>
        }
        title={p.title}
        description={p.summary ?? undefined}
        actions={<ProjectActions project={p} tags={data.tags} options={options} />}
      />
      <ProgressExplained percent={progress.percent} explanation={progress.explanation} className="mb-6" />
      <Tabs
        current={tab}
        items={[
          { key: "overview", label: "Overview", href: base },
          { key: "tasks", label: "Tasks", href: `${base}?tab=tasks`, count: openTasks.length },
          { key: "decisions", label: "Decisions", href: `${base}?tab=decisions`, count: decisions.length },
          { key: "activity", label: "Activity", href: `${base}?tab=activity` },
        ]}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-10">
          {tab === "overview" ? (
            <>
              {p.description ? <Markdown content={p.description} /> : null}
              <Section title="Milestones" description={p.progressMode === "milestones" ? "Weighted; unfinished milestones earn partial credit from their tasks." : "Progress is measured by tasks for this project."}>
                <MilestoneList milestones={milestones} owner={{ projectId: p.id }} today={options.today} />
              </Section>
              <Section title="Next tasks" action={<Link href={`${base}?tab=tasks`} className="text-xs text-fg-muted hover:text-fg">All tasks</Link>}>
                <div>
                  {openTasks.length ? <TaskList tasks={openTasks.slice(0, 8)} today={options.today} showProject={false} compact /> : null}
                  <QuickAddTask extras={{ projectId: p.id }} placeholder="Add a task to this project…" />
                </div>
              </Section>
              {decisions.length ? (
                <Section title="Recent decisions" action={<Link href={`${base}?tab=decisions`} className="text-xs text-fg-muted hover:text-fg">Decision log</Link>}>
                  <ul className="flex flex-col">
                    {decisions.slice(0, 3).map((d) => (
                      <li key={d.id} className="py-1.5 text-[13px]">
                        <span className="text-fg">{d.decision}</span>
                        <span className="text-fg-subtle"> · {shortDate(d.decidedOn, true)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === "tasks" ? (
            <>
              <Section title="Open">
                <div>
                  {openTasks.length ? <TaskList tasks={openTasks} today={options.today} showProject={false} /> : null}
                  <QuickAddTask extras={{ projectId: p.id }} placeholder="Add a task to this project…" />
                </div>
              </Section>
              {doneTasks.length ? (
                <Section title="Completed">
                  <TaskList tasks={doneTasks} today={options.today} showProject={false} compact />
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === "decisions" ? (
            <Section title="Decision log" action={<NewDecisionButton options={options} projectId={p.id} variant="ghost" />}>
              {decisions.length ? (
                <ul className="flex flex-col gap-4">
                  {decisions.map((d) => (
                    <li key={d.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-medium">{d.title}</p>
                        <span className="flex items-center gap-2">
                          {d.status !== "active" ? <StatusBadge status={d.status} /> : null}
                          <Ref>{d.ref}</Ref>
                        </span>
                      </div>
                      <p className="mt-2 text-[14px]">{d.decision}</p>
                      {d.context ? <p className="mt-2 text-[13px] text-fg-muted"><span className="text-fg-subtle">Reason — </span>{d.context}</p> : null}
                      {d.alternatives ? <p className="mt-1 text-[13px] text-fg-muted"><span className="text-fg-subtle">Alternatives — </span>{d.alternatives}</p> : null}
                      <p className="mt-2 text-[11px] text-fg-subtle">{shortDate(d.decidedOn, true)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-fg-muted">No decisions recorded. Capture important choices (and why) so you can find them later.</p>
              )}
            </Section>
          ) : null}

          {tab === "activity" ? (
            <Section title="Activity">
              {events.length ? <ActivityList events={events} timezone={actor.timezone} showDate /> : <p className="text-xs text-fg-subtle">No activity yet.</p>}
            </Section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-8">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-fg-subtle">Goal</dt>
            <dd className="truncate">{data.goalRef ? <Link href={`/goals/${data.goalRef}`} className="hover:underline">{data.goalTitle}</Link> : "—"}</dd>
            <dt className="text-fg-subtle">Life area</dt>
            <dd>{data.lifeAreaName ?? "—"}</dd>
            <dt className="text-fg-subtle">Priority</dt>
            <dd className="capitalize">{p.priority}</dd>
            <dt className="text-fg-subtle">Target</dt>
            <dd>{p.targetDate ? relativeDay(p.targetDate, options.today) : "—"}</dd>
            <dt className="text-fg-subtle">Time spent</dt>
            <dd>{minutes.minutes ? `${formatMinutes(minutes.minutes)} · ${minutes.count} sessions` : "—"}</dd>
            {data.sourceIdea ? (
              <>
                <dt className="text-fg-subtle">From idea</dt>
                <dd className="truncate"><Link href={`/ideas/${data.sourceIdea.ref}`} className="hover:underline">{data.sourceIdea.title}</Link></dd>
              </>
            ) : null}
            {data.tags.length ? (
              <>
                <dt className="text-fg-subtle">Tags</dt>
                <dd className="text-fg-muted">{data.tags.map((t) => `#${t}`).join(" ")}</dd>
              </>
            ) : null}
          </dl>
          <Section title="Targets" action={<NewTargetButton options={options} defaults={{ projectId: p.id, unit: "hours", period: "weekly" }} variant="ghost" label="Add" />}>
            {targets.length ? targets.map((t) => <TargetLine key={t.id} target={t} />) : <p className="text-xs text-fg-subtle">E.g. 5 hours/week on this project.</p>}
          </Section>
          <Section title="Linked">
            <LinksPanel source={{ type: "project", id: p.id }} related={related} />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
