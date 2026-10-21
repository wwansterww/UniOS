import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { duration } from "@/lib/i18n";
import { deadlineSubmissions } from "@/lib/queries";
import { fileSize, lateBy } from "@/lib/submissions";
import { formatDateTime } from "@/lib/time";
import { DueBadge } from "@/components/bits";
import { Badge, Card, CourseDot, Empty, SectionTitle } from "@/components/ui";
import { FileRulesForm } from "../file-rules";

export const metadata: Metadata = { title: "Работы" };

export default async function DeadlineWorksPage({ params }: PageProps<"/teacher/deadlines/[id]">) {
  const user = await requireUser("teacher");
  const { t, locale } = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await deadlineSubmissions(user, id);
  if (!d) notFound();
  const due = new Date(d.due_at);
  const now = new Date();
  const past = due < now;
  // A student's work is as late as their last file.
  const delay = (files: { uploaded_at: Date }[]) => (files.length ? lateBy(due, files[files.length - 1].uploaded_at) : 0);
  const handed = d.students.filter((s) => s.files.length > 0);
  const late = handed.filter((s) => delay(s.files) > 0).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/teacher/deadlines" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> {t.deadlines.back}
      </Link>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <CourseDot color={d.color} /> {d.course_title} · {d.course_code}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          {t.deadlines.due}: <span className="font-semibold text-fg">{formatDateTime(due, locale)}</span>
          <DueBadge due={due.toISOString()} />
        </p>
      </div>

      <Card>
        <FileRulesForm id={d.id} types={d.file_types} allowLate={d.allow_late} />
      </Card>

      {d.file_types && (
        <section>
          <SectionTitle
            action={
              <span className="text-sm text-muted">
                {t.submit.submittedOf(handed.length, d.students.length)}
                {late > 0 && <span className="font-semibold text-warn"> · {t.submit.lateCount(late)}</span>}
              </span>
            }
          >
            {t.submit.works}
          </SectionTitle>
          {d.students.length === 0 ? (
            <Empty icon="👥" title={t.submit.noStudents} />
          ) : (
            <Card className="overflow-hidden p-0 sm:p-0">
              <ul>
                {d.students.map((s) => {
                  const ms = delay(s.files);
                  return (
                    <li key={s.id} className="flex flex-col gap-2 border-b border-border px-5 py-3.5 last:border-b-0 sm:flex-row sm:gap-4 sm:px-6">
                      <div className="min-w-0 sm:w-52 sm:shrink-0">
                        <p className="font-medium">{s.full_name}</p>
                        <p className="text-xs text-muted">{s.group_name}</p>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        {s.files.length === 0 ? (
                          <Badge tone={past ? "red" : "neutral"}>{t.submit.notSubmitted}</Badge>
                        ) : (
                          <>
                            <Badge tone={ms ? "yellow" : "green"}>{ms ? t.submit.lateBy(duration(t, ms)) : t.submit.onTime}</Badge>
                            <ul className="space-y-1">
                              {s.files.map((f) => {
                                const fileLate = lateBy(due, f.uploaded_at);
                                return (
                                  <li key={f.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                    <a
                                      href={`/api/submissions/${f.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                                      title={t.submit.download}
                                    >
                                      <FileText size={14} className="shrink-0 text-muted" />
                                      <span className="break-all">{f.name}</span>
                                    </a>
                                    <span className="text-xs text-muted">
                                      {fileSize(f.size, locale)} · {formatDateTime(new Date(f.uploaded_at), locale)}
                                      {fileLate > 0 && <span className="text-warn"> · +{duration(t, fileLate)}</span>}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
