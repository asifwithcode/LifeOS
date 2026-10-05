import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listSkills } from "@/server/services/skills";
import { getEntityOptions } from "@/server/services/options";
import { SKILL_LEVELS } from "@/lib/domain/constants";
import { formatMinutes } from "@/lib/domain/dates";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { NewSkillButton } from "../_components/create-buttons";

export const metadata = { title: "Skills" };

export default async function SkillsPage(props: PageProps<"/skills">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "archived" ? "archived" : sp.view === "trash" ? "trash" : "active";
  const [skills, options] = await Promise.all([listSkills(actor, { view }), getEntityOptions(actor)]);
  return (
    <Page>
      <PageHeader title="Skills" description="Each skill has a topic roadmap. Progress = completed topics; time invested comes from your logged sessions." actions={<NewSkillButton options={options} defaultOpen={sp.new === "1"} />} />
      <Tabs
        current={view}
        items={[
          { key: "active", label: "Active", href: "/skills" },
          { key: "archived", label: "Archived", href: "/skills?view=archived" },
          { key: "trash", label: "Trash", href: "/skills?view=trash" },
        ]}
      />
      {skills.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {skills.map((s) => (
            <li key={s.id}>
              <Link href={`/skills/${s.ref}`} className="flex h-full flex-col gap-3 rounded-[10px] border border-border p-4 transition-colors hover:border-border-strong hover:bg-bg-subtle">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{s.name}</p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      <span className="capitalize">{s.category}</span> · {SKILL_LEVELS[s.currentLevel]} → {SKILL_LEVELS[s.targetLevel]} <span className="text-fg-subtle/80">(self-assessed)</span>
                    </p>
                  </div>
                  <Ref>{s.ref}</Ref>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={s.progress.percent} className="flex-1" label={`${s.name} roadmap progress`} />
                  <span className="tabular w-16 text-right text-xs text-fg-muted">{s.topicTotal ? `${s.topicDone}/${s.topicTotal}` : "no topics"}</span>
                </div>
                <div className="flex gap-4 text-[11px] text-fg-subtle">
                  <span>{s.totalMinutes ? `${formatMinutes(s.totalMinutes)} invested` : "No time logged"}</span>
                  {s.minutes30d ? <span>{formatMinutes(s.minutes30d)} in 30 days</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={BookOpen} title={view === "active" ? "No skills tracked yet" : "Nothing here"} description="Track a skill with a topic roadmap — e.g. Kotlin: Syntax, OOP, Collections, Coroutines, Flow, Ktor, Testing.">
          {view === "active" ? <NewSkillButton options={options} /> : null}
        </EmptyState>
      )}
    </Page>
  );
}
