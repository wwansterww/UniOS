import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { dictionaries } from "@/lib/i18n";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const like = `%${raw.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const l = user.locale;
  const teacher = user.role === "teacher";

  const hits = await withUser(user.id, async (q) => {
    const deadlines = await q<{ id: string; title: string; due_at: Date; course: string | null; color: string | null }>(
      `select d.id, d.title, d.due_at, c.title as course, c.color from deadlines d left join courses c on c.id = d.course_id
        where d.deleted_at is null and (d.title ilike $1 or c.title ilike $1 or d.description ilike $1)
          and ($2::boolean or d.due_at > now() - interval '7 days')
        order by d.due_at < now(), d.due_at limit 6`,
      [like, raw.length > 0],
    );
    const classes = await q<{ id: string; title: string; starts_at: Date; room: string; color: string; status: string }>(
      `select cs.id, c.title, cs.starts_at, cs.room, c.color, cs.status from class_sessions cs join courses c on c.id = cs.course_id
        where cs.ends_at > now() and (c.title ilike $1 or cs.room ilike $1 or c.code ilike $1)
          and (${teacher ? "c.teacher_id = app_uid()" : "cs.group_id in (select group_id from group_members where student_id = app_uid())"})
        order by cs.starts_at limit 5`,
      [like],
    );
    const anns = await q<{ id: string; title: string; course: string; color: string }>(
      `select a.id, a.title, c.title as course, c.color from announcements a join courses c on c.id = a.course_id
        where a.title ilike $1 or a.body ilike $1 order by a.created_at desc limit 5`,
      [like],
    );
    return [
      ...deadlines.map((d) => ({
        type: "deadline",
        id: d.id,
        title: d.title,
        subtitle: `${d.course ?? dictionaries[l].common.personal} · ${formatDateTime(new Date(d.due_at), l)}`,
        href: teacher ? `/teacher/deadlines#${d.id}` : `/deadlines/${d.id}`,
        color: d.color ?? undefined,
      })),
      ...classes.map((c) => ({
        type: "class",
        id: c.id,
        title: c.title,
        subtitle: `${formatDateTime(new Date(c.starts_at), l)} · ${c.room}${c.status === "moved" ? " · " + dictionaries[l].schedule.moved : c.status === "cancelled" ? " · " + dictionaries[l].schedule.cancelled : ""}`,
        href: teacher ? `/teacher/schedule` : `/schedule?week=${new Date(c.starts_at).toISOString().slice(0, 10)}`,
        color: c.color,
      })),
      ...anns.map((a) => ({
        type: "announcement",
        id: a.id,
        title: a.title,
        subtitle: a.course,
        href: teacher ? `/teacher/announcements#${a.id}` : `/announcements#${a.id}`,
        color: a.color,
      })),
    ];
  });
  return NextResponse.json({ hits });
}
