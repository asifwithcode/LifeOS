import { Brain } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listMemories } from "@/server/services/memory";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { MemoryEditor, MemoryRow, MemoryToggle } from "./memory-client";

export const metadata = { title: "AI Memory" };

export default async function MemoryPage(props: PageProps<"/ai/memory">) {
  const { user, settings } = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "archived" ? "archived" : "active";
  const memories = await listMemories(user.id, view);
  return (
    <Page width="narrow">
      <PageHeader
        title="AI Memory"
        description="Durable things the assistant should remember — preferences, constraints, decisions, long-term plans. Separate from chat history: nothing is added without you."
        actions={<MemoryToggle enabled={settings?.memoryEnabled ?? false} />}
      />
      {!settings?.memoryEnabled ? (
        <p className="mb-6 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-[13px] text-fg-muted">Memory is off — these entries are kept but not sent to the assistant. Turn it on to use them.</p>
      ) : null}
      <MemoryEditor />
      <Tabs
        current={view}
        items={[
          { key: "active", label: "Active", href: "/ai/memory" },
          { key: "archived", label: "Archived", href: "/ai/memory?view=archived" },
        ]}
      />
      {memories.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {memories.map((m) => (
            <MemoryRow key={m.id} memory={{ id: m.id, ref: m.ref, content: m.content, kind: m.kind, source: m.source, status: m.status, updatedAt: m.updatedAt.toISOString().slice(0, 10) }} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Brain} title={view === "active" ? "No memories yet" : "Nothing archived"} description="E.g. “I study best in the morning”, “Exams in December — no new side projects”, “Prefer Kotlin for backend work”." />
      )}
    </Page>
  );
}
