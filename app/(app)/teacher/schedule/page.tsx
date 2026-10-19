import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { sessionsBetween, teacherCourses } from "@/lib/queries";
import { addDays, dateKey, formatDay, fromZoned, startOfWeek } from "@/lib/time";
import { Card, Empty, PageTitle, SectionTitle, buttonClass } from "@/components/ui";
import { AddClassForm, SessionRow } from "./forms";

export const metadata: Metadata = { title: "Расписание" };

export default async function TeacherSchedulePage({ searchParams }: PageProps<"/teacher/schedule">) {
  const user = await requireUser("teacher");
  const { t, locale } = await getT();
  const { week } = await searchParams;
  const now = new Date();
  const m = typeof week === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(week) : null;
  const weekStart = startOfWeek(m ? fromZoned(+m[1], +m[2], +m[3], 12) : now);
  const [courses, sessions] = await Promise.all([teacherCourses(user), sessionsBetween(user, weekStart, addDays(weekStart, 7))]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => ({
    d,
    list: sessions.filter((s) => dateKey(new Date(s.starts_at)) === dateKey(d)),
  }));

  return (
    <div className="space-y-6">
      <PageTitle>{t.teacher.schedule}</PageTitle>
      <Card>
        <SectionTitle>{t.teacher.addClass}</SectionTitle>
        <AddClassForm courses={courses} today={dateKey(now)} />
      </Card>

      <div className="flex items-center gap-2">
        <Link href={`/teacher/schedule?week=${dateKey(addDays(weekStart, -7))}`} className={buttonClass("outline", "icon")} aria-label={t.schedule.prev}>
          <ChevronLeft size={18} />
        </Link>
        <Link href={`/teacher/schedule?week=${dateKey(addDays(weekStart, 7))}`} className={buttonClass("outline", "icon")} aria-label={t.schedule.next}>
          <ChevronRight size={18} />
        </Link>
        <p className="ml-1 font-semibold">
          {formatDay(weekStart, locale)} — {formatDay(addDays(weekStart, 6), locale)}
        </p>
      </div>

      {sessions.length === 0 ? (
        <Empty icon="🗓️" title={t.schedule.emptyWeek} />
      ) : (
        days
          .filter((x) => x.list.length)
          .map(({ d, list }) => (
            <section key={d.toISOString()}>
              <h2 className="mb-2 text-sm font-bold capitalize text-muted">{formatDay(d, locale)}</h2>
              <div className="space-y-2">
                {list.map((s) => (
                  <SessionRow
                    key={s.id}
                    s={{
                      ...s,
                      starts_at: new Date(s.starts_at).toISOString(),
                      ends_at: new Date(s.ends_at).toISOString(),
                      original_starts_at: s.original_starts_at ? new Date(s.original_starts_at).toISOString() : null,
                    }}
                  />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
