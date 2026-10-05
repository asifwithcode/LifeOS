# 03 — Information Architecture & Route Map

Entity detail routes use the **human reference** (`/projects/PRJ-0003`), which is stable,
readable and shareable inside the app. The service resolves `(userId, ref) → row`.

Legend: **P1** implemented in Phase 1 · P2–P5 planned. Navigation only shows implemented
modules; planned modules are listed in Settings → Roadmap so nothing appears as a dead link.

## Navigation

```
HOME        Dashboard /            P1
            Today /today           P1
            Inbox /inbox           P1

AI          Personal AI /ai                      P2
            AI Planner /ai/planner               P2
            AI Teacher /ai/teacher               P3
            AI Reviews /reviews                  P5

PLANNING    Goals /goals                         P1
            Targets /targets                     P1
            Future Plans /plans/future           P4
            Daily Routine /routine               P1
            Calendar /calendar                   P4
            Tasks /tasks                         P1
            Habits /habits                       P4

LEARNING    Study /study                         P3
            Skills /skills                       P1
            Learning Paths /learning/paths       P3
            Courses /learning/courses            P3
            Video Learning /learning/videos      P3
            Books /books                         P3
            Flashcards /flashcards               P3
            Practice /practice                   P3
            Mistake Book /mistakes               P3

BUILD       Ideas /ideas                         P1
            Projects /projects                   P1
            Roadmaps /roadmaps                   P3
            Decision Log /decisions              P1

KNOWLEDGE   Notes /notes                         P1
            Knowledge Base /knowledge            P2
            Resources /resources                 P3
            Files /files                         P4
            Research /research                   P4
            Journal /journal                     P4

CAREER      Career Plan /career                  P4
            Portfolio /portfolio                 P4
            Study Abroad /study-abroad           P4
            Achievements /achievements           P4

INSIGHTS    Progress /progress                   P5
            Analytics /analytics                 P5
            Timeline /timeline                   P1
            Reviews /reviews                     P5

SYSTEM      Search /search                       P1
            AI Memory /ai/memory                 P2
            Integrations /settings/integrations  P4
            Settings /settings                   P1
```

## Phase 1 routes

| Route                         | Kind   | Purpose                                                                       |
| ----------------------------- | ------ | ----------------------------------------------------------------------------- |
| `/login`, `/register`         | public | auth                                                                          |
| `/`                           | app    | Dashboard: customizable widgets                                               |
| `/today`                      | app    | Routine timeline for today, today's targets, due/overdue tasks, log session  |
| `/inbox`                      | app    | Pending captures, rule-based suggestions, convert, bulk process               |
| `/tasks?view=today\|upcoming\|overdue\|someday\|completed\|all` | app | Task lists + filters                   |
| `/tasks/[ref]`                | app    | Task detail: subtasks, dependencies, sessions, links, history                |
| `/goals`, `/goals/[ref]`      | app    | Goals, milestones, linked targets/projects/tasks, progress explanation       |
| `/targets`                    | app    | Targets grouped by period, pace/behind-schedule, log progress                 |
| `/targets/[ref]`              | app    | Target detail: contributing sessions in period, history by period            |
| `/routine`                    | app    | Templates, items, weekday assignment, date overrides, 14-day history          |
| `/ideas`, `/ideas/[ref]`      | app    | Idea vault, status pipeline, convert → project                                |
| `/projects`, `/projects/[ref]`| app    | Projects, milestones, tasks, decisions, notes, progress explanation          |
| `/decisions`                  | app    | Decision log across projects                                                  |
| `/notes`, `/notes/[ref]`      | app    | Markdown notes, collections, `[[REF]]` mentions, backlinks                    |
| `/skills`, `/skills/[ref]`    | app    | Skills, topic roadmap, time invested, evidence-based progress                 |
| `/sessions`                   | app    | Work-session log (the data behind targets, skills, timeline)                  |
| `/timeline`                   | app    | Activity events by day, filter by type                                        |
| `/search?q=`                  | app    | Full-text search across entities                                              |
| `/settings`                   | app    | Profile, appearance, dashboard widgets, life areas, data export, roadmap     |
| `/api/search`                 | GET    | Search API for the command palette                                            |
| `/api/export`                 | GET    | JSON export download                                                          |

## Global UI

- **Sidebar** (desktop ≥1024px): grouped navigation, collapsible groups, quick-capture button.
- **Mobile**: top bar + bottom tab bar (Today · Tasks · Capture · Inbox · More).
- **Command palette** `⌘K / Ctrl+K`: Create Task, Capture, Add Note, Log Session, Create Goal,
  Open Project/Skill (search), navigation, theme toggle.
- **Quick Capture** `⌘J / Ctrl+J` or `c` (not in inputs): dialog → inbox with live suggestion.
