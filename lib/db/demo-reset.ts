// Fresh demo data for a presentation: the semester is rebuilt around "now", but people keep what is theirs.
import type { Q } from "./core";
import { migrations } from "./migrations";
import { seed } from "./seed";
import { recomputeForStudent } from "../reminders/engine";

/** Tables created by our migrations — the only ones a reset may empty. */
export function appTables(): string[] {
  const names = migrations.flatMap((m) => [...m.sql.matchAll(/create table (?:if not exists )?([a-z_]+)/gi)].map((x) => x[1]));
  return [...new Set(names)];
}

export interface ResetSummary {
  people: number;
  telegramKept: number;
  passwordsKept: number;
  eventsKept: number;
}

/**
 * Empties every app table and seeds the semester again relative to `now` (deadlines "in 1 hour", today's classes…).
 * Kept per email: password (also one the person changed), Telegram link, language, disabled state, notification
 * settings — and real usage events, so /metrics doesn't lose a pilot. Run inside one transaction.
 */
export async function resetDemo(q: Q, now = new Date(), password?: (email: string) => string): Promise<ResetSummary> {
  const people = await q<{ email: string; password_hash: string | null; telegram_chat_id: string | null }>(
    `select email, password_hash, telegram_chat_id::text as telegram_chat_id, locale, must_change_password, session_version, disabled_at
       from profiles`,
  );
  const prefs = await q(
    `select p.email, np.offsets_minutes, np.instant_enabled, np.channels, np.quiet_start::text as quiet_start,
            np.quiet_end::text as quiet_end, np.digest_enabled
       from notification_prefs np join profiles p on p.id = np.user_id`,
  );
  // Seeded sample events are recreated by the seed itself; everything else is real usage.
  const events = await q(
    `select p.email, e.name, e.props, e.created_at from events e left join profiles p on p.id = e.user_id
      where coalesce(e.props->>'seed', '') <> 'true'`,
  );

  await q(`truncate ${appTables().map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  await seed(q, now, password);

  await q(
    `update profiles p set password_hash = coalesce(x.password_hash, p.password_hash), telegram_chat_id = x.telegram_chat_id::bigint,
            locale = x.locale, must_change_password = x.must_change_password, session_version = x.session_version, disabled_at = x.disabled_at
       from jsonb_to_recordset($1::jsonb) as x(email text, password_hash text, telegram_chat_id text, locale text,
                                               must_change_password boolean, session_version int, disabled_at timestamptz)
      where p.email = x.email`,
    [JSON.stringify(people)],
  );
  await q(
    `insert into notification_prefs (user_id, offsets_minutes, instant_enabled, channels, quiet_start, quiet_end, digest_enabled)
     select p.id, x.offsets_minutes, x.instant_enabled, x.channels, x.quiet_start::time, x.quiet_end::time, x.digest_enabled
       from jsonb_to_recordset($1::jsonb) as x(email text, offsets_minutes int[], instant_enabled boolean, channels text[],
                                               quiet_start text, quiet_end text, digest_enabled boolean)
       join profiles p on p.email = x.email
     on conflict (user_id) do update set offsets_minutes = excluded.offsets_minutes, instant_enabled = excluded.instant_enabled,
       channels = excluded.channels, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, digest_enabled = excluded.digest_enabled`,
    [JSON.stringify(prefs)],
  );
  if (events.length)
    await q(
      `insert into events (user_id, name, props, created_at)
       select p.id, x.name, x.props, x.created_at
         from jsonb_to_recordset($1::jsonb) as x(email text, name text, props jsonb, created_at timestamptz)
         left join profiles p on p.email = x.email`,
      [JSON.stringify(events)],
    );

  // Reminders were planned with default settings during the seed; replan with each student's own.
  for (const { id } of await q<{ id: string }>(`select id from profiles where role = 'student'`)) await recomputeForStudent(q, id, now);

  return {
    people: people.length,
    telegramKept: people.filter((p) => p.telegram_chat_id).length,
    passwordsKept: people.filter((p) => p.password_hash).length,
    eventsKept: events.length,
  };
}
