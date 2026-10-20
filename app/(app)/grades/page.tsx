import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { myGrades } from "@/lib/queries";
import { currentTerm, termParts } from "@/lib/journal";
import { PageTitle } from "@/components/ui";
import { GradesView } from "./grades-view";

export const metadata: Metadata = { title: "Оценки" };

export default async function GradesPage() {
  const user = await requireUser("student");
  const { t } = await getT();
  const courses = await myGrades(user);
  const term = currentTerm();
  const { year, fall } = termParts(term);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle meta={[t.grades.term(fall, year)]}>{t.grades.title}</PageTitle>
      <GradesView courses={courses} term={term} />
    </div>
  );
}
