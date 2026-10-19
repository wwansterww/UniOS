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
  await d.q(`insert into courses (teacher_id, title, code, color) values ($1, $2, $3, $4)`, [
    user.id,
    title,
    str(form, "code", 30) || title.slice(0, 3).toUpperCase(),
    /^#[0-9a-f]{6}$/i.test(str(form, "color")) ? str(form, "color") : "#8C80EF",
  ]);
  refresh();
  return { ok: true, message: t.common.saved };
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

export async function createDeadline(form: FormData): Promise<Result> {
  const { user, t, d } = await teacher();
  const title = str(form, "title");
  const courseId = str(form, "course_id", 40);
  const due = parseLocalInput(str(form, "due", 20));
  const wanted = form.getAll("group_ids").map(String);
  if (!title || !due) return { ok: false, message: t.common.error };
  const res = await d.tx(async (q) => {
    if (!(await ownsCourse(q, user, courseId))) return { ok: false, message: t.teacher.notOwner };
    const allowed = await courseGroupIds(q, courseId);
    const groups = wanted.filter((g) => allowed.includes(g));
    if (groups.length === 0) return { ok: false, message: t.teacher.pickGroups };
    const [row] = await q<{ id: string }>(
      `insert into deadlines (course_id, title, due_at, description, link, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
      [courseId, title, due.toISOString(), str(form, "description", 4000), str(form, "link", 500) || null, user.id],
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
