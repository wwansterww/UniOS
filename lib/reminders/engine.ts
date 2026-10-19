import type { Q } from "../db/core";
import { DEFAULT_OFFSETS, planReminders, type ReminderPrefs } from "./plan";
import { MIN } from "../time";

export interface PrefsRow {
  user_id: string;
  offsets_minutes: number[];
  instant_enabled: boolean;
  channels: string[];
  quiet_start: string;
  quiet_end: string;
  digest_enabled: boolean;
}

export const toPlanPrefs = (p?: Partial<PrefsRow>): ReminderPrefs => ({
  offsets: p?.offsets_minutes ?? DEFAULT_OFFSETS,
  quietStart: p?.quiet_start ?? "23:00",
  quietEnd: p?.quiet_end ?? "08:00",
});

export async function prefsFor(q: Q, userIds: string[]): Promise<Map<string, PrefsRow>> {
  if (userIds.length === 0) return new Map();
  const rows = await q<PrefsRow>(
    `select user_id, offsets_minutes, instant_enabled, channels, quiet_start::text as quiet_start,
            quiet_end::text as quiet_end, digest_enabled
       from notification_prefs where user_id::text = any(string_to_array($1, ','))`,
    [userIds.join(",")],
  );
  return new Map(rows.map((r) => [r.user_id, r]));
}

/** Students who should be reminded about a deadline: its groups' members, or the owner of a personal task. */
export async function audience(q: Q, deadlineId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `select owner_id as id from deadlines where id = $1 and owner_id is not null
     union
     select gm.student_id from deadline_groups dg join group_members gm on gm.group_id = dg.group_id
      where dg.deadline_id = $1`,
    [deadlineId],
  );
  return rows.map((r) => r.id);
}

/**
 * Rebuilds the reminders table for one deadline (optionally only for some students).
 * reset = true (the due date changed) also forgets reminders that were already sent, so the
 * new schedule starts from scratch; otherwise already sent reminders are kept and not repeated.
 */
export async function recomputeForDeadline(
  q: Q,
  deadlineId: string,
  opts: { now?: Date; reset?: boolean; studentIds?: string[] } = {},
) {
  const now = opts.now ?? new Date();
  const [d] = await q<{ due_at: Date; deleted_at: Date | null }>(
    `select due_at, deleted_at from deadlines where id = $1`,
    [deadlineId],
  );
  const only = opts.studentIds?.join(",") ?? null;
  await q(
    `delete from reminders where deadline_id = $1 and ($2::boolean or sent_at is null)
       and ($3::text is null or student_id::text = any(string_to_array($3, ',')))`,
    [deadlineId, !!opts.reset, only],
  );
  if (!d || d.deleted_at) return 0;

  let students = await audience(q, deadlineId);
  if (opts.studentIds) students = students.filter((s) => opts.studentIds!.includes(s));
  const done = new Set(
    (await q<{ student_id: string }>(`select student_id from deadline_status where deadline_id = $1`, [deadlineId])).map(
      (r) => r.student_id,
    ),
  );
  students = students.filter((s) => !done.has(s));
  const prefs = await prefsFor(q, students);

  const rows = students.flatMap((s) =>
    planReminders(new Date(d.due_at), now, toPlanPrefs(prefs.get(s))).map((r) => ({
      student_id: s,
      deadline_id: deadlineId,
      offset_minutes: r.offsetMinutes,
      kind: r.kind,
      send_at: r.sendAt.toISOString(),
    })),
  );
  await insertReminders(q, rows);
  return rows.length;
}

/** After a student changes their settings or joins a group: replan all their upcoming deadlines. */
export async function recomputeForStudent(q: Q, studentId: string, now = new Date()) {
  const ids = await q<{ id: string }>(
    `select d.id from deadlines d
      where d.due_at > $2 and d.deleted_at is null
        and (d.owner_id = $1 or exists (
          select 1 from deadline_groups dg join group_members gm on gm.group_id = dg.group_id
           where dg.deadline_id = d.id and gm.student_id = $1))`,
    [studentId, now.toISOString()],
  );
  await q(`delete from reminders where student_id = $1 and sent_at is null and kind <> 'snooze'`, [studentId]);
  let n = 0;
  for (const { id } of ids) n += await recomputeForDeadline(q, id, { now, studentIds: [studentId] });
  return n;
}

async function insertReminders(q: Q, rows: object[]) {
  if (rows.length === 0) return;
  await q(
    `insert into reminders (student_id, deadline_id, offset_minutes, kind, send_at)
     select student_id, deadline_id, offset_minutes, kind, send_at
       from jsonb_to_recordset($1::jsonb)
         as x(student_id uuid, deadline_id uuid, offset_minutes int, kind text, send_at timestamptz)
     on conflict (student_id, deadline_id, offset_minutes) do nothing`,
    [JSON.stringify(rows)],
  );
}

/** "Сделано": stops all pending reminders for this student and deadline. */
export async function markDone(q: Q, studentId: string, deadlineId: string, now = new Date()) {
  const inserted = await q(
    `insert into deadline_status (student_id, deadline_id, done_at) values ($1, $2, $3)
     on conflict do nothing returning deadline_id`,
    [studentId, deadlineId, now.toISOString()],
  );
  await q(`delete from reminders where student_id = $1 and deadline_id = $2 and sent_at is null`, [studentId, deadlineId]);
  if (inserted.length) {
    const [d] = await q<{ due_at: Date }>(`select due_at from deadlines where id = $1`, [deadlineId]);
    await logEvent(q, studentId, "deadline_done", { deadline_id: deadlineId, before_due: d ? new Date(d.due_at) > now : false });
  }
}

export async function undoDone(q: Q, studentId: string, deadlineId: string, now = new Date()) {
  await q(`delete from deadline_status where student_id = $1 and deadline_id = $2`, [studentId, deadlineId]);
  await recomputeForDeadline(q, deadlineId, { now, studentIds: [studentId] });
}

/** "⏰ Через 1 час" from Telegram. */
export async function snooze(q: Q, studentId: string, deadlineId: string, now = new Date(), minutes = 60) {
  const [d] = await q<{ due_at: Date }>(`select due_at from deadlines where id = $1 and deleted_at is null`, [deadlineId]);
  if (!d) return false;
  const sendAt = new Date(now.getTime() + minutes * MIN);
  const offset = -Math.max(1, Math.round((new Date(d.due_at).getTime() - sendAt.getTime()) / MIN));
  await q(
    `insert into reminders (student_id, deadline_id, offset_minutes, kind, send_at) values ($1, $2, $3, 'snooze', $4)
     on conflict (student_id, deadline_id, offset_minutes) do update set send_at = excluded.send_at, sent_at = null, attempts = 0`,
    [studentId, deadlineId, offset, sendAt.toISOString()],
  );
  return true;
}

export async function logEvent(q: Q, userId: string | null, name: string, props: object = {}) {
  await q(`insert into events (user_id, name, props) values ($1, $2, $3::jsonb)`, [userId, name, JSON.stringify(props)]);
}
