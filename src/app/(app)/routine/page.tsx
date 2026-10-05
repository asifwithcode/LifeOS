import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listDayPlans, listItems, listTemplates, routineHistory } from "@/server/services/routine";
import { getEntityOptions } from "@/server/services/options";
import { addDays, formatMinutes } from "@/lib/domain/dates";
import { findOverlaps, plannedMinutes } from "@/lib/domain/routine";
import { shortDate } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";
import { RoutineItemRow, TemplateToolbar, AddBlockButton, NewTemplateButton } from "./routine-client";

export const metadata = { title: "Daily Routine" };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function RoutinePage(props: PageProps<"/routine">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const [templates, options, history] = await Promise.all([listTemplates(actor.userId), getEntityOptions(actor), routineHistory(actor, 14)]);
  const current = templates.find((t) => t.id === sp.template) ?? templates.find((t) => t.isDefault) ?? templates[0];
  const [items, plans] = await Promise.all([current ? listItems(actor.userId, current.id) : Promise.resolve([]), listDayPlans(actor.userId, options.today, addDays(options.today, 60))]);
  const overlaps = new Set(findOverlaps(items.map((i) => i.item)).flat());
  const tracked = history.filter((h) => h.scheduled > 0);
  const adherence = tracked.length ? Math.round((tracked.reduce((s, h) => s + h.done, 0) / tracked.reduce((s, h) => s + h.scheduled, 0)) * 100) : null;
  const weekdayOwner = (d: number) => templates.find((t) => t.weekdays.includes(d))?.name ?? templates.find((t) => t.isDefault)?.name ?? "—";

  return (
    <Page>
      <PageHeader
        title="Daily Routine"
        description="Templates for different kinds of days. Completing a block on Today logs a real session, so routines feed your targets."
        actions={<NewTemplateButton />}
      />

      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1" aria-label="Templates">
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/routine?template=${t.id}`}
            aria-current={t.id === current?.id ? "page" : undefined}
            className={cn("shrink-0 rounded-md px-3 py-1.5 text-[13px] transition-colors", t.id === current?.id ? "bg-bg-muted font-medium text-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg")}
          >
            {t.name}
            {t.isDefault ? <span className="ml-1.5 text-[11px] text-fg-subtle">default</span> : null}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {current ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[13px] text-fg-muted">
                  {current.weekdays.length ? `Used on ${current.weekdays.map((d) => WD[d]).join(", ")}` : current.isDefault ? "Used when no weekday template matches" : "Not assigned to weekdays — apply it to specific dates from Today"}
                  {items.length ? ` · ${items.length} blocks · ${formatMinutes(plannedMinutes(items.map((i) => i.item)))}` : ""}
                </div>
                <TemplateToolbar template={current} />
              </div>
              {items.length ? (
                <ol className="flex flex-col rounded-[10px] border border-border">
                  {items.map(({ item, skillName, projectTitle, goalTitle }) => (
                    <RoutineItemRow key={item.id} item={item} meta={[skillName, projectTitle, goalTitle].filter(Boolean).join(" · ")} overlap={overlaps.has(item.id)} options={options} />
                  ))}
                </ol>
              ) : (
                <EmptyState icon={CalendarClock} title={`${current.name} is empty`} description="Add time blocks like 07:30 Botany revision (45m) or 19:30 Kotlin practice (1h).">
                  <AddBlockButton templateId={current.id} options={options} />
                </EmptyState>
              )}
              {items.length ? <AddBlockButton templateId={current.id} options={options} /> : null}
            </>
          ) : (
            <EmptyState icon={CalendarClock} title="No templates" description="Create a template to start your routine.">
              <NewTemplateButton />
            </EmptyState>
          )}
        </div>

        <aside className="flex flex-col gap-8">
          <Section title="Week">
            <ul className="flex flex-col text-[13px]">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <li key={d} className="flex justify-between py-1">
                  <span className="text-fg-subtle">{WD[d]}</span>
                  <span className="text-fg">{weekdayOwner(d)}</span>
                </li>
              ))}
            </ul>
          </Section>
          {plans.length ? (
            <Section title="Date overrides" description="Temporary changes; templates stay untouched.">
              <ul className="flex flex-col text-[13px]">
                {plans.map((p) => (
                  <li key={p.date} className="flex justify-between py-1">
                    <Link href={`/today?date=${p.date}`} className="text-fg-subtle hover:text-fg">{shortDate(p.date)}</Link>
                    <span>{p.templateName}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Last 14 days" description={adherence === null ? "No scheduled blocks yet." : `${adherence}% of scheduled blocks done`}>
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.date} className="flex items-center gap-2 text-xs">
                  <Link href={`/today?date=${h.date}`} className="w-12 shrink-0 text-fg-subtle hover:text-fg">{shortDate(h.date)}</Link>
                  <div className="flex h-2 flex-1 gap-px overflow-hidden rounded-sm" aria-label={`${h.done} of ${h.scheduled} done`}>
                    {h.scheduled ? (
                      Array.from({ length: h.scheduled }).map((_, i) => (
                        <span key={i} className={cn("flex-1", i < h.done ? "bg-accent" : i < h.done + h.skipped ? "bg-fg-subtle/40" : "bg-bg-muted")} />
                      ))
                    ) : (
                      <span className="flex-1 bg-transparent" />
                    )}
                  </div>
                  <span className="tabular w-10 text-right text-fg-muted">{h.scheduled ? `${h.done}/${h.scheduled}` : "—"}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 text-[11px] text-fg-subtle">
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-accent" /> done</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-fg-subtle/40" /> skipped</span>
            </div>
          </Section>
          {items.some((i) => i.item.reminderMinutesBefore !== null) ? (
            <Badge tone="outline" className="self-start">Reminders are stored; delivery arrives with notifications (Phase 4)</Badge>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}

