import bcrypt from "bcryptjs";
import type { Db, Q } from "./core";
import { recomputeForDeadline } from "../reminders/engine";
import { DAY, HOUR, MIN, addDays, fromZoned, startOfWeek, zoned } from "../time";
import { currentTerm, termParts, type Category } from "../journal";
import { ADVISOR, MAIN_STUDENT, STUDENTS, TEACHERS, accountPasswords } from "./accounts";

export { MAIN_STUDENT, MAIN_TEACHER } from "./accounts";

/** Fills an empty database with the university's accounts and a believable semester, relative to `now`. */
export async function seedIfEmpty(db: Db, now = new Date()) {
  const [{ n }] = await db.q<{ n: number }>(`select count(*)::int as n from profiles`);
  if (n > 0) {
    // Databases created before the gradebook (or file submissions) existed get them once.
    await db.tx((q) => seedJournal(q, now));
    await db.tx((q) => seedSubmissions(q, now));
    return false;
  }
  await db.tx((q) => seed(q, now));
  return true;
}

/** `password(email)` defaults to the per-account passwords in accounts.local.json (tests pass their own). */
export async function seed(q: Q, now = new Date(), password: (email: string) => string = (e) => accountPasswords()[e]) {
  const ins = async (sql: string, params: unknown[]) => (await q<{ id: string }>(sql + " returning id", params))[0].id;
  const profile = (a: { email: string; name: string; role: string }) =>
    ins(`insert into profiles (email, full_name, role, password_hash) values ($1, $2, $3, $4)`, [a.email, a.name, a.role, bcrypt.hashSync(password(a.email), 8)]);

  // People: 5 teachers, 1 advisor, 10 students — and nobody else.
  const teachers: string[] = [];
  for (const a of TEACHERS) teachers.push(await profile(a));
  const [teacher, teacher2, teacher3, teacher4, teacher5] = teachers;
  const advisor = await profile(ADVISOR);
  const studentsIS: string[] = [];
  const studentsFIN: string[] = [];
  for (const a of STUDENTS) (a.group === "IS" ? studentsIS : studentsFIN).push(await profile(a));
  const student = studentsIS[0];

  // Groups
  const gIS = await ins(`insert into groups (name, invite_code, created_by) values ('ИС-23-1', 'IS231', $1)`, [teacher]);
  const gFIN = await ins(`insert into groups (name, invite_code, created_by) values ('ФИН-23-2', 'FIN232', $1)`, [teacher2]);
  for (const s of studentsIS) await q(`insert into group_members (group_id, student_id) values ($1, $2)`, [gIS, s]);
  for (const s of studentsFIN) await q(`insert into group_members (group_id, student_id) values ($1, $2)`, [gFIN, s]);
  for (const g of [gIS, gFIN]) await q(`insert into group_advisors (group_id, advisor_id) values ($1, $2)`, [g, advisor]);

  // Courses: the main student's real Narxoz timetable (fall 2026)
  const term = currentTerm(now);
  const course = (teacherId: string, title: string, code: string, color: string, credits: number, courseTerm = term) =>
    ins(`insert into courses (teacher_id, title, code, color, credits, term) values ($1, $2, $3, $4, $5, $6)`, [teacherId, title, code, color, credits, courseTerm]);
  const iot = await course(teacher, "Интернет вещей", "CSE 341", "#4F7CF7", 6);
  const games = await course(teacher, "Основы разработки игр", "CSE 352", "#8B5CF6", 5);
  const ent = await course(teacher5, "Технологическое предпринимательство", "MGT 410", "#F2994A", 5);
  const mkt = await course(teacher2, "Маркетинговая стратегия", "MKT 305", "#E0699B", 5);
  const tour = await course(teacher4, "Minor: География международного туризма", "TOU 220", "#22A699", 3);
  const link = (c: string, g: string) => q(`insert into course_groups (course_id, group_id) values ($1, $2)`, [c, g]);
  for (const c of [iot, games, ent, mkt, tour]) await link(c, gIS);
  for (const c of [ent, mkt, tour]) await link(c, gFIN);

  // Two finished semesters of ИС-23-1, for the GPA history.
  const { year, fall } = termParts(term);
  const prev = fall ? `${year}-1` : `${year - 1}-2`;
  const prevPrev = fall ? `${year - 1}-2` : `${year - 1}-1`;
  const past: [string, string, string, number, string, string][] = [
    ["Базы данных", "CSE 230", "#0EA5E9", 5, prev, teacher3],
    ["Веб-разработка", "CSE 240", "#14B8A6", 5, prev, teacher3],
    ["Теория вероятностей и статистика", "MAT 210", "#A855F7", 5, prev, teacher4],
    ["Английский язык (B2)", "ENG 202", "#F59E0B", 4, prev, teacher5],
    ["Алгоритмы и структуры данных", "CSE 220", "#3B82F6", 6, prevPrev, teacher3],
    ["Операционные системы", "CSE 260", "#64748B", 5, prevPrev, teacher3],
    ["Философия", "PHI 101", "#EC4899", 3, prevPrev, teacher4],
    ["Казахский язык", "KAZ 201", "#22C55E", 3, prevPrev, teacher5],
  ];
  for (const [title, code, color, credits, t, by] of past) await link(await course(by, title, code, color, credits, t), gIS);

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
  // A whole 15-week semester around today: 7 weeks behind, this week, 7 ahead (2 classes a week → 30).
  const PAIR = 75 * MIN;
  const weekStart = startOfWeek(now);
  const ws = zoned(weekStart);
  const planned: { course_id: string; group_id: string; starts_at: string; ends_at: string; room: string }[] = [];
  for (const [group, list] of Object.entries(slots)) {
    for (let week = -7; week <= 7; week++) {
      for (const [wd, time, c, room] of list) {
        const [h, m] = time.split(":").map(Number);
        const starts = fromZoned(ws.year, ws.month, ws.day + week * 7 + wd, h, m);
        planned.push({ course_id: c, group_id: group, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + PAIR).toISOString(), room });
      }
    }
  }
  const sessions = (
    await q<{ id: string; starts_at: Date; group_id: string; course_id: string; room: string }>(
      `insert into class_sessions (course_id, group_id, starts_at, ends_at, room)
       select course_id, group_id, starts_at, ends_at, room
         from jsonb_to_recordset($1::jsonb) as x(course_id uuid, group_id uuid, starts_at timestamptz, ends_at timestamptz, room text)
       returning id, starts_at, group_id, course_id, room`,
      [JSON.stringify(planned)],
    )
  ).map((r) => ({ id: r.id, starts: new Date(r.starts_at), group: r.group_id, course: r.course_id, room: r.room }));

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
    [ent, teacher5, [gIS, gFIN], "Бизнес-модель стартапа (Lean Canvas)", atDay(3, 18, 0), "Один лист Lean Canvas + 3 гипотезы для проверки.", null],
    [tour, teacher4, [gIS, gFIN], "Презентация: туристический потенциал Казахстана", atDay(5, 10, 0), "10 минут, регион на выбор.", null],
    [iot, teacher, [gIS], "Midterm: Интернет вещей", atDay(7, 12, 30), "Протоколы, сенсоры, архитектура IoT-систем.", null],
    [ent, teacher5, [gIS, gFIN], "Питч стартапа: финальная версия", atDay(10, 23, 59), "Видео-питч до 3 минут + дек.", null],
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
  // Personal task of the main student
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
    if (i % 3 === 0) await q(`insert into deadline_status (student_id, deadline_id, done_at) values ($1, $2, $3)`, [s, ids[0], at(-2 * HOUR).toISOString()]);
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
  const a3 = await ann(ent, teacher5, "Консультация по бизнес-модели", "В пятницу после пары, ауд. 315. Приходите с черновиком Lean Canvas.", false, false, 50 * HOUR);
  for (const [i, s] of studentsIS.slice(1).entries()) {
    if (i < 4) await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a1, s]);
    if (i < 3) await q(`insert into announcement_reads (announcement_id, student_id) values ($1, $2)`, [a2, s]);
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

  await seedJournal(q, now);
  await seedSubmissions(q, now);

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

/**
 * Demo file submissions: some deadlines take files, and a past homework shows work handed in on time and late
 * (it accepts late work). Runs once, for the demo dataset only — also on databases made before submissions existed.
 */
export async function seedSubmissions(q: Q, now = new Date()) {
  const [demo] = await q<{ id: string }>(`select id from profiles where email = $1`, [MAIN_STUDENT]);
  if (!demo) return;
  const [{ n }] = await q<{ n: number }>(
    `select ((select count(*) from submission_files) + (select count(*) from deadlines where file_types is not null))::int as n`,
  );
  if (n > 0) return;

  // [title, formats, accept late work]
  const rules: [string, string[], boolean][] = [
    ["Лабораторная №3: датчики и MQTT", ["pdf", "ipynb", "zip"], false],
    ["Кейс: маркетинговая стратегия для Kaspi", ["ppt", "pdf"], true],
    ["Бизнес-модель стартапа (Lean Canvas)", ["pdf", "image"], false],
    ["Презентация: туристический потенциал Казахстана", ["ppt", "pdf"], false],
  ];
  for (const [title, types, late] of rules)
    await q(`update deadlines set file_types = string_to_array($2::text, ','), allow_late = $3 where title = $1 and course_id is not null`, [
      title,
      types.join(","),
      late,
    ]);
  // On those deadlines "done" means a file: classmates who ticked one off get a file, other ticks are dropped.
  const ticked = await q<{ deadline_id: string; student_id: string; email: string; done_at: Date; member: boolean }>(
    `select ds.deadline_id, ds.student_id, p.email, ds.done_at,
            exists (select 1 from deadline_groups dg join group_members gm on gm.group_id = dg.group_id
                     where dg.deadline_id = ds.deadline_id and gm.student_id = ds.student_id) as member
       from deadline_status ds join deadlines d on d.id = ds.deadline_id join profiles p on p.id = ds.student_id
      where d.file_types is not null`,
  );
  for (const r of ticked) {
    if (r.member) await addDemoFile(q, r.deadline_id, r.student_id, `${r.email.split("@")[0]}_report.pdf`, new Date(r.done_at));
    else await q(`delete from deadline_status where deadline_id = $1 and student_id = $2`, [r.deadline_id, r.student_id]);
  }

  // A homework three days ago that still takes late work: on time, late by hours, a day late, not handed in.
  const [course] = await q<{ id: string; teacher_id: string }>(`select id, teacher_id from courses where code = 'CSE 341' order by term desc limit 1`);
  const [group] = await q<{ id: string }>(`select id from groups where name = 'ИС-23-1'`);
  if (!course || !group) return;
  const p = zoned(addDays(now, -3));
  const due = fromZoned(p.year, p.month, p.day, 23, 59);
  const [hw] = await q<{ id: string }>(
    `insert into deadlines (course_id, title, due_at, description, created_by, created_at, file_types, allow_late)
     values ($1, $2, $3, $4, $5, $6, '{pdf,image}', true) returning id`,
    [
      course.id,
      "Домашнее задание: схема умного дома",
      due.toISOString(),
      "Схема устройств и связей между ними — PDF или фото от руки. Принимается и после срока, с пометкой об опоздании.",
      course.teacher_id,
      new Date(due.getTime() - 7 * DAY).toISOString(),
    ],
  );
  await q(`insert into deadline_groups (deadline_id, group_id) values ($1, $2)`, [hw.id, group.id]);
  const classmates = await q<{ id: string; email: string }>(
    `select p.id, p.email from group_members gm join profiles p on p.id = gm.student_id where gm.group_id = $1 and p.id <> $2 order by p.email`,
    [group.id, demo.id],
  );
  // Minutes from the due time; null = not handed in. The main student hasn't handed it in either (late upload is open).
  const offsets = [-26 * 60, -5 * 60, 3 * 60 + 20, 26 * 60 + 10, null];
  for (const [i, s] of classmates.entries()) {
    const off = offsets[i % offsets.length];
    if (off === null) continue;
    const at = new Date(due.getTime() + off * MIN);
    await addDemoFile(q, hw.id, s.id, `${s.email.split("@")[0]}_smart-home.pdf`, at);
    await q(`insert into deadline_status (student_id, deadline_id, done_at) values ($1, $2, $3) on conflict do nothing`, [s.id, hw.id, at.toISOString()]);
  }
  for (const d of new Set(ticked.map((r) => r.deadline_id))) await recomputeForDeadline(q, d, { now });
}

async function addDemoFile(q: Q, deadlineId: string, studentId: string, name: string, at: Date) {
  const data = demoPdf(`UniOS demo - ${name}`);
  await q(`insert into submission_files (deadline_id, student_id, name, size, data, uploaded_at) values ($1, $2, $3, $4, $5, $6)`, [
    deadlineId,
    studentId,
    name,
    data.length,
    data,
    at.toISOString(),
  ]);
}

/** A one-page PDF with a line of (ASCII) text, so demo files open like real ones. */
function demoPdf(text: string) {
  const content = `BT /F1 16 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const at: number[] = [];
  objects.forEach((o, i) => {
    at.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Deterministic pseudo-random number in [0, 1) for a key (FNV-1a hash). */
function rnd(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// Graded works per course code: [title, max points, category, graded yet?]. RK1 is over, RK2 is going on, the exam is ahead.
const WORKS: Record<string, [string, number, Category, boolean][]> = {
  "CSE 341": [
    ["Лабораторная №1: Arduino", 10, "rk1", true], ["Лабораторная №2: Wi-Fi и ESP32", 10, "rk1", true], ["Квиз: протоколы IoT", 20, "rk1", true],
    ["Midterm (РК1)", 60, "rk1", true], ["Лабораторная №3: датчики и MQTT", 10, "rk2", false], ["Экзамен", 100, "exam", false],
  ],
  "CSE 352": [
    ["Практика 1: сцена и камера", 20, "rk1", true], ["Практика 2: физика и коллизии", 20, "rk1", true], ["Рубежный контроль 1", 60, "rk1", true],
    ["Дизайн-документ игры", 30, "rk2", false], ["Экзамен", 100, "exam", false],
  ],
  "MGT 410": [["Эссе: идея стартапа", 20, "rk1", true], ["Анализ рынка", 30, "rk1", true], ["Рубежный контроль 1", 50, "rk1", true], ["Экзамен", 100, "exam", false]],
  "MKT 305": [["Тест: основы маркетинга", 20, "rk1", true], ["Кейс: Starbucks в Казахстане", 30, "rk1", true], ["Рубежный контроль 1", 50, "rk1", true], ["Экзамен", 100, "exam", false]],
  "TOU 220": [["Доклад: туризм в Центральной Азии", 25, "rk1", true], ["Рубежный контроль 1", 75, "rk1", true], ["Экзамен", 100, "exam", false]],
};
// Finished courses: both midterms and the exam are graded.
const PAST_WORKS: [string, number, Category, boolean][] = [["Рубежный контроль 1", 100, "rk1", true], ["Рубежный контроль 2", 100, "rk2", true], ["Экзамен", 100, "exam", true]];

// Teacher comments the main student sees under a grade: [course code, work title, comment].
const COMMENTS: [string, string, string][] = [
  ["CSE 341", "Квиз: протоколы IoT", "Хорошо! Но CoAP разобран поверхностно — перечитай лекцию 5."],
  ["MKT 305", "Кейс: Starbucks в Казахстане", "Сильный SWOT, но сегментация слабая: добавь портрет клиента."],
];

// Fixed absences ("НБ") per student and course, so the 25% limit has something to show. Everyone else: random.
const ABSENCES: Record<string, { absent: Record<string, number>; late?: Record<string, number> }> = {
  [MAIN_STUDENT]: { absent: { "MKT 305": 6, "CSE 341": 2, "CSE 352": 1 }, late: { "CSE 341": 1 } }, // 1 absence left in marketing
  "e.kasymov@narxoz.kz": { absent: { "CSE 341": 8 } }, // Ерлан Касымов: over the limit
  "t.bekzhanov@narxoz.kz": { absent: { "CSE 352": 6 } }, // Тимур Бекжанов: 1 absence left
};

/** Inserts rows in one statement: cols are "name type" pairs of the table. */
async function insertMany(q: Q, table: string, cols: string[], rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 2000) {
    const names = cols.map((c) => c.split(" ")[0]).join(", ");
    await q(`insert into ${table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${cols.join(", ")})`, [
      JSON.stringify(rows.slice(i, i + 2000)),
    ]);
  }
}

/**
 * Demo gradebook and attendance: works with points for every student, and marks for every class
 * that already ended. Runs only for the demo dataset and only while both tables are empty.
 */
export async function seedJournal(q: Q, now = new Date()) {
  const [demo] = await q<{ id: string }>(`select id from profiles where email = $1`, [MAIN_STUDENT]);
  if (!demo) return;
  const [{ n }] = await q<{ n: number }>(`select ((select count(*) from assessments) + (select count(*) from attendance))::int as n`);
  if (n > 0) return;

  const courses = await q<{ id: string; code: string; teacher_id: string; term: string }>(`select id, code, teacher_id, term from courses`);
  const students = await q<{ course_id: string; student_id: string }>(
    `select distinct cg.course_id, gm.student_id from course_groups cg join group_members gm on gm.group_id = cg.group_id`,
  );
  // Each student has an overall level; the main student is a solid "B+" student.
  const level = (s: string) => (s === demo.id ? 0.86 : 0.6 + 0.38 * rnd("lvl" + s));
  const grades: Record<string, unknown>[] = [];
  for (const c of courses) {
    const works = WORKS[c.code] ?? (c.term < currentTerm(now) ? PAST_WORKS : []);
    for (const [i, [title, max, category, graded]] of works.entries()) {
      const [a] = await q<{ id: string }>(
        `insert into assessments (course_id, title, max_points, category, created_at) values ($1, $2, $3, $4, $5) returning id`,
        [c.id, title, max, category, new Date(now.getTime() - (works.length - i) * 5 * DAY).toISOString()],
      );
      if (!graded) continue;
      for (const s of students.filter((x) => x.course_id === c.id)) {
        const share = Math.min(1, Math.max(0.35, level(s.student_id) + (rnd(a.id + s.student_id) - 0.5) * 0.24));
        grades.push({ assessment_id: a.id, student_id: s.student_id, points: Math.round(share * max * 2) / 2, graded_by: c.teacher_id });
      }
    }
  }
  await insertMany(q, "grades", ["assessment_id uuid", "student_id uuid", "points numeric", "graded_by uuid"], grades);
  for (const [code, title, comment] of COMMENTS)
    await q(
      `update grades g set comment = $3 from assessments a join courses c on c.id = a.course_id
        where g.assessment_id = a.id and c.code = $1 and a.title = $2 and g.student_id = $4`,
      [code, title, comment, demo.id],
    );

  // Attendance for classes that already ended; the class in progress is left for the teacher to mark.
  const past = await q<{ id: string; group_id: string; course_id: string; teacher_id: string }>(
    `select cs.id, cs.group_id, cs.course_id, c.teacher_id from class_sessions cs join courses c on c.id = cs.course_id
      where cs.ends_at < $1 and cs.status <> 'cancelled' order by cs.starts_at`,
    [now.toISOString()],
  );
  const members = await q<{ group_id: string; student_id: string; email: string }>(
    `select gm.group_id, gm.student_id, p.email from group_members gm join profiles p on p.id = gm.student_id`,
  );
  const code = new Map(courses.map((c) => [c.id, c.code]));
  // Fixed marks: spread the planned absences (and late arrivals) over the student's past classes of that course.
  const fixed = new Map<string, string>();
  for (const m of members) {
    const plan = ABSENCES[m.email];
    if (!plan) continue;
    for (const [status, perCourse] of [["absent", plan.absent], ["late", plan.late ?? {}]] as const) {
      for (const [courseCode, count] of Object.entries(perCourse)) {
        const list = past.filter((cs) => cs.group_id === m.group_id && code.get(cs.course_id) === courseCode && !fixed.has(cs.id + m.student_id));
        for (let i = 0; i < Math.min(count, list.length); i++) fixed.set(list[Math.floor(((i + 0.5) * list.length) / count)].id + m.student_id, status);
      }
    }
  }
  const marks: Record<string, unknown>[] = [];
  for (const cs of past) {
    for (const m of members.filter((x) => x.group_id === cs.group_id)) {
      const r = rnd(cs.id + m.student_id);
      const random = r < 0.05 ? "absent" : r < 0.1 ? "late" : "present";
      const status = fixed.get(cs.id + m.student_id) ?? (m.student_id === demo.id ? "present" : random);
      marks.push({ session_id: cs.id, student_id: m.student_id, status, marked_by: cs.teacher_id });
    }
  }
  await insertMany(q, "attendance", ["session_id uuid", "student_id uuid", "status text", "marked_by uuid"], marks);

  // Medical certificates (справки): one approved (the absence became excused), two waiting for the teacher.
  const excuse = async (email: string, code: string, nth: number, reason: string, approved: boolean) => {
    const [a] = await q<{ session_id: string; student_id: string; teacher_id: string }>(
      `select a.session_id, a.student_id, c.teacher_id from attendance a
         join profiles p on p.id = a.student_id join class_sessions cs on cs.id = a.session_id join courses c on c.id = cs.course_id
        where p.email = $1 and c.code = $2 and a.status = 'absent' order by cs.starts_at offset $3 limit 1`,
      [email, code, nth],
    );
    if (!a) return;
    await q(
      `insert into excuses (session_id, student_id, reason, status, reviewed_by, reviewed_at, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [a.session_id, a.student_id, reason, approved ? "approved" : "pending", approved ? a.teacher_id : null, approved ? now.toISOString() : null, new Date(now.getTime() - (approved ? 6 : 1) * DAY).toISOString()],
    );
    if (approved) await q(`update attendance set status = 'excused' where session_id = $1 and student_id = $2`, [a.session_id, a.student_id]);
  };
  await excuse(MAIN_STUDENT, "CSE 352", 0, "ОРВИ, справка 095/у из поликлиники №5", true);
  await excuse(MAIN_STUDENT, "CSE 341", 0, "Был на олимпиаде по программированию от университета, есть письмо от деканата", false);
  await excuse("e.kasymov@narxoz.kz", "CSE 341", 1, "Семейные обстоятельства, справка из ЦОНа", false);

  // The main student sees a fresh grade on Today.
  const [quiz] = await q<{ id: string; title: string }>(
    `select a.id, a.title from assessments a join courses c on c.id = a.course_id where c.code = 'CSE 341' and a.title like 'Квиз%'`,
  );
  if (quiz)
    await q(
      `insert into notifications (user_id, kind, title, link, payload, created_at) values ($1, 'grade_new', $2, '/grades', $3::jsonb, $4)`,
      [demo.id, quiz.title, JSON.stringify({ course: "Интернет вещей", title: quiz.title, assessmentId: quiz.id }), new Date(now.getTime() - 2 * HOUR).toISOString()],
    );
}
