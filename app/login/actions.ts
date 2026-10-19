"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { emailAllowed, endSession, isDemo, startSession } from "@/lib/auth";
import { DEMO_STUDENT, DEMO_TEACHER } from "@/lib/db/seed";
import { dictionaries, isLocale } from "@/lib/i18n";
import { logEvent } from "@/lib/reminders/engine";
import { sendEmail } from "@/lib/notifications/channels";
import { appUrl } from "@/lib/telegram/api";

export type AuthState = { error?: string; info?: string } | undefined;

async function dict() {
  const c = (await cookies()).get("locale")?.value;
  return dictionaries[isLocale(c) ? c : "ru"];
}

const home = (role: string) => (role === "teacher" ? "/teacher" : "/today");

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const t = await dict();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const d = await db();
  const [u] = await d.q<{ id: string; role: string; password_hash: string | null }>(
    `select id, role, password_hash from profiles where email = $1`,
    [email],
  );
  if (!u?.password_hash || !(await bcrypt.compare(password, u.password_hash))) return { error: t.auth.wrong };
  await startSession(u.id);
  redirect(home(u.role));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const t = await dict();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim() || email.split("@")[0];
  const code = String(form.get("teacher_code") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: t.auth.wrong };
  if (!emailAllowed(email)) return { error: t.auth.domain };
  if (password.length < 8) return { error: t.auth.short };
  const teacherCode = process.env.TEACHER_CODE || (isDemo() ? "NARXOZ-TEACHER" : "");
  if (code && code !== teacherCode) return { error: t.auth.badCode };
  const role = code ? "teacher" : "student";
  const c = (await cookies()).get("locale")?.value;
  const d = await db();
  const rows = await d.q<{ id: string }>(
    `insert into profiles (email, full_name, role, password_hash, locale) values ($1, $2, $3, $4, $5)
     on conflict (email) do nothing returning id`,
    [email, name.slice(0, 120), role, await bcrypt.hash(password, 10), isLocale(c) ? c : "ru"],
  );
  if (!rows[0]) return { error: t.auth.exists };
  await d.q(`insert into notification_prefs (user_id) values ($1) on conflict do nothing`, [rows[0].id]);
  await logEvent(d.q, rows[0].id, "signup", { role });
  await startSession(rows[0].id);
  redirect(home(role));
}

export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const t = await dict();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailAllowed(email)) return { error: t.auth.domain };
  const d = await db();
  const [u] = await d.q(`select id from profiles where email = $1`, [email]);
  // Same answer whether or not the account exists.
  if (u) {
    const token = randomBytes(24).toString("base64url");
    await d.q(`insert into magic_links (token, email, expires_at) values ($1, $2, now() + interval '15 minutes')`, [token, email]);
    const link = `${appUrl()}/api/auth/magic?token=${token}`;
    if (process.env.RESEND_API_KEY) {
      await sendEmail(email, "UniOS — вход", `${t.auth.title}: ${link}\n\n15 min.`).catch((e) => console.error(e));
    } else {
      console.log(`\n[UniOS] Magic link for ${email}: ${link}\n`);
      return { info: t.auth.magicDev };
    }
  }
  return { info: t.auth.magicSent };
}

export async function demoSignIn(role: "student" | "teacher") {
  if (!isDemo()) return;
  const d = await db();
  const [u] = await d.q<{ id: string }>(`select id from profiles where email = $1`, [role === "teacher" ? DEMO_TEACHER : DEMO_STUDENT]);
  if (!u) return;
  await startSession(u.id);
  redirect(home(role));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

export async function setGuestLocale(locale: string) {
  if (isLocale(locale)) (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
