import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listInbox } from "@/server/services/inbox";
import { getEntityOptions } from "@/server/services/options";
import { ENTITY_LABEL, type EntityType } from "@/lib/domain/constants";
import { timeOfDay } from "@/lib/ui/format";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Ref } from "@/components/ui/badge";
import { CaptureButton } from "../_components/shell-buttons";
import { InboxList, RestoreButton } from "./inbox-client";

export const metadata = { title: "Inbox" };

const VIEWS = ["pending", "processed", "discarded"] as const;

export default async function InboxPage(props: PageProps<"/inbox">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as (typeof VIEWS)[number]) : "pending";
  const [items, options, pendingCount] = await Promise.all([listInbox(actor, view), getEntityOptions(actor), view === "pending" ? Promise.resolve(null) : listInbox(actor, "pending").then((r) => r.length)]);
  return (
    <Page>
      <PageHeader title="Inbox" description="Everything captured lands here first. Suggestions come from transparent rules — nothing is filed until you confirm." actions={<CaptureButton variant="primary" label="Capture" />} />
      <Tabs
        current={view}
        items={VIEWS.map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: `/inbox?view=${v}`, count: v === "pending" ? (view === "pending" ? items.length : (pendingCount ?? undefined)) : undefined }))}
      />
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={view === "pending" ? "Inbox zero" : `Nothing ${view}`} description={view === "pending" ? "Capture anything with ⌘J (or c) — thoughts, tasks, links, ideas — and sort it later." : undefined}>
          {view === "pending" ? <CaptureButton label="Capture something" /> : null}
        </EmptyState>
      ) : view === "pending" ? (
        <InboxList
          items={items.map((i) => ({ id: i.id, ref: i.ref, content: i.content, suggestion: i.suggestion, createdAt: i.createdAt.toISOString() }))}
          projects={options.projects}
          today={options.today}
        />
      ) : (
        <ul className="flex flex-col">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-[13px] text-fg-muted">{i.content}</p>
                <p className="mt-1 text-[11px] text-fg-subtle">
                  {i.processedAt ? timeOfDay(i.processedAt, actor.timezone) : ""}{" "}
                  {i.processedEntityType ? (
                    <>
                      → {ENTITY_LABEL[i.processedEntityType as EntityType]}{" "}
                      {i.result ? (
                        <Link className="text-fg-muted hover:text-fg" href={i.result.url}>
                          {i.result.ref ?? i.result.title}
                        </Link>
                      ) : (
                        <span>(since removed)</span>
                      )}
                    </>
                  ) : null}
                </p>
              </div>
              <Ref>{i.ref}</Ref>
              {view === "discarded" ? <RestoreButton id={i.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
