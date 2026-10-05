import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { getProvider } from "@/server/ai/registry";
import { todayOf } from "@/server/engines/actor";
import { listAdjustments } from "@/server/services/adjustments";
import { getRoutineDay } from "@/server/services/routine";
import { longDate } from "@/lib/ui/format";
import { Page, PageHeader, Section } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { PlannedBlocks } from "@/components/ai/planned-blocks";
import { PlannerClient } from "./planner-client";

export const metadata = { title: "AI Planner" };

export default async function PlannerPage() {
  const { actor } = await requireUser();
  const provider = getProvider();
  const today = todayOf(actor);
  const [routine, adjustments] = await Promise.all([getRoutineDay(actor, today), listAdjustments(actor.userId, today)]);
  return (
    <Page>
      <PageHeader
        title="AI Planner"
        description={`Plan the rest of ${longDate(today)} from your routine, deadlines, open tasks and target pace. Accepted blocks are added to today only — your routine templates never change.`}
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          {provider ? (
            <PlannerClient providerLabel={provider.label} />
          ) : (
            <EmptyState icon={KeyRound} title="No AI provider configured" description="Set ANTHROPIC_API_KEY on the server to use the planner. Your routine and targets work without it.">
              <Link href="/settings?tab=ai" className={buttonVariants({})}>AI settings</Link>
            </EmptyState>
          )}
        </div>
        <aside className="flex flex-col gap-8">
          <Section title="Fixed today">
            {routine.slots.length ? (
              <ul className="flex flex-col text-[13px]">
                {routine.slots.map((s) => (
                  <li key={s.item.id} className="flex gap-3 py-1">
                    <span className="tabular w-11 text-xs text-fg-subtle">{s.item.startTime.slice(0, 5)}</span>
                    <span className={s.state === "done" ? "text-fg-subtle line-through" : ""}>{s.item.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">No routine blocks today.</p>
            )}
          </Section>
          <Section title="Planned for today">
            <PlannedBlocks items={adjustments.map((a) => ({ id: a.adj.id, title: a.adj.title, startTime: a.adj.startTime.slice(0, 5), durationMinutes: a.adj.durationMinutes, status: a.adj.status, source: a.adj.source, taskRef: a.taskRef }))} canComplete />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
