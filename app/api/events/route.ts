import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/reminders/engine";

const ALLOWED = new Set(["app_open", "deadline_open", "search_used", "pwa_installed"]);

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as { name?: string; props?: Record<string, unknown> } | null;
  if (!body?.name || !ALLOWED.has(body.name)) return new NextResponse(null, { status: 400 });
  const props = Object.fromEntries(Object.entries(body.props ?? {}).slice(0, 10).map(([k, v]) => [k.slice(0, 40), typeof v === "string" ? v.slice(0, 200) : v]));
  const d = await db();
  await logEvent(d.q, user.id, body.name, props);
  return new NextResponse(null, { status: 204 });
}
