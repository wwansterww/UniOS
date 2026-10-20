import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { teacherCourses, teacherGradebook } from "@/lib/queries";
import { Empty, PageTitle, buttonClass } from "@/components/ui";
import { CourseGroupChips, pickPair } from "@/components/course-chips";
import { currentTerm } from "@/lib/journal";
import { Gradebook } from "./gradebook";

export const metadata: Metadata = { title: "Оценки" };

export default async function TeacherGradesPage({ searchParams }: PageProps<"/teacher/grades">) {
  const user = await requireUser("teacher");
  const { t } = await getT();
  const sp = await searchParams;
  const courses = await teacherCourses(user);
  const { pairs, selected: sel } = pickPair(courses.filter((c) => c.term === currentTerm()), sp.course, sp.group);
  const book = sel ? await teacherGradebook(user, sel.course.id, sel.group.id) : null;

  return (
    <div>
      <PageTitle>{t.grades.title}</PageTitle>

      {!sel || !book ? (
        <Empty icon="📚" title={t.grades.setupFirst}>
          <Link href="/teacher/courses" className={buttonClass("primary", "sm", "mt-3")}>
            {t.grades.toCourses} <ArrowRight size={14} />
          </Link>
        </Empty>
      ) : (
        <>
          <CourseGroupChips pairs={pairs} selected={sel} href={(p) => `/teacher/grades?course=${p.course.id}&group=${p.group.id}`} />
          <Gradebook
            key={sel.course.id + sel.group.id}
            courseId={sel.course.id}
            groupId={sel.group.id}
            title={sel.course.title}
            groupName={sel.group.name}
            color={sel.course.color}
            {...book}
          />
        </>
      )}
    </div>
  );
}
