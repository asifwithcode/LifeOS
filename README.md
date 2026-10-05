# LifeOS

A private, AI-ready **personal life operating system**: goals, targets, routine, tasks, projects,
ideas, notes, skills and learning — connected, so that one logged session advances a target, a
skill, a project and your timeline at the same time.

```
Capture → Organize → Learn → Plan → Do → Track → Review → Improve
```

Architecture, schema, route map, progress model, AI design and design system live in
[`docs/`](docs/README.md). **Phase 1 (Foundation) is implemented**; Phases 2–5 are designed and
listed in-app under *Settings → Roadmap*.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 · Radix
primitives · PostgreSQL 16 · Drizzle ORM · Zod · Vitest. No Redis, queues or object storage
yet — each arrives with the phase that needs it.

## Getting started

```bash
# 1. PostgreSQL 16 with a database and user
createuser -P lifeos            # password: lifeos (or change .env)
createdb -O lifeos lifeos
createdb -O lifeos lifeos_test  # for integration tests

# 2. Configure and install
cp .env.example .env
npm install

# 3. Create the schema
npm run db:migrate

# 4. Run
npm run dev                     # http://localhost:3000 → create your account
```

The first visitor creates the (only) account; set `ALLOW_REGISTRATION=true` to allow more.

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop / build / serve |
| `npm test` | 67 domain unit tests + 18 PostgreSQL integration tests (uses `.env.test`; refuses non-test databases) |
| `npm run typecheck` · `npm run lint` | Static checks |
| `npm run db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

## Code map

```
src/lib/domain/      Pure business rules (progress, targets/pace, recurrence, routine,
                     dependencies, capture classifier, refs). No I/O, fully unit-tested.
src/lib/validation.ts Zod schemas shared by forms, actions and (Phase 2) AI actions.
src/server/db/       Drizzle schema, client, migrator.     drizzle/  SQL migrations.
src/server/engines/  Shared engines: refs (PRJ-0001), activity events, relations, search.
src/server/services/ Use-cases per module. Take an Actor; own transactions; emit events.
src/server/auth/     scrypt passwords, hashed DB sessions, data-access layer.
src/actions/         Server actions: authenticate → validate → service → revalidate.
src/app/             Routes (server components) + small client islands.
src/components/      UI kit, app shell, forms, shared entity components.
tests/integration/   Workflow tests against a real database.
```

## Phase 1 status

| Area | Status |
| --- | --- |
| Auth (first-user registration, login, logout, sessions, rate limit, password change, sign out everywhere) | Done |
| App shell (sidebar, mobile tab bar, ⌘K palette, ⌘J / `c` quick capture, themes + accent, offline indicator) | Done |
| Dashboard (customizable widgets, computed today summary) · Today (routine timeline, targets, tasks, logged sessions, date navigation, per-date template override) | Done |
| Inbox (rule-based suggestions, confirm/edit/convert, bulk accept/discard, restore) | Done |
| Tasks (views, subtasks, dependencies with cycle detection, recurrence, links, tags, archive/trash, history) | Done |
| Goals + weighted milestones · Targets (6 period types, any unit, pace & behind-schedule) · Sessions | Done |
| Routine (templates, weekday assignment, blocks, completion → session, skip/reset, 14-day adherence) | Done |
| Ideas (pipeline, convert → project keeping the idea) · Projects (milestones/tasks progress, decisions) · Decision log | Done |
| Notes (Markdown, autosave, collections, tags, `[[REF]]` mentions → backlinks, selection → task/idea) | Done |
| Skills (topic roadmap, evidence-based progress, time invested, 28-day practice) | Done |
| Activity events + timeline · Entity relations · Full-text search · Human refs · JSON/Markdown export | Done |
| AI features, semantic search, reminders delivery, data import | Not in Phase 1 (see roadmap). No AI calls are made; quick-capture suggestions are deterministic rules. |

## Backups

Activity history is product data, not a backup. Back up PostgreSQL on a schedule, e.g.:

```bash
pg_dump --format=custom --file="lifeos-$(date +%F).dump" "$DATABASE_URL"
# restore: pg_restore --clean --dbname="$DATABASE_URL" lifeos-YYYY-MM-DD.dump
```

You can also download a portable JSON export at any time from *Settings → Data & backup*.
