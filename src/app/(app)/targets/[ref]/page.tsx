import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { getTargetByRef } from "@/server/services/targets";
import { getEntityOptions } from "@/server/services/options";
import { formatMinutes } from "@/lib/domain/dates";
import { formatTargetAmount, metricForUnit } from "@/lib/domain/targets";
import { shortDate } from "@/lib/ui/format";
import { Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/progress";
import { Ref } from "@/components/ui/badge";
import { StatusBadge } from "@/components/entities/status";
import { TargetActions } from "./target-client";

export async function generateMetadata(props: PageProps<"/targets/[ref]">) {
  return { title: (await props.params).ref };
}

const PACE: Record<string, string> = { complete: "Complete", ahead: "Ahead of pace", on_track: "On track", behind: "Behind pace", not_started: "Not started" };

export default async function TargetDetailPage(props: PageProps<"/targets/[ref]">) {
  const { ref } = await props.params;
  const { actor } = await requireUser();
  const data = await getTargetByRef(actor, ref);
  if (!data) notFound();
  const options = await getEntityOptions(actor);
  const { target: t, history, sessions } = data;
  const e = t.evaluation;
  const fmt = (n: number) => formatTargetAmount(n, t.unit, t.customUnit);
  const filters = [
    t.activityType ? `activity “${t.activityType}”` : null,
    t.skillName ? `skill “${t.skillName}”` : null,
    t.projectTitle ? `project “${t.projectTitle}”` : null,
    t.lifeAreaName ? `area “${t.lifeAreaName}”` : null,
  ].filter(Boolean);
  const metric = metricForUnit(t.unit);
  const how =
    metric === "tasks"
      ? `Counts top-level tasks completed in the period${filters.length ? ` matching ${filters.join(", ")}` : ""}.`
      : metric === "time"
        ? `Sums the duration of sessions logged in the period${filters.length ? ` matching ${filters.join(" and ")}` : " (all activities)"}.`
        : metric === "sessions"
          ? `Counts sessions logged in the period${filters.length ? ` matching ${filters.join(" and ")}` : ""}.`
          : `Sums session amounts recorded in “${t.unit === "custom" ? t.customUnit : t.unit}”${filters.length ? ` matching ${filters.join(" and ")}` : ""}.`;
  const maxHist = Math.max(t.amount, e.actual, ...history.map((h) => h.actual), 1);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/targets" className="hover:text-fg">Targets</Link>
            <span>/</span>
            <Ref>{t.ref}</Ref>
            {t.status === "paused" ? <StatusBadge status="paused" /> : null}
            {t.archivedAt ? <StatusBadge status="archived" /> : null}
          </>
        }
        title={t.title}
        description={`${fmt(t.amount)} per ${t.period === "daily" ? "day" : t.period === "weekly" ? "week" : t.period === "monthly" ? "month" : t.period === "quarterly" ? "quarter" : t.period === "yearly" ? "year" : `${t.customStart} → ${t.customEnd}`}${t.goalTitle ? ` · measures “${t.goalTitle}”` : ""}`}
        actions={<TargetActions target={t} options={options} />}
      />

      <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="This period" value={fmt(e.actual)} hint={`of ${fmt(e.amount)}`} />
        <Stat label="Progress" value={`${Math.round(e.percent)}%`} hint={PACE[e.status]} />
        <Stat label="Remaining" value={fmt(e.remaining)} hint={e.remainingDays ? `${e.remainingDays} day${e.remainingDays === 1 ? "" : "s"} left` : "Period ended"} />
        <Stat label="Needed per day" value={e.requiredPerDay ? fmt(e.requiredPerDay) : "—"} hint={t.period === "daily" ? "today" : "to finish on time"} />
      </div>
      <ProgressBar value={e.percent} tone={e.status === "complete" ? "success" : "accent"} className="h-1.5" label="Period progress" />
      <p className="mt-2 text-xs text-fg-subtle">
        {shortDate(e.range.start)} – {shortDate(e.range.end)} · {t.summary} · <span className="text-fg-muted">How it&apos;s calculated:</span> {how}
      </p>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Previous periods">
          {history.length ? (
            <ul className="flex flex-col gap-2">
              {history.map((h) => (
                <li key={h.range.start} className="flex items-center gap-3 text-[13px]">
                  <span className="w-28 shrink-0 text-xs text-fg-subtle">
                    {t.period === "daily" ? shortDate(h.range.start) : `${shortDate(h.range.start)} – ${shortDate(h.range.end)}`}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-muted" aria-hidden>
                    <div className={`h-full rounded-full ${h.actual >= t.amount ? "bg-success" : "bg-accent/70"}`} style={{ width: `${(h.actual / maxHist) * 100}%` }} />
                  </div>
                  <span className="tabular w-24 text-right text-xs text-fg-muted">
                    {fmt(h.actual)} · {Math.round(h.percent)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-subtle">Custom-range targets have a single period.</p>
          )}
        </Section>
        <Section title="Counted this period" description={metric === "tasks" ? "Completed tasks are counted from your task list." : undefined}>
          {sessions.length ? (
            <ul className="flex flex-col">
              {sessions.map(({ session: s, skillName, projectTitle }) => (
                <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
                  <span className="w-14 shrink-0 text-xs text-fg-subtle">{shortDate(s.localDate)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.title}
                    {skillName || projectTitle ? <span className="text-fg-subtle"> · {skillName ?? projectTitle}</span> : null}
                  </span>
                  <span className="tabular text-xs text-fg-muted">{metric === "time" ? formatMinutes(s.durationMinutes ?? 0) : metric === "sessions" ? "1" : `${s.quantity} ${s.unit}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-subtle">{metric === "tasks" ? "" : "Nothing counted yet this period. Log a session or complete a matching routine block."}</p>
          )}
        </Section>
      </div>
    </Page>
  );
}
