import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appSecret } from "./secret";

/** QR check-in: a 6-digit code per class that changes every 15 seconds; only the server can make it. */
export const CHECKIN_WINDOW_MS = 15_000;
/** Marks after this many minutes from the start count as late. */
export const LATE_AFTER_MIN = 15;

const secret = appSecret;

export const checkinWindow = (now = Date.now()) => Math.floor(now / CHECKIN_WINDOW_MS);

export function checkinCode(sessionId: string, window = checkinWindow()): string {
  const h = createHmac("sha256", secret()).update(`checkin:${sessionId}:${window}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** The current code, or the previous one (scanning and typing take a moment). */
export function checkinValid(sessionId: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const w = checkinWindow(now);
  return [w, w - 1].some((x) => timingSafeEqual(Buffer.from(checkinCode(sessionId, x)), Buffer.from(code)));
}

/** Milliseconds until the code changes. */
export const checkinMsLeft = (now = Date.now()) => (checkinWindow(now) + 1) * CHECKIN_WINDOW_MS - now;
