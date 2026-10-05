# 05 — AI Architecture (Phase 2 design)

Phase 1 ships no AI calls, but its shapes (services with explicit `userId`, typed events,
`search_index`, Zod schemas, the inbox `suggestion` field) are what Phase 2 plugs into.

Principles:

1. **AI assists; the user stays in control.** Answering, suggesting, planning and changing data
   are distinct, and only the last one touches the database — through an approval gate.
2. **Provider-independent.** Business logic never imports a vendor SDK.
3. **Permission-aware retrieval.** The model sees only modules the user allowed, and only the
   relevant slice — never the whole database.
4. **No fabrication.** When context is thin, the AI says so. Insights cite the records they
   were derived from.

## 1. Provider abstraction

```
src/server/ai/
  provider.ts            interface AIProvider
  providers/
    anthropic.ts         Claude (default)
    openai.ts
    gemini.ts
    local.ts             OpenAI-compatible local endpoint (Ollama/LM Studio)
  registry.ts            picks provider from user settings / env
```

```ts
interface AIProvider {
  id: string
  chat(req: ChatRequest): AsyncIterable<ChatChunk>            // streaming text
  structured<T>(req: ChatRequest, schema: ZodType<T>): Promise<T>  // JSON-schema constrained
  toolCall(req: ChatRequest, tools: ToolDef[]): Promise<ToolCallResult>
  embed(texts: string[]): Promise<number[][]>
  summarize(text: string, opts?): Promise<string>
}
```

Model IDs and API keys live only in server env / encrypted settings. The UI shows which
provider receives data ("Sent to: Anthropic") next to every AI surface.

## 2. Request pipeline

```
User message (+ mode)
   │
   ▼
Intent classification (cheap model or rules)   → answer | suggest | plan | mutate | teach
   │
   ▼
Context Engine (permission-aware)
   ├─ structured snapshot: today's targets, top tasks, active projects, goals (small, always)
   ├─ entity resolution: "MAYA" → PRJ-0003 via search_index
   ├─ retrieval: FTS + pgvector hybrid over search_index (top-k, filtered by allowed modules)
   ├─ long-term memory: active ai_memories (if memory enabled)
   └─ recent conversation turns
   │
   ▼
Prompt assembly (mode system prompt + context blocks with refs)
   │
   ▼
Provider.chat / Provider.toolCall
   │
   ├─▶ Answer (streamed, with cited refs)                         — no mutation
   └─▶ ProposedAction[] (validated with Zod)  → stored as ai_actions(status=proposed)
                        → Preview card in UI → user Approve / Edit / Reject
                        → Action Engine executes via the SAME services the UI uses
                        → activity event + ai_actions(status=executed, result)
```

Hybrid retrieval score: `0.5 · ts_rank_cd + 0.5 · (1 − cosine_distance)`, de-duplicated by
entity, capped by token budget (~6k context tokens).

## 3. Modes (§5)

A mode = system prompt + default context recipe + allowed action kinds.

| Mode              | Context emphasis                            | Allowed actions                          |
| ----------------- | ------------------------------------------- | ---------------------------------------- |
| General Assistant | snapshot + retrieval                        | all (with approval)                      |
| Planner           | routine, tasks, targets, deadlines          | create_task, create_plan, routine_adjust |
| Study Tutor       | study nodes, mistakes, flashcards           | create_flashcards, add_study_session     |
| Career Advisor    | skills, career roles, projects              | create_goal, create_target               |
| Project Planner   | project, milestones, decisions              | create_task, create_milestone            |
| Idea Analyst      | idea + related notes                        | update_idea_analysis, convert_idea       |
| Research Asst.    | research workspace, sources (with provenance)| save_note, add_resource                 |
| Coding Assistant  | project notes, snippets                     | save_note, create_task                   |
| Weekly Reviewer   | last 7 days of sessions/events              | save_review (draft)                      |

## 4. Typed action schemas (§6)

All actions are a discriminated union validated by Zod **before** being shown, and again
before execution.

```ts
type ProposedAction =
  | { kind: 'create_task';    data: { title; description?; projectRef?; goalRef?; dueDate?; priority?; estimatedMinutes? } }
  | { kind: 'update_task';    ref: `TSK-${string}`; patch: Partial<TaskEditable> }
  | { kind: 'create_goal';    data: GoalInput & { milestones?: string[] } }
  | { kind: 'create_target';  data: TargetInput }
  | { kind: 'create_plan';    data: { title; kind; months: { weeks: { topics: … }[] }[] } }   // syllabus
  | { kind: 'save_note';      data: { title; content; links?: string[] } }
  | { kind: 'create_project'; data: ProjectInput & { milestones?: MilestoneInput[] } }
  | { kind: 'convert_idea';   ref: `IDE-${string}` }
  | { kind: 'log_session';    data: SessionInput }
  | { kind: 'add_resource';   data: ResourceInput }
  | { kind: 'routine_adjust'; data: { date; changes: RoutineChange[] } }   // temporary, never edits template
  | { kind: 'link_entities';  source: Ref; target: Ref; relation: RelationType }
  | { kind: 'add_memory';     data: { content; kind } }
  | { kind: 'add_journal';    data: { date; content } }
  | { kind: 'batch';          title: string; actions: ProposedAction[] }   // e.g. "Save Plan"
```

Execution rules:

- Low-risk, user-initiated, single creates from an explicit button (e.g. "Save as Note" on a
  message) still show a preview, but one click.
- Updates/deletes/batches always show a diff preview.
- Refs in actions are re-resolved against the user's data at execution; unknown refs fail the
  action, never guess.
- Every executed action is audited in `ai_actions` and emits `ai.action_executed`.

Unit tests (`ai-actions.test.ts`, Phase 2) assert that malformed or cross-user payloads are
rejected.

## 5. Memory (§7)

| Concept              | Storage           | Lifetime                                   |
| -------------------- | ----------------- | ------------------------------------------ |
| Conversation history | `ai_messages`     | per conversation; searchable; deletable     |
| Long-term memory     | `ai_memories`     | durable until archived; user-visible        |

- Memories are created only (a) manually, or (b) via an `add_memory` proposal the user approves.
- AI Memory page: list, edit, archive, delete, add, and a global "Memory enabled" switch.
- Memory is injected only when enabled and only memories relevant to the query (retrieved).

## 6. Privacy (§76)

`user_settings.ai_privacy` — per-module flags, **default off for Journal and Finance**:

```json
{ "goals": true, "targets": true, "tasks": true, "projects": true, "ideas": true,
  "notes": true, "skills": true, "study": true, "routine": true,
  "journal": false, "finance": false, "files": false }
```

The Context Engine filters `search_index.entity_type` by these flags *before* retrieval.
Settings → AI Privacy explains in plain language: "Data stays in your database. When you ask
the AI something, the relevant items from the modules enabled below are sent to <provider>."

## 7. Phase 1 seams already in place

- `CaptureClassifier` interface (`lib/domain/capture.ts`) — Phase 1 rule-based implementation;
  Phase 2 adds an AI implementation returning the same `CaptureSuggestion` shape.
- `search_index` — embeddings column added in a Phase 2 migration; indexer already central.
- Services accept plain validated objects → directly reusable by the Action Engine.
- Dashboard "Today summary" is deterministic (computed from targets) and labelled as such;
  Phase 2 may add an AI insight card beside it, never replacing the computed one.
