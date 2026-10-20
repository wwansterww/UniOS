"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clock, Loader2 } from "lucide-react";
import { Button, buttonClass, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { checkIn, type CheckinResult } from "./actions";

/** Six big digits; submits by itself when the sixth is typed, or right away when opened from a QR code. */
export function CheckinForm({ session, code, home }: { session?: string; code?: string; home: string }) {
  const { t } = useT();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const tried = useRef(false);

  const submit = (digits: string, sid?: string) =>
    start(async () => {
      const r = await checkIn(digits, sid);
      setResult(r);
      if (!r.ok) {
        setValue("");
        input.current?.focus();
      }
    });

  useEffect(() => {
    if (tried.current || !code || !/^\d{6}$/.test(code)) return;
    tried.current = true;
    submit(code, session);
  });

  if (result?.ok)
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <span
          className={cn(
            "checkin-pop grid h-20 w-20 place-items-center rounded-full text-white shadow-[0_16px_36px_-14px_rgba(0,0,0,0.45)]",
            result.status === "late" ? "bg-warn" : "bg-ok",
          )}
        >
          {result.status === "late" ? <Clock size={38} /> : <Check size={40} strokeWidth={3} />}
        </span>
        <h1 className="mt-6 text-2xl font-semibold">
          {result.status === "late" ? t.attendance.checkinLate : result.status === "already" ? t.attendance.checkinAlready : t.attendance.checkinPresent}
        </h1>
        <p className="mt-1 text-muted">
          {result.course} · <span className="first-letter:uppercase">{result.when}</span>
        </p>
        <div className="mt-8 flex w-full gap-2">
          <Link href={home} className={buttonClass("primary", "lg", "flex-1")}>
            {t.nav.today}
          </Link>
          <Button variant="outline" size="lg" onClick={() => setResult(null)}>
            {t.attendance.checkinAgain}
          </Button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.length === 6) submit(value);
      }}
    >
      <h1 className="text-2xl font-semibold">{t.attendance.checkinTitle}</h1>
      <p className="mt-1.5 text-sm text-muted">{t.attendance.checkinHint}</p>
      <label className="relative mt-6 block">
        <span className="sr-only">{t.attendance.checkinTitle}</span>
        <input
          ref={input}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setValue(v);
            setResult(null);
            if (v.length === 6) submit(v);
          }}
          placeholder="••••••"
          className="h-16 w-full rounded-2xl border border-field-border bg-field text-center font-mono text-[2rem] font-semibold tracking-[0.45em] text-fg placeholder:text-muted/40 focus:border-fg/40 focus:outline-none"
        />
        {pending && <Loader2 size={20} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted" />}
      </label>
      {result && !result.ok && (
        <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {result.message}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending || value.length < 6}>
        {t.attendance.checkin}
      </Button>
    </form>
  );
}
