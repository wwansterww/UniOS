import { FileText } from "lucide-react";
import type { Dict, Locale } from "@/lib/i18n";
import type { ExcuseRow } from "@/lib/queries";
import { formatDay, formatTime } from "@/lib/time";
import { Badge, Card, CourseDot, Empty, buttonClass } from "@/components/ui";
import { ExcuseReview } from "./review";

/** Teacher: certificates to review, then the recently reviewed ones. */
export function Excuses({ rows, t, locale }: { rows: ExcuseRow[]; t: Dict; locale: Locale }) {
  const pending = rows.filter((r) => r.status === "pending");
  const reviewed = rows.filter((r) => r.status !== "pending");
  const item = (r: ExcuseRow) => (
    <li key={r.session_id + r.student_id} className="border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.full_name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <CourseDot color={r.color} />
            <span className="first-letter:uppercase">
              {r.course_title} · {r.group_name} · {formatDay(new Date(r.starts_at), locale)} {formatTime(new Date(r.starts_at), locale)}
            </span>
          </p>
        </div>
        {r.status === "pending" ? (
          <ExcuseReview sessionId={r.session_id} studentId={r.student_id} />
        ) : (
          <Badge tone={r.status === "approved" ? "green" : "red"}>{r.status === "approved" ? t.attendance.excuseApproved : t.attendance.excuseRejected}</Badge>
        )}
      </div>
      {r.reason && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">{r.reason}</p>}
      <div className="mt-2">
        {r.has_file ? (
          <a
            href={`/api/excuses/file?session=${r.session_id}&student=${r.student_id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass("outline", "sm")}
          >
            <FileText size={14} /> {t.attendance.openFile}
          </a>
        ) : (
          <span className="text-[13px] text-muted">{t.attendance.noFile}</span>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <Empty icon="📄" title={t.attendance.excusesEmpty} />
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <ul>{pending.map(item)}</ul>
        </Card>
      )}
      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">{t.attendance.excusesReviewed}</h2>
          <Card className="overflow-hidden p-0 opacity-90 sm:p-0">
            <ul>{reviewed.map(item)}</ul>
          </Card>
        </section>
      )}
    </div>
  );
}
