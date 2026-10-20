"use client";

import { useState } from "react";
import { Check, ChevronDown, MessageSquare, RotateCcw, Sparkles, X as XIcon } from "lucide-react";
import { Button, Card, CourseDot, Empty, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import {
  ADMISSION_MIN,
  CATEGORIES,
  LETTER_MIN,
  courseResult,
  examNeeded,
  fmtGpa,
  fmtPoints,
  gpa,
  gpaPoints,
  letter,
  parsePoints,
  termParts,
  type Category,
} from "@/lib/journal";

type Work = { id: string; title: string; max_points: number; category: Category; points: number | null; comment: string };
export type GradesCourse = { id: string; title: string; code: string; color: string; credits: number; term: string; teacher_name: string | null; works: Work[] };

/** Letters shown in the exam calculator. */
const TARGETS = LETTER_MIN.slice(0, 7);

/**
 * Grades of a student: GPA for the semester and overall, a card per course with midterms, admission rating,
 * what the exam needs for each letter, teacher comments — plus a "what if" mode that never saves anything.
 */
export function GradesView({ courses, term }: { courses: GradesCourse[]; term: string }) {
  const { t } = useT();
  const [whatIf, setWhatIf] = useState(false);
  const [guess, setGuess] = useState<Record<string, string>>({});

  const rows = courses.map((c) => {
    const works = c.works.map((w) => {
      const guessed = w.points == null && whatIf && c.term === term ? parsePoints(guess[w.id] ?? "", w.max_points) : null;
      return { ...w, value: w.points ?? guessed ?? null, guessed: guessed != null };
    });
    const res = courseResult(works.map((w) => ({ max_points: w.max_points, points: w.value, category: w.category })));
    return { ...c, works, res, score: res.score, projected: works.some((w) => w.guessed) };
  });
  const current = rows.filter((c) => c.term === term);
  const past = [...new Set(rows.filter((c) => c.term < term).map((c) => c.term))].sort().reverse();
  const termGpa = gpa(current);
  const overall = gpa(rows);
  const anyGuess = rows.some((c) => c.projected);
  const canWhatIf = current.some((c) => c.works.some((w) => w.points == null));

  if (courses.length === 0) return <Empty icon="📚" title={t.grades.noCourses} />;

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="grid grid-cols-3 divide-x divide-border">
          <Stat label={t.grades.termGpa} value={termGpa != null ? fmtGpa(termGpa) : "—"} accent projected={anyGuess} projectedLabel={t.grades.projected} />
          <Stat label={t.grades.overallGpa} value={overall != null ? fmtGpa(overall) : "—"} />
          <Stat label={t.grades.creditsTotal} value={String(current.reduce((a, c) => a + c.credits, 0))} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-[13px] text-muted">{whatIf ? t.grades.whatIfHint : t.grades.formula}</p>
          {whatIf ? (
            <div className="flex gap-2">
              {anyGuess && (
                <Button variant="ghost" size="sm" onClick={() => setGuess({})}>
                  <RotateCcw size={14} /> {t.grades.whatIfReset}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setWhatIf(false);
                  setGuess({});
                }}
              >
                {t.grades.whatIfExit}
              </Button>
            </div>
          ) : (
            canWhatIf && (
              <Button variant="outline" size="sm" onClick={() => setWhatIf(true)}>
                <Sparkles size={14} /> {t.grades.whatIf}
              </Button>
            )
          )}
        </div>
      </Card>

      {current.map((c) => (
        <Card key={c.id} className={cn("overflow-hidden p-0 sm:p-0", c.projected && "border-fg/30")}>
          <div className="flex items-center gap-4 px-5 pt-4 sm:px-6">
            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-tight">{c.title}</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {c.code}
                {c.teacher_name && ` · ${c.teacher_name}`} · {t.grades.credits(c.credits)}
              </p>
            </div>
            {c.score != null ? (
              <div className="shrink-0 text-right">
                <p className="font-display text-[1.9rem] font-semibold leading-none tabular-nums">{c.score}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {letter(c.score)} · {fmtGpa(gpaPoints(c.score))}
                </p>
              </div>
            ) : (
              <span className="shrink-0 text-sm text-muted">{t.grades.noWorks}</span>
            )}
          </div>

          {/* Midterms, exam and the admission rating at a glance */}
          <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4 pt-3 sm:px-6">
            {CATEGORIES.map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[13px]">
                <span className="text-muted">{t.grades[cat]}</span>
                <b className="font-semibold tabular-nums">{c.res[cat] ?? "—"}</b>
              </span>
            ))}
            {c.res.admission != null &&
              (c.res.admission >= ADMISSION_MIN ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-ok-soft px-2.5 py-1 text-[13px] text-ok">
                  <Check size={13} /> {t.grades.admission} {c.res.admission} · {t.grades.admitted}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-danger-soft px-2.5 py-1 text-[13px] text-danger">
                  <XIcon size={13} /> {t.grades.notAdmitted}
                </span>
              ))}
            {c.projected && <span className="rounded-lg border border-border px-2 py-1 text-[12px] text-muted">{t.grades.projected}</span>}
          </div>

          {/* What the exam needs for each letter */}
          {!c.res.final && c.res.admission != null && c.res.admission >= ADMISSION_MIN && (
            <div className="border-t border-border px-5 py-3 sm:px-6">
              <p className="mb-2 text-[13px] font-medium">{t.grades.examNeed}</p>
              <div className="flex flex-wrap gap-1.5">
                {TARGETS.map(([l, min]) => {
                  const need = examNeeded(c.res.admission!, min);
                  return (
                    <span
                      key={l}
                      className={cn(
                        "inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] tabular-nums",
                        need == null ? "border-border text-muted/60" : need === 0 ? "border-ok/30 bg-ok-soft text-ok" : "border-border",
                      )}
                    >
                      <b className="font-semibold">{l}</b>
                      {need == null ? t.grades.unreachable : need === 0 ? t.grades.guaranteed : `${need}+`}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {c.works.length > 0 && (
            <ul className="border-t border-border">
              {CATEGORIES.filter((cat) => c.works.some((w) => w.category === cat)).map((cat) => (
                <li key={cat}>
                  <p className="bg-surface-2/60 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:px-6">{t.grades.catLong[cat]}</p>
                  <ul>
                    {c.works
                      .filter((w) => w.category === cat)
                      .map((w) => (
                        <li key={w.id} className="border-b border-border px-5 py-2.5 text-sm last:border-b-0 sm:px-6">
                          <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1">{w.title}</span>
                            <span className="flex shrink-0 items-center tabular-nums">
                              {w.points != null ? (
                                <b className="font-semibold">{fmtPoints(w.points)}</b>
                              ) : whatIf ? (
                                <input
                                  inputMode="decimal"
                                  autoComplete="off"
                                  aria-label={w.title}
                                  placeholder="?"
                                  value={guess[w.id] ?? ""}
                                  onChange={(e) => setGuess((g) => ({ ...g, [w.id]: e.target.value }))}
                                  className={cn(
                                    "h-8 w-14 rounded-lg border border-dashed border-fg/30 bg-field text-center text-sm font-semibold tabular-nums focus:border-fg/60 focus:outline-none",
                                    guess[w.id] && parsePoints(guess[w.id], w.max_points) === undefined && "border-danger",
                                  )}
                                />
                              ) : (
                                <span className="text-muted">{t.grades.notGraded}</span>
                              )}
                              <span className="ml-1 text-muted">/ {fmtPoints(w.max_points)}</span>
                            </span>
                          </div>
                          {w.comment && (
                            <p className="mt-1.5 flex gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted">
                              <MessageSquare size={14} className="mt-0.5 shrink-0" aria-label={t.grades.comment} />
                              <span>{w.comment}</span>
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      {past.length > 0 && (
        <section className="pt-6">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{t.grades.history}</h2>
          <Card className="overflow-hidden p-0 sm:p-0">
            {past.map((pastTerm) => {
              const list = rows.filter((c) => c.term === pastTerm);
              const g = gpa(list);
              const { year, fall } = termParts(pastTerm);
              return (
                <details key={pastTerm} className="group border-b border-border last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-surface-2/60 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 font-medium">{t.grades.term(fall, year)}</span>
                    <span className="hidden text-[13px] text-muted sm:inline">{t.grades.credits(list.reduce((a, c) => a + c.credits, 0))}</span>
                    <span className="text-right font-display text-lg font-semibold tabular-nums">
                      {g != null ? fmtGpa(g) : "—"} <span className="text-xs font-medium text-muted">GPA</span>
                    </span>
                    <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="border-t border-border bg-surface-2/30">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm sm:px-6">
                        <CourseDot color={c.color} />
                        <span className="min-w-0 flex-1">{c.title}</span>
                        <span className="hidden text-[13px] text-muted sm:inline">{t.grades.credits(c.credits)}</span>
                        <span className="w-16 text-right tabular-nums">
                          {c.score != null ? (
                            <>
                              <b className="font-semibold">{c.score}</b> <span className="text-xs text-muted">{letter(c.score)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, accent, projected, projectedLabel }: { label: string; value: string; accent?: boolean; projected?: boolean; projectedLabel?: string }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted sm:text-[13px]">
        {label}
        {projected && <span className="rounded bg-surface-2 px-1 text-[11px] text-fg">{projectedLabel}</span>}
      </p>
      <p className={cn("mt-1.5 font-display font-semibold leading-none tabular-nums tracking-tight", accent ? "text-[2rem] text-accent sm:text-[2.5rem]" : "text-[1.6rem] sm:text-[2rem]")}>
        {value}
      </p>
    </div>
  );
}
