import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listProjects, type ProjectView } from "@/server/services/projects";
import { getEntityOptions } from "@/server/services/options";
import { relativeDay } from "@/lib/ui/format";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AreaDot } from "@/components/app/area-dot";
import { StatusBadge } from "@/components/entities/status";
import { NewProjectButton } from "../_components/create-buttons";

export const metadata = { title: "Projects" };

const VIEWS: ProjectView[] = ["active", "completed", "all", "archived", "trash"];

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = (VIEWS as string[]).includes(String(sp.view)) ? (sp.view as ProjectView) : "active";
  const [projects, options] = await Promise.all([listProjects(actor, { view }), getEntityOptions(actor)]);
  return (
    <Page>
      <PageHeader title="Projects" description="Progress is derived from weighted milestones (or tasks) — never typed in by hand." actions={<NewProjectButton options={options} defaultOpen={sp.new === "1"} />} />
      <Tabs current={view} items={VIEWS.map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: `/projects?view=${v}` }))} />
      {projects.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.ref}`} className="grid grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-bg-subtle sm:grid-cols-[1fr_200px] sm:items-center sm:gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{p.title}</span>
                    <StatusBadge status={p.status} label={p.status === "on_hold" ? "On hold" : undefined} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                    <Ref>{p.ref}</Ref>
                    {p.summary ? <span className="truncate">{p.summary}</span> : null}
                    {p.lifeAreaName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AreaDot color={p.lifeAreaColor} /> {p.lifeAreaName}
                      </span>
                    ) : null}
                    {p.goalTitle ? <span>→ {p.goalTitle}</span> : null}
                    {p.openTasks ? <span>{p.openTasks} open tasks</span> : null}
                    {p.targetDate ? <span>Due {relativeDay(p.targetDate, options.today)}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={p.progress.percent} className="flex-1" label={`${p.title} progress`} />
                  <span className="tabular w-9 text-right text-xs font-medium">{p.progress.percent === null ? "—" : `${Math.round(p.progress.percent)}%`}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={FolderKanban} title={view === "active" ? "No active projects" : "Nothing here"} description="Start your first project, or convert an existing idea into one.">
          {view === "active" ? (
            <>
              <NewProjectButton options={options} />
              <Link href="/ideas" className={buttonVariants({ variant: "ghost" })}>
                Browse ideas
              </Link>
            </>
          ) : null}
        </EmptyState>
      )}
    </Page>
  );
}
