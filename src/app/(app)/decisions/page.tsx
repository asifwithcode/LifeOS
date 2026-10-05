import Link from "next/link";
import { Scale } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listDecisions } from "@/server/services/projects";
import { getEntityOptions } from "@/server/services/options";
import { shortDate } from "@/lib/ui/format";
import { Page, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { StatusBadge } from "@/components/entities/status";
import { NewDecisionButton } from "../_components/create-buttons";
import { DecisionMenu } from "./decision-client";

export const metadata = { title: "Decision Log" };

export default async function DecisionsPage() {
  const { actor } = await requireUser();
  const [rows, options] = await Promise.all([listDecisions(actor), getEntityOptions(actor)]);
  return (
    <Page width="narrow">
      <PageHeader title="Decision Log" description="What you decided, why, and what you rejected — searchable forever." actions={<NewDecisionButton options={options} />} />
      {rows.length ? (
        <ol className="relative flex flex-col gap-6 border-l border-border pl-6">
          {rows.map(({ decision: d, projectTitle, projectRef }) => (
            <li key={d.id} className="relative">
              <span className="absolute -left-[29px] top-1.5 size-2 rounded-full bg-accent ring-4 ring-bg" aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-fg-subtle">
                    {shortDate(d.decidedOn, true)}
                    {projectRef ? (
                      <>
                        {" · "}
                        <Link href={`/projects/${projectRef}?tab=decisions`} className="hover:text-fg">{projectTitle}</Link>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium">{d.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.status !== "active" ? <StatusBadge status={d.status} /> : null}
                  <Ref>{d.ref}</Ref>
                  <DecisionMenu decision={d} options={options} />
                </div>
              </div>
              <p className="mt-1.5 text-[14px]">{d.decision}</p>
              {d.context ? <p className="mt-1.5 text-[13px] text-fg-muted"><span className="text-fg-subtle">Reason — </span>{d.context}</p> : null}
              {d.alternatives ? <p className="mt-1 text-[13px] text-fg-muted"><span className="text-fg-subtle">Alternatives — </span>{d.alternatives}</p> : null}
              {d.consequences ? <p className="mt-1 text-[13px] text-fg-muted"><span className="text-fg-subtle">Consequences — </span>{d.consequences}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={Scale} title="No decisions recorded" description="E.g. “Use ESP32-S3 instead of ESP32-C3 — need more RAM and peripherals.” Future you will thank you.">
          <NewDecisionButton options={options} />
        </EmptyState>
      )}
    </Page>
  );
}
