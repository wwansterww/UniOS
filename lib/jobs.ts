import type { Db } from "./db/core";
import { syncAllCanvas } from "./canvas";
import { defaultSenders, type Senders } from "./notifications/channels";
import { notify } from "./notifications/notify";
import { dispatchNotifications, dispatchReminders } from "./reminders/dispatch";
import { DAY, dateKey, formatTime, startOfDay, zoned } from "./time";

export const DIGEST_HOUR = 8;

/** One scheduler run: called every 5 minutes by pg_cron (or every minute by the local scheduler). */
export async function runTick(db: Db, senders: Senders = defaultSenders(), now = new Date()) {
  const digests = await queueDigests(db, now);
  const registration = await queueRegistrationNotices(db, now);
  const reminders = await dispatchReminders(db, senders, now);
  const notifications = await dispatchNotifications(db, senders, now);
  const canvas = await syncAllCanvas(db, now).catch(() => 0);
  return { reminders, notifications, digests, registration, canvas, at: now.toISOString() };
}

/** Right after a change: deliver instant messages without waiting for the next tick. */
export async function dispatchNow(db: Db, senders: Senders = defaultSenders()) {
  await dispatchReminders(db, senders);
  await dispatchNotifications(db, senders);
}

/** Morning digest at 08:00 Almaty: "Сегодня 3 пары и 2 дедлайна". */
export async function queueDigests(db: Db, now: Date) {
  const local = zoned(now);
  if (local.hour < DIGEST_HOUR || local.hour >= 12) return 0;
  const today = dateKey(now);
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  return db.tx(async (q) => {
    const students = await q<{ id: string; locale: string }>(
      `select p.id, p.locale from profiles p join notification_prefs np on np.user_id = p.id
        where p.role = 'student' and np.digest_enabled and (np.digest_last_sent is null or np.digest_last_sent < $1::date)
        for update of np skip locked`,
      [today],
    );
    for (const s of students) {
      const classes = await q<{ starts_at: Date; title: string; room: string }>(
        `select cs.starts_at, c.title, cs.room from class_sessions cs
           join courses c on c.id = cs.course_id
           join group_members gm on gm.group_id = cs.group_id and gm.student_id = $1
          where cs.starts_at >= $2 and cs.starts_at < $3 and cs.status <> 'cancelled'
          order by cs.starts_at`,
        [s.id, dayStart.toISOString(), dayEnd.toISOString()],
      );
      const deadlines = await q<{ title: string; due_at: Date }>(
        `select d.title, d.due_at from deadlines d
          where d.deleted_at is null and d.due_at >= $2 and d.due_at < $3
            and not exists (select 1 from deadline_status ds where ds.deadline_id = d.id and ds.student_id = $1)
            and (d.owner_id = $1 or exists (select 1 from deadline_groups dg join group_members gm on gm.group_id = dg.group_id
                                             where dg.deadline_id = d.id and gm.student_id = $1))
          order by d.due_at`,
        [s.id, now.toISOString(), dayEnd.toISOString()],
      );
      await q(`update notification_prefs set digest_last_sent = $2::date where user_id = $1`, [s.id, today]);
      if (classes.length === 0 && deadlines.length === 0) continue;
      const lines = [
        ...classes.map((c) => `${formatTime(new Date(c.starts_at))} · ${c.title}${c.room ? ` · ${c.room}` : ""}`),
        ...deadlines.map((d) => `📌 ${formatTime(new Date(d.due_at))} · ${d.title}`),
      ];
      await notify(q, [s.id], "digest", { classes: classes.length, deadlines: deadlines.length, lines }, { link: "/today", force: true, now });
    }
    return students.length;
  });
}

/** "Регистрация открыта" when a window opens and "закрывается через 24 часа" a day before it closes. */
export async function queueRegistrationNotices(db: Db, now: Date) {
  return db.tx(async (q) => {
    let n = 0;
    const windows = await q<{ id: string; title: string; opens_at: Date; closes_at: Date; url: string; opened_notified_at: Date | null; closing_notified_at: Date | null }>(
      `select * from registration_windows where closes_at > $1 for update skip locked`,
      [now.toISOString()],
    );
    const students = windows.length
      ? (await q<{ id: string }>(`select id from profiles where role = 'student'`)).map((r) => r.id)
      : [];
    for (const w of windows) {
      const payload = { title: w.title, due: new Date(w.closes_at).toISOString(), url: w.url };
      if (!w.opened_notified_at && new Date(w.opens_at) <= now) {
        n += await notify(q, students, "reg_open", payload, { link: "/registration", force: true, now });
        await q(`update registration_windows set opened_notified_at = $2 where id = $1`, [w.id, now.toISOString()]);
      }
      if (!w.closing_notified_at && new Date(w.opens_at) <= now && new Date(w.closes_at).getTime() - now.getTime() <= DAY) {
        n += await notify(q, students, "reg_closing", payload, { link: "/registration", force: true, now });
        await q(`update registration_windows set closing_notified_at = $2 where id = $1`, [w.id, now.toISOString()]);
      }
    }
    return n;
  });
}

