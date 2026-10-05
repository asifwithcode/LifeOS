# 01 — System Architecture

LifeOS is a private, AI-assisted operating system for one person's life: goals, targets,
routine, tasks, learning, projects, ideas and knowledge — all connected.

The loop the whole product serves:

```
Capture → Organize → Learn → Plan → Do → Track → Review → Improve
```

Every screen should help answer one of four questions:

| Question                     | Answered by                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| Where do I want to go?       | Goals, Targets, Future Plans                                    |
| Where am I now?              | Progress Engine (projects, skills, goals, targets), Timeline   |
| What should I do today?      | Today, Routine, Tasks, Dashboard                               |
| What should I do next?       | AI Planner / recommendations (Phase 2+), Reviews (Phase 5)     |

---

## 1. Requirements analysis — shared domain concepts

Reading the 97 requirement sections, most "features" are compositions of a small number of
shared concepts. Building those concepts once is the single most important architectural
decision.

| Shared concept        | Appears in                                                                   | Implemented as                   |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| Owned entity          | every module                                                                 | `userId`-scoped tables + UUID PK |
| Human reference ID    | Projects, Ideas, Goals, Tasks, Notes, Sessions …                             | `ref` column + `ref_counters`    |
| Lifecycle             | archive / restore / soft delete everywhere                                   | `archivedAt`, `deletedAt`        |
| Relationship          | "everything is connectable"                                                  | FKs + `entity_relations`         |
| Activity event        | timeline, history, analytics, reviews, on-this-day                           | `activity_events` (append-only)  |
| Work session          | study session, focus session, reading session, routine completion, practice | `work_sessions`                  |
| Measurable target     | daily/weekly/monthly targets, planned vs actual, forecasting                 | `targets` + Progress Engine      |
| Milestone             | goals, projects, roadmaps, learning paths                                    | `milestones`                     |
| Dependency            | tasks, milestones, learning-path prerequisites                               | `dependencies`                   |
| Recurrence            | tasks, routine, habits, reminders                                            | `RecurrenceRule` (pure engine)   |
| Tag / Life area       | categorisation across modules                                                | `tags`, `entity_tags`, `life_areas` |
| Searchable document   | universal search, command palette, AI retrieval                             | `search_index` (+ embeddings P2) |
| Proposed action       | AI actions, quick-capture suggestions, plan acceptance                       | `ProposedAction` → approval → service call |

The key insight: **a "study session", a "focus session", a "reading session", a completed
routine block with time attached, and a manual "Kotlin practice — 1h" log are the same thing**:
a `work_session` with an activity type, a duration and/or quantity, and optional links to a
skill / project / task / goal / routine item. Targets, analytics, skill time-invested, the
timeline and reviews all read from that one table. This is how "enter data once, use it
everywhere" (§72) is enforced structurally rather than by convention.

---

## 2. Technology choices

| Concern          | Choice                                   | Why                                                                                          |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router), React 19, TS    | One deployable; server components for data-heavy views, server actions for mutations.       |
| Styling          | Tailwind CSS v4 + CSS variable tokens    | Token-driven theming (dark/light/system + accent) without a component-library look.         |
| Primitives       | Radix (`radix-ui`), `cmdk`, `lucide`     | Accessible dialogs/menus/command palette; we own the visual layer (shadcn-style).           |
| Database         | PostgreSQL 16                            | Relational integrity, full-text search, JSONB for typed payloads, pgvector for Phase 2.    |
| ORM              | Drizzle ORM + drizzle-kit migrations     | SQL-close, typed, zero runtime magic, migrations are reviewable SQL files.                 |
| Validation       | Zod                                      | Single schema used by forms, server actions and (Phase 2) AI structured-output validation.  |
| Auth             | First-party session auth (scrypt + DB sessions) | Personal app, no third-party dependency; hashed tokens, httpOnly cookies, revocable. |
| Tests            | Vitest (unit + DB integration)           | Business rules live in pure modules / services, testable without the UI.                    |
| Background jobs  | **Not in Phase 1.** Phase 2: Postgres-backed job table (`jobs`) polled by a worker. | Avoids Redis until needed. See §8. |
| File storage     | Phase 4: S3-compatible (MinIO locally)   | Not needed until File Vault / PDFs.                                                          |

**Why not a separate Kotlin/Ktor service?** No requirement in Phases 1–3 needs a JVM runtime,
long-lived sockets or CPU-heavy work. A second service would double deployment, auth and type
sharing costs for no gain. The service layer below is framework-agnostic TypeScript, so it can
be extracted behind an HTTP boundary later if a real need (e.g. heavy ingestion workers) arises.

**Infrastructure deliberately not added yet:** Redis, message brokers, object storage, vector DB
separate from Postgres. Each is introduced in the phase that first needs it (see roadmap).

---

## 3. Layered architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  app/ (routes)       Server Components render; Client Components   │
│                      handle interaction. No business logic here.   │
├────────────────────────────────────────────────────────────────────┤
│  actions/            Server Actions: authenticate → validate (zod) │
│                      → call service → refresh(). Thin.             │
├────────────────────────────────────────────────────────────────────┤
│  server/services/    Use-cases per module (tasks, goals, …).       │
│                      Always take `userId` explicitly. Own DB       │
│                      transactions. Call engines.                   │
├────────────────────────────────────────────────────────────────────┤
│  server/engines/     Shared systems: Activity, Relations, Search,  │
│                      Refs (IDs), Progress loaders.                 │
├────────────────────────────────────────────────────────────────────┤
│  lib/domain/         PURE functions: progress maths, periods,      │
│                      recurrence, routine resolution, dependency    │
│                      graph, capture classifier. No I/O. 100% unit  │
│                      tested.                                       │
├────────────────────────────────────────────────────────────────────┤
│  server/db/          Drizzle schema + client + migrations          │
└────────────────────────────────────────────────────────────────────┘
```

Rules:

1. **Pages never write to the DB directly**, and never import `server/db` for mutations.
2. **Every service function takes `userId` as its first argument** and every query filters by it.
   Authorization is therefore structural: there is no code path that reads another user's row.
3. **Every important mutation emits an activity event** through `recordEvent()` inside the same
   transaction, and re-indexes the entity for search through `indexEntity()`.
4. **Important calculations live in `lib/domain`**, never in components (§95).
5. **AI code (Phase 2) calls the same services** as the UI. The AI never gets a DB handle.

### Shared engines (§91)

| Engine              | Location                                   | Phase | Responsibility                                                   |
| ------------------- | ------------------------------------------ | ----- | ---------------------------------------------------------------- |
| Task Engine         | `services/tasks.ts`, `domain/recurrence.ts`, `domain/dependencies.ts` | 1 | status, recurrence, subtasks, dependencies, blocked detection |
| Progress Engine     | `domain/progress.ts`, `domain/targets.ts`, `engines/progress.ts` | 1 | explainable progress for every entity type |
| Activity Engine     | `engines/activity.ts`                      | 1     | append-only event log, timeline queries                          |
| Relationship Engine | `engines/relations.ts`                     | 1     | typed links, backlinks, link resolution                           |
| Search Engine       | `engines/search.ts`                        | 1 (FTS), 2 (semantic) | indexing + ranked retrieval                   |
| Reference Engine    | `engines/refs.ts`                          | 1     | `PRJ-0001`-style IDs                                              |
| AI Context Engine   | `server/ai/context/`                       | 2     | permission-aware retrieval for prompts                            |
| AI Action Engine    | `server/ai/actions/`                       | 2     | typed proposals → preview → approval → service execution          |
| Notification Engine | `server/notifications/`                    | 4     | reminders, rules                                                  |
| Learning Engine     | `server/learning/`                         | 3     | spaced repetition, mastery evidence                               |
| Analytics Engine    | `server/analytics/`                        | 5     | aggregations over sessions/events                                 |

---

## 4. Module dependency map

Arrows mean "depends on / reads from". Modules never call each other's internals; they meet at
engines or through explicit service functions.

```
                         ┌──────────────┐
                         │  Personal AI │ (P2) ── reads via AI Context Engine,
                         └──────┬───────┘        writes only via AI Action Engine
                                │
        ┌───────────────────────┼─────────────────────────────┐
        ▼                       ▼                             ▼
  ┌──────────┐           ┌────────────┐                ┌────────────┐
  │ Dashboard│──────────▶│   Today    │◀───────────────│  Reviews   │ (P5)
  └────┬─────┘           └─────┬──────┘                └─────┬──────┘
       │                       │                             │
       ▼                       ▼                             ▼
 ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐   ┌───────────┐
 │  Goals  │─▶│ Targets │◀─│ Routine │  │  Tasks   │   │ Analytics │ (P5)
 └────┬────┘  └────┬────┘  └────┬────┘  └────┬─────┘   └─────┬─────┘
      │            │            │            │               │
      │            ▼            ▼            ▼               │
      │      ┌──────────────────────────────────────┐        │
      │      │         Work Sessions (SES)           │◀───────┘
      │      └──────────────────────────────────────┘
      ▼            ▲            ▲             ▲
 ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐
 │ Projects │ │ Skills  │ │ Learning │ │ Focus (P4)│
 └────┬─────┘ └────┬────┘ │ (P3)     │ └───────────┘
      │            │      └──────────┘
      ▼            ▼
 ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐
 │  Ideas   │ │  Notes   │ │  Inbox  │ │Decisions│
 └──────────┘ └──────────┘ └─────────┘ └─────────┘

 Cross-cutting (used by all): Refs · Activity · Relations · Search · Life Areas · Tags
```

---

## 5. Activity / event architecture (§50)

Two complementary records:

1. **State tables** hold current state (`tasks.status`, `milestones.status`).
2. **`activity_events`** is an append-only log of meaningful changes:

```ts
{
  id, userId,
  type: 'task.completed' | 'session.logged' | 'milestone.completed' | …,
  entityType: 'task', entityId, entityRef: 'TSK-0042', entityTitle: 'Build API', // snapshot
  occurredAt, localDate,          // localDate in the user's timezone, for day bucketing
  payload: { …typed per event type… }
}
```

- Events are written **in the same transaction** as the state change (no lost history).
- `entityTitle` is a snapshot so the timeline stays readable after renames/deletes.
- Progress is never stored as a mutable number; it is **derived** from state + sessions.
  Events provide history ("when did this milestone complete?"), timeline, analytics and the
  raw material for reviews and On-This-Day.
- Event types are a closed, typed union in `lib/domain/events.ts`; adding a type is a code change.

Phase 1 event types: `task.created|completed|reopened|updated|archived|deleted`,
`goal.*`, `milestone.completed|reopened`, `project.*`, `idea.created|status_changed|converted`,
`note.created|updated`, `skill.created|level_changed|topic_completed`, `session.logged|deleted`,
`target.created|updated`, `routine.item_completed|item_skipped`, `inbox.captured|processed`,
`decision.recorded`, `entity.linked|unlinked`.

---

## 6. Security (§79)

| Control                  | Implementation                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Password storage         | Node `crypto.scrypt` (N=2^15, r=8, p=1, 64-byte key, per-user salt), constant-time compare |
| Sessions                 | 32 random bytes → cookie; only SHA-256 hash stored; 30-day sliding expiry; revocable |
| Cookies                  | `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`                        |
| CSRF                     | Mutations are Server Actions (POST + Next.js origin check). Route handlers are GET-only and read-only, except those that verify `Origin`. |
| Authorization            | `requireUser()` in every page/action; services filter by `userId` on every query   |
| Optimistic gate          | `proxy.ts` redirects unauthenticated requests early; real check stays in the DAL  |
| Validation               | Zod at every action boundary; DB constraints as the last line                       |
| Rate limiting            | Login/registration limited per IP+email (in-memory sliding window; swap for Redis when multi-instance) |
| Registration             | First user only, unless `ALLOW_REGISTRATION=true`                                   |
| Secrets                  | Only `server-only` modules read `process.env`; nothing secret reaches client bundles |
| AI audit trail (P2)      | Every executed AI action stored in `ai_actions` with proposal, approver, result     |
| File uploads (P4)        | Size + MIME allow-list, server-generated keys, never executed, private bucket      |

---

## 7. Data portability & backup (§88, §89)

- **Export** (Phase 1): Settings → Data → JSON export of every user-owned table, plus notes as
  a Markdown bundle. Format is versioned (`lifeos-export@1`).
- **Import** (Phase 2): idempotent JSON import keyed on internal IDs.
- **Backups are not history.** Activity events are product history; backups are operational:
  `pg_dump` on a schedule (documented in README) + object-storage versioning for files (P4).

---

## 8. Background jobs (§78)

Phase 1 has no asynchronous work. Phase 2 introduces a `jobs` table:

```
jobs(id, userId, kind, payload jsonb, status queued|running|done|failed, attempts, runAfter, lastError, createdAt, updatedAt)
```

A worker process (`npm run worker`) claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`.
Kinds: `embed.entity`, `document.process`, `review.generate`, `import.playlist`, `summary.generate`.
Status is visible in Settings → Jobs. Redis/BullMQ is only adopted if throughput demands it.

---

## 9. Integrations (§90)

`server/integrations/<provider>/` each implement:

```ts
interface Integration {
  id: 'youtube' | 'google-calendar' | 'github' | …
  connect(userId, credentials): Promise<void>   // OAuth tokens encrypted at rest
  disconnect(userId): Promise<void>
  capabilities: ('import' | 'sync' | 'embed')[]
}
```

Core features never require an integration: a YouTube lesson can always be tracked manually
when the API is unavailable.

---

## 10. Offline & failure posture

- The app is fully usable without AI (product rule 10). AI surfaces show "AI unavailable" and
  keep the manual path.
- Offline: an online/offline indicator in the shell; mutations fail visibly with retry
  (no silent queue in Phase 1). A PWA/offline capture queue is a Phase 4 candidate.
