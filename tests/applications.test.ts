import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed } from "../lib/db/seed";
import { defaultPeriod, occurrences, pairLabel, parseApplication, problemStep, review, type Application } from "../lib/applications";
import {
  PER_EMAIL_DAY,
  PER_IP_HOUR,
  applicationForSignIn,
  applicationLimit,
  approveApplication,
  bookedAround,
  insertApplication,
  listApplications,
  pendingApplicationCount,
  rejectApplication,
} from "../lib/db/applications";
import { dictionaries } from "../lib/i18n";
import { renderNotification } from "../lib/notifications/render";
import { dateKey, fromZoned, zoned } from "../lib/time";

const NOW = fromZoned(2026, 10, 29, 10, 0); // Thursday 10:00 Almaty
const TODAY = dateKey(NOW);
const IS = "00000000-0000-4000-8000-000000000001";
const FIN = "00000000-0000-4000-8000-000000000002";
const groups = new Map([
  [IS, "ИС-23-1"],
  [FIN, "ФИН-23-2"],
]);

const draft = (over: Record<string, unknown> = {}) => ({
  full_name: "  Айгерим   Нурланова ",
  email: "A.Nurlanova@Gmail.com",
  password: "Kitap-2026x",
  locale: "kk",
  note: "Кафедра цифровой инженерии",
  starts_on: "2026-11-02",
  ends_on: "2026-12-20",
  subjects: [
    { title: "Базы данных", code: "CSE 210", credits: 6, slots: [{ group_id: IS, weekday: 1, start: "09:30", room: "305" }] },
    { title: "Сети", code: "", credits: "x", slots: [{ group_id: FIN, weekday: 3, start: "14:00", room: "Ауд. 210" }] },
  ],
  ...over,
});
const problem = (raw: unknown) => {
  const r = parseApplication(raw, { groups, today: TODAY });
  return r.ok ? null : r.problem;
};
const slot = (group_id: string, weekday: number, start: string, room: string) => ({ group_id, weekday, start, room });

describe("checking an application", () => {
  it("accepts a filled-in application and tidies it", () => {
    const r = parseApplication(draft(), { groups, today: TODAY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.full_name).toBe("Айгерим Нурланова");
    expect(r.value.email).toBe("a.nurlanova@gmail.com");
    expect(r.value.locale).toBe("kk");
    expect(r.value.subjects[1].credits).toBe(5);
    expect(r.value.subjects[0].slots[0]).toEqual({ group_id: IS, weekday: 1, start: "09:30", room: "305" });
  });

  it("refuses a bad account, on the first step", () => {
    expect(problem(draft({ full_name: "Аб" }))).toEqual({ code: "name" });
    expect(problem(draft({ email: "not-an-email" }))).toEqual({ code: "email" });
    expect(problem(draft({ password: "short1" }))).toEqual({ code: "short" });
    expect(problem(draft({ password: "onlyletters" }))).toEqual({ code: "weak" });
    expect(problem(draft({ password: "nurlanova2026" }))).toEqual({ code: "personal" });
    expect(problemStep({ code: "personal" })).toBe(0);
  });

  it("refuses an incomplete timetable, on the second step", () => {
    expect(problem(draft({ subjects: [] }))).toEqual({ code: "subjects" });
    expect(problem(draft({ subjects: [{ title: " ", slots: [slot(IS, 0, "08:00", "1")] }] }))).toEqual({ code: "title", subject: 1 });
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [] }] }))).toEqual({ code: "slots", subject: 1 });
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [slot("someone-else", 0, "08:00", "1")] }] }))).toEqual({ code: "group" });
    // Sunday, and a time that is not a Narxoz pair
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [slot(IS, 6, "08:00", "1")] }] }))).toEqual({ code: "slots", subject: 1 });
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [slot(IS, 0, "10:00", "1")] }] }))).toEqual({ code: "slots", subject: 1 });
    expect(problemStep({ code: "clash", group: "x", weekday: 0, start: "08:00" })).toBe(1);
  });

  it("refuses a group with two classes at once and a teacher in two rooms at once", () => {
    expect(
      problem(draft({ subjects: [{ title: "Сети", slots: [slot(IS, 2, "11:00", "1")] }, { title: "ОС", slots: [slot(IS, 2, "11:00", "2")] }] })),
    ).toEqual({ code: "clash", group: "ИС-23-1", weekday: 2, start: "11:00" });
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [slot(IS, 2, "11:00", "101"), slot(FIN, 2, "11:00", "102")] }] }))).toEqual({
      code: "twoRooms",
      weekday: 2,
      start: "11:00",
    });
    // One lecture for a stream of two groups in one room is fine.
    expect(problem(draft({ subjects: [{ title: "Сети", slots: [slot(IS, 2, "11:00", "Ауд. 101"), slot(FIN, 2, "11:00", "ауд101")] }] }))).toBeNull();
  });

  it("refuses a period that is backwards, too long, past or not a date", () => {
    expect(problem(draft({ starts_on: "2026-12-01", ends_on: "2026-11-01" }))).toEqual({ code: "dates" });
    expect(problem(draft({ starts_on: "2026-11-02", ends_on: "2027-03-22" }))).toEqual({ code: "dates" });
    expect(problem(draft({ starts_on: "2026-09-01", ends_on: "2026-10-01" }))).toEqual({ code: "dates" });
    expect(problem(draft({ ends_on: "2026-02-30" }))).toEqual({ code: "dates" });
    expect(problem(draft({ starts_on: "2026-11-02", ends_on: "2027-03-21" }))).toBeNull(); // exactly 20 weeks
  });

  it("keeps the numbers people may send in check", () => {
    const many = Array.from({ length: 31 }, (_, i) => slot(i % 2 ? IS : FIN, i % 6, ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30"][Math.floor(i / 6)] ?? "17:00", "1"));
    expect(problem(draft({ subjects: [{ title: "Сети", slots: many }] }))?.code).toBe("slots");
    const r = parseApplication(draft({ note: "x".repeat(2000), subjects: Array.from({ length: 12 }, (_, i) => ({ title: `Предмет ${i}`, slots: [slot(IS, i % 6, i < 6 ? "08:00" : "09:30", "1")] })) }), { groups, today: TODAY });
    expect(r.ok && [r.value.note.length, r.value.subjects.length]).toEqual([500, 8]);
  });
});

describe("weekly classes", () => {
  it("lists every class of a weekday slot in Almaty time, last day included", () => {
    const list = occurrences({ weekday: 0, start: "12:30" }, "2026-11-02", "2026-11-16");
    expect(list.map((o) => dateKey(o.starts))).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(zoned(list[0].starts)).toMatchObject({ hour: 12, minute: 30, weekday: 0 });
    expect(list[0].ends.getTime() - list[0].starts.getTime()).toBe(75 * 60_000);
    expect(occurrences({ weekday: 3, start: "08:00" }, "2026-11-02", "2026-11-16").map((o) => dateKey(o.starts))).toEqual(["2026-11-05", "2026-11-12"]);
  });

  it("skips classes that already started", () => {
    expect(occurrences({ weekday: 3, start: "08:00" }, "2026-10-26", "2026-11-08", NOW).map((o) => dateKey(o.starts))).toEqual(["2026-11-05"]);
  });

  it("offers next Monday to the end of the semester", () => {
    expect(defaultPeriod(NOW)).toEqual({ starts_on: "2026-11-02", ends_on: "2026-12-20" });
    // Late December: no semester left, so 15 weeks from next Monday.
    expect(defaultPeriod(fromZoned(2026, 12, 23, 12, 0))).toEqual({ starts_on: "2026-12-28", ends_on: "2027-04-10" });
    expect(pairLabel("09:30")).toBe("09:30–10:45");
    expect(pairLabel("18:30")).toBe("18:30–19:45");
  });
});

describe("applications in the database", () => {
  let db: Db;
  let advisor: string, gIS: string, gFIN: string;
  const pw = "Kitap-2026x";
  const app = (over: Partial<Application> = {}): Application => ({
    full_name: "Айгерим Нурланова",
    email: "a.nurlanova@gmail.com",
    password: pw,
    locale: "ru",
    note: "",
    starts_on: "2026-11-02",
    ends_on: "2026-12-20",
    subjects: [
      // Monday 12:30 the group already has «Интернет вещей» in 503; FIN would sit in that same room.
      { title: "Базы данных", code: "CSE 210", credits: 6, slots: [slot(gIS, 0, "12:30", "305"), slot(gFIN, 0, "12:30", "503")] },
      { title: "Сети", code: "", credits: 5, slots: [slot(gFIN, 1, "08:00", "777")] },
    ],
    ...over,
  });

  beforeAll(async () => {
    db = await createDb(undefined, null);
    await db.tx((q) => seed(q, NOW, () => "Seed-pass-1234"));
    const one = async (sql: string) => (await db.q<{ id: string }>(sql))[0].id;
    advisor = await one(`select id from profiles where role = 'advisor'`);
    gIS = await one(`select id from groups where name = 'ИС-23-1'`);
    gFIN = await one(`select id from groups where name = 'ФИН-23-2'`);
  });

  it("keeps one open application per email and tells its author how it stands", async () => {
    const hash = bcrypt.hashSync(pw, 4);
    expect(await applicationLimit(db.q, "a.nurlanova@gmail.com", "1.2.3.4", NOW)).toBeNull();
    expect(await insertApplication(db.q, app(), hash, "1.2.3.4")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await insertApplication(db.q, app(), hash, "1.2.3.4")).toBeNull();
    expect(await pendingApplicationCount(db.q)).toBe(1);
    const a = await applicationForSignIn(db.q, "a.nurlanova@gmail.com");
    expect(a?.status).toBe("pending");
    expect(bcrypt.compareSync(pw, a!.password_hash)).toBe(true);
    expect(await applicationForSignIn(db.q, "nobody@gmail.com")).toBeNull();
  });

  it("shows the advisor what approving creates and where it overlaps the timetable", async () => {
    const [a] = await listApplications(db.q, "pending");
    expect(a.starts_on).toBe("2026-11-02");
    expect(a.subjects[0].title).toBe("Базы данных");
    const r = review(a, await bookedAround(db.q, a, NOW), NOW);
    const [isSlot, finSlot] = r.subjects[0].slots;
    expect(isSlot.classes).toBe(7);
    expect(isSlot.clashes).toEqual([{ kind: "group", course: "Интернет вещей", teacher: expect.any(String), room: "503", weeks: 7 }]);
    expect(finSlot.clashes).toEqual([expect.objectContaining({ kind: "room", course: "Интернет вещей", room: "503" })]);
    expect(r.subjects[1].slots[0].clashes).toEqual([]);
    expect(r.classes).toBe(7 + 7 + 7);
  });

  it("approves into a teacher with the chosen password, courses and classes", async () => {
    const [a] = await listApplications(db.q, "pending");
    const r = await db.tx((q) => approveApplication(q, a.id, advisor, NOW));
    expect(r).toMatchObject({ ok: true, courses: 2, classes: 21, email: "a.nurlanova@gmail.com" });
    if (!r.ok) return;
    const [p] = await db.q<{ role: string; password_hash: string; must_change_password: boolean }>(
      `select role, password_hash, must_change_password from profiles where id = $1`,
      [r.profileId],
    );
    expect(p.role).toBe("teacher");
    expect(p.must_change_password).toBe(false);
    expect(bcrypt.compareSync(pw, p.password_hash)).toBe(true);
    const courses = await db.q<{ id: string; title: string; code: string; groups: number }>(
      `select c.id, c.title, c.code, (select count(*)::int from course_groups cg where cg.course_id = c.id) as groups
         from courses c where c.teacher_id = $1 order by c.title`,
      [r.profileId],
    );
    expect(courses.map((c) => [c.title, c.code, c.groups])).toEqual([
      ["Базы данных", "CSE 210", 2],
      ["Сети", "СЕТ", 1],
    ]);
    // What the teacher reads through row-level security once signed in.
    const seen = await db.tx(async (q) => {
      await q(`select set_config('app.user_id', $1, true)`, [r.profileId]);
      await q(`set local role uni_app`);
      return q<{ n: number; first: Date }>(`select count(*)::int as n, min(starts_at) as first from class_sessions`);
    });
    expect(seen[0].n).toBe(21);
    expect(new Date(seen[0].first) > NOW).toBe(true);
    const [done] = await db.q<{ status: string; password_hash: string; profile_id: string }>(
      `select status, password_hash, profile_id from teacher_applications where id = $1`,
      [a.id],
    );
    expect(done).toEqual({ status: "approved", password_hash: "", profile_id: r.profileId });
    expect(await applicationForSignIn(db.q, "a.nurlanova@gmail.com")).toBeNull();
    expect(await db.tx((q) => approveApplication(q, a.id, advisor, NOW))).toEqual({ ok: false, reason: "gone" });
  });

  it("rejects with a reason only its author sees, and lets them apply again", async () => {
    const hash = bcrypt.hashSync(pw, 4);
    const id = (await insertApplication(db.q, app({ email: "b.teacher@mail.ru" }), hash, "5.6.7.8"))!;
    expect(await db.tx((q) => rejectApplication(q, id, advisor, "Поправьте время по понедельникам", NOW))).toMatchObject({ email: "b.teacher@mail.ru" });
    expect(await db.tx((q) => rejectApplication(q, id, advisor, "again", NOW))).toBeNull();
    expect(await applicationForSignIn(db.q, "b.teacher@mail.ru")).toMatchObject({ status: "rejected", review_note: "Поправьте время по понедельникам" });
    expect(await insertApplication(db.q, app({ email: "b.teacher@mail.ru" }), hash, "5.6.7.8")).not.toBeNull();
    expect((await applicationForSignIn(db.q, "b.teacher@mail.ru"))?.status).toBe("pending");
    const history = await listApplications(db.q, "history");
    expect(history.map((h) => h.status).sort()).toEqual(["approved", "rejected"]);
    expect(history[0].reviewer).toBeTruthy();
  });

  it("won't approve over an account made meanwhile", async () => {
    const id = (await insertApplication(db.q, app({ email: "c.teacher@narxoz.kz" }), "hash", ""))!;
    await db.q(`insert into profiles (email, full_name, role) values ('c.teacher@narxoz.kz', 'Кто-то', 'teacher')`);
    expect(await db.tx((q) => approveApplication(q, id, advisor, NOW))).toEqual({ ok: false, reason: "taken" });
    const [a] = await db.q<{ status: string }>(`select status from teacher_applications where id = $1`, [id]);
    expect(a.status).toBe("pending");
  });

  it("limits how often one address and one email may apply", async () => {
    for (let i = 0; i < PER_EMAIL_DAY; i++) await db.q(`insert into teacher_applications (email, full_name, password_hash, subjects, starts_on, ends_on, status) values ('spam@x.kz', 'S', '', '[]', '2026-11-02', '2026-11-03', 'rejected')`);
    expect(await applicationLimit(db.q, "spam@x.kz", "", new Date())).toBe("email");
    for (let i = 0; i < PER_IP_HOUR; i++) await db.q(`insert into teacher_applications (email, full_name, password_hash, subjects, starts_on, ends_on, status, ip) values ($1, 'S', '', '[]', '2026-11-02', '2026-11-03', 'rejected', '9.9.9.9')`, [`ip${i}@x.kz`]);
    expect(await applicationLimit(db.q, "fresh@x.kz", "9.9.9.9", new Date())).toBe("ip");
    expect(await applicationLimit(db.q, "fresh@x.kz", "8.8.8.8", new Date())).toBeNull();
  });

  it("words the notifications in every language", () => {
    for (const [l, t] of Object.entries(dictionaries)) {
      const n = renderNotification(t, l as "ru", "application_new", { teacher: "Айгерим", title: "Базы данных" });
      expect(n.title && n.body).toBeTruthy();
      expect(renderNotification(t, l as "ru", "application_approved", { courses: 2, classes: 21 }).body).toContain("21");
    }
  });
});
