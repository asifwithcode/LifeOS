import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, getSettings } from "@/server/auth/dal";
import { sameOrigin } from "@/server/auth/origin";
import { rateLimit } from "@/server/auth/rate-limit";
import { runChatTurn, type ChatEvent } from "@/server/ai/chat";
import { getProvider } from "@/server/ai/registry";
import type { Actor } from "@/server/engines/actor";

const body = z.object({
  conversationId: z.uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
  mode: z.string().max(20).optional(),
});

/** Streams one chat turn as NDJSON events. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getProvider()) return NextResponse.json({ error: "No AI provider is configured." }, { status: 503 });
  const limit = rateLimit(`ai:${user.id}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests — wait a moment." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const settings = await getSettings(user.id);
  const actor: Actor = { userId: user.id, timezone: user.timezone, weekStartsOn: settings?.weekStartsOn ?? 1 };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runChatTurn(actor, parsed.data, emit, req.signal);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
