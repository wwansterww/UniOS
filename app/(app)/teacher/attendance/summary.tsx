import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { User } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import { attendanceSummary, teacherCourses } from "@/lib/queries";
import { absenceAllowance, absenceRisk, attendanceStats, currentTerm } from "@/lib/journal";
import { Card, Empty, buttonClass, cn } from "@/components/ui";
import { CourseGroupChips, pickPair } from "@/components/course-chips";
import { ExportCsv } from "@/components/export-csv";
import { NbBadge } from "./roster";
import { WarnButton } from "./review";

/** Per-student attendance totals for one course × group, against the 25% absence limit. */
export async function AttendanceSummary({ user, t, course, group }: { user: User; t: Dict; course: unknown; group: unknown }) {
  const { pairs, selected } = pickPair((await teacherCourses(user)).filter((c) => c.term === currentTerm()), course, group);
  const data = selected ? await attendanceSummary(user, selected.course.id, selected.group.id) : null;
  if (!selected || !data)
    return (
      <Empty icon="📚" title={t.grades.setupFirst}>
        <Link href="/teacher/courses" className={buttonClass("primary", "sm", "mt-3")}>
          {t.grades.toCourses} <ArrowRight size={14} />
        </Link>
      </Empty>
    );

  const allowed = absenceAllowance(data.planned);
  const rows = data.students.map((s) => {
    const stats = attendanceStats([
      ...Array(s.present).fill("present"),
      ...Array(s.late).fill("late"),
      ...Array(s.absent).fill("absent"),
      ...Array(s.excused).fill("excused"),
    ]);
    return { ...s, percent: stats.percent, risk: data.planned > 0 ? absenceRisk(s.absent, allowed) : null };
  });
  const csv = [
    [t.grades.student, t.attendance.colAttended + " %", t.attendance.present, t.attendance.colLate, t.attendance.colAbsent, t.attendance.colLeft],
    ...rows.map((r) => [r.full_name, r.percent ?? "", r.present, r.late, r.absent, data.planned > 0 ? Math.max(0, allowed - r.absent) : ""]),
  ];

  return (
    <>
      <CourseGroupChips pairs={pairs} selected={selected} href={(p) => `/teacher/attendance?view=summary&course=${p.course.id}&group=${p.group.id}`} />
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: selected.course.color }} />
          <div className="min-w-[12rem] flex-1">
            <h2 className="text-lg font-semibold leading-tight">
              {selected.course.title} · {selected.group.name}
            </h2>
            <p className="text-[13px] text-muted">{data.planned > 0 ? t.attendance.summaryMeta(data.held, data.planned, allowed) : t.attendance.noPlan}</p>
          </div>
          <ExportCsv filename={`${selected.course.title} ${selected.group.name} — ${t.attendance.title}`} rows={csv} label={t.attendance.export} />
        </div>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title={t.attendance.noStudents} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-border text-left text-[13px] text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">{t.grades.student}</th>
                <th className="hidden w-20 px-2 py-2.5 text-right font-medium sm:table-cell">{t.attendance.colAttended}</th>
                <th className="hidden w-20 px-2 py-2.5 text-right font-medium sm:table-cell">{t.attendance.colLate}</th>
                <th className="w-14 px-2 py-2.5 text-right font-medium sm:w-16">{t.attendance.colAbsent}</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">{t.attendance.colLeft}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={cn("border-b border-border last:border-b-0", r.risk === "over" && "bg-danger-soft/60", r.risk === "warn" && "bg-warn-soft/50")}>
                  <td className="px-4 py-2.5 sm:px-5">
                    <span className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                      <span className="leading-tight">{r.full_name}</span>
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{r.percent != null ? `${r.percent}%` : "—"}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums text-muted sm:table-cell">{r.late || "—"}</td>
                  <td className="px-2 py-2.5 text-right">
                    {data.planned > 0 ? <span className="inline-flex justify-end"><NbBadge n={r.absent} allowed={allowed} label={`${r.absent}/${allowed}`} /></span> : r.absent}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums sm:px-5", r.risk === "over" ? "text-danger" : r.risk === "warn" && "text-warn")}>
                    <span className="inline-flex items-center justify-end gap-2">
                      {(r.risk === "warn" || r.risk === "over") && <WarnButton studentId={r.id} courseId={selected.course.id} groupId={selected.group.id} compact />}
                      {data.planned > 0 ? Math.max(0, allowed - r.absent) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 px-1 text-[13px] text-muted">{t.attendance.rule}</p>
    </>
  );
}
