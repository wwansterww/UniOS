"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { useAction } from "@/components/use-action";
import { FILE_FORMATS, FORMAT_KEYS } from "@/lib/submissions";
import { setFileRules } from "../actions";

/** A checkbox drawn as a switch; it still posts "on" with its form. */
function Switch({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40",
          checked ? "bg-accent" : "bg-border",
        )}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * "Сдача файлами" inside a deadline form: on/off, the formats students may upload, and whether late work
 * is accepted. Posts files=on, file_types=…, allow_late=on (read by fileRules in teacher/actions.ts).
 */
export function FileRulesFields({ types: initialTypes, allowLate: initialLate }: { types: string[] | null; allowLate: boolean }) {
  const { t } = useT();
  const [on, setOn] = useState(!!initialTypes);
  // Turning it on starts with PDF picked: the most common case is one click.
  const [types, setTypes] = useState<string[]>(initialTypes ?? ["pdf"]);
  const [late, setLate] = useState(initialLate);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3.5">
      <Switch name="files" checked={on} onChange={setOn} label={t.submit.rules} hint={t.submit.rulesHint} />
      {on && (
        <div className="space-y-3 pl-12">
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">{t.submit.formatsLabel}</p>
            <div className="flex flex-wrap gap-2">
              {FORMAT_KEYS.map((f) => {
                const picked = types.includes(f);
                return (
                  <label
                    key={f}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                      picked ? "border-primary bg-primary text-primary-fg" : "border-border text-muted hover:text-fg",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="file_types"
                      value={f}
                      checked={picked}
                      onChange={(e) => setTypes(e.target.checked ? [...types, f] : types.filter((x) => x !== f))}
                      className="sr-only"
                    />
                    {picked && <Check size={13} strokeWidth={3} />}
                    {t.submit.fmt[f]}
                    <span className="text-xs font-normal opacity-70">.{FILE_FORMATS[f].join(" .")}</span>
                  </label>
                );
              })}
            </div>
            {types.length === 0 && <p className="mt-2 text-[13px] text-danger">{t.submit.pickFormat}</p>}
          </div>
          <Switch name="allow_late" checked={late} onChange={setLate} label={t.submit.allowLate} hint={t.submit.allowLateHint} />
        </div>
      )}
    </div>
  );
}

/** The same settings on a deadline's submissions page, saved on their own — also after the due time. */
export function FileRulesForm({ id, types, allowLate }: { id: string; types: string[] | null; allowLate: boolean }) {
  const { t } = useT();
  const [pending, run] = useAction();
  return (
    <form action={(fd) => run(() => setFileRules(fd))} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FileRulesFields types={types} allowLate={allowLate} />
      <Button type="submit" size="sm" disabled={pending}>
        <Save size={14} /> {t.common.save}
      </Button>
    </form>
  );
}
