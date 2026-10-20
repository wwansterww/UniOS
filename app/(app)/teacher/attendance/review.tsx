"use client";

import { useState } from "react";
import { BellRing, Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { reviewExcuse, warnStudent } from "../actions";

export function ExcuseReview({ sessionId, studentId }: { sessionId: string; studentId: string }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewExcuse(sessionId, studentId, true))}>
        <Check size={14} /> {t.attendance.approve}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewExcuse(sessionId, studentId, false))}>
        <X size={14} /> {t.attendance.reject}
      </Button>
    </div>
  );
}

/** Sends the student a warning about the 25% limit; turns into a quiet "warned" label once sent. */
export function WarnButton({ studentId, courseId, groupId, compact }: { studentId: string; courseId: string; groupId: string; compact?: boolean }) {
  const { t } = useT();
  const [pending, run] = useAction();
  const [sent, setSent] = useState(false);
  if (sent) return <span className="shrink-0 text-[12px] font-medium text-muted">{t.attendance.warnedToday}</span>;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      title={t.attendance.warn}
      aria-label={t.attendance.warn}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run(() => warnStudent(studentId, courseId, groupId), () => setSent(true));
      }}
    >
      <BellRing size={14} /> <span className={compact ? "hidden sm:inline" : undefined}>{t.attendance.warn}</span>
    </Button>
  );
}
