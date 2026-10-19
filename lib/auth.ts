import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { isLocale, type Locale } from "./i18n";

export interface User {
  id: string;
  email: string;
  role: "student" | "teacher";
  full_name: string;
  locale: Locale;
  telegram_chat_id: string | null;
  ics_token: string;
}

const COOKIE = "uni_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "false")
    throw new Error("AUTH_SECRET must be set in production");
  return new TextEncoder().encode(s || "uni-dev-secret-change-me-please-32chars");
}

export const isDemo = () => process.env.DEMO_MODE !== "false";
export const allowedDomain = () => process.env.ALLOWED_EMAIL_DOMAIN || "narxoz.kz";
export const emailAllowed = (email: string) => isDemo() || email.toLowerCase().endsWith("@" + allowedDomain());

export async function startSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
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
    const [u] = await d.q<User>(
      `select id, email, role, full_name, locale, telegram_chat_id::text as telegram_chat_id, ics_token
         from profiles where id = $1`,
      [payload.sub],
    );
    if (!u) return null;
    return { ...u, locale: isLocale(u.locale) ? u.locale : "ru" };
  } catch {
    return null;
  }
});

export async function requireUser(role?: User["role"]): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (role && u.role !== role) redirect(u.role === "teacher" ? "/teacher" : "/today");
  return u;
}

/** Locale for pages without a user (login): cookie, then RU. */
export async function currentLocale(): Promise<Locale> {
  const u = await getUser();
  if (u) return u.locale;
  const c = (await cookies()).get("locale")?.value;
  return isLocale(c) ? c : "ru";
}
