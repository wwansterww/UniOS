// Personal data in practice: consent records, the "download my data" export, withdrawal and retention.
// Law of RK No. 94-V "On personal data and their protection": art. 7–8 (consent; processing stops within
// 15 working days of a withdrawal), art. 24 (the subject's rights), art. 25 (deletion once the purpose is reached).
// GDPR: art. 5 (minimisation, storage limitation), art. 15 and 20 (access, portability).
import { randomBytes } from "node:crypto";
import type { Q } from "./db/core";
import { DAY } from "./time";
import { PRIVACY_VERSION, RETENTION_DAYS } from "./legal/privacy";

export interface ConsentRow {
  version: string;
  source: "signin" | "application";
  accepted_at: Date;
}

/** The person's consent that is still in force (latest first), or null. */
export async function activeConsent(q: Q, profileId: string): Promise<ConsentRow | null> {
  const [c] = await q<ConsentRow>(
    `select version, source, accepted_at from consents where profile_id = $1 and withdrawn_at is null
      order by accepted_at desc limit 1`,
    [profileId],
  );
  return c ?? null;
}

/**
 * Records consent to the current policy. Returns true when the person had withdrawn consent before (the caller
 * plans their reminders again: nothing was planned or sent while it was withdrawn).
 */
export async function recordConsent(
  q: Q,
  profileId: string,
  opts: { version?: string; source?: ConsentRow["source"]; ip?: string; userAgent?: string; at?: Date } = {},
): Promise<boolean> {
  const at = opts.at ?? new Date();
  await q(`insert into consents (profile_id, version, source, ip, user_agent, accepted_at) values ($1, $2, $3, $4, $5, $6)`, [
    profileId,
    opts.version ?? PRIVACY_VERSION,
    opts.source ?? "signin",
    (opts.ip ?? "").slice(0, 64),
    (opts.userAgent ?? "").slice(0, 300),
    at.toISOString(),
  ]);
  const [p] = await q<{ was: Date | null }>(`select consent_withdrawn_at as was from profiles where id = $1`, [profileId]);
  if (p?.was) await q(`update profiles set consent_withdrawn_at = null where id = $1`, [profileId]);
  return !!p?.was;
}

/**
 * Withdraws consent. Right away: no more messages, Telegram, calendar feed and Canvas disconnected, every session
 * signed out. The rest of the non-academic data goes after RETENTION_DAYS.afterWithdrawal (runRetention).
 * Grades and attendance stay: they are the university's records.
 */
export async function withdrawConsent(q: Q, profileId: string, now = new Date()) {
  await q(`update consents set withdrawn_at = $2 where profile_id = $1 and withdrawn_at is null`, [profileId, now.toISOString()]);
  await q(
    `update profiles set consent_withdrawn_at = $2, telegram_chat_id = null, canvas_feed_url = null, canvas_synced_at = null,
            canvas_error = null, ics_token = $3, session_version = session_version + 1
      where id = $1`,
    [profileId, now.toISOString(), randomBytes(16).toString("hex")],
  );
  await q(`update notifications set deliver = false where user_id = $1 and sent_at is null and deliver`, [profileId]);
  await q(`delete from telegram_link_tokens where user_id = $1`, [profileId]);
}

const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY).toISOString();

/** Runs a data-changing statement and returns how many rows it touched. */
async function count(q: Q, sql: string, params: unknown[]): Promise<number> {
  const [r] = await q<{ n: number }>(`with x as (${sql} returning 1) select count(*)::int as n from x`, params);
  return r?.n ?? 0;
}

/** Storage limitation: deletes or de-identifies what is no longer needed. Safe to run any number of times. */
export async function runRetention(q: Q, now = new Date()) {
  const r = RETENTION_DAYS;
  const withdrawn = `select id from profiles where consent_withdrawn_at < $1`;
  const result = {
    signIns: await count(q, `delete from login_attempts where created_at < $1`, [ago(now, r.signIns)]),
    tokens:
      (await count(q, `delete from magic_links where expires_at < $1`, [ago(now, r.tokens)])) +
      (await count(q, `delete from telegram_link_tokens where expires_at < $1`, [ago(now, r.tokens)])),
    certificates: await count(
      q,
      `update excuses set file = null, file_type = null, file_name = null, file_deleted_at = $2
        where file is not null and status <> 'pending' and reviewed_at < $1`,
      [ago(now, r.certificates), now.toISOString()],
    ),
    applications: await count(q, `delete from teacher_applications where status = 'rejected' and reviewed_at < $1`, [
      ago(now, r.rejectedApplications),
    ]),
    applicationIps: await count(q, `update teacher_applications set ip = '' where ip <> '' and created_at < $1`, [ago(now, r.applicationIps)]),
    notifications: await count(q, `delete from notifications where read_at is not null and created_at < $1`, [ago(now, r.readNotifications)]),
    events: await count(q, `update events set user_id = null where user_id is not null and created_at < $1`, [ago(now, r.identifiedEvents)]),
    withdrawn: 0,
  };
  // Consent withdrawn more than the grace period ago: their messages, reminders, sign-in history, read receipts
  // and the link between them and usage events go. Grades, attendance and submitted work stay with the university.
  const cut = [ago(now, r.afterWithdrawal)];
  result.withdrawn =
    (await count(q, `delete from notifications where user_id in (${withdrawn})`, cut)) +
    (await count(q, `delete from reminders where student_id in (${withdrawn})`, cut)) +
    (await count(q, `delete from announcement_reads where student_id in (${withdrawn})`, cut)) +
    (await count(q, `delete from login_attempts where email in (select email from profiles where consent_withdrawn_at < $1)`, cut)) +
    (await count(q, `update events set user_id = null where user_id in (${withdrawn})`, cut));
  return result;
}

export type RetentionResult = Awaited<ReturnType<typeof runRetention>>;

const NOTE = {
  ru: "Это все персональные данные, которые UniOS хранит о вас, на момент выгрузки. Файлы работ и справок можно скачать в самом приложении. Вопросы — эдвайзеру или команде UniOS.",
  kk: "Бұл — жүктеп алу сәтінде UniOS сіз туралы сақтайтын барлық дербес деректер. Жұмыстар мен анықтамалардың файлдарын қосымшаның өзінен жүктеп алуға болады. Сұрақтар — эдвайзерге немесе UniOS командасына.",
  en: "This is all the personal data UniOS keeps about you at the time of export. Files of your work and certificates can be downloaded in the app. Questions go to your advisor or the UniOS team.",
};

/** Everything UniOS keeps about one person (GDPR art. 15/20, Law No. 94-V art. 24), without secrets or file bytes. */
export async function exportPersonalData(q: Q, profileId: string, locale: keyof typeof NOTE = "ru", now = new Date()) {
  const [profile] = await q<{ email: string; role: string }>(
    `select id, email, full_name, role, locale, created_at, telegram_chat_id is not null as telegram_connected,
            canvas_feed_url is not null as canvas_feed_connected, must_change_password, disabled_at, consent_withdrawn_at
       from profiles where id = $1`,
    [profileId],
  );
  if (!profile) return null;
  const all = (sql: string, params: unknown[] = [profileId]) => q(sql, params);
  const [
    consents,
    signIns,
    settings,
    groups,
    advisedGroups,
    grades,
    attendance,
    excuses,
    deadlinesDone,
    personalDeadlines,
    submissions,
    announcementsRead,
    notifications,
    reminders,
    events,
    courses,
    applications,
  ] = await Promise.all([
    all(`select version, source, accepted_at, withdrawn_at, ip, user_agent from consents where profile_id = $1 order by accepted_at`),
    all(`select created_at as at, ok, ip, user_agent from login_attempts where email = $1 order by created_at desc limit 200`, [profile.email]),
    all(
      `select offsets_minutes, instant_enabled, channels, quiet_start::text as quiet_start, quiet_end::text as quiet_end, digest_enabled
         from notification_prefs where user_id = $1`,
    ),
    all(`select g.name, gm.joined_at from group_members gm join groups g on g.id = gm.group_id where gm.student_id = $1 order by g.name`),
    all(`select g.name from group_advisors ga join groups g on g.id = ga.group_id where ga.advisor_id = $1 order by g.name`),
    all(
      `select c.title as course, a.title as work, a.category, a.max_points, g.points, g.comment, g.updated_at
         from grades g join assessments a on a.id = g.assessment_id join courses c on c.id = a.course_id
        where g.student_id = $1 order by c.title, a.created_at`,
    ),
    all(
      `select c.title as course, cs.starts_at, a.status, a.marked_at, (a.marked_by is null) as self_check_in
         from attendance a join class_sessions cs on cs.id = a.session_id join courses c on c.id = cs.course_id
        where a.student_id = $1 order by cs.starts_at`,
    ),
    all(
      `select c.title as course, cs.starts_at, e.reason, e.status, e.created_at, e.reviewed_at, e.file_name,
              (e.file is not null) as file_stored, e.file_deleted_at
         from excuses e join class_sessions cs on cs.id = e.session_id join courses c on c.id = cs.course_id
        where e.student_id = $1 order by cs.starts_at`,
    ),
    all(
      `select d.title, c.title as course, ds.done_at from deadline_status ds join deadlines d on d.id = ds.deadline_id
         left join courses c on c.id = d.course_id where ds.student_id = $1 order by ds.done_at`,
    ),
    all(
      `select title, due_at, description, link, source, created_at from deadlines
        where owner_id = $1 and deleted_at is null order by due_at`,
    ),
    all(
      `select d.title as deadline, f.name, f.size, f.uploaded_at from submission_files f join deadlines d on d.id = f.deadline_id
        where f.student_id = $1 order by f.uploaded_at`,
    ),
    all(
      `select a.title, r.read_at from announcement_reads r join announcements a on a.id = r.announcement_id
        where r.student_id = $1 order by r.read_at`,
    ),
    all(`select kind, title, body, created_at, read_at, sent_at from notifications where user_id = $1 order by created_at desc limit 500`),
    all(
      `select d.title as deadline, r.kind, r.offset_minutes, r.send_at, r.sent_at, r.opened_at
         from reminders r join deadlines d on d.id = r.deadline_id where r.student_id = $1 order by r.send_at desc limit 500`,
    ),
    all(`select name, props, created_at from events where user_id = $1 order by created_at desc limit 1000`),
    all(`select title, code, credits, term, created_at from courses where teacher_id = $1 order by created_at`),
    all(
      `select status, created_at, reviewed_at, review_note, note, subjects, starts_on::text as starts_on, ends_on::text as ends_on,
              ip, consent_version
         from teacher_applications where profile_id = $1 or email = $2 order by created_at`,
      [profileId, profile.email],
    ),
  ]);
  return {
    service: "UniOS",
    exported_at: now.toISOString(),
    privacy_policy_version: PRIVACY_VERSION,
    note: NOTE[locale],
    profile,
    consents,
    sign_ins: signIns,
    notification_settings: settings[0] ?? null,
    groups,
    advised_groups: advisedGroups,
    grades,
    attendance,
    excused_absences: excuses,
    deadlines_done: deadlinesDone,
    personal_deadlines: personalDeadlines,
    submitted_files: submissions,
    announcements_read: announcementsRead,
    notifications,
    reminders,
    usage_events: events,
    courses_taught: courses,
    teacher_applications: applications,
  };
}
