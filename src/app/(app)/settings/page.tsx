import { requireUser } from "@/server/auth/dal";
import { listLifeAreas } from "@/server/services/users";
import { Page, PageHeader, Section, Tabs } from "@/components/ui/layout";
import { buttonVariants } from "@/components/ui/button";
import { AppearanceSettings, LifeAreasSettings, PasswordForm, ProfileForm, SignOutEverywhere } from "./settings-client";

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
  { phase: "Phase 2", title: "AI Brain", items: ["Personal AI with modes", "Context retrieval with privacy controls", "AI Planner & smart day plan", "Typed AI actions with preview → approval", "AI Memory", "Semantic search (pgvector)", "Conversation → notes, tasks, plans"] },
  { phase: "Phase 3", title: "Learning OS", items: ["Study hub (program → subject → chapter → topic)", "Learning paths with prerequisites", "Courses & YouTube video learning with timestamped notes", "Books & reading sessions", "AI Teacher", "Flashcards with spaced repetition", "Practice lab, assessments, mistake book"] },
  { phase: "Phase 4", title: "Life management", items: ["Calendar", "Habits", "Focus mode (Pomodoro/stopwatch → sessions)", "Journal", "Future plans & scenarios", "Career center & study abroad", "Portfolio & file vault", "Reminders"] },
  { phase: "Phase 5", title: "Intelligence", items: ["Daily / weekly / monthly reviews", "Planned vs actual", "Forecasting", "Behind-schedule recommendations", "Analytics & On This Day"] },
];

export default async function SettingsPage(props: PageProps<"/settings">) {
  const { user, settings } = await requireUser();
  const sp = await props.searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "profile";
  const areas = tab === "areas" ? await listLifeAreas(user.id, true) : [];
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
        <div className="flex flex-col gap-6">
          <Section title="AI status">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              No AI provider is connected and no data has been sent to any AI service. LifeOS works fully without AI — quick-capture suggestions use transparent rules that run on your server.
            </p>
          </Section>
          <Section title="Privacy defaults (applied when the AI Brain ships)" description="You'll be able to change these per module before anything is sent.">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
              {Object.entries(settings?.aiPrivacy ?? {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2 border-b border-border py-1">
                  <span className="capitalize">{k}</span>
                  <span className={v ? "text-fg-muted" : "text-fg-subtle"}>{v ? "allowed" : "off"}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}
      {tab === "roadmap" ? (
        <div className="flex flex-col gap-8">
          <p className="text-[13px] text-fg-muted">Phase 1 (Foundation) is live: Dashboard, Today, Inbox, Tasks, Goals, Targets, Routine, Ideas, Projects, Decisions, Notes, Skills, Sessions, Timeline, Search. These modules come next and will plug into the same data:</p>
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
