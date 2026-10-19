import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { teacherCourses, teacherGroups } from "@/lib/queries";
import { Card, CourseDot, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { DetachGroup, GroupTools, InviteCode, NewCourseForm } from "./forms";

export const metadata: Metadata = { title: "Курсы" };

export default async function CoursesPage() {
  const user = await requireUser("teacher");
  const { t } = await getT();
  const [courses, groups] = await Promise.all([teacherCourses(user), teacherGroups(user)]);

  return (
    <div className="space-y-6">
      <PageTitle>{t.teacher.courses}</PageTitle>
      <Card>
        <SectionTitle>{t.teacher.newCourse}</SectionTitle>
        <NewCourseForm />
      </Card>
      {courses.length === 0 ? (
        <Empty icon="📚" title={t.teacher.noCourses} />
      ) : (
        courses.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-3">
              <span className="h-10 w-1.5 rounded-full" style={{ background: c.color }} />
              <div>
                <p className="text-xs text-muted">{c.code}</p>
                <h2 className="text-xl font-semibold">{c.title}</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {c.groups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2">
                  <CourseDot color={c.color} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{g.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <Users size={12} /> {t.teacher.students(g.members)}
                    </p>
                  </div>
                  <InviteCode code={g.invite_code} />
                  <DetachGroup courseId={c.id} groupId={g.id} />
                </div>
              ))}
            </div>
            <GroupTools courseId={c.id} otherGroups={groups.filter((g) => !c.groups.some((x) => x.id === g.id))} />
          </Card>
        ))
      )}
    </div>
  );
}
