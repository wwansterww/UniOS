"use client";

import { Card, Empty, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { fmtPoints, type Category } from "@/lib/journal";

type Work = { id: string; title: string; max_points: number; category: Category };

/** Letter bands of the 100-point scale, best first (ordered categories, one series → one colour). */
const BANDS: [string, number, number][] = [
  ["A", 90, 100],
  ["B", 75, 89],
  ["C", 60, 74],
  ["D", 50, 59],
  ["F", 0, 49],
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Column chart of how many students fall in each letter band; the count sits on each cap, hover tells the range. */
function Distribution({ percents, label }: { percents: number[]; label: string }) {
  const counts = BANDS.map(([, lo, hi]) => percents.filter((p) => Math.round(p) >= lo && Math.round(p) <= hi).length);
  const top = Math.max(1, ...counts);
  return (
    <figure aria-label={label}>
      <div className="flex h-28 items-end gap-3 border-b border-border px-1">
        {BANDS.map(([l, lo, hi], i) => (
          <div key={l} className="group relative flex h-full flex-1 flex-col items-center justify-end" tabIndex={0} aria-label={`${l} (${lo}–${hi}): ${counts[i]}`}>
            <span className="mb-1 text-[12px] font-medium tabular-nums text-muted">{counts[i] || ""}</span>
            <span
              className="w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: `${(counts[i] / top) * 78}%`, minHeight: counts[i] ? 3 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-[12px] text-bg shadow-lg group-hover:block group-focus:block">
              {l} · {lo}–{hi}: <b>{counts[i]}</b>
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex gap-3 px-1">
        {BANDS.map(([l]) => (
          <span key={l} className="flex-1 text-center text-[12px] text-muted">
            {l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Stats({ t, values, total }: { t: ReturnType<typeof useT>["t"]; values: number[]; total: number }) {
  return (
    <dl className="mt-1 grid grid-cols-3 gap-2 text-[13px]">
      <div>
        <dt className="text-muted">{t.grades.statsAvg}</dt>
        <dd className="font-display text-xl font-semibold tabular-nums">{values.length ? fmtPoints(Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10) : "—"}</dd>
      </div>
      <div>
        <dt className="text-muted">{t.grades.statsMedian}</dt>
        <dd className="font-display text-xl font-semibold tabular-nums">{values.length ? fmtPoints(median(values)) : "—"}</dd>
      </div>
      <div>
        <dt className="text-muted">{t.grades.statsGraded(values.length, total)}</dt>
        <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-fg/60" style={{ width: `${total ? (values.length / total) * 100 : 0}%` }} />
        </dd>
      </div>
    </dl>
  );
}

/** Teacher analytics: the course total and every work, as letter-band distributions with average and median. */
export function GradeStats({ works, students, scores, totals }: { works: Work[]; students: { id: string }[]; scores: Map<string, number>; totals: (number | null)[] }) {
  const { t } = useT();
  const graded = totals.filter((x): x is number => x != null);
  if (graded.length === 0) return <Empty icon="📊" title={t.grades.statsEmpty} />;

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <Card className="p-4 sm:p-5">
        <p className="font-semibold">{t.grades.statsTotal}</p>
        <Stats t={t} values={graded} total={students.length} />
        <div className="mt-4">
          <Distribution percents={graded} label={t.grades.statsTotal} />
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {works.map((w) => {
          const pts = students.map((s) => scores.get(`${w.id}:${s.id}`)).filter((x): x is number => x != null);
          return (
            <Card key={w.id} className={cn("p-4 sm:p-5", pts.length === 0 && "opacity-70")}>
              <p className="flex items-baseline gap-2">
                <span className="rounded bg-surface-2 px-1.5 text-[11px] font-semibold uppercase text-muted">{t.grades[w.category]}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{w.title}</span>
                <span className="text-[12px] text-muted">{t.grades.outOf(fmtPoints(w.max_points))}</span>
              </p>
              <Stats t={t} values={pts} total={students.length} />
              {pts.length > 0 && (
                <div className="mt-4">
                  <Distribution percents={pts.map((p) => (p / w.max_points) * 100)} label={w.title} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
