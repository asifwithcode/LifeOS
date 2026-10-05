# 07 — Phased Implementation Plan

## MVP boundary

Phase 1 must be **genuinely usable daily** without AI: capture → organise → plan the day →
do the work (log it) → see real progress. Anything that cannot be built with real data,
real CRUD, validation and all UI states is deferred rather than stubbed.

## Phase 1 — Foundation (this iteration)

| # | Milestone                         | Includes                                                                   |
|---|-----------------------------------|----------------------------------------------------------------------------|
| 1 | Project skeleton                  | Next.js 16, Tailwind tokens, Drizzle, migrations, Vitest, lint             |
| 2 | Shared engines                    | refs, activity events, relations, search index, dependencies, domain libs |
| 3 | Auth                              | register (first user), login, logout, sessions, proxy gate, rate limit     |
| 4 | App shell                         | sidebar, mobile nav, theme/accent, command palette, quick capture, toasts  |
| 5 | Tasks                             | CRUD, views, subtasks, dependencies, recurrence, links, history            |
| 6 | Goals & milestones                | CRUD, weighted progress, linked targets/projects/tasks                     |
| 7 | Work sessions & targets           | log sessions, period targets, pace/behind detection                        |
| 8 | Routine                           | templates, items, weekday + date overrides, completions, history           |
| 9 | Ideas, projects, decisions        | idea pipeline, convert idea → project, milestones, decision log            |
|10 | Notes                             | markdown editor, collections, `[[REF]]` mentions, backlinks                |
|11 | Skills                            | topic roadmap, levels, time invested, evidence progress                    |
|12 | Inbox                             | capture, rule-based suggestions, convert, bulk process                     |
|13 | Today & Dashboard                 | routine timeline, targets, priorities, widgets customisation               |
|14 | Search, timeline, settings        | FTS search page + palette, timeline, profile/appearance/life areas/export  |
|15 | Tests                             | domain unit tests + service integration tests against Postgres             |

### Status

See the project README "Phase 1 status" table — it is updated as milestones land and states
plainly what is not done.

## Phase 2 — AI Brain

Provider abstraction (Anthropic default) · `jobs` worker · pgvector embeddings + hybrid search ·
Personal AI chat with modes · Context Engine with privacy flags · typed action proposals,
preview, approval, audit · AI Memory page · conversation → entity conversion · AI capture
classifier · AI Planner (day plan from routine + tasks + targets) · temporary routine adjustments ·
JSON import.

## Phase 3 — Learning OS

Study hierarchy (`study_nodes`) · learning paths with prerequisites · courses & lessons ·
YouTube embed (IFrame API: seek, position) + manual progress for others · playlist import
(YouTube Data API, user-supplied key/OAuth) · timestamped video notes · transcript-grounded AI
(only when captions are available) · books + reading sessions · flashcards with SM-2 ·
assessments, practice lab, mistake book · AI Teacher · Continue Learning widget · resources.

## Phase 4 — Life Management

Calendar (day/week/month/agenda) · habits · focus mode (stopwatch/pomodoro → work_sessions) ·
journal · future plans & scenarios · career center · study-abroad workspace with provenance ·
portfolio drafts · file vault (S3) · notifications/reminders engine · PWA capture.

## Phase 5 — Intelligence

Daily/weekly/monthly reviews (generated from data, edited before saving) · planned vs actual ·
forecasting · behind-schedule recommendations with revised plans · analytics with ranges ·
On This Day · morning brief.

## Definition of done (every feature)

Real data model · real CRUD · Zod validation · loading/empty/error states · responsive ·
persisted · reachable from navigation · searchable where relevant · events emitted ·
business rules unit-tested.
