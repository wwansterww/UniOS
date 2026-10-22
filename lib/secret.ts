// The one secret that signs session cookies and derives QR check-in codes, plus helpers for comparing secrets.
import { createHash, timingSafeEqual } from "node:crypto";

/** Only for local development and tests. It is public (it's in the repository), so it must never sign anything real. */
const DEV_SECRET = "uni-dev-secret-change-me-please-32chars";

/**
 * AUTH_SECRET, or the development fallback outside production. In production a missing (or default) secret
 * stops the request instead: with the public fallback anyone could forge a session or compute check-in codes.
 */
export function appSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s !== DEV_SECRET) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("AUTH_SECRET is not set. Generate one (openssl rand -base64 32) and add it to the environment.");
  return DEV_SECRET;
}

/** Compares a request's secret with the expected one in constant time (no timing hints about how much matched). */
export function safeEqual(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !given) return false;
  // Hash both sides first: timingSafeEqual needs equal lengths, and the length must not leak either.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** One-way hash for tokens kept in the database (a leaked table must not give working sign-in links). */
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64url");
