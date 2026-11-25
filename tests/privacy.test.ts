import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { seed } from "../lib/db/seed";
import { MAIN_STUDENT } from "../lib/db/accounts";
import { approveApplication } from "../lib/db/applications";
import { resetDemo } from "../lib/db/demo-reset";
import { notify } from "../lib/notifications/notify";
import { activeConsent, exportPersonalData, recordConsent, runRetention, withdrawConsent } from "../lib/privacy";
import { PRIVACY_VERSION, RETENTION_DAYS, privacyDoc } from "../lib/legal/privacy";
import { termsDoc } from "../lib/legal/terms";
import { classify, type LicenceReport } from "../lib/legal/licenses";
import { DAY, HOUR } from "../lib/time";

const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
let db: Db;
let students: { id: string; email: string }[] = [];
let main: { id: string; email: string };

beforeAll(async () => {
  db = await createDb(undefined, null);
  await db.tx((q) => seed(q, NOW, () => "Seed-pass-1234"));
  students = await db.q<{ id: string; email: string }>(`select id, email from profiles where role = 'student' order by email`);
  main = students.find((s) => s.email === MAIN_STUDENT)!;
});

/** Runs fn as the signed-in user would: role uni_app with RLS on. */
const asUser = <T>(userId: string, fn: (q: Db["q"]) => Promise<T>) =>
  db.tx(async (q) => {
    await q(`select set_config('app.user_id', $1, true)`, [userId]);
    await q(`set local role uni_app`);
    return fn(q);
  });

describe("least privilege on profiles", () => {
  it("lets a user read names and emails RLS allows", async () => {
    const rows = await asUser(main.id, (q) => q<{ full_name: string }>(`select id, email, full_name, role, locale from profiles where id = $1`, [main.id]));
    expect(rows[0].full_name).toBeTruthy();
  });

  it.each(["password_hash", "ics_token", "telegram_chat_id", "canvas_feed_url", "session_version", "consent_withdrawn_at"])(
    "never exposes %s, not even the user's own",
    async (column) => {
      await expect(asUser(main.id, (q) => q(`select ${column} from profiles where id = $1`, [main.id]))).rejects.toThrow(/permission denied/);
    },
  );

  it("keeps consent records server-only", async () => {
    await expect(asUser(main.id, (q) => q(`select * from consents`))).rejects.toThrow(/permission denied/);
  });
});

describe("consent", () => {
  it("is recorded with version, source and network details", async () => {
    const s = students[1];
    expect(await activeConsent(db.q, s.id)).toBeNull();
    const wasWithdrawn = await recordConsent(db.q, s.id, { ip: "10.0.0.7", userAgent: "Test/1.0" });
    expect(wasWithdrawn).toBe(false);
    const c = await activeConsent(db.q, s.id);
    expect(c).toMatchObject({ version: PRIVACY_VERSION, source: "signin" });
    const [row] = await db.q(`select ip, user_agent from consents where profile_id = $1`, [s.id]);
    expect(row).toEqual({ ip: "10.0.0.7", user_agent: "Test/1.0" });
  });

  it("withdrawal stops messages, unlinks Telegram, rotates the calendar token and signs out everywhere", async () => {
    const s = students[2];
    await recordConsent(db.q, s.id);
    await db.q(`update profiles set telegram_chat_id = 777001 where id = $1`, [s.id]);
    const [before] = await db.q<{ ics_token: string; session_version: number }>(`select ics_token, session_version from profiles where id = $1`, [s.id]);
    await db.q(`insert into notifications (user_id, kind, title, deliver) values ($1, 'digest', 'queued', true)`, [s.id]);

    await withdrawConsent(db.q, s.id, NOW);

    expect(await activeConsent(db.q, s.id)).toBeNull();
    const [after] = await db.q(
      `select telegram_chat_id, ics_token, session_version, consent_withdrawn_at is not null as paused from profiles where id = $1`,
      [s.id],
    );
    expect(after.telegram_chat_id).toBeNull();
    expect(after.ics_token).not.toBe(before.ics_token);
    expect(after.session_version).toBe(before.session_version + 1);
    expect(after.paused).toBe(true);
    const [queued] = await db.q(`select deliver from notifications where user_id = $1 and title = 'queued'`, [s.id]);
    expect(queued.deliver).toBe(false);

    // Nothing new reaches a person who withdrew consent…
    expect(await notify(db.q, [s.id, students[3].id], "digest", { classes: 0, deadlines: 0, lines: [] })).toBe(1);
    // …until they agree again.
    expect(await recordConsent(db.q, s.id)).toBe(true);
    expect(await notify(db.q, [s.id], "digest", { classes: 0, deadlines: 0, lines: [] })).toBe(1);
  });

  it("comes from the application form for self-registered teachers", async () => {
    const [group] = await db.q<{ id: string }>(`select id from groups order by name limit 1`);
    const [advisor] = await db.q<{ id: string }>(`select id from profiles where role = 'advisor' limit 1`);
    const subjects = [{ title: "Право ИС", code: "IP101", credits: 5, slots: [{ group_id: group.id, weekday: 2, start: "17:00", room: "" }] }];
    const [app] = await db.q<{ id: string }>(
      `insert into teacher_applications (email, full_name, password_hash, subjects, starts_on, ends_on, ip, consent_version, created_at)
       values ('ip.teacher@example.com', 'Айгерим Сапарова', 'x', $1::jsonb, $2, $3, '192.0.2.10', $4, $5) returning id`,
      [JSON.stringify(subjects), NOW.toISOString().slice(0, 10), new Date(NOW.getTime() + 30 * DAY).toISOString().slice(0, 10), PRIVACY_VERSION, ago(2)],
    );
    const r = await db.tx((q) => approveApplication(q, app.id, advisor.id, NOW));
    expect(r.ok).toBe(true);
    const [c] = await db.q(`select version, source, ip from consents where profile_id = $1`, [r.ok ? r.profileId : ""]);
    expect(c).toEqual({ version: PRIVACY_VERSION, source: "application", ip: "192.0.2.10" });
  });

  it("survives a demo reset", async () => {
    const s = students[1];
    const n = async () =>
      (await db.q<{ n: number }>(`select count(*)::int as n from consents c join profiles p on p.id = c.profile_id where p.email = $1`, [s.email]))[0].n;
    const before = await n();
    expect(before).toBeGreaterThan(0);
    await db.tx((q) => resetDemo(q, NOW, () => "Seed-pass-1234"));
    expect(await n()).toBe(before);
    // Profiles get new ids in a reset: refresh ours.
    students = await db.q<{ id: string; email: string }>(`select id, email from profiles where role = 'student' order by email`);
    main = students.find((x) => x.email === MAIN_STUDENT)!;
  });
});

describe("retention", () => {
  it("deletes or de-identifies only what is past its term", async () => {
    const s = main;
    await db.q(
      `insert into login_attempts (email, ip, ok, created_at) values ($1, '198.51.100.1', true, $2), ($1, '198.51.100.2', true, $3)`,
      [s.email, ago(RETENTION_DAYS.signIns + 10), ago(10)],
    );
    await db.q(`insert into magic_links (token, email, expires_at) values ('old-link', $1, $2), ('fresh-link', $1, $3)`, [
      s.email,
      ago(3),
      new Date(NOW.getTime() + HOUR).toISOString(),
    ]);
    const sessions = await db.q<{ id: string }>(
      `select cs.id from class_sessions cs join group_members gm on gm.group_id = cs.group_id
        where gm.student_id = $1 and not exists (select 1 from excuses e where e.session_id = cs.id and e.student_id = $1)
        order by cs.starts_at limit 2`,
      [s.id],
    );
    await db.q(
      `insert into excuses (session_id, student_id, reason, file, file_type, file_name, status, reviewed_at)
       values ($1, $3, 'old', '\\x01'::bytea, 'image/png', 'old.png', 'approved', $4),
              ($2, $3, 'recent', '\\x02'::bytea, 'image/png', 'recent.png', 'approved', $5)`,
      [sessions[0].id, sessions[1].id, s.id, ago(RETENTION_DAYS.certificates + 5), ago(5)],
    );
    await db.q(
      `insert into teacher_applications (email, full_name, password_hash, subjects, starts_on, ends_on, status, reviewed_at, ip, created_at)
       values ('old.reject@example.com', 'A', 'h', '[]', '2026-09-01', '2026-12-01', 'rejected', $1, '203.0.113.1', $1),
              ('new.reject@example.com', 'B', 'h', '[]', '2026-09-01', '2026-12-01', 'rejected', $2, '203.0.113.2', $2)`,
      [ago(RETENTION_DAYS.rejectedApplications + 5), ago(3)],
    );
    await db.q(
      `insert into notifications (user_id, kind, title, read_at, created_at) values ($1, 'digest', 'old-read', $2, $2), ($1, 'digest', 'new-read', $3, $3)`,
      [s.id, ago(RETENTION_DAYS.readNotifications + 5), ago(5)],
    );
    await db.q(`insert into events (user_id, name, created_at) values ($1, 'old_event', $2), ($1, 'new_event', $3)`, [
      s.id,
      ago(RETENTION_DAYS.identifiedEvents + 5),
      ago(5),
    ]);

    const r = await db.tx((q) => runRetention(q, NOW));
    expect(r.signIns).toBeGreaterThanOrEqual(1);
    expect(r.certificates).toBeGreaterThanOrEqual(1);

    const ips = (await db.q<{ ip: string }>(`select ip from login_attempts where email = $1`, [s.email])).map((x) => x.ip);
    expect(ips).toEqual(["198.51.100.2"]);
    const links = (await db.q<{ token: string }>(`select token from magic_links`)).map((x) => x.token);
    expect(links).toContain("fresh-link");
    expect(links).not.toContain("old-link");
    const excuses = await db.q(`select reason, file is not null as has_file, file_name, file_deleted_at is not null as deleted, status from excuses where student_id = $1 and reason in ('old', 'recent') order by reason`, [s.id]);
    expect(excuses).toEqual([
      { reason: "old", has_file: false, file_name: null, deleted: true, status: "approved" },
      { reason: "recent", has_file: true, file_name: "recent.png", deleted: false, status: "approved" },
    ]);
    const apps = (await db.q<{ email: string }>(`select email from teacher_applications where status = 'rejected'`)).map((x) => x.email);
    expect(apps).toEqual(["new.reject@example.com"]);
    const titles = (await db.q<{ title: string }>(`select title from notifications where user_id = $1 and title like '%-read'`, [s.id])).map((x) => x.title);
    expect(titles).toEqual(["new-read"]);
    const events = await db.q(`select name, user_id is not null as linked from events where name in ('old_event', 'new_event') order by name`);
    expect(events).toEqual([
      { name: "new_event", linked: true },
      { name: "old_event", linked: false },
    ]);
    // Idempotent: a second run finds nothing more of this.
    const again = await db.tx((q) => runRetention(q, NOW));
    expect(again.certificates + again.applications + again.notifications).toBe(0);
  });

  it("clears non-academic data after the grace period of a withdrawal, keeping grades", async () => {
    const [late, early] = [students[4], students[5]];
    for (const s of [late, early]) await recordConsent(db.q, s.id);
    await withdrawConsent(db.q, late.id, new Date(NOW.getTime() - (RETENTION_DAYS.afterWithdrawal + 6) * DAY));
    await withdrawConsent(db.q, early.id, new Date(NOW.getTime() - 3 * DAY));
    for (const s of [late, early]) {
      await db.q(`insert into notifications (user_id, kind, title) values ($1, 'digest', 'kept?')`, [s.id]);
      await db.q(`insert into events (user_id, name) values ($1, 'grace_event')`, [s.id]);
    }
    const gradesBefore = (await db.q<{ n: number }>(`select count(*)::int as n from grades where student_id = $1`, [late.id]))[0].n;

    await db.tx((q) => runRetention(q, NOW));

    const left = async (id: string) => (await db.q<{ n: number }>(`select count(*)::int as n from notifications where user_id = $1`, [id]))[0].n;
    expect(await left(late.id)).toBe(0);
    expect(await left(early.id)).toBeGreaterThan(0);
    const linked = async (id: string) => (await db.q<{ n: number }>(`select count(*)::int as n from events where user_id = $1`, [id]))[0].n;
    expect(await linked(late.id)).toBe(0);
    expect(await linked(early.id)).toBeGreaterThan(0);
    expect((await db.q<{ n: number }>(`select count(*)::int as n from grades where student_id = $1`, [late.id]))[0].n).toBe(gradesBefore);
  });
});

describe("download my data", () => {
  it("contains the person's records and none of their secrets", async () => {
    await recordConsent(db.q, main.id);
    const [secret] = await db.q<{ password_hash: string; ics_token: string }>(`select password_hash, ics_token from profiles where id = $1`, [main.id]);
    const data = await exportPersonalData(db.q, main.id, "ru", NOW);
    expect(data).not.toBeNull();
    expect(data!.profile).toMatchObject({ email: MAIN_STUDENT, role: "student" });
    expect(data!.profile).not.toHaveProperty("password_hash");
    expect(data!.grades.length).toBeGreaterThan(0);
    expect(data!.attendance.length).toBeGreaterThan(0);
    expect(data!.consents.length).toBeGreaterThan(0);
    const json = JSON.stringify(data);
    expect(json).not.toContain(secret.password_hash);
    expect(json).not.toContain(secret.ics_token);
    // Only their own rows: no other student's email anywhere.
    expect(json).not.toContain(students.find((s) => s.id !== main.id)!.email);
  });

  it("returns null for an unknown person", async () => {
    expect(await exportPersonalData(db.q, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("legal texts", () => {
  it.each(["ru", "kk", "en"] as const)("%s privacy policy and terms have the same sections", (locale) => {
    expect(privacyDoc(locale).sections.map((s) => s.id)).toEqual(privacyDoc("ru").sections.map((s) => s.id));
    expect(termsDoc(locale).sections.map((s) => s.id)).toEqual(termsDoc("ru").sections.map((s) => s.id));
  });

  it("quotes the retention terms the code enforces", () => {
    const text = JSON.stringify(privacyDoc("ru"));
    for (const d of [RETENTION_DAYS.certificates, RETENTION_DAYS.signIns, RETENTION_DAYS.readNotifications, RETENTION_DAYS.identifiedEvents])
      expect(text).toContain(`${d} дней`);
  });
});

describe("open-source licences", () => {
  it.each([
    ["MIT", "permissive"],
    ["(MIT OR GPL-3.0-or-later)", "permissive"],
    ["Apache-2.0 AND LGPL-3.0-or-later", "weak"],
    ["CC-BY-4.0", "data"],
    ["GPL-3.0-only", "forbidden"],
    ["AGPL-3.0", "forbidden"],
    ["MIT AND GPL-2.0", "forbidden"],
    ["SEE LICENSE IN LICENSE.txt", "unknown"],
    ["", "unknown"],
  ])("%s is %s", (expr, kind) => {
    expect(classify(expr)).toBe(kind);
  });

  it("ships no copyleft or unlicensed package", () => {
    const report = JSON.parse(readFileSync("lib/legal/licenses.json", "utf8")) as LicenceReport;
    expect(report.packages.length).toBeGreaterThan(50);
    expect(report.summary.forbidden).toBe(0);
    expect(report.summary.unknown).toBe(0);
  });
});
