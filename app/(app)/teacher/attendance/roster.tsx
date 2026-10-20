"use client";

import { useOptimistic, useTransition } from "react";
import { Check, CheckCheck, Clock, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Empty, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { ATTENDANCE_STATUSES, absenceAllowance, absenceRisk, type AttendanceStatus } from "@/lib/journal";
import { markRestPresent, setAttendance } from "../actions";
import { QrCheckin } from "./qr-checkin";

type Mark = (typeof ATTENDANCE_STATUSES)[number];
type Student = { id: string; full_name: string; status: AttendanceStatus | null; absences: number };
type Marks = Record<string, AttendanceStatus | null>;

const icons: Record<Mark, LucideIcon> = { present: Check, late: Clock, absent: X };
const solid: Record<Mark, string> = {
  present: "bg-ok text-surface",
  late: "bg-warn text-surface",
  absent: "bg-danger text-surface",
};
const soft: Record<Mark, string> = {
  present: "bg-ok-soft text-ok",
  late: "bg-warn-soft text-warn",
  absent: "bg-danger-soft text-danger",
};

/** One class: QR check-in or «Все на месте», then one tap per student. Marks show instantly and save in the background. */
export function Roster({
  sessionId,
  title,
  meta,
  color,
  students,
  planned,
  blocked,
}: {
  sessionId: string;
  title: string;
  meta: string;
  color: string;
  students: Student[];
  planned: number;
  blocked: string | null;
}) {
  const { t } = useT();
  const [, start] = useTransition();
  const [marks, apply] = useOptimistic(
    Object.fromEntries(students.map((s) => [s.id, s.status])) as Marks,
    (state: Marks, change: Marks) => ({ ...state, ...change }),
  );
  const count = (s: AttendanceStatus | null) => students.filter((x) => marks[x.id] === s).length;
  const unmarked = count(null);
  const allowed = absenceAllowance(planned);
  // Absences in this course, adjusted live for the mark being changed in this class.
  const absences = (st: Student) => st.absences - (st.status === "absent" ? 1 : 0) + (marks[st.id] === "absent" ? 1 : 0);

  const mark = (studentId: string, status: Mark | null) =>
    start(async () => {
      apply({ [studentId]: status });
      const r = await setAttendance(sessionId, studentId, status);
      if (!r.ok) toast.error(r.message ?? t.common.error);
    });

  const markRest = () =>
    start(async () => {
      apply(Object.fromEntries(students.filter((s) => !marks[s.id]).map((s) => [s.id, "present"])));
      const r = await markRestPresent(sessionId);
      if (!r.ok) toast.error(r.message ?? t.common.error);
    });

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <p className="text-[13px] text-muted">{meta}</p>
        </div>
        {!blocked && students.length > 0 && (
          <div className="flex w-full gap-2 sm:w-auto">
            <QrCheckin sessionId={sessionId} title={title} />
            <Button onClick={markRest} disabled={unmarked === 0} title={t.attendance.allPresentHint} className="flex-1 sm:flex-none">
              <CheckCheck size={16} /> {t.attendance.allPresent}
            </Button>
          </div>
        )}
      </div>

      {/* Counters double as the legend for the icon-only buttons on phones. */}
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 sm:px-5">
        {ATTENDANCE_STATUSES.map((s) => {
          const Icon = icons[s];
          return (
            <span key={s} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium", soft[s])}>
              <Icon size={14} /> {t.attendance[s]} <b className="tabular-nums">{count(s)}</b>
            </span>
          );
        })}
        {count("excused") > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-medium text-ok">
            {t.attendance.excused} <b className="tabular-nums">{count("excused")}</b>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-medium text-muted">
          {t.attendance.notMarked} <b className="tabular-nums">{unmarked}</b>
        </span>
      </div>

      {blocked && <p className="border-b border-border bg-surface-2 px-5 py-3 text-sm text-muted">{blocked}</p>}

      {students.length === 0 ? (
        <div className="p-5">
          <Empty title={t.attendance.noStudents} />
        </div>
      ) : (
        <ol>
          {students.map((st, i) => {
            const current = marks[st.id];
            return (
              <li key={st.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 sm:px-5">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                  <span className="truncate text-[15px]">{st.full_name}</span>
                  <span className="flex gap-1.5">
                    {current === "excused" && (
                      <span className="w-fit rounded-md bg-ok-soft px-1.5 py-px text-[11px] font-medium text-ok">{t.attendance.excused}</span>
                    )}
                    {planned > 0 && absences(st) > 0 && <NbBadge n={absences(st)} allowed={allowed} label={t.attendance.nb(absences(st), allowed)} />}
                  </span>
                </span>
                <div role="radiogroup" aria-label={st.full_name} className="flex shrink-0 gap-1 rounded-xl bg-surface-2 p-1">
                  {ATTENDANCE_STATUSES.map((s) => {
                    const Icon = icons[s];
                    const on = current === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={t.attendance[s]}
                        title={t.attendance[s]}
                        disabled={!!blocked}
                        onClick={() => mark(st.id, on ? null : s)}
                        className={cn(
                          "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:px-3",
                          on ? solid[s] : "text-muted hover:bg-surface hover:text-fg",
                        )}
                      >
                        <Icon size={16} strokeWidth={on ? 2.6 : 2} />
                        <span className="hidden sm:inline">{t.attendance[s]}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** "НБ 6/7": absences in this course against the 25% limit; amber at the last one, red when over. */
export function NbBadge({ n, allowed, label }: { n: number; allowed: number; label: string }) {
  const risk = absenceRisk(n, allowed);
  return (
    <span
      className={cn(
        "w-fit shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium tabular-nums",
        risk === "over" ? "bg-danger text-surface" : risk === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted",
      )}
    >
      {label}
    </span>
  );
}
