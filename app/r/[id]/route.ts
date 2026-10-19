import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/reminders/engine";

/** Link from a Telegram/email reminder: counts the open, then shows the deadline. */
export async function GET(req: NextRequest, ctx: RouteContext<"/r/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(new URL("/", req.url));
  const d = await db();
  const [r] = await d.q<{ deadline_id: string; student_id: string; opened_at: Date | null }>(
    `select deadline_id, student_id, opened_at from reminders where id = $1`,
    [id],
  );
  if (!r) return NextResponse.redirect(new URL("/deadlines", req.url));
  // The id is a random UUID only the recipient got, so any open of it counts — even when the
  // Telegram in-app browser isn't signed in yet.
  if (!r.opened_at) {
    await d.q(`update reminders set opened_at = now() where id = $1`, [id]);
    await logEvent(d.q, r.student_id, "reminder_opened", { reminder_id: id });
  }
  return NextResponse.redirect(new URL(`/deadlines/${r.deadline_id}?from=reminder`, req.url));
}
