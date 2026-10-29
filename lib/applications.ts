// Teacher applications: a teacher (also one from outside the university) asks for an account with the subjects
// they teach and a weekly timetable; an advisor approves or rejects (lib/db/applications.ts).
// Pure code shared by the registration form, the server and the tests.
import { passwordProblem } from "./security";
import { DAY, MIN, addDays, dateKey, fromZoned, startOfWeek, zoned, type Locale } from "./time";

/** Narxoz pairs are 75 minutes and start at these times. */
export const PAIR_STARTS = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];
export const PAIR_MIN = 75;
/** Classes run Monday (0) to Saturday (5). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5];
export const LIMITS = { subjects: 8, slots: 30, weeks: 20, note: 500 };

export type Slot = { group_id: string; weekday: number; start: string; room: string };
export type Subject = { title: string; code: string; credits: number; slots: Slot[] };
export interface Application {
  full_name: string;
  email: string;
  password: string;
  locale: Locale;
  note: string;
  /** First and last day of classes, "YYYY-MM-DD" in Almaty. */
  starts_on: string;
  ends_on: string;
  subjects: Subject[];
}

/** What is wrong with an application; the form shows it on the step it belongs to. */
export type Problem =
  | { code: "name" | "email" | "short" | "weak" | "personal" | "subjects" | "group" | "dates" }
  | { code: "title" | "slots"; subject: number }
  | { code: "clash"; group: string; weekday: number; start: string }
  | { code: "twoRooms"; weekday: number; start: string };

export const problemStep = (p: Problem) => (["name", "email", "short", "weak", "personal"].includes(p.code) ? 0 : 1);

/** "09:30" → "09:30–10:45" */
export function pairLabel(start: string) {
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + PAIR_MIN;
  return `${start}–${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(dayStart(s)) === s;
const dayStart = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return fromZoned(y, m, d);
};

/**
 * Checks everything a stranger may send. `groups` maps existing group ids to names, `today` is "YYYY-MM-DD".
 * Two classes of one group at the same time, or the teacher in two rooms at once, are refused; one class for
 * several groups in the same room (a lecture for a stream) is fine.
 */
export function parseApplication(
  raw: unknown,
  { groups, today }: { groups: Map<string, string>; today: string },
): { ok: true; value: Application } | { ok: false; problem: Problem } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const full_name = text(o.full_name, 120);
  const email = text(o.email, 200).toLowerCase();
  const password = typeof o.password === "string" ? o.password.slice(0, 200) : "";
  if (full_name.length < 3) return { ok: false, problem: { code: "name" } };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, problem: { code: "email" } };
  const weak = passwordProblem(password, { email, full_name });
  if (weak) return { ok: false, problem: { code: weak } };

  const list = Array.isArray(o.subjects) ? o.subjects.slice(0, LIMITS.subjects) : [];
  if (list.length === 0) return { ok: false, problem: { code: "subjects" } };
  const subjects: Subject[] = [];
  const taken = new Map<string, string>(); // weekday|start → room the teacher is in
  const busy = new Set<string>(); // group|weekday|start
  let slotCount = 0;
  for (const [i, s] of list.entries()) {
    const so = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const title = text(so.title, 120);
    if (title.length < 2) return { ok: false, problem: { code: "title", subject: i + 1 } };
    const credits = Number(so.credits);
    const rawSlots = Array.isArray(so.slots) ? so.slots : [];
    if (rawSlots.length === 0) return { ok: false, problem: { code: "slots", subject: i + 1 } };
    const slots: Slot[] = [];
    for (const r of rawSlots) {
      if (++slotCount > LIMITS.slots) return { ok: false, problem: { code: "slots", subject: i + 1 } };
      const ro = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const slot: Slot = {
        group_id: text(ro.group_id, 40),
        weekday: Number(ro.weekday),
        start: text(ro.start, 5),
        room: text(ro.room, 40).replace(/,/g, " "),
      };
      if (!groups.has(slot.group_id)) return { ok: false, problem: { code: "group" } };
      if (!WEEKDAYS.includes(slot.weekday) || !PAIR_STARTS.includes(slot.start)) return { ok: false, problem: { code: "slots", subject: i + 1 } };
      const when = `${slot.weekday}|${slot.start}`;
      if (busy.has(`${slot.group_id}|${when}`))
        return { ok: false, problem: { code: "clash", group: groups.get(slot.group_id)!, weekday: slot.weekday, start: slot.start } };
      busy.add(`${slot.group_id}|${when}`);
      const room = taken.get(when);
      if (room !== undefined && roomKey(room) !== roomKey(slot.room)) return { ok: false, problem: { code: "twoRooms", weekday: slot.weekday, start: slot.start } };
      taken.set(when, slot.room);
      slots.push(slot);
    }
    subjects.push({
      title,
      code: text(so.code, 30),
      credits: Number.isInteger(credits) && credits >= 1 && credits <= 30 ? credits : 5,
      slots,
    });
  }

  const starts_on = text(o.starts_on, 10);
  const ends_on = text(o.ends_on, 10);
  if (!isDate(starts_on) || !isDate(ends_on) || ends_on < starts_on || ends_on < today) return { ok: false, problem: { code: "dates" } };
  if (dayStart(ends_on).getTime() - dayStart(starts_on).getTime() >= LIMITS.weeks * 7 * DAY) return { ok: false, problem: { code: "dates" } };
  if (dayStart(starts_on).getTime() - dayStart(today).getTime() > 180 * DAY) return { ok: false, problem: { code: "dates" } };

  const locale = o.locale === "kk" || o.locale === "en" ? o.locale : "ru";
  return { ok: true, value: { full_name, email, password, locale, note: text(o.note, LIMITS.note), starts_on, ends_on, subjects } };
}

/** Rooms compare without case, spaces and dots: "Ауд. 305" = "ауд305". */
export const roomKey = (room: string) => room.toLowerCase().replace(/[\s.]/g, "");

/** Every class of a weekly slot between the first and the last day, skipping those that start before `from`. */
export function occurrences(slot: Pick<Slot, "weekday" | "start">, startsOn: string, endsOn: string, from?: Date): { starts: Date; ends: Date }[] {
  const [y, m, d] = startsOn.split("-").map(Number);
  const [h, mi] = slot.start.split(":").map(Number);
  const end = dayStart(endsOn).getTime() + DAY;
  const out: { starts: Date; ends: Date }[] = [];
  for (let k = (slot.weekday - zoned(fromZoned(y, m, d)).weekday + 7) % 7; k <= (LIMITS.weeks + 1) * 7; k += 7) {
    const starts = fromZoned(y, m, d + k, h, mi);
    if (starts.getTime() >= end) break;
    if (!from || starts >= from) out.push({ starts, ends: new Date(starts.getTime() + PAIR_MIN * MIN) });
  }
  return out;
}

/** Next Monday until the end of the semester (fall: 20 December, spring: 25 May), at most 20 weeks. */
export function defaultPeriod(now: Date): { starts_on: string; ends_on: string } {
  const monday = addDays(startOfWeek(now), 7);
  const { year, month } = zoned(now);
  let end = month >= 7 ? fromZoned(year, 12, 20) : fromZoned(year, 5, 25);
  if (end.getTime() - monday.getTime() < 28 * DAY) end = addDays(monday, 15 * 7 - 2);
  const last = addDays(monday, LIMITS.weeks * 7 - 1);
  return { starts_on: dateKey(monday), ends_on: dateKey(end < last ? end : last) };
}

/** A class already in the timetable, as the advisor's check needs it. */
export interface Booked {
  starts_at: Date | string;
  ends_at: Date | string;
  group_id: string;
  room: string;
  course: string;
  teacher: string;
}

export interface Clash {
  kind: "group" | "room";
  course: string;
  teacher: string;
  room: string;
  /** How many weeks overlap. */
  weeks: number;
}

/**
 * What approving would create, slot by slot, and where it overlaps the timetable: the same group already has a
 * class then, or the room is taken. Classes that start before `now` are not created and not checked.
 */
export function review(app: Pick<Application, "subjects" | "starts_on" | "ends_on">, booked: Booked[], now: Date) {
  const times = booked.map((b) => ({ ...b, s: new Date(b.starts_at).getTime(), e: new Date(b.ends_at).getTime(), key: roomKey(b.room) }));
  let classes = 0;
  let clashes = 0;
  const subjects = app.subjects.map((subject) => ({
    ...subject,
    slots: subject.slots.map((slot) => {
      const dates = occurrences(slot, app.starts_on, app.ends_on, now);
      const found = new Map<string, Clash>();
      const key = roomKey(slot.room);
      for (const o of dates) {
        const s = o.starts.getTime();
        const e = o.ends.getTime();
        for (const b of times) {
          if (b.s >= e || b.e <= s) continue;
          const kind = b.group_id === slot.group_id ? "group" : key && b.key === key ? "room" : null;
          if (!kind) continue;
          const id = `${kind}|${b.course}|${b.teacher}|${b.room}`;
          const c = found.get(id);
          if (c) c.weeks++;
          else found.set(id, { kind, course: b.course, teacher: b.teacher, room: b.room, weeks: 1 });
        }
      }
      classes += dates.length;
      clashes += found.size;
      return { ...slot, classes: dates.length, clashes: [...found.values()] };
    }),
  }));
  return { subjects, classes, clashes };
}
