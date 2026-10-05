import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listRelated } from "@/server/engines/relations";
import { listEvents } from "@/server/engines/activity";
import { getSkillByRef, recentSkillSessions } from "@/server/services/skills";
import { listTasks } from "@/server/services/tasks";
import { evaluateTargets } from "@/server/services/targets";
import { getEntityOptions } from "@/server/services/options";
import { SKILL_LEVELS } from "@/lib/domain/constants";
import { addDays, formatMinutes } from "@/lib/domain/dates";
import { shortDate } from "@/lib/ui/format";
import { Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { ProgressExplained } from "@/components/ui/progress";
import { Ref } from "@/components/ui/badge";
import { ActivityList } from "@/components/entities/activity-list";
import { LinksPanel } from "@/components/entities/links-panel";
import { TargetLine } from "@/components/entities/target-card";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { NewTargetButton } from "../../_components/create-buttons";
import { SkillActions, TopicRoadmap } from "./skill-client";

export async function generateMetadata(props: PageProps<"/skills/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function SkillDetailPage(props: PageProps<"/skills/[ref]">) {
  const { ref } = await props.params;
  const { actor } = await requireUser();
  const data = await getSkillByRef(actor, ref);
  if (!data) notFound();
  const { skill, topics, progress, totals, daily } = data;
  const [options, related, sessions, tasks, targets, events] = await Promise.all([
    getEntityOptions(actor),
    listRelated(actor.userId, { type: "skill", id: skill.id }),
    recentSkillSessions(actor.userId, skill.id, 8),
    listTasks(actor, { view: "all", skillId: skill.id }),
    evaluateTargets(actor, { skillId: skill.id }),
    listEvents(actor.userId, { entity: { type: "skill", id: skill.id }, limit: 15 }),
  ]);
  // 28-day minutes, zero-filled (real data only).
  const byDay = new Map(daily.map((d) => [d.date, d.minutes]));
  const days = Array.from({ length: 28 }, (_, i) => addDays(options.today, i - 27));
  const max = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/skills" className="hover:text-fg">Skills</Link>
            <span>/</span>
            <Ref>{skill.ref}</Ref>
          </>
        }
        title={skill.name}
        description={skill.description ?? undefined}
        actions={<SkillActions skill={skill} options={options} />}
      />
      <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Level (self-assessed)" value={SKILL_LEVELS[skill.currentLevel]} hint={`target: ${SKILL_LEVELS[skill.targetLevel]}`} />
        <Stat label="Roadmap" value={`${topics.filter((t) => t.status === "done").length}/${topics.length}`} hint="topics done" />
        <Stat label="Time invested" value={formatMinutes(totals.all.minutes)} hint={`${totals.all.count} sessions`} />
        <Stat label="Last 30 days" value={formatMinutes(totals.last30.minutes)} hint={`${totals.last30.count} sessions`} />
      </div>
      <ProgressExplained percent={progress.percent} explanation={progress.explanation} className="mb-10" />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section title="Roadmap" description="✓ done · ◐ learning · ○ not started. Click the marker to advance a topic.">
            <TopicRoadmap skillId={skill.id} topics={topics.map((t) => ({ id: t.id, title: t.title, status: t.status }))} />
          </Section>

          <Section title="Practice — last 28 days" description={totals.last30.minutes ? undefined : "Log a session linked to this skill to see your practice rhythm."}>
            <div className="flex h-20 items-end gap-[3px]" role="img" aria-label={`Minutes practised per day over the last 28 days, total ${formatMinutes(days.reduce((s, d) => s + (byDay.get(d) ?? 0), 0))}`}>
              {days.map((d) => {
                const m = byDay.get(d) ?? 0;
                return (
                  <div key={d} className="group relative flex-1">
                    <div className={m ? "rounded-sm bg-accent/80" : "rounded-sm bg-bg-muted"} style={{ height: m ? `${Math.max(8, (m / max) * 80)}px` : "3px" }} title={`${shortDate(d)}: ${m ? formatMinutes(m) : "—"}`} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-fg-subtle">
              <span>{shortDate(days[0])}</span>
              <span>today</span>
            </div>
          </Section>

          <Section title="Tasks">
            <div>
              {tasks.length ? <TaskList tasks={tasks} today={options.today} compact /> : null}
              <QuickAddTask extras={{ skillId: skill.id }} placeholder="Add a practice task…" />
            </div>
          </Section>

          <Section title="Recent sessions">
            {sessions.length ? (
              <ul className="flex flex-col">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
                    <span className="w-14 shrink-0 text-xs text-fg-subtle">{shortDate(s.localDate)}</span>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="tabular text-xs text-fg-muted">{s.durationMinutes ? formatMinutes(s.durationMinutes) : `${s.quantity} ${s.unit}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">No sessions yet.</p>
            )}
          </Section>
          <Section title="History">
            {events.length ? <ActivityList events={events} timezone={actor.timezone} showDate /> : <p className="text-xs text-fg-subtle">No history yet.</p>}
          </Section>
        </div>
        <aside className="flex flex-col gap-8">
          <Section title="Targets" action={<NewTargetButton options={options} defaults={{ skillId: skill.id, unit: "hours", period: "weekly" }} variant="ghost" label="Add" />}>
            {targets.length ? targets.map((t) => <TargetLine key={t.id} target={t} />) : <p className="text-xs text-fg-subtle">E.g. Practise {skill.name} 5 hours per week.</p>}
          </Section>
          <Section title="Linked" description="Projects that use it, notes, career goals…">
            <LinksPanel source={{ type: "skill", id: skill.id }} related={related} />
          </Section>
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            Assessments, quizzes and practice evidence join the progress calculation with the Learning OS (Phase 3). Until then, progress only counts topics you mark done.
          </p>
        </aside>
      </div>
    </Page>
  );
}
