import Link from "next/link";
import { Timer } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listSessions } from "@/server/services/sessions";
import { todayOf } from "@/server/engines/actor";
import { ACTIVITY_TYPES } from "@/lib/domain/constants";
import { addDays, formatMinutes } from "@/lib/domain/dates";
import { longDate, titleCase } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";
import { LogSessionButton } from "../_components/shell-buttons";
import { DeleteSessionButton } from "../today/today-client";

export const metadata = { title: "Sessions" };

export default async function SessionsPage(props: PageProps<"/sessions">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const activity = (ACTIVITY_TYPES as readonly string[]).includes(String(sp.activity)) ? String(sp.activity) : undefined;
  const days = sp.range === "90" ? 90 : sp.range === "7" ? 7 : 30;
  const today = todayOf(actor);
  const rows = await listSessions(actor, { from: addDays(today, -(days - 1)), to: today, activityType: activity, limit: 1000 });
  const total = rows.reduce((s, r) => s + (r.session.durationMinutes ?? 0), 0);
  const byActivity = new Map<string, number>();
  for (const r of rows) byActivity.set(r.session.activityType, (byActivity.get(r.session.activityType) ?? 0) + (r.session.durationMinutes ?? 0));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.session.localDate, [...(groups.get(r.session.localDate) ?? []), r]);
  const max = Math.max(1, ...byActivity.values());
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { range: String(days), activity, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/sessions?${p}`;
  };

  return (
    <Page>
      <PageHeader title="Sessions" description="The single record of effort. Targets, skill time, project time and your timeline are all computed from these." actions={<LogSessionButton variant="primary" />} />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={q({ range: String(d) })} className={cn("rounded-md px-2.5 py-1", days === d ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
            {d} days
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Link href={q({ activity: undefined })} className={cn("rounded-md px-2.5 py-1", !activity ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>All</Link>
        {ACTIVITY_TYPES.map((a) => (
          <Link key={a} href={q({ activity: a })} className={cn("rounded-md px-2.5 py-1 capitalize", activity === a ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
            {a}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Timer} title="No sessions in this range" description="Log study, coding, reading or practice — or complete routine blocks on Today. Each one counts toward every matching target.">
          <LogSessionButton />
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-8">
            {[...groups.entries()].map(([date, list]) => (
              <Section key={date} title={longDate(date)} description={formatMinutes(list.reduce((s, r) => s + (r.session.durationMinutes ?? 0), 0))}>
                <ul className="flex flex-col">
                  {list.map(({ session: s, skillName, skillRef, projectTitle, projectRef, taskRef, taskTitle }) => (
                    <li key={s.id} className="group flex items-baseline gap-3 border-b border-border py-2 text-[13px] last:border-b-0">
                      <span className="w-16 shrink-0 text-[11px] capitalize text-fg-subtle">{s.activityType}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{s.title}</p>
                        <p className="truncate text-[11px] text-fg-subtle">
                          {[
                            skillRef ? <Link key="s" href={`/skills/${skillRef}`} className="hover:text-fg">{skillName}</Link> : null,
                            projectRef ? <Link key="p" href={`/projects/${projectRef}`} className="hover:text-fg">{projectTitle}</Link> : null,
                            taskRef ? <Link key="t" href={`/tasks/${taskRef}`} className="hover:text-fg">{taskTitle}</Link> : null,
                            s.source !== "manual" ? <span key="src">via {s.source}</span> : null,
                          ]
                            .filter(Boolean)
                            .flatMap((el, i) => (i ? [<span key={`sep${i}`}> · </span>, el] : [el]))}
                        </p>
                        {s.notes ? <p className="mt-0.5 text-xs text-fg-muted">{s.notes}</p> : null}
                      </div>
                      <span className="tabular text-xs text-fg-muted">{s.durationMinutes ? formatMinutes(s.durationMinutes) : ""}{s.quantity ? `${s.durationMinutes ? " · " : ""}${s.quantity} ${s.unit}` : ""}</span>
                      <Ref className="hidden sm:inline">{s.ref}</Ref>
                      {s.source === "manual" ? <DeleteSessionButton id={s.id} /> : <span className="w-5" />}
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
          </div>
          <aside className="flex flex-col gap-4">
            <Section title={`Last ${days} days`} description={`${formatMinutes(total)} across ${rows.length} sessions`}>
              <ul className="flex flex-col gap-2">
                {[...byActivity.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([a, m]) => (
                    <li key={a} className="flex flex-col gap-1 text-[13px]">
                      <div className="flex justify-between">
                        <span>{titleCase(a)}</span>
                        <span className="tabular text-xs text-fg-muted">{formatMinutes(m)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-bg-muted">
                        <div className="h-1 rounded-full bg-accent/80" style={{ width: `${(m / max) * 100}%` }} />
                      </div>
                    </li>
                  ))}
              </ul>
            </Section>
            <p className="text-[11px] text-fg-subtle">Sessions created by routine blocks are removed by resetting the block on Today.</p>
          </aside>
        </div>
      )}
    </Page>
  );
}
