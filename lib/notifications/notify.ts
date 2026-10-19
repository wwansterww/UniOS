import type { Q } from "../db/core";
import { prefsFor } from "../reminders/engine";
import { instantSendAt } from "../reminders/plan";
import type { NotificationKind, NotificationPayload } from "./render";

/**
 * Puts a notification into each user's in-app inbox and, if they enabled instant messages,
 * queues it for Telegram/email (moved out of quiet hours). Call kickDispatch() afterwards.
 */
export async function notify(
  q: Q,
  userIds: string[],
  kind: NotificationKind,
  payload: NotificationPayload,
  opts: { link?: string; deliver?: boolean; force?: boolean; now?: Date } = {},
) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const now = opts.now ?? new Date();
  const prefs = await prefsFor(q, ids);
  const rows = ids.map((id) => {
    const p = prefs.get(id);
    const quiet = { quietStart: p?.quiet_start ?? "23:00", quietEnd: p?.quiet_end ?? "08:00" };
    return {
      user_id: id,
      kind,
      title: payload.title ?? "",
      body: payload.body ?? "",
      link: opts.link ?? null,
      payload,
      deliver: (opts.deliver ?? true) && (opts.force || (p?.instant_enabled ?? true)),
      send_at: instantSendAt(now, quiet).toISOString(),
    };
  });
  await q(
    `insert into notifications (user_id, kind, title, body, link, payload, deliver, send_at)
     select user_id, kind, title, body, link, payload, deliver, send_at
       from jsonb_to_recordset($1::jsonb)
         as x(user_id uuid, kind text, title text, body text, link text, payload jsonb, deliver boolean, send_at timestamptz)`,
    [JSON.stringify(rows)],
  );
  return ids.length;
}

/** Students of the given groups. */
export async function groupStudents(q: Q, groupIds: string[]): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const rows = await q<{ student_id: string }>(
    `select distinct student_id from group_members where group_id::text = any(string_to_array($1, ','))`,
    [groupIds.join(",")],
  );
  return rows.map((r) => r.student_id);
}

/** Students of every group attached to a course. */
export async function courseStudents(q: Q, courseId: string): Promise<string[]> {
  const rows = await q<{ student_id: string }>(
    `select distinct gm.student_id from course_groups cg join group_members gm on gm.group_id = cg.group_id
      where cg.course_id = $1`,
    [courseId],
  );
  return rows.map((r) => r.student_id);
}
