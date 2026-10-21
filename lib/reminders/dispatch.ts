import type { Db } from "../db/core";
import { dictionaries, duration, isLocale, type Locale } from "../i18n";
import { renderNotification, renderPlain, type NotificationPayload } from "../notifications/render";
import type { Senders } from "../notifications/channels";
import { appUrl, canLinkButton, esc, type InlineButton } from "../telegram/api";
import { formatDateTime } from "../time";
import { logEvent } from "./engine";

export const MAX_ATTEMPTS = 3;
const BATCH = 100;

interface DueReminder {
  id: string;
  student_id: string;
  deadline_id: string;
  kind: "reminder" | "urgent" | "snooze";
  attempts: number;
  title: string;
  due_at: Date;
  deleted_at: Date | null;
  course_title: string | null;
  done: boolean;
  files: boolean;
  chat_id: string | null;
  email: string;
  locale: string;
  channels: string[] | null;
}

export function reminderTelegram(
  r: { id: string; deadline_id: string; kind: string; title: string; course_title: string | null; due_at: Date; files?: boolean },
  locale: Locale,
  now: Date,
) {
  const t = dictionaries[locale];
  const due = new Date(r.due_at);
  const head = r.kind === "urgent" ? t.bot.urgent : t.bot.reminder;
  const html = [
    `${head} · ${esc(t.rel.left(duration(t, due.getTime() - now.getTime())))}`,
    `<b>${esc(r.title)}</b>`,
    `${esc(r.course_title ?? t.common.personal)} · ${esc(formatDateTime(due, locale))}`,
  ].join("\n");
  // Work handed in as files can't be ticked off from Telegram: only "later" and the link to the site.
  const buttons: InlineButton[][] = [
    [
      ...(r.files ? [] : [{ text: t.bot.done, callback_data: `done:${r.deadline_id}` }]),
      { text: t.bot.snooze, callback_data: `snooze:${r.deadline_id}` },
    ],
  ];
  if (canLinkButton()) buttons.push([{ text: t.bot.open, url: `${appUrl()}/r/${r.id}` }]);
  return { html, buttons };
}

/**
 * Sends every reminder whose time has come. Rows are locked with FOR UPDATE SKIP LOCKED, so two
 * overlapping runs (cron + manual) never send the same reminder twice. Failed sends are retried on
 * the next run, up to MAX_ATTEMPTS times.
 */
export async function dispatchReminders(db: Db, senders: Senders, now = new Date()) {
  const stats = { sent: 0, skipped: 0, failed: 0 };
  await db.tx(async (q) => {
    const rows = await q<DueReminder>(
      `select r.id, r.student_id, r.deadline_id, r.kind, r.attempts, d.title, d.due_at, d.deleted_at,
              c.title as course_title, (ds.student_id is not null) as done, (d.file_types is not null) as files,
              p.telegram_chat_id::text as chat_id, p.email, p.locale, np.channels
         from reminders r
         join deadlines d on d.id = r.deadline_id
         join profiles p on p.id = r.student_id
         left join courses c on c.id = d.course_id
         left join notification_prefs np on np.user_id = r.student_id
         left join deadline_status ds on ds.deadline_id = r.deadline_id and ds.student_id = r.student_id
        where r.send_at <= $1 and r.sent_at is null and r.attempts < ${MAX_ATTEMPTS}
        order by r.send_at
        limit ${BATCH}
        for update of r skip locked`,
      [now.toISOString()],
    );

    for (const r of rows) {
      if (r.deleted_at || r.done || new Date(r.due_at) <= now) {
        await q(`update reminders set sent_at = $2, skipped = true where id = $1`, [r.id, now.toISOString()]);
        stats.skipped++;
        continue;
      }
      const locale: Locale = isLocale(r.locale) ? r.locale : "ru";
      const channels = r.channels ?? ["telegram", "in_app"];
      const payload: NotificationPayload = {
        course: r.course_title ?? undefined,
        title: r.title,
        due: new Date(r.due_at).toISOString(),
        urgent: r.kind === "urgent",
        deadlineId: r.deadline_id,
      };
      const errors = await deliver(senders, channels, r, () => reminderTelegram(r, locale, now), () => {
        const rendered = renderNotification(dictionaries[locale], locale, "reminder", payload);
        return { subject: `${rendered.title}: ${r.title}`, text: renderPlain(rendered) + `\n\n${appUrl()}/r/${r.id}` };
      });

      const attempts = r.attempts + 1;
      if (errors.length && attempts < MAX_ATTEMPTS) {
        await q(`update reminders set attempts = $2, last_error = $3 where id = $1`, [r.id, attempts, errors.join("; ")]);
        await logEvent(q, r.student_id, "reminder_retry", { reminder_id: r.id, error: errors.join("; ") });
        stats.failed++;
        continue;
      }
      if (errors.length) {
        // Out of retries: keep sent_at empty (visible in logs/metrics) but stop trying.
        await q(`update reminders set attempts = $2, last_error = $3 where id = $1`, [r.id, attempts, errors.join("; ")]);
        await logEvent(q, r.student_id, "reminder_failed", { reminder_id: r.id, error: errors.join("; ") });
        stats.failed++;
      } else {
        await q(`update reminders set sent_at = $2, attempts = $3, last_error = null where id = $1`, [r.id, now.toISOString(), attempts]);
        await logEvent(q, r.student_id, "reminder_sent", { reminder_id: r.id, kind: r.kind });
        stats.sent++;
      }
      if (channels.includes("in_app")) {
        await q(
          `insert into notifications (user_id, kind, title, body, link, payload) values ($1, 'reminder', $2, '', $3, $4::jsonb)`,
          [r.student_id, r.title, `/deadlines/${r.deadline_id}`, JSON.stringify(payload)],
        );
      }
    }
  });
  return stats;
}

interface DueNotification {
  id: string;
  user_id: string;
  kind: string;
  link: string | null;
  payload: NotificationPayload;
  attempts: number;
  chat_id: string | null;
  email: string;
  locale: string;
  channels: string[] | null;
}

/** Sends queued instant messages (moved deadline, cancelled class, important announcement, digest…). */
export async function dispatchNotifications(db: Db, senders: Senders, now = new Date()) {
  const stats = { sent: 0, failed: 0 };
  await db.tx(async (q) => {
    const rows = await q<DueNotification>(
      `select n.id, n.user_id, n.kind, n.link, n.payload, n.attempts,
              p.telegram_chat_id::text as chat_id, p.email, p.locale, np.channels
         from notifications n
         join profiles p on p.id = n.user_id
         left join notification_prefs np on np.user_id = n.user_id
        where n.deliver and n.sent_at is null and n.send_at <= $1 and n.attempts < ${MAX_ATTEMPTS}
        order by n.send_at
        limit ${BATCH}
        for update of n skip locked`,
      [now.toISOString()],
    );
    for (const n of rows) {
      const locale: Locale = isLocale(n.locale) ? n.locale : "ru";
      const t = dictionaries[locale];
      const rendered = renderNotification(t, locale, n.kind, n.payload);
      const url = n.link ? `${appUrl()}${n.link}` : appUrl();
      const errors = await deliver(
        senders,
        n.channels ?? ["telegram", "in_app"],
        n,
        () => {
          const change = rendered.from || rendered.to ? `\n<s>${esc(rendered.from ?? "")}</s> → <b>${esc(rendered.to ?? "")}</b>` : "";
          const lines = n.payload.lines?.length ? `\n\n${n.payload.lines.map(esc).join("\n")}` : "";
          const html = `<b>${esc(rendered.title)}</b>\n${esc(rendered.body)}${change}${lines}`;
          const buttons: InlineButton[][] = [];
          if (n.payload.deadlineId && (n.kind === "deadline_new" || n.kind === "deadline_moved"))
            buttons.push([{ text: t.bot.done, callback_data: `done:${n.payload.deadlineId}` }]);
          if (canLinkButton()) buttons.push([{ text: t.bot.open, url: n.payload.url ?? url }]);
          return { html, buttons };
        },
        () => ({ subject: rendered.title, text: `${renderPlain(rendered)}\n\n${n.payload.url ?? url}` }),
      );
      const attempts = n.attempts + 1;
      if (errors.length) {
        await q(`update notifications set attempts = $2, last_error = $3 where id = $1`, [n.id, attempts, errors.join("; ")]);
        await logEvent(q, n.user_id, attempts >= MAX_ATTEMPTS ? "notification_failed" : "notification_retry", {
          id: n.id,
          error: errors.join("; "),
        });
        stats.failed++;
      } else {
        await q(`update notifications set sent_at = $2, attempts = $3, last_error = null where id = $1`, [n.id, now.toISOString(), attempts]);
        stats.sent++;
      }
    }
  });
  return stats;
}

/** Sends through every chosen external channel. Returns errors; empty = delivered (or nothing to deliver). */
async function deliver(
  senders: Senders,
  channels: string[],
  to: { chat_id: string | null; email: string },
  telegram: () => { html: string; buttons: InlineButton[][] },
  email: () => { subject: string; text: string },
): Promise<string[]> {
  const errors: string[] = [];
  let ok = 0;
  if (channels.includes("telegram") && to.chat_id && senders.telegram) {
    try {
      const m = telegram();
      await senders.telegram(to.chat_id, m.html, m.buttons);
      ok++;
    } catch (e) {
      errors.push(`telegram: ${(e as Error).message}`);
    }
  }
  if (channels.includes("email") && senders.email) {
    try {
      const m = email();
      await senders.email(to.email, m.subject, m.text);
      ok++;
    } catch (e) {
      errors.push(`email: ${(e as Error).message}`);
    }
  }
  // One working channel is enough; only retry when everything we tried failed.
  return ok > 0 ? [] : errors;
}

