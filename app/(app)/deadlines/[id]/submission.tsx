"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Lock, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, cn } from "@/components/ui";
import { useNow } from "@/components/bits";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { duration } from "@/lib/i18n";
import { MAX_FILES, MAX_FILE_BYTES, MAX_FILE_MB, acceptAttr, acceptsFile, extensionsOf, fileSize, isFileFormat, lateBy, uploadState } from "@/lib/submissions";
import { formatDateTime } from "@/lib/time";
import { deleteSubmissionFile, uploadSubmission } from "../../actions";

type Props = {
  deadlineId: string;
  due: string;
  formats: string[];
  allowLate: boolean;
  files: { id: string; name: string; size: number; uploaded_at: string }[];
};

/** The student's work for a deadline that takes files: what to upload, until when, and what is already handed in. */
export function SubmissionCard({ deadlineId, due, formats, allowLate, files }: Props) {
  const { t, locale } = useT();
  const now = useNow(15_000);
  const state = uploadState({ due_at: due, file_types: formats, allow_late: allowLate }, now);
  const open = state === "open" || state === "late";
  const [uploading, start] = useTransition();
  const [removing, run] = useAction();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const last = files.at(-1);
  const delay = last ? lateBy(due, last.uploaded_at) : 0;
  const names = formats.filter(isFileFormat).map((f) => t.submit.fmt[f]);

  // Checked here for a quick answer; the server checks again.
  const upload = (list: FileList | File[]) => {
    const picked = [...list];
    if (!picked.length) return;
    start(async () => {
      let room = MAX_FILES - files.length;
      for (const file of picked) {
        if (room <= 0) {
          toast.error(t.submit.tooMany(MAX_FILES));
          break;
        }
        if (!acceptsFile(formats, file.name)) {
          toast.error(`${file.name}: ${t.submit.badType(extensionsOf(formats).join(", "))}`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name}: ${t.submit.tooBig(MAX_FILE_MB)}`);
          continue;
        }
        const fd = new FormData();
        fd.set("deadline_id", deadlineId);
        fd.set("file", file);
        try {
          const r = await uploadSubmission(fd);
          if (r.ok) {
            room--;
            toast.success(`${t.submit.uploaded}: ${file.name}`);
          } else toast.error(r.message ?? t.common.error);
        } catch {
          toast.error(t.common.error);
        }
      }
      if (input.current) input.current.value = "";
    });
  };

  return (
    <Card id="submit" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <UploadCloud size={16} /> {t.submit.title}
        </p>
        {files.length > 0 ? (
          <Badge tone={delay ? "yellow" : "green"}>{delay ? t.submit.lateBy(duration(t, delay)) : t.submit.handedIn}</Badge>
        ) : (
          state !== "open" && <Badge tone="red">{t.submit.notSubmitted}</Badge>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted">{t.submit.formatsLabel}:</span> <span className="font-medium">{names.join(", ")}</span>{" "}
          <span className="text-muted">({extensionsOf(formats).map((e) => "." + e).join(" ")})</span>
        </p>
        <p className="text-muted">{t.submit.limits(MAX_FILE_MB, MAX_FILES)}</p>
      </div>

      {state === "open" && <p className="text-sm font-medium" suppressHydrationWarning>{t.submit.until(formatDateTime(new Date(due), locale))}</p>}
      {state === "late" && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{t.submit.lateOpen}</p>}
      {state === "closed" && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          <Lock size={14} /> {t.submit.closed}
        </p>
      )}

      {files.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {files.map((f) => {
            const ms = lateBy(due, f.uploaded_at);
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileText size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <a href={`/api/submissions/${f.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
                    {f.name}
                  </a>
                  <p className="text-xs text-muted" suppressHydrationWarning>
                    {fileSize(f.size, locale)} · {formatDateTime(new Date(f.uploaded_at), locale)}
                    {ms > 0 && <span className="text-warn"> · {t.submit.lateBy(duration(t, ms))}</span>}
                  </p>
                </div>
                {open && (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => confirm(`${t.submit.remove}: ${f.name}?`) && run(() => deleteSubmissionFile(f.id))}
                    aria-label={`${t.submit.remove}: ${f.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !open && <p className="text-sm text-muted">{t.submit.none}</p>
      )}

      {open && files.length < MAX_FILES && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
            drag ? "border-accent bg-accent-soft" : "border-border hover:border-fg/25",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <UploadCloud size={26} className={drag ? "text-accent" : "text-muted"} />
          {uploading ? (
            <span className="font-medium">{t.submit.uploading}</span>
          ) : (
            <span>
              {t.submit.drop} <span className="font-semibold text-accent underline-offset-2 hover:underline">{t.submit.pick}</span>
            </span>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept={acceptAttr(formats)}
            disabled={uploading}
            onChange={(e) => e.target.files && upload(e.target.files)}
            className="sr-only"
          />
        </label>
      )}
    </Card>
  );
}
