import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/dal";
import { exportNotesMarkdown, exportUserData } from "@/server/services/export";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.nextUrl.searchParams.get("format") === "markdown") {
    const files = await exportNotesMarkdown(user.id);
    // A single concatenated Markdown document with file separators; no zip dependency needed.
    const body = files.map((f) => `<!-- file: ${f.filename} -->\n${f.content}`).join("\n\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="lifeos-notes-${stamp}.md"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="lifeos-export-${stamp}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
