// The one secret that signs session cookies and derives QR check-in codes.

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
