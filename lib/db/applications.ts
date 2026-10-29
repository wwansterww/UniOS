// Teacher applications in the database: limits for the public form, the advisor's decision, the sign-in check.
// Works on any Postgres handle, so it is shared by the app and the tests.
import { randomUUID } from "node:crypto";
import type { Q } from "./core";
import { occurrences, roomKey, type Application, type Booked, type Subject } from "../applications";
import { currentTerm } from "../journal";
import { logEvent } from "../reminders/engine";
import { DAY, HOUR, fromZoned } from "../time";

/** Applications one network address may send per hour, one email per day, and open ones at a time overall. */
export const PER_IP_HOUR = 5;
export const PER_EMAIL_DAY = 3;
export const MAX_PENDING = 100;

/** Course colours, one per subject in order. */
const COLORS = ["#4F7CF7", "#8B5CF6", "#22A699", "#F2994A", "#E0699B", "#8C80EF", "#3FA34D", "#D9534F"];

export interface ApplicationRow {
  id: string;
  email: string;
  full_name: string;
  locale: string;
  note: string;
  subjects: Subject[];
  starts_on: string;
  ends_on: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  reviewed_at: Date | null;
  reviewer: string | null;
  created_at: Date;
}

/** Which limit a new application would break, if any. Checked before the password is hashed. */
export async function applicationLimit(q: Q, email: string, ip: string, now = new Date()): Promise<"ip" | "email" | "full" | null> {
  const [r] = await q<{ ip: number; email: number; pending: number }>(
    `select (select count(*)::int from teacher_applications where $2 <> '' and ip = $2 and created_at > $3) as ip,
            (select count(*)::int from teacher_applications where email = $1 and created_at > $4) as email,
            (select count(*)::int from teacher_applications where status = 'pending') as pending`,
    [email, ip, new Date(now.getTime() - HOUR).toISOString(), new Date(now.getTime() - DAY).toISOString()],
  );
  if (r.ip >= PER_IP_HOUR) return "ip";
  if (r.email >= PER_EMAIL_DAY) return "email";
  if (r.pending >= MAX_PENDING) return "full";
  return null;
}

/** Stores a checked application. null when this email already has one under review. */
export async function insertApplication(q: Q, a: Application, passwordHash: string, ip: string): Promise<string | null> {
  const rows = await q<{ id: string }>(
    `insert into teacher_applications (email, full_name, password_hash, locale, note, subjects, starts_on, ends_on, ip)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     on conflict (email) where status = 'pending' do nothing
     returning id`,
    [a.email, a.full_name, passwordHash, a.locale, a.note, JSON.stringify(a.subjects), a.starts_on, a.ends_on, ip],
  );
  return rows[0]?.id ?? null;
}

/** The latest open or refused application of an address without an account, for the sign-in form. */
export async function applicationForSignIn(q: Q, email: string) {
  const [a] = await q<{ status: "pending" | "rejected"; password_hash: string; review_note: string }>(
    `select status, password_hash, review_note from teacher_applications
      where email = $1 and status in ('pending', 'rejected') order by created_at desc limit 1`,
    [email],
  );
  return a ?? null;
}

export async function pendingApplicationCount(q: Q): Promise<number> {
  const [r] = await q<{ n: number }>(`select count(*)::int as n from teacher_applications where status = 'pending'`);
  return r.n;
}

export async function listApplications(q: Q, view: "pending" | "history"): Promise<ApplicationRow[]> {
  return q<ApplicationRow>(
    `select a.id, a.email, a.full_name, a.locale, a.note, a.subjects, a.starts_on::text as starts_on, a.ends_on::text as ends_on,
            a.status, a.review_note, a.reviewed_at, r.full_name as reviewer, a.created_at
       from teacher_applications a left join profiles r on r.id = a.reviewed_by
      where ${view === "pending" ? "a.status = 'pending' order by a.created_at" : "a.status <> 'pending' order by a.reviewed_at desc limit 50"}`,
  );
}

/** Classes in the application's period that share a group or a room with it, for the advisor's overlap check. */
export async function bookedAround(q: Q, a: Pick<ApplicationRow, "subjects" | "starts_on" | "ends_on">, now = new Date()): Promise<Booked[]> {
  const slots = a.subjects.flatMap((s) => s.slots);
  const [y, m, d] = a.ends_on.split("-").map(Number);
  const [sy, sm, sd] = a.starts_on.split("-").map(Number);
  const from = new Date(Math.max(now.getTime(), fromZoned(sy, sm, sd).getTime()));
  return q<Booked>(
    `select s.starts_at, s.ends_at, s.group_id, s.room, c.title as course, p.full_name as teacher
       from class_sessions s join courses c on c.id = s.course_id join profiles p on p.id = c.teacher_id
      where s.status <> 'cancelled' and s.ends_at > $1 and s.starts_at < $2
        and (s.group_id::text = any(string_to_array($3, ','))
             or lower(regexp_replace(s.room, '[[:space:].]', '', 'g')) = any(string_to_array($4, ',')))`,
    [
      from.toISOString(),
      fromZoned(y, m, d + 1).toISOString(),
      [...new Set(slots.map((s) => s.group_id))].join(","),
      [...new Set(slots.map((s) => roomKey(s.room)).filter(Boolean))].join(","),
    ],
  );
}

/**
 * Approves in one transaction: the teacher's profile with the password they chose, a course per subject with
 * its groups, and every class from now to the end of the period. "gone" when someone already decided,
 * "taken" when an account with this email appeared meanwhile.
 */
export async function approveApplication(q: Q, id: string, advisorId: string, now = new Date()) {
  const [a] = await q<{ email: string; full_name: string; password_hash: string; locale: string; subjects: Subject[]; starts_on: string; ends_on: string }>(
    `select email, full_name, password_hash, locale, subjects, starts_on::text as starts_on, ends_on::text as ends_on
       from teacher_applications where id = $1 and status = 'pending' for update`,
    [id],
  );
  if (!a) return { ok: false as const, reason: "gone" as const };
  const [taken] = await q(`select 1 from profiles where email = $1`, [a.email]);
  if (taken) return { ok: false as const, reason: "taken" as const };

  const [p] = await q<{ id: string }>(
    `insert into profiles (email, full_name, role, password_hash, locale) values ($1, $2, 'teacher', $3, $4) returning id`,
    [a.email, a.full_name, a.password_hash, a.locale],
  );
  await q(`insert into notification_prefs (user_id) values ($1) on conflict do nothing`, [p.id]);
  const groups = new Set((await q<{ id: string }>(`select id from groups`)).map((g) => g.id));
  const term = currentTerm(now);
  let classes = 0;
  for (const [i, s] of a.subjects.entries()) {
    const [c] = await q<{ id: string }>(
      `insert into courses (teacher_id, title, code, color, credits, term) values ($1, $2, $3, $4, $5, $6) returning id`,
      [p.id, s.title, s.code || s.title.slice(0, 3).toUpperCase(), COLORS[i % COLORS.length], s.credits, term],
    );
    const rows: { course_id: string; group_id: string; series_id: string; starts_at: string; ends_at: string; room: string }[] = [];
    // A group deleted while the application waited is skipped.
    for (const slot of s.slots.filter((x) => groups.has(x.group_id))) {
      await q(`insert into course_groups (course_id, group_id) values ($1, $2) on conflict do nothing`, [c.id, slot.group_id]);
      const series_id = randomUUID();
      for (const o of occurrences(slot, a.starts_on, a.ends_on, now))
        rows.push({ course_id: c.id, group_id: slot.group_id, series_id, starts_at: o.starts.toISOString(), ends_at: o.ends.toISOString(), room: slot.room });
    }
    if (rows.length)
      await q(
        `insert into class_sessions (course_id, group_id, series_id, starts_at, ends_at, room)
         select course_id, group_id, series_id, starts_at, ends_at, room
           from jsonb_to_recordset($1::jsonb) as x(course_id uuid, group_id uuid, series_id uuid, starts_at timestamptz, ends_at timestamptz, room text)`,
        [JSON.stringify(rows)],
      );
    classes += rows.length;
  }
  // The hash now lives in the profile; the application keeps no copy of it.
  await q(
    `update teacher_applications set status = 'approved', reviewed_by = $2, reviewed_at = $3, profile_id = $4, password_hash = '' where id = $1`,
    [id, advisorId, now.toISOString(), p.id],
  );
  await logEvent(q, advisorId, "teacher_application_approved", { id, profile_id: p.id, courses: a.subjects.length, classes });
  return { ok: true as const, profileId: p.id, email: a.email, full_name: a.full_name, locale: a.locale, courses: a.subjects.length, classes };
}

/** Refuses with a reason the teacher sees when signing in. null when someone already decided. */
export async function rejectApplication(q: Q, id: string, advisorId: string, note: string, now = new Date()) {
  const [a] = await q<{ email: string; full_name: string; locale: string }>(
    `update teacher_applications set status = 'rejected', reviewed_by = $2, reviewed_at = $3, review_note = $4
      where id = $1 and status = 'pending' returning email, full_name, locale`,
    [id, advisorId, now.toISOString(), note],
  );
  if (a) await logEvent(q, advisorId, "teacher_application_rejected", { id });
  return a ?? null;
}
