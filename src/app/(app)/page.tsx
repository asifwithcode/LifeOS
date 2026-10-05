import Link from "next/link";
import { ArrowRight, CalendarClock, Compass, FolderKanban, Inbox, Sparkles } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { nowMinutesOf } from "@/server/engines/actor";
import { getDashboard } from "@/server/services/dashboard";
import { defaultWidgets } from "@/server/services/users";
import { DASHBOARD_WIDGETS } from "@/lib/domain/constants";
import { formatMinutes } from "@/lib/domain/dates";
import { greeting, longDate, relativeDay } from "@/lib/ui/format";
import { Page, Panel, Section } from "@/components/ui/layout";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActivityList } from "@/components/entities/activity-list";
import { TargetLine } from "@/components/entities/target-card";
import { TaskList } from "@/components/entities/task-row";
import { CaptureButton, LogSessionButton } from "./_components/shell-buttons";
import { WidgetCustomizer } from "./_components/widget-customizer";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, settings, actor } = await requireUser();
  const d = await getDashboard(actor);
  const prefs = settings?.dashboardWidgets?.length ? settings.dashboardWidgets : defaultWidgets();
  const known = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id));
  const widgets = [...prefs.filter((w) => known.has(w.id)), ...DASHBOARD_WIDGETS.filter((w) => !prefs.some((p) => p.id === w.id)).map((w) => ({ id: w.id, visible: false }))];
  const visible = widgets.filter((w) => w.visible).map((w) => w.id);
  const firstName = user.name.split(" ")[0];
  const isEmpty = d.targets.length === 0 && d.routine.slots.length === 0 && d.priorities.length === 0 && d.projects.length === 0 && d.goals.length === 0;

  const render: Record<string, React.ReactNode> = {
    today: (
      <Panel className="p-5">
        <div className="flex items-center gap-5">
          <div className="relative grid place-items-center">
            <ProgressRing value={d.progress.percent} size={72} stroke={6} label={`Today ${d.progress.percent ?? 0}%`} />
            <span className="tabular absolute text-[15px] font-semibold">{d.progress.percent === null ? "—" : `${Math.round(d.progress.percent)}%`}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">Today</p>
            <p className="mt-0.5 text-[13px] text-fg">{d.summary ?? d.progress.explanation}</p>
            <p className="mt-1 text-xs text-fg-subtle">
              {d.tasksRemaining} task{d.tasksRemaining === 1 ? "" : "s"} on today&apos;s list
              {d.overdueCount ? ` · ${d.overdueCount} overdue` : ""}
              {d.routine.slots.length ? ` · routine ${d.routine.doneCount}/${d.routine.slots.length}` : ""}
            </p>
            {d.summary ? <p className="mt-1 text-[11px] text-fg-subtle">Computed from your daily targets · {d.progress.explanation}</p> : null}
          </div>
        </div>
      </Panel>
    ),
    targets: (
      <Section title="Targets" action={<Link href="/targets" className="text-xs text-fg-muted hover:text-fg">All targets</Link>}>
        {d.targets.length ? (
          <div className="flex flex-col divide-y divide-border">
            {[...d.targets.filter((t) => t.period === "daily"), ...d.targets.filter((t) => t.period !== "daily")].slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-[11px] text-fg-subtle">{t.period === "daily" ? "Today" : t.period === "weekly" ? "Week" : t.period === "monthly" ? "Month" : t.period === "quarterly" ? "Quarter" : t.period === "yearly" ? "Year" : "Range"}</span>
                <div className="min-w-0 flex-1">
                  <TargetLine target={t} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No targets yet" description="Targets turn goals into measurable daily and weekly amounts.">
            <Link href="/targets?new=1" className={buttonVariants({ size: "sm" })}>Add a target</Link>
          </EmptyState>
        )}
      </Section>
    ),
    routine: (
      <Section title="Routine" action={<Link href="/today" className="text-xs text-fg-muted hover:text-fg">Open Today</Link>}>
        {d.routine.slots.length ? (
          <div className="flex flex-col gap-1">
            {d.routine.next ? (
              <div className="rounded-lg border border-border px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">{d.routine.next.state === "now" ? "Now" : "Next"}</p>
                <p className="mt-0.5 text-[13px] font-medium">
                  <span className="tabular text-fg-muted">{d.routine.next.item.startTime.slice(0, 5)}</span> — {d.routine.next.item.title}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-fg-muted">Nothing left on today&apos;s routine.</p>
            )}
            <ul className="mt-1 flex flex-col">
              {d.routine.slots
                .filter((s) => s.state === "upcoming" && s.item.id !== d.routine.next?.item.id)
                .slice(0, 3)
                .map((s) => (
                  <li key={s.item.id} className="flex gap-3 py-1 text-[13px] text-fg-muted">
                    <span className="tabular w-11 text-xs text-fg-subtle">{s.item.startTime.slice(0, 5)}</span>
                    {s.item.title}
                  </li>
                ))}
            </ul>
            <p className="text-[11px] text-fg-subtle">
              {d.routine.template?.name} · {formatMinutes(d.routine.plannedMinutes)} planned
            </p>
          </div>
        ) : (
          <EmptyState compact icon={CalendarClock} title="No routine for today" description="Build a daily routine; completed blocks count toward your targets.">
            <Link href="/routine" className={buttonVariants({ size: "sm" })}>Set up routine</Link>
          </EmptyState>
        )}
      </Section>
    ),
    priorities: (
      <Section title="Top priorities" action={<Link href="/tasks?view=today" className="text-xs text-fg-muted hover:text-fg">Today&apos;s tasks</Link>}>
        {d.priorities.length ? (
          <TaskList tasks={d.priorities} today={d.today} compact />
        ) : (
          <p className="py-2 text-[13px] text-fg-muted">Nothing due today. Pick something from <Link href="/tasks?view=upcoming" className="text-fg underline-offset-2 hover:underline">upcoming</Link> or enjoy the space.</p>
        )}
      </Section>
    ),
    deadlines: (
      <Section title="Upcoming deadlines" description="Next 14 days · high-priority tasks, milestones and projects">
        {d.deadlines.length ? (
          <ul className="flex flex-col">
            {d.deadlines.map((x) => (
              <li key={`${x.kind}-${x.ref}`} className="flex items-baseline gap-3 py-1.5 text-[13px]">
                <span className="w-20 shrink-0 text-xs text-fg-subtle">{relativeDay(x.date, d.today)}</span>
                <Link href={x.href} className="min-w-0 flex-1 truncate hover:underline hover:underline-offset-2">{x.title}</Link>
                <Ref>{x.ref}</Ref>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-[13px] text-fg-muted">No deadlines in the next two weeks.</p>
        )}
      </Section>
    ),
    projects: (
      <Section title="Active projects" action={<Link href="/projects" className="text-xs text-fg-muted hover:text-fg">All projects</Link>}>
        {d.projects.length ? (
          <ul className="flex flex-col gap-3">
            {d.projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.ref}`} className="group flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium group-hover:underline group-hover:underline-offset-2">{p.title}</span>
                    <span className="tabular text-xs text-fg-muted">{p.progress.percent === null ? "—" : `${Math.round(p.progress.percent)}%`}</span>
                  </div>
                  <ProgressBar value={p.progress.percent} label={`${p.title} progress`} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={FolderKanban} title="No active projects" description="Start your first project, or convert an existing idea into one.">
            <Link href="/projects?new=1" className={buttonVariants({ size: "sm" })}>New project</Link>
            <Link href="/ideas" className={buttonVariants({ size: "sm", variant: "ghost" })}>Browse ideas</Link>
          </EmptyState>
        )}
      </Section>
    ),
    goals: (
      <Section title="Current goals" action={<Link href="/goals" className="text-xs text-fg-muted hover:text-fg">All goals</Link>}>
        {d.goals.length ? (
          <ul className="flex flex-col gap-3">
            {d.goals.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.ref}`} className="group flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium group-hover:underline group-hover:underline-offset-2">{g.title}</span>
                    <span className="tabular text-xs text-fg-muted">{g.targetDate ? relativeDay(g.targetDate, d.today) : ""}</span>
                  </div>
                  <ProgressBar value={g.progress.percent} label={`${g.title} progress`} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Compass} title="No goals yet" description="Define where you want to go. Goals give projects and targets a direction.">
            <Link href="/goals?new=1" className={buttonVariants({ size: "sm" })}>Create a goal</Link>
          </EmptyState>
        )}
      </Section>
    ),
    inbox: (
      <Section title="Inbox">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-[13px]">
            <Inbox className="size-4 text-fg-subtle" aria-hidden />
            {d.inboxCount ? `${d.inboxCount} item${d.inboxCount === 1 ? "" : "s"} to organise` : "Inbox zero"}
          </div>
          {d.inboxCount ? (
            <Link href="/inbox" className={buttonVariants({ size: "sm" })}>
              Process <ArrowRight />
            </Link>
          ) : (
            <CaptureButton size="sm" variant="ghost" />
          )}
        </div>
      </Section>
    ),
    activity: (
      <Section title="Recent activity" action={<Link href="/timeline" className="text-xs text-fg-muted hover:text-fg">Timeline</Link>}>
        {d.events.length ? <ActivityList events={d.events} timezone={actor.timezone} /> : <p className="py-2 text-[13px] text-fg-muted">Your activity will appear here as you work.</p>}
      </Section>
    ),
  };

  const wide = new Set(["today"]);
  return (
    <Page width="wide" className="max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs text-fg-subtle">{longDate(d.today)}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
            {greeting(nowMinutesOf(actor))}, {firstName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <WidgetCustomizer widgets={widgets} />
          <LogSessionButton size="md" />
          <CaptureButton variant="primary" label="Quick capture" />
        </div>
      </header>

      {isEmpty ? (
        <Panel className="mb-8 p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 text-accent" aria-hidden />
            <div>
              <p className="text-[14px] font-medium">Welcome to LifeOS. Start with three small steps:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-fg-muted">
                <li><Link href="/goals?new=1" className="text-fg underline-offset-2 hover:underline">Create a goal</Link> — where do you want to go?</li>
                <li><Link href="/targets?new=1" className="text-fg underline-offset-2 hover:underline">Add a daily target</Link> — e.g. 4 hours of study.</li>
                <li><Link href="/routine" className="text-fg underline-offset-2 hover:underline">Shape your routine</Link> — completed blocks count toward targets automatically.</li>
              </ol>
              <p className="mt-3 text-xs text-fg-subtle">Everything on this dashboard is computed from what you log — nothing is invented.</p>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        {visible.map((id) => (
          <div key={id} className={wide.has(id) ? "lg:col-span-2" : undefined}>
            {render[id]}
          </div>
        ))}
      </div>
      {visible.length === 0 ? <EmptyState title="All widgets are hidden" description="Use Customize to choose what appears here." /> : null}
    </Page>
  );
}
