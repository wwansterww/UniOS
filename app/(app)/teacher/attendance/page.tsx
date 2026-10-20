import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { attendanceProgress, sessionRoster, sessionsBetween, teacherExcuses } from "@/lib/queries";
import { MIN, addDays, dateKey, formatLongDay, formatTime, fromZoned, startOfDay } from "@/lib/time";
import { Badge, Empty, PageTitle, Tabs, buttonClass, cn } from "@/components/ui";
import { Roster } from "./roster";
import { AttendanceSummary } from "./summary";
import { Excuses } from "./excuses";

export const metadata: Metadata = { title: "Посещаемость" };

const started = (s: { starts_at: Date }, now: Date) => new Date(s.starts_at).getTime() - 30 * MIN <= now.getTime();

export default async function TeacherAttendancePage({ searchParams }: PageProps<"/teacher/attendance">) {
  const user = await requireUser("teacher");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const now = new Date();
  const excuses = await teacherExcuses(user);
  const waiting = excuses.filter((e) => e.status === "pending").length;
  const view = sp.view === "summary" || sp.view === "excuses" ? sp.view : "mark";
  const tabs = (
    <Tabs
      className="mb-5"
      items={[
        { href: "/teacher/attendance", label: t.attendance.tabMark, active: view === "mark" },
        { href: "/teacher/attendance?view=summary", label: t.attendance.tabSummary, active: view === "summary" },
        {
          href: "/teacher/attendance?view=excuses",
          label: (
            <>
              {t.attendance.tabExcuses}
              {waiting > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-accent-fg">{waiting}</span>}
            </>
          ),
          active: view === "excuses",
        },
      ]}
    />
  );

  if (view !== "mark")
    return (
      <div className="mx-auto max-w-3xl">
        <PageTitle>{t.attendance.title}</PageTitle>
        {tabs}
        {view === "summary" ? <AttendanceSummary user={user} t={t} course={sp.course} group={sp.group} /> : <Excuses rows={excuses} t={t} locale={locale} />}
      </div>
    );

  const picked = typeof sp.session === "string" ? await sessionRoster(user, sp.session) : null;
  const m = typeof sp.day === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(sp.day) : null;
  const day = picked ? startOfDay(new Date(picked.session.starts_at)) : m ? fromZoned(+m[1], +m[2], +m[3]) : startOfDay(now);
  const classes = await sessionsBetween(user, day, addDays(day, 1));
  // Without a choice: the class going on now (or the last one that started), else the first of the day.
  const active = classes.filter((s) => s.status !== "cancelled");
  const fallback = [...active].reverse().find((s) => started(s, now)) ?? active[0] ?? classes[0];
  const [current, progress] = await Promise.all([
    picked ?? (fallback ? sessionRoster(user, fallback.id) : null),
    attendanceProgress(user, classes.map((s) => s.id)),
  ]);
  const isToday = dateKey(day) === dateKey(now);
  const dayHref = (d: Date) => `/teacher/attendance?day=${dateKey(d)}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>{t.attendance.title}</PageTitle>
      {tabs}

      <div className="mb-4 flex items-center gap-2">
        <Link href={dayHref(addDays(day, -1))} className={buttonClass("outline", "icon")} aria-label={t.attendance.prevDay}>
          <ChevronLeft size={18} />
        </Link>
        <Link href={dayHref(addDays(day, 1))} className={buttonClass("outline", "icon")} aria-label={t.attendance.nextDay}>
          <ChevronRight size={18} />
        </Link>
        <p className="ml-1 font-semibold first-letter:uppercase">{formatLongDay(day, locale)}</p>
        {!isToday && (
          <Link href="/teacher/attendance" className={buttonClass("ghost", "sm", "ml-auto")}>
            {t.attendance.today}
          </Link>
        )}
      </div>

      {classes.length === 0 ? (
        <Empty icon="🗓️" title={t.attendance.noClasses} />
      ) : (
        <>
          {classes.length > 1 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {classes.map((s) => {
                const p = progress.get(s.id);
                const selected = current?.session.id === s.id;
                const complete = p && p.total > 0 && p.marked === p.total;
                return (
                  <Link
                    key={s.id}
                    href={`/teacher/attendance?session=${s.id}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-colors",
                      selected ? "border-fg shadow-card" : "border-border hover:border-fg/25",
                    )}
                  >
                    <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", s.status === "cancelled" && "line-through")}>{s.course_title}</span>
                      <span className="block text-[13px] text-muted">
                        {formatTime(new Date(s.starts_at), locale)} · {s.group_name}
                      </span>
                    </span>
                    {s.status === "cancelled" ? (
                      <Badge tone="red">{t.schedule.cancelled}</Badge>
                    ) : complete ? (
                      <Badge tone="green">
                        <Check size={12} /> {p.marked}/{p.total}
                      </Badge>
                    ) : p && p.marked > 0 ? (
                      <Badge tone="yellow">
                        {p.marked}/{p.total}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}

          {current && (
            <Roster
              key={current.session.id}
              sessionId={current.session.id}
              title={current.session.course_title}
              meta={`${formatTime(new Date(current.session.starts_at), locale)}–${formatTime(new Date(current.session.ends_at), locale)} · ${current.session.group_name} · ${t.common.room} ${current.session.room}`}
              color={current.session.color}
              students={current.students}
              planned={current.planned}
              blocked={current.session.status === "cancelled" ? t.attendance.cancelled : !started(current.session, now) ? t.attendance.notStarted : null}
            />
          )}
        </>
      )}
    </div>
  );
}
