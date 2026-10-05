import type { AIProvider, TurnHandlers, TurnInput, TurnResult } from "../types";

/**
 * Deterministic provider for tests and offline development (AI_PROVIDER=fake).
 * It does not generate language; it exercises the same tool/proposal pipeline:
 *   "search: <q>"      → calls search_items
 *   "task: <title>"    → calls propose_create_task
 *   "note: <title>"    → calls propose_save_note
 *   "remember: <text>" → calls propose_add_memory
 * Anything else echoes how much context it received.
 */
export function createFakeProvider(): AIProvider {
  return {
    id: "fake",
    label: "Test provider (no AI, nothing leaves the server)",
    model: "fake-1",
    async runTurn(input: TurnInput, handlers: TurnHandlers): Promise<TurnResult> {
      const question = input.userContent.split("<question>")[1]?.split("</question>")[0]?.trim() ?? input.userContent;
      const say = (s: string) => {
        handlers.onText(s);
        return s;
      };
      let text = "";
      const m = /^(search|task|note|remember):\s*(.+)$/i.exec(question);
      if (m) {
        const [, cmd, arg] = m;
        const call =
          cmd.toLowerCase() === "search"
            ? (["search_items", { query: arg }] as const)
            : cmd.toLowerCase() === "task"
              ? (["propose_create_task", { title: arg, reason: "Requested in chat" }] as const)
              : cmd.toLowerCase() === "note"
                ? (["propose_save_note", { title: arg, content: `Notes about ${arg}.`, reason: "Requested in chat" }] as const)
                : (["propose_add_memory", { content: arg, kind: "preference", reason: "Requested in chat" }] as const);
        const out = await handlers.onToolCall(call[0], call[1]);
        text += say(`${call[0]} → ${out.content.slice(0, 400)}`);
      } else {
        const lines = input.userContent.split("\n").filter((l) => /\b[A-Z]{3}-\d{4}\b/.test(l)).length;
        text += say(`(test provider) I received ${lines} context line${lines === 1 ? "" : "s"} with references. History: ${input.history.length} message(s).`);
      }
      return {
        text,
        userTranscript: [{ role: "user", content: input.userContent }],
        assistantTranscript: [{ role: "assistant", content: text }],
        stop: "end",
        model: "fake-1",
      };
    },
    async structured() {
      return null;
    },
  };
}
