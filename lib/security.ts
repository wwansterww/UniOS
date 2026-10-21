// Sign-in protection and password rules. Works on any Postgres handle, so it is shared by the app and the tests.
import type { Q } from "./db/core";
import { MIN } from "./time";

/** Wrong passwords for one email before it is locked, and for one network address. */
export const MAX_FAILS = 5;
export const IP_MAX_FAILS = 20;
/** Lockout window and duration, minutes. */
export const LOCK_MIN = 15;

export interface Guard {
  locked: boolean;
  /** Minutes until the lock lifts (when locked). */
  retryInMin: number;
  /** Wrong passwords for this email since its last successful sign-in, within the window. */
  emailFails: number;
}

/**
 * Locked when the email has MAX_FAILS wrong passwords (since its last success) in the last LOCK_MIN minutes,
 * or the address has IP_MAX_FAILS. The lock lifts LOCK_MIN minutes after the oldest of those failures.
 */
export async function loginGuard(q: Q, email: string, ip: string, now = new Date()): Promise<Guard> {
  const since = new Date(now.getTime() - LOCK_MIN * MIN).toISOString();
  const byEmail = await q<{ created_at: Date }>(
    `select created_at from login_attempts
      where email = $1 and not ok and created_at > $2
        and created_at > coalesce((select max(created_at) from login_attempts where email = $1 and ok), '-infinity'::timestamptz)
      order by created_at desc limit $3`,
    [email, since, MAX_FAILS],
  );
  const byIp = ip
    ? await q<{ created_at: Date }>(
        `select created_at from login_attempts where ip = $1 and not ok and created_at > $2 order by created_at desc limit $3`,
        [ip, since, IP_MAX_FAILS],
      )
    : [];
  const until = (list: { created_at: Date }[], max: number) =>
    list.length >= max ? new Date(list[max - 1].created_at).getTime() + LOCK_MIN * MIN : 0;
  const lockedUntil = Math.max(until(byEmail, MAX_FAILS), until(byIp, IP_MAX_FAILS));
  const locked = lockedUntil > now.getTime();
  return { locked, retryInMin: locked ? Math.max(1, Math.ceil((lockedUntil - now.getTime()) / MIN)) : 0, emailFails: byEmail.length };
}

export async function recordAttempt(q: Q, a: { email: string; ip: string; userAgent: string; ok: boolean }, now = new Date()) {
  await q(`insert into login_attempts (email, ip, user_agent, ok, created_at) values ($1, $2, $3, $4, $5)`, [
    a.email.slice(0, 200),
    a.ip.slice(0, 64),
    a.userAgent.slice(0, 300),
    a.ok,
    now.toISOString(),
  ]);
}

export type PasswordProblem = "short" | "weak" | "personal";

/** At least 8 characters with letters and digits, and not built from the person's email or name. */
export function passwordProblem(password: string, who: { email: string; full_name?: string }): PasswordProblem | null {
  if (password.length < 8) return "short";
  if (!/[a-zа-яёәғқңөұүһі]/i.test(password) || !/\d/.test(password)) return "weak";
  const p = password.toLowerCase();
  // "a.nurlanov@…" and "Алибек Нурланов" → nurlanov, алибек, нурланов
  const parts = [...who.email.split("@")[0].split(/[^\p{L}\d]+/u), ...(who.full_name ?? "").split(/[^\p{L}\d]+/u)]
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 4);
  if (parts.some((s) => p.includes(s))) return "personal";
  return null;
}

/** "Chrome · macOS" from a User-Agent, for the list of recent sign-ins. */
export function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}
