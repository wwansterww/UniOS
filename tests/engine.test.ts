import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed, DEMO_STUDENT, DEMO_TEACHER } from "../lib/db/seed";
import { markDone, recomputeForDeadline, recomputeForStudent, snooze } from "../lib/reminders/engine";
import { dispatchReminders, dispatchNotifications } from "../lib/reminders/dispatch";
import { notify } from "../lib/notifications/notify";
import { fromZoned, toLocalInput, HOUR, MIN } from "../lib/time";

const NOW = fromZoned(2026, 10, 18, 10, 0); // Sunday 10:00 Almaty
let db: Db;
let student: string, teacher: string, otherTeacher: string, groupIS: string, courseDb: string, courseMicro: string;

async function asUser<T>(userId: string, fn: (q: Db["q"]) => Promise<T>) {
  return db.tx(async (q) => {
    await q(`select set_config('app.user_id', $1, true)`, [userId]);
    await q(`set local role uni_app`);
    return fn(q);
  });
}

async function newDeadline(due: Date, title = "Тест") {
  return db.tx(async (q) => {
    const [d] = await q<{ id: string }>(
      `insert into deadlines (course_id, title, due_at, created_by) values ($1, $2, $3, $4) returning id`,
      [courseDb, title, due.toISOString(), teacher],
    );
    await q(`insert into deadline_groups (deadline_id, group_id) values ($1, $2)`, [d.id, groupIS]);
    await recomputeForDeadline(q, d.id, { now: NOW });
    return d.id;
  });
}
const remindersOf = (deadlineId: string) =>
  db.q<{ offset_minutes: number; kind: string; send_at: Date; sent_at: Date | null }>(
    `select offset_minutes, kind, send_at, sent_at from reminders where deadline_id = $1 and student_id = $2 order by send_at`,
    [deadlineId, student],
  );

function fakeSenders() {
  const sent: { chat: string; html: string }[] = [];
  return { sent, senders: { telegram: async (chat: number | string, html: string) => void sent.push({ chat: String(chat), html }) } };
}

beforeAll(async () => {
  db = await createDb(undefined, null);
  await db.tx((q) => seed(q, NOW));
  const one = async (sql: string, p: unknown[] = []) => (await db.q<{ id: string }>(sql, p))[0].id;
  student = await one(`select id from profiles where email = $1`, [DEMO_STUDENT]);
  teacher = await one(`select id from profiles where email = $1`, [DEMO_TEACHER]);
  otherTeacher = await one(`select id from profiles where email = 'teacher2@narxoz.kz'`);
  groupIS = await one(`select id from groups where invite_code = 'IS231'`);
  courseDb = await one(`select id from courses where code = 'CSE 341'`);
  courseMicro = await one(`select id from courses where code = 'MKT 305'`);
  await db.q(`update profiles set telegram_chat_id = 111 where id = $1`, [student]);
  await db.q(`update reminders set sent_at = now() where sent_at is null`); // ignore seeded reminders
});

describe("reminders in the database", () => {
  it("acceptance: deadline tomorrow 18:00, prefs 24h + 1h → today 18:00 and tomorrow 17:00", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 19, 18, 0));
    const r = await remindersOf(id);
    expect(r.map((x) => toLocalInput(new Date(x.send_at)))).toEqual(["2026-10-18T18:00", "2026-10-19T17:00"]);
  });

  it("recompute is idempotent (unique student × deadline × offset)", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 21, 18, 0));
    await db.tx((q) => recomputeForDeadline(q, id, { now: NOW }));
    await db.tx((q) => recomputeForDeadline(q, id, { now: NOW }));
    expect(await remindersOf(id)).toHaveLength(2);
  });

  it("dispatch sends due reminders once, with SKIP LOCKED, and marks sent_at", async () => {
    const id = await newDeadline(new Date(NOW.getTime() + 30 * MIN), "Срочная");
    const { sent, senders } = fakeSenders();
    await dispatchReminders(db, senders, NOW);
    await dispatchReminders(db, senders, NOW);
    const mine = sent.filter((s) => s.chat === "111" && s.html.includes("Срочная"));
    expect(mine).toHaveLength(1);
    expect(mine[0].html).toContain("Срочно");
    expect((await remindersOf(id))[0].sent_at).not.toBeNull();
  });

  it("acceptance: «Сделано» → no more reminders", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 19, 18, 0), "Сделаю");
    await db.tx((q) => markDone(q, student, id, NOW));
    expect((await remindersOf(id)).filter((r) => !r.sent_at)).toHaveLength(0);
    // even if a reminder row sneaks back in, the dispatcher skips it
    await db.q(`insert into reminders (student_id, deadline_id, offset_minutes, send_at) values ($1, $2, 5, $3)`, [student, id, NOW.toISOString()]);
    const { sent, senders } = fakeSenders();
    await dispatchReminders(db, senders, NOW);
    expect(sent.filter((s) => s.html.includes("Сделаю"))).toHaveLength(0);
  });

  it("acceptance: deadline moved → reminders recomputed (even those already sent)", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 19, 18, 0));
    await db.q(`update reminders set sent_at = now() where deadline_id = $1 and offset_minutes = 1440`, [id]);
    await db.tx(async (q) => {
      await q(`update deadlines set due_at = $2 where id = $1`, [id, fromZoned(2026, 10, 22, 12, 0).toISOString()]);
      await recomputeForDeadline(q, id, { now: NOW, reset: true });
    });
    const r = await remindersOf(id);
    expect(r.map((x) => toLocalInput(new Date(x.send_at)))).toEqual(["2026-10-21T12:00", "2026-10-22T11:00"]);
    expect(r.every((x) => !x.sent_at)).toBe(true);
  });

  it("acceptance: reminder at 02:00 arrives at 08:00", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 20, 3, 0)); // 1h before = 02:00
    const r = await remindersOf(id);
    expect(r.map((x) => toLocalInput(new Date(x.send_at)))).toContain("2026-10-19T22:45"); // deadline before 08:00 → before quiet hours
    const id2 = await newDeadline(fromZoned(2026, 10, 20, 9, 0));
    await db.q(`update notification_prefs set offsets_minutes = '{420}' where user_id = $1`, [student]); // 7h → 02:00
    await db.tx((q) => recomputeForStudent(q, student, NOW));
    expect((await remindersOf(id2)).map((x) => toLocalInput(new Date(x.send_at)))).toEqual(["2026-10-20T08:00"]);
    await db.q(`update notification_prefs set offsets_minutes = '{1440,60}' where user_id = $1`, [student]);
    await db.tx((q) => recomputeForStudent(q, student, NOW));
  });

  it("snooze schedules one more reminder in an hour", async () => {
    const id = await newDeadline(fromZoned(2026, 10, 19, 18, 0));
    await db.tx((q) => snooze(q, student, id, NOW));
    const s = (await remindersOf(id)).find((r) => r.offset_minutes < 0)!;
    expect(new Date(s.send_at).getTime() - NOW.getTime()).toBe(HOUR);
  });

  it("failed sends are retried up to 3 times", async () => {
    const id = await newDeadline(new Date(NOW.getTime() + 20 * MIN), "Падает");
    let calls = 0;
    const senders = { telegram: async () => { calls++; throw new Error("boom"); } };
    for (let i = 0; i < 5; i++) await dispatchReminders(db, senders, NOW);
    const [r] = await db.q(`select attempts, sent_at, last_error from reminders where deadline_id = $1 and student_id = $2`, [id, student]);
    expect(r.attempts).toBe(3);
    expect(r.sent_at).toBeNull();
    expect(r.last_error).toContain("boom");
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("instant notifications go out immediately, quiet hours respected", async () => {
    const { sent, senders } = fakeSenders();
    await db.tx((q) => notify(q, [student], "deadline_moved", { course: "Базы данных", title: "Лаба", old: NOW.toISOString(), due: new Date(NOW.getTime() + 3 * 86400000).toISOString() }, { now: NOW }));
    await dispatchNotifications(db, senders, NOW);
    expect(sent.some((s) => s.html.includes("Дедлайн перенесён") && s.html.includes("<s>"))).toBe(true);
    const night = fromZoned(2026, 10, 18, 2, 0);
    await db.tx((q) => notify(q, [student], "class_cancelled", { course: "Ночная" }, { now: night }));
    const [n] = await db.q(`select send_at from notifications where user_id = $1 and payload->>'course' = 'Ночная'`, [student]);
    expect(toLocalInput(new Date(n.send_at))).toBe("2026-10-18T08:00");
  });
});

describe("row level security", () => {
  it("student sees only courses of their groups", async () => {
    const courses = await asUser(student, (q) => q<{ code: string }>(`select code from courses order by code`));
    expect(courses.map((c) => c.code)).toEqual(["CSE 341", "CSE 352", "MGT 410", "MKT 305", "TOU 220"]);
    const fin = await db.q<{ id: string }>(`select p.id from profiles p join group_members gm on gm.student_id = p.id join groups g on g.id = gm.group_id where g.invite_code = 'FIN232' limit 1`);
    const finCourses = await asUser(fin[0].id, (q) => q<{ code: string }>(`select code from courses order by code`));
    expect(finCourses.map((c) => c.code)).toEqual(["MGT 410", "MKT 305", "TOU 220"]);
    const finDeadlines = await asUser(fin[0].id, (q) => q<{ title: string }>(`select title from deadlines`));
    expect(finDeadlines.some((d) => d.title.includes("датчики"))).toBe(false);
  });

  it("student cannot see other students' personal tasks, reminders or notifications", async () => {
    const other = (await db.q<{ id: string }>(`select id from profiles where email = 's1@narxoz.kz'`))[0].id;
    const tasks = await asUser(other, (q) => q(`select * from deadlines where owner_id = $1`, [student]));
    expect(tasks).toHaveLength(0);
    expect(await asUser(other, (q) => q(`select * from reminders where student_id = $1`, [student]))).toHaveLength(0);
    expect(await asUser(other, (q) => q(`select * from notifications where user_id = $1`, [student]))).toHaveLength(0);
  });

  it("teacher sees only their own courses", async () => {
    const mine = await asUser(teacher, (q) => q<{ code: string }>(`select code from courses order by code`));
    expect(mine.map((c) => c.code)).toEqual(["CSE 341", "CSE 352", "MGT 410"]);
    const other = await asUser(otherTeacher, (q) => q<{ id: string }>(`select id from courses`));
    expect(other.map((c) => c.id)).toContain(courseMicro);
    expect(other.map((c) => c.id)).not.toContain(courseDb);
  });

  it("uni_app role cannot write", async () => {
    await expect(asUser(student, (q) => q(`update deadlines set title = 'hack'`))).rejects.toThrow(/permission denied/);
  });
});
