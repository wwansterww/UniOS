"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "./i18n";
import { CourseDot, cn } from "./ui";
import { duration, relative } from "@/lib/i18n";
import { formatDateTime, urgency } from "@/lib/time";
import { setDone } from "@/app/(app)/actions";

/** Re-renders every `ms` so relative times stay correct. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

type Wrap = "startsIn" | "endsIn" | "opensIn" | "closesIn";

/** Live countdown; `wrap` puts it into a phrase ("через 2 ч", "2 сағ кейін"). */
export function Countdown({ to, wrap, className }: { to: string; wrap?: Wrap; className?: string }) {
  const { t } = useT();
  const now = useNow(15_000);
  const left = duration(t, new Date(to).getTime() - now.getTime());
  const text =
    wrap === "startsIn" ? t.today.startsIn(left) : wrap === "endsIn" ? t.today.endsIn(left) : wrap === "opensIn" ? t.reg.opensIn(left) : wrap === "closesIn" ? t.reg.closesIn(left) : left;
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}

/** Relative due time as quiet text: red only when it is urgent or overdue. */
export function DueBadge({ due, done }: { due: string; done?: boolean }) {
  const { t, locale } = useT();
  const now = useNow();
  const d = new Date(due);
  if (done) return <span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">{t.deadlines.done}</span>;
  const u = urgency(d, now);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        u === "critical" && "bg-accent text-accent-fg shadow-[0_6px_14px_-6px_rgba(196,18,51,0.7)]",
        u === "overdue" && "bg-danger-soft text-danger",
        u === "soon" && "bg-warn-soft text-warn",
        u === "normal" && "bg-surface-2 text-muted",
      )}
      suppressHydrationWarning
    >
      {u === "critical" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />}
      {relative(t, locale, d, now)}
    </span>
  );
}

export interface DeadlineItemData {
  id: string;
  title: string;
  due_at: string;
  course_title: string | null;
  color: string | null;
  done: boolean;
  source?: string;
  link?: string | null;
}

export function DeadlineItem({ d, compact }: { d: DeadlineItemData; compact?: boolean }) {
  const { t, locale } = useT();
  // Optimistic: the checkbox flips instantly; the server render catches up (or it reverts on error).
  const [done, setOptimisticDone] = useOptimistic(d.done);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !done;
    start(async () => {
      setOptimisticDone(next);
      const r = await setDone(d.id, next);
      if (!r.ok) toast.error(t.common.error);
      else
        toast.success(next ? t.deadlines.doneToast : t.deadlines.undoToast, {
          action: next ? { label: t.deadlines.undo, onClick: () => setDone(d.id, false) } : undefined,
        });
    });
  };

  return (
    <div className="spotlight lift group flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card sm:px-5">
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? t.deadlines.undo : t.deadlines.markDone}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
          done ? "border-ok bg-ok text-white" : "border-fg/25 hover:border-accent hover:bg-accent-soft",
        )}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <Link href={`/deadlines/${d.id}`} className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-medium", done && "text-muted line-through")}>{d.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted" suppressHydrationWarning>
          <CourseDot color={d.color ?? "#9a9a96"} className="h-1.5 w-1.5" />
          <span className="truncate">
            {d.course_title ?? t.common.personal}
            {!compact && ` · ${formatDateTime(new Date(d.due_at), locale)}`}
            {d.source === "canvas" && " · Canvas"}
          </span>
        </span>
      </Link>
      <DueBadge due={d.due_at} done={done} />
    </div>
  );
}

/** "Пн 10:00 → Ср 12:00, ауд. 305" with the old value struck through. */
export function Change({ from, to }: { from?: string; to?: string }) {
  if (!from && !to) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      {from && <s className="text-muted">{from}</s>}
      <span aria-hidden>→</span>
      {to && <b>{to}</b>}
    </span>
  );
}
