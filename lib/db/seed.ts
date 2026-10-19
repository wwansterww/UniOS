import bcrypt from "bcryptjs";
import type { Db, Q } from "./core";
import { recomputeForDeadline } from "../reminders/engine";
import { DAY, HOUR, MIN, addDays, fromZoned, startOfWeek, zoned } from "../time";

export const DEMO_PASSWORD = "demo12345";
export const DEMO_STUDENT = "student@narxoz.kz";
export const DEMO_TEACHER = "teacher@narxoz.kz";

const STUDENT_NAMES = [
  "Айдана Серікова", "Нурсултан Ахметов", "Дана Жумабекова", "Ерлан Касымов", "Алия Нурланова",
  "Тимур Бекжанов", "Мадина Оспанова", "Арман Тлеубаев", "Жанель Сапарова", "Данияр Мухамедов",
  "Камила Абдрахманова", "Ислам Ермеков", "Аружан Калиева", "Бекзат Нуртаев", "Сабина Ким",
  "Алихан Досымов", "Томирис Байжанова", "Максат Сейткали", "Дильназ Утегенова", "Руслан Петров",
  "Асель Жаксылыкова", "Ернар Смагулов", "Инкар Турсынова", "Олжас Кенжебаев",
  "Мирас Абенов", "Айгерим Толегенова", "Санжар Есенов", "Карина Ли", "Нуржан Сагинтаев",
  "Акбота Мусина", "Диас Карибаев", "Злата Иванова", "Ильяс Аманов", "Меруерт Жанибекова",
];

/** Fills an empty database with a believable week at Narxoz, relative to `now`. */
export async function seedIfEmpty(db: Db, now = new Date()) {
  const [{ n }] = await db.q<{ n: number }>(`select count(*)::int as n from profiles`);
  if (n > 0) return false;
  await db.tx((q) => seed(q, now));
  return true;
}

export async function seed(q: Q, now = new Date()) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 8);
  const ins = async (sql: string, params: unknown[]) => (await q<{ id: string }>(sql + " returning id", params))[0].id;
  const profile = (email: string, name: string, role: "student" | "teacher") =>
    ins(`insert into profiles (email, full_name, role, password_hash) values ($1, $2, $3, $4)`, [email, name, role, hash]);

  // People
  const teacher = await profile(DEMO_TEACHER, "Айгерим Сапарова", "teacher");
  const teacher2 = await profile("teacher2@narxoz.kz", "Бауыржан Омаров", "teacher");
  const student = await profile(DEMO_STUDENT, "Алибек Нурланов", "student");
  const studentsIS = [student];
  const studentsFIN: string[] = [];
  for (let i = 0; i < STUDENT_NAMES.length; i++) {
    const id = await profile(`s${i + 1}@narxoz.kz`, STUDENT_NAMES[i], "student");
    (i < 24 ? studentsIS : studentsFIN).push(id);
  }

  // Groups
  const gIS = await ins(`insert into groups (name, invite_code, created_by) values ('ИС-23-1', 'IS231', $1)`, [teacher]);
  const gFIN = await ins(`insert into groups (name, invite_code, created_by) values ('ФИН-23-2', 'FIN232', $1)`, [teacher2]);
  for (const s of studentsIS) await q(`insert into group_members (group_id, student_id) values ($1, $2)`, [gIS, s]);
  for (const s of studentsFIN) await q(`insert into group_members (group_id, student_id) values ($1, $2)`, [gFIN, s]);

  // Courses: the demo student's real Narxoz timetable (fall 2026)
  const course = (teacherId: string, title: string, code: string, color: string) =>
    ins(`insert into courses (teacher_id, title, code, color) values ($1, $2, $3, $4)`, [teacherId, title, code, color]);
  const iot = await course(teacher, "Интернет вещей", "CSE 341", "#4F7CF7");
  const games = await course(teacher, "Основы разработки игр", "CSE 352", "#8B5CF6");
  const ent = await course(teacher, "Технологическое предпринимательство", "MGT 410", "#F2994A");
  const mkt = await course(teacher2, "Маркетинговая стратегия", "MKT 305", "#E0699B");
  const tour = await course(teacher2, "Minor: География международного туризма", "TOU 220", "#22A699");
  const link = (c: string, g: string) => q(`insert into course_groups (course_id, group_id) values ($1, $2)`, [c, g]);
  for (const c of [iot, games, ent, mkt, tour]) await link(c, gIS);
  for (const c of [ent, mkt, tour]) await link(c, gFIN);

  // Weekly timetable: [weekday 0=Mon, "HH:MM", course, room]. Narxoz pairs are 75 minutes.
  const slots: Record<string, [number, string, string, string][]> = {
    [gIS]: [
      [0, "12:30", iot, "503"],
      [1, "09:30", mkt, "404"], [1, "11:00", mkt, "404"], [1, "17:00", ent, "007"],
      [2, "11:00", games, "523"], [2, "12:30", iot, "503"],
      [3, "08:00", tour, "123"], [3, "09:30", tour, "123"], [3, "17:00", games, "510"],
      [4, "11:00", ent, "315"],
    ],
    [gFIN]: [
      [0, "09:30", mkt, "404"], [1, "12:30", tour, "123"], [2, "14:00", ent, "315"],
      [3, "11:00", mkt, "404"], [4, "09:30", tour, "123"],
    ],
  };
  const PAIR = 75 * MIN;
  const weekStart = startOfWeek(now);
  const ws = zoned(weekStart);
  const sessions: { id: string; starts: Date; group: string; course: string; room: string }[] = [];
  for (const [group, list] of Object.entries(slots)) {
    for (let week = -1; week < 3; week++) {
      for (const [wd, time, c, room] of list) {
        const [h, m] = time.split(":").map(Number);
        const starts = fromZoned(ws.year, ws.month, ws.day + week * 7 + wd, h, m);
        const id = await ins(
          `insert into class_sessions (course_id, group_id, starts_at, ends_at, room) values ($1, $2, $3, $4, $5)`,
          [c, group, starts.toISOString(), new Date(starts.getTime() + PAIR).toISOString(), room],
        );
        sessions.push({ id, starts, group, course: c, room });
      }
    }
  }

  // One moved class: the next "Основы разработки игр" → next day 14:00 (a free slot), room 523 → 525
  const toMove = sessions
    .filter((s) => s.group === gIS && s.course === games && s.starts.getTime() > now.getTime() + 2 * HOUR)
    .sort((a, b) => a.starts.getTime() - b.starts.getTime())[0];
  if (toMove) {
    const p = zoned(addDays(toMove.starts, 1));
    const newStart = fromZoned(p.year, p.month, p.day, 14, 0);
    await q(
      `update class_sessions set starts_at = $2, ends_at = $3, status = 'moved', original_starts_at = $4,
              room = '525', original_room = $5 where id = $1`,
      [toMove.id, newStart.toISOString(), new Date(newStart.getTime() + PAIR).toISOString(), toMove.starts.toISOString(), toMove.room],
    );
    for (const s of studentsIS)
      await q(
        `insert into notifications (user_id, kind, title, link, payload, created_at) values ($1, 'class_moved', '', '/schedule', $2::jsonb, $3)`,
        [s, JSON.stringify({ course: "Основы разработки игр", old: toMove.starts.toISOString(), new: newStart.toISOString(), room: "525", oldRoom: toMove.room }), new Date(now.getTime() - 3 * HOUR).toISOString()],
      );
  }

  // Deadlines: [course, author, groups, title, due, description, link]
  const at = (ms: number) => new Date(Math.round((now.getTime() + ms) / MIN) * MIN);
  const atDay = (days: number, h: number, m = 0) => {
    const p = zoned(addDays(now, days));
    return fromZoned(p.year, p.month, p.day, h, m);
  };
  const deadlines: [string, string, string[], string, Date, string, string | null][] = [
    [iot, teacher, [gIS], "Лабораторная №3: датчики и MQTT", at(1 * HOUR), "Схема подключения, код для ESP32 и скриншот MQTT-брокера — в Canvas.", "https://canvas.instructure.com"],
    [mkt, teacher2, [gIS, gFIN], "Кейс: маркетинговая стратегия для Kaspi", at(20 * HOUR), "SWOT, сегментация, позиционирование. 8–10 слайдов.", null],
    [games, teacher, [gIS], "Прототип игры в Unity: первый уровень", atDay(2, 23, 59), "Билд под Windows/WebGL и ссылка на репозиторий.", "https://github.com"],
    [ent, teacher, [gIS, gFIN], "Бизнес-модель стартапа (Lean Canvas)", atDay(3, 18, 0), "Один лист Lean Canvas + 3 гипотезы для проверки.", null],
    [tour, teacher2, [gIS, gFIN], "Презентация: туристический потенциал Казахстана", atDay(5, 10, 0), "10 минут, регион на выбор.", null],
    [iot, teacher, [gIS], "Midterm: Интернет вещей", atDay(7, 12, 30), "Протоколы, сенсоры, архитектура IoT-систем.", null],
    [ent, teacher, [gIS, gFIN], "Питч стартапа: финальная версия", atDay(10, 23, 59), "Видео-питч до 3 минут + дек.", null],
    [mkt, teacher2, [gIS, gFIN], "Тест: сегментация рынка", atDay(-1, 18, 0), "Онлайн-тест в Canvas.", null],
  ];
  const ids: string[] = [];
  for (const [c, author, groups, title, due, desc, url] of deadlines) {
    const id = await ins(
      `insert into deadlines (course_id, title, due_at, description, link, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [c, title, due.toISOString(), desc, url, author, new Date(now.getTime() - 3 * DAY).toISOString()],
    );
    for (const g of groups) await q(`insert into deadline_groups (deadline_id, group_id) values ($1, $2)`, [id, g]);
    ids.push(id);
  }
  // Personal task for the demo student
  ids.push(
    await ins(`insert into deadlines (owner_id, title, due_at, description, created_by) values ($1, $2, $3, $4, $1)`, [
      student,
      "Подать заявку на стажировку в Kaspi",
      atDay(4, 20, 0).toISOString(),
      "Резюме + мотивационное письмо",
    ]),
  );
  // Some classmates already did things (for "сделали N из M" and metrics)
  const everyone = [...studentsIS.slice(1), ...studentsFIN];
  for (const [i, s] of everyone.entries()) {
    if (i % 3 === 0 && i < 24) await q(`insert into deadline_status (student_id, deadline_id, done_at) values ($1, $2, $3)`, [s, ids[0], at(-2 * HOUR).toISOString()]);
    if (i % 2 === 0) await q(`insert into deadline_status (student_id, deadline_id, done_at) values ($1, $2, $3)`, [s, ids[7], at(-30 * HOUR).toISOString()]);
  }

  // Announcements
  const ann = (c: string, author: string, title: string, body: string, important: boolean, pinned: boolean, ago: number) =>
    ins(
      `insert into announcements (course_id, author_id, title, body, is_important, is_pinned, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [c, author, title, body, important, pinned, new Date(now.getTime() - ago).toISOString()],
    );
  const a1Title = "Midterm по Интернету вещей — в аудитории 503";
  const a1 = await ann(iot, teacher, a1Title, "Midterm пройдёт на следующей неделе в 12:30. Возьмите студенческий билет. Разрешён один лист A4 с конспектом.", true, true, 5 * HOUR);
  const a2 = await ann(games, teacher, "Материалы к лекции 6 загружены", "Ассеты и шаблон проекта Unity — в Canvas, раздел «Модуль 6».", false, false, 26 * HOUR);
  const a3 = await ann(ent, teacher, "Консультация по бизнес-модели", "В пятницу после пары, ауд. 315. Приходите с черновиком Lean Canvas.", false, false, 50 * HOUR);
  for (const [i, s] of studentsIS.slice(1).entries()) {
    if (i < 18) await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a1, s]);
    if (i < 12) await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a2, s]);
    await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a3, s]);
  }
  for (const s of studentsFIN) await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a3, s]);
  await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a3, student]);
  for (const s of studentsIS)
    await q(
      `insert into notifications (user_id, kind, title, link, payload, created_at) values ($1, 'announcement', $2, '/announcements', $3::jsonb, $4)`,
      [s, a1Title, JSON.stringify({ course: "Интернет вещей", title: a1Title, important: true, announcementId: a1 }), new Date(now.getTime() - 5 * HOUR).toISOString()],
    );

  // Registration window
  await q(
    `insert into registration_windows (title, description, opens_at, closes_at, url) values ($1, $2, $3, $4, $5)`,
    [
      "Регистрация на дисциплины: весенний семестр 2027",
      "Выбор элективов и Minor. Проверь пререквизиты заранее.",
      atDay(2, 9, 0).toISOString(),
      atDay(9, 23, 59).toISOString(),
      process.env.REGISTRATION_URL || "https://narxoz.kz",
    ],
  );

  // Notification settings for everyone (defaults) + reminders for all deadlines
  await q(`insert into notification_prefs (user_id) select id from profiles on conflict do nothing`);
  for (const id of ids) await recomputeForDeadline(q, id, { now });

  // A few historic events so /metrics isn't empty on day one
  for (const [i, s] of everyone.slice(0, 20).entries()) {
    await q(`insert into events (user_id, name, props, created_at) values ($1, 'deadline_open', $2::jsonb, $3)`, [
      s,
      JSON.stringify({ ms_since_open: 6000 + ((i * 3517) % 30000), seed: true }),
      new Date(now.getTime() - (i + 1) * HOUR).toISOString(),
    ]);
  }
}
