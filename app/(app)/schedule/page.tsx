import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { sessionsBetween, type Session } from "@/lib/queries";
import { addDays, dateKey, formatDay, formatShort, formatTime, formatWeekday, fromZoned, startOfWeek, zoned } from "@/lib/time";
import { Badge, Empty, PageTitle, buttonClass, cn } from "@/components/ui";
import { NowLine } from "@/components/now-line";
import type { Dict, Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Расписание" };

/** Vertical scale of the desktop time grid. */
const PX_PER_MIN = 1.15;
const minuteOfDay = (d: Date) => {
  const p = zoned(d);
  return p.hour * 60 + p.minute;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Tinted background of a course colour, readable in both themes. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--surface))`;

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { week } = await searchParams;
  const now = new Date();
  const m = typeof week === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(week) : null;
  const anchor = m ? fromZoned(+m[1], +m[2], +m[3], 12) : now;
  const weekStart = startOfWeek(anchor);
  const sessions = await sessionsBetween(user, weekStart, addDays(weekStart, 7));

  // Mon–Fri always; weekend days only when something is scheduled on them.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d, i) => i < 5 || sessions.some((s) => dateKey(new Date(s.starts_at)) === dateKey(d)),
  );
  const byDay = (d: Date) => sessions.filter((s) => dateKey(new Date(s.starts_at)) === dateKey(d));
  const isThisWeek = dateKey(startOfWeek(now)) === dateKey(weekStart);
  const todayKey = dateKey(now);

  // Grid spans 08:00–18:30 at least, wider if a class starts earlier or ends later.
  const from = Math.min(8 * 60, ...sessions.map((s) => Math.floor(minuteOfDay(new Date(s.starts_at)) / 30) * 30));
  const to = Math.max(18 * 60 + 30, ...sessions.map((s) => Math.ceil(minuteOfDay(new Date(s.ends_at)) / 30) * 30));
  const slots = Array.from({ length: (to - from) / 30 + 1 }, (_, i) => from + i * 30);
  const height = (to - from) * PX_PER_MIN;

  return (
    <div>
      <PageTitle>{t.schedule.title}</PageTitle>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/schedule?week=${dateKey(addDays(weekStart, -7))}`} className={buttonClass("outline", "icon")} aria-label={t.schedule.prev}>
          <ChevronLeft size={18} />
        </Link>
        <Link href={`/schedule?week=${dateKey(addDays(weekStart, 7))}`} className={buttonClass("outline", "icon")} aria-label={t.schedule.next}>
          <ChevronRight size={18} />
        </Link>
        <p className="ml-1 text-sm font-medium">
          {formatDay(weekStart, locale)} — {formatDay(addDays(weekStart, 6), locale)}
        </p>
        {!isThisWeek && (
          <Link href="/schedule" className={buttonClass("ghost", "sm", "ml-auto")}>
            {t.schedule.thisWeek}
          </Link>
        )}
      </div>

      {sessions.length === 0 && <Empty icon="🗓️" title={t.schedule.emptyWeek} />}

      {/* Phone: list by day */}
      {sessions.length > 0 && (
        <div className="space-y-6 md:hidden">
          {days.map((d) => {
            const list = byDay(d);
            const isToday = dateKey(d) === todayKey;
            return (
              <section key={d.toISOString()}>
                <h2 className={cn("mb-2 flex items-center gap-2 text-sm font-medium capitalize", isToday ? "text-fg" : "text-muted")}>
                  {formatDay(d, locale)} {isToday && <Badge tone="accent">{t.nav.today}</Badge>}
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-field-border px-4 py-3 text-sm text-muted">{t.schedule.empty}</p>
                ) : (
                  <div className="space-y-2">
                    {list.map((s) => (
                      <SessionCard key={s.id} s={s} t={t} locale={locale} now={now} showGroup={user.role === "teacher"} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Desktop: time grid like the university timetable */}
      {sessions.length > 0 && (
        <div className="fade-up hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
          <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `4.25rem repeat(${days.length}, minmax(8.5rem, 1fr))` }}>
            {/* header row */}
            <div className="sticky left-0 z-10 border-b border-border bg-surface" />
            {days.map((d) => {
              const isToday = dateKey(d) === todayKey;
              return (
                <div key={d.toISOString()} className="flex items-center gap-2 border-b border-l border-border px-3 py-3">
                  <span className={cn("text-xs capitalize", isToday ? "font-medium text-fg" : "text-muted")}>{formatWeekday(d, locale)}</span>
                  <span
                    className={cn(
                      "grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-semibold",
                      isToday ? "bg-accent text-accent-fg shadow-[0_6px_14px_-6px_rgba(196,18,51,0.7)]" : "text-fg",
                    )}
                  >
                    {zoned(d).day}
                  </span>
                </div>
              );
            })}

            {/* time gutter */}
            <div className="sticky left-0 z-10 bg-surface" style={{ height }}>
              <div className="relative h-full">
                {slots.map((s) => (
                  <span
                    key={s}
                    className={cn("absolute right-2 -translate-y-1/2 text-xs tabular-nums", s % 60 === 0 ? "font-semibold text-fg/80" : "text-muted/70")}
                    style={{ top: (s - from) * PX_PER_MIN }}
                  >
                    {s === from ? "" : hhmm(s)}
                  </span>
                ))}
              </div>
            </div>

            {/* day columns */}
            {days.map((d) => {
              const isToday = dateKey(d) === todayKey;
              const list = byDay(d);
              // Ghosts of moved classes at their original time this week.
              const ghosts = sessions.filter(
                (s) => s.status === "moved" && s.original_starts_at && dateKey(new Date(s.original_starts_at)) === dateKey(d),
              );
              return (
                <div key={d.toISOString()} className={cn("relative border-l border-border", isToday && "bg-accent-soft/50")} style={{ height }}>
                  {slots.slice(1).map((s) => (
                    <div
                      key={s}
                      className={cn("absolute inset-x-0 border-t", s % 60 === 0 ? "border-border" : "border-border/40 border-dashed")}
                      style={{ top: (s - from) * PX_PER_MIN }}
                    />
                  ))}
                  {isToday && <NowLine fromMinute={from} toMinute={to} pxPerMinute={PX_PER_MIN} />}
                  {ghosts.map((s) => {
                    const st = minuteOfDay(new Date(s.original_starts_at!));
                    const len = (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000;
                    return (
                      <div
                        key={"ghost" + s.id}
                        className="absolute inset-x-1.5 rounded-xl border-2 border-dashed px-2.5 py-1.5 text-xs text-muted"
                        style={{ top: (st - from) * PX_PER_MIN + 2, height: len * PX_PER_MIN - 4, borderColor: tint(s.color, 60) }}
                      >
                        <s className="font-semibold">{s.course_title}</s>
                        <p className="mt-0.5">
                          → {formatShort(new Date(s.starts_at), locale)}
                        </p>
                      </div>
                    );
                  })}
                  {list.map((s) => (
                    <GridBlock key={s.id} s={s} t={t} locale={locale} now={now} from={from} showGroup={user.role === "teacher"} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GridBlock({ s, t, locale, now, from, showGroup }: { s: Session; t: Dict; locale: Locale; now: Date; from: number; showGroup?: boolean }) {
  const start = new Date(s.starts_at);
  const end = new Date(s.ends_at);
  const top = (minuteOfDay(start) - from) * PX_PER_MIN;
  const h = ((end.getTime() - start.getTime()) / 60000) * PX_PER_MIN;
  const live = start <= now && end > now;
  const cancelled = s.status === "cancelled";
  return (
    <div
      className={cn(
        "lift absolute inset-x-1.5 z-10 overflow-hidden rounded-lg border px-2.5 py-1.5 hover:z-30",
        live && "ring-1 ring-fg/40",
        cancelled && "opacity-60",
      )}
      style={{
        top: top + 2,
        height: h - 4,
        background: cancelled ? "repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--surface) 6px 12px)" : "var(--surface)",
        borderColor: "var(--border)",
        borderLeft: `3px solid ${s.color}`,
      }}
      title={`${formatTime(start, locale)}–${formatTime(end, locale)} ${s.course_title} · ${t.common.room} ${s.room}`}
    >
      <p className={cn("text-[11px] tabular-nums text-muted", cancelled && "line-through")}>
        {formatTime(start, locale)} – {formatTime(end, locale)}
      </p>
      <p className={cn("line-clamp-2 text-[13px] font-medium leading-snug hyphens-auto [overflow-wrap:anywhere]", cancelled && "line-through")} lang={locale}>
        {s.course_title}
      </p>
      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
        <MapPin size={11} className="shrink-0" />
        <span className="truncate">
          {s.room}
          {showGroup && ` · ${s.group_name}`}
        </span>
        {s.status === "moved" && <Badge tone="yellow" className="ml-auto px-1.5 py-0 text-[10px]">{t.schedule.moved}</Badge>}
        {cancelled && <Badge tone="red" className="ml-auto px-1.5 py-0 text-[10px]">{t.schedule.cancelled}</Badge>}
        {s.status === "scheduled" && s.original_room && <Badge tone="accent" className="ml-auto px-1.5 py-0 text-[10px]">{t.schedule.roomChanged}</Badge>}
      </p>
    </div>
  );
}

function SessionCard({ s, t, locale, now, showGroup }: { s: Session; t: Dict; locale: Locale; now: Date; showGroup?: boolean }) {
  const start = new Date(s.starts_at);
  const end = new Date(s.ends_at);
  const live = start <= now && end > now;
  const cancelled = s.status === "cancelled";
  return (
    <div
      className={cn("relative flex gap-3 overflow-hidden rounded-xl border p-3.5", live && "border-fg/40", cancelled && "opacity-70")}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: s.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-bold tabular-nums", cancelled && "line-through")}>
            {formatTime(start, locale)} – {formatTime(end, locale)}
          </p>
          <div className="flex flex-wrap gap-1">
            {s.status === "moved" && <Badge tone="yellow">{t.schedule.moved}</Badge>}
            {cancelled && <Badge tone="red">{t.schedule.cancelled}</Badge>}
            {s.original_room && !cancelled && s.status !== "moved" && <Badge tone="accent">{t.schedule.roomChanged}</Badge>}
          </div>
        </div>
        <p className={cn("font-bold leading-snug", cancelled && "line-through")}>{s.course_title}</p>
        <p className="text-xs text-muted">
          {t.common.room} {s.room}
          {showGroup ? ` · ${s.group_name}` : ` · ${s.teacher_name}`}
        </p>
        {s.status === "moved" && s.original_starts_at && (
          <p className="mt-1.5 text-xs text-muted">
            {t.schedule.was}:{" "}
            <s>
              {formatShort(new Date(s.original_starts_at), locale)}
              {s.original_room ? `, ${t.common.room} ${s.original_room}` : ""}
            </s>
          </p>
        )}
        {s.original_room && s.status !== "moved" && (
          <p className="mt-1.5 text-xs text-muted">
            {t.schedule.was}: <s>{t.common.room} {s.original_room}</s>
          </p>
        )}
      </div>
    </div>
  );
}
