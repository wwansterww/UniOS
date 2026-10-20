"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { FileUp, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Empty, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { ExportCsv } from "@/components/export-csv";
import { CATEGORIES, courseScore, fmtPoints, letter, parsePoints, type Category } from "@/lib/journal";
import { createAssessment, deleteAssessment, setGrade, setGradeComment, updateAssessment } from "../actions";
import { GradeStats } from "./grade-stats";
import { GradeImport } from "./grade-import";

type Work = { id: string; title: string; max_points: number; category: Category };
type Student = { id: string; full_name: string; email: string };
type Scores = Map<string, number>;
const key = (workId: string, studentId: string) => `${workId}:${studentId}`;

/** Students × works. Type points, Enter moves down the column; every cell saves on its own. */
export function Gradebook({
  courseId,
  groupId,
  title,
  groupName,
  color,
  students,
  works,
  grades,
}: {
  courseId: string;
  groupId: string;
  title: string;
  groupName: string;
  color: string;
  students: Student[];
  works: Work[];
  grades: { assessment_id: string; student_id: string; points: number; comment: string }[];
}) {
  const { t } = useT();
  const [view, setView] = useState<"book" | "stats">("book");
  const [panel, setPanel] = useState<"add" | "import" | Work | null>(works.length === 0 ? "add" : null);
  const [note, setNote] = useState<{ work: Work; student: Student } | null>(null);
  const [saving, start] = useTransition();
  const [savedOnce, setSavedOnce] = useState(false);
  const base = useMemo<Scores>(() => new Map(grades.map((g) => [key(g.assessment_id, g.student_id), g.points])), [grades]);
  const comments = useMemo(() => new Map(grades.filter((g) => g.comment).map((g) => [key(g.assessment_id, g.student_id), g.comment])), [grades]);
  const [scores, apply] = useOptimistic(base, (m: Scores, [k, v]: [string, number | null]) => {
    const next = new Map(m);
    if (v == null) next.delete(k);
    else next.set(k, v);
    return next;
  });

  const save = (work: Work, studentId: string, points: number | null) =>
    start(async () => {
      apply([key(work.id, studentId), points]);
      const r = await setGrade(work.id, studentId, points);
      if (!r.ok) toast.error(r.message ?? t.common.error);
      else setSavedOnce(true);
    });

  const totals = students.map((s) =>
    courseScore(works.map((w) => ({ max_points: w.max_points, category: w.category, points: scores.get(key(w.id, s.id)) ?? null }))),
  );
  const mean = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const csv = [
    [t.grades.student, ...works.map((w) => `${t.grades[w.category]}: ${w.title} (${fmtPoints(w.max_points)})`), t.grades.total, ""],
    ...students.map((s, i) => [
      s.full_name,
      ...works.map((w) => {
        const v = scores.get(key(w.id, s.id));
        return v == null ? "" : fmtPoints(v);
      }),
      totals[i] ?? "",
      totals[i] != null ? letter(totals[i]) : "",
    ]),
  ];

  const focusCell = (row: number, col: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
    if (el) el.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <p className="text-[13px] text-muted">
            {groupName} · {t.teacher.students(students.length)}
            {(saving || savedOnce) && <span className="ml-2">· {saving ? t.grades.saving : t.common.saved}</span>}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {works.length > 0 && students.length > 0 && <ExportCsv filename={`${title} ${groupName} — ${t.grades.title}`} rows={csv} label={t.grades.export} />}
          {works.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPanel(panel === "import" ? null : "import")}>
              <FileUp size={14} /> {t.grades.import}
            </Button>
          )}
          {panel !== "add" && (
            <Button size="sm" onClick={() => setPanel("add")} className="flex-1 sm:flex-none">
              <Plus size={16} /> {t.grades.addWork}
            </Button>
          )}
        </div>
      </div>

      {works.length > 0 && students.length > 0 && (
        <div className="flex gap-1 border-b border-border px-4 py-2 sm:px-5" role="tablist">
          {(["book", "stats"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", view === v ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
            >
              {v === "book" ? t.grades.tabBook : t.grades.tabStats}
            </button>
          ))}
        </div>
      )}

      {panel === "import" ? (
        <GradeImport courseId={courseId} groupId={groupId} works={works} students={students} onDone={() => setPanel(null)} />
      ) : (
        panel && <WorkForm key={panel === "add" ? "add" : panel.id} courseId={courseId} work={panel === "add" ? null : panel} onDone={() => setPanel(null)} canClose={works.length > 0} />
      )}

      {students.length === 0 ? (
        <div className="p-5">
          <Empty title={t.grades.noStudents} />
        </div>
      ) : works.length === 0 ? (
        <div className="p-5">
          <Empty icon="📝" title={t.grades.noWorksTeacher} />
        </div>
      ) : view === "stats" ? (
        <GradeStats works={works} students={students} scores={scores} totals={totals} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left align-bottom">
                  <th className="sticky left-0 z-10 min-w-40 bg-surface px-4 py-3 text-[13px] font-medium text-muted sm:min-w-56 sm:px-5">{t.grades.student}</th>
                  {works.map((w) => (
                    <th key={w.id} className="min-w-24 px-1 py-2 font-normal">
                      <button
                        type="button"
                        onClick={() => setPanel(w)}
                        title={`${w.title} — ${t.grades.editWork}`}
                        className={cn(
                          "group flex w-full flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-center transition-colors hover:bg-surface-2",
                          typeof panel === "object" && panel?.id === w.id && "bg-surface-2",
                        )}
                      >
                        <span className="rounded bg-surface-2 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted group-hover:bg-surface">{t.grades[w.category]}</span>
                        <span className="line-clamp-2 max-w-32 text-[13px] font-medium leading-tight">{w.title}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">
                          {t.grades.outOf(fmtPoints(w.max_points))}
                          <Pencil size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="min-w-20 px-4 py-3 text-right text-[13px] font-medium text-muted sm:px-5">{t.grades.total}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, row) => {
                  const total = totals[row];
                  return (
                    <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-surface-2/50">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-1.5 sm:px-5">
                        <span className="flex items-center gap-3">
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{row + 1}</span>
                          <span className="truncate">{s.full_name}</span>
                        </span>
                      </td>
                      {works.map((w, col) => {
                        const k = key(w.id, s.id);
                        const value = scores.get(k) ?? null;
                        const comment = comments.get(k);
                        return (
                          <td key={w.id} className="group/cell relative px-1 py-1.5 text-center">
                            <GradeCell
                              cell={`${row}:${col}`}
                              label={`${s.full_name} — ${w.title}`}
                              value={value}
                              max={w.max_points}
                              onSave={(v) => save(w, s.id, v)}
                              onMove={(dRow) => focusCell(row + dRow, col)}
                            />
                            {value != null && (
                              <button
                                type="button"
                                onClick={() => setNote({ work: w, student: s })}
                                title={comment || t.grades.commentAdd}
                                aria-label={t.grades.commentAdd}
                                className={cn(
                                  "absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-md transition-opacity",
                                  comment ? "text-accent opacity-100" : "text-muted opacity-0 hover:bg-surface-2 focus:opacity-100 group-hover/cell:opacity-100",
                                )}
                              >
                                <MessageSquare size={11} fill={comment ? "currentColor" : "none"} />
                              </button>
                            )}
                            {note?.work.id === w.id && note.student.id === s.id && (
                              <CommentPopover workId={w.id} studentId={s.id} label={`${s.full_name} — ${w.title}`} initial={comment ?? ""} onClose={() => setNote(null)} />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-1.5 text-right tabular-nums sm:px-5">
                        {total == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            <b className="font-semibold">{total}</b> <span className="text-xs text-muted">{letter(total)}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border text-[13px] text-muted">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 font-medium sm:px-5">{t.grades.groupAverage}</td>
                  {works.map((w) => {
                    const avg = mean(students.map((s) => scores.get(key(w.id, s.id))));
                    return (
                      <td key={w.id} className="px-1 py-2.5 text-center tabular-nums">
                        {avg != null ? fmtPoints(Math.round(avg * 10) / 10) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">{mean(totals) != null ? Math.round(mean(totals) as number) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-border px-4 py-3 text-[13px] text-muted sm:px-5">
            {t.grades.hint} · {t.grades.formula}
          </p>
        </>
      )}
    </Card>
  );
}

function GradeCell({
  cell,
  label,
  value,
  max,
  onSave,
  onMove,
}: {
  cell: string;
  label: string;
  value: number | null;
  max: number;
  onSave: (v: number | null) => void;
  onMove: (dRow: number) => void;
}) {
  const { t } = useT();
  // Text being typed; null while the cell just shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : fmtPoints(value));
  const invalid = draft != null && parsePoints(draft, max) === undefined;

  const commit = () => {
    if (draft == null) return;
    const v = parsePoints(draft, max);
    setDraft(null);
    if (v === undefined) toast.error(t.grades.outOfRange(max));
    else if (v !== value) onSave(v);
  };

  return (
    <input
      data-cell={cell}
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      placeholder="—"
      onFocus={(e) => {
        setDraft(shown);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          onMove(e.shiftKey ? -1 : 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onMove(-1);
        } else if (e.key === "Escape") setDraft(null);
      }}
      className={cn(
        "h-9 w-16 rounded-lg border border-transparent bg-transparent text-center text-[15px] tabular-nums transition-colors placeholder:text-muted/50 hover:bg-surface-2 focus:border-fg/40 focus:bg-field focus:outline-none",
        invalid && "border-danger focus:border-danger",
      )}
    />
  );
}

/** A small card under the cell to write the comment the student sees under this grade. */
function CommentPopover({ workId, studentId, label, initial, onClose }: { workId: string; studentId: string; label: string; initial: string; onClose: () => void }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const [text, setText] = useState(initial);
  return (
    <div className="absolute left-1/2 top-full z-30 mt-1 w-72 -translate-x-1/2 rounded-2xl border border-border bg-surface p-3 text-left shadow-[0_18px_40px_-16px_rgba(0,0,0,0.35)]">
      <p className="mb-2 truncate text-[12px] text-muted">{label}</p>
      <Textarea
        autoFocus
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        placeholder={t.grades.commentPlaceholder}
        className="min-h-20 text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => setGradeComment(workId, studentId, text), onClose)}>
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}

function WorkForm({ courseId, work, onDone, canClose }: { courseId: string; work: Work | null; onDone: () => void; canClose: boolean }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <form
      action={(fd) => run(() => (work ? updateAssessment(fd) : createAssessment(fd)), onDone)}
      className="grid gap-3 border-b border-border bg-surface-2/60 px-4 py-4 sm:grid-cols-[1fr_11rem_7rem_auto] sm:items-end sm:px-5"
    >
      <input type="hidden" name="course_id" value={courseId} />
      {work && <input type="hidden" name="id" value={work.id} />}
      <Field label={work ? t.grades.editWork : t.grades.workTitle}>
        <Input name="title" required maxLength={120} defaultValue={work?.title} placeholder={t.grades.workExample} autoFocus />
      </Field>
      <Field label={t.grades.category}>
        <Select name="category" defaultValue={work?.category ?? "rk1"}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t.grades.catLong[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.grades.maxPoints}>
        <Input name="max" type="number" required min={0.5} max={1000} step={0.5} defaultValue={work ? fmtPoints(work.max_points) : 100} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
          {work ? t.common.save : t.common.add}
        </Button>
        {work && (
          <Button
            type="button"
            variant="danger"
            size="icon"
            disabled={pending}
            aria-label={t.common.delete}
            title={t.common.delete}
            onClick={() => confirm(t.grades.deleteWork) && run(() => deleteAssessment(work.id), onDone)}
          >
            <Trash2 size={16} />
          </Button>
        )}
        {canClose && (
          <Button type="button" variant="ghost" size="icon" onClick={onDone} aria-label={t.common.cancel}>
            <X size={16} />
          </Button>
        )}
      </div>
    </form>
  );
}
