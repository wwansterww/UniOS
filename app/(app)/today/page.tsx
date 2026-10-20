import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ScanLine, Bell, CalendarCheck, CalendarClock, ChevronRight, ClipboardList, GraduationCap, Megaphone, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { announcements, myAttendance, myGrades, myGroups, notifications, registrationWindows, sessionsBetween, studentDeadlines } from "@/lib/queries";
import { absenceAllowance, absenceRisk, courseScore, currentTerm, fmtGpa, gpa } from "@/lib/journal";
import { renderNotification } from "@/lib/notifications/render";
import { DAY, dateKey, formatDay, formatLongDay, formatTime, startOfDay, zoned } from "@/lib/time";
import { Badge, Card, Empty, PageTitle, SectionTitle, buttonClass } from "@/components/ui";
import { Change, Countdown, DeadlineItem } from "@/components/bits";
import { MarkAllRead } from "@/components/client-buttons";
import { XMark } from "@/components/logo";
import { CountUp } from "@/components/count-up";
import { NowLine } from "@/components/now-line";

const minuteOfDay = (d: Date) => {
  const p = zoned(d);
  return p.hour * 60 + p.minute;
};

const kindIcon = (kind: string): LucideIcon =>
  kind.startsWith("class_") || kind === "room_changed"
    ? CalendarClock
    : kind.startsWith("deadline_")
      ? ClipboardList
      : kind.startsWith("reg_")
        ? CalendarCheck
        : kind === "announcement" || kind === "read_reminder"
          ? Megaphone
          : kind === "grade_new"
            ? GraduationCap
            : Bell;

export const metadata: Metadata = { title: "Сегодня" };

export default async function TodayPage() {
  const user = await requireUser("student");
  const { t, locale } = await getT();
  const now = new Date();
  const dayStart = startOfDay(now);
  const [groups, upcoming, today, deadlines, inbox, anns, windows, grades, attendance] = await Promise.all([
    myGroups(user),
    sessionsBetween(user, now, new Date(now.getTime() + 7 * DAY)),
    sessionsBetween(user, dayStart, new Date(dayStart.getTime() + DAY)),
    studentDeadlines(user, { from: new Date(now.getTime() - 3 * DAY), to: new Date(now.getTime() + 7 * DAY) }),
    notifications(user, { unreadOnly: true, excludeReminders: true, limit: 6 }),
    announcements(user, { unreadOnly: true }),
    registrationWindows(user),
    myGrades(user),
    myAttendance(user),
  ]);
  const active = upcoming.filter((s) => s.status !== "cancelled");
  const next = active[0] ?? null;
  const later = active.slice(1, 4);
  const todo = deadlines.filter((d) => !d.done_at);
  const week = todo.filter((d) => new Date(d.due_at) >= now);
  const overdue = todo.filter((d) => new Date(d.due_at) < now);
  const classesToday = today.filter((s) => s.status !== "cancelled").length;
  const dueToday = week.filter((d) => new Date(d.due_at).getTime() < dayStart.getTime() + DAY).length;
  const reg = windows.find((w) => new Date(w.closes_at) > now);
  // Announcements already shown as an unread notification aren't repeated.
  const shownAnn = new Set(inbox.map((n) => n.payload.announcementId).filter(Boolean));
  const extraAnns = anns.filter((a) => !shownAnn.has(a.id)).slice(0, 3);
  const live = next && new Date(next.starts_at) <= now;

  // Greeting by time of day in Almaty, with the name set in Narxoz red.
  const hour = zoned(now).hour;
  const greet = hour >= 5 && hour < 12 ? t.today.greetMorning : hour < 17 && hour >= 12 ? t.today.greetDay : hour >= 17 && hour < 23 ? t.today.greetEvening : t.today.greetNight;
  const [greetBefore, greetAfter] = greet("\u0000").split("\u0000");
  const myGpa = gpa(grades.filter((c) => c.term === currentTerm(now)).map((c) => ({ score: courseScore(c.works), credits: c.credits })));
  // Courses where at most one more absence is allowed (25% rule), most urgent first.
  const absenceAlerts = attendance
    .filter((c) => c.planned > 0)
    .map((c) => {
      const absent = c.marks.filter((m) => m.status === "absent").length;
      const allowed = absenceAllowance(c.planned);
      return { ...c, absent, allowed, risk: absenceRisk(absent, allowed) };
    })
    .filter((c) => c.risk !== "ok")
    .sort((a, b) => a.allowed - a.absent - (b.allowed - b.absent));
  const stats: { label: string; value: number; text?: string; icon: LucideIcon; href: string; note?: string }[] = [
    { label: t.today.statClasses, value: classesToday, icon: CalendarClock, href: "/schedule" },
    { label: t.today.statDeadlines, value: week.length, icon: ClipboardList, href: "/deadlines", note: overdue.length ? `${t.deadlines.overdue}: ${overdue.length}` : undefined },
    { label: t.today.statGpa, value: 0, text: myGpa != null ? fmtGpa(myGpa) : "—", icon: GraduationCap, href: "/grades" },
  ];

  // Timeline of the next class's day (08:00 → last class).
  const nextDay = next ? dateKey(new Date(next.starts_at)) : "";
  const daySessions = next
    ? (nextDay === dateKey(now) ? today : upcoming).filter((s) => s.status !== "cancelled" && dateKey(new Date(s.starts_at)) === nextDay)
    : [];
  const tlFrom = 8 * 60;
  const tlTo = Math.max(19 * 60, ...daySessions.map((s) => Math.ceil(minuteOfDay(new Date(s.ends_at)) / 60) * 60));
  const pct = (m: number) => `${((m - tlFrom) / (tlTo - tlFrom)) * 100}%`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        meta={[<span key="d" className="capitalize">{formatLongDay(now, locale)}</span>, ...groups.map((g) => g.name)]}
        sub={t.today.summary(classesToday, dueToday)}
      >
        {greetBefore}
        <span className="text-accent">{user.full_name.split(" ")[0]}</span>
        {greetAfter}
      </PageTitle>

      {groups.length === 0 && (
        <Card className="mb-10 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t.today.joinGroup}</p>
          <Link href="/profile#groups" className={buttonClass("primary", "sm")}>
            {t.today.toProfile} <ArrowRight size={14} />
          </Link>
        </Card>
      )}

      {/* Day at a glance */}
      <div className="fade-up mb-6 grid grid-cols-3 gap-2 sm:gap-3" style={{ "--i": 1 } as React.CSSProperties}>
        {stats.map((x) => (
          <Link key={x.label} href={x.href} className="spotlight lift rounded-2xl border border-border bg-surface px-4 py-4 shadow-card sm:px-5 sm:py-5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-soft text-accent sm:h-9 sm:w-9">
              <x.icon size={17} />
            </span>
            <p className="mt-4 font-display text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.5rem]">
              {x.text ?? <CountUp value={x.value} />}
            </p>
            <p className="mt-2 text-[12px] leading-tight text-muted sm:text-[13px]">{x.label}</p>
            {x.note && <p className="mt-1 text-[12px] font-medium text-danger">{x.note}</p>}
          </Link>
        ))}
      </div>

      {absenceAlerts.length > 0 && (
        <div className="fade-up mb-6 space-y-2" style={{ "--i": 1 } as React.CSSProperties}>
          {absenceAlerts.map((c) => (
            <Link
              key={c.id}
              href="/attendance"
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors sm:px-5 ${
                c.risk === "over" ? "border-danger/30 bg-danger-soft text-danger" : "border-warn/30 bg-warn-soft text-warn"
              }`}
            >
              <AlertTriangle size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{c.title}</b> ·{" "}
                {c.risk === "over" ? t.attendance.over(c.absent - c.allowed) : c.allowed - c.absent === 1 ? t.attendance.lastOne : t.attendance.atLimit}
              </span>
              <span className="shrink-0 text-[13px] font-medium tabular-nums">{t.attendance.nb(c.absent, c.allowed)}</span>
            </Link>
          ))}
        </div>
      )}

      {/* 1. Next class — the one bold surface on the page */}
      <section className="fade-up mb-14" style={{ "--i": 2 } as React.CSSProperties}>
        {next ? (
          <div className="hero-red spotlight spotlight-light relative overflow-hidden rounded-[1.75rem] text-white">
            <XMark className="pointer-events-none absolute -bottom-10 -right-6 h-72 w-72 text-white/[0.07]" />
            <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-white/75">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-medium text-white">{live ? t.today.now : t.today.nextClass}</span>
                  <span className="capitalize">{formatDay(new Date(next.starts_at), locale)}</span>
                  {next.status === "moved" && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#c41233]">{t.schedule.moved}</span>}
                </p>
                <p className="mt-4 font-display text-[2rem] font-semibold leading-[1.05] tracking-tight sm:text-[2.6rem]">{next.course_title}</p>
                <p className="mt-3 text-[15px] text-white/80">
                  {formatTime(new Date(next.starts_at), locale)}–{formatTime(new Date(next.ends_at), locale)} · {t.common.room} {next.room} · {next.teacher_name}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <div className="rounded-2xl bg-white px-5 py-3 text-[#c41233] shadow-[0_12px_24px_-12px_rgba(60,0,10,0.5)]">
                  <p className="font-display text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                    {live ? (
                      <Countdown to={new Date(next.ends_at).toISOString()} wrap="endsIn" />
                    ) : (
                      <Countdown to={new Date(next.starts_at).toISOString()} wrap="startsIn" />
                    )}
                  </p>
                </div>
                {live && (
                  <Link href="/checkin" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25">
                    <ScanLine size={16} /> {t.today.checkin}
                  </Link>
                )}
              </div>
            </div>
            {/* Day timeline */}
            {daySessions.length > 0 && (
              <div className="relative px-6 pb-6 sm:px-8 sm:pb-7">
                <div className="relative h-2 rounded-full bg-white/15">
                  {daySessions.map((s) => {
                    const a = minuteOfDay(new Date(s.starts_at));
                    const b = minuteOfDay(new Date(s.ends_at));
                    return (
                      <span
                        key={s.id}
                        title={`${formatTime(new Date(s.starts_at), locale)} ${s.course_title}`}
                        className={`absolute inset-y-0 rounded-full ${s.id === next.id ? "bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]" : "bg-white/45"}`}
                        style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }}
                      />
                    );
                  })}
                  {nextDay === dateKey(now) && (
                    <div className="absolute -inset-y-1.5 inset-x-0">
                      <NowLine fromMinute={tlFrom} toMinute={tlTo} pxPerMinute={0} percent />
                    </div>
                  )}
                </div>
                <div className="relative mt-2 h-4 text-[11px] tabular-nums text-white/60">
                  {Array.from({ length: Math.floor((tlTo - tlFrom) / 120) + 1 }, (_, i) => tlFrom + i * 120).map((m, i, all) => (
                    <span
                      key={m}
                      className={`absolute ${i === 0 ? "" : i === all.length - 1 && m === tlTo ? "-translate-x-full" : "-translate-x-1/2"}`}
                      style={{ left: pct(m) }}
                    >
                      {String(m / 60).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
              </div>
            )}
            {later.length > 0 && (
              <ul className="relative border-t border-white/15 bg-black/10">
                {later.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-white/10 px-6 py-3 last:border-b-0 sm:gap-4 sm:px-8">
                    <span className="w-[4.25rem] shrink-0 text-[13px] capitalize tabular-nums text-white/65 sm:w-24">
                      {formatDay(new Date(s.starts_at), locale).split(",")[0]} {formatTime(new Date(s.starts_at), locale)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/95">{s.course_title}</span>
                    <span className="shrink-0 text-[13px] text-white/65">{s.room}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Empty title={t.today.noClasses} />
        )}
      </section>

      {/* 2. Deadlines */}
      <section className="fade-up mb-14" style={{ "--i": 3 } as React.CSSProperties}>
        <SectionTitle
          action={
            <Link href="/deadlines" className="text-[13px] text-muted hover:text-fg">
              {t.today.allDeadlines}
            </Link>
          }
        >
          {t.today.deadlines7}
          {week.length + overdue.length > 0 && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-xs font-medium text-muted">{week.length + overdue.length}</span>}
        </SectionTitle>
        {week.length + overdue.length === 0 ? (
          <Empty title={t.today.noDeadlines} />
        ) : (
          <div className="space-y-2">
            {[...overdue, ...week].map((d) => (
              <DeadlineItem key={d.id} d={{ ...d, due_at: new Date(d.due_at).toISOString(), done: !!d.done_at }} />
            ))}
          </div>
        )}
      </section>

      {/* 3. Changes and announcements */}
      <section className="fade-up mb-14" style={{ "--i": 4 } as React.CSSProperties}>
        <SectionTitle action={inbox.length > 0 && <MarkAllRead ids={inbox.map((n) => n.id)} />}>{t.today.changes}</SectionTitle>
        {inbox.length + extraAnns.length === 0 ? (
          <Empty title={t.today.noChanges} />
        ) : (
          <Card className="overflow-hidden p-0 sm:p-0">
            <ul>
              {inbox.map((n) => {
                const r = renderNotification(t, locale, n.kind, n.payload);
                const Icon = kindIcon(n.kind);
                const loud = n.payload.important || n.kind.startsWith("class_") || n.kind === "deadline_moved";
                return (
                  <li key={n.id} className="border-b border-border last:border-b-0">
                    <Link href={n.link ?? "/notifications"} className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2 sm:px-6">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${loud ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{r.title}</span>
                        <span className="block text-sm text-muted">{r.body.split("\n")[0]}</span>
                        {(r.from || r.to) && (
                          <span className="mt-1 block">
                            <Change from={r.from} to={r.to} />
                          </span>
                        )}
                      </span>
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
              {extraAnns.map((a) => (
                <li key={a.id} className="border-b border-border last:border-b-0">
                  <Link href={`/announcements#${a.id}`} className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2 sm:px-6">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.is_important ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
                      <Megaphone size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-muted">{a.course_title}</span>
                      <span className="block text-sm font-medium">{a.title}</span>
                    </span>
                    {a.is_important && <Badge tone="solid">{t.ann.important}</Badge>}
                    <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Link href="/announcements" className="ml-auto mt-3 flex w-fit items-center gap-1 text-[13px] text-muted hover:text-fg">
          {t.ann.title} <ChevronRight size={14} />
        </Link>
      </section>

      {/* 4. Course registration */}
      {reg && (
        <section>
          <SectionTitle>{t.nav.registration}</SectionTitle>
          <Link href="/registration" className="spotlight lift flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-card sm:px-6">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <CalendarCheck size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{reg.title}</span>
              <span className="block text-[13px] text-muted">
                {new Date(reg.opens_at) <= now ? (
                  <Countdown to={new Date(reg.closes_at).toISOString()} wrap="closesIn" />
                ) : (
                  <Countdown to={new Date(reg.opens_at).toISOString()} wrap="opensIn" />
                )}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Link>
        </section>
      )}
    </div>
  );
}
