import { requireUser } from "@/server/auth/dal";
import { listLifeAreas } from "@/server/services/users";
import { Page, PageHeader, Section, Tabs } from "@/components/ui/layout";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { getProvider } from "@/server/ai/registry";
import { PRIVACY_MODULES, resolvePrivacy } from "@/server/ai/privacy";
import { AiPrivacySettings, AppearanceSettings, LifeAreasSettings, PasswordForm, ProfileForm, SignOutEverywhere } from "./settings-client";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "appearance", label: "Appearance" },
  { key: "areas", label: "Life areas" },
  { key: "data", label: "Data & backup" },
  { key: "security", label: "Security" },
  { key: "ai", label: "AI & privacy" },
  { key: "roadmap", label: "Roadmap" },
];

const ROADMAP: { phase: string; title: string; items: string[] }[] = [
  { phase: "Phase 2 — remaining", title: "AI Brain", items: ["Semantic search (pgvector) once an embeddings provider is configured", "JSON import", "Additional AI providers (OpenAI, Gemini, local) behind the same interface"] },
  { phase: "Phase 3", title: "Learning OS", items: ["Study hub (program → subject → chapter → topic)", "Learning paths with prerequisites", "Courses & YouTube video learning with timestamped notes", "Books & reading sessions", "AI Teacher", "Flashcards with spaced repetition", "Practice lab, assessments, mistake book"] },
  { phase: "Phase 4", title: "Life management", items: ["Calendar", "Habits", "Focus mode (Pomodoro/stopwatch → sessions)", "Journal", "Future plans & scenarios", "Career center & study abroad", "Portfolio & file vault", "Reminders"] },
  { phase: "Phase 5", title: "Intelligence", items: ["Daily / weekly / monthly reviews", "Planned vs actual", "Forecasting", "Behind-schedule recommendations", "Analytics & On This Day"] },
];

export default async function SettingsPage(props: PageProps<"/settings">) {
  const { user, settings } = await requireUser();
  const sp = await props.searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "profile";
  const areas = tab === "areas" ? await listLifeAreas(user.id, true) : [];
  const provider = getProvider();
  return (
    <Page width="narrow">
      <PageHeader title="Settings" />
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: `/settings?tab=${t.key}` }))} />
      {tab === "profile" ? (
        <ProfileForm name={user.name} email={user.email} timezone={user.timezone} weekStartsOn={settings?.weekStartsOn ?? 1} />
      ) : null}
      {tab === "appearance" ? <AppearanceSettings theme={settings?.theme ?? "system"} accent={settings?.accent ?? "indigo"} /> : null}
      {tab === "areas" ? <LifeAreasSettings areas={areas.map((a) => ({ id: a.id, name: a.name, color: a.color, archived: !!a.archivedAt }))} /> : null}
      {tab === "data" ? (
        <div className="flex flex-col gap-8">
          <Section title="Export" description="Your data is yours. Exports include every item, relation and history event.">
            <div className="flex flex-wrap gap-2">
              <a href="/api/export" className={buttonVariants({ variant: "primary" })}>Download JSON export</a>
              <a href="/api/export?format=markdown" className={buttonVariants({})}>Download notes as Markdown</a>
            </div>
            <p className="text-xs text-fg-subtle">Format <code className="font-mono">lifeos-export@1</code>. Import is planned for Phase 2.</p>
          </Section>
          <Section title="Backups" description="History is not a backup.">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              The activity timeline records what happened inside LifeOS; it can&apos;t restore a lost database. Back up PostgreSQL on a schedule (e.g. a nightly <code className="font-mono">pg_dump</code>) — see the README&apos;s “Backups” section.
            </p>
          </Section>
        </div>
      ) : null}
      {tab === "security" ? (
        <div className="flex flex-col gap-10">
          <Section title="Change password">
            <PasswordForm />
          </Section>
          <Section title="Sessions" description="Signs out every browser, including this one.">
            <SignOutEverywhere />
          </Section>
        </div>
      ) : null}
      {tab === "ai" ? (
        <div className="flex flex-col gap-8">
          <Section title="Provider">
            {provider ? (
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Connected: <span className="font-medium text-fg">{provider.label}</span>. Data stays in your database; when you use an AI feature, only the relevant items from the modules allowed below are sent to this provider for that request. Every AI change is a proposal you approve, and approved actions are audited in your timeline.
              </p>
            ) : (
              <p className="text-[13px] leading-relaxed text-fg-muted">
                No provider configured — nothing is sent to any AI service. Set <code className="font-mono">ANTHROPIC_API_KEY</code> (optionally <code className="font-mono">AI_MODEL</code>) in the server environment and restart to enable the assistant. Quick-capture suggestions keep using local rules.
              </p>
            )}
          </Section>
          <Section title="What the AI may use" description="Unchecked modules are never included in context or search results sent to the AI.">
            <AiPrivacySettings privacy={resolvePrivacy(settings?.aiPrivacy)} modules={PRIVACY_MODULES.map((m) => ({ key: m.key, label: m.label }))} />
          </Section>
          <Section title="Memory">
            <p className="text-[13px] text-fg-muted">
              Long-term memory is {settings?.memoryEnabled ? "on" : "off"}. <Link href="/ai/memory" className="text-fg underline-offset-2 hover:underline">Manage memories</Link> — they&apos;re separate from chat history and only change when you add or approve one.
            </p>
          </Section>
        </div>
      ) : null}
      {tab === "roadmap" ? (
        <div className="flex flex-col gap-8">
          <p className="text-[13px] text-fg-muted">Live: Phase 1 (Dashboard, Today, Inbox, Tasks, Goals, Targets, Routine, Ideas, Projects, Decisions, Notes, Skills, Sessions, Timeline, Search) and the Phase 2 AI Brain (Personal AI with modes, privacy-aware context, proposals with approval, AI Planner, AI Memory, AI capture suggestions). Coming next, on the same data:</p>
          {ROADMAP.map((r) => (
            <Section key={r.phase} title={`${r.phase} · ${r.title}`}>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-muted">
                {r.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      ) : null}
    </Page>
  );
}
