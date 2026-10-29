"use client";

import { useState } from "react";
import { AlertTriangle, CalendarRange, Check, CircleCheck, Globe2, X } from "lucide-react";
import { Badge, Button, Card, Field, Textarea, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { pairLabel, type Clash, type Slot, type Subject } from "@/lib/applications";
import { DAY, formatDateTime, formatDay, fromZoned } from "@/lib/time";
import { approveTeacher, rejectTeacher } from "../actions";

export type ApplicationView = {
  id: string;
  full_name: string;
  email: string;
  /** Not a university address: nobody has verified it. */
  outside: boolean;
  note: string;
  starts_on: string;
  ends_on: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  reviewer: string | null;
  reviewed_at: string | null;
  subjects: (Omit<Subject, "slots"> & { slots: (Slot & { classes: number; clashes: Clash[] })[] })[];
  classes: number;
  clashes: number;
};

const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return fromZoned(y, m, d);
};
const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

/** One application under review: who, what and when, overlaps with the timetable, approve or reject with a reason. */
export function ApplicationCard({ a, groups }: { a: ApplicationView; groups: Record<string, string> }) {
  const { t, locale } = useT();
  const [pending, run] = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const weeks = Math.ceil((day(a.ends_on).getTime() - day(a.starts_on).getTime() + DAY) / (7 * DAY));

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <header className="flex items-start gap-4 px-5 pb-4 pt-5 sm:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{initials(a.full_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-tight">{a.full_name}</p>
          <p className="mt-0.5 text-[13px] text-muted [overflow-wrap:anywhere]">{a.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.outside && (
              <Badge tone="yellow">
                <Globe2 size={12} /> {t.applications.outside}
              </Badge>
            )}
            <Badge>{t.applications.sent(formatDateTime(new Date(a.created_at), locale))}</Badge>
          </div>
        </div>
      </header>

      {(a.note || a.outside) && (
        <div className="mx-5 mb-4 space-y-2 sm:mx-6">
          {a.note && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
              <span className="block text-[12px] font-medium text-muted">{t.applications.note}</span>
              {a.note}
            </p>
          )}
          {a.outside && <p className="text-[13px] text-warn">{t.applications.unverified}</p>}
        </div>
      )}

      <div className="space-y-4 border-t border-border px-5 py-4 sm:px-6">
        {a.subjects.map((s, i) => (
          <section key={i}>
            <p className="font-medium">
              {s.title}
              <span className="font-normal text-muted">
                {s.code && ` · ${s.code}`} · {t.grades.credits(s.credits)}
              </span>
            </p>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {s.slots.map((sl, j) => (
                <li key={j} className={cn("px-3.5 py-2.5 text-sm", sl.clashes.length > 0 && "bg-danger-soft/40")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="w-7 font-semibold">{t.apply.days[sl.weekday]}</span>
                    <span className="tabular-nums">{pairLabel(sl.start)}</span>
                    <span className="text-muted" aria-hidden>
                      ·
                    </span>
                    <span className={cn(!groups[sl.group_id] && "text-danger")}>{groups[sl.group_id] ?? t.applications.groupGone}</span>
                    <span className="text-muted" aria-hidden>
                      ·
                    </span>
                    <span className="text-muted">{sl.room ? `${t.common.room} ${sl.room}` : t.applications.noRoom}</span>
                    <span className="ml-auto text-[12px] tabular-nums text-muted">{t.apply.classes(sl.classes)}</span>
                  </div>
                  {sl.clashes.map((c) => (
                    <p key={`${c.kind}${c.course}${c.room}`} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        {c.kind === "group" ? t.applications.clashGroup(c.course, c.teacher) : t.applications.clashRoom(c.room, c.course)}
                        <span className="opacity-70"> · {t.applications.weeksShort(c.weeks)}</span>
                      </span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="space-y-4 border-t border-border bg-surface-2/50 px-5 py-4 sm:px-6">
        <div className="grid gap-1 text-sm">
          <p className="flex items-center gap-2 text-muted">
            <CalendarRange size={15} className="shrink-0" />
            {t.applications.period}: {formatDay(day(a.starts_on), locale)} — {formatDay(day(a.ends_on), locale)} · {t.apply.weeks(weeks)}
          </p>
          <p className="font-medium">{t.applications.total(a.subjects.length, a.classes)}</p>
          <p className={cn("flex items-center gap-1.5", a.clashes ? "text-danger" : "text-ok")}>
            {a.clashes ? <AlertTriangle size={15} /> : <CircleCheck size={15} />}
            {a.clashes ? t.applications.clashes(a.clashes) : t.applications.noClashes}
          </p>
        </div>

        {rejecting ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => rejectTeacher(a.id, reason));
            }}
          >
            <Field label={t.applications.reason}>
              <Textarea autoFocus maxLength={500} placeholder={t.applications.reasonPh} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRejecting(false)} disabled={pending}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="danger" className="border border-danger/30" disabled={pending}>
                <X size={16} /> {t.applications.rejectSend}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" disabled={pending} onClick={() => confirm(t.applications.approveConfirm(a.full_name)) && run(() => approveTeacher(a.id))}>
              <Check size={16} /> {t.applications.approve}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
              <X size={16} /> {t.applications.reject}
            </Button>
          </div>
        )}
      </footer>
    </Card>
  );
}

/** Decided applications, newest first: who decided, when, and the reason given. */
export function DecidedList({ items }: { items: ApplicationView[] }) {
  const { t, locale } = useT();
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <ul>
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0 sm:px-6">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium">
                {a.full_name} <span className="font-normal text-muted [overflow-wrap:anywhere]">· {a.email}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{a.subjects.map((s) => s.title).join(", ")}</p>
              {a.review_note && <p className="mt-1.5 text-[13px]">«{a.review_note}»</p>}
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <Badge tone={a.status === "approved" ? "green" : "red"}>{a.status === "approved" ? t.applications.approved : t.applications.rejected}</Badge>
              {a.reviewed_at && <span className="text-[12px] text-muted">{t.applications.by(a.reviewer ?? "—", formatDateTime(new Date(a.reviewed_at), locale))}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
