"use client";

import { useRef } from "react";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Select } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { attachGroup, createCourse, createGroup, detachGroup, setCourseCredits } from "../actions";

const COLORS = ["#8C80EF", "#4FB3BF", "#F2994A", "#6FCF97", "#EB5757", "#E6C14C", "#5B8DEF"];
const CREDITS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15];

export function NewCourseForm() {
  const { t } = useT();
  const [pending, run] = useAction();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={(fd) => run(() => createCourse(fd), () => ref.current?.reset())} className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem_auto_auto] sm:items-end">
      <Field label={t.teacher.courseTitle}>
        <Input name="title" required />
      </Field>
      <Field label={t.teacher.courseCode}>
        <Input name="code" placeholder="CSE 101" />
      </Field>
      <Field label={t.teacher.creditsLabel}>
        <Select name="credits" defaultValue={5}>
          {CREDITS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.teacher.color}>
        <Select name="color" defaultValue={COLORS[0]} className="w-28">
          {COLORS.map((c) => (
            <option key={c} value={c} style={{ color: c }}>
              ● {c}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        <Plus size={16} /> {t.common.create}
      </Button>
    </form>
  );
}

export function GroupTools({ courseId, otherGroups }: { courseId: string; otherGroups: { id: string; name: string }[] }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
      <form action={(fd) => run(() => createGroup(fd))} className="flex gap-2">
        <input type="hidden" name="course_id" value={courseId} />
        <Input name="name" required placeholder={t.teacher.groupName} aria-label={t.teacher.newGroup} />
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus size={14} /> {t.teacher.newGroup}
        </Button>
      </form>
      <form action={(fd) => run(() => attachGroup(fd))} className="flex gap-2">
        <input type="hidden" name="course_id" value={courseId} />
        {otherGroups.length > 0 ? (
          <Select name="group_id" aria-label={t.teacher.attachGroup}>
            {otherGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input name="code" required placeholder={t.teacher.attachByCode} aria-label={t.teacher.attachByCode} className="uppercase" />
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          {t.common.add}
        </Button>
      </form>
    </div>
  );
}

export function InviteCode({ code }: { code: string }) {
  const { t } = useT();
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        toast.success(`${t.common.copied}: ${code}`);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 font-mono text-[13px] font-medium"
      title={t.teacher.invite}
    >
      {code} <Copy size={12} />
    </button>
  );
}

export function DetachGroup({ courseId, groupId }: { courseId: string; groupId: string }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <button
      disabled={pending}
      onClick={() => confirm(t.common.delete + "?") && run(() => detachGroup(courseId, groupId))}
      aria-label={t.common.delete}
      className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-danger"
    >
      <X size={14} />
    </button>
  );
}

export function CreditsSelect({ courseId, value }: { courseId: string; value: number }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      {t.teacher.creditsLabel}
      <Select
        value={value}
        disabled={pending}
        onChange={(e) => run(() => setCourseCredits(courseId, Number(e.target.value)))}
        className="h-9 w-20"
      >
        {[...new Set([...CREDITS, value])].sort((a, b) => a - b).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    </label>
  );
}
