import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { teacherCourses, teacherDeadlines } from "@/lib/queries";
import { Card, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { NewDeadlineForm, TeacherDeadlineRow } from "./forms";

export const metadata: Metadata = { title: "Дедлайны" };

export default async function TeacherDeadlinesPage() {
  const user = await requireUser("teacher");
  const { t } = await getT();
  const [courses, deadlines] = await Promise.all([teacherCourses(user), teacherDeadlines(user)]);

  return (
    <div className="space-y-8">
      <PageTitle>{t.nav.deadlines}</PageTitle>
      <Card id="new" className="scroll-mt-6 border-accent/40">
        <SectionTitle>{t.teacher.newDeadline}</SectionTitle>
        <NewDeadlineForm courses={courses} />
      </Card>
      <section>
        <SectionTitle>{t.teacher.myDeadlines}</SectionTitle>
        {deadlines.length === 0 ? (
          <Empty icon="📝" title={t.teacher.noDeadlines} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {deadlines.map((d) => (
              <TeacherDeadlineRow key={d.id} d={{ ...d, due_at: new Date(d.due_at).toISOString() }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
