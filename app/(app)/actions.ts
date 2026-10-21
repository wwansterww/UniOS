"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { db, withUser } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { logEvent, markDone, recomputeForDeadline, recomputeForStudent, undoDone } from "@/lib/reminders/engine";
import { OFFSET_CHOICES } from "@/lib/reminders/plan";
import { parseLocalInput } from "@/lib/time";
import { botToken, botUsername, sendMessage } from "@/lib/telegram/api";
import { dictionaries } from "@/lib/i18n";
import { syncCanvas, validateFeedUrl } from "@/lib/canvas";
import { dispatchNow } from "@/lib/jobs";
import { notify } from "@/lib/notifications/notify";
import bcrypt from "bcryptjs";
import { startSession } from "@/lib/auth";
import { passwordProblem } from "@/lib/security";
import { FILE_FORMATS, MAX_FILES, MAX_FILE_BYTES, MAX_FILE_MB, acceptsFile, isFileFormat, uploadState } from "@/lib/submissions";

export type Result = { ok: boolean; message?: string; url?: string };

const refresh = () => revalidatePath("/", "layout");

/** Can this user see the deadline (RLS)? */
async function visibleDeadline(userId: string, id: string) {
  const rows = await withUser(userId, (q) =>
    q<{ id: string; owner_id: string | null; file_types: string[] | null }>(`select id, owner_id, file_types from deadlines where id = $1`, [id]),
  );
  return rows[0] ?? null;
}

export async function setDone(deadlineId: string, done: boolean): Promise<Result> {
  const user = await requireUser("student");
  const dl = await visibleDeadline(user.id, deadlineId);
  if (!dl) return { ok: false };
  // Work handed in as files is done when a file is uploaded, not by a tick.
  if (dl.file_types) return { ok: false, message: dictionaries[user.locale].submit.needsFile };
  const d = await db();
  await d.tx((q) => (done ? markDone(q, user.id, deadlineId) : undoDone(q, user.id, deadlineId)));
  refresh();
  return { ok: true };
}

export async function addPersonalTask(form: FormData): Promise<Result> {
  const user = await requireUser("student");
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const due = parseLocalInput(String(form.get("due") ?? ""));
  if (!title || !due) return { ok: false, message: dictionaries[user.locale].common.error };
  const d = await db();
  await d.tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `insert into deadlines (owner_id, title, due_at, description, link, created_by) values ($1, $2, $3, $4, $5, $1) returning id`,
      [user.id, title, due.toISOString(), String(form.get("description") ?? "").slice(0, 2000), String(form.get("link") ?? "").trim() || null],
    );
    await recomputeForDeadline(q, row.id);
    await logEvent(q, user.id, "personal_task_created", {});
  });
  after(() => dispatchNow(d));
  refresh();
  return { ok: true };
}

export async function deletePersonalTask(id: string): Promise<Result> {
  const user = await requireUser("student");
  const d = await db();
  await d.tx(async (q) => {
    await q(`update deadlines set deleted_at = now(), updated_at = now() where id = $1 and owner_id = $2`, [id, user.id]);
    await q(`delete from reminders where deadline_id = $1 and sent_at is null`, [id]);
  });
  refresh();
  return { ok: true };
}

export async function markAnnouncementRead(id: string): Promise<Result> {
  const user = await requireUser("student");
  const visible = await withUser(user.id, (q) => q(`select 1 from announcements where id = $1`, [id]));
  if (!visible.length) return { ok: false };
  const d = await db();
  await d.q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2) on conflict do nothing`, [id, user.id]);
  await d.q(`update notifications set read_at = now() where user_id = $1 and read_at is null and payload->>'announcementId' = $2`, [user.id, id]);
  refresh();
  return { ok: true };
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<Result> {
  const user = await requireUser();
  const d = await db();
  if (ids === "all") await d.q(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [user.id]);
  else
    await d.q(`update notifications set read_at = now() where user_id = $1 and read_at is null and id::text = any(string_to_array($2, ','))`, [
      user.id,
      ids.join(","),
    ]);
  refresh();
  return { ok: true };
}

export async function savePrefs(form: FormData): Promise<Result> {
  const user = await requireUser();
  const offsets = form
    .getAll("offsets")
    .map(Number)
    .filter((o) => (OFFSET_CHOICES as readonly number[]).includes(o));
  const channels = form.getAll("channels").map(String).filter((c) => ["telegram", "email", "in_app"].includes(c));
  const time = (v: FormDataEntryValue | null, def: string) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : def);
  const d = await db();
  await d.tx(async (q) => {
    await q(
      `insert into notification_prefs (user_id, offsets_minutes, instant_enabled, channels, quiet_start, quiet_end, digest_enabled)
       values ($1, coalesce(string_to_array(nullif($2, ''), ',')::int[], '{}'), $3, coalesce(string_to_array(nullif($4, ''), ','), '{}'), $5::time, $6::time, $7)
       on conflict (user_id) do update set offsets_minutes = excluded.offsets_minutes, instant_enabled = excluded.instant_enabled,
         channels = excluded.channels, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, digest_enabled = excluded.digest_enabled`,
      [
        user.id,
        offsets.join(","),
        form.get("instant") === "on",
        channels.join(","),
        time(form.get("quiet_start"), "23:00"),
        time(form.get("quiet_end"), "08:00"),
        form.get("digest") === "on",
      ],
    );
    if (user.role === "student") await recomputeForStudent(q, user.id);
    await logEvent(q, user.id, "prefs_saved", { offsets, channels });
  });
  refresh();
  return { ok: true, message: dictionaries[user.locale].common.saved };
}

export async function joinGroup(form: FormData): Promise<Result> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const d = await db();
  const [g] = await d.q<{ id: string; name: string }>(`select id, name from groups where upper(invite_code) = $1`, [code]);
  if (!g) return { ok: false, message: t.profile.badInvite };
  await d.tx(async (q) => {
    await q(`insert into group_members (group_id, student_id) values ($1, $2) on conflict do nothing`, [g.id, user.id]);
    await recomputeForStudent(q, user.id);
    await logEvent(q, user.id, "group_joined", { group_id: g.id });
  });
  refresh();
  return { ok: true, message: t.profile.joined(g.name) };
}

export async function leaveGroup(groupId: string): Promise<Result> {
  const user = await requireUser("student");
  const d = await db();
  await d.tx(async (q) => {
    await q(`delete from group_members where group_id = $1 and student_id = $2`, [groupId, user.id]);
    await recomputeForStudent(q, user.id);
  });
  refresh();
  return { ok: true };
}

export async function telegramLink(): Promise<Result> {
  const user = await requireUser();
  if (!botToken() || !botUsername()) return { ok: false, message: dictionaries[user.locale].profile.tgNoBot };
  const token = randomBytes(16).toString("hex");
  const d = await db();
  await d.q(`insert into telegram_link_tokens (token, user_id, expires_at) values ($1, $2, now() + interval '30 minutes')`, [token, user.id]);
  return { ok: true, url: `https://t.me/${botUsername()}?start=${token}` };
}

export async function disconnectTelegram(): Promise<Result> {
  const user = await requireUser();
  const d = await db();
  await d.q(`update profiles set telegram_chat_id = null where id = $1`, [user.id]);
  refresh();
  return { ok: true };
}

export async function telegramTest(): Promise<Result> {
  const user = await requireUser();
  const t = dictionaries[user.locale];
  if (!user.telegram_chat_id || !botToken()) return { ok: false, message: t.profile.tgNoBot };
  try {
    await sendMessage(user.telegram_chat_id, t.bot.test);
    return { ok: true, message: t.profile.tgTestSent };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function resetIcsToken(): Promise<Result> {
  const user = await requireUser();
  const d = await db();
  await d.q(`update profiles set ics_token = $2 where id = $1`, [user.id, randomBytes(16).toString("hex")]);
  refresh();
  return { ok: true };
}

export async function saveCanvas(form: FormData): Promise<Result> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  const raw = String(form.get("url") ?? "").trim();
  const url = validateFeedUrl(raw);
  if (!url) return { ok: false, message: t.common.error + ": https://…ics" };
  const d = await db();
  await d.q(`update profiles set canvas_feed_url = $2, canvas_error = null where id = $1`, [user.id, url.toString()]);
  try {
    const n = await syncCanvas(d, user.id);
    after(() => dispatchNow(d));
    refresh();
    return { ok: true, message: t.profile.canvasSynced(n) };
  } catch (e) {
    refresh();
    return { ok: false, message: `${t.common.error}: ${(e as Error).message}` };
  }
}

export async function removeCanvas(): Promise<Result> {
  const user = await requireUser("student");
  const d = await db();
  await d.q(`update profiles set canvas_feed_url = null, canvas_synced_at = null, canvas_error = null where id = $1`, [user.id]);
  refresh();
  return { ok: true };
}

export async function setLocale(locale: string): Promise<Result> {
  const user = await requireUser();
  if (!isLocale(locale)) return { ok: false };
  const d = await db();
  await d.q(`update profiles set locale = $2 where id = $1`, [user.id, locale]);
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
  return { ok: true };
}

export async function openedReminder(reminderId: string) {
  const user = await requireUser();
  const d = await db();
  await d.q(`update reminders set opened_at = coalesce(opened_at, now()) where id = $1 and student_id = $2`, [reminderId, user.id]);
}

// ---------- medical certificates (справки) ----------

const EXCUSE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** A student attaches a reason and, optionally, a photo/PDF to one of their absences; the class's teacher reviews it. */
export async function submitExcuse(form: FormData): Promise<Result> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  const sessionId = String(form.get("session_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 1000);
  const file = form.get("file");
  let bytes: Buffer | null = null;
  let type: string | null = null;
  let name: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) return { ok: false, message: t.attendance.excuseTooBig };
    if (!EXCUSE_TYPES.includes(file.type)) return { ok: false, message: t.attendance.excuseBadType };
    bytes = Buffer.from(await file.arrayBuffer());
    type = file.type;
    name = file.name.slice(0, 120);
  }
  if (!/^[0-9a-f-]{36}$/.test(sessionId) || (!reason && !bytes)) return { ok: false, message: t.common.error };
  const d = await db();
  const res = await d.tx(async (q): Promise<Result> => {
    const [a] = await q<{ status: string; teacher_id: string; course_title: string; starts_at: Date }>(
      `select a.status, c.teacher_id, c.title as course_title, cs.starts_at
         from attendance a join class_sessions cs on cs.id = a.session_id join courses c on c.id = cs.course_id
        where a.session_id = $1 and a.student_id = $2`,
      [sessionId, user.id],
    );
    if (!a || a.status !== "absent") return { ok: false, message: t.common.error };
    const [ex] = await q<{ status: string }>(`select status from excuses where session_id = $1 and student_id = $2`, [sessionId, user.id]);
    if (ex && ex.status !== "rejected") return { ok: false, message: t.attendance.excusePending };
    await q(
      `insert into excuses (session_id, student_id, reason, file, file_type, file_name) values ($1, $2, $3, $4, $5, $6)
       on conflict (session_id, student_id) do update set reason = excluded.reason, file = excluded.file, file_type = excluded.file_type,
         file_name = excluded.file_name, status = 'pending', reviewed_by = null, reviewed_at = null, created_at = now()`,
      [sessionId, user.id, reason, bytes, type, name],
    );
    await notify(q, [a.teacher_id], "excuse_new", { course: a.course_title, title: user.full_name, old: new Date(a.starts_at).toISOString() }, {
      link: "/teacher/attendance?view=excuses",
      deliver: false,
    });
    await logEvent(q, user.id, "excuse_submitted", { session_id: sessionId, file: !!bytes });
    return { ok: true, message: t.attendance.excuseSent };
  });
  refresh();
  return res;
}

// ---------- file submissions ----------

/** One file of the student's work for a deadline. Each file is its own request (≤ 4 MB, Vercel's body limit). */
export async function uploadSubmission(form: FormData): Promise<Result> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  const deadlineId = String(form.get("deadline_id") ?? "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/.test(deadlineId) || !(file instanceof File) || file.size === 0) return { ok: false, message: t.common.error };
  const dl = await visibleDeadline(user.id, deadlineId);
  if (!dl?.file_types) return { ok: false, message: t.common.error };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: t.submit.tooBig(MAX_FILE_MB) };
  if (!acceptsFile(dl.file_types, file.name))
    return { ok: false, message: t.submit.badType(dl.file_types.filter(isFileFormat).flatMap((f) => FILE_FORMATS[f]).join(", ")) };
  const bytes = Buffer.from(await file.arrayBuffer());
  // Keep the end of long names: it carries the extension.
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-120);
  const d = await db();
  const res = await d.tx(async (q): Promise<Result> => {
    // The row lock makes "closed?" and "how many files?" hold until the insert.
    const [row] = await q<{ due_at: Date; file_types: string[] | null; allow_late: boolean }>(
      `select due_at, file_types, allow_late from deadlines where id = $1 and deleted_at is null for update`,
      [deadlineId],
    );
    if (!row) return { ok: false, message: t.common.error };
    const state = uploadState(row);
    if (state === "none" || state === "closed") return { ok: false, message: t.submit.closedToast };
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from submission_files where deadline_id = $1 and student_id = $2`, [deadlineId, user.id]);
    if (n >= MAX_FILES) return { ok: false, message: t.submit.tooMany(MAX_FILES) };
    await q(`insert into submission_files (deadline_id, student_id, name, size, data) values ($1, $2, $3, $4, $5)`, [
      deadlineId,
      user.id,
      name,
      bytes.length,
      bytes,
    ]);
    await markDone(q, user.id, deadlineId);
    await logEvent(q, user.id, "submission_uploaded", { deadline_id: deadlineId, late: state === "late" });
    return { ok: true, message: t.submit.uploaded };
  });
  refresh();
  return res;
}

/** Removes one of the student's files while uploads are still open. The last one gone = not handed in. */
export async function deleteSubmissionFile(id: string): Promise<Result> {
  const user = await requireUser("student");
  const t = dictionaries[user.locale];
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: t.common.error };
  const d = await db();
  const res = await d.tx(async (q): Promise<Result> => {
    const [f] = await q<{ deadline_id: string; due_at: Date; file_types: string[] | null; allow_late: boolean }>(
      `select sf.deadline_id, d.due_at, d.file_types, d.allow_late from submission_files sf join deadlines d on d.id = sf.deadline_id
        where sf.id = $1 and sf.student_id = $2 and d.deleted_at is null`,
      [id, user.id],
    );
    if (!f) return { ok: false, message: t.common.error };
    const state = uploadState(f);
    if (state === "none" || state === "closed") return { ok: false, message: t.submit.closedToast };
    await q(`delete from submission_files where id = $1`, [id]);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from submission_files where deadline_id = $1 and student_id = $2`, [f.deadline_id, user.id]);
    if (n === 0) await undoDone(q, user.id, f.deadline_id);
    return { ok: true, message: t.submit.removed };
  });
  refresh();
  return res;
}

// ---------- security ----------

/** Changes one's own password; other devices are signed out, this one stays signed in. */
export async function changePassword(form: FormData): Promise<Result> {
  const user = await requireUser();
  const t = dictionaries[user.locale];
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "").slice(0, 200);
  if (next !== String(form.get("repeat") ?? "")) return { ok: false, message: t.profile.passwordMismatch };
  const problem = passwordProblem(next, user);
  if (problem) return { ok: false, message: { short: t.profile.passwordShort, weak: t.profile.passwordWeak, personal: t.profile.passwordPersonal }[problem] };
  const d = await db();
  const [p] = await d.q<{ password_hash: string | null }>(`select password_hash from profiles where id = $1`, [user.id]);
  if (!p?.password_hash || !(await bcrypt.compare(current, p.password_hash))) return { ok: false, message: t.profile.passwordWrong };
  if (current === next) return { ok: false, message: t.profile.passwordSame };
  await d.q(
    `update profiles set password_hash = $2, must_change_password = false, session_version = session_version + 1 where id = $1`,
    [user.id, await bcrypt.hash(next, 10)],
  );
  await startSession(user.id);
  await logEvent(d.q, user.id, "password_changed", {});
  refresh();
  return { ok: true, message: t.profile.passwordChanged };
}

/** Ends every other session of this account (lost phone, shared computer). */
export async function signOutEverywhere(): Promise<Result> {
  const user = await requireUser();
  const d = await db();
  await d.q(`update profiles set session_version = session_version + 1 where id = $1`, [user.id]);
  await startSession(user.id);
  await logEvent(d.q, user.id, "signed_out_everywhere", {});
  return { ok: true, message: dictionaries[user.locale].profile.loggedOutEverywhere };
}
