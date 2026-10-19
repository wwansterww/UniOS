import ru, { type Dict } from "./ru";
import en from "./en";
import kk from "./kk";
import { DAY, HOUR, MIN, formatTime, startOfDay, type Locale } from "../time";

export const dictionaries: Record<Locale, Dict> = { ru, kk, en };
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "ru", label: "RU" },
  { code: "kk", label: "ҚАЗ" },
  { code: "en", label: "EN" },
];
export const isLocale = (v: unknown): v is Locale => v === "ru" || v === "kk" || v === "en";
export type { Dict, Locale };

/** "через 45 мин", "завтра в 18:00", "через 3 дня"… */
export function relative(t: Dict, locale: Locale, due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  if (ms < 0) {
    const days = Math.floor(-ms / DAY);
    return days >= 1 ? `${t.rel.overdue} · ${t.rel.agoDays(days)}` : t.rel.overdue;
  }
  if (ms < MIN) return t.rel.now;
  if (ms < HOUR) return t.rel.inMin(Math.round(ms / MIN));
  const dayDiff = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY);
  if (ms < 6 * HOUR) return t.rel.inHours(Math.round(ms / HOUR));
  if (dayDiff === 0) return t.rel.today(formatTime(due, locale));
  if (dayDiff === 1) return t.rel.tomorrow(formatTime(due, locale));
  return t.rel.inDays(dayDiff);
}

/** "2 ч 15 мин", "3 д 4 ч" */
export function duration(t: Dict, ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return t.rel.durMin(m);
  if (m < 24 * 60) return t.rel.durHours(Math.floor(m / 60), m % 60);
  return t.rel.durDays(Math.floor(m / 1440), Math.floor((m % 1440) / 60));
}
