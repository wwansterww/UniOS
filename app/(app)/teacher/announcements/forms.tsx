"use client";

import { useRef, useState } from "react";
import { BellRing, ChevronDown, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { Badge, Button, CourseDot, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { formatDateTime } from "@/lib/time";
import { createAnnouncement, deleteAnnouncement, remindUnread, togglePin } from "../actions";

export function NewAnnouncementForm({ courses }: { courses: { id: string; title: string }[] }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={(fd) => run(() => createAnnouncement(fd), () => ref.current?.reset())} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <Field label={t.teacher.annTitle}>
          <Input name="title" required maxLength={300} />
        </Field>
        <Field label={t.common.course}>
          <Select name="course_id">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t.teacher.annBody}>
        <Textarea name="body" rows={3} />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="important" className="h-4 w-4 accent-[var(--danger)]" /> {t.teacher.important}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pinned" className="h-4 w-4 accent-[var(--lavender)]" /> {t.teacher.pin}
        </label>
      </div>
      <Button type="submit" variant="accent" disabled={pending || courses.length === 0}>
        <Send size={16} /> {t.teacher.publish}
      </Button>
    </form>
  );
}

type Ann = {
  id: string;
  course_title: string;
  color: string;
  title: string;
  body: string;
  is_important: boolean;
  is_pinned: boolean;
  created_at: string;
  total: number;
  reads: number;
  unread: { id: string; full_name: string }[];
};

export function AnnouncementStats({ a }: { a: Ann }) {
  const { t, locale } = useT();
  const [pending, run] = useAction();
  const [open, setOpen] = useState(false);
  const pct = a.total ? Math.round((a.reads / a.total) * 100) : 0;

  return (
    <article id={a.id} className="scroll-mt-20 rounded-3xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
        <CourseDot color={a.color} /> {a.course_title} · {formatDateTime(new Date(a.created_at), locale)}
        {a.is_pinned && (
          <Badge tone="lavender">
            <Pin size={11} /> {t.ann.pinned}
          </Badge>
        )}
        {a.is_important && <Badge tone="solid">{t.ann.important}</Badge>}
      </div>
      <h3 className="text-lg font-bold">{a.title}</h3>
      {a.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{a.body}</p>}

      <div className="mt-4 rounded-2xl bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">{t.teacher.readOf(a.reads, a.total)}</p>
          <span className="text-sm font-semibold">{pct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", pct === 100 ? "bg-ok" : "bg-lavender")} style={{ width: `${pct}%` }} />
        </div>
        {a.unread.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-ok">✓ {t.teacher.everyoneRead}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg" aria-expanded={open}>
              {t.teacher.unreadList} ({a.unread.length}) <ChevronDown size={14} className={cn("transition", open && "rotate-180")} />
            </button>
            <Button size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => remindUnread(a.id))}>
              <BellRing size={14} /> {t.teacher.remindThem}
            </Button>
          </div>
        )}
        {open && (
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {a.unread.map((u) => (
              <li key={u.id} className="truncate">
                • {u.full_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => togglePin(a.id))}>
          {a.is_pinned ? <PinOff size={14} /> : <Pin size={14} />} {a.is_pinned ? t.teacher.unpin : t.teacher.pin}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(t.common.delete + "?") && run(() => deleteAnnouncement(a.id))}>
          <Trash2 size={14} /> {t.common.delete}
        </Button>
      </div>
    </article>
  );
}
