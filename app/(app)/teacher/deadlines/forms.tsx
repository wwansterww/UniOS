"use client";

import { useRef, useState } from "react";
import { CalendarClock, Pencil, Send, Trash2, X, Zap } from "lucide-react";
import { Button, CourseDot, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { DueBadge, useNow } from "@/components/bits";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { addDays, formatDateTime, fromZoned, toLocalInput, zoned } from "@/lib/time";
import { createDeadline, deleteDeadline, updateDeadline } from "../actions";

type Course = { id: string; title: string; color: string; groups: { id: string; name: string; members: number }[] };

function quick(kind: "tomorrow" | "3d" | "week") {
  const now = new Date();
  const p = zoned(addDays(now, kind === "tomorrow" ? 1 : kind === "3d" ? 3 : 7));
  return toLocalInput(fromZoned(p.year, p.month, p.day, 23, 59));
}

export function NewDeadlineForm({ courses }: { courses: Course[] }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const form = useRef<HTMLFormElement>(null);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === courseId);
  const [groups, setGroups] = useState<string[]>(course?.groups.map((g) => g.id) ?? []);
  const [due, setDue] = useState(quick("tomorrow"));
  const [more, setMore] = useState(false);

  if (courses.length === 0) return <p className="text-sm text-muted">{t.teacher.noCourses}</p>;

  return (
    <form
      ref={form}
      action={(fd) =>
        run(
          () => createDeadline(fd),
          () => {
            form.current?.reset();
            setDue(quick("tomorrow"));
            setMore(false);
          },
        )
      }
      className="space-y-4"
    >
      <Input name="title" required placeholder={t.teacher.titleExample} className="h-12 text-base font-semibold" autoFocus />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.common.course}>
          <Select
            name="course_id"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setGroups(courses.find((c) => c.id === e.target.value)?.groups.map((g) => g.id) ?? []);
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.deadlines.due}>
          <Input name="due" type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tomorrow", t.teacher.quickTomorrow],
            ["3d", t.teacher.quick3d],
            ["week", t.teacher.quickWeek],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setDue(quick(k))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold",
              due === quick(k) ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg",
            )}
          >
            <Zap size={13} /> {label}
          </button>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t.common.groups}</p>
        <div className="flex flex-wrap gap-2">
          {course?.groups.map((g) => (
            <label
              key={g.id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
                groups.includes(g.id) ? "border-primary bg-primary text-primary-fg" : "border-border text-muted",
              )}
            >
              <input
                type="checkbox"
                name="group_ids"
                value={g.id}
                checked={groups.includes(g.id)}
                onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))}
                className="sr-only"
              />
              {g.name} <span className="opacity-70">· {g.members}</span>
            </label>
          ))}
          {course?.groups.length === 0 && <p className="text-sm text-muted">{t.teacher.attachGroup}</p>}
        </div>
      </div>
      {more ? (
        <div className="grid gap-3">
          <Field label={t.common.description}>
            <Textarea name="description" rows={3} />
          </Field>
          <Field label={t.common.link}>
            <Input name="link" type="url" placeholder="https://" />
          </Field>
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="text-sm font-semibold text-muted hover:text-fg">
          + {t.common.description} / {t.common.link}
        </button>
      )}
      <Button type="submit" size="lg" variant="accent" disabled={pending || groups.length === 0} className="w-full sm:w-auto">
        <Send size={16} /> {t.teacher.publish}
      </Button>
    </form>
  );
}

type Row = {
  id: string;
  title: string;
  due_at: string;
  description: string;
  link: string | null;
  course_title: string;
  color: string;
  group_names: string;
  total: number;
  done: number;
};

export function TeacherDeadlineRow({ d }: { d: Row }) {
  const { t, locale } = useT();
  const [pending, run] = useAction();
  const [edit, setEdit] = useState(false);
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const now = useNow();
  const past = new Date(d.due_at) < now;

  return (
    <div id={d.id} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <CourseDot color={d.color} /> {d.course_title} · {d.group_names}
          </p>
          <p className="font-semibold">{d.title}</p>
          <p className="text-xs text-muted">{formatDateTime(new Date(d.due_at), locale)}</p>
        </div>
        <DueBadge due={d.due_at} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-lavender" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-semibold text-muted">{t.teacher.doneOf(d.done, d.total)}</span>
      </div>
      {!edit ? (
        <div className="mt-3 flex gap-2">
          {!past && (
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil size={14} /> {t.common.edit} / {t.teacher.move}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => confirm(t.common.delete + "?") && run(() => deleteDeadline(d.id))}
          >
            <Trash2 size={14} /> {t.common.delete}
          </Button>
        </div>
      ) : (
        <form action={(fd) => run(() => updateDeadline(fd), () => setEdit(false))} className="mt-4 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="id" value={d.id} />
          <Field label={t.common.title}>
            <Input name="title" defaultValue={d.title} required />
          </Field>
          <Field label={t.deadlines.due} hint={t.teacher.moveHint}>
            <Input name="due" type="datetime-local" defaultValue={toLocalInput(new Date(d.due_at))} required />
          </Field>
          <Field label={t.common.description}>
            <Textarea name="description" defaultValue={d.description} rows={2} />
          </Field>
          <Field label={t.common.link}>
            <Input name="link" type="url" defaultValue={d.link ?? ""} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <CalendarClock size={14} /> {t.common.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
              <X size={14} /> {t.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

