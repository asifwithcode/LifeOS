import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { aiConversations, aiMessages, userSettings } from "@/server/db/schema";
import { nowOf, type Actor } from "@/server/engines/actor";
import { DomainError, notFound } from "@/server/engines/errors";
import { listActions, presentAction, type PresentedAction } from "./action-service";
import { buildContext, composeUserContent } from "./context";
import { AI_MODE_KEYS, systemPrompt, type AIMode } from "./modes";
import { resolvePrivacy } from "./privacy";
import { getProvider } from "./registry";
import { buildTools, toolHandler } from "./tools";
import { AIUnavailableError, type HistoryEntry } from "./types";

export type ChatEvent =
  | { type: "start"; conversationId: string; messageId: string; provider: string; contextRefs: { type: string; ref: string | null; title: string }[] }
  | { type: "text"; delta: string }
  | { type: "action"; action: PresentedAction }
  | { type: "done"; stop: string }
  | { type: "error"; message: string };

const MAX_HISTORY_MESSAGES = 40;

export async function listConversations(userId: string, archived = false) {
  return db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.userId, userId), archived ? sql`${aiConversations.archivedAt} IS NOT NULL` : isNull(aiConversations.archivedAt)))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(100);
}

export async function getConversation(userId: string, id: string) {
  const [conv] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
  if (!conv) return null;
  const [messages, actions] = await Promise.all([
    db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.createdAt)),
    listActions(userId, id),
  ]);
  return { conversation: conv, messages, actions: actions.map(presentAction) };
}

export async function renameConversation(userId: string, id: string, title: string) {
  await db.update(aiConversations).set({ title: title.trim().slice(0, 120) || "Conversation" }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
}

export async function archiveConversation(userId: string, id: string, archived: boolean) {
  await db.update(aiConversations).set({ archivedAt: archived ? new Date() : null }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
}

export async function deleteConversation(userId: string, id: string) {
  await db.delete(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
}

/**
 * One chat turn. Persists the user message, builds permission-aware context, runs the provider with
 * read tools + proposal tools, streams events, and persists the assistant message (append-only).
 */
export async function runChatTurn(actor: Actor, input: { conversationId?: string | null; message: string; mode?: string }, emit: (e: ChatEvent) => void, signal?: AbortSignal) {
  const provider = getProvider();
  if (!provider) throw new AIUnavailableError();
  const message = input.message.trim();
  if (!message || message.length > 8000) throw new DomainError("Messages must be 1–8000 characters");

  let conv;
  if (input.conversationId) {
    [conv] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, actor.userId)));
    if (!conv) notFound("Conversation");
  } else {
    const mode = (AI_MODE_KEYS as string[]).includes(input.mode ?? "") ? input.mode! : "general";
    [conv] = await db
      .insert(aiConversations)
      .values({ userId: actor.userId, mode, title: message.length > 60 ? `${message.slice(0, 57).trimEnd()}…` : message })
      .returning();
  }
  const mode = conv.mode as AIMode;

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, actor.userId));
  const privacy = resolvePrivacy(settings?.aiPrivacy);
  const context = await buildContext(actor, message, privacy, settings?.memoryEnabled ?? false);

  const prior = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conv.id))
    .orderBy(desc(aiMessages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);
  const history: HistoryEntry[] = prior.reverse().map((m) => ({ role: m.role as "user" | "assistant", text: m.text, provider: m.provider, transcript: m.transcript }));

  const [userRow] = await db
    .insert(aiMessages)
    .values({ userId: actor.userId, conversationId: conv.id, role: "user", text: message, provider: provider.id, model: provider.model })
    .returning();
  const [assistantRow] = await db
    .insert(aiMessages)
    .values({ userId: actor.userId, conversationId: conv.id, role: "assistant", text: "", provider: provider.id, model: provider.model, contextRefs: context.refs, status: "pending", createdAt: new Date(userRow.createdAt.getTime() + 1) })
    .returning();

  emit({ type: "start", conversationId: conv.id, messageId: assistantRow.id, provider: provider.label, contextRefs: context.refs.map((r) => ({ type: r.type, ref: r.ref, title: r.title })) });

  const proposals: string[] = [];
  const handle = toolHandler({ actor, privacy, conversationId: conv.id, messageId: assistantRow.id, mode, onProposal: (id) => proposals.push(id) });
  const userContent = composeUserContent(context.text, message);
  try {
    const result = await provider.runTurn(
      { system: systemPrompt(mode), history, userContent, tools: buildTools(mode), signal },
      {
        onText: (delta) => emit({ type: "text", delta }),
        onToolCall: async (name, toolInput) => {
          const out = await handle(name, toolInput);
          if (name.startsWith("propose_") && !out.isError) {
            const latest = await listActions(actor.userId, conv.id);
            const row = latest.find((a) => a.id === proposals[proposals.length - 1]);
            if (row) emit({ type: "action", action: presentAction(row) });
          }
          return out;
        },
      },
    );
    const refused = result.stop === "refusal";
    await db.update(aiMessages).set({ transcript: result.userTranscript }).where(eq(aiMessages.id, userRow.id));
    await db
      .update(aiMessages)
      .set({
        text: result.text || (refused ? "" : "(no response)"),
        transcript: result.assistantTranscript,
        model: result.model,
        usage: result.usage ?? null,
        status: refused ? "refused" : "complete",
      })
      .where(eq(aiMessages.id, assistantRow.id));
    await db.update(aiConversations).set({ updatedAt: nowOf(actor) }).where(eq(aiConversations.id, conv.id));
    emit({ type: "done", stop: result.stop });
  } catch (err) {
    const msg = describeProviderError(err);
    // The user turn stays (with context) so history remains valid; the assistant row records the failure.
    await db.update(aiMessages).set({ transcript: [{ role: "user", content: userContent }] }).where(eq(aiMessages.id, userRow.id));
    await db.update(aiMessages).set({ status: "error", error: msg }).where(eq(aiMessages.id, assistantRow.id));
    emit({ type: "error", message: msg });
  }
}

export function describeProviderError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The AI provider rejected the API key.";
  if (err instanceof Anthropic.RateLimitError) return "The AI provider is rate-limiting requests. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `The AI provider rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI provider. Check the network and try again.";
  if (err instanceof Anthropic.APIError) return `AI provider error (${err.status ?? "unknown"}). Try again.`;
  if (err instanceof DomainError || err instanceof AIUnavailableError) return err.message;
  if (err instanceof Error && err.name === "AbortError") return "Stopped.";
  console.error("[ai chat]", err);
  return "Something went wrong talking to the AI.";
}
