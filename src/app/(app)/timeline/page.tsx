import Link from "next/link";
import { Activity } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listEvents } from "@/server/engines/activity";
import { EVENT_CATEGORIES } from "@/lib/domain/events";
import { longDate } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { ActivityList } from "@/components/entities/activity-list";
import { cn } from "@/lib/ui/cn";

export const metadata = { title: "Timeline" };

export default async function TimelinePage(props: PageProps<"/timeline">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const category = typeof sp.category === "string" && EVENT_CATEGORIES[sp.category] ? sp.category : undefined;
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const events = await listEvents(actor.userId, { category, before, limit: 150 });
  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(e.localDate, [...(byDay.get(e.localDate) ?? []), e]);
  const last = events[events.length - 1];
  return (
    <Page width="narrow">
      <PageHeader title="Timeline" description="Every meaningful change, in order. This history powers reviews and analytics — progress is never a number someone typed in." />
      <nav className="mb-6 flex flex-wrap gap-1 text-[13px]" aria-label="Filter">
        <Link href="/timeline" className={cn("rounded-md px-2.5 py-1", !category ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>All</Link>
        {Object.entries(EVENT_CATEGORIES).map(([key, c]) => (
          <Link key={key} href={`/timeline?category=${key}`} className={cn("rounded-md px-2.5 py-1", category === key ? "bg-bg-muted font-medium" : "text-fg-muted hover:bg-bg-subtle")}>
            {c.label}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing yet" description="As you complete tasks, log sessions and capture ideas, they appear here." />
      ) : (
        <div className="flex flex-col gap-8">
          {[...byDay.entries()].map(([day, list]) => (
            <Section key={day} title={longDate(day)}>
              <ActivityList events={list} timezone={actor.timezone} />
            </Section>
          ))}
          {events.length === 150 && last ? (
            <Link href={`/timeline?${new URLSearchParams({ ...(category ? { category } : {}), before: last.occurredAt.toISOString() })}`} className={buttonVariants({ className: "self-center" })}>
              Older activity
            </Link>
          ) : null}
        </div>
      )}
    </Page>
  );
}
