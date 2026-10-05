import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listEvents } from "@/server/engines/activity";
import { listRelated } from "@/server/engines/relations";
import { getGoalByRef } from "@/server/services/goals";
import { listTasks } from "@/server/services/tasks";
import { getEntityOptions } from "@/server/services/options";
import { formatMinutes } from "@/lib/domain/dates";
import { relativeDay } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { ProgressBar, ProgressExplained } from "@/components/ui/progress";
import { Ref } from "@/components/ui/badge";
import { ActivityList } from "@/components/entities/activity-list";
import { LinksPanel } from "@/components/entities/links-panel";
import { StatusBadge } from "@/components/entities/status";
import { TargetLine } from "@/components/entities/target-card";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { MilestoneList } from "@/components/entities/milestone-list";
import { NewTargetButton } from "../../_components/create-buttons";
import { GoalActions } from "./goal-client";

export async function generateMetadata(props: PageProps<"/goals/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function GoalDetailPage(props: PageProps<"/goals/[ref]">) {
  const { ref } = await props.params;
  const { actor } = await requireUser();
  const data = await getGoalByRef(actor, ref);
  if (!data) notFound();
  const { goal, milestones, targets, projects, progress, minutes } = data;
  const [options, related, events, tasks] = await Promise.all([
    getEntityOptions(actor),
    listRelated(actor.userId, { type: "goal", id: goal.id }),
    listEvents(actor.userId, { entity: { type: "goal", id: goal.id }, limit: 20 }),
    listTasks(actor, { view: "all", goalId: goal.id }),
  ]);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/goals" className="hover:text-fg">Goals</Link>
            <span>/</span>
            <Ref>{goal.ref}</Ref>
            <StatusBadge status={goal.status} />
          </>
        }
        title={goal.title}
        description={[data.lifeAreaName, goal.targetDate ? `Target ${relativeDay(goal.targetDate, options.today)} (${goal.targetDate})` : null].filter(Boolean).join(" · ") || undefined}
        actions={<GoalActions goal={goal} options={options} />}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <ProgressExplained percent={progress.percent} explanation={progress.explanation} />
          {goal.why ? (
            <blockquote className="border-l-2 border-accent pl-4 text-[14px] leading-relaxed text-fg">
              <p className="mb-1 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Why</p>
              {goal.why}
            </blockquote>
          ) : null}
          {goal.description ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg-muted">{goal.description}</p> : null}

          <Section title="Milestones" description={goal.progressMode === "milestones" ? "Progress = weighted milestones (partial credit from linked tasks)." : "Shown for planning; progress is measured by targets."}>
            <MilestoneList milestones={milestones} owner={{ goalId: goal.id }} today={options.today} />
          </Section>

          <Section title="Targets" description={goal.progressMode === "targets" ? "Progress = average of these targets in their current period." : undefined} action={<NewTargetButton options={options} defaults={{ goalId: goal.id }} variant="ghost" label="Add target" />}>
            {targets.length ? (
              <div className="flex flex-col divide-y divide-border">
                {targets.map((t) => (
                  <TargetLine key={t.id} target={t} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-fg-subtle">No targets measure this goal yet.</p>
            )}
          </Section>

          <Section title="Projects advancing this goal">
            {projects.length ? (
              <ul className="flex flex-col gap-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.ref}`} className="group flex flex-col gap-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="group-hover:underline">{p.title}</span>
                        <span className="tabular text-xs text-fg-muted">{p.progress.percent === null ? "—" : `${Math.round(p.progress.percent)}%`}</span>
                      </div>
                      <ProgressBar value={p.progress.percent} label={`${p.title} progress`} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">Link a project to this goal from the project&apos;s settings.</p>
            )}
          </Section>

          <Section title="Tasks">
            <div>
              {tasks.length ? <TaskList tasks={tasks} today={options.today} compact /> : null}
              <QuickAddTask extras={{ goalId: goal.id }} placeholder="Add a task for this goal…" />
            </div>
          </Section>

          <Section title="History">
            {events.length ? <ActivityList events={events} timezone={actor.timezone} showDate /> : <p className="text-xs text-fg-subtle">No history yet.</p>}
          </Section>
        </div>
        <aside className="flex flex-col gap-8">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-fg-subtle">Priority</dt>
            <dd className="capitalize">{goal.priority}</dd>
            <dt className="text-fg-subtle">Started</dt>
            <dd>{goal.startDate ?? "—"}</dd>
            <dt className="text-fg-subtle">Time invested</dt>
            <dd>{minutes.minutes ? formatMinutes(minutes.minutes) : "—"}</dd>
            <dt className="text-fg-subtle">Measured by</dt>
            <dd>{goal.progressMode === "targets" ? "Linked targets" : "Weighted milestones"}</dd>
          </dl>
          <Section title="Linked">
            <LinksPanel source={{ type: "goal", id: goal.id }} related={related} />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
