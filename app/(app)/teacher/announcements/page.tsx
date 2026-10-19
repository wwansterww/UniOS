import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { teacherAnnouncements, teacherCourses } from "@/lib/queries";
import { Card, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { AnnouncementStats, NewAnnouncementForm } from "./forms";

export const metadata: Metadata = { title: "Объявления" };

export default async function TeacherAnnouncementsPage() {
  const user = await requireUser("teacher");
  const { t } = await getT();
  const [courses, anns] = await Promise.all([teacherCourses(user), teacherAnnouncements(user)]);

  return (
    <div className="space-y-6">
      <PageTitle>{t.ann.title}</PageTitle>
      <Card>
        <SectionTitle>{t.teacher.newAnn}</SectionTitle>
        <NewAnnouncementForm courses={courses} />
      </Card>
      {anns.length === 0 ? (
        <Empty icon="📣" title={t.teacher.noAnns} />
      ) : (
        <div className="space-y-3">
          {anns.map((a) => (
            <AnnouncementStats key={a.id} a={{ ...a, created_at: new Date(a.created_at).toISOString() }} />
          ))}
        </div>
      )}
    </div>
  );
}
