import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listEvents } from "@/server/engines/activity";
import { listRelated } from "@/server/engines/relations";
import { getTaskByRef, listOpenTaskOptions } from "@/server/services/tasks";
import { listSessions } from "@/server/services/sessions";
import { getEntityOptions } from "@/server/services/options";
import { formatMinutes } from "@/lib/domain/dates";
import { describeRecurrence } from "@/lib/domain/recurrence";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { Ref } from "@/components/ui/badge";
import { ActivityList } from "@/components/entities/activity-list";
import { LinksPanel } from "@/components/entities/links-panel";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { DueBadge } from "@/components/entities/due-badge";
import { PriorityBadge, StatusBadge } from "@/components/entities/status";
import { TaskDetailActions, DependencyEditor } from "./task-detail-client";

export async function generateMetadata(props: PageProps<"/tasks/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function TaskDetailPage(props: PageProps<"/tasks/[ref]">) {
  const { ref } = await props.params;
  const { actor } = await requireUser();
  const data = await getTaskByRef(actor, ref);
  if (!data) notFound();
  const { task, context, parent, subtasks, blockers, blocking, actualMinutes } = data;
  const [options, related, events, sessions, taskOptions] = await Promise.all([
    getEntityOptions(actor),
    listRelated(actor.userId, { type: "task", id: task.id }),
    listEvents(actor.userId, { entity: { type: "task", id: task.id }, limit: 30 }),
    listSessions(actor, { taskId: task.id, limit: 20 }),
    listOpenTaskOptions(actor, task.id),
  ]);
  const today = options.today;
  const meta: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={task.status} label={task.status === "todo" ? "To do" : undefined} />],
    ["Priority", task.priority === "none" ? <span key="p" className="text-fg-subtle">None</span> : <PriorityBadge key="p" priority={task.priority} />],
    ["Due", task.dueDate ? <DueBadge key="d" date={task.dueDate} today={today} done={task.status === "done"} /> : <span key="d" className="text-fg-subtle">{task.someday ? "Someday" : "—"}</span>],
    ["Repeats", task.recurrence ? describeRecurrence(task.recurrence) : "—"],
    ["Estimate", task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : "—"],
    ["Actual", actualMinutes ? `${formatMinutes(actualMinutes)} across ${data.sessionCount} session${data.sessionCount === 1 ? "" : "s"}` : "—"],
    ["Project", context?.projectRef ? <Link key="pr" href={`/projects/${context.projectRef}`} className="hover:underline">{context.projectTitle}</Link> : "—"],
    ["Milestone", context?.milestoneTitle ?? "—"],
    ["Goal", context?.goalRef ? <Link key="g" href={`/goals/${context.goalRef}`} className="hover:underline">{context.goalTitle}</Link> : "—"],
    ["Skill", context?.skillRef ? <Link key="sk" href={`/skills/${context.skillRef}`} className="hover:underline">{context.skillName}</Link> : "—"],
    ["Life area", context?.lifeAreaName ?? "—"],
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/tasks" className="hover:text-fg">Tasks</Link>
            {parent ? (
              <>
                <span>/</span>
                <Link href={`/tasks/${parent.ref}`} className="hover:text-fg">{parent.title}</Link>
              </>
            ) : null}
            <span>/</span>
            <Ref>{task.ref}</Ref>
          </>
        }
        title={<span className={task.status === "done" ? "text-fg-muted line-through decoration-1" : undefined}>{task.title}</span>}
        actions={<TaskDetailActions task={task} options={options} />}
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-8">
          {task.blocked ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning">
              Blocked — waiting on {task.openBlockerRefs.join(", ")}. It can still be completed, but probably shouldn&apos;t be started yet.
            </p>
          ) : null}
          {task.description ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">{task.description}</p> : null}

          {!task.parentTaskId ? (
            <Section title={`Subtasks${subtasks.length ? ` · ${subtasks.filter((s) => s.status === "done").length}/${subtasks.filter((s) => s.status !== "cancelled").length}` : ""}`}>
              <div>
                {subtasks.length ? <TaskList tasks={subtasks.map((s) => ({ ...s }))} today={today} showProject={false} compact /> : null}
                <QuickAddTask extras={{ parentTaskId: task.id }} placeholder="Add a subtask…" />
              </div>
            </Section>
          ) : null}

          <Section title="Dependencies" description="Learn Coroutines → Learn Ktor → Build API: a task waits until its blockers are done.">
            <DependencyEditor taskId={task.id} blockers={blockers} blocking={blocking} options={taskOptions} />
          </Section>

          <Section title="Sessions on this task">
            {sessions.length ? (
              <ul className="flex flex-col">
                {sessions.map(({ session: s }) => (
                  <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
                    <span className="w-20 shrink-0 text-xs text-fg-subtle">{s.localDate}</span>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="tabular text-xs text-fg-muted">{s.durationMinutes ? formatMinutes(s.durationMinutes) : `${s.quantity} ${s.unit}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">No time logged yet. Logged time counts toward this task&apos;s project and skill targets.</p>
            )}
          </Section>

          <Section title="History">
            {events.length ? <ActivityList events={events} timezone={actor.timezone} showDate /> : <p className="text-xs text-fg-subtle">No history yet.</p>}
          </Section>
        </div>
        <aside className="flex flex-col gap-8">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            {meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="min-w-0 truncate text-fg">{v}</dd>
              </div>
            ))}
            {task.tags.length ? (
              <div className="contents">
                <dt className="text-fg-subtle">Tags</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {task.tags.map((t) => (
                    <Link key={t} href={`/tasks?view=all&tag=${t}`} className="text-fg-muted hover:text-fg">#{t}</Link>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
          <Section title="Linked">
            <LinksPanel source={{ type: "task", id: task.id }} related={related} />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
