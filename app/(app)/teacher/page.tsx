import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardPlus, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { sessionsBetween, teacherAnnouncements, teacherDeadlines } from "@/lib/queries";
import { DAY, formatLongDay, formatTime, startOfDay } from "@/lib/time";
import { DueBadge } from "@/components/bits";
import { Badge, Card, CourseDot, Empty, PageTitle, SectionTitle, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Обзор" };

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

  return (
    <div className="space-y-10">
      <PageTitle
        meta={[<span key="d" className="capitalize">{formatLongDay(now, locale)}</span>, t.profile.teacher]}
        sub={`${t.teacher.todayClasses}: ${today.filter((s) => s.status !== "cancelled").length}`}
      >
        {t.today.greeting(user.full_name.split(" ")[0])}
      </PageTitle>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/teacher/deadlines" className={buttonClass("accent", "lg", "h-14 justify-start px-5 shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]")}>
          <ClipboardPlus size={20} /> {t.teacher.newDeadline}
        </Link>
        <Link href="/teacher/announcements" className={buttonClass("outline", "lg", "h-14 justify-start px-5")}>
          <Megaphone size={20} /> {t.teacher.newAnn}
        </Link>
        <Link href="/teacher/courses" className={buttonClass("outline", "lg", "h-14 justify-start px-5")}>
          <BookOpen size={20} /> {t.teacher.courses}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>{t.teacher.todayClasses}</SectionTitle>
          {today.length === 0 ? (
            <Empty icon="☕" title={t.teacher.noClassesToday} />
          ) : (
            <div className="space-y-2">
              {today.map((s) => (
                <Card key={s.id} className="flex items-center gap-3 p-3 sm:p-3">
                  <span className="h-10 w-1.5 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${s.status === "cancelled" ? "line-through" : ""}`}>{s.course_title}</p>
                    <p className="text-xs text-muted">
                      {formatTime(new Date(s.starts_at), locale)}–{formatTime(new Date(s.ends_at), locale)} · {s.group_name} · {t.common.room} {s.room}
                    </p>
                  </div>
                  {s.status === "moved" && <Badge tone="yellow">{t.schedule.moved}</Badge>}
                  {s.status === "cancelled" && <Badge tone="red">{t.schedule.cancelled}</Badge>}
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
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
        <SectionTitle>{t.ann.title}</SectionTitle>
        {anns.length === 0 ? (
          <Empty icon="📣" title={t.teacher.noAnns} />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
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
    </div>
  );
}
