"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import { checkinValid, LATE_AFTER_MIN } from "@/lib/checkin";
import { logEvent } from "@/lib/reminders/engine";
import { MIN, formatShort } from "@/lib/time";

export type CheckinResult = { ok: boolean; status?: "present" | "late" | "already"; course?: string; when?: string; message?: string };

/** Student check-in with the code from the teacher's screen. Only classes of the student's groups with check-in open. */
export async function checkIn(raw: string, sessionId?: string): Promise<CheckinResult> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  const code = raw.replace(/\D/g, "").slice(0, 6);
  const sid = sessionId && /^[0-9a-f-]{36}$/.test(sessionId) ? sessionId : null;
  const d = await db();
  const res = await d.tx(async (q): Promise<CheckinResult> => {
    // A few wrong codes per minute at most: six digits can't be guessed.
    const [{ n }] = await q<{ n: number }>(
      `select count(*)::int as n from events where user_id = $1 and name = 'checkin_failed' and created_at > now() - interval '1 minute'`,
      [user.id],
    );
    if (n >= 8) return { ok: false, message: t.attendance.checkinTooMany };
    const open = await q<{ id: string; starts_at: Date; course_title: string }>(
      `select cs.id, cs.starts_at, c.title as course_title from class_sessions cs
         join courses c on c.id = cs.course_id
         join group_members gm on gm.group_id = cs.group_id and gm.student_id = $1
        where cs.checkin_until > now() and ($2::uuid is null or cs.id = $2::uuid)`,
      [user.id, sid],
    );
    const s = open.find((x) => checkinValid(x.id, code));
    if (!s) {
      await logEvent(q, user.id, "checkin_failed", {});
      return { ok: false, message: t.attendance.checkinBad };
    }
    const when = formatShort(new Date(s.starts_at), user.locale);
    const [cur] = await q<{ status: string }>(`select status from attendance where session_id = $1 and student_id = $2`, [s.id, user.id]);
    if (cur && cur.status !== "absent") return { ok: true, status: "already", course: s.course_title, when };
    const late = Date.now() > new Date(s.starts_at).getTime() + LATE_AFTER_MIN * MIN;
    await q(
      `insert into attendance (session_id, student_id, status, marked_by) values ($1, $2, $3, null)
       on conflict (session_id, student_id) do update set status = excluded.status, marked_by = null, marked_at = now()`,
      [s.id, user.id, late ? "late" : "present"],
    );
    await logEvent(q, user.id, "checkin", { session_id: s.id });
    return { ok: true, status: late ? "late" : "present", course: s.course_title, when };
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
