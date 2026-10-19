import { MIN, fromZoned, hm, zoned } from "../time";

export interface ReminderPrefs {
  /** Minutes before the deadline, e.g. [2880, 1440, 60]. Empty = reminders off. */
  offsets: number[];
  /** Quiet hours in Almaty, "HH:MM". Equal values = no quiet hours. */
  quietStart: string;
  quietEnd: string;
}

export interface PlannedReminder {
  offsetMinutes: number;
  kind: "reminder" | "urgent";
  sendAt: Date;
}

export const DEFAULT_OFFSETS = [1440, 60];
export const OFFSET_CHOICES = [2880, 1440, 60] as const;
/** If a reminder must move out of quiet hours but the deadline is before they end, send this long before they start. */
export const BEFORE_QUIET_MARGIN = 15 * MIN;

/**
 * Plans when to remind one student about one deadline.
 *  - one reminder per chosen offset, skipping offsets already in the past;
 *  - if the deadline is closer than the shortest offset, one "urgent" message right away;
 *  - reminders falling in quiet hours move to the end of quiet hours,
 *    or to just before they start if the deadline itself falls inside them.
 */
export function planReminders(dueAt: Date, now: Date, prefs: ReminderPrefs): PlannedReminder[] {
  const offsets = [...new Set(prefs.offsets.filter((o) => o > 0))].sort((a, b) => b - a);
  if (offsets.length === 0 || dueAt <= now) return [];

  const left = (dueAt.getTime() - now.getTime()) / MIN;
  const planned: PlannedReminder[] =
    left < offsets[offsets.length - 1]
      ? [{ offsetMinutes: 0, kind: "urgent", sendAt: now }]
      : offsets
          .map((o) => ({ offsetMinutes: o, kind: "reminder" as const, sendAt: new Date(dueAt.getTime() - o * MIN) }))
          .filter((r) => r.sendAt > now);

  const shifted = planned.map((r) => ({ ...r, sendAt: outOfQuietHours(r.sendAt, dueAt, now, prefs) }));

  // Two reminders pushed to the same moment (e.g. both to 08:00) → keep the closest one.
  const byTime = new Map<number, PlannedReminder>();
  for (const r of shifted) {
    const prev = byTime.get(r.sendAt.getTime());
    if (!prev || r.offsetMinutes < prev.offsetMinutes) byTime.set(r.sendAt.getTime(), r);
  }
  return [...byTime.values()].sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
}

/** Returns the quiet period [start, end) containing `at`, or null. */
export function quietPeriod(at: Date, quietStart: string, quietEnd: string): { start: Date; end: Date } | null {
  const qs = hm(quietStart);
  const qe = hm(quietEnd);
  if (qs === qe) return null;
  const p = zoned(at);
  const t = p.hour * 60 + p.minute;
  const day = (offset: number, minutes: number) =>
    fromZoned(p.year, p.month, p.day + offset, Math.floor(minutes / 60), minutes % 60);

  if (qs < qe) {
    // e.g. 13:00–15:00 within one day
    return t >= qs && t < qe ? { start: day(0, qs), end: day(0, qe) } : null;
  }
  // wraps midnight, e.g. 23:00–08:00
  if (t >= qs) return { start: day(0, qs), end: day(1, qe) };
  if (t < qe) return { start: day(-1, qs), end: day(0, qe) };
  return null;
}

export function outOfQuietHours(sendAt: Date, dueAt: Date, now: Date, prefs: Pick<ReminderPrefs, "quietStart" | "quietEnd">): Date {
  const q = quietPeriod(sendAt, prefs.quietStart, prefs.quietEnd);
  if (!q) return sendAt;
  if (q.end < dueAt) return q.end;
  const before = new Date(q.start.getTime() - BEFORE_QUIET_MARGIN);
  return before > now ? before : now;
}

/** Instant messages (moved deadline, cancelled class…) only wait for the end of quiet hours. */
export function instantSendAt(now: Date, prefs: Pick<ReminderPrefs, "quietStart" | "quietEnd">): Date {
  return quietPeriod(now, prefs.quietStart, prefs.quietEnd)?.end ?? now;
}

export const minutesLeft = (dueAt: Date, now: Date) => Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / MIN));
