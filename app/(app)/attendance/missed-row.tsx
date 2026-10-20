"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Badge, Button, Field, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { submitExcuse } from "../actions";

type Props = { sessionId: string; when: string; status: "late" | "absent" | "excused"; excuse: "pending" | "approved" | "rejected" | null; readOnly?: boolean };

/** Big phone photos are shrunk (and HEIC turned into JPEG) before upload. */
async function prepare(file: File): Promise<File> {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!file.type.startsWith("image/") || (ok && file.size < 1_200_000)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** One missed class in the student's list, with its certificate state and a form to attach one. */
export function MissedRow({ sessionId, when, status, excuse, readOnly }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [pending, run] = useAction();
  const form = useRef<HTMLFormElement>(null);
  const canSend = !readOnly && status === "absent" && (excuse == null || excuse === "rejected");

  return (
    <li className="border-b border-border px-5 py-2.5 text-sm last:border-b-0 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 first-letter:uppercase">{when}</span>
        {status === "excused" ? (
          <Badge tone="green">{t.attendance.excused}</Badge>
        ) : (
          <Badge tone={status === "absent" ? "red" : "yellow"}>{t.attendance[status]}</Badge>
        )}
        {status === "absent" && excuse === "pending" && <Badge tone="outline">{t.attendance.excusePending}</Badge>}
        {status === "absent" && excuse === "rejected" && <Badge tone="outline">{t.attendance.excuseRejected}</Badge>}
        {canSend && !open && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Paperclip size={14} /> {t.attendance.excuseAttach}
          </Button>
        )}
      </div>
      {open && (
        <form
          ref={form}
          className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3"
          action={async (fd) => {
            const file = fd.get("file");
            if (file instanceof File && file.size > 0) fd.set("file", await prepare(file));
            run(() => submitExcuse(fd), () => setOpen(false));
          }}
        >
          <input type="hidden" name="session_id" value={sessionId} />
          <Field label={t.attendance.excuseReason}>
            <Textarea name="reason" required maxLength={1000} placeholder={t.attendance.excuseReasonHint} className="min-h-16" autoFocus />
          </Field>
          <Field label={t.attendance.excuseFile}>
            <input
              name="file"
              type="file"
              accept="image/*,application/pdf"
              className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:font-medium file:text-fg"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {t.attendance.excuseSend}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label={t.common.cancel}>
              <X size={14} /> {t.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
