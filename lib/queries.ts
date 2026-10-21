import "server-only";
import { withUser } from "./db";
import type { User } from "./auth";
import type { NotificationPayload } from "./notifications/render";
import { currentTerm, type AttendanceStatus, type Category } from "./journal";

// Every read here runs as the user, so RLS decides what is visible.

export interface Session {
  id: string;
  course_id: string;
  course_title: string;
  course_code: string;
  color: string;
  group_id: string;
  group_name: string;
  teacher_name: string;
  starts_at: Date;
  ends_at: Date;
  room: string;
  status: "scheduled" | "moved" | "cancelled";
  original_starts_at: Date | null;
  original_room: string | null;
}

const SESSION_SELECT = `
  select cs.id, cs.course_id, c.title as course_title, c.code as course_code, c.color, cs.group_id, g.name as group_name,
         t.full_name as teacher_name, cs.starts_at, cs.ends_at, cs.room, cs.status, cs.original_starts_at, cs.original_room
    from class_sessions cs
    join courses c on c.id = cs.course_id
    join groups g on g.id = cs.group_id
    left join profiles t on t.id = c.teacher_id`;

/** Sessions of the student's groups, or of the teacher's courses. */
export function sessionsBetween(user: User, from: Date, to: Date) {
  const scope =
    user.role === "teacher"
      ? `c.teacher_id = app_uid()`
      : `cs.group_id in (select group_id from group_members where student_id = app_uid())`;
  return withUser(user.id, (q) =>
    q<Session>(`${SESSION_SELECT} where ${scope} and cs.ends_at > $1 and cs.starts_at < $2 order by cs.starts_at`, [
      from.toISOString(),
      to.toISOString(),
    ]),
  );
}

export function nextSession(user: User, now: Date) {
  return withUser(user.id, async (q) => {
    const [s] = await q<Session>(
      `${SESSION_SELECT} where cs.group_id in (select group_id from group_members where student_id = app_uid())
         and cs.ends_at > $1 and cs.status <> 'cancelled' order by cs.starts_at limit 1`,
      [now.toISOString()],
    );
    return s ?? null;
  });
}

/** Sessions moved/cancelled in the coming two weeks (highlighted on Today). */
export function changedSessions(user: User, now: Date) {
  return withUser(user.id, (q) =>
    q<Session>(
      `${SESSION_SELECT} where cs.group_id in (select group_id from group_members where student_id = app_uid())
         and (cs.status <> 'scheduled' or cs.original_room is not null)
         and coalesce(cs.original_starts_at, cs.starts_at) > $1::timestamptz - interval '1 day'
         and cs.starts_at < $1::timestamptz + interval '14 days'
       order by cs.starts_at`,
      [now.toISOString()],
    ),
  );
}

export interface DeadlineRow {
  id: string;
  title: string;
  due_at: Date;
  description: string;
  link: string | null;
  source: "manual" | "canvas";
  course_id: string | null;
  course_title: string | null;
  color: string | null;
  owner_id: string | null;
  done_at: Date | null;
  updated_at: Date;
  /** Formats a file must have (lib/submissions.ts); null when the deadline takes no files. */
  file_types: string[] | null;
  allow_late: boolean;
}

export function studentDeadlines(user: User, opts: { from?: Date; to?: Date } = {}) {
  return withUser(user.id, (q) =>
    q<DeadlineRow>(
      `select d.id, d.title, d.due_at, d.description, d.link, d.source, d.course_id, c.title as course_title, c.color,
              d.owner_id, ds.done_at, d.updated_at, d.file_types, d.allow_late
         from deadlines d
         left join courses c on c.id = d.course_id
         left join deadline_status ds on ds.deadline_id = d.id and ds.student_id = app_uid()
        where d.deleted_at is null and (d.owner_id = app_uid() or d.course_id is not null)
          and ($1::timestamptz is null or d.due_at >= $1) and ($2::timestamptz is null or d.due_at < $2)
        order by d.due_at`,
      [opts.from?.toISOString() ?? null, opts.to?.toISOString() ?? null],
    ),
  );
}

export function deadlineById(user: User, id: string) {
  return withUser(user.id, async (q) => {
    const [d] = await q<DeadlineRow & { course_code: string | null; teacher_name: string | null }>(
      `select d.id, d.title, d.due_at, d.description, d.link, d.source, d.course_id, c.title as course_title, c.code as course_code,
              c.color, d.owner_id, ds.done_at, d.updated_at, d.file_types, d.allow_late, t.full_name as teacher_name
         from deadlines d
         left join courses c on c.id = d.course_id
         left join profiles t on t.id = c.teacher_id
         left join deadline_status ds on ds.deadline_id = d.id and ds.student_id = app_uid()
        where d.id = $1 and d.deleted_at is null`,
      [id],
    );
    if (!d) return null;
    const reminders = await q<{ send_at: Date; sent_at: Date | null; kind: string }>(
      `select send_at, sent_at, kind from reminders where deadline_id = $1 and student_id = app_uid() and not skipped order by send_at`,
      [id],
    );
    const files = await q<SubmissionFile>(
      `select id, name, size, uploaded_at from submission_files where deadline_id = $1 and student_id = app_uid() order by uploaded_at`,
      [id],
    );
    return { ...d, reminders, files };
  });
}

export interface SubmissionFile {
  id: string;
  name: string;
  size: number;
  uploaded_at: Date;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  payload: NotificationPayload;
  read_at: Date | null;
  created_at: Date;
}

export function notifications(user: User, opts: { unreadOnly?: boolean; limit?: number; excludeReminders?: boolean } = {}) {
  return withUser(user.id, (q) =>
    q<NotificationRow>(
      `select id, kind, title, body, link, payload, read_at, created_at from notifications
        where user_id = app_uid() and ($1::boolean is false or read_at is null)
          and ($3::boolean is false or kind not in ('reminder', 'digest'))
        order by created_at desc limit $2`,
      [!!opts.unreadOnly, opts.limit ?? 50, !!opts.excludeReminders],
    ),
  );
}

export function unreadCount(user: User) {
  return withUser(user.id, async (q) => {
    const [r] = await q<{ n: number }>(`select count(*)::int as n from notifications where user_id = app_uid() and read_at is null`);
    return r.n;
  });
}

export interface AnnouncementRow {
  id: string;
  course_id: string;
  course_title: string;
  color: string;
  author_name: string;
  title: string;
  body: string;
  is_important: boolean;
  is_pinned: boolean;
  created_at: Date;
  read: boolean;
}

export function announcements(user: User, opts: { unreadOnly?: boolean } = {}) {
  return withUser(user.id, (q) =>
    q<AnnouncementRow>(
      `select a.id, a.course_id, c.title as course_title, c.color, p.full_name as author_name, a.title, a.body,
              a.is_important, a.is_pinned, a.created_at,
              exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.student_id = app_uid()) as read
         from announcements a
         join courses c on c.id = a.course_id
         left join profiles p on p.id = a.author_id
        order by a.is_pinned desc, a.created_at desc`,
    ).then((rows) => (opts.unreadOnly ? rows.filter((r) => !r.read) : rows)),
  );
}

export function registrationWindows(user: User) {
  return withUser(user.id, (q) =>
    q<{ id: string; title: string; description: string; opens_at: Date; closes_at: Date; url: string }>(
      `select id, title, description, opens_at, closes_at, url from registration_windows order by opens_at`,
    ),
  );
}

/** Courses of this semester. */
export function myCourses(user: User) {
  return withUser(user.id, (q) =>
    q<{ id: string; title: string; code: string; color: string }>(`select id, title, code, color from courses where term = $1 order by title`, [currentTerm()]),
  );
}

export function myGroups(user: User) {
  return withUser(user.id, (q) =>
    q<{ id: string; name: string; invite_code: string }>(
      `select g.id, g.name, g.invite_code from groups g join group_members gm on gm.group_id = g.id
        where gm.student_id = app_uid() order by g.name`,
    ),
  );
}

export function myPrefs(user: User) {
  return withUser(user.id, async (q) => {
    const [p] = await q<{
      offsets_minutes: number[];
      instant_enabled: boolean;
      channels: string[];
      quiet_start: string;
      quiet_end: string;
      digest_enabled: boolean;
    }>(
      `select offsets_minutes, instant_enabled, channels, to_char(quiet_start, 'HH24:MI') as quiet_start,
              to_char(quiet_end, 'HH24:MI') as quiet_end, digest_enabled
         from notification_prefs where user_id = app_uid()`,
    );
    return (
      p ?? { offsets_minutes: [1440, 60], instant_enabled: true, channels: ["telegram", "in_app"], quiet_start: "23:00", quiet_end: "08:00", digest_enabled: true }
    );
  });
}

// ---------- teacher ----------

export function teacherCourses(user: User) {
  return withUser(user.id, async (q) => {
    const courses = await q<{ id: string; title: string; code: string; color: string; credits: number; term: string }>(
      `select id, title, code, color, credits, term from courses where teacher_id = app_uid() order by term desc, title`,
    );
    const groups = await q<{ course_id: string; id: string; name: string; invite_code: string; members: number }>(
      `select cg.course_id, g.id, g.name, g.invite_code,
              (select count(*)::int from group_members gm where gm.group_id = g.id) as members
         from course_groups cg join groups g on g.id = cg.group_id
        where cg.course_id in (select id from courses where teacher_id = app_uid())
        order by g.name`,
    );
    return courses.map((c) => ({ ...c, groups: groups.filter((g) => g.course_id === c.id) }));
  });
}

export function teacherGroups(user: User) {
  return withUser(user.id, (q) =>
    q<{ id: string; name: string; invite_code: string; members: number }>(
      `select g.id, g.name, g.invite_code, (select count(*)::int from group_members gm where gm.group_id = g.id) as members
         from groups g where g.id in (select my_teaching_group_ids()) order by g.name`,
    ),
  );
}

export function teacherDeadlines(user: User) {
  return withUser(user.id, (q) =>
    q<{
      id: string;
      title: string;
      due_at: Date;
      description: string;
      link: string | null;
      course_id: string;
      course_title: string;
      color: string;
      group_names: string;
      group_ids: string[];
      total: number;
      done: number;
      file_types: string[] | null;
      allow_late: boolean;
      /** Students who handed in files, and how many of them after the due time (by their last file). */
      submitted: number;
      late: number;
    }>(
      `select d.id, d.title, d.due_at, d.description, d.link, d.course_id, c.title as course_title, c.color, d.file_types, d.allow_late,
              coalesce(string_agg(distinct g.name, ', '), '') as group_names,
              coalesce(array_agg(distinct g.id) filter (where g.id is not null), '{}') as group_ids,
              (select count(distinct gm.student_id)::int from deadline_groups dg2 join group_members gm on gm.group_id = dg2.group_id where dg2.deadline_id = d.id) as total,
              (select count(*)::int from deadline_status ds where ds.deadline_id = d.id) as done,
              (select count(distinct sf.student_id)::int from submission_files sf where sf.deadline_id = d.id) as submitted,
              (select count(*)::int from (select max(sf.uploaded_at) as last from submission_files sf where sf.deadline_id = d.id group by sf.student_id) x
                where x.last > d.due_at) as late
         from deadlines d
         join courses c on c.id = d.course_id and c.teacher_id = app_uid()
         left join deadline_groups dg on dg.deadline_id = d.id
         left join groups g on g.id = dg.group_id
        where d.deleted_at is null
        group by d.id, c.title, c.color
        order by (d.due_at < now()), case when d.due_at >= now() then d.due_at end asc, d.due_at desc`,
    ),
  );
}

/** One course deadline of this teacher with every student it is for and the files each handed in. */
export function deadlineSubmissions(user: User, id: string) {
  return withUser(user.id, async (q) => {
    const [d] = await q<{
      id: string;
      title: string;
      due_at: Date;
      file_types: string[] | null;
      allow_late: boolean;
      course_title: string;
      course_code: string;
      color: string;
    }>(
      `select d.id, d.title, d.due_at, d.file_types, d.allow_late, c.title as course_title, c.code as course_code, c.color
         from deadlines d join courses c on c.id = d.course_id and c.teacher_id = app_uid()
        where d.id = $1 and d.deleted_at is null`,
      [id],
    );
    if (!d) return null;
    const students = await q<{ id: string; full_name: string; group_name: string }>(
      `select distinct p.id, p.full_name, g.name as group_name
         from deadline_groups dg join groups g on g.id = dg.group_id
         join group_members gm on gm.group_id = dg.group_id join profiles p on p.id = gm.student_id
        where dg.deadline_id = $1
        order by g.name, p.full_name`,
      [id],
    );
    const files = await q<SubmissionFile & { student_id: string }>(
      `select id, student_id, name, size, uploaded_at from submission_files where deadline_id = $1 order by uploaded_at`,
      [id],
    );
    return { ...d, students: students.map((s) => ({ ...s, files: files.filter((f) => f.student_id === s.id) })) };
  });
}

export function teacherAnnouncements(user: User) {
  return withUser(user.id, async (q) => {
    const anns = await q<{
      id: string;
      course_id: string;
      course_title: string;
      color: string;
      title: string;
      body: string;
      is_important: boolean;
      is_pinned: boolean;
      created_at: Date;
      total: number;
      reads: number;
    }>(
      `select a.id, a.course_id, c.title as course_title, c.color, a.title, a.body, a.is_important, a.is_pinned, a.created_at,
              (select count(distinct gm.student_id)::int from course_groups cg join group_members gm on gm.group_id = cg.group_id where cg.course_id = a.course_id) as total,
              (select count(*)::int from announcement_reads r where r.announcement_id = a.id) as reads
         from announcements a join courses c on c.id = a.course_id and c.teacher_id = app_uid()
        order by a.is_pinned desc, a.created_at desc`,
    );
    const unread = await q<{ announcement_id: string; id: string; full_name: string }>(
      `select a.id as announcement_id, p.id, p.full_name
         from announcements a
         join courses c on c.id = a.course_id and c.teacher_id = app_uid()
         join course_groups cg on cg.course_id = a.course_id
         join group_members gm on gm.group_id = cg.group_id
         join profiles p on p.id = gm.student_id
        where not exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.student_id = p.id)
        group by a.id, p.id, p.full_name
        order by p.full_name`,
    );
    return anns.map((a) => ({ ...a, unread: unread.filter((u) => u.announcement_id === a.id) }));
  });
}

// ---------- grades & attendance ----------

export interface CourseWork {
  id: string;
  course_id: string;
  title: string;
  max_points: number;
  category: Category;
  points: number | null;
  comment: string;
}

/**
 * A student's courses of every semester (newest first) with graded works and their own points.
 * Defaults to the signed-in student; advisors pass a student of their groups (RLS checks it).
 */
export function studentGrades(user: User, studentId?: string) {
  return withUser(user.id, async (q) => {
    const sid = studentId ?? user.id;
    const courses = await q<{ id: string; title: string; code: string; color: string; credits: number; term: string; teacher_name: string | null }>(
      `select c.id, c.title, c.code, c.color, c.credits, c.term, t.full_name as teacher_name
         from courses c left join profiles t on t.id = c.teacher_id
        where c.id in (select cg.course_id from course_groups cg join group_members gm on gm.group_id = cg.group_id where gm.student_id = $1)
        order by c.term desc, c.title`,
      [sid],
    );
    const works = await q<CourseWork>(
      `select a.id, a.course_id, a.title, a.max_points::float8 as max_points, a.category, g.points::float8 as points, coalesce(g.comment, '') as comment
         from assessments a
         left join grades g on g.assessment_id = a.id and g.student_id = $1
        where a.course_id::text = any(string_to_array($2, ','))
        order by case a.category when 'rk1' then 1 when 'rk2' then 2 else 3 end, a.created_at, a.title`,
      [sid, courses.map((c) => c.id).join(",")],
    );
    return courses.map((c) => ({ ...c, works: works.filter((w) => w.course_id === c.id) }));
  });
}

export const myGrades = (user: User) => studentGrades(user);

export interface AttendanceMark {
  session_id: string;
  course_id: string;
  starts_at: Date;
  status: AttendanceStatus;
  excuse: "pending" | "approved" | "rejected" | null;
}

/** A student's attendance this semester per course (newest class first), with how many classes the course has. */
export function studentAttendance(user: User, studentId?: string) {
  return withUser(user.id, async (q) => {
    const sid = studentId ?? user.id;
    const courses = await q<{ id: string; title: string; code: string; color: string; planned: number; held: number }>(
      `select c.id, c.title, c.code, c.color,
              count(cs.id) filter (where cs.status <> 'cancelled')::int as planned,
              count(cs.id) filter (where cs.status <> 'cancelled' and cs.ends_at < now())::int as held
         from courses c
         join course_groups cg on cg.course_id = c.id and cg.group_id in (select group_id from group_members where student_id = $1)
         left join class_sessions cs on cs.course_id = c.id and cs.group_id = cg.group_id
        where c.term = $2
        group by c.id order by c.title`,
      [sid, currentTerm()],
    );
    const marks = await q<AttendanceMark>(
      `select a.session_id, cs.course_id, cs.starts_at, a.status, e.status as excuse
         from attendance a
         join class_sessions cs on cs.id = a.session_id
         left join excuses e on e.session_id = a.session_id and e.student_id = a.student_id
        where a.student_id = $1
        order by cs.starts_at desc`,
      [sid],
    );
    return courses.map((c) => ({ ...c, marks: marks.filter((m) => m.course_id === c.id) }));
  });
}

export const myAttendance = (user: User) => studentAttendance(user);

/** Teacher: one group's gradebook for one of their courses. null if the course isn't theirs. */
export function teacherGradebook(user: User, courseId: string, groupId: string) {
  return withUser(user.id, async (q) => {
    const [course] = await q<{ id: string }>(
      `select c.id from courses c join course_groups cg on cg.course_id = c.id
        where c.id = $1 and cg.group_id = $2 and c.teacher_id = app_uid()`,
      [courseId, groupId],
    );
    if (!course) return null;
    const students = await q<{ id: string; full_name: string; email: string }>(
      `select p.id, p.full_name, p.email from group_members gm join profiles p on p.id = gm.student_id
        where gm.group_id = $1 order by p.full_name`,
      [groupId],
    );
    const works = await q<{ id: string; title: string; max_points: number; category: Category }>(
      `select id, title, max_points::float8 as max_points, category from assessments where course_id = $1
        order by case category when 'rk1' then 1 when 'rk2' then 2 else 3 end, created_at, title`,
      [courseId],
    );
    const grades = await q<{ assessment_id: string; student_id: string; points: number; comment: string }>(
      `select g.assessment_id, g.student_id, g.points::float8 as points, g.comment
         from grades g join assessments a on a.id = g.assessment_id
        where a.course_id = $1 and g.student_id in (select student_id from group_members where group_id = $2)`,
      [courseId, groupId],
    );
    return { students, works, grades };
  });
}

/** Teacher: a class with its group roster and each student's mark. null if it isn't theirs. */
export function sessionRoster(user: User, sessionId: string) {
  return withUser(user.id, async (q) => {
    const [session] = await q<Session>(`${SESSION_SELECT} where cs.id = $1 and c.teacher_id = app_uid()`, [sessionId]);
    if (!session) return null;
    const students = await q<{ id: string; full_name: string; status: AttendanceStatus | null; absences: number }>(
      `select p.id, p.full_name, a.status,
              (select count(*)::int from attendance x join class_sessions y on y.id = x.session_id
                where x.student_id = p.id and x.status = 'absent' and y.course_id = $3 and y.group_id = $2) as absences
         from group_members gm
         join profiles p on p.id = gm.student_id
         left join attendance a on a.session_id = $1 and a.student_id = p.id
        where gm.group_id = $2
        order by p.full_name`,
      [sessionId, session.group_id, session.course_id],
    );
    const [{ planned }] = await q<{ planned: number }>(
      `select count(*)::int as planned from class_sessions where course_id = $1 and group_id = $2 and status <> 'cancelled'`,
      [session.course_id, session.group_id],
    );
    return { session, students, planned };
  });
}

/** Teacher: how many students are marked in each class, and how many there are. */
export function attendanceProgress(user: User, sessionIds: string[]) {
  if (sessionIds.length === 0) return Promise.resolve(new Map<string, { marked: number; total: number }>());
  return withUser(user.id, async (q) => {
    const rows = await q<{ id: string; marked: number; total: number }>(
      `select cs.id,
              (select count(*)::int from attendance a where a.session_id = cs.id) as marked,
              (select count(*)::int from group_members gm where gm.group_id = cs.group_id) as total
         from class_sessions cs
        where cs.id::text = any(string_to_array($1, ','))`,
      [sessionIds.join(",")],
    );
    return new Map(rows.map((r) => [r.id, { marked: r.marked, total: r.total }]));
  });
}

/** Teacher: attendance totals of every student of a group in one of their courses. null if it isn't theirs. */
export function attendanceSummary(user: User, courseId: string, groupId: string) {
  return withUser(user.id, async (q) => {
    const [course] = await q<{ planned: number; held: number }>(
      `select count(cs.id) filter (where cs.status <> 'cancelled')::int as planned,
              count(cs.id) filter (where cs.status <> 'cancelled' and cs.ends_at < now())::int as held
         from courses c join course_groups cg on cg.course_id = c.id
         left join class_sessions cs on cs.course_id = c.id and cs.group_id = cg.group_id
        where c.id = $1 and cg.group_id = $2 and c.teacher_id = app_uid()
        group by c.id`,
      [courseId, groupId],
    );
    if (!course) return null;
    const students = await q<{ id: string; full_name: string; present: number; late: number; absent: number; excused: number }>(
      `select p.id, p.full_name,
              count(a.*) filter (where a.status = 'present')::int as present,
              count(a.*) filter (where a.status = 'late')::int as late,
              count(a.*) filter (where a.status = 'absent')::int as absent,
              count(a.*) filter (where a.status = 'excused')::int as excused
         from group_members gm
         join profiles p on p.id = gm.student_id
         left join class_sessions cs on cs.course_id = $1 and cs.group_id = gm.group_id
         left join attendance a on a.session_id = cs.id and a.student_id = p.id
        where gm.group_id = $2
        group by p.id order by p.full_name`,
      [courseId, groupId],
    );
    return { ...course, students };
  });
}

/** Teacher: absences per student, course and group this semester, with the number of planned classes (25% limit). */
export function teacherAbsences(user: User) {
  return withUser(user.id, (q) =>
    q<{ student_id: string; full_name: string; course_id: string; course_title: string; color: string; group_id: string; group_name: string; absent: number; planned: number }>(
      `with plan as (
         select course_id, group_id, count(*) filter (where status <> 'cancelled')::int as planned
           from class_sessions where course_id in (select id from courses where teacher_id = app_uid())
          group by course_id, group_id)
       select a.student_id, p.full_name, cs.course_id, c.title as course_title, c.color, cs.group_id, g.name as group_name,
              count(*)::int as absent, plan.planned
         from attendance a
         join class_sessions cs on cs.id = a.session_id
         join courses c on c.id = cs.course_id and c.teacher_id = app_uid() and c.term = $1
         join groups g on g.id = cs.group_id
         join profiles p on p.id = a.student_id
         join plan on plan.course_id = cs.course_id and plan.group_id = cs.group_id
        where a.status = 'absent'
        group by a.student_id, p.full_name, cs.course_id, c.title, c.color, cs.group_id, g.name, plan.planned
        order by count(*) desc, p.full_name`,
      [currentTerm()],
    ),
  );
}

export interface ExcuseRow {
  session_id: string;
  student_id: string;
  full_name: string;
  course_title: string;
  color: string;
  group_name: string;
  starts_at: Date;
  reason: string;
  has_file: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
}

/** Teacher: certificates for their classes — all pending ones and those reviewed in the last two weeks. */
export function teacherExcuses(user: User) {
  return withUser(user.id, (q) =>
    q<ExcuseRow>(
      `select e.session_id, e.student_id, p.full_name, c.title as course_title, c.color, g.name as group_name, cs.starts_at,
              e.reason, e.file is not null as has_file, e.status, e.created_at
         from excuses e
         join class_sessions cs on cs.id = e.session_id
         join courses c on c.id = cs.course_id and c.teacher_id = app_uid()
         join groups g on g.id = cs.group_id
         join profiles p on p.id = e.student_id
        where e.status = 'pending' or e.reviewed_at > now() - interval '14 days'
        order by e.status <> 'pending', e.created_at desc`,
    ),
  );
}

/** Advisor: groups, students, this semester's courses with works, grades and attendance — everything for the risk view. */
export function advisorOverview(user: User) {
  return withUser(user.id, async (q) => {
    const groups = await q<{ id: string; name: string }>(`select id, name from groups where id in (select my_advised_group_ids()) order by name`);
    const students = await q<{ id: string; full_name: string; group_id: string; group_name: string }>(
      `select p.id, p.full_name, gm.group_id, g.name as group_name
         from group_members gm join profiles p on p.id = gm.student_id join groups g on g.id = gm.group_id
        where gm.group_id in (select my_advised_group_ids()) order by p.full_name`,
    );
    const courses = await q<{ id: string; title: string; credits: number; term: string; group_id: string }>(
      `select c.id, c.title, c.credits, c.term, cg.group_id from courses c join course_groups cg on cg.course_id = c.id
        where cg.group_id in (select my_advised_group_ids())`,
    );
    const works = await q<{ id: string; course_id: string; max_points: number; category: Category }>(
      `select id, course_id, max_points::float8 as max_points, category from assessments where course_id::text = any(string_to_array($1, ','))`,
      [courses.map((c) => c.id).join(",")],
    );
    const grades = await q<{ assessment_id: string; student_id: string; points: number }>(
      `select assessment_id, student_id, points::float8 as points from grades where student_id in (select my_advised_student_ids())`,
    );
    const attendance = await q<{ student_id: string; course_id: string; group_id: string; present: number; late: number; absent: number }>(
      `select a.student_id, cs.course_id, cs.group_id,
              count(*) filter (where a.status = 'present')::int as present,
              count(*) filter (where a.status = 'late')::int as late,
              count(*) filter (where a.status = 'absent')::int as absent
         from attendance a join class_sessions cs on cs.id = a.session_id
        where a.student_id in (select my_advised_student_ids())
        group by a.student_id, cs.course_id, cs.group_id`,
    );
    const planned = await q<{ course_id: string; group_id: string; planned: number }>(
      `select course_id, group_id, count(*) filter (where status <> 'cancelled')::int as planned
         from class_sessions where group_id in (select my_advised_group_ids()) group by course_id, group_id`,
    );
    return { groups, students, courses, works, grades, attendance, planned };
  });
}

/** Advisor: one student's profile if they're in an advised group. */
export function advisedStudent(user: User, studentId: string) {
  return withUser(user.id, async (q) => {
    const [s] = await q<{ id: string; full_name: string; email: string; group_name: string }>(
      `select p.id, p.full_name, p.email, g.name as group_name
         from group_members gm join profiles p on p.id = gm.student_id join groups g on g.id = gm.group_id
        where p.id = $1 and gm.group_id in (select my_advised_group_ids()) limit 1`,
      [studentId],
    );
    return s ?? null;
  });
}
