import Link from "next/link";
import { Compass } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listGoals } from "@/server/services/goals";
import { getEntityOptions } from "@/server/services/options";
import { relativeDay } from "@/lib/ui/format";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { AreaDot } from "@/components/app/area-dot";
import { StatusBadge } from "@/components/entities/status";
import { NewGoalButton } from "../_components/create-buttons";

export const metadata = { title: "Goals" };

const VIEWS = ["active", "all", "archived", "trash"] as const;

export default async function GoalsPage(props: PageProps<"/goals">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as (typeof VIEWS)[number]) : "active";
  const [goals, options] = await Promise.all([listGoals(actor, { view }), getEntityOptions(actor)]);
  return (
    <Page>
      <PageHeader title="Goals" description="Where you want to go. Each goal is measured by weighted milestones or the targets linked to it." actions={<NewGoalButton options={options} defaultOpen={sp.new === "1"} />} />
      <Tabs current={view} items={VIEWS.map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: `/goals?view=${v}` }))} />
      {goals.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {goals.map((g) => (
            <li key={g.id}>
              <Link href={`/goals/${g.ref}`} className="group flex h-full flex-col gap-3 rounded-[10px] border border-border p-4 transition-colors hover:border-border-strong hover:bg-bg-subtle">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{g.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
                      {g.lifeAreaName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AreaDot color={g.lifeAreaColor} />
                          {g.lifeAreaName}
                        </span>
                      ) : null}
                      {g.targetDate ? <span>Target {relativeDay(g.targetDate, options.today)}</span> : null}
                    </div>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <div className="mt-auto flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <ProgressBar value={g.progress.percent} className="flex-1" label={`${g.title} progress`} />
                    <span className="tabular w-9 text-right text-xs font-medium">{g.progress.percent === null ? "—" : `${Math.round(g.progress.percent)}%`}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-fg-subtle">
                    <span className="truncate">{g.progress.explanation}</span>
                    <Ref>{g.ref}</Ref>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Compass} title={view === "trash" ? "Trash is empty" : "No goals here"} description="Define where you want to go. Goals give your projects and targets a direction.">
          {view === "active" ? <NewGoalButton options={options} /> : null}
        </EmptyState>
      )}
    </Page>
  );
}
