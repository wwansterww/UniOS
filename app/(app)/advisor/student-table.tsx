"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { Card, Input, cn } from "@/components/ui";
import { useT } from "@/components/i18n";

export type StudentRow = { id: string; name: string; group: string; gpa: string | null; attendance: number | null; reasons: { text: string; level: "warn" | "over" }[] };

/** All students with search and a group switch; a row opens the student's grades and attendance. */
export function StudentTable({ rows, groups }: { rows: StudentRow[]; groups: string[] }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const list = rows.filter((r) => (!group || r.group === group) && r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
        <label className="relative min-w-48 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.advisor.search} aria-label={t.advisor.search} className="h-10 pl-9" />
        </label>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {["", ...groups].map((g) => (
            <button
              key={g || "all"}
              onClick={() => setGroup(g)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", group === g ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
            >
              {g || t.common.all}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="whitespace-nowrap border-b border-border text-left text-[13px] text-muted">
            <th className="px-4 py-2.5 font-medium sm:px-5">{t.advisor.colStudent}</th>
            <th className="hidden px-2 py-2.5 font-medium sm:table-cell">{t.advisor.colGroup}</th>
            <th className="w-16 px-2 py-2.5 text-right font-medium">{t.advisor.colGpa}</th>
            <th className="w-20 px-4 py-2.5 text-right font-medium sm:px-5">{t.advisor.colAttendance}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
              <td className="px-4 py-2.5 sm:px-5">
                <Link href={`/advisor/students/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  {r.reasons.length > 0 && (
                    <AlertTriangle size={14} className={cn("shrink-0", r.reasons.some((x) => x.level === "over") ? "text-danger" : "text-warn")} aria-label={t.advisor.atRisk} />
                  )}
                  {r.name}
                </Link>
              </td>
              <td className="hidden px-2 py-2.5 text-muted sm:table-cell">{r.group}</td>
              <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{r.gpa ?? "—"}</td>
              <td className={cn("px-4 py-2.5 text-right tabular-nums sm:px-5", r.attendance != null && r.attendance < 75 && "text-danger")}>
                {r.attendance != null ? `${r.attendance}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
