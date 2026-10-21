import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, ExternalLink, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { deadlineById } from "@/lib/queries";
import { formatDateTime, formatLongDay, formatTime } from "@/lib/time";
import { DeadlineItem } from "@/components/bits";
import { DeadlineOpenTracker } from "@/components/metrics-tracker";
import { Badge, Card, CourseDot, buttonClass } from "@/components/ui";
import { DeletePersonal } from "./delete-personal";
import { SubmissionCard } from "./submission";

export const metadata: Metadata = { title: "Дедлайн" };

export default async function DeadlinePage({ params, searchParams }: PageProps<"/deadlines/[id]">) {
  const user = await requireUser("student");
  const { t, locale } = await getT();
  const { id } = await params;
  const { from } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await deadlineById(user, id);
  if (!d) notFound();
  const due = new Date(d.due_at);
  const upcoming = d.reminders.filter((r) => !r.sent_at && !d.done_at);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <DeadlineOpenTracker deadlineId={d.id} fromReminder={from === "reminder"} />
      <Link href="/deadlines" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft size={16} /> {t.deadlines.back}
      </Link>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <CourseDot color={d.color ?? "#8C80EF"} /> {d.course_title ?? t.common.personal}
          {d.course_code && <span>· {d.course_code}</span>}
          {d.source === "canvas" && <Badge tone="outline">Canvas</Badge>}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{d.title}</h1>
      </div>

      <DeadlineItem d={{ ...d, due_at: due.toISOString(), done: !!d.done_at, files: !!d.file_types }} compact />

      <Card className="space-y-3">
        <div>
          <p className="text-xs text-muted">{t.deadlines.due}</p>
          <p className="text-lg font-bold capitalize">
            {formatLongDay(due, locale)}, {formatTime(due, locale)} <span className="text-sm font-normal text-muted">(Алматы)</span>
          </p>
        </div>
        {d.teacher_name && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <UserRound size={16} /> {d.teacher_name}
          </p>
        )}
        {d.description && <p className="whitespace-pre-line">{d.description}</p>}
        {d.link && (
          <a href={d.link} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
            <ExternalLink size={14} /> {t.deadlines.openLink}
          </a>
        )}
      </Card>

      {d.file_types && (
        <SubmissionCard
          deadlineId={d.id}
          due={due.toISOString()}
          formats={d.file_types}
          allowLate={d.allow_late}
          files={d.files.map((f) => ({ ...f, uploaded_at: new Date(f.uploaded_at).toISOString() }))}
        />
      )}

      <Card>
        <p className="mb-2 flex items-center gap-2 font-bold">
          <BellRing size={16} /> {t.deadlines.reminders}
        </p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{t.deadlines.noReminders}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {upcoming.map((r) => (
              <li key={new Date(r.send_at).toISOString()} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-lavender" />
                {t.deadlines.reminderAt(formatDateTime(new Date(r.send_at), locale))}
                {r.kind === "urgent" && <Badge tone="solid">{t.notif.urgent}</Badge>}
              </li>
            ))}
          </ul>
        )}
        <Link href="/profile#notifications" className="mt-3 inline-block text-sm font-semibold text-muted hover:text-fg">
          {t.profile.when} →
        </Link>
      </Card>

      {d.owner_id === user.id && <DeletePersonal id={d.id} />}
    </div>
  );
}
