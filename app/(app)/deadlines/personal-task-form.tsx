"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { useT } from "@/components/i18n";
import { toLocalInput } from "@/lib/time";
import { addPersonalTask } from "../actions";

export function PersonalTaskForm() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [defaultDue, setDefaultDue] = useState("");

  // The dock's "+" opens this form via /deadlines?new=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") !== "1") return;
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url);
    const id = setTimeout(() => {
      setDefaultDue(toLocalInput(new Date(Date.now() + 86_400_000)).slice(0, 11) + "23:59");
      setOpen(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <Button
        variant="accent"
        onClick={() => {
          setDefaultDue(toLocalInput(new Date(Date.now() + 86_400_000)).slice(0, 11) + "23:59");
          setOpen(true);
        }}
      >
        <Plus size={16} /> <span className="hidden sm:inline">{t.deadlines.addPersonal}</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
          <form
            ref={form}
            onClick={(e) => e.stopPropagation()}
            action={(fd) =>
              start(async () => {
                const r = await addPersonalTask(fd);
                if (r.ok) {
                  toast.success(t.deadlines.created);
                  setOpen(false);
                } else toast.error(r.message ?? t.common.error);
              })
            }
            className="w-full max-w-md space-y-3 rounded-t-3xl border border-border bg-surface p-5 sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t.deadlines.addPersonal}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="rounded-lg p-1 text-muted hover:bg-surface-2">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted">{t.deadlines.personalHint}</p>
            <Field label={t.common.title}>
              <Input name="title" required autoFocus maxLength={300} />
            </Field>
            <Field label={t.deadlines.due}>
              <Input name="due" type="datetime-local" required defaultValue={defaultDue} />
            </Field>
            <Field label={t.common.description}>
              <Textarea name="description" rows={2} />
            </Field>
            <Field label={t.common.link}>
              <Input name="link" type="url" placeholder="https://" />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {t.common.add}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
