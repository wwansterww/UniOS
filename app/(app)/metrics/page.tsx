import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { Card, PageTitle, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Метрики" };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function MetricsPage() {
  await requireUser("teacher");
  const { t } = await getT();
  const d = await db();
  // Aggregates across all users: run as the server, page is teacher-only.
  const [[open], [people], [rem], [done], daily] = await Promise.all([
    d.q<{ median: number | null; n: number; fast: number }>(
      `select percentile_cont(0.5) within group (order by (props->>'ms_since_open')::numeric) as median,
              count(*)::int as n,
              count(*) filter (where (props->>'ms_since_open')::numeric <= 30000)::int as fast
         from events where name = 'deadline_open' and props ? 'ms_since_open'`,
    ),
    d.q<{ students: number; telegram: number; reminders_on: number }>(
      `select count(*)::int as students,
              count(*) filter (where p.telegram_chat_id is not null)::int as telegram,
              count(*) filter (where cardinality(coalesce(np.offsets_minutes, '{1440,60}')) > 0
                                 and cardinality(coalesce(np.channels, '{telegram,in_app}')) > 0)::int as reminders_on
         from profiles p left join notification_prefs np on np.user_id = p.id where p.role = 'student'`,
    ),
    d.q<{ sent: number; opened: number; failed: number; pending: number }>(
      `select count(*) filter (where sent_at is not null and not skipped)::int as sent,
              count(*) filter (where opened_at is not null)::int as opened,
              count(*) filter (where sent_at is null and attempts >= 3)::int as failed,
              count(*) filter (where sent_at is null and attempts < 3)::int as pending
         from reminders`,
    ),
    d.q<{ total: number; before: number }>(
      `select count(*)::int as total, count(ds.done_at) filter (where ds.done_at <= d.due_at)::int as before
         from deadlines d
         join deadline_groups dg on dg.deadline_id = d.id
         join group_members gm on gm.group_id = dg.group_id
         left join deadline_status ds on ds.deadline_id = d.id and ds.student_id = gm.student_id
        where d.deleted_at is null and d.course_id is not null and d.due_at < now()`,
    ),
    d.q<{ day: string; opens: number; sent: number }>(
      `select to_char(date_trunc('day', created_at at time zone 'Asia/Almaty'), 'DD.MM') as day,
              count(*) filter (where name = 'app_open')::int as opens,
              count(*) filter (where name = 'reminder_sent')::int as sent
         from events where created_at > now() - interval '14 days'
        group by 1, date_trunc('day', created_at at time zone 'Asia/Almaty') order by date_trunc('day', created_at at time zone 'Asia/Almaty')`,
    ),
  ]);
  const median = open.median != null ? Math.round(Number(open.median) / 100) / 10 : null;

  const tiles = [
    {
      label: t.metrics.timeToDeadline,
      value: median != null ? `${median} с` : "—",
      note: `${t.metrics.target} · ${t.metrics.samples(open.n)} · ≤30 с: ${pct(open.fast, open.n)}%`,
      good: median != null && median <= 30,
    },
    {
      label: t.metrics.telegramShare,
      value: `${pct(people.telegram, people.students)}%`,
      note: `${people.telegram} / ${people.students} ${t.metrics.students}`,
    },
    {
      label: t.metrics.remindersShare,
      value: `${pct(people.reminders_on, people.students)}%`,
      note: `${people.reminders_on} / ${people.students} ${t.metrics.students}`,
    },
    { label: t.metrics.sent, value: String(rem.sent), note: `⏳ ${rem.pending} · ⚠️ ${rem.failed}` },
    { label: t.metrics.opened, value: `${pct(rem.opened, rem.sent)}%`, note: `${rem.opened} / ${rem.sent}` },
    { label: t.metrics.doneBeforeDue, value: `${pct(done.before, done.total)}%`, note: `${done.before} / ${done.total}` },
  ];
  const max = Math.max(1, ...daily.map((x) => x.opens));

  return (
    <div className="space-y-6">
      <PageTitle>{t.metrics.title}</PageTitle>
      <p className="-mt-3 text-muted">{t.metrics.hint}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((x) => (
          <Card key={x.label} className={cn(x.good && "border-ok/40")}>
            <p className="text-sm font-semibold text-muted">{x.label}</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">{x.value}</p>
            <p className="mt-1 text-xs text-muted">{x.note}</p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="mb-4 text-sm font-semibold text-muted">app_open / день (14 дней)</p>
        {daily.length === 0 ? (
          <p className="text-sm text-muted">{t.metrics.noData}</p>
        ) : (
          <div className="flex h-40 items-end gap-2">
            {daily.map((x) => (
              <div key={x.day} className="flex flex-1 flex-col items-center gap-1" title={`${x.day}: ${x.opens}`}>
                <span className="text-xs font-semibold tabular-nums">{x.opens}</span>
                <div className="w-full max-w-10 rounded-t-lg bg-lavender" style={{ height: `${Math.max(4, (x.opens / max) * 120)}px` }} />
                <span className="text-[10px] text-muted">{x.day}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
