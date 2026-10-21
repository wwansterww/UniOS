"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { emailAllowed, endSession, homeFor, safeNext, startSession } from "@/lib/auth";
import { dictionaries, isLocale } from "@/lib/i18n";
import { sendEmail } from "@/lib/notifications/channels";
import { appUrl } from "@/lib/telegram/api";
import { LOCK_MIN, MAX_FAILS, loginGuard, recordAttempt } from "@/lib/security";

/** email: what was typed, so a failed attempt doesn't wipe it from the form. */
export type AuthState = { error?: string; info?: string; email?: string } | undefined;

async function dict() {
  const c = (await cookies()).get("locale")?.value;
  return dictionaries[isLocale(c) ? c : "ru"];
}

/**
 * Accounts are issued by the university (lib/db/accounts.ts): there is no sign-up.
 * Where to go after signing in: back to the page that asked for it (e.g. a QR check-in), else the role's home.
 */
const home = (role: string, form?: FormData) => safeNext(form?.get("next")) ?? homeFor(role);

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummy: string | undefined;
const dummyHash = () => (dummy ??= bcrypt.hashSync("unios-not-a-password", 8));

/**
 * Email + password. After MAX_FAILS wrong passwords the email is locked for LOCK_MIN minutes (an address that
 * keeps failing gets locked too); the last two attempts are counted down. Blocked accounts can't sign in.
 */
export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const t = await dict();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
  const userAgent = h.get("user-agent") ?? "";
  const d = await db();
  const guard = await loginGuard(d.q, email, ip);
  if (guard.locked) return { error: t.auth.locked(guard.retryInMin), email };
  const [u] = await d.q<{ id: string; role: string; password_hash: string | null; disabled_at: Date | null }>(
    `select id, role, password_hash, disabled_at from profiles where email = $1`,
    [email],
  );
  const ok = await bcrypt.compare(password, u?.password_hash ?? dummyHash());
  if (!u || !ok) {
    await recordAttempt(d.q, { email, ip, userAgent, ok: false });
    const left = MAX_FAILS - guard.emailFails - 1;
    return { error: left <= 0 ? t.auth.locked(LOCK_MIN) : left <= 2 ? t.auth.wrongLeft(left) : t.auth.wrong, email };
  }
  if (u.disabled_at) return { error: t.auth.blocked, email };
  await recordAttempt(d.q, { email, ip, userAgent, ok: true });
  await startSession(u.id);
  redirect(home(u.role, form));
}

/** Sign-in link by email; only offered when email sending (Resend) is configured. */
export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const t = await dict();
  if (!process.env.RESEND_API_KEY) return { error: t.common.error };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailAllowed(email)) return { error: t.auth.domain };
  const d = await db();
  const [u] = await d.q(`select id from profiles where email = $1`, [email]);
  // Same answer whether or not the account exists.
  if (u) {
    const token = randomBytes(24).toString("base64url");
    await d.q(`insert into magic_links (token, email, expires_at) values ($1, $2, now() + interval '15 minutes')`, [token, email]);
    const link = `${appUrl()}/api/auth/magic?token=${token}`;
    await sendEmail(email, "UniOS — вход", `${t.auth.title}: ${link}\n\n15 min.`).catch((e) => console.error(e));
  }
  return { info: t.auth.magicSent };
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
