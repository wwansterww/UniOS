"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Plus, Send, Trash2, X } from "lucide-react";
import { Button, Field, Input, Select, buttonClass, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { LIMITS, PAIR_STARTS, WEEKDAYS, occurrences, pairLabel } from "@/lib/applications";
import { DAY, formatDay, fromZoned } from "@/lib/time";
import { PasswordInput } from "../login/login-form";
import { submitApplication } from "./actions";

type SlotDraft = { key: number; group_id: string; weekday: number; start: string; room: string };
type SubjectDraft = { key: number; title: string; code: string; credits: string; slots: SlotDraft[] };
type Group = { id: string; name: string };

let seq = 0;
const nextKey = () => ++seq;
const newSlot = (from?: SlotDraft): SlotDraft => ({
  key: nextKey(),
  group_id: from?.group_id ?? "",
  // The next class of a subject is usually on another day at the same time.
  weekday: from ? Math.min(from.weekday + 2, WEEKDAYS.length - 1) : 0,
  start: from?.start ?? PAIR_STARTS[1],
  room: from?.room ?? "",
});
const newSubject = (group_id = ""): SubjectDraft => ({ key: nextKey(), title: "", code: "", credits: "5", slots: [{ ...newSlot(), group_id }] });

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const day = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return fromZoned(y, m, d);
};

/** Three steps: account → subjects and weekly timetable → review and send. Everything is checked again on the server. */
export function RegisterForm({ groups, period }: { groups: Group[]; period: { starts_on: string; ends_on: string } }) {
  const { t, locale } = useT();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState({ full_name: "", email: "", password: "", repeat: "", note: "" });
  const [subjects, setSubjects] = useState<SubjectDraft[]>(() => [newSubject(groups.length === 1 ? groups[0].id : "")]);
  const [dates, setDates] = useState(period);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const slotCount = subjects.reduce((n, s) => n + s.slots.length, 0);
  const validPeriod = isDay(dates.starts_on) && isDay(dates.ends_on) && dates.ends_on >= dates.starts_on;
  const weeks = validPeriod ? Math.ceil((day(dates.ends_on).getTime() - day(dates.starts_on).getTime() + DAY) / (7 * DAY)) : 0;
  const classes = validPeriod ? subjects.reduce((n, s) => n + s.slots.reduce((m, sl) => m + occurrences(sl, dates.starts_on, dates.ends_on).length, 0), 0) : 0;
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? "—";

  const go = (next: number) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const editSubject = (key: number, patch: Partial<SubjectDraft>) => setSubjects((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const editSlot = (subject: SubjectDraft, key: number, patch: Partial<SlotDraft>) =>
    editSubject(subject.key, { slots: subject.slots.map((sl) => (sl.key === key ? { ...sl, ...patch } : sl)) });

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        const r = await submitApplication({
          full_name: account.full_name,
          email: account.email,
          password: account.password,
          note: account.note,
          locale,
          website,
          starts_on: dates.starts_on,
          ends_on: dates.ends_on,
          subjects: subjects.map((s) => ({
            title: s.title,
            code: s.code,
            credits: Number(s.credits),
            slots: s.slots.map(({ group_id, weekday, start, room }) => ({ group_id, weekday, start, room })),
          })),
        });
        if (r.ok) return setSent(true);
        setError(r.message);
        setStep(r.step);
      } catch {
        setError(t.common.error);
      }
    });

  if (sent)
    return (
      <div className="rounded-[1.75rem] border border-border bg-surface/85 p-7 text-center shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] backdrop-blur-md sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-ok">
          <Check size={26} strokeWidth={2.4} />
        </span>
        <h2 className="mt-5 text-[1.75rem] font-semibold">{t.apply.sentTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{t.apply.sentText(account.email.trim().toLowerCase())}</p>
        <p className="mx-auto mt-3 max-w-md text-[13px] text-muted">{t.apply.sentStatus}</p>
        <Link href="/login" className={buttonClass("accent", "lg", "mt-7 w-full max-w-xs")}>
          {t.apply.toLogin}
        </Link>
      </div>
    );

  const nav = (
    <div className="flex items-center gap-2 border-t border-border pt-5">
      {step > 0 && (
        <Button type="button" variant="ghost" onClick={() => go(step - 1)}>
          <ArrowLeft size={16} /> {t.apply.back}
        </Button>
      )}
      <Button type="submit" variant="accent" size="lg" className="ml-auto min-w-36 shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]" disabled={pending}>
        {step < 2 ? (
          <>
            {t.apply.next} <ArrowRight size={16} />
          </>
        ) : (
          <>
            <Send size={16} /> {pending ? t.apply.sending : t.apply.submit}
          </>
        )}
      </Button>
    </div>
  );

  return (
    <div className="rounded-[1.75rem] border border-border bg-surface/85 p-5 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] backdrop-blur-md sm:p-8">
      <ol className="mb-7 flex items-center gap-2" aria-label={t.apply.stepOf(step + 1, 3)}>
        {t.apply.steps.map((label, i) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              disabled={i >= step || pending}
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors",
                i < step ? "bg-accent text-accent-fg hover:opacity-90" : i === step ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted",
              )}
            >
              {i < step ? <Check size={15} strokeWidth={2.6} /> : i + 1}
            </button>
            <span className={cn("hidden truncate text-[13px] sm:inline", i === step ? "font-medium text-fg" : "text-muted")}>{label}</span>
            {i < 2 && <span className={cn("h-px min-w-4 flex-1", i < step ? "bg-accent/60" : "bg-border")} aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="-mt-4 mb-6 text-[13px] text-muted sm:hidden">
        {t.apply.stepOf(step + 1, 3)} · <span className="font-medium text-fg">{t.apply.steps[step]}</span>
      </p>

      {error && (
        <p className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {step === 0 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (account.password !== account.repeat) return setError(t.profile.passwordMismatch);
            go(1);
          }}
        >
          <div>
            <h2 className="text-[1.5rem] font-semibold">{t.apply.steps[0]}</h2>
            <p className="mt-1 text-sm text-muted">{t.apply.emailHint}</p>
          </div>
          <Field label={t.apply.name}>
            <Input
              required
              minLength={3}
              maxLength={120}
              autoComplete="name"
              autoFocus
              placeholder={t.apply.namePh}
              value={account.full_name}
              onChange={(e) => setAccount({ ...account, full_name: e.target.value })}
            />
          </Field>
          <Field label={t.apply.email}>
            <Input
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="name@narxoz.kz"
              value={account.email}
              onChange={(e) => setAccount({ ...account, email: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.apply.password} hint={t.apply.passwordHint}>
              <PasswordInput
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                value={account.password}
                onChange={(e) => setAccount({ ...account, password: e.target.value })}
              />
            </Field>
            <Field label={t.apply.repeat}>
              <PasswordInput
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                value={account.repeat}
                onChange={(e) => setAccount({ ...account, repeat: e.target.value })}
              />
            </Field>
          </div>
          <Field label={`${t.apply.note} · ${t.apply.optional}`}>
            <Input maxLength={LIMITS.note} placeholder={t.apply.notePh} value={account.note} onChange={(e) => setAccount({ ...account, note: e.target.value })} />
          </Field>
          {/* Hidden from people; bots that fill every field give themselves away. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-px w-px opacity-0"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {nav}
        </form>
      )}

      {step === 1 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            go(2);
          }}
        >
          <div>
            <h2 className="text-[1.5rem] font-semibold">{t.apply.subjectsTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.apply.subjectsHint}</p>
          </div>
          {groups.length === 0 && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{t.apply.noGroups}</p>}

          {subjects.map((s, i) => (
            <fieldset key={s.key} className="@container rounded-2xl border border-border bg-surface-2/40 p-4 sm:p-5">
              <legend className="sr-only">{t.apply.subject(i + 1)}</legend>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t.apply.subject(i + 1)}</p>
                {subjects.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSubjects(subjects.filter((x) => x.key !== s.key))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 size={14} /> <span className="hidden sm:inline">{t.apply.removeSubject}</span>
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 @md:grid-cols-[minmax(0,1fr)_7.5rem_5.5rem]">
                <Field label={t.apply.subjectTitle} className="col-span-2 @md:col-span-1">
                  <Input required minLength={2} maxLength={120} placeholder={t.apply.subjectPh} value={s.title} onChange={(e) => editSubject(s.key, { title: e.target.value })} />
                </Field>
                <Field label={t.apply.code}>
                  <Input maxLength={30} placeholder={t.apply.codePh} value={s.code} onChange={(e) => editSubject(s.key, { code: e.target.value })} />
                </Field>
                <Field label={t.apply.credits}>
                  <Input type="number" required min={1} max={30} value={s.credits} onChange={(e) => editSubject(s.key, { credits: e.target.value })} />
                </Field>
              </div>

              {/* Narrow: two rows per class, in a box. Wide enough: one row under column names. */}
              <div className="mt-4 hidden grid-cols-[repeat(3,minmax(0,1fr))_5rem_2.25rem] gap-2 px-0.5 text-[12px] font-medium text-muted @lg:grid">
                <span>{t.apply.day}</span>
                <span>{t.apply.pair}</span>
                <span>{t.apply.group}</span>
                <span>{t.apply.room}</span>
              </div>
              <ul className="mt-3 space-y-2 @lg:mt-1.5">
                {s.slots.map((sl) => (
                  <li
                    key={sl.key}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 rounded-xl border border-border bg-surface p-2 @lg:grid-cols-[repeat(3,minmax(0,1fr))_5rem_2.25rem] @lg:border-0 @lg:bg-transparent @lg:p-0"
                  >
                    <Select aria-label={t.apply.day} value={sl.weekday} onChange={(e) => editSlot(s, sl.key, { weekday: Number(e.target.value) })} className="h-10">
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {t.apply.daysLong[d]}
                        </option>
                      ))}
                    </Select>
                    <Select aria-label={t.apply.pair} value={sl.start} onChange={(e) => editSlot(s, sl.key, { start: e.target.value })} className="h-10 tabular-nums">
                      {PAIR_STARTS.map((p) => (
                        <option key={p} value={p}>
                          {pairLabel(p)}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      disabled={s.slots.length === 1}
                      onClick={() => editSubject(s.key, { slots: s.slots.filter((x) => x.key !== sl.key) })}
                      aria-label={t.apply.removeClass}
                      title={t.apply.removeClass}
                      className="grid h-10 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30 @lg:order-last"
                    >
                      <X size={16} />
                    </button>
                    <Select
                      aria-label={t.apply.group}
                      required
                      value={sl.group_id}
                      onChange={(e) => editSlot(s, sl.key, { group_id: e.target.value })}
                      className={cn("h-10", !sl.group_id && "text-muted")}
                    >
                      <option value="">{t.apply.group}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={t.apply.room}
                      placeholder={t.apply.room}
                      maxLength={40}
                      value={sl.room}
                      onChange={(e) => editSlot(s, sl.key, { room: e.target.value })}
                      className="col-span-2 h-10 @lg:col-span-1"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={slotCount >= LIMITS.slots}
                onClick={() => editSubject(s.key, { slots: [...s.slots, newSlot(s.slots.at(-1))] })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              >
                <Plus size={15} /> {t.apply.addClass}
              </button>
            </fieldset>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            disabled={subjects.length >= LIMITS.subjects || slotCount >= LIMITS.slots}
            onClick={() => setSubjects([...subjects, newSubject(subjects.at(-1)?.slots[0]?.group_id)])}
          >
            <Plus size={16} /> {t.apply.addSubject}
          </Button>

          <fieldset className="rounded-2xl border border-border p-4 sm:p-5">
            <legend className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.apply.period}</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.apply.from}>
                <Input type="date" required value={dates.starts_on} onChange={(e) => setDates({ ...dates, starts_on: e.target.value })} />
              </Field>
              <Field label={t.apply.to}>
                <Input type="date" required min={dates.starts_on} value={dates.ends_on} onChange={(e) => setDates({ ...dates, ends_on: e.target.value })} />
              </Field>
            </div>
            {validPeriod && (
              <p className="mt-3 text-[13px] text-muted">
                {t.apply.weeks(weeks)} · {t.apply.classes(classes)}
              </p>
            )}
          </fieldset>
          {nav}
        </form>
      )}

      {step === 2 && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <h2 className="text-[1.5rem] font-semibold">{t.apply.checkTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.apply.checkHint}</p>
          </div>

          <section className="rounded-2xl border border-border p-4 sm:p-5">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t.apply.account}</p>
            <p className="mt-2 font-medium">{account.full_name.trim()}</p>
            <p className="text-sm text-muted">{account.email.trim().toLowerCase()}</p>
            {account.note.trim() && <p className="mt-2 text-sm">{account.note.trim()}</p>}
          </section>

          <section className="rounded-2xl border border-border p-4 sm:p-5">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t.apply.subjectsTitle}</p>
            <ul className="mt-3 space-y-4">
              {subjects.map((s) => (
                <li key={s.key}>
                  <p className="font-medium">
                    {s.title.trim()}
                    <span className="font-normal text-muted">
                      {s.code.trim() && ` · ${s.code.trim()}`} · {t.grades.credits(Number(s.credits))}
                    </span>
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {s.slots.map((sl) => (
                      <li key={sl.key} className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        <span className="w-8 font-medium text-fg">{t.apply.days[sl.weekday]}</span>
                        <span className="tabular-nums">{pairLabel(sl.start)}</span>
                        <span aria-hidden>·</span>
                        <span>{groupName(sl.group_id)}</span>
                        {sl.room.trim() && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {t.common.room} {sl.room.trim()}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {validPeriod && (
            <section className="rounded-2xl bg-surface-2 p-4 sm:p-5">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t.apply.period}</p>
              <p className="mt-2 font-medium">
                {formatDay(day(dates.starts_on), locale)} — {formatDay(day(dates.ends_on), locale)}
              </p>
              <p className="text-sm text-muted">
                {t.apply.weeks(weeks)} · {t.apply.classes(classes)}
              </p>
            </section>
          )}
          {nav}
        </form>
      )}
    </div>
  );
}
