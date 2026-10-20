import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { advisorOverview } from "@/lib/queries";
import { ADMISSION_MIN, absenceAllowance, absenceRisk, attendanceStats, courseResult, currentTerm, fmtGpa, gpa } from "@/lib/journal";
import { Card, Empty, PageTitle, cn } from "@/components/ui";
import { StudentTable, type StudentRow } from "./student-table";

export const metadata: Metadata = { title: "Студенты" };

/** Advisor: every student of their groups, with who needs help first (no exam admission, absence limit). */
export default async function AdvisorPage() {
  const user = await requireUser("advisor");
  const { t } = await getT();
  const data = await advisorOverview(user);
  const term = currentTerm();
  const points = new Map(data.grades.map((g) => [`${g.assessment_id}:${g.student_id}`, g.points]));

  const rows: StudentRow[] = data.students.map((s) => {
    const courses = data.courses.filter((c) => c.group_id === s.group_id);
    const results = courses.map((c) => {
      const res = courseResult(
        data.works.filter((w) => w.course_id === c.id).map((w) => ({ ...w, points: points.get(`${w.id}:${s.id}`) ?? null })),
      );
      return { ...c, res, score: res.score };
    });
    const current = results.filter((c) => c.term === term);
    const reasons: { text: string; level: "warn" | "over" }[] = [];
    for (const c of current) {
      if (c.res.admission != null && c.res.admission < ADMISSION_MIN) reasons.push({ text: t.advisor.reasonAdmission(c.title, c.res.admission), level: "over" });
      const att = data.attendance.find((a) => a.student_id === s.id && a.course_id === c.id && a.group_id === s.group_id);
      const planned = data.planned.find((p) => p.course_id === c.id && p.group_id === s.group_id)?.planned ?? 0;
      if (!att || !planned) continue;
      const allowed = absenceAllowance(planned);
      const risk = absenceRisk(att.absent, allowed);
      if (risk !== "ok") reasons.push({ text: t.advisor.reasonAbsence(c.title, att.absent, allowed), level: risk });
    }
    const marks = data.attendance.filter((a) => a.student_id === s.id && current.some((c) => c.id === a.course_id));
    const stats = attendanceStats(
      marks.flatMap((a) => [...Array(a.present).fill("present"), ...Array(a.late).fill("late"), ...Array(a.absent).fill("absent")]),
    );
    const g = gpa(current);
    return {
      id: s.id,
      name: s.full_name,
      group: s.group_name,
      gpa: g != null ? fmtGpa(g) : null,
      attendance: stats.percent,
      reasons: reasons.sort((a, b) => (a.level === b.level ? 0 : a.level === "over" ? -1 : 1)),
    };
  });
  const flagged = rows.filter((r) => r.reasons.length).sort((a, b) => b.reasons.filter((x) => x.level === "over").length - a.reasons.filter((x) => x.level === "over").length);
  const gpas = rows.map((r) => (r.gpa ? Number(r.gpa) : null)).filter((x): x is number => x != null);

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle meta={[t.profile.advisor]} sub={data.groups.length ? t.advisor.sub(rows.length, data.groups.map((g) => g.name).join(", ")) : undefined}>
        {t.advisor.title}
      </PageTitle>

      {data.groups.length === 0 ? (
        <Empty icon="👥" title={t.advisor.empty} />
      ) : (
        <div className="space-y-10">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              [t.nav.students, String(rows.length)],
              [t.advisor.atRisk, String(flagged.length)],
              [t.grades.termGpa, gpas.length ? fmtGpa(gpas.reduce((a, b) => a + b, 0) / gpas.length) : "—"],
            ].map(([label, value], i) => (
              <Card key={label} className="px-4 py-4 sm:px-5 sm:py-5">
                <p className={cn("font-display text-[2rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[2.5rem]", i === 1 && flagged.length > 0 && "text-accent")}>
                  {value}
                </p>
                <p className="mt-2 text-[12px] text-muted sm:text-[13px]">{label}</p>
              </Card>
            ))}
          </div>

          <section>
            <h2 className="mb-1 text-lg font-semibold tracking-tight">{t.advisor.atRisk}</h2>
            <p className="mb-3 text-[13px] text-muted">{t.advisor.atRiskHint}</p>
            {flagged.length === 0 ? (
              <Empty icon="✅" title={t.advisor.allGood} />
            ) : (
              <Card className="overflow-hidden p-0 sm:p-0">
                <ul>
                  {flagged.map((r) => (
                    <li key={r.id} className="border-b border-border last:border-b-0">
                      <Link href={`/advisor/students/${r.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
                        <AlertTriangle size={17} className={cn("mt-0.5 shrink-0", r.reasons.some((x) => x.level === "over") ? "text-danger" : "text-warn")} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {r.name} <span className="font-normal text-muted">· {r.group}</span>
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {r.reasons.map((x) => (
                              <span key={x.text} className={cn("rounded-md px-2 py-0.5 text-[12px] font-medium", x.level === "over" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}>
                                {x.text}
                              </span>
                            ))}
                          </span>
                        </span>
                        <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{t.nav.students}</h2>
            <StudentTable rows={rows} groups={data.groups.map((g) => g.name)} />
          </section>
        </div>
      )}
    </div>
  );
}
