import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { todayOf } from "@/server/engines/actor";
import { getRoutineDay, listTemplates } from "@/server/services/routine";
import { evaluateTargets } from "@/server/services/targets";
import { listTasks, completedTasksInRange } from "@/server/services/tasks";
import { listSessions } from "@/server/services/sessions";
import { listAdjustments } from "@/server/services/adjustments";
import { PlannedBlocks } from "@/components/ai/planned-blocks";
import { todayProgress } from "@/lib/domain/progress";
import { addDays, compareISO, formatMinutes, isISODate } from "@/lib/domain/dates";
import { longDate, relativeDay } from "@/lib/ui/format";
import { Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { ProgressExplained } from "@/components/ui/progress";
import { RoutineTimeline } from "@/components/entities/routine-timeline";
import { TargetLine } from "@/components/entities/target-card";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { LogSessionButton } from "../_components/shell-buttons";
import { DayTemplateSwitcher, DeleteSessionButton } from "./today-client";

export const metadata = { title: "Today" };

export default async function TodayPage(props: PageProps<"/today">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const realToday = todayOf(actor);
  const date = typeof sp.date === "string" && isISODate(sp.date) ? sp.date : realToday;
  const isToday = date === realToday;
  const isFuture = compareISO(date, realToday) > 0;

  const [routine, templates, daily, dueTasks, overdue, sessions, completed, planned] = await Promise.all([
    getRoutineDay(actor, date),
    listTemplates(actor.userId),
    evaluateTargets(actor, { period: "daily", today: date }),
    isToday ? listTasks(actor, { view: "today" }) : Promise.resolve([]),
    isToday ? listTasks(actor, { view: "overdue" }) : Promise.resolve([]),
    listSessions(actor, { from: date, to: date, limit: 50 }),
    completedTasksInRange(actor, date, date),
    listAdjustments(actor.userId, date),
  ]);
  const progress = todayProgress(daily.map((t) => t.evaluation.percent), { done: routine.doneCount, scheduled: routine.slots.length });
  const minutes = sessions.reduce((s, r) => s + (r.session.durationMinutes ?? 0), 0);
  const todayTasks = dueTasks.filter((t) => !overdue.some((o) => o.id === t.id));

  return (
    <Page>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-1">
            <Link href={`/today?date=${addDays(date, -1)}`} className="grid size-6 place-items-center rounded hover:bg-bg-muted" aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </Link>
            <span>{relativeDay(date, realToday)}</span>
            <Link href={`/today?date=${addDays(date, 1)}`} className="grid size-6 place-items-center rounded hover:bg-bg-muted" aria-label="Next day">
              <ChevronRight className="size-4" />
            </Link>
            {!isToday ? (
              <Link href="/today" className="ml-1 text-accent hover:underline">
                Back to today
              </Link>
            ) : null}
          </div>
        }
        title={longDate(date)}
        actions={<LogSessionButton variant="primary" />}
      />

      <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Progress" value={progress.percent === null ? "—" : `${Math.round(progress.percent)}%`} />
        <Stat label="Time logged" value={formatMinutes(minutes)} />
        <Stat label="Routine" value={routine.slots.length ? `${routine.doneCount}/${routine.slots.length}` : "—"} />
        <Stat label="Tasks completed" value={completed.length} />
      </div>
      <ProgressExplained percent={progress.percent} explanation={progress.explanation} className="mb-10" />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-10">
          <Section
            title={`Routine${routine.template ? ` · ${routine.template.name}` : ""}`}
            description={routine.template ? `${formatMinutes(routine.plannedMinutes)} planned${routine.reason === "override" ? " · changed for this date only" : ""}` : undefined}
            action={<DayTemplateSwitcher date={date} templates={templates.map((t) => ({ id: t.id, name: t.name }))} currentId={routine.template?.id ?? null} overridden={routine.reason === "override"} />}
          >
            {routine.slots.length ? (
              <>
                <RoutineTimeline slots={routine.slots} date={date} canComplete={!isFuture} />
                {routine.overlaps.length ? <p className="text-xs text-warning">Some blocks overlap — adjust times in Routine.</p> : null}
              </>
            ) : (
              <EmptyState compact icon={CalendarClock} title={routine.template ? `${routine.template.name} has no blocks for this day` : "No routine template applies"} description="Add blocks to a template; completing them logs real sessions.">
                <Link href={routine.template ? `/routine?template=${routine.template.id}` : "/routine"} className={buttonVariants({ size: "sm" })}>
                  Edit routine
                </Link>
              </EmptyState>
            )}
          </Section>

          {planned.length || isToday ? (
            <Section title="Planned for this day" description="Extra blocks for this date only (e.g. accepted AI Planner suggestions)." action={isToday ? <Link href="/ai/planner" className="text-xs text-fg-muted hover:text-fg">AI Planner</Link> : undefined}>
              <PlannedBlocks items={planned.map((a) => ({ id: a.adj.id, title: a.adj.title, startTime: a.adj.startTime.slice(0, 5), durationMinutes: a.adj.durationMinutes, status: a.adj.status, source: a.adj.source, taskRef: a.taskRef }))} canComplete={!isFuture} />
            </Section>
          ) : null}

          {isToday ? (
            <Section title="Tasks" action={<Link href="/tasks?view=upcoming" className="text-xs text-fg-muted hover:text-fg">Upcoming</Link>}>
              <div>
                {overdue.length ? (
                  <div className="mb-3">
                    <p className="mb-1 text-[11px] font-medium text-danger">Overdue · {overdue.length}</p>
                    <TaskList tasks={overdue} today={realToday} compact />
                  </div>
                ) : null}
                {todayTasks.length ? <TaskList tasks={todayTasks} today={realToday} compact /> : !overdue.length ? <p className="py-2 text-[13px] text-fg-muted">No tasks for today yet.</p> : null}
                <QuickAddTask extras={{ dueDate: realToday }} placeholder="Add a task for today…" />
              </div>
            </Section>
          ) : null}
        </div>

        <div className="flex flex-col gap-10">
          <Section title="Daily targets" action={<Link href="/targets" className="text-xs text-fg-muted hover:text-fg">Manage</Link>}>
            {daily.length ? (
              <div className="flex flex-col divide-y divide-border">
                {daily.map((t) => (
                  <TargetLine key={t.id} target={t} />
                ))}
              </div>
            ) : (
              <EmptyState compact title="No daily targets" description="E.g. Study 4h · Coding 2h · English 45m.">
                <Link href="/targets?new=1" className={buttonVariants({ size: "sm" })}>Add target</Link>
              </EmptyState>
            )}
          </Section>

          <Section title="Logged" description={sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${formatMinutes(minutes)}` : undefined}>
            {sessions.length ? (
              <ul className="flex flex-col">
                {sessions.map(({ session: s, skillName, projectTitle }) => (
                  <li key={s.id} className="group flex items-baseline gap-3 py-1.5 text-[13px]">
                    <span className="w-16 shrink-0 text-[11px] capitalize text-fg-subtle">{s.activityType}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {s.title}
                      {skillName || projectTitle ? <span className="text-fg-subtle"> · {skillName ?? projectTitle}</span> : null}
                    </span>
                    <span className="tabular text-xs text-fg-muted">{s.durationMinutes ? formatMinutes(s.durationMinutes) : `${s.quantity} ${s.unit}`}</span>
                    {s.source === "manual" ? <DeleteSessionButton id={s.id} /> : <span className="w-5" />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-1 text-[13px] text-fg-muted">{isFuture ? "Nothing logged for a future day." : "Nothing logged yet. Completed routine blocks and logged sessions appear here."}</p>
            )}
          </Section>
        </div>
      </div>
    </Page>
  );
}
