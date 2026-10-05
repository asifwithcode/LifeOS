import Link from "next/link";
import { KeyRound, MessageSquarePlus } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { getConversation, listConversations } from "@/server/ai/chat";
import { AI_MODES, AI_MODE_KEYS } from "@/server/ai/modes";
import { getProvider } from "@/server/ai/registry";
import { Page, PageHeader } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import { Chat, type ChatMessage } from "@/components/ai/chat";
import { cn } from "@/lib/ui/cn";
import { ConversationMenu } from "./conversation-menu";

export const metadata = { title: "Personal AI" };

const STARTERS = [
  "What should I do today?",
  "Which skill is progressing slowly?",
  "Am I on track with my targets this week?",
  "What projects am I working on, and what's blocking them?",
  "Create a realistic 30-day plan for my most important goal.",
  "What did I previously decide about my projects?",
];

export default async function AIPage(props: PageProps<"/ai">) {
  const { user } = await requireUser();
  const provider = getProvider();
  if (!provider) {
    return (
      <Page width="narrow">
        <PageHeader title="Personal AI" description="Context-aware help with your goals, targets, projects and plans." />
        <EmptyState icon={KeyRound} title="No AI provider is configured" description="LifeOS works fully without AI. To enable the assistant, set ANTHROPIC_API_KEY in the server's .env file and restart. Nothing is sent anywhere until you do.">
          <Link href="/settings?tab=ai" className={buttonVariants({})}>AI & privacy settings</Link>
        </EmptyState>
      </Page>
    );
  }
  const sp = await props.searchParams;
  const selected = typeof sp.c === "string" ? sp.c : null;
  const [conversations, data] = await Promise.all([listConversations(user.id), selected ? getConversation(user.id, selected) : Promise.resolve(null)]);
  const mode = data?.conversation.mode ?? (typeof sp.mode === "string" && sp.mode in AI_MODES ? sp.mode : "general");
  const messages: ChatMessage[] = (data?.messages ?? []).map((m) => ({ id: m.id, role: m.role as "user" | "assistant", text: m.text, status: m.status, error: m.error, contextRefs: m.contextRefs, provider: m.provider }));

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 lg:h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <div className="p-3">
          <Link href="/ai" className={buttonVariants({ variant: "secondary", className: "w-full justify-start" })}>
            <MessageSquarePlus /> New conversation
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
          {conversations.length === 0 ? <p className="px-2 py-1 text-xs text-fg-subtle">No conversations yet.</p> : null}
          {conversations.map((c) => (
            <div key={c.id} className={cn("group flex items-center rounded-md", c.id === selected ? "bg-bg-muted" : "hover:bg-bg-subtle")}>
              <Link href={`/ai?c=${c.id}`} className="min-w-0 flex-1 px-2.5 py-1.5">
                <span className="block truncate text-[13px]">{c.title}</span>
                <span className="block text-[11px] text-fg-subtle">{AI_MODES[c.mode as keyof typeof AI_MODES]?.label ?? c.mode}</span>
              </Link>
              <ConversationMenu id={c.id} title={c.title} active={c.id === selected} />
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 md:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold">{data?.conversation.title ?? "New conversation"}</h1>
            <p className="text-[11px] text-fg-subtle">{AI_MODES[mode as keyof typeof AI_MODES].label} · {provider.label}</p>
          </div>
          <Link href="/ai" className={buttonVariants({ size: "sm", variant: "ghost", className: "md:hidden" })}>
            <MessageSquarePlus /> New
          </Link>
        </header>
        <Chat
          key={selected ?? "new"}
          conversationId={data?.conversation.id ?? null}
          mode={mode}
          modes={AI_MODE_KEYS.map((k) => ({ key: k, label: AI_MODES[k].label, description: AI_MODES[k].description }))}
          initialMessages={messages}
          initialActions={data?.actions ?? []}
          providerLabel={provider.label}
          starters={STARTERS}
          initialPrompt={typeof sp.q === "string" ? sp.q.slice(0, 2000) : undefined}
        />
      </div>
    </div>
  );
}
