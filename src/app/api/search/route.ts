import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ENTITY_TYPES } from "@/lib/domain/constants";
import { getCurrentUser } from "@/server/auth/dal";
import { search } from "@/server/engines/search";

const query = z.object({
  q: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: z.enum(ENTITY_TYPES).optional(),
});

// Read-only GET: safe from CSRF; scoped to the session user.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const hits = await search(user.id, parsed.data.q, { limit: parsed.data.limit, types: parsed.data.type ? [parsed.data.type] : undefined });
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "private, no-store" } });
}
