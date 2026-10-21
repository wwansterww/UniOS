"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db, type Q } from "@/lib/db";
import { requireUser, type User } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import { courseStudents, groupStudents, notify } from "@/lib/notifications/notify";
import { logEvent, recomputeForDeadline } from "@/lib/reminders/engine";
import { MIN, fromZoned, parseLocalInput } from "@/lib/time";
import { dispatchNow } from "@/lib/jobs";
import { absenceAllowance, isAttendanceStatus, isCategory } from "@/lib/journal";
import { isFileFormat } from "@/lib/submissions";
import type { Result } from "../actions";

const refresh = () => revalidatePath("/", "layout");
const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function teacher() {
  const user = await requireUser("teacher");
  return { user, t: dictionaries[user.locale], d: await db() };
}

/** Teachers may only touch their own courses. */
async function ownsCourse(q: Q, user: User, courseId: string) {
  const r = await q(`select 1 from courses where id = $1 and teacher_id = $2`, [courseId, user.id]);
  return r.length > 0;
}

/** Groups attached to this course (a deadline may only target those). */
async function courseGroupIds(q: Q, courseId: string) {
  return (await q<{ group_id: string }>(`select group_id from course_groups where course_id = $1`, [courseId])).map((r) => r.group_id);
}

const inviteCode = () => randomBytes(4).toString("hex").toUpperCase().slice(0, 6);

// ---------- courses & groups ----------

export async function createCourse(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const title = str(form, "title");
  if (!title) return { ok: false, message: t.common.error };
  await d.q(`insert into courses (teacher_id, title, code, color, credits) values ($1, $2, $3, $4, $5)`, [
    user.id,
    title,
    str(form, "code", 30) || title.slice(0, 3).toUpperCase(),
    /^#[0-9a-f]{6}$/i.test(str(form, "color")) ? str(form, "color") : "#8C80EF",
    credits(form.get("credits")) ?? 5,
  ]);
  refresh();
  return { ok: true, message: t.common.saved };
}

const credits = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
};

/** Credits weigh the course in students' GPA. */
export async function setCourseCredits(courseId: string, value: number): Promise<Result> {
  const { user, t, d } = await teacher();
  const n = credits(value);
  if (n == null) return { ok: false, message: t.common.error };
  const r = await d.q(`update courses set credits = $3 where id = $1 and teacher_id = $2 returning id`, [courseId, user.id, n]);
  refresh();
  return r.length ? { ok: true, message: t.common.saved } : { ok: false, message: t.teacher.notOwner };
}

export async function createGroup(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const name = str(form, "name", 60);
  const courseId = str(form, "course_id", 40);
  if (!name) return { ok: false, message: t.common.error };
  return d.tx(async (q) => {
    if (courseId && !(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    const [g] = await q<{ id: string; invite_code: string }>(
      `insert into groups (name, invite_code, created_by) values ($1, $2, $3) returning id, invite_code`,
      [name, inviteCode(), user.id],
    );
    if (courseId) await q(`insert into course_groups (course_id, group_id) values ($1, $2) on conflict do nothing`, [courseId, g.id]);
    refresh();
    return { ok: true, message: `${name}: ${g.invite_code}` };
  });
}

export async function attachGroup(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const courseId = str(form, "course_id", 40);
  const groupId = str(form, "group_id", 40);
  const code = str(form, "code", 20).toUpperCase();
  return d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    const [g] = code
      ? await q<{ id: string }>(`select id from groups where upper(invite_code) = $1`, [code])
      : await q<{ id: string }>(`select id from groups where id = $1`, [groupId]);
    if (!g) return { ok: false, message: t.profile.badInvite };
    await q(`insert into course_groups (course_id, group_id) values ($1, $2) on conflict do nothing`, [courseId, g.id]);
    refresh();
    return { ok: true, message: t.common.saved };
  });
}

export async function detachGroup(courseId: string, groupId: string): Promise<Result> {
  const { user, t, d } = await teacher();
  return d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    await q(`delete from course_groups where course_id = $1 and group_id = $2`, [courseId, groupId]);
    refresh();
    return { ok: true };
  });
}

// ---------- deadlines ----------

type FileRules = { types: string[] | null; allowLate: boolean };

/** "Сдача файлами" of a deadline form (components FileRulesFields): no formats = no files. A string is the error. */
function fileRules(form: FormData, t: (typeof dictionaries)["ru"]): FileRules | string {
  if (form.get("files") !== "on") return { types: null, allowLate: false };
  const types = [...new Set(form.getAll("file_types").map(String).filter(isFileFormat))];
  if (!types.length) return t.submit.pickFormat;
  return { types, allowLate: form.get("allow_late") === "on" };
}

/** Turning files on: earlier ticks without a file no longer count as done, so their reminders come back. */
async function saveFileRules(q: Q, id: string, rules: FileRules) {
  const [old] = await q<{ file_types: string[] | null }>(`select file_types from deadlines where id = $1`, [id]);
  await q(`update deadlines set file_types = string_to_array($2::text, ','), allow_late = $3, updated_at = now() where id = $1`, [
    id,
    rules.types?.join(",") ?? null,
    rules.allowLate,
  ]);
  if (!rules.types || old?.file_types) return;
  const cleared = await q<{ student_id: string }>(
    `delete from deadline_status ds where ds.deadline_id = $1
       and not exists (select 1 from submission_files sf where sf.deadline_id = ds.deadline_id and sf.student_id = ds.student_id)
     returning ds.student_id`,
    [id],
  );
  if (cleared.length) await recomputeForDeadline(q, id, { studentIds: cleared.map((r) => r.student_id) });
}

export async function createDeadline(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const title = str(form, "title");
  const courseId = str(form, "course_id", 40);
  const due = parseLocalInput(str(form, "due", 20));
  const wanted = form.getAll("group_ids").map(String);
  const rules = fileRules(form, t);
  if (typeof rules === "string") return { ok: false, message: rules };
  if (!title || !due) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    const allowed = await courseGroupIds(q, courseId);
    const groups = wanted.filter((g) => allowed.includes(g));
    if (groups.length === 0) return { ok: false, message: t.teacher.pickGroups };
    const [row] = await q<{ id: string }>(
      `insert into deadlines (course_id, title, due_at, description, link, created_by, file_types, allow_late)
       values ($1, $2, $3, $4, $5, $6, string_to_array($7::text, ','), $8) returning id`,
      [courseId, title, due.toISOString(), str(form, "description", 4000), str(form, "link", 500) || null, user.id, rules.types?.join(",") ?? null, rules.allowLate],
    );
    for (const g of groups) await q(`insert into deadline_groups (deadline_id, group_id) values ($1, $2)`, [row.id, g]);
    await recomputeForDeadline(q, row.id);
    const [c] = await q<{ title: string }>(`select title from courses where id = $1`, [courseId]);
    await notify(q, await groupStudents(q, groups), "deadline_new", { course: c.title, title, due: due.toISOString(), deadlineId: row.id }, { link: `/deadlines/${row.id}` });
    await logEvent(q, user.id, "deadline_published", { deadline_id: row.id, groups: groups.length });
    return { ok: true, message: t.teacher.published };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

export async function updateDeadline(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const id = str(form, "id", 40);
  const title = str(form, "title");
  const due = parseLocalInput(str(form, "due", 20));
  const rules = fileRules(form, t);
  if (typeof rules === "string") return { ok: false, message: rules };
  if (!title || !due) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    const [old] = await q<{ course_id: string; due_at: Date; course_title: string }>(
      `select d.course_id, d.due_at, c.title as course_title from deadlines d join courses c on c.id = d.course_id
        where d.id = $1 and c.teacher_id = $2 and d.deleted_at is null`,
      [id, user.id],
    );
    if (!old) return { ok: false, message: t.teacher.notOwner };
    const moved = Math.abs(new Date(old.due_at).getTime() - due.getTime()) >= MIN;
    await q(
      `update deadlines set title = $2, due_at = $3, description = $4, link = $5, updated_at = now() where id = $1`,
      [id, title, due.toISOString(), str(form, "description", 4000), str(form, "link", 500) || null],
    );
    await saveFileRules(q, id, rules);
    if (moved) {
      // New due date: forget the old schedule (including sent reminders) and plan again.
      await recomputeForDeadline(q, id, { reset: true });
      const students = (await q<{ student_id: string }>(
        `select distinct gm.student_id from deadline_groups dg join group_members gm on gm.group_id = dg.group_id where dg.deadline_id = $1`,
        [id],
      )).map((r) => r.student_id);
      await notify(q, students, "deadline_moved", { course: old.course_title, title, old: new Date(old.due_at).toISOString(), due: due.toISOString(), deadlineId: id }, { link: `/deadlines/${id}` });
      await logEvent(q, user.id, "deadline_moved", { deadline_id: id });
    }
    return { ok: true, message: moved ? t.teacher.moved : t.common.saved };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

/** Formats and late uploads, changeable at any time — also after the due time (e.g. to let late work in). */
export async function setFileRules(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const id = str(form, "id", 40);
  const rules = fileRules(form, t);
  if (typeof rules === "string") return { ok: false, message: rules };
  const res = await d.tx(async (q): Promise<Result> => {
    const [own] = await q(`select 1 from deadlines d join courses c on c.id = d.course_id where d.id = $1 and c.teacher_id = $2 and d.deleted_at is null`, [
      id,
      user.id,
    ]);
    if (!own) return { ok: false, message: t.teacher.notOwner };
    await saveFileRules(q, id, rules);
    await logEvent(q, user.id, "file_rules_changed", { deadline_id: id, files: !!rules.types, late: rules.allowLate });
    return { ok: true, message: t.submit.rulesSaved };
  });
  refresh();
  return res;
}

export async function deleteDeadline(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const [row] = await q<{ title: string; course_title: string; due_at: Date }>(
      `update deadlines d set deleted_at = now(), updated_at = now() from courses c
        where d.id = $1 and c.id = d.course_id and c.teacher_id = $2 and d.deleted_at is null
        returning d.title, c.title as course_title, d.due_at`,
      [id, user.id],
    );
    if (!row) return { ok: false, message: t.teacher.notOwner };
    await q(`delete from reminders where deadline_id = $1 and sent_at is null`, [id]);
    const students = (await q<{ student_id: string }>(
      `select distinct gm.student_id from deadline_groups dg join group_members gm on gm.group_id = dg.group_id where dg.deadline_id = $1`,
      [id],
    )).map((r) => r.student_id);
    if (new Date(row.due_at) > new Date())
      await notify(q, students, "deadline_deleted", { course: row.course_title, title: row.title }, { link: "/deadlines" });
    return { ok: true, message: t.teacher.deletedToast };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

// ---------- schedule ----------

async function insertClasses(
  q: Q,
  user: User,
  rows: { course_id: string; group_id: string; date: string; start: string; end: string; room: string }[],
  weeks = 1,
) {
  let n = 0;
  const owned = new Map<string, boolean>();
  for (const r of rows) {
    if (!owned.has(r.course_id)) owned.set(r.course_id, await ownsCourse(q, user, r.course_id));
    if (!owned.get(r.course_id)) continue;
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date);
    const sm = /^(\d{1,2}):(\d{2})$/.exec(r.start);
    const em = /^(\d{1,2}):(\d{2})$/.exec(r.end);
    if (!dm || !sm || !em) continue;
    await q(`insert into course_groups (course_id, group_id) values ($1, $2) on conflict do nothing`, [r.course_id, r.group_id]);
    const series = weeks > 1 ? randomUUID() : null;
    for (let w = 0; w < weeks; w++) {
      const starts = fromZoned(+dm[1], +dm[2], +dm[3] + w * 7, +sm[1], +sm[2]);
      let ends = fromZoned(+dm[1], +dm[2], +dm[3] + w * 7, +em[1], +em[2]);
      if (ends <= starts) ends = new Date(starts.getTime() + 75 * MIN);
      await q(
        `insert into class_sessions (course_id, group_id, series_id, starts_at, ends_at, room) values ($1, $2, $3, $4, $5, $6)`,
        [r.course_id, r.group_id, series, starts.toISOString(), ends.toISOString(), r.room.slice(0, 40)],
      );
      n++;
    }
  }
  return n;
}

export async function addClass(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const weeks = Math.min(20, Math.max(1, Number(form.get("weeks")) || 1));
  const n = await d.tx((q) =>
    insertClasses(
      q,
      user,
      [{ course_id: str(form, "course_id", 40), group_id: str(form, "group_id", 40), date: str(form, "date", 10), start: str(form, "start", 5), end: str(form, "end", 5), room: str(form, "room", 40) }],
      weeks,
    ),
  );
  refresh();
  return n ? { ok: true, message: t.teacher.classAdded(n) } : { ok: false, message: t.teacher.notOwner };
}

/** CSV: course_code,group,date,start,end,room (header optional; , or ; separated). */
export async function importScheduleCsv(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 1_000_000) return { ok: false, message: t.common.error };
  const text = await file.text();
  const n = await d.tx(async (q) => {
    const courses = await q<{ id: string; code: string; title: string }>(`select id, code, title from courses where teacher_id = $1`, [user.id]);
    const groups = await q<{ id: string; name: string; invite_code: string }>(`select id, name, invite_code from groups`);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, "")))
      .filter((c) => c.length >= 5 && !/course/i.test(c[0]))
      .map(([course, group, date, start, end, room = ""]) => ({
        course_id: courses.find((c) => norm(c.code) === norm(course) || norm(c.title) === norm(course))?.id ?? "",
        group_id: groups.find((g) => norm(g.name) === norm(group) || norm(g.invite_code) === norm(group))?.id ?? "",
        date,
        start,
        end,
        room,
      }))
      .filter((r) => r.course_id && r.group_id);
    return insertClasses(q, user, rows);
  });
  refresh();
  return { ok: n > 0, message: t.teacher.csvDone(n) };
}

async function ownedSession(q: Q, user: User, id: string) {
  const [s] = await q<{ id: string; course_id: string; group_id: string; course_title: string; starts_at: Date; ends_at: Date; room: string; status: string; original_starts_at: Date | null; original_room: string | null }>(
    `select cs.*, c.title as course_title from class_sessions cs join courses c on c.id = cs.course_id where cs.id = $1 and c.teacher_id = $2`,
    [id, user.id],
  );
  return s ?? null;
}

export async function moveClass(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const start = parseLocalInput(str(form, "starts", 20));
  const room = str(form, "room", 40);
  if (!start) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    const s = await ownedSession(q, user, str(form, "id", 40));
    if (!s) return { ok: false, message: t.teacher.notOwner };
    const len = new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime();
    const newRoom = room || s.room;
    await q(
      `update class_sessions set starts_at = $2, ends_at = $3, room = $4, status = 'moved',
              original_starts_at = coalesce(original_starts_at, starts_at),
              original_room = case when $4 <> room then coalesce(original_room, room) else original_room end,
              updated_at = now() where id = $1`,
      [s.id, start.toISOString(), new Date(start.getTime() + len).toISOString(), newRoom],
    );
    await notify(q, await groupStudents(q, [s.group_id]), "class_moved", {
      course: s.course_title,
      old: new Date(s.starts_at).toISOString(),
      new: start.toISOString(),
      room: newRoom,
      oldRoom: s.room,
    }, { link: "/schedule" });
    return { ok: true, message: t.teacher.classUpdated };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

export async function cancelClass(id: string, restore = false): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const s = await ownedSession(q, user, id);
    if (!s) return { ok: false, message: t.teacher.notOwner };
    await q(
      `update class_sessions set status = $2, updated_at = now() where id = $1`,
      [id, restore ? (s.original_starts_at ? "moved" : "scheduled") : "cancelled"],
    );
    if (!restore)
      await notify(q, await groupStudents(q, [s.group_id]), "class_cancelled", { course: s.course_title, old: new Date(s.starts_at).toISOString(), room: s.room }, { link: "/schedule" });
    return { ok: true, message: t.teacher.classUpdated };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

export async function changeRoom(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const room = str(form, "room", 40);
  if (!room) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    const s = await ownedSession(q, user, str(form, "id", 40));
    if (!s) return { ok: false, message: t.teacher.notOwner };
    if (s.room === room) return { ok: true };
    await q(`update class_sessions set room = $2, original_room = coalesce(original_room, room), updated_at = now() where id = $1`, [s.id, room]);
    await notify(q, await groupStudents(q, [s.group_id]), "room_changed", { course: s.course_title, new: new Date(s.starts_at).toISOString(), room, oldRoom: s.room }, { link: "/schedule" });
    return { ok: true, message: t.teacher.classUpdated };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

export async function deleteClass(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const n = await d.q(`delete from class_sessions cs using courses c where cs.id = $1 and c.id = cs.course_id and c.teacher_id = $2 returning cs.id`, [id, user.id]);
  refresh();
  return n.length ? { ok: true } : { ok: false, message: t.teacher.notOwner };
}

// ---------- announcements ----------

export async function createAnnouncement(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const courseId = str(form, "course_id", 40);
  const title = str(form, "title");
  const body = str(form, "body", 5000);
  const important = form.get("important") === "on";
  if (!title) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    const [a] = await q<{ id: string }>(
      `insert into announcements (course_id, author_id, title, body, is_important, is_pinned) values ($1, $2, $3, $4, $5, $6) returning id`,
      [courseId, user.id, title, body, important, form.get("pinned") === "on"],
    );
    const [c] = await q<{ title: string }>(`select title from courses where id = $1`, [courseId]);
    // Every announcement lands in the in-app feed; only important ones are pushed to Telegram/email.
    await notify(q, await courseStudents(q, courseId), "announcement", { course: c.title, title, body: body.slice(0, 300), important, announcementId: a.id }, {
      link: `/announcements#${a.id}`,
      deliver: important,
    });
    return { ok: true, message: t.teacher.published };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

export async function togglePin(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const r = await d.q(
    `update announcements a set is_pinned = not a.is_pinned from courses c where a.id = $1 and c.id = a.course_id and c.teacher_id = $2 returning a.id`,
    [id, user.id],
  );
  refresh();
  return r.length ? { ok: true } : { ok: false, message: t.teacher.notOwner };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const r = await d.q(`delete from announcements a using courses c where a.id = $1 and c.id = a.course_id and c.teacher_id = $2 returning a.id`, [id, user.id]);
  refresh();
  return r.length ? { ok: true } : { ok: false, message: t.teacher.notOwner };
}

/** "Напомнить им": nudges everyone who hasn't read the announcement yet. */
export async function remindUnread(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const [a] = await q<{ course_id: string; title: string; course_title: string }>(
      `select a.course_id, a.title, c.title as course_title from announcements a join courses c on c.id = a.course_id where a.id = $1 and c.teacher_id = $2`,
      [id, user.id],
    );
    if (!a) return { ok: false, message: t.teacher.notOwner };
    const unread = (await courseStudents(q, a.course_id)).filter(Boolean);
    const read = new Set((await q<{ student_id: string }>(`select student_id from announcement_reads where announcement_id = $1`, [id])).map((r) => r.student_id));
    const targets = unread.filter((s) => !read.has(s));
    await notify(q, targets, "read_reminder", { course: a.course_title, title: a.title, announcementId: id }, { link: `/announcements#${id}`, force: true });
    await logEvent(q, user.id, "read_reminder_sent", { announcement_id: id, count: targets.length });
    return { ok: true, message: t.teacher.reminded(targets.length) };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

// ---------- gradebook ----------

/** The work, if it belongs to one of this teacher's courses. */
async function ownedAssessment(q: Q, user: User, id: string) {
  const [a] = await q<{ id: string; course_id: string; title: string; max_points: number; course_title: string }>(
    `select a.id, a.course_id, a.title, a.max_points::float8 as max_points, c.title as course_title
       from assessments a join courses c on c.id = a.course_id where a.id = $1 and c.teacher_id = $2`,
    [id, user.id],
  );
  return a ?? null;
}

const maxPoints = (f: FormData) => {
  const n = Number(str(f, "max", 10).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
};

export async function createAssessment(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const courseId = str(form, "course_id", 40);
  const title = str(form, "title", 120);
  const max = maxPoints(form);
  const category = isCategory(form.get("category")) ? String(form.get("category")) : "rk1";
  if (!title || !max) return { ok: false, message: t.common.error };
  return d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    await q(`insert into assessments (course_id, title, max_points, category) values ($1, $2, $3, $4)`, [courseId, title, max, category]);
    refresh();
    return { ok: true, message: t.grades.workAdded };
  });
}

export async function updateAssessment(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const title = str(form, "title", 120);
  const max = maxPoints(form);
  if (!title || !max) return { ok: false, message: t.common.error };
  return d.tx(async (q) => {
    const a = await ownedAssessment(q, user, str(form, "id", 40));
    if (!a) return { ok: false, message: t.teacher.notOwner };
    const [over] = await q(`select 1 from grades where assessment_id = $1 and points > $2 limit 1`, [a.id, max]);
    if (over) return { ok: false, message: t.grades.maxBelow };
    const category = isCategory(form.get("category")) ? String(form.get("category")) : "rk1";
    await q(`update assessments set title = $2, max_points = $3, category = $4 where id = $1`, [a.id, title, max, category]);
    refresh();
    return { ok: true, message: t.common.saved };
  });
}

export async function deleteAssessment(id: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const r = await d.q(`delete from assessments a using courses c where a.id = $1 and c.id = a.course_id and c.teacher_id = $2 returning a.id`, [id, user.id]);
  refresh();
  return r.length ? { ok: true } : { ok: false, message: t.teacher.notOwner };
}

/** Sets (or clears, with null) a student's points for a work. The first grade lands in the student's notifications. */
export async function setGrade(assessmentId: string, studentId: string, points: number | null): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const a = await ownedAssessment(q, user, assessmentId);
    if (!a) return { ok: false, message: t.teacher.notOwner };
    const [member] = await q(
      `select 1 from course_groups cg join group_members gm on gm.group_id = cg.group_id where cg.course_id = $1 and gm.student_id = $2 limit 1`,
      [a.course_id, studentId],
    );
    if (!member) return { ok: false, message: t.teacher.notOwner };
    if (points == null) {
      await q(`delete from grades where assessment_id = $1 and student_id = $2`, [a.id, studentId]);
      return { ok: true };
    }
    if (!Number.isFinite(points) || points < 0 || points > a.max_points) return { ok: false, message: t.grades.outOfRange(a.max_points) };
    const [row] = await q<{ inserted: boolean }>(
      `insert into grades (assessment_id, student_id, points, graded_by) values ($1, $2, $3, $4)
       on conflict (assessment_id, student_id) do update set points = excluded.points, graded_by = excluded.graded_by, updated_at = now()
       returning (xmax = 0) as inserted`,
      [a.id, studentId, Math.round(points * 100) / 100, user.id],
    );
    if (row.inserted) {
      const [seen] = await q(`select 1 from notifications where user_id = $1 and kind = 'grade_new' and payload->>'assessmentId' = $2 limit 1`, [studentId, a.id]);
      if (!seen) await notify(q, [studentId], "grade_new", { course: a.course_title, title: a.title, assessmentId: a.id }, { link: "/grades" });
    }
    return { ok: true };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

// ---------- attendance ----------

/** Marks can be set once a class is about to start, never for a cancelled one. */
const markable = (s: { status: string; starts_at: Date }) => s.status !== "cancelled" && new Date(s.starts_at).getTime() - 30 * MIN <= Date.now();

export async function setAttendance(sessionId: string, studentId: string, status: "present" | "late" | "absent" | null): Promise<Result> {
  const { user, t, d } = await teacher();
  if (status != null && !isAttendanceStatus(status)) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    const s = await ownedSession(q, user, sessionId);
    if (!s) return { ok: false, message: t.teacher.notOwner };
    if (!markable(s)) return { ok: false, message: s.status === "cancelled" ? t.attendance.cancelled : t.attendance.notStarted };
    const [member] = await q(`select 1 from group_members where group_id = $1 and student_id = $2`, [s.group_id, studentId]);
    if (!member) return { ok: false, message: t.teacher.notOwner };
    if (status == null) await q(`delete from attendance where session_id = $1 and student_id = $2`, [s.id, studentId]);
    else
      await q(
        `insert into attendance (session_id, student_id, status, marked_by) values ($1, $2, $3, $4)
         on conflict (session_id, student_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now()`,
        [s.id, studentId, status, user.id],
      );
    // "НБ" goes straight to the student (Telegram too), once per class, with how many absences are left.
    if (status === "absent") {
      const [seen] = await q(`select 1 from notifications where user_id = $1 and kind = 'absence_marked' and payload->>'sessionId' = $2 limit 1`, [studentId, s.id]);
      if (!seen) {
        const [c] = await q<{ absent: number; planned: number }>(
          `select (select count(*)::int from attendance a join class_sessions x on x.id = a.session_id
                    where a.student_id = $1 and a.status = 'absent' and x.course_id = $2 and x.group_id = $3) as absent,
                  (select count(*)::int from class_sessions where course_id = $2 and group_id = $3 and status <> 'cancelled') as planned`,
          [studentId, s.course_id, s.group_id],
        );
        await notify(q, [studentId], "absence_marked", {
          course: s.course_title,
          old: new Date(s.starts_at).toISOString(),
          absent: c.absent,
          allowed: absenceAllowance(c.planned),
          sessionId: s.id,
        }, { link: "/attendance" });
      }
    }
    return { ok: true };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

/** Stops QR check-in for a class (it also stops by itself a minute after the QR screen is closed). */
export async function closeCheckin(sessionId: string): Promise<Result> {
  const { user, d } = await teacher();
  await d.q(`update class_sessions cs set checkin_until = null from courses c where cs.id = $1 and c.id = cs.course_id and c.teacher_id = $2`, [sessionId, user.id]);
  refresh();
  return { ok: true };
}

/** Accepting a certificate makes the absence excused (it no longer counts toward the 25% limit). */
export async function reviewExcuse(sessionId: string, studentId: string, approve: boolean): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const s = await ownedSession(q, user, sessionId);
    if (!s) return { ok: false, message: t.teacher.notOwner };
    const [e] = await q(
      `update excuses set status = $3, reviewed_by = $4, reviewed_at = now() where session_id = $1 and student_id = $2 returning 1`,
      [sessionId, studentId, approve ? "approved" : "rejected", user.id],
    );
    if (!e) return { ok: false, message: t.common.error };
    await q(
      `update attendance set status = $3 where session_id = $1 and student_id = $2 and status = $4`,
      approve ? [sessionId, studentId, "excused", "absent"] : [sessionId, studentId, "absent", "excused"],
    );
    await notify(q, [studentId], "excuse_reviewed", { course: s.course_title, old: new Date(s.starts_at).toISOString(), approved: approve }, { link: "/attendance" });
    return { ok: true, message: approve ? t.attendance.approvedToast : t.attendance.rejectedToast };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

/** "Предупредить": tells a student how close they are to the 25% absence limit (always delivered). */
export async function warnStudent(studentId: string, courseId: string, groupId: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const res = await d.tx(async (q) => {
    const [c] = await q<{ title: string; absent: number; planned: number }>(
      `select c.title,
              (select count(*)::int from attendance a join class_sessions x on x.id = a.session_id
                where a.student_id = $3 and a.status = 'absent' and x.course_id = c.id and x.group_id = $2) as absent,
              (select count(*)::int from class_sessions where course_id = c.id and group_id = $2 and status <> 'cancelled') as planned
         from courses c join course_groups cg on cg.course_id = c.id and cg.group_id = $2
         join group_members gm on gm.group_id = $2 and gm.student_id = $3
        where c.id = $1 and c.teacher_id = $4`,
      [courseId, groupId, studentId, user.id],
    );
    if (!c) return { ok: false, message: t.teacher.notOwner };
    await notify(q, [studentId], "absence_warning", { course: c.title, absent: c.absent, allowed: absenceAllowance(c.planned), teacher: user.full_name }, {
      link: "/attendance",
      force: true,
    });
    await logEvent(q, user.id, "absence_warning_sent", { student_id: studentId, course_id: courseId });
    return { ok: true, message: t.attendance.warned };
  });
  after(() => dispatchNow(d));
  refresh();
  return res;
}

/** «Все на месте»: everyone not marked yet becomes present; existing marks stay. */
export async function markRestPresent(sessionId: string): Promise<Result> {
  const { user, t, d } = await teacher();
  return d.tx(async (q) => {
    const s = await ownedSession(q, user, sessionId);
    if (!s) return { ok: false, message: t.teacher.notOwner };
    if (!markable(s)) return { ok: false, message: s.status === "cancelled" ? t.attendance.cancelled : t.attendance.notStarted };
    const rows = await q(
      `insert into attendance (session_id, student_id, status, marked_by)
       select $1, gm.student_id, 'present', $3 from group_members gm where gm.group_id = $2
       on conflict (session_id, student_id) do nothing
       returning student_id`,
      [s.id, s.group_id, user.id],
    );
    refresh();
    return { ok: true, message: t.attendance.markedPresent(rows.length) };
  });
}

/** Teacher's comment under a grade (only for graded works). */
export async function setGradeComment(assessmentId: string, studentId: string, comment: string): Promise<Result> {
  const { user, t, d } = await teacher();
  const r = await d.q(
    `update grades g set comment = $3 from assessments a join courses c on c.id = a.course_id
      where g.assessment_id = $1 and g.student_id = $2 and a.id = g.assessment_id and c.teacher_id = $4 returning 1`,
    [assessmentId, studentId, comment.trim().slice(0, 500), user.id],
  );
  refresh();
  return r.length ? { ok: true, message: t.common.saved } : { ok: false, message: t.teacher.notOwner };
}

/** Bulk grades from Excel / Canvas: rows were matched to students and works in the browser; everything is re-checked here. */
export async function importGrades(courseId: string, groupId: string, rows: { studentId: string; workId: string; points: number }[]): Promise<Result> {
  const { user, t, d } = await teacher();
  if (!Array.isArray(rows) || rows.length > 5000) return { ok: false, message: t.common.error };
  const n = await d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return -1;
    const works = new Map(
      (await q<{ id: string; max_points: number }>(`select id, max_points::float8 as max_points from assessments where course_id = $1`, [courseId])).map((w) => [w.id, w.max_points]),
    );
    const students = new Set((await q<{ student_id: string }>(`select student_id from group_members where group_id = $1`, [groupId])).map((r) => r.student_id));
    const ok = rows.filter((r) => works.has(r.workId) && students.has(r.studentId) && Number.isFinite(r.points) && r.points >= 0 && r.points <= works.get(r.workId)!);
    if (ok.length)
      await q(
        `insert into grades (assessment_id, student_id, points, graded_by)
         select assessment_id, student_id, points, $2 from jsonb_to_recordset($1::jsonb) as x(assessment_id uuid, student_id uuid, points numeric)
         on conflict (assessment_id, student_id) do update set points = excluded.points, graded_by = excluded.graded_by, updated_at = now()`,
        [JSON.stringify(ok.map((r) => ({ assessment_id: r.workId, student_id: r.studentId, points: Math.round(r.points * 100) / 100 }))), user.id],
      );
    await logEvent(q, user.id, "grades_imported", { course_id: courseId, count: ok.length });
    return ok.length;
  });
  refresh();
  if (n < 0) return { ok: false, message: t.teacher.notOwner };
  return n ? { ok: true, message: t.grades.importDone(n) } : { ok: false, message: t.grades.importNothing };
}
