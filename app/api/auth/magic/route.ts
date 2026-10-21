import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { homeFor, startSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const d = await db();
  const [row] = await d.q<{ email: string }>(
    `update magic_links set used_at = now() where token = $1 and used_at is null and expires_at > now() returning email`,
    [token],
  );
  const [u] = row ? await d.q<{ id: string; role: string }>(`select id, role from profiles where email = $1 and disabled_at is null`, [row.email]) : [];
  if (!u) return NextResponse.redirect(new URL("/login?expired=1", req.url));
  await startSession(u.id);
  return NextResponse.redirect(new URL(homeFor(u.role), req.url));
}
