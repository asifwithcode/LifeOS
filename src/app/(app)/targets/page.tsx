import { Crosshair } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { evaluateTargets, listArchivedTargets } from "@/server/services/targets";
import { getEntityOptions } from "@/server/services/options";
import { TARGET_PERIODS } from "@/lib/domain/constants";
import { shortDate } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { TargetLine } from "@/components/entities/target-card";
import { NewTargetButton } from "../_components/create-buttons";
import { LogSessionButton } from "../_components/shell-buttons";
import Link from "next/link";

export const metadata = { title: "Targets" };

const PERIOD_TITLE: Record<string, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
  custom: "Custom ranges",
};

export default async function TargetsPage(props: PageProps<"/targets">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const [targets, archived, options] = await Promise.all([evaluateTargets(actor, { includePaused: true }), listArchivedTargets(actor), getEntityOptions(actor)]);
  const active = targets.filter((t) => t.status === "active");
  const paused = targets.filter((t) => t.status === "paused");
  return (
    <Page>
      <PageHeader
        title="Targets"
        description="Measurable amounts per period. Progress comes only from logged sessions, completed routine blocks and finished tasks."
        actions={
          <>
            <LogSessionButton />
            <NewTargetButton options={options} defaultOpen={sp.new === "1"} />
          </>
        }
      />
      {targets.length === 0 ? (
        <EmptyState icon={Crosshair} title="No targets yet" description="Targets turn goals into measurable daily and weekly amounts — e.g. Study 4h/day, Coding 15h/week, Reading 30 pages/day.">
          <NewTargetButton options={options} />
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          {TARGET_PERIODS.map((period) => {
            const list = active.filter((t) => t.period === period);
            if (!list.length) return null;
            const range = list[0].evaluation.range;
            return (
              <Section key={period} title={PERIOD_TITLE[period]} description={period === "daily" || period === "custom" ? undefined : `${shortDate(range.start)} – ${shortDate(range.end)} · day ${list[0].evaluation.elapsedDays} of ${list[0].evaluation.totalDays}`}>
                <div className="flex flex-col divide-y divide-border">
                  {list.map((t) => (
                    <TargetLine key={t.id} target={t} />
                  ))}
                </div>
              </Section>
            );
          })}
          {paused.length ? (
            <Section title="Paused">
              <div className="flex flex-col divide-y divide-border opacity-70">
                {paused.map((t) => (
                  <TargetLine key={t.id} target={t} showPace={false} />
                ))}
              </div>
            </Section>
          ) : null}
          {archived.length ? (
            <Section title="Archived">
              <ul className="flex flex-col text-[13px]">
                {archived.map((t) => (
                  <li key={t.id} className="py-1">
                    <Link href={`/targets/${t.ref}`} className="text-fg-muted hover:text-fg">{t.title}</Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </Page>
  );
}
