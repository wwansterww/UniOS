"use client";

import { useRef, useState } from "react";
import { ArrowRightLeft, Ban, DoorOpen, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { Badge, Button, Field, Input, Select, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { formatShort, formatTime, toLocalInput } from "@/lib/time";
import { addClass, cancelClass, changeRoom, deleteClass, importScheduleCsv, moveClass } from "../actions";

type Course = { id: string; title: string; groups: { id: string; name: string }[] };

export function AddClassForm({ courses, today }: { courses: Course[]; today: string }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const groups = courses.find((c) => c.id === courseId)?.groups ?? [];
  const csv = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-5">
      <form action={(fd) => run(() => addClass(fd))} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.common.course}>
          <Select name="course_id" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.common.group}>
          <Select name="group_id" required>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.common.date}>
          <Input name="date" type="date" required defaultValue={today} />
        </Field>
        <Field label={t.common.room}>
          <Input name="room" placeholder="305" />
        </Field>
        <Field label={t.common.from}>
          <Input name="start" type="time" required defaultValue="09:30" />
        </Field>
        <Field label={t.common.to}>
          <Input name="end" type="time" required defaultValue="10:45" />
        </Field>
        <Field label={t.teacher.repeat}>
          <Input name="weeks" type="number" min={1} max={20} defaultValue={15} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending || groups.length === 0} className="w-full">
            <Plus size={16} /> {t.teacher.addClass}
          </Button>
        </div>
      </form>
      <form ref={csv} action={(fd) => run(() => importScheduleCsv(fd), () => csv.current?.reset())} className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <label className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1">
          <span className="text-sm font-semibold">{t.teacher.csv}</span>
          <input name="file" type="file" accept=".csv,text/csv" required className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:font-semibold file:text-fg" />
          <span className="text-xs text-muted">{t.teacher.csvHint}</span>
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          <Upload size={16} /> {t.teacher.csv}
        </Button>
      </form>
    </div>
  );
}

type Session = {
  id: string;
  course_title: string;
  color: string;
  group_name: string;
  starts_at: string;
  ends_at: string;
  room: string;
  status: string;
  original_starts_at: string | null;
  original_room: string | null;
};

export function SessionRow({ s }: { s: Session }) {
  const { t, locale } = useT();
  const [pending, run] = useAction();
  const [mode, setMode] = useState<"" | "move" | "room">("");
  const cancelled = s.status === "cancelled";

  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-3", cancelled && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-10 w-1.5 rounded-full" style={{ background: s.color }} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", cancelled && "line-through")}>
            {formatTime(new Date(s.starts_at), locale)}–{formatTime(new Date(s.ends_at), locale)} · {s.course_title}
          </p>
          <p className="text-xs text-muted">
            {s.group_name} · {t.common.room} {s.room}
            {s.original_starts_at && (
              <>
                {" "}
                · {t.schedule.was}: <s>{formatShort(new Date(s.original_starts_at), locale)}</s>
              </>
            )}
            {s.original_room && (
              <>
                {" "}
                · <s>{s.original_room}</s>
              </>
            )}
          </p>
        </div>
        {s.status === "moved" && <Badge tone="yellow">{t.schedule.moved}</Badge>}
        {cancelled && <Badge tone="red">{t.schedule.cancelled}</Badge>}
        <div className="flex gap-1">
          {!cancelled && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode(mode === "move" ? "" : "move")} title={t.teacher.move}>
                <ArrowRightLeft size={14} /> <span className="hidden sm:inline">{t.teacher.move}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode(mode === "room" ? "" : "room")} title={t.teacher.changeRoom}>
                <DoorOpen size={14} /> <span className="hidden sm:inline">{t.common.room}</span>
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(t.teacher.cancelClass + "?") && run(() => cancelClass(s.id))} title={t.teacher.cancelClass}>
                <Ban size={14} /> <span className="hidden sm:inline">{t.teacher.cancelClass}</span>
              </Button>
            </>
          )}
          {cancelled && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => cancelClass(s.id, true))}>
              <RotateCcw size={14} /> {t.teacher.restore}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(t.common.delete + "?") && run(() => deleteClass(s.id))} aria-label={t.common.delete}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {mode === "move" && (
        <form action={(fd) => run(() => moveClass(fd), () => setMode(""))} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <input type="hidden" name="id" value={s.id} />
          <Field label={t.teacher.move}>
            <Input name="starts" type="datetime-local" required defaultValue={toLocalInput(new Date(s.starts_at))} />
          </Field>
          <Field label={t.teacher.newRoom}>
            <Input name="room" defaultValue={s.room} className="w-28" />
          </Field>
          <Button type="submit" disabled={pending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setMode("")} aria-label={t.common.cancel}>
            <X size={16} />
          </Button>
        </form>
      )}
      {mode === "room" && (
        <form action={(fd) => run(() => changeRoom(fd), () => setMode(""))} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <input type="hidden" name="id" value={s.id} />
          <Field label={t.teacher.newRoom}>
            <Input name="room" required autoFocus className="w-32" />
          </Field>
          <Button type="submit" disabled={pending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setMode("")} aria-label={t.common.cancel}>
            <X size={16} />
          </Button>
        </form>
      )}
    </div>
  );
}
