import { ChevronDown, Info } from "lucide-react";
import type { Dict, Locale } from "@/lib/i18n";
import type { AttendanceMark } from "@/lib/queries";
import { absenceAllowance, absenceRisk, attendanceStats, type AbsenceRisk } from "@/lib/journal";
import { formatDay, formatTime } from "@/lib/time";
import { Card, Empty, cn } from "@/components/ui";
import { MissedRow } from "./missed-row";

const riskText: Record<AbsenceRisk, string> = { ok: "text-fg", warn: "text-warn", over: "text-danger" };
const riskCell: Record<AbsenceRisk, string> = { ok: "bg-fg/70", warn: "bg-warn", over: "bg-danger" };

type Course = { id: string; title: string; color: string; planned: number; held: number; marks: AttendanceMark[] };

/** Overall numbers for the page header. */
export const attendanceTotals = (courses: Course[]) => attendanceStats(courses.flatMap((c) => c.marks.map((m) => m.status)));

/**
 * A student's attendance per course against the 25% absence limit: how many more classes may be missed,
 * one cell per allowed absence, and the list of missed classes with certificates. Shared by the student and the advisor.
 */
export function AttendanceCards({ courses: raw, t, locale, readOnly }: { courses: Course[]; t: Dict; locale: Locale; readOnly?: boolean }) {
  const courses = raw.map((c) => {
    const stats = attendanceStats(c.marks.map((m) => m.status));
    const allowed = absenceAllowance(c.planned);
    return { ...c, stats, allowed, left: allowed - stats.absent, risk: c.planned > 0 ? absenceRisk(stats.absent, allowed) : null };
  });
  // The course with the least room left decides the headline.
  const closest = courses.filter((c) => c.risk).sort((a, b) => a.left - b.left)[0];

  return (
    <>
      {courses.length === 0 ? (
        <Empty icon="🗓️" title={t.attendance.noCourses} />
      ) : (
        <div className="space-y-3">
          {closest && (
            <Card
              className={cn(
                "flex items-start gap-3 py-4 sm:py-4",
                closest.risk === "over" && "border-danger/40 bg-danger-soft",
                closest.risk === "warn" && "border-warn/40 bg-warn-soft",
              )}
            >
              <Info size={18} className={cn("mt-0.5 shrink-0", closest.risk ? riskText[closest.risk] : "text-muted")} />
              <div className="min-w-0 text-sm">
                <p className={cn("font-medium", closest.risk && closest.risk !== "ok" && riskText[closest.risk])}>
                  {closest.risk === "over"
                    ? t.attendance.closestOver(closest.title)
                    : closest.risk === "warn"
                      ? t.attendance.closest(closest.title, Math.max(0, closest.left))
                      : t.attendance.allGood}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">{t.attendance.rule}</p>
              </div>
            </Card>
          )}

          {courses.map((c) => {
            const missed = c.marks.filter((m) => m.status !== "present");
            return (
              <Card key={c.id} className="overflow-hidden p-0 sm:p-0">
                <div className="flex items-center gap-4 px-5 pt-4 sm:px-6">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold leading-tight">{c.title}</h2>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {c.risk ? `${t.attendance.absentOf(c.stats.absent, c.allowed)} · ${t.attendance.held(c.held, c.planned)}` : t.attendance.noPlan}
                      {c.stats.percent != null && ` · ${c.stats.percent}%`}
                    </p>
                  </div>
                  {c.risk && (
                    <div className="shrink-0 text-right">
                      <p className={cn("font-display text-[1.9rem] font-semibold leading-none tabular-nums", riskText[c.risk])}>{Math.max(0, c.left)}</p>
                      <p className="mt-1 text-xs text-muted">{t.attendance.canMiss}</p>
                    </div>
                  )}
                </div>

                {c.risk && (
                  <div className="px-5 pb-4 pt-3 sm:px-6">
                    {/* One cell per allowed absence: filled = used. */}
                    <div className="flex gap-1" role="img" aria-label={t.attendance.absentOf(c.stats.absent, c.allowed)}>
                      {Array.from({ length: Math.max(c.allowed, 1) }, (_, i) => (
                        <span key={i} className={cn("h-2 flex-1 rounded-full", i < c.stats.absent ? riskCell[c.risk!] : "bg-surface-2")} />
                      ))}
                    </div>
                    {c.risk !== "ok" && (
                      <p className={cn("mt-2 text-[13px] font-medium", riskText[c.risk])}>
                        {c.risk === "over" ? t.attendance.over(c.stats.absent - c.allowed) : c.left === 1 ? t.attendance.lastOne : t.attendance.atLimit}
                      </p>
                    )}
                  </div>
                )}
                {!c.risk && <div className="pb-4" />}

                {c.stats.total > 0 &&
                  (missed.length === 0 ? (
                    <p className="border-t border-border px-5 py-2.5 text-sm text-ok sm:px-6">{t.attendance.perfect}</p>
                  ) : (
                    <details className="group border-t border-border">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-sm text-muted hover:text-fg sm:px-6 [&::-webkit-details-marker]:hidden">
                        <span className="flex-1">{t.attendance.missedList(missed.length)}</span>
                        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="border-t border-border">
                        {missed.map((m) => (
                          <MissedRow
                            key={m.session_id}
                            readOnly={readOnly}
                            sessionId={m.session_id}
                            when={`${formatDay(new Date(m.starts_at), locale)} · ${formatTime(new Date(m.starts_at), locale)}`}
                            status={m.status as "late" | "absent" | "excused"}
                            excuse={m.excuse}
                          />
                        ))}
                      </ul>
                    </details>
                  ))}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
