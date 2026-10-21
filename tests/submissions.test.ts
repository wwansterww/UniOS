import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed, seedSubmissions, MAIN_STUDENT, MAIN_TEACHER } from "../lib/db/seed";
import { reminderTelegram } from "../lib/reminders/dispatch";
import { acceptAttr, acceptsFile, extOf, lateBy, servedAs, uploadState } from "../lib/submissions";
import { HOUR, MIN, fromZoned } from "../lib/time";

const NOW = fromZoned(2026, 10, 18, 10, 0); // Sunday 10:00 Almaty
let db: Db;
let student: string, teacher: string, otherTeacher: string, homework: string;

async function asUser<T>(userId: string, fn: (q: Db["q"]) => Promise<T>) {
  return db.tx(async (q) => {
    await q(`select set_config('app.user_id', $1, true)`, [userId]);
    await q(`set local role uni_app`);
    return fn(q);
  });
}

beforeAll(async () => {
  db = await createDb(undefined, null);
  await db.tx((q) => seed(q, NOW, () => "test-password"));
  const one = async (sql: string, p: unknown[] = []) => (await db.q<{ id: string }>(sql, p))[0].id;
  student = await one(`select id from profiles where email = $1`, [MAIN_STUDENT]);
  teacher = await one(`select id from profiles where email = $1`, [MAIN_TEACHER]);
  otherTeacher = await one(`select id from profiles where email = 'b.omarov@narxoz.kz'`);
  homework = await one(`select id from deadlines where title = 'Домашнее задание: схема умного дома'`);
});

describe("file rules", () => {
  it("accepts files by extension, whatever their case or MIME type", () => {
    expect(acceptsFile(["pdf", "ppt"], "Отчёт.PDF")).toBe(true);
    expect(acceptsFile(["pdf", "ppt"], "slides.pptx")).toBe(true);
    expect(acceptsFile(["ipynb"], "lab3.ipynb")).toBe(true);
    expect(acceptsFile(["pdf"], "lab3.ipynb")).toBe(false);
    expect(acceptsFile(["pdf"], "report.pdf.exe")).toBe(false);
    expect(acceptsFile(["pdf"], "no-extension")).toBe(false);
    expect(extOf("archive.tar.7Z")).toBe("7z");
    expect(acceptAttr(["pdf", "ppt", "ipynb"])).toBe(".pdf,.ppt,.pptx,.ipynb");
  });

  it("closes uploads at the due time unless the teacher accepts late work", () => {
    const due = new Date(NOW.getTime() + HOUR);
    expect(uploadState({ due_at: due, file_types: null, allow_late: true }, NOW)).toBe("none");
    expect(uploadState({ due_at: due, file_types: ["pdf"], allow_late: false }, NOW)).toBe("open");
    expect(uploadState({ due_at: due, file_types: ["pdf"], allow_late: false }, new Date(due.getTime() + 1000))).toBe("closed");
    expect(uploadState({ due_at: due, file_types: ["pdf"], allow_late: true }, new Date(due.getTime() + 1000))).toBe("late");
  });

  it("measures lateness from the due time, at least a minute", () => {
    expect(lateBy(NOW, new Date(NOW.getTime() - MIN))).toBe(0);
    expect(lateBy(NOW, new Date(NOW.getTime() + 5000))).toBe(MIN);
    expect(lateBy(NOW, new Date(NOW.getTime() + 3 * HOUR))).toBe(3 * HOUR);
  });

  it("serves PDFs and photos in place, everything else as a download", () => {
    expect(servedAs("a.pdf")).toEqual({ type: "application/pdf", inline: true });
    expect(servedAs("a.ipynb")).toMatchObject({ inline: false });
    expect(servedAs("a.html")).toEqual({ type: "application/octet-stream", inline: false });
  });

  it("offers no Telegram 'done' button for work handed in as files", () => {
    const r = { id: "r", deadline_id: "d", kind: "reminder", title: "Лаба", course_title: "IoT", due_at: new Date(NOW.getTime() + HOUR) };
    const flat = (files: boolean) => reminderTelegram({ ...r, files }, "ru", NOW).buttons.flat().map((b) => b.callback_data);
    expect(flat(false)).toContain("done:d");
    expect(flat(true)).not.toContain("done:d");
  });
});

describe("demo submissions", () => {
  it("turns ticks into files on deadlines that take files", async () => {
    const orphans = await db.q(
      `select 1 from deadline_status ds join deadlines d on d.id = ds.deadline_id
        where d.file_types is not null
          and not exists (select 1 from submission_files sf where sf.deadline_id = ds.deadline_id and sf.student_id = ds.student_id)`,
    );
    expect(orphans).toHaveLength(0);
    const [lab] = await db.q<{ file_types: string[]; allow_late: boolean }>(
      `select file_types, allow_late from deadlines where title = 'Лабораторная №3: датчики и MQTT'`,
    );
    expect(lab).toEqual({ file_types: ["pdf", "ipynb", "zip"], allow_late: false });
  });

  it("has a past homework with work on time, late, and missing (the main student's)", async () => {
    const rows = await db.q<{ student_id: string; late: boolean }>(
      `select sf.student_id, sf.uploaded_at > d.due_at as late from submission_files sf join deadlines d on d.id = sf.deadline_id where d.id = $1`,
      [homework],
    );
    expect(rows.filter((r) => !r.late)).toHaveLength(2);
    expect(rows.filter((r) => r.late)).toHaveLength(2);
    expect(rows.some((r) => r.student_id === student)).toBe(false);
  });

  it("runs only once", async () => {
    await db.tx((q) => seedSubmissions(q, NOW));
    expect(await db.q(`select 1 from deadlines where title = 'Домашнее задание: схема умного дома'`)).toHaveLength(1);
  });
});

describe("who sees handed-in files (RLS)", () => {
  it("a student sees only their own files, the course's teacher sees all, another teacher none", async () => {
    const [{ n: all }] = await db.q<{ n: number }>(`select count(*)::int as n from submission_files where deadline_id = $1`, [homework]);
    const [classmate] = await db.q<{ student_id: string }>(`select student_id from submission_files where deadline_id = $1 limit 1`, [homework]);
    const own = await asUser(classmate.student_id, (q) => q<{ student_id: string }>(`select student_id from submission_files`));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((r) => r.student_id === classmate.student_id)).toBe(true);
    expect(await asUser(student, (q) => q(`select 1 from submission_files where deadline_id = $1`, [homework]))).toHaveLength(0);
    expect(await asUser(teacher, (q) => q(`select 1 from submission_files where deadline_id = $1`, [homework]))).toHaveLength(all);
    expect(await asUser(otherTeacher, (q) => q(`select 1 from submission_files`))).toHaveLength(0);
    await expect(asUser(teacher, (q) => q(`delete from submission_files`))).rejects.toThrow(/permission denied/);
  });
});
