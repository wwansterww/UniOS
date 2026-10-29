"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { allowedDomain } from "@/lib/auth";
import { dictionaries, isLocale, type Dict } from "@/lib/i18n";
import { pairLabel, parseApplication, problemStep, type Problem } from "@/lib/applications";
import { applicationLimit, insertApplication } from "@/lib/db/applications";
import { notify } from "@/lib/notifications/notify";
import { logEvent } from "@/lib/reminders/engine";
import { dispatchNow } from "@/lib/jobs";
import { dateKey } from "@/lib/time";

/** step: where the form shows the message (0 account, 1 subjects and timetable, 2 review). */
export type ApplyResult = { ok: true } | { ok: false; message: string; step: number };

function problemText(t: Dict, p: Problem): string {
  const when = (weekday: number, start: string) => `${t.apply.days[weekday]} ${pairLabel(start)}`;
  switch (p.code) {
    case "name":
      return t.apply.errName;
    case "email":
      return t.apply.errEmail;
    case "short":
      return t.profile.passwordShort;
    case "weak":
      return t.profile.passwordWeak;
    case "personal":
      return t.profile.passwordPersonal;
    case "subjects":
      return t.apply.errSubjects;
    case "title":
      return t.apply.errTitle(p.subject);
    case "slots":
      return t.apply.errSlots(p.subject);
    case "group":
      return t.apply.errGroup;
    case "dates":
      return t.apply.errDates;
    case "clash":
      return t.apply.errClash(p.group, when(p.weekday, p.start));
    case "twoRooms":
      return t.apply.errTwoRooms(when(p.weekday, p.start));
  }
}

/**
 * A teacher's application from the public registration page. Anyone can send one, so everything is checked
 * again here, sending is limited per address and email, and nothing is created until an advisor approves.
 */
export async function submitApplication(draft: unknown): Promise<ApplyResult> {
  const c = (await cookies()).get("locale")?.value;
  const t = dictionaries[isLocale(c) ? c : "ru"];
  // A field people never see: bots fill it in. They get the success screen and nothing is stored.
  if (draft && typeof draft === "object" && (draft as { website?: unknown }).website) return { ok: true };

  const d = await db();
  const groups = new Map((await d.q<{ id: string; name: string }>(`select id, name from groups`)).map((g) => [g.id, g.name]));
  const parsed = parseApplication(draft, { groups, today: dateKey(new Date()) });
  if (!parsed.ok) return { ok: false, message: problemText(t, parsed.problem), step: problemStep(parsed.problem) };
  const a = parsed.value;

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim().slice(0, 64);
  const limit = await applicationLimit(d.q, a.email, ip);
  if (limit) return { ok: false, message: limit === "full" ? t.apply.closed : t.apply.limit, step: 2 };
  const [account] = await d.q(`select 1 from profiles where email = $1`, [a.email]);
  if (account) return { ok: false, message: t.apply.taken, step: 0 };

  const hash = await bcrypt.hash(a.password, 10);
  const id = await d.tx(async (q) => {
    const id = await insertApplication(q, a, hash, ip);
    if (!id) return null;
    const advisors = await q<{ id: string }>(`select id from profiles where role = 'advisor' and disabled_at is null`);
    await notify(
      q,
      advisors.map((r) => r.id),
      "application_new",
      { teacher: a.full_name, title: a.subjects.map((s) => s.title).join(", ") },
      { link: "/advisor/applications" },
    );
    await logEvent(q, null, "teacher_application_created", { id, outside: !a.email.endsWith("@" + allowedDomain()) });
    return id;
  });
  if (!id) return { ok: false, message: t.apply.pendingExists, step: 0 };
  after(() => dispatchNow(d));
  return { ok: true };
}
