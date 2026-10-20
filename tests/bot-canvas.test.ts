import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed, DEMO_STUDENT } from "../lib/db/seed";
import { handleUpdate, type BotIO } from "../lib/telegram/bot";
import { importCanvasEvents } from "../lib/canvas";
import { buildIcs, parseIcs } from "../lib/ics";
import { fromZoned, toLocalInput } from "../lib/time";
import { reminderTelegram } from "../lib/reminders/dispatch";

const NOW = fromZoned(2026, 10, 18, 10, 0);
let db: Db;
let student: string;

function fakeIO() {
  const sent: { chat: number; html: string; buttons?: unknown }[] = [];
  const edits: string[] = [];
  const answers: string[] = [];
  const io: BotIO = {
    send: async (chat, html, opts) => void sent.push({ chat, html, buttons: opts?.buttons ?? opts?.keyboard }),
    edit: async (_chat, _id, html, buttons) => void edits.push(html + JSON.stringify(buttons)),
    answer: async (_id, text) => void answers.push(text),
    clearButtons: async () => {},
  };
  return { io, sent, answers, edits };
}

beforeAll(async () => {
  db = await createDb(undefined, null);
  await db.tx((q) => seed(q, NOW));
  student = (await db.q<{ id: string }>(`select id from profiles where email = $1`, [DEMO_STUDENT]))[0].id;
});

describe("telegram bot", () => {
  it("links a chat with a one-time /start token", async () => {
    await db.q(`insert into telegram_link_tokens (token, user_id, expires_at) values ('tok1', $1, now() + interval '1 hour')`, [student]);
    const { io, sent } = fakeIO();
    await handleUpdate(db, { update_id: 1, message: { chat: { id: 777 }, text: "/start tok1" } }, io, NOW);
    expect(sent[0].html).toContain("Готово");
    const [p] = await db.q(`select telegram_chat_id::text as c from profiles where id = $1`, [student]);
    expect(p.c).toBe("777");
    // token is single-use
    await handleUpdate(db, { update_id: 2, message: { chat: { id: 888 }, text: "/start tok1" } }, io, NOW);
    expect(sent[1].html).toContain("устарела");
  });

  it("answers /grades with GPA and /nb with absences left (also from the menu buttons)", async () => {
    const { io, sent } = fakeIO();
    await handleUpdate(db, { update_id: 40, message: { chat: { id: 777 }, text: "/grades" } }, io, NOW);
    await handleUpdate(db, { update_id: 41, message: { chat: { id: 777 }, text: "Пропуски" } }, io, NOW);
    expect(sent[0].html).toContain("Оценки за семестр");
    expect(sent[0].html).toContain("GPA семестра");
    expect(sent[0].html).toContain("Интернет вещей");
    expect(sent[1].html).toContain("Пропуски (НБ)");
    expect(sent[1].html).toMatch(/Маркетинговая стратегия\n\s+НБ \d из 7/);
    expect(sent[1].html).toContain("25%");
  });

  it("answers /deadlines, /today and /week", async () => {
    const { io, sent } = fakeIO();
    await handleUpdate(db, { update_id: 3, message: { chat: { id: 777 }, text: "/deadlines" } }, io, NOW);
    await handleUpdate(db, { update_id: 4, message: { chat: { id: 777 }, text: "/today" } }, io, NOW);
    await handleUpdate(db, { update_id: 5, message: { chat: { id: 777 }, text: "/week" } }, io, NOW);
    expect(sent[0].html).toContain("Ближайшие дедлайны");
    expect(sent[0].html).toContain("датчики");
    expect(sent[1].html).toContain("Сегодня");
    expect(sent[2].html).toContain("Неделя");
  });

  it("menu buttons work like commands (old emoji labels too); /next shows the next class", async () => {
    const { io, sent } = fakeIO();
    await handleUpdate(db, { update_id: 10, message: { chat: { id: 777 }, text: "📅 Сегодня" } }, io, NOW);
    await handleUpdate(db, { update_id: 11, message: { chat: { id: 777 }, text: "⏭ Следующая пара" } }, io, NOW);
    expect(sent[0].html).toContain("Сегодня");
    expect(JSON.stringify(sent[0].buttons)).toContain('"Напоминания"'); // persistent menu keyboard
    expect(sent[0].html).not.toContain("━");
    expect(sent[1].html).toContain("Следующая пара");
    expect(sent[1].html).toMatch(/через \d/);
  });

  it("⚙️ settings toggle reminder offsets and replan reminders", async () => {
    const { io, sent, answers, edits } = fakeIO();
    await handleUpdate(db, { update_id: 12, message: { chat: { id: 777 }, text: "/settings" } }, io, NOW);
    expect(JSON.stringify(sent[0].buttons)).toContain("pref:2880");
    await handleUpdate(db, { update_id: 13, callback_query: { id: "p1", data: "pref:2880", message: { chat: { id: 777 }, message_id: 5 } } }, io, NOW);
    const [prefs] = await db.q<{ offsets_minutes: number[] }>(`select offsets_minutes from notification_prefs where user_id = $1`, [student]);
    expect(prefs.offsets_minutes).toContain(2880);
    expect(answers[0]).toBe("Сохранено");
    expect(edits[0]).toContain("✓ За 2 суток");
    const twoDay = await db.q(`select 1 from reminders where student_id = $1 and offset_minutes = 2880 and sent_at is null`, [student]);
    expect(twoDay.length).toBeGreaterThan(0);
    // and back off
    await handleUpdate(db, { update_id: 14, callback_query: { id: "p2", data: "pref:2880", message: { chat: { id: 777 }, message_id: 5 } } }, io, NOW);
    const [after] = await db.q<{ offsets_minutes: number[] }>(`select offsets_minutes from notification_prefs where user_id = $1`, [student]);
    expect(after.offsets_minutes).not.toContain(2880);
  });

  it("unlinked chats get a welcome with instructions", async () => {
    const { io, sent } = fakeIO();
    await handleUpdate(db, { update_id: 15, message: { chat: { id: 4242 }, text: "/start" } }, io, NOW);
    expect(sent[0].html).toContain("Подключить Telegram");
  });

  it("«✅ Сделано» button marks the deadline done and stops reminders", async () => {
    const [d] = await db.q<{ id: string }>(`select id from deadlines where title like 'Питч%'`);
    const before = await db.q(`select 1 from reminders where deadline_id = $1 and student_id = $2 and sent_at is null`, [d.id, student]);
    expect(before.length).toBeGreaterThan(0);
    const { io, answers } = fakeIO();
    await handleUpdate(db, { update_id: 6, callback_query: { id: "cb", data: `done:${d.id}`, message: { chat: { id: 777 }, message_id: 1 } } }, io, NOW);
    expect(answers[0]).toContain("сделано");
    const after = await db.q(`select 1 from reminders where deadline_id = $1 and student_id = $2 and sent_at is null`, [d.id, student]);
    expect(after).toHaveLength(0);
    expect(await db.q(`select 1 from deadline_status where deadline_id = $1 and student_id = $2`, [d.id, student])).toHaveLength(1);
  });

  it("«⏰ Через 1 час» schedules a snooze", async () => {
    const [d] = await db.q<{ id: string }>(`select id from deadlines where title like 'Бизнес-модель%'`);
    const { io } = fakeIO();
    await handleUpdate(db, { update_id: 7, callback_query: { id: "cb2", data: `snooze:${d.id}`, message: { chat: { id: 777 }, message_id: 2 } } }, io, NOW);
    const [r] = await db.q<{ send_at: Date }>(`select send_at from reminders where deadline_id = $1 and student_id = $2 and kind = 'snooze'`, [d.id, student]);
    expect(toLocalInput(new Date(r.send_at))).toBe("2026-10-18T11:00");
  });

  it("an unknown chat cannot press buttons on other people's deadlines", async () => {
    const [d] = await db.q<{ id: string }>(`select id from deadlines where title like 'Бизнес-модель%'`);
    const { io, answers } = fakeIO();
    await handleUpdate(db, { update_id: 8, callback_query: { id: "cb3", data: `done:${d.id}`, message: { chat: { id: 999 }, message_id: 3 } } }, io, NOW);
    expect(answers[0]).toContain("Сначала подключи");
  });

  it("reminder message has course, task, Almaty time, time left and buttons", () => {
    const m = reminderTelegram(
      { id: "r1", deadline_id: "00000000-0000-0000-0000-000000000000", kind: "reminder", title: "Лаба <3>", course_title: "Базы данных", due_at: fromZoned(2026, 10, 19, 18, 0) },
      "ru",
      fromZoned(2026, 10, 18, 18, 0),
    );
    expect(m.html).toContain("Базы данных");
    expect(m.html).toContain("Лаба &lt;3&gt;");
    expect(m.html).toContain("18:00");
    expect(m.html).toContain("1 д");
    expect(JSON.stringify(m.buttons)).toContain("done:");
    expect(JSON.stringify(m.buttons)).toContain("snooze:");
  });
});

const CANVAS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:event-assignment-101",
  "DTSTART:20261025T175900Z",
  "SUMMARY:Essay 2 [ECO 201]",
  "DESCRIPTION:Write 1500 words\\, APA style",
  "URL:https://narxoz.instructure.com/courses/1/assignments/101",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-assignment-102",
  "DTSTART;VALUE=DATE:20261030",
  "SUMMARY:Quiz 3",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("canvas import and ics export", () => {
  it("parses Canvas feeds (UTC and all-day dates)", () => {
    const ev = parseIcs(CANVAS);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ uid: "event-assignment-101", summary: "Essay 2 [ECO 201]", description: "Write 1500 words, APA style" });
    expect(ev[0].start.toISOString()).toBe("2026-10-25T17:59:00.000Z");
    expect(toLocalInput(ev[1].start)).toBe("2026-10-30T23:59");
  });

  it("imports without duplicates (by UID) and updates changed dates", async () => {
    await db.tx((q) => importCanvasEvents(q, student, CANVAS, NOW));
    await db.tx((q) => importCanvasEvents(q, student, CANVAS, NOW));
    let rows = await db.q(`select title, due_at from deadlines where owner_id = $1 and source = 'canvas' order by title`, [student]);
    expect(rows).toHaveLength(2);
    await db.tx((q) => importCanvasEvents(q, student, CANVAS.replace("20261025T175900Z", "20261026T175900Z"), NOW));
    rows = await db.q(`select due_at from deadlines where owner_id = $1 and external_uid = 'event-assignment-101'`, [student]);
    expect(new Date(rows[0].due_at).toISOString()).toBe("2026-10-26T17:59:00.000Z");
    const rem = await db.q(`select 1 from reminders r join deadlines d on d.id = r.deadline_id where d.owner_id = $1 and d.source = 'canvas'`, [student]);
    expect(rem.length).toBeGreaterThan(0);
  });

  it("builds a valid .ics feed", () => {
    const ics = buildIcs("UniOS", [{ uid: "a@unios", title: "Базы данных; лаба", start: new Date("2026-10-19T04:00:00Z"), end: new Date("2026-10-19T05:20:00Z"), location: "ауд. 412" }]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261019T040000Z");
    expect(ics).toContain(String.raw`SUMMARY:Базы данных\; лаба`);
    expect(parseIcs(ics)[0].uid).toBe("a@unios");
  });
});
