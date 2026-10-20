import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { advisedStudent, studentAttendance, studentGrades } from "@/lib/queries";
import { currentTerm, termParts } from "@/lib/journal";
import { PageTitle } from "@/components/ui";
import { GradesView } from "@/app/(app)/grades/grades-view";
import { AttendanceCards, attendanceTotals } from "@/app/(app)/attendance/attendance-cards";

export const metadata: Metadata = { title: "Студент" };

/** Advisor: one student's grades and attendance, read-only. */
export default async function AdvisedStudentPage({ params }: PageProps<"/advisor/students/[id]">) {
  const user = await requireUser("advisor");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { t, locale } = await getT();
  const student = await advisedStudent(user, id);
  if (!student) notFound();
  const [grades, attendance] = await Promise.all([studentGrades(user, id), studentAttendance(user, id)]);
  const term = currentTerm();
  const { year, fall } = termParts(term);
  const all = attendanceTotals(attendance);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/advisor" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> {t.advisor.back}
      </Link>
      <PageTitle meta={[student.group_name, student.email]} sub={all.percent != null ? t.attendance.summary(all.percent, all.absent, all.late) : undefined}>
        {student.full_name}
      </PageTitle>
      <section className="mb-12">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          {t.advisor.grades} <span className="font-normal text-muted">· {t.grades.term(fall, year)}</span>
        </h2>
        <GradesView courses={grades} term={term} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{t.advisor.attendance}</h2>
        <AttendanceCards courses={attendance} t={t} locale={locale} readOnly />
      </section>
    </div>
  );
}
