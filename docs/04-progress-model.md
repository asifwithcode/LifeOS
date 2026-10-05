# 04 — Progress Model

Product rule: **progress is derived from evidence and always explainable.** No entity has a
writable `progress` column. Every calculator in `src/lib/domain/progress.ts` /
`src/lib/domain/targets.ts` returns:

```ts
interface ProgressResult {
  percent: number | null      // 0..100, null = "not enough data to say"
  method: string              // short machine key, e.g. 'weighted_milestones'
  explanation: string         // human sentence shown under every progress bar
  parts: { label: string; done: number; total: number; weight?: number }[]
}
```

`null` is a first-class answer. The UI shows "No measurable progress yet — add milestones or
tasks" instead of `0%`.

## Calculators

### Project (method `weighted_milestones` | `tasks`)

`progress_mode = 'milestones'` (default):

```
milestone_credit(m) =
  1                                      if m.status = done
  done_tasks(m) / active_tasks(m)        if m has non-cancelled tasks linked via milestone_id
  0                                      otherwise   (in_progress without tasks earns nothing)

percent = Σ weight(m) · credit(m) / Σ weight(m)
```

Falls back to `tasks` mode when the project has no milestones.

`progress_mode = 'tasks'`: `done top-level tasks / non-cancelled top-level tasks`.
Subtasks never double-count; cancelled tasks are excluded from the denominator.

Explanation example: *"2 of 5 milestones done (weighted 6/10), plus partial credit from tasks
in 'BLE Provisioning' (3/6) → 68%."*

### Goal (method `weighted_milestones` | `targets`)

- `milestones`: identical maths to projects over goal milestones.
- `targets`: mean of `min(100, target.percent)` across **active** linked targets in their
  current period. Explanation lists each target.
- No milestones / no targets → `null`.

### Target (method `target_actual_vs_amount`)

```
range       = periodRange(period, today, weekStartsOn, custom_start/end)
actual      = aggregate(matching work_sessions with local_date in range)
              time units   → Σ duration_minutes (hours = /60)
              'sessions'   → count(sessions)
              'tasks'      → count(task.completed events in range matching project/goal/life area)
              other units  → Σ quantity WHERE unit = target unit
percent     = actual / amount · 100   (uncapped; >100 shown as "exceeded")
```

A session matches when **every set filter** on the target matches
(`activity_type`, `life_area_id`, `skill_id`, `project_id`). A target with no filters counts
all sessions with a compatible unit.

**Pace / behind-schedule** (§54) — computed for multi-day periods:

```
total_days      = days in range
full_days       = days in range strictly before today   (all days once the period has ended)
expected_now    = amount · full_days / total_days       (a fresh period is never "behind" at 8am)
remaining       = max(0, amount − actual)
remaining_days  = days from today to range.end inclusive (today still counts)
required_per_day= remaining / remaining_days
status          = complete  if actual ≥ amount
                  on_track  if expected_now = 0 and actual = 0   (ahead if actual > 0)
                  ahead     if actual ≥ expected_now · 1.05
                  on_track  if actual ≥ expected_now · 0.9
                  behind    otherwise
```

Language is neutral: "Needs 1.4h/day for the remaining 9 days", never guilt-based wording.
Daily targets show only remaining amount (no pace).

### Skill (method `roadmap_evidence`)

Phase 1 evidence = roadmap topics:

```
percent = done_topics / total_topics
```

Shown alongside (not blended into the percentage): topics in progress, total time invested
(Σ sessions with skill_id), sessions in the last 30 days, and the self-assessed level.
Phase 3 adds assessment and practice evidence:
`percent = 0.4·roadmap + 0.4·assessment_score + 0.2·practice_coverage`, each part shown and
only included when evidence exists (weights re-normalised over available parts).

### Course (P3) `completed_lessons / required_lessons`
### Book (P3) `current_page / total_pages`, forecast from 14-day average pages/day
### Habit (P4) completion rate over the habit's scheduled days; streak shown separately

### Today (dashboard headline)

```
if daily targets exist:   mean(min(100, percent)) over active daily targets
elif routine items today: done items / scheduled items
else:                     null
```

The explanation names which basis was used.

## Forecasting (§53, Phase 5 — shape fixed now)

```
pace = Σ amount over last N days with activity window / N   (N = 14 by default)
eta_days = remaining / pace      (only when pace > 0 and ≥ 3 data days)
```

Always rendered as "Estimate: ~16 days at your 14-day average of 18 pages/day".

## Tests

`src/lib/domain/__tests__/progress.test.ts` and `targets.test.ts` cover: empty inputs → null,
weights, partial milestone credit, cancelled exclusion, subtasks not double-counted, period
boundaries (week start Sunday/Monday, month ends, leap years, quarters), unit conversion,
pace statuses and required daily pace.
