import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, ClipboardPlus, GraduationCap, Megaphone, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { attendanceProgress, sessionsBetween, teacherAbsences, teacherAnnouncements, teacherDeadlines } from "@/lib/queries";
import { absenceAllowance, absenceRisk } from "@/lib/journal";
import { NbBadge } from "./attendance/roster";
import { WarnButton } from "./attendance/review";
import { DAY, MIN, formatLongDay, formatTime, startOfDay } from "@/lib/time";
import { DueBadge } from "@/components/bits";
import { Badge, Card, CourseDot, Empty, PageTitle, SectionTitle, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Обзор" };

const quick = "h-auto min-h-14 justify-start px-4 py-3 text-left leading-tight sm:px-5 [&>svg]:shrink-0";

export default async function TeacherHome() {
  const user = await requireUser("teacher");
  const { t, locale } = await getT();
  const now = new Date();
  const dayStart = startOfDay(now);
  const [today, deadlines, anns] = await Promise.all([
    sessionsBetween(user, dayStart, new Date(dayStart.getTime() + DAY)),
    teacherDeadlines(user),
    teacherAnnouncements(user),
  ]);
  const upcoming = deadlines.filter((d) => new Date(d.due_at) > now).slice(0, 5);
  const [progress, absences] = await Promise.all([attendanceProgress(user, today.map((s) => s.id)), teacherAbsences(user)]);
  // Students with at most one absence left (25% rule) or already over it, worst first.
  const atRisk = absences
    .map((a) => ({ ...a, allowed: absenceAllowance(a.planned) }))
    .filter((a) => a.planned > 0 && absenceRisk(a.absent, a.allowed) !== "ok")
    .sort((a, b) => a.allowed - a.absent - (b.allowed - b.absent));

  return (
    <div className="space-y-10">
      <PageTitle
        meta={[<span key="d" className="capitalize">{formatLongDay(now, locale)}</span>, t.profile.teacher]}
        sub={`${t.teacher.todayClasses}: ${today.filter((s) => s.status !== "cancelled").length}`}
      >
        {t.today.greeting(user.full_name.split(" ")[0])}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/teacher/attendance" className={buttonClass("accent", "lg", `${quick} shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]`)}>
          <UserCheck size={20} /> <span>{t.teacher.attendance}</span>
        </Link>
        <Link href="/teacher/grades" className={buttonClass("outline", "lg", quick)}>
          <GraduationCap size={20} /> <span>{t.teacher.grades}</span>
        </Link>
        <Link href="/teacher/deadlines" className={buttonClass("outline", "lg", quick)}>
          <ClipboardPlus size={20} /> <span>{t.teacher.newDeadline}</span>
        </Link>
        <Link href="/teacher/announcements" className={buttonClass("outline", "lg", quick)}>
          <Megaphone size={20} /> <span>{t.teacher.newAnn}</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle>{t.teacher.todayClasses}</SectionTitle>
          {today.length === 0 ? (
            <Empty icon="☕" title={t.teacher.noClassesToday} />
          ) : (
            <div className="space-y-2">
              {today.map((s) => {
                const p = progress.get(s.id);
                const canMark = s.status !== "cancelled" && new Date(s.starts_at).getTime() - 30 * MIN <= now.getTime();
                const complete = p && p.total > 0 && p.marked === p.total;
                return (
                  <Card key={s.id} className="flex items-center gap-3 p-3 sm:p-3">
                    <span className="h-10 w-1.5 rounded-full" style={{ background: s.color }} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold ${s.status === "cancelled" ? "line-through" : ""}`}>{s.course_title}</p>
                      <p className="text-xs text-muted">
                        {formatTime(new Date(s.starts_at), locale)}–{formatTime(new Date(s.ends_at), locale)} · {s.group_name} · {t.common.room} {s.room}
                      </p>
                    </div>
                    {s.status === "moved" && <Badge tone="yellow">{t.schedule.moved}</Badge>}
                    {s.status === "cancelled" && <Badge tone="red">{t.schedule.cancelled}</Badge>}
                    {canMark && (
                      <Link
                        href={`/teacher/attendance?session=${s.id}`}
                        className={complete ? buttonClass("soft", "sm", "text-ok") : buttonClass(p?.marked ? "outline" : "primary", "sm")}
                      >
                        {complete ? (
                          <>
                            <Check size={14} /> {p.marked}/{p.total}
                          </>
                        ) : p?.marked ? (
                          `${p.marked}/${p.total}`
                        ) : (
                          t.attendance.mark
                        )}
                      </Link>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle
            action={
              <Link href="/teacher/deadlines" className="text-sm font-semibold text-muted hover:text-fg">
                {t.nav.deadlines} →
              </Link>
            }
          >
            {t.teacher.upcoming}
          </SectionTitle>
          {upcoming.length === 0 ? (
            <Empty icon="📝" title={t.teacher.noDeadlines} />
          ) : (
            <div className="space-y-2">
              {upcoming.map((d) => (
                <Link key={d.id} href={`/teacher/deadlines#${d.id}`} className="lift block rounded-2xl border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <CourseDot color={d.color} /> {d.course_title} · {d.group_names}
                      </p>
                      <p className="truncate font-semibold">{d.title}</p>
                    </div>
                    <DueBadge due={new Date(d.due_at).toISOString()} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-muted">{t.teacher.doneOf(d.done, d.total)}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionTitle
          action={
            <Link href="/teacher/attendance?view=summary" className="text-sm font-semibold text-muted hover:text-fg">
              {t.attendance.tabSummary} →
            </Link>
          }
        >
          {t.attendance.atRisk}
        </SectionTitle>
        {atRisk.length === 0 ? (
          <Empty icon="✅" title={t.attendance.noRisk} />
        ) : (
          <Card className="overflow-hidden p-0 sm:p-0">
            <ul>
              {atRisk.slice(0, 8).map((a) => (
                <li key={a.student_id + a.course_id + a.group_id} className="border-b border-border last:border-b-0">
                  <Link
                    href={`/teacher/attendance?view=summary&course=${a.course_id}&group=${a.group_id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.full_name}</span>
                      <span className="flex items-center gap-1.5 text-[13px] text-muted">
                        <CourseDot color={a.color} /> <span className="truncate">{a.course_title} · {a.group_name}</span>
                      </span>
                    </span>
                    <NbBadge n={a.absent} allowed={a.allowed} label={t.attendance.nb(a.absent, a.allowed)} />
                    <WarnButton studentId={a.student_id} courseId={a.course_id} groupId={a.group_id} compact />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-4 py-2.5 text-[13px] text-muted sm:px-5">{t.attendance.atRiskHint}</p>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>{t.ann.title}</SectionTitle>
        {anns.length === 0 ? (
          <Empty icon="📣" title={t.teacher.noAnns} />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {anns.slice(0, 4).map((a) => (
              <Link key={a.id} href={`/teacher/announcements#${a.id}`} className="lift rounded-2xl border border-border bg-surface p-4 shadow-card">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <CourseDot color={a.color} /> {a.course_title}
                  {a.is_important && <Badge tone="solid">{t.ann.important}</Badge>}
                </p>
                <p className="truncate font-semibold">{a.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-lavender" style={{ width: `${a.total ? (a.reads / a.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-muted">{t.teacher.readOf(a.reads, a.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Link href="/teacher/courses" className="lift flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
        <BookOpen size={18} className="text-muted" />
        <span className="flex-1 text-sm font-medium">{t.teacher.courses}</span>
        <ArrowRight size={16} className="text-muted" />
      </Link>
    </div>
  );
}
