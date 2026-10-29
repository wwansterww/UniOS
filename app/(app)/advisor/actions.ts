"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db, type Q } from "@/lib/db";
import { allowedDomain, requireUser } from "@/lib/auth";
import { dictionaries, isLocale } from "@/lib/i18n";
import { newPassword } from "@/lib/db/accounts";
import { approveApplication, rejectApplication } from "@/lib/db/applications";
import { logEvent, recomputeForStudent } from "@/lib/reminders/engine";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/notifications/channels";
import { appUrl } from "@/lib/telegram/api";
import type { Result } from "../actions";

/** password: a temporary password, shown to the advisor once. */
export type TempResult = Result & { password?: string; name?: string };

const refresh = () => revalidatePath("/", "layout");
const isId = (v: string) => /^[0-9a-f-]{36}$/.test(v);

/** The advisor manages accounts: issues them here and decides on teachers' applications (/register). */
async function advisor() {
  const user = await requireUser("advisor");
  return { user, t: dictionaries[user.locale], d: await db() };
}

async function target(q: Q, id: string) {
  const [p] = await q<{ id: string; full_name: string; role: string }>(`select id, full_name, role from profiles where id = $1`, [id]);
  return p ?? null;
}

/** Puts a student into one group (or none) and re-plans their deadline reminders. */
async function placeInGroup(q: Q, studentId: string, groupId: string) {
  await q(`delete from group_members where student_id = $1`, [studentId]);
  if (groupId) await q(`insert into group_members (group_id, student_id) select id, $2 from groups where id = $1`, [groupId, studentId]);
  await recomputeForStudent(q, studentId);
}

export async function createAccount(form: FormData): Promise<TempResult> {
  const { user, t, d } = await advisor();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const role = form.get("role") === "teacher" ? "teacher" : "student";
  const groupId = String(form.get("group_id") ?? "");
  if (name.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: t.common.error };
  if (!email.endsWith("@" + allowedDomain())) return { ok: false, message: t.admin.emailDomain(allowedDomain()) };
  const password = newPassword();
  const hash = await bcrypt.hash(password, 10);
  return d.tx(async (q): Promise<TempResult> => {
    const rows = await q<{ id: string }>(
      `insert into profiles (email, full_name, role, password_hash, must_change_password) values ($1, $2, $3, $4, true)
       on conflict (email) do nothing returning id`,
      [email, name, role, hash],
    );
    if (!rows[0]) return { ok: false, message: t.admin.emailTaken };
    await q(`insert into notification_prefs (user_id) values ($1) on conflict do nothing`, [rows[0].id]);
    if (role === "student" && isId(groupId)) await placeInGroup(q, rows[0].id, groupId);
    await logEvent(q, user.id, "account_created", { id: rows[0].id, role });
    refresh();
    return { ok: true, password, name };
  });
}

/** A new temporary password; the old one stops working, every session of that person ends, a lockout lifts. */
export async function resetPassword(id: string): Promise<TempResult> {
  const { user, t, d } = await advisor();
  if (!isId(id)) return { ok: false, message: t.common.error };
  if (id === user.id) return { ok: false, message: t.admin.notYourself };
  const password = newPassword();
  const hash = await bcrypt.hash(password, 10);
  return d.tx(async (q): Promise<TempResult> => {
    const p = await target(q, id);
    if (!p) return { ok: false, message: t.common.error };
    await q(`update profiles set password_hash = $2, must_change_password = true, session_version = session_version + 1 where id = $1`, [id, hash]);
    // A fresh password also lifts a lockout from earlier wrong guesses.
    await q(`delete from login_attempts where not ok and email = (select email from profiles where id = $1)`, [id]);
    await logEvent(q, user.id, "password_reset", { id });
    refresh();
    return { ok: true, password, name: p.full_name };
  });
}

/** Blocking signs the person out at once; their grades and attendance stay. */
export async function setBlocked(id: string, blocked: boolean): Promise<Result> {
  const { user, t, d } = await advisor();
  if (!isId(id)) return { ok: false, message: t.common.error };
  if (id === user.id) return { ok: false, message: t.admin.notYourself };
  const r = await d.q(
    `update profiles set disabled_at = ${blocked ? "now()" : "null"}, session_version = session_version + ${blocked ? 1 : 0} where id = $1 returning id`,
    [id],
  );
  if (!r.length) return { ok: false, message: t.common.error };
  await logEvent(d.q, user.id, blocked ? "account_blocked" : "account_unblocked", { id });
  refresh();
  return { ok: true, message: blocked ? t.admin.blockedToast : t.admin.unblockedToast };
}

export async function setStudentGroup(id: string, groupId: string): Promise<Result> {
  const { user, t, d } = await advisor();
  if (!isId(id) || (groupId && !isId(groupId))) return { ok: false, message: t.common.error };
  return d.tx(async (q): Promise<Result> => {
    const p = await target(q, id);
    if (p?.role !== "student") return { ok: false, message: t.common.error };
    await placeInGroup(q, id, groupId);
    await logEvent(q, user.id, "student_group_changed", { id, group_id: groupId || null });
    refresh();
    return { ok: true, message: t.admin.groupChanged };
  });
}

// ---------- teachers' applications ----------

/** Tells the applicant by email when sending email is set up; otherwise they see the decision when signing in. */
async function decisionEmail(to: string, locale: string, approved: boolean, note: string) {
  if (!process.env.RESEND_API_KEY) return;
  const t = dictionaries[isLocale(locale) ? locale : "ru"];
  const url = `${appUrl()}${approved ? "/login" : "/register"}`;
  await sendEmail(
    to,
    approved ? t.applications.mailApprovedSubject : t.applications.mailRejectedSubject,
    approved ? t.applications.mailApproved(url) : t.applications.mailRejected(note, url),
  ).catch((e) => console.error("decision email", e));
}

/** Approves: the teacher's account, a course per subject and the classes of the period appear at once. */
export async function approveTeacher(id: string): Promise<Result> {
  const { user, t, d } = await advisor();
  if (!isId(id)) return { ok: false, message: t.common.error };
  const r = await d.tx(async (q) => {
    const r = await approveApplication(q, id, user.id);
    // Waits in their inbox for the first sign-in.
    if (r.ok) await notify(q, [r.profileId], "application_approved", { courses: r.courses, classes: r.classes }, { link: "/teacher/schedule", deliver: false });
    return r;
  });
  if (!r.ok) return { ok: false, message: r.reason === "taken" ? t.applications.taken : t.applications.gone };
  after(() => decisionEmail(r.email, r.locale, true, ""));
  refresh();
  return { ok: true, message: t.applications.approvedToast(r.courses, r.classes) };
}

/** Refuses; the reason is shown to the teacher when they sign in, and they may apply again. */
export async function rejectTeacher(id: string, note: string): Promise<Result> {
  const { user, t, d } = await advisor();
  if (!isId(id)) return { ok: false, message: t.common.error };
  const reason = String(note ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
  const a = await d.tx((q) => rejectApplication(q, id, user.id, reason));
  if (!a) return { ok: false, message: t.applications.gone };
  after(() => decisionEmail(a.email, a.locale, false, reason));
  refresh();
  return { ok: true, message: t.applications.rejectedToast };
}
