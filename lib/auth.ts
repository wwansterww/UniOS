import "server-only";
import { appSecret } from "./secret";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { isLocale, type Locale } from "./i18n";

export interface User {
  id: string;
  email: string;
  role: "student" | "teacher" | "advisor";
  full_name: string;
  locale: Locale;
  telegram_chat_id: string | null;
  ics_token: string;
  /** Signed in with a temporary password (set by the advisor): asked to choose their own. */
  must_change_password: boolean;
}

const COOKIE = "uni_session";
const MAX_AGE = 60 * 60 * 24 * 30;

const secret = () => new TextEncoder().encode(appSecret());

export const isDemo = () => process.env.DEMO_MODE !== "false";
export const allowedDomain = () => process.env.ALLOWED_EMAIL_DOMAIN || "narxoz.kz";
export const emailAllowed = (email: string) => isDemo() || email.toLowerCase().endsWith("@" + allowedDomain());

/** Signs the user in on this device. The session carries the profile's version (see 006_security). */
export async function startSession(userId: string) {
  const d = await db();
  const [p] = await d.q<{ session_version: number }>(`select session_version from profiles where id = $1`, [userId]);
  const token = await new SignJWT({ sub: userId, v: p?.session_version ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  // Secure only over https: a Secure cookie on http://<LAN IP>:3000 is dropped by the browser,
  // so the next page would ask to sign in again. Next fills x-forwarded-proto itself (or the proxy does).
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** Current user or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const d = await db();
    const [u] = await d.q<User & { session_version: number; disabled_at: Date | null }>(
      `select id, email, role, full_name, locale, telegram_chat_id::text as telegram_chat_id, ics_token,
              must_change_password, session_version, disabled_at
         from profiles where id = $1`,
      [payload.sub],
    );
    // Blocked accounts and sessions from before a password change / "sign out everywhere" are no longer valid.
    if (!u || u.disabled_at || (Number(payload.v) || 0) !== u.session_version) return null;
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      full_name: u.full_name,
      locale: isLocale(u.locale) ? u.locale : "ru",
      telegram_chat_id: u.telegram_chat_id,
      ics_token: u.ics_token,
      must_change_password: u.must_change_password,
    };
  } catch {
    return null;
  }
});

/** Start page of each role. */
export const homeFor = (role: string) => (role === "teacher" ? "/teacher" : role === "advisor" ? "/advisor" : "/today");

/** Only same-site paths are allowed as a post-login destination. */
export const safeNext = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : null);

export async function requireUser(role?: User["role"]): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (role && u.role !== role) redirect(homeFor(u.role));
  return u;
}

/** Locale for pages without a user (login): cookie, then RU. */
export async function currentLocale(): Promise<Locale> {
  const u = await getUser();
  if (u) return u.locale;
  const c = (await cookies()).get("locale")?.value;
  return isLocale(c) ? c : "ru";
}
