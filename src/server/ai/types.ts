import type { ZodType } from "zod";

// Provider-neutral contracts. Business logic (context, actions, chat service) depends only on these;
// vendor SDKs live exclusively under ./providers.

export interface ToolSpec {
  name: string;
  description: string;
  schema: ZodType;
  /** read = runs automatically (read-only, permission-filtered); propose = only records a proposal. */
  kind: "read" | "propose";
}

export interface HistoryEntry {
  role: "user" | "assistant";
  text: string;
  provider: string | null;
  /** Exact provider messages appended by this entry; replayed verbatim by the same provider. */
  transcript: unknown[];
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export interface TurnHandlers {
  onText(delta: string): void;
  onToolCall(name: string, input: unknown): Promise<ToolOutcome>;
}

export type StopKind = "end" | "refusal" | "max_tokens" | "tool_limit";

export interface TurnResult {
  text: string;
  /** Messages to persist for the user turn (index 0) and everything the assistant appended. */
  userTranscript: unknown[];
  assistantTranscript: unknown[];
  stop: StopKind;
  model: string;
  usage?: Record<string, unknown>;
}

export interface TurnInput {
  system: string;
  history: HistoryEntry[];
  userContent: string;
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface StructuredInput<T> {
  system: string;
  prompt: string;
  schema: ZodType<T>;
}

export interface AIProvider {
  id: string;
  /** Shown next to every AI surface: where data is sent. */
  label: string;
  model: string;
  runTurn(input: TurnInput, handlers: TurnHandlers): Promise<TurnResult>;
  structured<T>(input: StructuredInput<T>): Promise<T | null>;
}

export class AIUnavailableError extends Error {
  constructor(message = "No AI provider is configured.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}
