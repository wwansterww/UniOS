// All timestamps are stored in UTC and shown in Asia/Almaty.
export const TZ = "Asia/Almaty";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type Locale = "ru" | "kk" | "en";
const intlLocale: Record<Locale, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-GB" };

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Wall-clock parts in Almaty. weekday: 0 = Monday … 6 = Sunday. */
export function zoned(date: Date): Parts {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** UTC instant for an Almaty wall-clock time (month is 1-based). Day/hour overflow is normalised. */
export function fromZoned(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Offset of Almaty at that moment (constant +05:00 today, but don't hard-code it).
  const p = zoned(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (asUtc - guess));
}

export function startOfDay(date: Date): Date {
  const p = zoned(date);
  return fromZoned(p.year, p.month, p.day);
}

export function startOfWeek(date: Date): Date {
  const p = zoned(date);
  return fromZoned(p.year, p.month, p.day - p.weekday);
}

export function addDays(date: Date, n: number): Date {
  const p = zoned(date);
  return fromZoned(p.year, p.month, p.day + n, p.hour, p.minute);
}

/** "HH:MM" → minutes since midnight. Accepts "HH:MM:SS". */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** "2026-10-17T18:00" (datetime-local, Almaty) → Date */
export function parseLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return fromZoned(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

/** Date → "2026-10-17T18:00" in Almaty, for datetime-local inputs. */
export function toLocalInput(date: Date): string {
  const p = zoned(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function dateKey(date: Date): string {
  return toLocalInput(date).slice(0, 10);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: Locale, opts: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: TZ, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export const formatTime = (d: Date, l: Locale = "ru") => fmt(l, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
export const formatDay = (d: Date, l: Locale = "ru") => fmt(l, { weekday: "short", day: "numeric", month: "short" }).format(d);
export const formatWeekday = (d: Date, l: Locale = "ru") => fmt(l, { weekday: "short" }).format(d);
export const formatLongDay = (d: Date, l: Locale = "ru") => fmt(l, { weekday: "long", day: "numeric", month: "long" }).format(d);
export const formatDateTime = (d: Date, l: Locale = "ru") => `${formatDay(d, l)}, ${formatTime(d, l)}`;
/** Short "пт 18:00" form used in change messages. */
export const formatShort = (d: Date, l: Locale = "ru") => `${formatWeekday(d, l)} ${formatTime(d, l)}`;

/** Urgency of a deadline for colour labels. */
export function urgency(due: Date, now: Date): "overdue" | "critical" | "soon" | "normal" {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return "overdue";
  if (ms <= 3 * HOUR) return "critical";
  if (ms <= 36 * HOUR) return "soon";
  return "normal";
}
