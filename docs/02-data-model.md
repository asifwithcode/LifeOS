# 02 — Data Model

PostgreSQL, managed by Drizzle (`src/server/db/schema.ts` is the source of truth for
implemented tables; migrations live in `drizzle/`).

## Conventions

| Convention        | Rule                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Primary key       | `id uuid default gen_random_uuid()` — never shown to users                                  |
| Ownership         | every user-data table has `user_id uuid not null references users on delete cascade`        |
| Human reference   | `ref text` such as `TSK-0042`, unique per `(user_id, ref)`; **never** used as a FK          |
| Timestamps        | `created_at`, `updated_at` (`timestamptz`)                                                  |
| Lifecycle         | `archived_at` (hidden from active views, restorable), `deleted_at` (soft-deleted, restorable from Trash; purged later) |
| Local dates       | Day-bucketed facts store `local_date date` computed in the user's timezone at write time   |
| Enums             | `text` + Zod/TS union (cheap to evolve) rather than Postgres enums                          |
| Money / amounts   | `numeric` (never float) for target amounts and quantities                                   |
| Progress          | **never stored** as a mutable column; derived (see 04-progress-model.md)                    |

### Reference prefixes (§63)

```
GOL Goal        TGT Target      MIL Milestone   PLN Plan (P2)
PRJ Project     IDE Idea        DEC Decision    TSK Task
RTN Routine item HAB Habit (P4) SKL Skill       LPT Learning path (P3)
CRS Course (P3) LSN Lesson (P3) BOK Book (P3)   NTE Note
RES Resource (P3) FIL File (P4) SES Session     INB Inbox item
JRN Journal (P4) MEM AI memory (P2) ACT AI action (P2)
```

Allocation: `ref_counters(user_id, prefix, value)` incremented atomically with
`INSERT … ON CONFLICT DO UPDATE SET value = ref_counters.value + 1 RETURNING value`
inside the creating transaction. Gaps are acceptable; reuse is not.

---

## Entity overview (all phases)

`P1` = implemented in Phase 1. Others are designed now so Phase 1 does not paint us into a corner.

```
IDENTITY        users P1 · auth_sessions P1 · user_settings P1
SHARED          ref_counters P1 · life_areas P1 · tags P1 · entity_tags P1
                entity_relations P1 · activity_events P1 · search_index P1 · dependencies P1
PLANNING        goals P1 · milestones P1 · targets P1 · routine_templates P1 · routine_items P1
                routine_day_plans P1 · routine_completions P1 · tasks P1
                plans P2 · routine_adjustments P2 · habits P4 · habit_logs P4 · calendar_events P4
WORK            work_sessions P1
BUILD           ideas P1 · projects P1 · decisions P1
KNOWLEDGE       notes P1 · inbox_items P1
                resources P3 · files P4 · research_* P4 · journal_entries P4
LEARNING        skills P1 · skill_topics P1
                learning_paths P3 · learning_path_steps P3 · courses P3 · lessons P3
                study_programs/subjects/chapters/topics P3 (one self-referencing `study_nodes`)
                books P3 · flashcards P3 · flashcard_reviews P3 · assessments P3
                assessment_attempts P3 · mistakes P3 · video_notes P3
AI              ai_conversations P2 · ai_messages P2 · ai_memories P2 · ai_actions P2
                embeddings P2 (pgvector) · jobs P2
REVIEWS         daily_reviews P5 · weekly_reviews P5 · monthly_reviews P5
CAREER          career_roles P4 · applications P4 · portfolio_entries P4 · achievements P4
                study_abroad_* P4
FINANCE (opt.)  finance_* (isolated schema, optional module)
```

---

## Phase 1 tables

### Identity

```
users
  id uuid pk
  email text unique (stored lower-case)
  name text
  password_hash text            -- scrypt$N$r$p$salt$hash
  timezone text default 'UTC'   -- IANA, drives local_date
  created_at, updated_at

auth_sessions
  id text pk                    -- sha256(token) hex; raw token only in cookie
  user_id → users
  expires_at timestamptz
  created_at, last_seen_at
  user_agent text, ip text

user_settings
  user_id pk → users
  theme 'system'|'light'|'dark'
  accent text                   -- one of the accent palette keys
  week_starts_on int (0=Sun,1=Mon)
  dashboard_widgets jsonb       -- ordered list of {id, visible}
  ai_privacy jsonb              -- P2: per-module AI access flags (defaults all false)
  memory_enabled bool           -- P2
  updated_at
```

### Shared

```
life_areas      id, user_id, name, color, sort_order, archived_at
tags            id, user_id, name (unique per user, lower-case), color
entity_tags     user_id, tag_id → tags, entity_type, entity_id   pk(tag_id, entity_type, entity_id)

entity_relations                                   -- generic many-to-many links
  id, user_id
  source_type, source_id
  target_type, target_id
  relation_type 'related'|'supports'|'mentions'|'derived_from'|'blocks'|'part_of'
  created_at
  unique(user_id, source_type, source_id, target_type, target_id, relation_type)

dependencies                                       -- tasks & milestones (P3: learning steps)
  id, user_id
  blocked_type 'task'|'milestone', blocked_id      -- the item that waits
  blocker_type 'task'|'milestone', blocker_id      -- the item that must finish first
  unique(blocked_type, blocked_id, blocker_type, blocker_id)
  -- cycles rejected in the service (domain/dependencies.ts wouldCreateCycle)

activity_events                                    -- append-only
  id, user_id, type, entity_type, entity_id, entity_ref, entity_title
  occurred_at timestamptz, local_date date
  payload jsonb
  index(user_id, occurred_at desc), index(user_id, entity_type, entity_id)

search_index                                       -- one row per searchable entity
  user_id, entity_type, entity_id (pk: entity_type+entity_id)
  ref, title, body, url_path
  archived bool
  tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', ref||' '||title),'A') ||
                                    setweight(to_tsvector('english', body),'B')) STORED
  updated_at
  gin(tsv)
  -- P2 adds: embedding vector(1536), embedding_model text, embedded_at
```

**When to use a FK vs `entity_relations`:**

- Structural, single-valued ownership → FK (`tasks.project_id`, `milestones.goal_id`,
  `skill_topics.skill_id`). These drive progress calculations and cascade rules.
- Many-to-many, cross-module, or user-created links ("this note relates to MAYA and the IoT
  goal") → `entity_relations`. Notes' `[[PRJ-0001]]` mentions are materialised as
  `relation_type = 'mentions'` rows on save, giving backlinks for free.

### Planning

```
goals
  id, user_id, ref GOL
  title, description, why
  life_area_id → life_areas
  status 'not_started'|'active'|'paused'|'achieved'|'abandoned'
  priority 'low'|'medium'|'high'
  start_date, target_date date
  progress_mode 'milestones'|'targets'
  completed_at, created_at, updated_at, archived_at, deleted_at

milestones
  id, user_id, ref MIL
  goal_id → goals (nullable)   project_id → projects (nullable)   CHECK exactly one set
  title, description
  status 'pending'|'in_progress'|'done'
  weight int default 1 (1..10)
  due_date, sort_order, completed_at, created_at, updated_at

targets
  id, user_id, ref TGT
  title, description
  period 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'|'custom'
  custom_start, custom_end date            -- required when period = custom
  amount numeric                           -- e.g. 4
  unit 'minutes'|'hours'|'pages'|'chapters'|'sessions'|'tasks'|'lessons'|'videos'|'books'|'projects'|'custom'
  custom_unit text
  -- matching filters: which work counts toward this target (all set filters must match)
  activity_type text null, life_area_id, skill_id, project_id
  goal_id → goals (target measures a goal)
  status 'active'|'paused'
  created_at, updated_at, archived_at, deleted_at

routine_templates
  id, user_id, name
  kind 'normal'|'university'|'weekend'|'exam'|'holiday'|'custom'
  weekdays int[]                            -- default days this template applies (0..6)
  is_default bool                           -- fallback when no weekday template matches
  sort_order, archived_at, created_at, updated_at

routine_items
  id, user_id, ref RTN, template_id → routine_templates
  title, start_time time, duration_minutes int
  days_of_week int[] null                   -- null = every day the template applies
  activity_type text, life_area_id, priority
  reminder_minutes_before int null          -- stored now; delivered by Notification Engine P4
  goal_id, skill_id, project_id
  log_as_session bool                       -- completing it logs a work_session
  sort_order, archived_at, created_at, updated_at
  -- items with history are archived, never hard-deleted

routine_day_plans                           -- per-date override ("Exam Period" on 2026-11-02)
  user_id, date  pk(user_id, date)
  template_id → routine_templates
  note

routine_completions                         -- routine history
  id, user_id, routine_item_id, date
  status 'done'|'skipped'
  actual_minutes int, session_id → work_sessions
  item_title text (snapshot), planned_minutes int (snapshot)
  completed_at
  unique(routine_item_id, date)

tasks
  id, user_id, ref TSK
  title, description
  status 'todo'|'in_progress'|'done'|'cancelled'
  priority 'none'|'low'|'medium'|'high'|'urgent'
  due_date, start_date date, someday bool
  estimated_minutes int
  recurrence jsonb null                     -- RecurrenceRule {freq, interval, byWeekday?}
  series_id uuid null                       -- shared by all instances of a recurring task
  parent_task_id → tasks (subtasks)
  project_id, goal_id, skill_id, milestone_id, life_area_id, routine_item_id
  sort_order, completed_at
  created_at, updated_at, archived_at, deleted_at
  -- actual duration = SUM(work_sessions.duration_minutes WHERE task_id = id) (derived)
```

### Work

```
work_sessions  (SES)  -- the single record of "time/effort spent"
  id, user_id, ref
  activity_type 'study'|'coding'|'reading'|'practice'|'project'|'language'|'exercise'|'writing'|'research'|'other'
  title, notes
  started_at timestamptz, ended_at timestamptz null
  duration_minutes int null
  quantity numeric null, unit text null      -- e.g. 18 pages
  local_date date
  life_area_id, skill_id, project_id, task_id, goal_id, routine_item_id
  source 'manual'|'routine'|'task'|'focus'(P4)|'reading'(P3)|'lesson'(P3)
  created_at, deleted_at
  CHECK duration_minutes IS NOT NULL OR quantity IS NOT NULL
```

### Build

```
ideas
  id, user_id, ref IDE
  title, description, category
  status 'captured'|'exploring'|'researching'|'validated'|'planned'|'building'|'archived'
  life_area_id
  analysis jsonb null                       -- P2: structured AI analysis (problem, users, MVP…)
  converted_project_id → projects null
  created_at, updated_at, deleted_at

projects
  id, user_id, ref PRJ
  title, summary, description
  status 'planned'|'active'|'on_hold'|'completed'|'cancelled'
  priority, life_area_id, goal_id → goals
  start_date, target_date
  progress_mode 'milestones'|'tasks'
  source_idea_id → ideas
  completed_at, created_at, updated_at, archived_at, deleted_at

decisions
  id, user_id, ref DEC
  title, decision, context, alternatives, consequences
  decided_on date
  project_id → projects null
  status 'active'|'superseded'|'reverted'
  created_at, updated_at, deleted_at
```

### Knowledge & capture

```
notes
  id, user_id, ref NTE
  title, content (markdown), collection text null
  pinned bool, life_area_id
  created_at, updated_at, archived_at, deleted_at

inbox_items
  id, user_id, ref INB
  content text, url text null
  kind_hint 'thought'|'task'|'idea'|'note'|'url'|'resource'|'study'|'project_update'|null
  suggestion jsonb                          -- {type, projectId?, tags[], priority?, reasons[], source:'rules'|'ai'}
  status 'pending'|'processed'|'discarded'
  processed_entity_type, processed_entity_id, processed_at
  created_at
```

### Learning (Phase 1 subset)

```
skills
  id, user_id, ref SKL
  name, description
  category 'technical'|'academic'|'language'|'creative'|'professional'|'other'
  life_area_id
  current_level int 0..5, target_level int 0..5
  status 'active'|'paused'|'achieved'
  created_at, updated_at, archived_at, deleted_at

skill_topics
  id, user_id, skill_id → skills
  title, status 'not_started'|'learning'|'done'
  sort_order, completed_at
```

Level scale (shown in UI): 0 None · 1 Beginner · 2 Elementary · 3 Intermediate · 4 Advanced · 5 Expert.
The level is a **self-assessment** and is labelled as such; it is not presented as a measured value.

---

## Later-phase tables (designed, not yet migrated)

```
ai_conversations  id, user_id, title, mode, created_at, updated_at, archived_at
ai_messages       id, conversation_id, role, content, context_refs jsonb, created_at
ai_memories       id, user_id, ref MEM, content, kind 'preference'|'goal'|'decision'|'constraint'|'plan'|'fact',
                  source 'manual'|'ai_suggested', source_message_id, status 'active'|'archived', created_at, updated_at
ai_actions        id, user_id, ref ACT, conversation_id, kind, payload jsonb, preview jsonb,
                  status 'proposed'|'approved'|'rejected'|'executed'|'failed', result jsonb,
                  approved_at, executed_at, error
embeddings        (in search_index) embedding vector(1536), model, embedded_at
jobs              see 01-architecture §8
plans             id, user_id, ref PLN, title, kind 'syllabus'|'day'|'project'|'scenario', body jsonb, status, goal_id
routine_adjustments id, user_id, date, routine_item_id, change jsonb (move/shorten/skip/add), source, status
study_nodes       id, user_id, parent_id, level 'program'|'subject'|'chapter'|'topic', title, sort_order
learning_paths / learning_path_steps (prerequisites via dependencies)
courses / lessons (provider, external_id, duration_seconds, position_seconds, completed_at)
video_notes       id, lesson_id, timestamp_seconds, content
books / reading progress via work_sessions(quantity, unit='pages', source='reading')
flashcards        id, deck/topic, front, back, source_type, source_id, due_at, interval_days, ease, reps, lapses
flashcard_reviews id, card_id, grade 0..5, reviewed_at, interval_before, interval_after
assessments / assessment_attempts / mistakes
habits / habit_logs, journal_entries, calendar_events, files, resources
daily_reviews / weekly_reviews / monthly_reviews (generated_body jsonb, edited_body, stored_at)
```

## Relationship diagram (Phase 1)

```
users ─┬─< goals ─┬─< milestones >─┬─ projects >── ideas (source_idea)
       │          ├─< targets      │     │
       │          └─< projects ────┘     ├─< tasks ─┬─< tasks (subtasks)
       │                                 └─< decisions
       ├─< skills ─< skill_topics
       ├─< routine_templates ─< routine_items ─< routine_completions
       ├─< work_sessions  (→ skill / project / task / goal / routine_item)
       ├─< notes, inbox_items, life_areas, tags
       └─< entity_relations, dependencies, activity_events, search_index
```
