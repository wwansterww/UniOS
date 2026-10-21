import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { myCourses, studentDeadlines } from "@/lib/queries";
import { DeadlineItem } from "@/components/bits";
import { CourseDot, Empty, PageTitle, cn } from "@/components/ui";
import { PersonalTaskForm } from "./personal-task-form";

export const metadata: Metadata = { title: "Дедлайны" };

type Status = "todo" | "done" | "overdue";

export default async function DeadlinesPage({ searchParams }: PageProps<"/deadlines">) {
  const user = await requireUser("student");
  const { t } = await getT();
  const sp = await searchParams;
  const status: Status = sp.status === "done" || sp.status === "overdue" ? sp.status : "todo";
  const course = typeof sp.course === "string" ? sp.course : "";
  const now = new Date();
  const [all, courses] = await Promise.all([studentDeadlines(user), myCourses(user)]);

  const byStatus = {
    todo: all.filter((d) => !d.done_at && new Date(d.due_at) >= now),
    done: all.filter((d) => d.done_at).sort((a, b) => +new Date(b.due_at) - +new Date(a.due_at)),
    overdue: all.filter((d) => !d.done_at && new Date(d.due_at) < now).sort((a, b) => +new Date(b.due_at) - +new Date(a.due_at)),
  };
  const list = byStatus[status].filter((d) => !course || (course === "personal" ? !d.course_id : d.course_id === course));
  const href = (p: { status?: Status; course?: string }) => {
    const q = new URLSearchParams();
    const s = p.status ?? status;
    const c = p.course ?? course;
    if (s !== "todo") q.set("status", s);
    if (c) q.set("course", c);
    return `/deadlines${q.size ? `?${q}` : ""}`;
  };
  const tabs: [Status, string][] = [
    ["todo", t.deadlines.todo],
    ["done", t.deadlines.done],
    ["overdue", t.deadlines.overdue],
  ];
  const empty = { todo: [t.deadlines.emptyTodo, "🎉"], done: [t.deadlines.emptyDone, "📭"], overdue: [t.deadlines.emptyOverdue, "💪"] }[status];

  return (
    <div>
      <PageTitle action={<PersonalTaskForm />}>{t.deadlines.title}</PageTitle>

      <div className="mb-3 flex gap-1 rounded-2xl bg-surface-2 p-1">
        {tabs.map(([s, label]) => (
          <Link
            key={s}
            href={href({ status: s })}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition",
              s === status ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {label}
            <span className={cn("rounded-full px-1.5 text-xs", s === "overdue" && byStatus.overdue.length ? "bg-danger-soft text-danger" : "bg-border/60")}>
              {byStatus[s].length}
            </span>
          </Link>
        ))}
      </div>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip href={href({ course: "" })} active={!course}>
          {t.deadlines.allCourses}
        </Chip>
        {courses.map((c) => (
          <Chip key={c.id} href={href({ course: c.id })} active={course === c.id}>
            <CourseDot color={c.color} /> {c.title}
          </Chip>
        ))}
        <Chip href={href({ course: "personal" })} active={course === "personal"}>
          {t.common.personal}
        </Chip>
      </div>

      {list.length === 0 ? (
        <Empty icon={empty[1]} title={empty[0]} />
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <DeadlineItem key={d.id} d={{ ...d, due_at: new Date(d.due_at).toISOString(), done: !!d.done_at, files: !!d.file_types }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
        active ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
