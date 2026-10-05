import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AIProvider, StructuredInput, ToolSpec, TurnHandlers, TurnInput, TurnResult } from "../types";

type Block = Anthropic.Beta.BetaContentBlock;
type Param = Anthropic.Beta.BetaMessageParam;

const MAX_TOOL_ROUNDS = 6;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * After a mid-output fallback, blocks of the declined model that appear before the last
 * `fallback` marker must not be echoed (thinking / tool_use / unrecognised internal blocks).
 */
export function prepareForEcho(content: Block[]): Block[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  if (lastFallback < 0) return content;
  return content.filter((b, i) => i >= lastFallback || b.type === "text");
}

function toolDefs(tools: ToolSpec[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });
}

export function createAnthropicProvider(opts: { apiKey?: string; model?: string } = {}): AIProvider {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const model = opts.model ?? "claude-opus-5-5";

  return {
    id: "anthropic",
    label: `Anthropic (${model})`,
    model,

    async runTurn(input: TurnInput, handlers: TurnHandlers): Promise<TurnResult> {
      // Append-only history: replay this provider's exact transcripts; other providers' turns as text.
      const messages: Param[] = [];
      for (const h of input.history) {
        if (h.provider === "anthropic" && h.transcript.length) messages.push(...(h.transcript as Param[]));
        else if (h.text) messages.push({ role: h.role, content: h.text });
      }
      const userMsg: Param = { role: "user", content: input.userContent };
      messages.push(userMsg);
      const appended: Param[] = [];
      const tools = toolDefs(input.tools);
      const specs = new Map(input.tools.map((t) => [t.name, t]));
      let text = "";
      let servedBy = model;
      let usage: Record<string, unknown> | undefined;

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: 16000,
            // Stable system prompt (cached); volatile personal context travels in the user turn.
            system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
            messages: [...messages, ...appended],
            tools,
            output_config: { effort: "medium" },
            betas: [FALLBACK_BETA],
            fallbacks: "default",
          },
          { signal: input.signal },
        );
        stream.on("text", (delta) => {
          text += delta;
          handlers.onText(delta);
        });
        let message: Anthropic.Beta.BetaMessage;
        try {
          message = await stream.finalMessage();
        } catch (err) {
          // Unparseable streamed tool input: re-issue this round once; API errors propagate.
          if (err instanceof Anthropic.APIError || round === MAX_TOOL_ROUNDS) throw err;
          continue;
        }
        servedBy = message.model;
        usage = message.usage as unknown as Record<string, unknown>;
        const content = prepareForEcho(message.content);

        if (message.stop_reason === "refusal") {
          return { text, userTranscript: [userMsg], assistantTranscript: appended, stop: "refusal", model: servedBy, usage };
        }
        if (message.stop_reason === "pause_turn") {
          appended.push({ role: "assistant", content });
          continue;
        }
        const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        appended.push({ role: "assistant", content });
        if (toolUses.length === 0) {
          return { text, userTranscript: [userMsg], assistantTranscript: appended, stop: message.stop_reason === "max_tokens" ? "max_tokens" : "end", model: servedBy, usage };
        }
        if (message.stop_reason === "max_tokens") {
          // Never run tools on possibly truncated input; close the turn with error results.
          appended.push({
            role: "user",
            content: toolUses.map((t) => ({ type: "tool_result" as const, tool_use_id: t.id, is_error: true, content: "Input truncated; not executed." })),
          });
          return { text, userTranscript: [userMsg], assistantTranscript: appended, stop: "max_tokens", model: servedBy, usage };
        }
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const t of toolUses) {
          const spec = specs.get(t.name);
          const parsed = spec?.schema.safeParse(t.input);
          if (!spec || !parsed?.success) {
            results.push({ type: "tool_result", tool_use_id: t.id, is_error: true, content: spec ? `Invalid input: ${parsed?.error?.message}` : `Unknown tool ${t.name}` });
            continue;
          }
          const out = await handlers.onToolCall(t.name, parsed.data);
          results.push({ type: "tool_result", tool_use_id: t.id, content: out.content, is_error: out.isError || undefined });
        }
        appended.push({ role: "user", content: results });
      }
      return { text, userTranscript: [userMsg], assistantTranscript: appended, stop: "tool_limit", model: servedBy, usage };
    },

    async structured<T>(input: StructuredInput<T>): Promise<T | null> {
      const res = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
        output_config: { effort: "low", format: betaZodOutputFormat(input.schema) },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
      if (res.stop_reason === "refusal") return null;
      return (res.parsed_output as T | null) ?? null;
    },
  };
}
