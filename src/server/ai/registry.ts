import "server-only";
import type { AIProvider } from "./types";
import { createAnthropicProvider } from "./providers/anthropic";
import { createFakeProvider } from "./providers/fake";

let cached: AIProvider | null | undefined;

/**
 * The configured provider, or null when AI is unavailable (the app keeps working without it).
 *   AI_PROVIDER=anthropic (default when ANTHROPIC_API_KEY is set) · AI_PROVIDER=fake · AI_PROVIDER=none
 *   AI_MODEL overrides the model (default claude-opus-5-5).
 * Further providers (OpenAI, Gemini, local) plug in here by implementing AIProvider.
 */
export function getProvider(): AIProvider | null {
  if (cached !== undefined) return cached;
  const choice = process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "none");
  if (choice === "anthropic" && process.env.ANTHROPIC_API_KEY) cached = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || undefined });
  else if (choice === "fake") cached = createFakeProvider();
  else cached = null;
  return cached;
}

/** Test hook. */
export function setProviderForTests(p: AIProvider | null) {
  cached = p;
}
