import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed } from "../lib/db/seed";
import { MAIN_STUDENT } from "../lib/db/accounts";
import { appTables, resetDemo } from "../lib/db/demo-reset";
import { HOUR, DAY, fromZoned } from "../lib/time";

const OLD = fromZoned(2026, 10, 19, 10, 0);
const NEW = new Date(OLD.getTime() + 3 * DAY);
const pw = () => "Seed-pass-1234";
let db: Db;
let seedEventsBefore = 0;

beforeAll(async () => {
  db = await createDb(undefined, null);
  await db.tx((q) => seed(q, OLD, pw));
  const [s] = await db.q<{ id: string }>(`select id from profiles where email = $1`, [MAIN_STUDENT]);
  // What the person did on the live site: linked Telegram, changed password, chose reminders, used the app.
  await db.q(`update profiles set telegram_chat_id = 4242, password_hash = 'changed-hash', locale = 'kk' where id = $1`, [s.id]);
  await db.q(`update notification_prefs set offsets_minutes = '{60}' where user_id = $1`, [s.id]);
  await db.q(`insert into events (user_id, name, props) values ($1, 'deadline_open', '{"ms_since_open": 9000}')`, [s.id]);
  seedEventsBefore = (await db.q<{ n: number }>(`select count(*)::int as n from events where props->>'seed' = 'true'`))[0].n;
  await db.tx((q) => resetDemo(q, NEW, pw));
});

describe("demo reset", () => {
  it("only empties tables our migrations created", () => {
    expect(appTables()).toContain("deadlines");
    expect(appTables()).not.toContain("_migrations");
  });

  it("rebuilds the semester around the new date", async () => {
    const [d] = await db.q<{ due_at: Date }>(`select due_at from deadlines where due_at > $1 order by due_at limit 1`, [NEW.toISOString()]);
    expect(new Date(d.due_at).getTime() - NEW.getTime()).toBeLessThanOrEqual(2 * HOUR);
  });

  it("keeps accounts, Telegram link, password, language and settings", async () => {
    const [{ n }] = await db.q<{ n: number }>(`select count(*)::int as n from profiles`);
    expect(n).toBe(16);
    const [p] = await db.q(`select p.telegram_chat_id::text as tg, p.password_hash, p.locale, np.offsets_minutes from profiles p
                             join notification_prefs np on np.user_id = p.id where p.email = $1`, [MAIN_STUDENT]);
    expect(p).toMatchObject({ tg: "4242", password_hash: "changed-hash", locale: "kk", offsets_minutes: [60] });
  });

  it("replans reminders with the student's own settings", async () => {
    const rows = await db.q(
      `select r.offset_minutes from reminders r join profiles p on p.id = r.student_id where p.email = $1 and r.sent_at is null and r.offset_minutes > 0`,
      [MAIN_STUDENT],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.offset_minutes === 60)).toBe(true);
  });

  it("keeps real usage events and doesn't pile up seeded ones", async () => {
    const [{ real }] = await db.q<{ real: number }>(`select count(*)::int as real from events where coalesce(props->>'seed', '') <> 'true' and name = 'deadline_open'`);
    const [{ seeded }] = await db.q<{ seeded: number }>(`select count(*)::int as seeded from events where props->>'seed' = 'true'`);
    expect(real).toBe(1);
    expect(seeded).toBe(seedEventsBefore);
  });
});
