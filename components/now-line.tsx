"use client";

import { useNow } from "./bits";
import { zoned } from "@/lib/time";

/** Red "now" marker across today's column of the time grid. */
export function NowLine({ fromMinute, toMinute, pxPerMinute, percent }: { fromMinute: number; toMinute: number; pxPerMinute: number; percent?: boolean }) {
  const now = useNow(60_000);
  const p = zoned(now);
  const m = p.hour * 60 + p.minute;
  if (m < fromMinute || m > toMinute) return null;
  if (percent)
    // Horizontal timeline: a white tick at the current time.
    return (
      <span
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]"
        style={{ left: `${((m - fromMinute) / (toMinute - fromMinute)) * 100}%` }}
        aria-hidden
        suppressHydrationWarning
      />
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (m - fromMinute) * pxPerMinute }} aria-hidden suppressHydrationWarning>
      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-narxoz" />
      <span className="h-0.5 flex-1 bg-narxoz" />
    </div>
  );
}
