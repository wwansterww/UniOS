import { NextResponse, type NextRequest } from "next/server";
import { db, withUser } from "@/lib/db";
import { buildIcs, type CalendarItem } from "@/lib/ics";
import { MIN } from "@/lib/time";

/** Personal secret calendar feed: classes + deadlines, for Google/Apple Calendar subscriptions. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/ics/[token]">) {
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{20,64}$/.test(clean)) return new NextResponse("Not found", { status: 404 });
  const d = await db();
  const [user] = await d.q<{ id: string; role: string; full_name: string }>(`select id, role, full_name from profiles where ics_token = $1`, [clean]);
  if (!user) return new NextResponse("Not found", { status: 404 });

  const items = await withUser(user.id, async (q) => {
    const scope =
      user.role === "teacher" ? `c.teacher_id = app_uid()` : `cs.group_id in (select group_id from group_members where student_id = app_uid())`;
    const sessions = await q<{ id: string; title: string; starts_at: Date; ends_at: Date; room: string; status: string; group_name: string }>(
      `select cs.id, c.title, cs.starts_at, cs.ends_at, cs.room, cs.status, g.name as group_name
         from class_sessions cs join courses c on c.id = cs.course_id join groups g on g.id = cs.group_id
        where ${scope} and cs.starts_at > now() - interval '30 days' and cs.starts_at < now() + interval '120 days'`,
    );
    const deadlines = await q<{ id: string; title: string; due_at: Date; course: string | null; description: string; link: string | null }>(
      `select d.id, d.title, d.due_at, c.title as course, d.description, d.link from deadlines d left join courses c on c.id = d.course_id
        where d.deleted_at is null and d.due_at > now() - interval '30 days'
          and (d.owner_id = app_uid() or d.course_id is not null)
          and not exists (select 1 from deadline_status ds where ds.deadline_id = d.id and ds.student_id = app_uid())`,
    );
    const out: CalendarItem[] = [
      ...sessions.map((s) => ({
        uid: `class-${s.id}@unios`,
        title: s.status === "cancelled" ? `✕ ${s.title}` : s.title,
        start: new Date(s.starts_at),
        end: new Date(s.ends_at),
        location: s.room ? `ауд. ${s.room}` : undefined,
        description: user.role === "teacher" ? s.group_name : undefined,
        cancelled: s.status === "cancelled",
      })),
      ...deadlines.map((x) => ({
        uid: `deadline-${x.id}@unios`,
        title: `📌 ${x.course ? x.course + ": " : ""}${x.title}`,
        start: new Date(new Date(x.due_at).getTime() - 30 * MIN),
        end: new Date(x.due_at),
        description: x.description,
        url: x.link ?? undefined,
      })),
    ];
    return out;
  });

  return new NextResponse(buildIcs(`UniOS — ${user.full_name}`, items), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" },
  });
}
