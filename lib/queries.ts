import "server-only";
import { withUser } from "./db";
import type { User } from "./auth";
import type { NotificationPayload } from "./notifications/render";

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
}

export function studentDeadlines(user: User, opts: { from?: Date; to?: Date } = {}) {
  return withUser(user.id, (q) =>
    q<DeadlineRow>(
      `select d.id, d.title, d.due_at, d.description, d.link, d.source, d.course_id, c.title as course_title, c.color,
              d.owner_id, ds.done_at, d.updated_at
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
              c.color, d.owner_id, ds.done_at, d.updated_at, t.full_name as teacher_name
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
    return { ...d, reminders };
  });
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

export function myCourses(user: User) {
  return withUser(user.id, (q) =>
    q<{ id: string; title: string; code: string; color: string }>(`select id, title, code, color from courses order by title`),
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
    const courses = await q<{ id: string; title: string; code: string; color: string }>(
      `select id, title, code, color from courses where teacher_id = app_uid() order by title`,
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
    }>(
      `select d.id, d.title, d.due_at, d.description, d.link, d.course_id, c.title as course_title, c.color,
              coalesce(string_agg(distinct g.name, ', '), '') as group_names,
              coalesce(array_agg(distinct g.id) filter (where g.id is not null), '{}') as group_ids,
              (select count(distinct gm.student_id)::int from deadline_groups dg2 join group_members gm on gm.group_id = dg2.group_id where dg2.deadline_id = d.id) as total,
              (select count(*)::int from deadline_status ds where ds.deadline_id = d.id) as done
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
