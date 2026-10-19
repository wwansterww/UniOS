"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { LOCALES } from "@/lib/i18n";
import { demoSignIn, sendMagicLink, setGuestLocale, signIn, signUp } from "./actions";

export function LocaleSwitch() {
  const { locale } = useT();
  const router = useRouter();
  return (
    <div className="flex gap-0.5 text-[13px]">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={async () => {
            await setGuestLocale(l.code);
            router.refresh();
          }}
          aria-pressed={l.code === locale}
          className={cn("rounded-md px-2 py-1 transition-colors", l.code === locale ? "font-medium text-fg" : "text-muted hover:text-fg")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<"input">) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={t.auth.showPassword}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function LoginForm({ expired, demo }: { expired: boolean; demo: boolean }) {
  const { t } = useT();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signIn, undefined);
  const [upState, upAction, upPending] = useActionState(signUp, undefined);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, undefined);
  const [demoPending, startDemo] = useTransition();
  const state = mode === "in" ? (mlState?.info || mlState?.error ? mlState : inState) : upState;

  return (
    <div className="w-full">
      <h2 className="mb-8 text-[1.75rem] font-semibold">{mode === "in" ? t.auth.signIn : t.auth.signUp}</h2>

      {expired && <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{t.auth.linkExpired}</p>}
      {state?.error && (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state?.info && <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">{state.info}</p>}

      {mode === "in" ? (
        <form action={inAction} className="space-y-4">
          <Field label={t.auth.email}>
            <Input name="email" type="email" required autoComplete="email" placeholder="name@narxoz.kz" />
          </Field>
          <Field label={t.auth.password}>
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="accent" size="lg" className="w-full shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]" disabled={inPending}>
            {t.auth.signIn}
          </Button>
          <button type="submit" formAction={mlAction} formNoValidate disabled={mlPending} className="w-full text-center text-[13px] text-muted hover:text-fg">
            {t.auth.magic}
          </button>
        </form>
      ) : (
        <form action={upAction} className="space-y-4">
          <Field label={t.auth.name}>
            <Input name="name" required autoComplete="name" />
          </Field>
          <Field label={t.auth.email}>
            <Input name="email" type="email" required autoComplete="email" placeholder="name@narxoz.kz" />
          </Field>
          <Field label={t.auth.password}>
            <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label={t.auth.teacherCode} hint={t.auth.teacherCodeHint}>
            <Input name="teacher_code" autoComplete="off" />
          </Field>
          <Button type="submit" variant="accent" size="lg" className="w-full shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]" disabled={upPending}>
            {t.auth.signUp}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-[13px]">
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-muted hover:text-fg">
          {mode === "in" ? t.auth.noAccount : t.auth.haveAccount}
        </button>
      </p>

      {demo && (
        <div className="mt-8 border-t border-border pt-6">
          <p className="mb-3 text-[13px] text-muted">{t.auth.demo}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={demoPending} onClick={() => startDemo(() => demoSignIn("student"))} aria-label={t.auth.demoStudent}>
              {t.profile.student}
            </Button>
            <Button variant="outline" disabled={demoPending} onClick={() => startDemo(() => demoSignIn("teacher"))} aria-label={t.auth.demoTeacher}>
              {t.profile.teacher}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
