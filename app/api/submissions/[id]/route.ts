import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { servedAs } from "@/lib/submissions";

/**
 * A handed-in file. RLS decides who may get it: the student who uploaded it and the course's teacher.
 * PDFs and photos open in the browser; everything else (pptx, ipynb, zip…) downloads.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/submissions/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [row] = await withUser(user.id, (q) => q<{ name: string; data: Uint8Array }>(`select name, data from submission_files where id = $1`, [id]));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { type, inline } = servedAs(row.name);
  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": type,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
}
